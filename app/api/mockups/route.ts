import { NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isR2Configured, putObjectToR2 } from '@/lib/r2'

type ShotType =
  | 'flatlay_topdown'
  | 'flatlay_45deg'
  | 'flatlay_sleeves'
  | 'flatlay_relaxed'
  | 'flatlay_folded'
  | 'surface_draped'
  | 'surface_hanging'
  | 'detail_print'
  | 'detail_fabric'
  | 'detail_collar'

type Preset = 'raw' | 'editorial' | 'luxury' | 'natural' | 'studio' | 'surprise'
type GarmentType = string
type InteractionsImageMime =
  | 'image/png'
  | 'image/jpeg'
  | 'image/webp'
  | 'image/heic'
  | 'image/heif'

type ShotCategory = 'flatlay' | 'surface' | 'detail'

const VALID_SHOT_TYPES: readonly ShotType[] = [
  'flatlay_topdown',
  'flatlay_45deg',
  'flatlay_sleeves',
  'flatlay_relaxed',
  'flatlay_folded',
  'surface_draped',
  'surface_hanging',
  'detail_print',
  'detail_fabric',
  'detail_collar',
]

const LEGACY_SHOT_TYPE_MAP: Record<string, ShotType> = {
  'flat-lay': 'flatlay_topdown',
  'product-shot': 'surface_hanging',
  detail: 'detail_print',
  lifestyle: 'surface_draped',
}

function resolveShotTypeFromBody(body: unknown): ShotType | undefined {
  const requestedShotType = (body as { shotType?: unknown; type?: unknown }).shotType
  const legacyType = (body as { type?: unknown }).type

  if (typeof requestedShotType === 'string' && VALID_SHOT_TYPES.includes(requestedShotType as ShotType)) {
    return requestedShotType as ShotType
  }

  if (typeof legacyType === 'string' && legacyType in LEGACY_SHOT_TYPE_MAP) {
    return LEGACY_SHOT_TYPE_MAP[legacyType]
  }

  return undefined
}

function getApiKey(): string | undefined {
  return process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY
}

function normalizeGarmentType(input: unknown): GarmentType | undefined {
  if (typeof input !== 'string') return undefined

  // Keep it short and prompt-safe:
  // - remove newlines
  // - collapse multiple spaces
  // - trim
  const cleaned = input.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!cleaned) return undefined

  // Hard limit to reduce token bloat and prompt injection surface.
  return cleaned.length > 50 ? cleaned.slice(0, 50).trim() : cleaned
}

function normalizeEditInstructions(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined

  // Keep it short and prompt-safe:
  // - remove newlines
  // - collapse multiple spaces
  // - trim
  const cleaned = input.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!cleaned) return undefined

  // Clamp hard to reduce prompt injection surface.
  return cleaned.length > 800 ? cleaned.slice(0, 800).trim() : cleaned
}

function parseDataUrl(dataUrl: string): { mimeType: string; base64: string } | null {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl)
  if (!match) return null
  return { mimeType: match[1], base64: match[2] }
}

async function fetchImageUrlAsBase64(imageUrl: string): Promise<{ mimeType: string; base64: string } | null> {
  let res: Response
  try {
    res = await fetch(imageUrl)
  } catch {
    return null
  }
  if (!res.ok) return null
  const contentType = res.headers.get('content-type') || 'application/octet-stream'
  const ab = await res.arrayBuffer()
  const base64 = Buffer.from(ab).toString('base64')
  return { mimeType: contentType, base64 }
}

function normalizeInteractionsImageMime(mimeType: string): InteractionsImageMime {
  const base = mimeType.split(';')[0].trim().toLowerCase()
  switch (base) {
    case 'image/png':
    case 'image/jpeg':
    case 'image/webp':
    case 'image/heic':
    case 'image/heif':
      return base
    default:
      return 'image/png'
  }
}

function clampInt(n: unknown, min: number, max: number, fallback: number) {
  const parsed = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(parsed)))
}

function hashStringToInt(input: string) {
  // Fast deterministic 32-bit hash (FNV-1a style).
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed: number) {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let x = Math.imul(t ^ (t >>> 15), 1 | t)
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

function pickOne<T>(rand: () => number, items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)]!
}

function categoryForShotType(shotType: ShotType): ShotCategory {
  switch (shotType) {
    case 'flatlay_topdown':
    case 'flatlay_45deg':
    case 'flatlay_sleeves':
    case 'flatlay_relaxed':
    case 'flatlay_folded':
      return 'flatlay'
    case 'surface_draped':
    case 'surface_hanging':
      return 'surface'
    case 'detail_print':
    case 'detail_fabric':
    case 'detail_collar':
      return 'detail'
  }
}

const BASE_FIDELITY = [
  'You are generating a professional product photograph.',
  'The provided image contains the EXACT physical garment — do not redesign, reinterpret, or alter it in any way.',
  '',
  'INPUT IMAGE HANDLING (critical — read first):',
  '- The reference image may NOT be a clean product photo. It may be a phone screenshot, a photo of a screen, a social media save, or a cluttered photo.',
  '- ISOLATE THE GARMENT ONLY. Extract the clothing item and ignore absolutely everything else in the input image.',
  '- Discard all of the following if present in the input: phone UI (status bar, battery, signal, dynamic island, home indicator, navigation bar), browser chrome (URL bar, tabs, bookmarks bar), app interfaces (Instagram overlays, e-commerce buttons, price tags, chat bubbles), window frames, taskbars, watermarks, stock photo marks, "SAMPLE" text, device bezels, mock device frames.',
  '- Discard any solid-colour bars, borders, letterboxing, or padding around the garment.',
  '- Discard any background clutter: messy surfaces, other objects, accessories, hands, mannequins, retail tags, hangers (unless the shot type requires one).',
  '- If the garment occupies only a portion of the input image, mentally crop to just the garment before generating.',
  '- The output must contain ONLY the garment plus any minimal required, unbranded support implied by the shot type (e.g. a simple hook/hanger for hanging shots) AND the required unbranded background surface implied by the preset/shot type — zero trace of the input image context.',
  '',
  'PRODUCT FIDELITY (non-negotiable):',
  '- Preserve exact print placement, graphics, logo position, and colorway',
  '- Preserve typography exactly (letter shapes, spacing, kerning, and partial/blurred/unreadable segments). Do NOT replace unreadable text with a “readable” version.',
  '- If printed text/letterforms are partially visible, occluded, or cut off in the reference image, keep them partially visible/occluded/cut off exactly (do NOT invent missing characters).',
  '- Preserve true garment silhouette and structure',
  '- Preserve realistic fabric weight and natural fold behaviour',
  '- Do NOT reshape, smooth, or make the garment look digitally rendered',
  '- Do NOT add, remove, or modify any design element',
  '- Do NOT introduce logos, watermarks, or text not present on the garment itself',
  '',
  'PERMITTED REFINEMENTS ONLY:',
  '- Remove dust, lint, and sensor noise',
  '- Improve fabric clarity and thread definition',
  '- Correct uneven or poor lighting from the reference image',
  '- Make the garment look professionally pressed and shoot-ready where appropriate (for relaxed/crumpled styling, preserve natural folds and do NOT over-smooth)',
  '- Do NOT sharpen, deblur, upscale, or reconstruct printed typography/letterforms; keep printed text exactly as it appears in the reference image.',
  '',
  'OUTPUT:',
  '- Aspect ratio: 1:1 square; crop centered on the main subject for this shot type',
  '- When the shot type requires full garment visibility, ensure no cropped hems/sleeves/logo edges',
  '- Never crop or cut off printed text/letterforms that are visible in the reference image; keep all visible print boundaries within frame.',
  '- Shadows must be realistic: grounded, not unnaturally long, and not razor-sharp; avoid shadow streaking/silhouette exaggeration.',
  '- Avoid “cutout” shadows: no uniform outline/halo that traces the garment silhouette like a sticker or vector path; contact shadow should be slightly irregular and broken by fabric thickness + micro-wrinkles.',
  '- Must read as a real studio photograph, not a render or illustration',
  '- Zero AI artifacts, surreal elements, or uncanny fabric distortion',
  '- No added text, overlays, or watermarks',
].join('\n')

const BASE_DETAIL_CARVEOUT = [
  'DETAIL-SHOT CARVE-OUT (important):',
  '- Do NOT “press away” micro texture; preserve knit/weave texture, stitch relief, ribbing, and print ink edges.',
  '- Clarity/sharpness improvements are allowed, but do NOT invent texture or make fabric look plastic or painted.',
  '- Maintain realistic thread detail, grain, and natural micro-wrinkles.',
].join('\n')

const NEGATIVE_GLOBAL = [
  'NEGATIVE (do NOT do any of the following):',
  '- Output MUST depict ONLY the garment and any minimal required, unbranded support (e.g., a simple hook/hanger for hanging shots) AND the required unbranded background surface implied by the preset/shot type; no UI, no device frames, and no other surrounding objects.',
  '- Photoreal only: no CGI/illustration/painterly styles and no “AI texture”.',
  '- Do NOT alter the garment design: prints/logos/colors/seams/pockets/zippers/buttons must match the reference exactly.',
  '- Do NOT add or reproduce watermarks, any text overlays, borders, padding, or letterboxing.',
].join('\n')

const NEGATIVE_BY_CATEGORY: Record<ShotCategory, string> = {
  flatlay: [
    'NEGATIVE (flat lay specific):',
    '- No hangers, hooks, people, hands, mannequins, or props touching the garment.',
    '- No perspective tilt for strict top-down shots; no wide-angle distortion.',
    '- No horizon line, no corners/room edges, no “infinite cyclorama curve”; the surface is a single flat plane.',
    '- No warped/bent background plane; no wavy geometry; no texture stretch/smear; avoid repeating patterns.',
    '- No long harsh shadow streaks; shadows must be short, grounded, and realistic.',
    '- Avoid gritty HDR, over-sharpened “AI noise,” or watercolor-like texture on the surface.',
  ].join('\n'),
  surface: [
    'NEGATIVE (surface shots specific):',
    '- No warped hangers, no thick plastic hangers with logos, no retail tags unless present in original.',
    '- No busy backgrounds; keep background premium and unobtrusive.',
    '- No bent walls or warped planes; avoid stretched textures and unnatural perspective.',
    '- Avoid heavy vignettes/gradients that imply curved geometry unless explicitly requested.',
    '- No floating/detached garment: no hovering/float gap between the hanger and the clothing.',
    '- No razor-sharp or unnaturally long shadows; keep shadow softness realistic and grounded.',
  ].join('\n'),
  detail: [
    'NEGATIVE (detail shots specific):',
    '- No hangers/hooks/people/hands/mannequins/props.',
    '- Do NOT turn texture into noise or watercolor; avoid over-smoothing.',
    '- Avoid blown highlights on fabric; preserve weave detail and realistic shading.',
    '- No heavy shadow bands/silhouette exaggeration behind the subject.',
    '- Background must be minimal and non-distracting; no warped patterns behind the subject.',
  ].join('\n'),
}

const NEGATIVE_BY_PRESET: Record<Preset, string> = {
  raw: [
    'NEGATIVE (urban concrete / raw preset anti-fail):',
    '- No fresh poured concrete (avoid new-smooth “perfect slab” look); keep subtle age/wear and dusting.',
    '- No direct sun, no studio hotspots, no artificial lighting character; overcast-only behavior.',
    '- No glossy/wet reflections; concrete must remain fully matte.',
    '- No tiled/repeating “texture map” concrete look; keep physically tactile, non-repeating surface detail.',
    '- Avoid heavy vignettes/overdramatic gradients that imply curved or non-flat geometry.',
  ].join('\n'),
  editorial: [
    'NEGATIVE (editorial preset anti-fail):',
    '- No visible charcoal surface grain/mottling/banding; background must read as seamless and uniform to the eye (micro-matte tooth is okay if it does not read as texture).',
    '- No gritty HDR / over-sharpened “AI noise” on fabric or surface.',
    '- No blown highlights on fabric/ink; keep tonal range controlled and premium.',
    '- Avoid harsh shadow cut-offs; shadows should be gentle and grounded.',
  ].join('\n'),
  luxury: [
    'NEGATIVE (luxury preset anti-fail):',
    '- Avoid mirrored sheen or obvious specular reflections; keep marble low-sheen (no wet look, no mirror reflections).',
    '- No repeated/identical vein patterns; veins must be subtle and non-repeating; avoid “texture map” repetition.',
    '- Avoid over-contrast / plastic look; lighting should wrap softly and stay realistic (no gritty HDR).',
    '- No specular clipping on fabric OR marble; preserve highlight detail and smooth roll-off.',
    '- Avoid harsh hotspot streaks on marble; specular highlights must be soft and controlled.',
  ].join('\n'),
  natural: [
    'NEGATIVE (natural preset anti-fail):',
    '- No warped/repeating wood plank patterns; grain should feel consistent and non-artificial.',
    '- Avoid warm orange/yellow cast; window light must remain believable (no heavy tungsten look).',
    '- No heavy vignettes or curved-table gradients.',
    '- Avoid overprocessed smoothing of fabric texture; keep realism (preserve weave/knit micro texture).',
    '- Avoid glossy/varnished wood reflections; keep wood matte-oiled (no wet look).',
  ].join('\n'),
  studio: [
    'NEGATIVE (studio preset anti-fail):',
    '- No visible background texture/grain; seamless white must not look like paper grain or film noise.',
    '- No visible seams/creases; keep the background uniform to the eye with only smooth studio roll-off (no harsh bands).',
    '- Avoid grey patches/drift that look like uneven lighting; keep tone consistent.',
    '- No vignette/film simulation; keep clean digital capture feel.',
    '- Avoid long streaky shadows; keep shadows soft, minimal, and grounded.',
    '- No “sticker” shadow outline: avoid a perfectly uniform perimeter shadow that follows the garment edges; shadows should vary naturally with fabric thickness, contact points, and micro-wrinkles (slightly uneven, not a traced silhouette).',
  ].join('\n'),
  surprise: [
    'NEGATIVE (surprise preset anti-fail):',
    '- Do not mix incompatible material + lighting physics (keep surface/lighting consistent with the provided variation instructions).',
    '- No studio character unless implied by the chosen variation.',
    '- No glossy reflections unless explicitly implied by the chosen surface feel.',
    '- Avoid gritty HDR, film grain, and over-sharpening.',
    '- No props/rooms/lifestyle scenes; surprise is surface + lighting only.',
  ].join('\n'),
}

const SHOT_PROMPTS: Record<ShotType, string> = {
  flatlay_topdown: [
    'SHOT TYPE: Top-down flat lay',
    '- Camera setup: perfectly overhead at 90 degrees, no perspective distortion',
    '- Height: approximately 1.5m above the floor',
    '- Optics: ~50mm equivalent lens (natural perspective, minimal distortion)',
    '- Depth of field: deep (f/8 to f/11 equivalent); entire garment sharp and surface realism sharp across the full frame',
    '- Garment placement: laid flat, front face up, centered, aligned to frame vertical axis (allow at most +/- 5 degrees rotation)',
    '- Scale & framing: garment fills ~72-78% of the frame with clean breathing room on all edges',
    '- Full garment visible with no cropped hems/sleeves and no cut-off printed edges',
    '- Fabric MUST lie directly on the surface (no hovering/float gap; no detached fabric sections).',
    '- Perfectly still (no motion blur)',
    '- Sleeves naturally relaxed at sides',
    '- Keep edges straight; avoid any melted/warped fabric',
  ].join('\n'),
  flatlay_45deg: [
    'SHOT TYPE: Steep diagonal overhead flat lay',
    '- Camera setup: approximately 60–65 degrees above horizontal (steep diagonal overhead), height ~1.5m above the floor',
    '- Optics: ~50mm equivalent lens; minimal/no perspective distortion (avoid wide-angle)',
    '- Depth of field: deep (f/8–f/11 equivalent); entire garment sharp from nearest sleeve tip to furthest collar; surface realism sharp across the full frame',
    '- Garment placement: laid flat, front face up, rotated ~20–25 degrees clockwise from the vertical axis; casually placed (not meticulously posed)',
    '- Scale & framing: garment fills ~72–78% of the square frame; full garment visible with no cropped hems/sleeves/printed edges',
    '- Fabric contact: direct physical contact with the surface everywhere (zero hover gap)',
    '- Sleeves naturally relaxed at sides; weight/grounding/compression at contact points',
  ].join('\n'),
  flatlay_sleeves: [
    'SHOT TYPE: Symmetrical sleeve spread',
    '- Camera setup: perfectly overhead at 90 degrees',
    '- Height: approximately 1.5m above the floor',
    '- Optics: ~50mm equivalent lens; minimal distortion (avoid wide-angle)',
    '- Depth of field: deep (f/8 to f/11 equivalent) so sleeves and surface realism are sharp',
    '- Garment placement: laid flat, centered, front face up',
    '- Composition: both sleeves extended fully outward in a symmetrical wing shape (left/right equal spread); body remains centered',
    '- Scale & framing: garment fills ~70-80% of frame while ensuring sleeve ends and all visible print/letterforms remain fully inside frame',
    '- Fabric contact: direct physical contact with the surface everywhere (zero hover gap)',
    '- Sleeves: naturally relaxed at the ends (not twisted), no hovering',
    '- Fabric MUST lie directly on the surface (no hovering/float gap).',
  ].join('\n'),
  flatlay_relaxed: [
    'SHOT TYPE: Relaxed / crumpled flat lay',
    '- Camera setup: overhead at ~90 degrees (minor tilt acceptable, but keep perspective minimal)',
    '- Height: approximately 1.5m above the floor',
    '- Optics: ~50mm equivalent lens (avoid wide-angle distortion)',
    '- Depth of field: deep to moderate-deep (f/7 to f/11); garment sharp, surface realism sharp enough to read as real',
    '- Garment placement: laid flat, front face up, intentionally casual',
    '- Rotation: allow a small natural rotation range (~5 to 15 degrees) rather than perfect alignment',
    '- Off-centre translation: subtle shift (about 5-12% of frame) to feel candid but still premium',
    '- Scale & framing: garment fills ~72-78% of the frame',
    '- Garment is placed, not arranged; keep folds realistic (not rubbery, not paper-like)',
    '- Natural folds and creases visible and celebrated',
    '- Not messy, but deliberately unstudied',
    '- Feels candid, not staged',
    '- Fabric MUST remain grounded and in contact with the surface (no hovering/float gap).',
  ].join('\n'),
  flatlay_folded: [
    'SHOT TYPE: Folded retail rectangle shot',
    '- Camera setup: perfectly overhead at 90 degrees; minimal/no perspective distortion',
    '- Height: approximately 1.5m above the floor',
    '- Optics: ~50mm equivalent lens',
    '- Depth of field: deep (f/8 to f/11 equivalent) so fold edges and garment details are crisp',
    '- Fold recipe (deterministic retail rectangle): final silhouette must be a compact rectangle/square with straight edges and symmetric alignment about the garment centerline',
    '- Garment placement: folded front-facing panel up; preserve garment fidelity (do NOT redesign prints/logos/text) while folding into the rectangle',
    '- Anchor rule (logo optional): if visible artwork/text exists, keep it centered within the front panel; if no artwork exists, center the garment’s front centerline using neckline/placket seams/collar position/waistband centerline (as applicable)',
    '- Hood/collar rule: if the garment has a hood, tuck the hood flat so the hood opening and hood corners do not stick up above the top edge; if no hood, flatten the collar/neckline region so there is no standing collar',
    '- Sleeve rule: if the garment has sleeves, fold both sleeves inward symmetrically; sleeve outer edges must align with (or sit just inside) the rectangle side edges with no sleeve protrusion beyond the folded rectangle',
    '- Leg rule (pants/shorts): if the garment has legs, fold both legs inward symmetrically; pant hems must align with (or sit just inside) the rectangle side edges with no leg protrusion beyond the folded rectangle; keep waistband flat as the top edge',
    '- Pocket/drawstring/cuff rule: any visible hems/drawstrings/cuffs must remain contained within the folded rectangle (no stretched or floating parts outside the rectangle edges)',
    '- Fold lines: clean, intentional, and symmetric; no extra flaps/corners beyond the rectangle',
    '- Scale & framing: compact square composition; folded garment fills ~82-86% of frame; full folded edges must be inside frame (no cropped folded edges)',
    '- Rotation: align to frame with at most +/- 5 degrees',
    '- Do NOT crop or cut off any visible print/letterforms/important garment features that are present in the reference within the framed crop',
    '- Folded garment MUST be physically grounded on the surface (no hovering/float gap).',
  ].join('\n'),
  surface_draped: [
    'SHOT TYPE: Draped over surface',
    '- Camera setup: straight-on or slightly elevated view (about 30 to 45 degrees above horizontal); keep perspective natural (avoid wide-angle)',
    '- Height: approximately 1.3 to 1.6m above the ground',
    '- Optics: ~50mm equivalent lens; minimal distortion',
    '- Depth of field: moderate (f/5.6 to f/8); garment mostly sharp while background remains calm',
    '- Garment placement: loosely draped over a surface edge; half resting, half hanging',
    '- Front face visible and dominant; drape should look physically plausible with realistic gravity',
    '- Scale & framing: garment fills ~72-85% of frame with comfortable margin (no cropped hems or printed edges)',
    '- Fabric contact: grounded on the surface/edge everywhere it touches (no hover gap, no floating sections)',
    '- Keep composition premium and minimal; no clutter background',
    '- Fabric MUST be grounded on the surface/edge (no hovering/float gap; no detached fabric sections).',
    '- Keep background minimal and premium (no clutter)',
  ].join('\n'),
  surface_hanging: [
    'SHOT TYPE: Hanging shot',
    '- Camera setup: straight-on, not angled; keep perspective natural (avoid wide-angle)',
    '- Height: approximately 1.5 to 1.7m above the ground',
    '- Optics: ~50mm equivalent lens; minimal distortion',
    '- Depth of field: moderate (f/5.6 to f/8); garment sharp and readable, background calm',
    '- Garment placement: hanging naturally from a minimal hook/hanger',
    '- Hanger/support: single thin hook or single shoulder bar only; no extra shapes, decorations, or logos',
    '- Ensure the garment has clear physical contact/support from the hanger (no floating/hover gap).',
    '- Full garment visible, hanging naturally with realistic drape from gravity',
    '- Scale & framing: garment fills ~72-85% of frame with all visible hems/sleeves within frame',
    '- Rotation: align garment/hanger to be centered; allow only minimal natural tilt (about +/- 5 degrees)',
    '- The garment MUST be physically supported by the hanger/hook with visible contact (no hovering/float gap).',
    '- Use simple unbranded shoulder support/clip points so the garment is clearly held in place.',
    '- Camera straight-on, not angled',
    '- Keep hanger/hook minimal and unbranded',
    '- Avoid warped shoulders; keep silhouette true to the garment',
    '- Ensure the full garment and all visible printed text/letterforms are within frame and not cropped.',
  ].join('\n'),
  detail_print: [
    'SHOT TYPE: Print close-up',
    '- Camera setup: close crop with macro-like framing; focus is on the print only',
    '- Optics: ~85mm equivalent lens to reduce perspective distortion',
    '- Depth of field: shallow (f/2.8 to f/4); print edges razor sharp, background falls off softly',
    '- Crop & framing: design fills ~80% of the frame; keep a small margin and do not introduce extra background padding beyond the reference crop boundaries',
    '- Detail selection (crop-lock): identify ONE most informative print/graphic region in the reference image; that chosen region defines the crop boundaries',
    '- Apply ONLY a tight crop/zoom to the same chosen region; do NOT drift to a different portion of the garment or re-select a different detail region',
    '- Center the chosen crop region in the output frame, but preserve the chosen region’s internal placement/occlusions exactly as seen in the reference (no re-framing/re-centering that changes what parts of the print are included)',
    '- Preserve exact letterforms/linework; no hallucinated strokes or “helpful” sharpening artifacts',
    '- Fabric texture: subtly visible beneath the print only where present in the reference',
    '- Garment boundary rule (important for crop-lock): preserve any surrounding fabric/garment boundaries that are visible in the reference within the chosen crop (do NOT remove them / do NOT invent extra clearance).',
    '- Do NOT clip the outermost visible edges of the printed letterforms/graphics within the crop; preserve the visible boundaries.',
  ].join('\n'),
  detail_fabric: [
    'SHOT TYPE: Fabric texture macro',
    '- Camera setup: extreme close-up focused on weave/texture',
    '- Optics: ~85mm equivalent lens to reduce distortion',
    '- Depth of field: shallow (f/2.8 to f/4); texture sharp where important, edges can softly fall off',
    '- Crop-lock: ensure the crop keeps the important texture boundaries that appear in the reference; do NOT change which weave/texture regions are included',
    '- You may center the chosen texture region in the output frame, but do NOT translate the crop window to a different portion of the garment/texture',
    '- If print/graphics appear inside the crop, preserve them exactly (no removal/alteration)',
    '- Do NOT cut off important garment edges or print/letterform boundaries; preserve the full boundaries of whatever is visible inside the crop.',
    '- Communicates fabric quality and weight',
    '- Do NOT invent a different weave; keep texture consistent with the original garment material',
  ].join('\n'),
  detail_collar: [
    'SHOT TYPE: Collar / neckline detail',
    '- Camera setup: tight close-up with slight angle for depth',
    '- Optics: ~85mm equivalent lens',
    '- Camera angle: slight oblique angle (about 10 to 20 degrees) so collar rib/stitch depth reads naturally',
    '- Depth of field: moderate-shallow (f/4 to f/7); collar edges and stitches sharp',
    '- Crop & framing: neckline subject fills ~80% of frame; do not clip stitch boundaries or visible collar edges; keep a small margin',
    '- Garment placement: folded/positioned so neckline is the clear subject',
    '- Stitching/finish quality visible and preserved exactly as in the reference',
    '- Builds product trust and premium signal',
    '- Keep stitches clean and realistic; do not invent extra seam lines',
    '- Do NOT crop off visible collar/neckline edges or visible stitch boundaries; keep all visible edges inside the frame.',
  ].join('\n'),
}

const PRESET_BASE: Record<Preset, string> = {
  raw: [
    'VISUAL DIRECTION: Urban concrete',
    '- Surface: aged urban concrete floor, fully matte (zero sheen/reflectivity); physically tactile with visible aggregate',
    '- Weathering: 15–25 years walked-on / semi-outdoor exposure feel; subtle dust pooling in low points; faint natural hairline stress cracks (do not place them, just preserve natural realism)',
    '- Concrete color: #3a3a38 medium-dark cool grey with slight warm dust undertone (no orange/yellow cast); not perfectly uniform',
    '- Texture: fine-to-medium aggregate with visible stones ~2–5mm; micro-shadows on each stone from raking light; avoid “texture map” tiling/repetition',
    '- Lighting: soft natural overcast daylight only (5600K), indirect/diffused; single source from upper-left (~10 o’clock) at a shallow raking angle',
    '- Falloff: gentle; right side of frame ~20% darker than left, subtle not dramatic',
    '- Shadows: short, grounded, realistic softness; no studio/artificial character; contact shadow perimeter slightly irregular (~1–2mm)',
    '- Mood: urban streetwear product photography on real pavement (not a studio set)',
  ].join('\n'),
  editorial: [
    'VISUAL DIRECTION: Editorial',
    '- Surface: charcoal seamless cyclorama / seamless paper infinity, matte finish; deep neutral charcoal tone (target ~#2B2B2E to #3A3A3F); single continuous plane with no corner/horizon line',
    '- Surface finish: uniform to the eye; allow only imperceptible micro-matte tooth (must NOT read as paper grain, speckle noise, or fabric texture)',
    '- Lighting: controlled editorial studio lighting with numeric geometry:',
    '  - Key: large softbox/octabox from above-front at ~35–50 degrees to camera axis; key height ~1.8–2.2m',
    '  - Fill: gentle opposing fill at ~45–70 degrees; fill intensity ~0.50–0.70 of key (keeps shadows present but not harsh)',
    '  - Directionality: slightly top-biased so the garment reads sculptural without dramatic shadow streaks',
    '- Exposure/contrast: even exposure with premium midtone contrast; no gritty HDR; blacks not crushed',
    '- Colour temperature: cool-neutral studio balance (~4800K–5200K), slightly desaturated (~90–95% natural saturation)',
    '- Shadows: soft and grounded (never a traced cutout): contact shadow ~0.5–1.5mm, slightly irregular; cast shadow short and faint (~0.5–2.0cm, ~8–18% opacity)',
    '- Mood: cold, precise, intentional — fashion editorial product page',
    '- Feel: luxury magazine still-life / runway-week accessories table, but minimal and unbranded',
  ].join('\n'),
  luxury: [
    'VISUAL DIRECTION: Luxury',
    '- Surface: dark veined marble tabletop, deep grey-black (target ~#141417 to #1F1F24), low-sheen (not mirror); subtle non-repeating veins with realistic scale (1–4mm thin veins, occasional wider 6–12mm soft vein)',
    '- Surface finish: polished-stone feel but controlled (soft specular only); no wet look, no mirror reflections, no blown specular clipping',
    '- Lighting: premium showroom/still-life lighting with numeric geometry:',
    '  - Key: large softbox from above at ~40–55 degrees, slightly off-axis; key height ~1.8–2.4m',
    '  - Fill: gentle opposing fill ~0.35–0.55 of key to keep shadows rich but readable',
    '  - Specular control: keep highlights small and soft; preserve fabric shading; no hotspot streaks on marble',
    '- Exposure/contrast: premium, smooth tonal roll-off; blacks deep but not crushed; avoid gritty HDR',
    '- Colour temperature: neutral-warm (~5000K–5400K), subtle warmth only; saturation ~92–98% natural',
    '- Shadows: minimal drama; soft + grounded; contact shadow ~0.5–1.5mm slightly irregular; cast shadow short/faint (~0.5–2.5cm, ~10–20% opacity)',
    '- Mood: refined, still, unhurried — quiet luxury',
    '- Feel: high-end flagship store display / luxury catalog product page',
  ].join('\n'),
  natural: [
    'VISUAL DIRECTION: Natural',
    '- Surface: aged wood tabletop (dark walnut / weathered oak), matte-oiled look; warm brown base with visible grain but not exaggerated; avoid repeating plank seams (prefer single-board look)',
    '- Wood tone targets: mid-warm browns (approx ~#4A372B to #6A4A35), natural variation only; no orange cast',
    '- Lighting: soft natural window light with numeric geometry:',
    '  - Direction: from one side (left or upper-left), like a large window; broad source, diffused',
    '  - Falloff: gentle; far side ~15–30% darker than near side',
    '  - Shadow edge: soft penumbra (~10–30mm feather depending on shot distance), no hard studio edges',
    '- Exposure/contrast: honest daylight; medium contrast; highlights controlled; shadows slightly lifted',
    '- Colour temperature: natural warm daylight (~5200K–6200K depending on window/day), keep neutral-warm and believable; saturation ~95–100% natural',
    '- Shadows: soft + grounded; contact shadow subtle (~0.5–2mm, slightly irregular); no dramatic streaks',
    '- Mood: organic, considered, warm without being casual',
    '- Feel: independent label lookbook / craft-forward product photography',
  ].join('\n'),
  studio: [
    'VISUAL DIRECTION: Studio',
    '- Surface: clean white seamless cyclorama/acrylic; matte (no sheen), background luminance slightly off “pure white” (target ~#F7F7F7 to #FFFFFF) for a nicer studio roll-off; no visible seams/creases',
    '- Surface finish: uniformly smooth to the eye; allow only imperceptible micro-matte texture (must not look like paper grain or film texture)',
    '- Lighting: professional multi-light studio setup with numeric geometry:',
    '  - Soft key: large softbox/octabox aimed from above-front at ~35–45 degrees to the camera axis; key height ~1.8–2.2m above the floor; key controls exposure',
    '  - Fill: secondary soft light from the opposite side at ~45–60 degrees; fill intensity ~0.55–0.75 of key intensity (tones down shadows without flattening)',
    '  - Edge separation: very low-intensity rim/edge kicker from behind at ~10–25 degrees off the subject silhouette; rim intensity ~3–7% of key (subtle separation only)',
    '- Lighting character: even exposure, no direct hotspots, no colored gels; studio lighting feels “premium + soft”, not artificial “spotlight-y”',
    '- Colour temperature: neutral daylight-balanced studio white (~5200K–5600K), keep neutral (no obvious blue or yellow cast)',
    '- Shadows: grounded and soft:',
    '  - Contact shadow: hairline perimeter ~0.5–1.0mm (subtle, slightly irregular — never a traced outline)',
    '  - Cast shadow: extremely short and very faint (length typically ~0.3–1.2cm depending on shot), opacity ~5–10%',
    '  - Feathering: smooth penumbra, no razor edges and no streaking',
    '- Mood: clean, commercial, brand-ready — the standard for e-commerce and lookbooks',
    '- Feel: premium catalog/product page lighting with gentle separation from a seamless white background',
  ].join('\n'),
  surprise: [
    'VISUAL DIRECTION: Surprise',
    '- Surface + lighting are provided in the variation instructions below (follow them exactly).',
    '- Rule: surprise comes ONLY from surface/lighting/lens/DOF — never from props, room scenes, or extra objects.',
    '- Photophysics: keep the chosen surface as a single coherent plane; keep lighting consistent with the chosen type (no mixing hard + soft behaviors).',
    '- Mood: unexpected combination — lean into the contrast, but keep it premium and photoreal.',
    '- Colour temperature: follow the chosen lighting; keep whites neutral and avoid extreme tints.',
    "- Feel: something the brand hasn't tried before, still product-photo believable",
  ].join('\n'),
}

const PRESET_BY_CATEGORY: Record<Preset, Record<ShotCategory, string>> = {
  raw: {
    flatlay: [
      'CONTEXT (flat lay):',
      '- The concrete is a SINGLE flat infinite plane filling the entire frame (no corners, no horizon line, no room geometry).',
      '- Concrete is aged/used: matte, slightly rough, visible aggregate (~2–5mm stones), subtle dust pooling, and very faint hairline stress cracks (preserve natural realism; do not “place” cracks).',
      '- Lighting is overcast daylight only: diffused indirect light with gentle asymmetry (upper-left ~10 o’clock), raking micro-shadows that reveal tactile depth across the full frame.',
      '- Exposure/contrast: clean digital capture; highlights controlled (no clipping), shadows slightly lifted (no crushed blacks), preserve knit/print detail.',
      '- Keep edges crisp and proportions true; do not obscure printed graphics; maintain garment fully within frame with realistic grounding.',
    ].join('\n'),
    surface: [
      'CONTEXT (surface): maintain realistic gravity folds and clean separation from background; keep background premium and not cluttered.',
      '- Environment lighting: overcast daylight only (diffused, no direct sun, no studio/artificial light character); neutral cool 5600K feel.',
      '- Environment material (if visible): aged urban concrete matte surface only (fully matte; zero sheen/reflective wet look).',
      '- Exposure/contrast: preserve midtone detail; no clipped highlights on fabric/ink; no crushed shadows.',
      '- Shadows: grounded and short; keep shadow edges realistic (not razor-sharp, not long dramatic streaks).',
      '- Contact shadow: slightly irregular perimeter ~1–2mm; cast shadow short/faint (~1–4cm, ~15–30% opacity) with soft penumbra.',
      '- Surface realism: avoid tiled/CG-like repeating concrete patterns; keep aggregate and dust behavior physically believable.',
      '- Background geometry: single coherent surface behind/under the garment; no warped/bent planes.',
    ].join('\n'),
    detail: [
      'CONTEXT (detail): avoid crushed blacks or blown highlights; preserve micro texture and true print edges.',
      '- Lighting: overcast daylight only (diffused); no harsh studio hot spots on fabric/ink.',
      '- Color/grade: neutral cool 5600K with subtle dust/age warmth in the concrete ambient (no orange/yellow cast).',
      '- If any background surface is visible inside the crop: keep it as aged urban concrete matte with minimal texture distraction (do not draw attention away from the subject).',
      '- Exposure/contrast: preserve print ink boundaries without sharpening; highlights controlled; shadows not crushed.',
      '- Anti-fail: do NOT invent new print strokes or “helpful” sharpened typography; preserve ambiguity faithfully (blurred/partially visible stays blurred).',
    ].join('\n'),
  },
  editorial: {
    flatlay: [
      'CONTEXT (flat lay):',
      '- Charcoal seamless reads as a SINGLE flat infinite plane (no corners, no horizon line, no room geometry).',
      '- Background tone: deep neutral charcoal (target ~#2B2B2E to #3A3A3F), matte; uniform to the eye.',
      '- Allow only imperceptible micro-matte tooth (must not read as paper grain or speckle).',
      '- Lighting: controlled soft overhead studio with mild directionality; avoid harsh shadow cut-offs.',
      '- Shadows: grounded + soft; contact shadow ~0.5–1.5mm slightly irregular; avoid long streaks.',
      '- Avoid gradients/vignettes that imply curved geometry or a tabletop sweep.',
    ].join('\n'),
    surface: [
      'CONTEXT (surface): keep environment understated; the garment is hero; no busy scene elements.',
      '- Surface: charcoal seamless cyclorama/paper infinity, matte; deep neutral charcoal (target ~#2B2B2E to #3A3A3F).',
      '- Surface finish: uniform to the eye; allow only imperceptible micro-matte tooth (must not read as paper grain or noise).',
      '- Lighting: soft editorial key + gentle fill; even exposure; slightly top-biased directionality (no harsh streaking).',
      '- Shadows: present but restrained; soft penumbra; no silhouette-tracing outline/halo.',
      '- Background geometry: single coherent seamless plane; no corners/horizon/room edges; no warped/bent planes.',
      '- Avoid heavy vignettes/gradients that imply curved geometry.'
    ].join('\n'),
    detail: [
      'CONTEXT (detail): crisp but natural; preserve ink/fiber boundaries.',
      '- Do NOT overprocess sharpening: keep clarity subtle and photoreal.',
      '- Avoid turning texture into noise or watercolor; avoid over-smoothing.',
      '- Avoid blown highlights on fabric/ink; keep tonal range controlled.',
      '- If background is visible in the crop: charcoal seamless only, matte, uniform to the eye (no banding, no grain).',
    ].join('\n'),
  },
  luxury: {
    flatlay: [
      'CONTEXT (flat lay):',
      '- Marble is a SINGLE flat tabletop plane (no corners/horizon); deep grey-black base (target ~#141417 to #1F1F24).',
      '- Veins: subtle, realistic, non-repeating; correct scale (thin 1–4mm lines; occasional wider 6–12mm soft vein). No warped/stretchy patterns.',
      '- Finish: low-sheen; soft controlled specular only; no mirrored reflections, no wet look.',
      '- Lighting: premium soft key + gentle fill; highlights controlled; no harsh streaks; avoid specular clipping.',
      '- Shadows: soft and grounded; contact shadow ~0.5–1.5mm slightly irregular; cast shadow short/faint.',
    ].join('\n'),
    surface: [
      'CONTEXT (surface): quiet luxury; minimal scene; ensure hanger/hook is subtle and unbranded.',
      '- Surface: dark veined marble; deep grey-black base (target ~#141417 to #1F1F24); low-sheen (no mirror reflections); subtle non-repeating veins.',
      '- Lighting: premium soft key + gentle fill; neutral-warm (~5000K–5400K); minimal shadow drama; no harsh streaks.',
      '- Background geometry: single coherent marble plane behind/under the garment; avoid warped/bent walls/planes.',
      '- Shadows/contact: grounded and short; contact shadow ~0.5–1.5mm slightly irregular; cast shadow short/faint with smooth penumbra.',
      '- Avoid harsh specular reflections and specular clipping on any surfaces.'
    ].join('\n'),
    detail: [
      'CONTEXT (detail): micro-contrast is subtle; avoid specular clipping; preserve true shading.',
      '- Keep texture and shading premium and natural; do NOT turn texture into gritty noise.',
      '- Avoid blown highlights and specular clipping on fabric/ink; preserve ink/fiber boundaries.',
      '- Background must be minimal and non-distracting; if marble appears in crop, keep it deep grey-black low-sheen with subtle non-repeating veins (no “texture map” look).',
      '- Exposure/contrast: smooth roll-off; retain highlight detail on ink/fabric; blacks deep but not crushed.',
    ].join('\n'),
  },
  natural: {
    flatlay: [
      'CONTEXT (flat lay):',
      '- Wood is a SINGLE flat tabletop plane (no corners/horizon), matte-oiled look; prefer single-board feel (avoid repeating plank seams).',
      '- Grain: visible but restrained; consistent direction; no warped/repeating patterns.',
      '- Lighting: natural window light feel; gentle falloff (far side ~15–30% darker), soft penumbra (no studio hard edges).',
      '- Shadows: soft and grounded; contact shadow subtle (~0.5–2mm, slightly irregular).',
      '- Avoid heavy vignettes or “curved table” gradients.',
    ].join('\n'),
    surface: [
      'CONTEXT (surface): believable window-light falloff; keep background calm and coherent.',
      '- Surface: aged wood (dark walnut / weathered oak), matte-oiled; warm brown range (approx ~#4A372B to #6A4A35); subtle natural variation only.',
      '- Lighting: soft diffused window light from one side; gentle falloff (far side ~15–30% darker); no harsh studio hard edges.',
      '- Shadows: soft and grounded; contact shadow subtle (~0.5–2mm slightly irregular); no dramatic streaks.',
      '- Background geometry: keep the scene calm; avoid warped planes and curved-table gradients.',
    ].join('\n'),
    detail: [
      'CONTEXT (detail): warm but accurate color; preserve weave texture and fiber reality.',
      '- Do NOT soften away texture; avoid over-smoothing.',
      '- Avoid warm orange/yellow cast beyond believable daylight.',
      '- Avoid blown highlights on fabric/ink; keep tonal range realistic.',
      '- Background must remain minimal and non-distracting (wood only, subtle grain if visible; avoid repeating patterns).',
      '- Exposure/contrast: highlights controlled; shadows slightly lifted (no crushed blacks) to keep weave detail visible.',
    ].join('\n'),
  },
  studio: {
    flatlay: [
      'CONTEXT (flat lay):',
      '- White surface is a SINGLE flat plane filling the entire frame — no corners, no horizon line, no curvature.',
      '- Background must be pure, even white — no grey gradients, no banding, no visible seams or creases.',
      '- Lighting is even and wrap-around; shadows are minimal and soft — just enough to ground the garment.',
      '- The garment should "pop" against the white with clean edges and natural color reproduction.',
    ].join('\n'),
    surface: [
      'CONTEXT (surface): seamless white background with gentle studio roll-off; garment is hero; soft edge separation only.',
      '- Background tone: neutral studio white with very subtle smooth gradient (no harsh bands), avoid grey patches; keep edges clean and uniform.',
      '- Surface: seamless matte studio background only; no visible seams/creases, no floor horizon, no bent/warped plane.',
      '- Lighting: soft even studio key + fill; neutral daylight-balanced white (~5200K–5600K), no colored gels.',
      '- Shadows: ultra-minimal grounded; contact shadow hairline (~0.5–1.0mm, slightly irregular); cast shadow extremely short and very faint (typically ~0.3–1.2cm) with smooth penumbra.',
      '- Avoid blown white areas: keep highlights controlled (no overexposed clipped background).',
    ].join('\n'),
    detail: [
      'CONTEXT (detail): neutral white surround; even illumination reveals true fabric color and texture without color cast.',
      '- Avoid film grain/vignette; keep clean digital capture look.',
      '- Keep highlights controlled; avoid blown highlights on fabric/ink.',
      '- Preserve fabric weave and ink boundaries; avoid turning texture into noise.',
      '- Background must stay minimal and even (neutral studio white only if visible), no grey drift.',
    ].join('\n'),
  },
  surprise: {
    flatlay: [
      'CONTEXT (flat lay):',
      '- Surprise comes from surface + lighting choices, but the surface must still be a single flat plane (no corners/horizon).',
      '- Follow the variation surface + lighting exactly; do not mix lighting physics (no adding a second unrelated light “style”).',
      '- Keep it clean and symmetric when required; do not introduce warped patterns or curved geometry.',
      '- Shadows: grounded and realistic; contact shadow ~0.5–2mm; cast shadow short/faint (typically ~0.5–3cm, ~8–22% opacity depending on lighting choice).',
      '- Exposure/contrast: premium, not HDR; highlights controlled (no clipping), shadows not crushed.',
    ].join('\n'),
    surface: [
      'CONTEXT (surface): surprise comes from surface/lighting choices, not clutter or extra props.',
      '- Keep it photoreal and consistent with the chosen variation instructions (surface + lighting only).',
      '- Avoid adding extra scene elements, props, hands, or UI-like artifacts.',
      '- Maintain grounding: no hovering/float gap; no warped planes.',
      '- Exposure: preserve fabric/ink detail; avoid specular clipping unless the chosen surface implies it (even then, keep it controlled).',
    ].join('\n'),
    detail: [
      'CONTEXT (detail): surprise via lighting/surface feel only; do not change texture/weave or invent detail.',
      '- Preserve ink/fiber boundaries; avoid over-smoothing and over-sharpening.',
      '- Keep background minimal and non-distracting.',
    ].join('\n'),
  },
}

function buildVariationSeed(
  preset: Preset,
  shotType: ShotType,
  generationIndex: number,
  variationSeed: number
) {
  const rand = mulberry32(variationSeed)

  const centredBreathingRoom = 'centred with generous breathing room' as const
  const slightlyOffLeft = 'slightly off-centre to the left (about 5-12% shift)' as const
  const slightlyOffRight = 'slightly off-centre to the right (about 5-12% shift)' as const
  const centredTight = 'centred tight — garment fills 80% of frame' as const
  const centredUrbanConcrete = 'centred with safe framing — garment fills ~72-78% of frame' as const
  const centredTopdown = 'centred with balanced margins — garment fills ~72-78% of frame' as const
  const centredSleeves = 'centred with sleeve-safe margins — sleeves fully visible; garment fills ~70-80% of frame' as const
  const centredFolded = 'centred tight — folded garment fills ~82-86% of frame' as const
  const centredSurface = 'centred with comfortable margin — garment fills ~72-85% of frame' as const
  const centredDetail = 'centred tight — chosen detail region fills ~80% of frame' as const
  const asymmetricNegativeSpace = 'centred with asymmetric negative space' as const

  // Shot prompts often imply strict symmetry/centering (especially top-down/sleeves/folded).
  // If the variation block suggests asymmetric composition, Gemini may override earlier constraints.
  // So we restrict allowed composition variants by shotType.
  let compositions: readonly string[]
  switch (shotType) {
    case 'flatlay_topdown': {
      compositions = [centredTopdown]
      break
    }
    case 'flatlay_sleeves': {
      compositions = [centredSleeves]
      break
    }
    case 'flatlay_folded': {
      compositions = [centredFolded]
      break
    }
    case 'flatlay_45deg': {
      // Steep diagonal overhead looks best when framing stays stable.
      compositions = [centredUrbanConcrete]
      break
    }
    case 'flatlay_relaxed': {
      // Keep it candid/off-centre, but avoid “asymmetric negative space” which tends to break the garment layout.
      compositions = [centredTopdown, slightlyOffLeft, slightlyOffRight]
      break
    }
    case 'surface_draped':
    case 'surface_hanging': {
      compositions = [centredSurface]
      break
    }
    case 'detail_print':
    case 'detail_collar': {
      compositions = [centredDetail]
      break
    }
    case 'detail_fabric': {
      // Your shot prompt explicitly allows a slightly off-centre crop for editorial feel.
      compositions = [centredDetail, slightlyOffLeft, slightlyOffRight]
      break
    }
  }

  const surfaces = [
    'urban concrete',
    'matte charcoal seamless paper',
    'dark marble',
    'aged wood',
    'matte black powder coat',
    'washed stone',
    'dark linen',
    'brushed steel',
    'black sand',
    'volcanic rock',
  ] as const

  const lightings = [
    'hard directional studio',
    'soft diffused overhead',
    'natural window light',
    'dual softbox even',
    'single side key light',
    'overhead ring diffused',
  ] as const

  const lenses = ['50mm equivalent', '85mm equivalent'] as const
  const dof = [
    'deep depth of field (most of the garment sharp)',
    'moderate depth of field (subject sharp, background softly blurred)',
  ] as const

  const lines = [
    'VARIATION INSTRUCTIONS:',
    `- Composition: ${pickOne(rand, compositions)}`,
  ]

  if (preset === 'surprise') {
    lines.push(`- Surface: ${pickOne(rand, surfaces)}`)
    lines.push(`- Lighting: ${pickOne(rand, lightings)}`)
    lines.push(`- Lens: ${pickOne(rand, lenses)}`)
    lines.push(`- Depth of field: ${pickOne(rand, dof)}`)
  }

  return lines.join('\n')
}

const FIDELITY_REMINDER = [
  'FINAL REMINDER — PRODUCT FIDELITY:',
  '- The garment in the output must be IDENTICAL to the garment in the input image.',
  '- If any detail is unclear in the reference image, reproduce ambiguity faithfully — do NOT invent or assume.',
  '- Do not "improve" the design. Do not add details that seem logical. Only reproduce what is visible.',
  '- If you are uncertain about a design element, keep it simple and faithful rather than creative.',
].join('\n')

type GenerationPipeline = 'garment_photo' | 'design_realize'
const STORED_PROMPT_MAX_CHARS = 1200

function isDevDataUrlStorageAllowed(): boolean {
  return process.env.NODE_ENV === 'development'
}

const BASE_DESIGN_REALIZE = [
  'You are generating a professional photoreal product photograph from a 2D design reference.',
  'The input may be a hand sketch, line art, digital flat mockup, screen capture of a design, or a simple graphic — it is NOT necessarily a photo of a finished physical product.',
  '',
  'YOUR JOB:',
  '- Interpret the reference as design intent for a single real manufactured garment (or apparel item).',
  '- Realize it in full 3D form with believable materials, seams, thickness, weight, and natural drape appropriate to the implied product.',
  '- The result must look like a real e-commerce / catalog photograph of that finished item.',
  '',
  'INPUT HANDLING:',
  '- Focus on the apparel/design artwork. Ignore UI chrome, rulers, canvas grid, watermark, device bezels, browser UI, or photo-of-paper edges if present.',
  '- If multiple views appear, prioritize the clearest main view of the item.',
  '- Ignore coloured or busy mockup backgrounds from the reference; the output is always on a clean white studio (see framing rules below).',
  '',
  'DESIGN FIDELITY (non-negotiable):',
  '- Preserve graphics, logos, typography shapes, color relationships, and relative placement as shown — translated onto real fabric with natural curvature and perspective.',
  '- Do NOT invent new branding, slogans, mascots, or extra text not present in the reference artwork.',
  '- If lettering in the reference is rough, partial, or ambiguous, keep that character (do NOT substitute “clean” readable type that changes the design).',
  '- Do NOT drift to a different garment category than implied (e.g. do not turn a hoodie concept into unrelated outerwear).',
  '',
  'REALISM (allowed and expected):',
  '- Infer plausible construction: collar/rib/cuff structure, stitching, fabric texture, and fold behaviour consistent with the design and any garment-type hint.',
  '- Add only physically reasonable detail; avoid sci-fi materials, impossible seams, or surreal distortion.',
  '',
  'STYLE:',
  '- Photoreal product photo — not an illustration, not a flat CAD trace of the sketch.',
  '- No added text, overlays, or watermarks beyond what exists as print on the product.',
].join('\n')

const DESIGN_REALIZE_WHITE_STUDIO_BLOCK = [
  'FRAMING & SET (fixed — this pipeline):',
  '- Match the general viewing angle and pose implied by the reference (front, three-quarter, flat lay, etc.) — do not force an unrelated layout.',
  '- Center the subject; show the full item with comfortable margin; aspect ratio 1:1 square.',
  '- Environment: pure white seamless studio only — clean white cyclorama or infinite white, evenly lit. No grey drift, no visible floor horizon, no texture on the backdrop.',
  '- Lighting: soft, even e-commerce studio lighting (large soft key + gentle fill). One subtle natural contact shadow under the subject; no harsh streaks or coloured gels.',
  '- If the job is a tight crop / detail refinement, keep the same white seamless behind the subject; no lifestyle surfaces.',
].join('\n')

const NEGATIVE_DESIGN_WHITE_BG = [
  'BACKGROUND & PROPS (strict):',
  '- No wood, concrete, marble, fabric surfaces under the product, lifestyle rooms, coloured fills, or gradient backdrops.',
  '- No hands, pencils, sketch paper, clipboards, tape, rulers, or device/chrome.',
  '- No hangers, hooks, or mannequins unless the reference clearly shows the item on one and reproducing it is required for fidelity — prefer floating or laid-flat presentation on white when ambiguous.',
].join('\n')

const NEGATIVE_GLOBAL_DESIGN = [
  'NEGATIVE (do NOT do any of the following):',
  '- Output must show ONLY the realized product; no UI, unrelated props, or clutter.',
  '- No illustration/comic/vector/painterly/CG “concept art” look — it must read as a real photograph of a physical product.',
  '- Do NOT replace the artwork with a different design, different logo, or different color story.',
  '- Do NOT add watermarks, borders, letterboxing, device frames, or “before/after” layouts.',
].join('\n')

const FIDELITY_REMINDER_DESIGN = [
  'FINAL REMINDER — DESIGN REALIZATION:',
  '- The output must remain the same product concept as the reference; do not substitute a different garment or different graphics.',
  '- Where the sketch is ambiguous (exact knit vs weave, minor seam paths), choose plausible defaults — no unrelated embellishments.',
  '- Preserve the layout and identity of visible graphics; do not “redesign for readability.”',
].join('\n')

function normalizePipeline(input: unknown): GenerationPipeline {
  return input === 'design_realize' ? 'design_realize' : 'garment_photo'
}

function buildGarmentTypeAnchor(garmentType: GarmentType): string {
  if (!garmentType) return ''

  return [
    'GARMENT TYPE ANCHOR (hard constraint):',
    `- The garment is a ${garmentType}.`,
    '- Reproduce the correct silhouette for this garment type (neckline, hem length, sleeve cut, and body shape).',
    '- Do NOT substitute a different garment category.',
  ].join('\n')
}

function buildEditInstructionsBlock(editInstructions: string): string {
  return [
    'USER EDIT INSTRUCTIONS (apply only safe refinements):',
    `- ${editInstructions}`,
    '',
    'IMPORTANT RULES:',
    '- Do NOT redesign, reinterpret, or alter the garment design, prints, logos, typography, colors, or print placement.',
    '- Do NOT change the garment silhouette or structure.',
    '- Only apply allowed refinements that preserve exact product fidelity (e.g., remove dust/lint, improve lighting, clarify fabric texture, match composition/centering requirements for the shot type).',
    '- If the instructions conflict with the fidelity rules, ignore the conflicting parts.',
  ].join('\n')
}

function buildEditInstructionsBlockDesign(editInstructions: string): string {
  return [
    'USER EDIT INSTRUCTIONS (refinements only):',
    `- ${editInstructions}`,
    '',
    'IMPORTANT RULES:',
    '- Do NOT replace the product concept or swap in new artwork, logos, or a different color story.',
    '- Do NOT change overall garment category or silhouette unless the user explicitly requests it.',
    '- Allowed: lighting/exposure, contrast, crop/composition on white seamless, subtle material clarity, removing obvious output noise — without inventing new print content.',
    '- If instructions conflict with preserving design identity, ignore the conflicting parts.',
  ].join('\n')
}

function buildPrompt(args: {
  shotType: ShotType
  preset: Preset
  generationIndex: number
  variationSeed: number
  garmentType?: GarmentType
  editInstructions?: string
  pipeline: GenerationPipeline
}) {
  const category = categoryForShotType(args.shotType)
  const isDesign = args.pipeline === 'design_realize'

  const garmentTypeAnchor = buildGarmentTypeAnchor(args.garmentType ?? '')

  if (isDesign) {
    const baseCore = BASE_DESIGN_REALIZE
    const base = garmentTypeAnchor ? `${baseCore}\n\n${garmentTypeAnchor}` : baseCore
    const negative = [NEGATIVE_GLOBAL_DESIGN, NEGATIVE_DESIGN_WHITE_BG].join('\n')
    const userEditBlock = args.editInstructions
      ? buildEditInstructionsBlockDesign(args.editInstructions)
      : ''
    return [base, negative, DESIGN_REALIZE_WHITE_STUDIO_BLOCK, userEditBlock || undefined, FIDELITY_REMINDER_DESIGN]
      .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      .join('\n---\n')
  }

  const baseCore = category === 'detail' ? `${BASE_FIDELITY}\n\n${BASE_DETAIL_CARVEOUT}` : BASE_FIDELITY
  const base = garmentTypeAnchor ? `${baseCore}\n\n${garmentTypeAnchor}` : baseCore

  const negative = [NEGATIVE_GLOBAL, NEGATIVE_BY_PRESET[args.preset], NEGATIVE_BY_CATEGORY[category]].join('\n')
  const preset = [PRESET_BASE[args.preset], PRESET_BY_CATEGORY[args.preset][category]].join('\n')

  const userEditBlock = args.editInstructions ? buildEditInstructionsBlock(args.editInstructions) : ''

  return [
    base,
    negative,
    SHOT_PROMPTS[args.shotType],
    preset,
    buildVariationSeed(args.preset, args.shotType, args.generationIndex, args.variationSeed),
    userEditBlock || undefined,
    FIDELITY_REMINDER,
  ]
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    .join('\n---\n')
}

function asErrorMessage(e: unknown) {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  try {
    return JSON.stringify(e)
  } catch {
    return 'Unknown error'
  }
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

function retryNote(lastErrorMessage: string) {
  return [
    'Retry note:',
    `The previous attempt failed with: ${lastErrorMessage}`,
    'Ensure you return a valid image asset in the response.',
  ].join(' ')
}

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const internalSecret = process.env.INTERNAL_QUEUE_SECRET
  const internalToken = req.headers.get('x-internal-queue-secret')
  const queueSecret = process.env.QUEUE_DISPATCH_SECRET
  const queueToken = req.headers.get('x-queue-secret')
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization')
  const internalOwnerId = req.headers.get('x-owner-id')
  const hasDispatchSecret =
    (Boolean(queueSecret) && queueToken === queueSecret) ||
    (Boolean(cronSecret) && authHeader === `Bearer ${cronSecret}`)
  const isInternalQueueCall =
    ((Boolean(internalSecret) && internalToken === internalSecret) || hasDispatchSecret) &&
    typeof internalOwnerId === 'string' &&
    internalOwnerId.trim().length > 0

  const session = isInternalQueueCall ? null : await getServerSession(authOptions)
  const actorUserId = isInternalQueueCall ? internalOwnerId!.trim() : session?.user?.id
  if (!actorUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const requestId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}`
  const startedAt = Date.now()

  const apiKey = getApiKey()
  if (!apiKey) {
    // Graceful деградация: when no Gemini key is configured, return a placeholder
    // "generated image" so the UI can render empty tiles instead of failing.
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
    }

    if ((body as { pipeline?: unknown }).pipeline === 'background_remove') {
      return NextResponse.json(
        {
          error:
            'Background removal runs in the browser. Use /api/projects/[id]/background-remove to save the result.',
        },
        { status: 400 }
      )
    }

    const shotType = resolveShotTypeFromBody(body)

    const requestedPreset = (body as { preset?: unknown }).preset
    const preset: Preset =
      requestedPreset === 'raw' ||
      requestedPreset === 'editorial' ||
      requestedPreset === 'luxury' ||
      requestedPreset === 'natural' ||
      requestedPreset === 'studio' ||
      requestedPreset === 'surprise'
        ? requestedPreset
        : 'raw'

    const generationIndexRaw = (body as { generationIndex?: unknown }).generationIndex
    const generationIndex = clampInt(generationIndexRaw, 1, 10_000, 1)
    const providedVariationSeed = (body as { variationSeed?: unknown }).variationSeed
    const variationSeed = clampInt(
      providedVariationSeed,
      1,
      2_147_483_647,
      hashStringToInt(`${shotType ?? 'unknown'}|${preset}|${generationIndex}`)
    )

    const garmentType = normalizeGarmentType((body as { garmentType?: unknown }).garmentType)
    const pipeline = normalizePipeline((body as { pipeline?: unknown }).pipeline)

    const editInstructions = normalizeEditInstructions((body as { editInstructions?: unknown }).editInstructions)
    const editedFromIdRaw = (body as { editedFromId?: unknown }).editedFromId
    const editedFromId =
      typeof editedFromIdRaw === 'string' && editedFromIdRaw.trim().length > 0 ? editedFromIdRaw.trim() : undefined
    const editorBrandNameRaw = (body as { editorBrandName?: unknown }).editorBrandName
    const editorBrandName =
      typeof editorBrandNameRaw === 'string' && editorBrandNameRaw.trim().length > 0 ? editorBrandNameRaw.trim() : null

    if (!shotType) {
      return NextResponse.json(
        {
          error:
            'shotType is required and must be one of: flatlay_topdown, flatlay_45deg, flatlay_sleeves, flatlay_relaxed, flatlay_folded, surface_draped, surface_hanging, detail_print, detail_fabric, detail_collar.',
        },
        { status: 400 }
      )
    }

    const meta = {
      shotType,
      preset,
      generationIndex,
      variationSeed,
      garmentType,
      pipeline,
    }

    const prompt = buildPrompt({
      shotType,
      preset,
      generationIndex,
      variationSeed,
      garmentType,
      editInstructions,
      pipeline,
    })

    console.warn(`[mockups:${requestId}] Missing API key; returning placeholder for shotType=${shotType}`)
    // Store the full prompt for debugging (UI shows asset.prompt even when url is empty).
    const promptForStorage = prompt
    return NextResponse.json({
      generatedImage: {
        id:
          typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}`,
        type: shotType,
        url: '',
        timestamp: Date.now(),
        prompt: promptForStorage,
        meta,
        editedFromId: editInstructions && editedFromId ? editedFromId : undefined,
        editRequest: editInstructions,
        editedByUserId: editInstructions ? actorUserId : undefined,
        editedByBrandName: editInstructions ? editorBrandName : undefined,
        editedAt: editInstructions ? Date.now() : undefined,
      },
      meta,
      placeholder: true,
      warning: 'Missing API key. Set GOOGLE_API_KEY (preferred) or GEMINI_API_KEY to enable image generation.',
      // When generation cannot run, the UI needs the complete prompt for debugging.
      promptPreview: prompt,
    })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    console.warn(`[mockups:${requestId}] Invalid JSON body`)
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  if ((body as { pipeline?: unknown }).pipeline === 'background_remove') {
    return NextResponse.json(
      {
        error:
          'Background removal runs in the browser. Use /api/projects/[id]/background-remove to save the result.',
      },
      { status: 400 }
    )
  }

  const imageDataUrl = (body as { imageDataUrl?: unknown }).imageDataUrl
  const imageUrl = (body as { imageUrl?: unknown }).imageUrl

  let parsed: { mimeType: string; base64: string } | null = null
  if (typeof imageDataUrl === 'string' && imageDataUrl.length >= 32) {
    parsed = parseDataUrl(imageDataUrl)
    if (!parsed) {
      console.warn(`[mockups:${requestId}] imageDataUrl not a base64 data URL`)
      return NextResponse.json({ error: 'imageDataUrl must be a base64 data URL.' }, { status: 400 })
    }
  } else if (typeof imageUrl === 'string' && imageUrl.length >= 8) {
    parsed = await fetchImageUrlAsBase64(imageUrl)
    if (!parsed) {
      console.warn(`[mockups:${requestId}] Failed to fetch imageUrl`)
      return NextResponse.json({ error: 'imageUrl could not be fetched.' }, { status: 400 })
    }
  } else {
    console.warn(`[mockups:${requestId}] Missing/invalid imageDataUrl/imageUrl`)
    return NextResponse.json({ error: 'imageDataUrl (base64 data URL) or imageUrl is required.' }, { status: 400 })
  }

  const inputMime = normalizeInteractionsImageMime(parsed.mimeType)

  const shotType = resolveShotTypeFromBody(body)

  if (!shotType) {
    console.warn(`[mockups:${requestId}] Missing/invalid type`)
    return NextResponse.json(
      {
        error:
          'shotType is required and must be one of: flatlay_topdown, flatlay_45deg, flatlay_sleeves, flatlay_relaxed, flatlay_folded, surface_draped, surface_hanging, detail_print, detail_fabric, detail_collar.',
      },
      { status: 400 }
    )
  }

  const requestedPreset = (body as { preset?: unknown }).preset
  const preset: Preset =
    requestedPreset === 'raw' ||
    requestedPreset === 'editorial' ||
    requestedPreset === 'luxury' ||
    requestedPreset === 'natural' ||
    requestedPreset === 'studio' ||
    requestedPreset === 'surprise'
      ? requestedPreset
      : 'raw'

  const generationIndexRaw = (body as { generationIndex?: unknown }).generationIndex
  const generationIndex = clampInt(generationIndexRaw, 1, 10_000, 1)
  const providedVariationSeed = (body as { variationSeed?: unknown }).variationSeed
  const seedBasis =
    typeof imageDataUrl === 'string' && imageDataUrl.length
      ? imageDataUrl.slice(0, 64)
      : typeof imageUrl === 'string'
        ? imageUrl.slice(0, 128)
        : 'unknown'
  const derivedSeed = hashStringToInt(`${shotType}|${preset}|${generationIndex}|${seedBasis}`)
  const variationSeed = clampInt(providedVariationSeed, 1, 2_147_483_647, derivedSeed || Date.now())

  const garmentType = normalizeGarmentType((body as { garmentType?: unknown }).garmentType)
  const pipeline = normalizePipeline((body as { pipeline?: unknown }).pipeline)

  const editInstructions = normalizeEditInstructions((body as { editInstructions?: unknown }).editInstructions)
  const editedFromIdRaw = (body as { editedFromId?: unknown }).editedFromId
  const editedFromId =
    typeof editedFromIdRaw === 'string' && editedFromIdRaw.trim().length > 0 ? editedFromIdRaw.trim() : undefined
  const editorBrandNameRaw = (body as { editorBrandName?: unknown }).editorBrandName
  const editorBrandName =
    typeof editorBrandNameRaw === 'string' && editorBrandNameRaw.trim().length > 0 ? editorBrandNameRaw.trim() : null

  const ai = new GoogleGenAI({ apiKey })

  const meta = {
    shotType,
    preset,
    generationIndex,
    variationSeed,
    garmentType,
    pipeline,
  }

  try {
    const maxAttempts = 2
    const prompt = buildPrompt({
      shotType,
      preset,
      generationIndex,
      variationSeed,
      garmentType,
      editInstructions,
      pipeline,
    })

    let lastErrorMessage = ''
    let modelCalls = 0
    console.debug?.(
      `[mockups:${requestId}] start shotType=${shotType} preset=${preset} attempts=${maxAttempts} inputMime=${inputMime} generationIndex=${generationIndex}`
    )
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const attemptStartedAt = Date.now()
        console.debug?.(`[mockups:${requestId}] attempt ${attempt}/${maxAttempts} generating...`)
        modelCalls += 1
        const interaction = await ai.interactions.create({
          model: 'gemini-2.5-flash-image',
          input: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                ...(attempt === 1 || !lastErrorMessage
                  ? []
                  : [{ type: 'text' as const, text: retryNote(lastErrorMessage) }]),
                { type: 'image', data: parsed.base64, mime_type: inputMime },
              ],
            },
          ],
          response_modalities: ['image'],
        })
        console.debug?.(
          `[mockups:${requestId}] attempt ${attempt} response in ${Date.now() - attemptStartedAt}ms`
        )

        // Gemini SDK output typing is a union; cast to `any` since we only need the
        // `image` output's `{ data, mime_type }` fields at runtime.
        const outputImage = (interaction.outputs as any)?.find((o: any) => o.type === 'image')
        const base64: string | undefined = outputImage?.data
        const mime: string = outputImage?.mime_type || 'image/png'

        if (base64) {
          console.info?.(
            `[mockups:${requestId}] success shotType=${shotType} preset=${preset} mime=${mime} totalMs=${Date.now() - startedAt}`
          )

          let finalUrl = `data:${mime};base64,${base64}`
          const r2Enabled = isR2Configured()
          if (r2Enabled) {
            console.info?.(`[mockups:${requestId}] uploading output image to R2`)
            const bytes = Buffer.from(base64, 'base64')
            const ext =
              mime === 'image/png'
                ? 'png'
                : mime === 'image/jpeg'
                  ? 'jpg'
                  : mime === 'image/webp'
                    ? 'webp'
                    : 'bin'
            const projectId = (body as { projectId?: unknown }).projectId
            const projectPart = typeof projectId === 'string' && projectId.trim() ? projectId.trim() : 'unknown'
            const key =
              `users/${actorUserId}/projects/${projectPart}/generated/` +
              `${shotType}/${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Date.now()}.${ext}`
            const uploaded = await putObjectToR2({ key, body: bytes, contentType: mime })
            finalUrl = uploaded.url
            console.info?.(`[mockups:${requestId}] uploaded R2 url=${uploaded.url}`)
          } else if (!isDevDataUrlStorageAllowed()) {
            console.error(
              `[mockups:${requestId}] Blocking data URL storage: R2 unavailable in ${process.env.NODE_ENV || 'unknown'} environment`
            )
            return NextResponse.json(
              {
                error:
                  'Image storage is not configured. Configure R2 before generating in non-development environments.',
              },
              { status: 503 }
            )
          } else {
            console.warn(`[mockups:${requestId}] R2 not configured; storing as data URL in development`)
          }

          // Store the full prompt (UI needs full prompt for debugging).
          const promptForStorage = prompt

          return NextResponse.json({
            generatedImage: {
              id:
                typeof crypto !== 'undefined' && 'randomUUID' in crypto
                  ? crypto.randomUUID()
                  : `${Date.now()}`,
              type: shotType,
              url: finalUrl,
              timestamp: Date.now(),
              prompt: promptForStorage,
              meta,
              editedFromId: editInstructions && editedFromId ? editedFromId : undefined,
              editRequest: editInstructions,
              editedByUserId: editInstructions ? actorUserId : undefined,
              editedByBrandName: editInstructions ? editorBrandName : undefined,
              editedAt: editInstructions ? Date.now() : undefined,
            },
            modelCalls,
            meta,
          })
        }

        lastErrorMessage = 'Model returned no image output.'
        console.warn(`[mockups:${requestId}] attempt ${attempt} no image output`)
      } catch (e) {
        lastErrorMessage = asErrorMessage(e)
        console.warn(`[mockups:${requestId}] attempt ${attempt} error: ${lastErrorMessage}`)
      }

      // Small backoff between attempts (helps with transient model issues / 429 rate limits).
      if (attempt < maxAttempts) await sleep(750 * attempt)
    }

    console.error(
      `[mockups:${requestId}] failed after ${maxAttempts} attempt(s) totalMs=${Date.now() - startedAt} lastError=${lastErrorMessage}`
    )
    return NextResponse.json(
      {
        error: `Image generation failed after ${maxAttempts} attempt(s). Last error: ${lastErrorMessage}`,
        modelCalls,
        meta,
        // When no image is generated, return the full prompt so the client can display it.
        promptPreview: prompt,
      },
      { status: 502 }
    )
  } catch (e) {
    console.error(`[mockups:${requestId}] unexpected error: ${asErrorMessage(e)}`)
    return NextResponse.json({ error: asErrorMessage(e) }, { status: 502 })
  }
}

