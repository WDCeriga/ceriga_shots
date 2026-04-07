import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getInternalQueueSecret } from '@/lib/internal-queue-secret'
import { authOptions } from '@/lib/auth'
import { isR2Configured, putObjectToR2 } from '@/lib/r2'
import type { GenerationAspectRatio, RenderStyleLevel } from '@/types/projects'

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
  return process.env.REPLICATE_API_TOKEN
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
  'SOURCE-TO-PHOTO CONVERSION (critical for mockups/renders):',
  '- If the input appears as a 3D render, CAD mockup, screenshot, or synthetic image, convert it into a REAL CAMERA product photograph.',
  '- Keep design identity exact (graphics/colors/placement/silhouette), but replace synthetic rendering cues with real textile capture cues.',
  '- Remove CGI cues: plastic-like shading, perfectly smooth gradients, unreal edge glow, sterile specular highlights, uniform fake shadows, game-engine look.',
  '- Rebuild material response as real fabric: weave/knit micro-variation, natural seam relief, realistic ink absorption/print edge behavior, physically plausible fold compression.',
  '- Lighting must look optically photographed (studio softboxes), not digitally rendered.',
  '- Output must be unmistakably a real e-commerce photo, not a render pass.',
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
  '- Preserve true garment silhouette and construction (design identity: category, panels, zipper path, hood presence) — NOT the reference pose, internal air volume, or “filled by invisible body / ghost mannequin” shape',
  '- View-orientation lock (mandatory): preserve the same visible garment face as the reference image (front/back/side). If input is back view, output must remain back view unless explicitly requested otherwise.',
  '- Do NOT rotate/flip/reconstruct the garment to a different face (e.g., back-to-front) unless explicitly requested.',
  '- If multiple views appear in the reference, keep the dominant/clearest visible face and do NOT invent unseen front/back details.',
  '- Preserve realistic fabric weight and natural fold behaviour',
  '- Do NOT reshape, smooth, or make the garment look digitally rendered',
  '- Do NOT add, remove, or modify any design element',
  '- Do NOT introduce logos, watermarks, or text not present on the garment itself',
  '',
  'POSE, VOLUME, AND SHOT TYPE (critical):',
  '- If the reference shows the garment puffed out on a ghost mannequin, invisible body, or as a 3D/CGI render with inflated volume, do NOT transfer that volumetric pose into a shot that requires a different real-world layout.',
  '- Rebuild the garment as it would appear in that shot in real life (e.g. flat lay = unstuffed, lying on a plane with physically plausible flattening). Only natural fabric thickness and folds from gravity and contact with the surface/support — no “worn” or “stuffed” interior volume unless the shot type explicitly matches that presentation.',
  '',
  'PERMITTED REFINEMENTS ONLY:',
  '- Remove dust, lint, and sensor noise',
  '- Improve fabric clarity and thread definition without changing the underlying textile character',
  '- Correct uneven or poor lighting from the reference image',
  '- Make the garment look professionally pressed and shoot-ready where appropriate (for relaxed/crumpled styling, preserve natural folds and do NOT over-smooth)',
  '- Do NOT sharpen, deblur, upscale, or reconstruct printed typography/letterforms; keep printed text exactly as it appears in the reference image.',
  '',
  'TEXTILE REALISM LOCK (all fabrics, mandatory):',
  '- Preserve real textile microstructure from the reference (weave/knit/twill/rib/fleece/pile and yarn grain) exactly as material character, not as generic smooth shading.',
  '- Preserve natural fiber irregularity and tonal micro-variation; avoid uniform denoised gradients across panels.',
  '- Keep physically plausible fabric response: compression, fold memory, seam puckering, stitch relief, and edge thickness must remain natural.',
  '- Do NOT apply beauty retouching to fabric: no skin-like smoothing, no waxy finish, no plastic sheen, no painted/airbrushed look.',
  '- Keep realistic macro-to-micro contrast: avoid over-sharpened halos and avoid over-smoothed blur.',
  '',
  'OUTPUT:',
  '- Aspect ratio: 1:1 square; crop centered on the main subject for this shot type',
  '- When the shot type requires full garment visibility, ensure no cropped hems/sleeves/logo edges',
  '- Never crop or cut off printed text/letterforms that are visible in the reference image; keep all visible print boundaries within frame.',
  '- No clipped highlights on print ink; no crushed shadow detail in dark fabric folds.',
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
  '- No CGI look, no CAD render look, no game-engine shading, and no plastic material response.',
  '- No fabric denoising/surface airbrushing that erases textile grain.',
  '- No waxy/silicone/plastic cloth finish and no fake "perfectly clean" synthetic texture.',
  '- No perfectly uniform synthetic gradients across garment panels.',
  '- No fake outline glow, cutout halo, or sticker-edge compositing look.',
  '- No watercolor-like smearing, tiled texture maps, or repeated procedural cloth patterns.',
  '- Do NOT alter the garment design: prints/logos/colors/seams/pockets/zippers/buttons must match the reference exactly.',
  '- Do NOT add or reproduce watermarks, any text overlays, borders, padding, or letterboxing.',
].join('\n')

const NEGATIVE_BY_CATEGORY: Record<ShotCategory, string> = {
  flatlay: [
    'NEGATIVE (flat lay specific):',
    '- No hangers, hooks, people, hands, mannequins, or props touching the garment.',
    '- No ghost mannequin or invisible-wearer volume: no upright hood, balaclava, or face mask that reads as a filled head while the torso lies flat on the surface.',
    '- No “inflated” torso, sleeves, or hood that imply a body inside when the shot is laid flat / top-down; only natural fabric thickness and real folds from lying on the plane.',
    '- Hoods and integrated face masks: must be flattened, folded, tucked, or collapsed onto the surface — not a vertical tube or standing head volume; preserve zipper lines, eye openings, and print faithfully while collapsing volume.',
    '- No copying front-view mannequin or CGI inflation into the flat layout — re-lay the garment as unstuffed fabric.',
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
    '- No rigid ghost-mannequin shell: drape and hang must follow gravity and fabric weight, not copy inflated CGI or invisible-body volume from the reference.',
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
    '- No concrete blur overlays, texture smearing, or “smeared texture-map” patches on the surface.',
    '- Avoid heavy vignettes/overdramatic gradients that imply curved or non-flat geometry.',
  ].join('\n'),
  editorial: [
    'NEGATIVE (editorial preset anti-fail):',
    '- No visible charcoal surface grain/mottling/banding; background must read as seamless and uniform to the eye (micro-matte tooth is okay if it does not read as texture).',
    '- No paper-grain simulation, paper-fiber texture, or faux print-stock texture overlays.',
    '- No gritty HDR / over-sharpened “AI noise” on fabric or surface.',
    '- No blown highlights on fabric/ink; keep tonal range controlled and premium.',
    '- No vignette framing or dark-edge vignette falloff.',
    '- Avoid harsh shadow cut-offs; shadows should be gentle and grounded.',
  ].join('\n'),
  luxury: [
    'NEGATIVE (luxury preset anti-fail):',
    '- Avoid mirrored sheen or obvious specular reflections; keep marble low-sheen (no wet look, no mirror reflections).',
    '- No repeated/identical vein patterns; veins must be subtle and non-repeating; avoid “texture map” repetition.',
    '- Avoid over-contrast / plastic look; lighting should wrap softly and stay realistic (no gritty HDR).',
    '- No specular clipping on fabric OR marble; preserve highlight detail and smooth roll-off.',
    '- Cap marble highlight intensity: no hard white glare patches; keep marble highlights controlled and below clipping.',
    '- Avoid harsh hotspot streaks on marble; specular highlights must be soft and controlled.',
  ].join('\n'),
  natural: [
    'NEGATIVE (natural preset anti-fail):',
    '- No warped/repeating wood plank patterns; grain should feel consistent and non-artificial.',
    '- Avoid warm orange/yellow cast; window light must remain believable (no heavy tungsten look).',
    '- Cap warmth shift: keep white/neutral fabric areas from drifting orange; avoid amber/yellow color cast.',
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
    '- Garment placement: laid flat with the same visible face as the reference (front/back lock), centered, aligned to frame vertical axis (allow at most +/- 5 degrees rotation)',
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
    '- Garment placement: laid flat with the same visible face as the reference (front/back lock), rotated ~20–25 degrees clockwise from the vertical axis; casually placed (not meticulously posed)',
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
    '- Garment placement: laid flat, centered, same visible face as the reference (front/back lock)',
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
    '- Garment placement: laid flat with the same visible face as the reference (front/back lock), intentionally casual',
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
    '- Garment placement: folded with the same visible panel as the reference (front/back lock); preserve garment fidelity (do NOT redesign prints/logos/text) while folding into the rectangle',
    '- Anchor rule (logo optional): if visible artwork/text exists, keep it centered within the visible folded panel; if no artwork exists, center the garment panel centerline using neckline/placket seams/collar position/waistband centerline (as applicable)',
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
    '- Same visible face as the reference must remain dominant (front/back lock); drape should look physically plausible with realistic gravity (do not copy upright mannequin or CGI “filled” volume from the reference unless the reference clearly matches this draped pose)',
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
    '- Blank-garment rule (anti-hallucination): if the reference shows NO visible print/graphic/text, do NOT invent any. In that case, treat this shot as a blank detail close-up: crop a clean representative blank area of the garment (fabric + stitching/texture only) while preserving the garment’s true material and color.',
    '- Never add brand names, slogans, logos, or any new typography.',
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
    '- Detail selection (crop-lock): identify ONE neckline/collar region in the reference image; that chosen region defines the crop boundaries',
    '- Apply ONLY a tight crop/zoom to the same chosen neckline/collar region; do NOT drift to a different garment area or re-select a different detail region',
    '- Center the chosen crop region in the output frame, but preserve the chosen region internal placement/occlusions exactly as seen in the reference (no re-framing/re-centering that changes what collar parts are included)',
    '- Garment identity lock: keep the exact original garment category and construction; if input is a hoodie, it must remain a hoodie (no t-shirt conversion)',
    '- Preserve hood attachment, neckline seam path, ribbing pattern, stitch layout, and visible edge boundaries exactly as in the reference',
    '- Do NOT restyle, re-cut, re-shape, or re-garment the neckline/collar region',
    '- Do NOT reposition or refold the garment beyond what is already present in the selected reference crop',
    '- Stitching/finish quality visible and preserved exactly as in the reference',
    '- Builds product trust and premium signal',
    '- Keep stitches clean and realistic; do not invent extra seam lines',
    '- Do NOT crop off visible collar/neckline edges or visible stitch boundaries; keep all visible edges inside the frame.',
  ].join('\n'),
}

/** Prepended to all flat-lay shot prompts for garment_photo — stops ghost-mannequin/CGI volume from carrying over. */
const FLATLAYOUT_GHOST_MANNEQUIN_BLOCK = [
  'DE-GHOST / FLAT PHYSICS (mandatory for this shot):',
  '- Treat the reference as the garment’s design and construction only; do NOT preserve ghost-mannequin inflation, CGI “stuffed” volume, or upright hood/balaclava/mask geometry from a frontal or worn-style reference.',
  '- Full-zip masks / balaclava hoods: keep zipper path, openings, and graphics faithful, but the mask region must collapse flat or open and lie flat — never a vertical “tube” or filled head on the surface.',
  '- Sleeves and body: unstuffed; natural thickness and folds from the garment resting on the plane only — no cylindrical “arm inside” illusion for top-down flat lay.',
].join('\n')

/** Prepended to surface (draped + hanging) shot prompts — natural support vs copied mannequin volume. */
const SURFACE_DEGHOST_BLOCK = [
  'DE-GHOST / SURFACE PHYSICS (mandatory for this shot):',
  '- If the reference is ghost mannequin, worn fill, or CGI with inflated volume, rebuild natural drape or hang for this shot from gravity and fabric weight — do not copy invisible-body inflation or rigid shell shape.',
  '- Draped shots: fabric must fall and compress at the edge in a physically plausible way; hanging shots: shoulders and hem respond to the hanger and gravity, not a pasted mannequin torso.',
].join('\n')

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
    '- Texture fidelity priority over cleanliness: preserve subtle fabric micro-variation and textile grain; do NOT over-smooth into a synthetic/plastic look.',
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
  _preset: Preset,
  shotType: ShotType,
  _generationIndex: number,
  _variationSeed: number
) {
  // Realism-first mode: keep generation deterministic and avoid stylistic randomization
  // that can drift fabric appearance away from the source.
  const realismSafeByShot: Record<ShotType, string> = {
    flatlay_topdown: 'centred with balanced margins — garment fills ~72-78% of frame',
    flatlay_45deg: 'centred with safe framing — garment fills ~72-78% of frame',
    flatlay_sleeves: 'centred with sleeve-safe margins — sleeves fully visible; garment fills ~70-80% of frame',
    flatlay_relaxed: 'centred with balanced margins — garment fills ~72-78% of frame',
    flatlay_folded: 'centred tight — folded garment fills ~82-86% of frame',
    surface_draped: 'centred with comfortable margin — garment fills ~72-85% of frame',
    surface_hanging: 'centred with comfortable margin — garment fills ~72-85% of frame',
    detail_print: 'centred tight — chosen detail region fills ~80% of frame',
    detail_fabric: 'centred tight — chosen detail region fills ~80% of frame',
    detail_collar: 'centred tight — chosen detail region fills ~80% of frame',
  }
  return ['VARIATION INSTRUCTIONS:', `- Composition: ${realismSafeByShot[shotType]}`].join('\n')
}

const FIDELITY_REMINDER = [
  'FINAL REMINDER — PRODUCT FIDELITY:',
  '- The garment in the output must be IDENTICAL to the garment in the input image.',
  '- Identity means prints, colors, construction, and hardware — not preserving ghost-mannequin volume or reference pose when the shot type requires a different layout (flat lay, drape, hang).',
  '- STRICT IDENTITY CHECKSUM: same garment category, same visible graphics, same visible placement of all graphics/logos/text.',
  '- STRICT IDENTITY CHECKSUM (repeat): preserve same garment category + same visible graphics + same visible placement.',
  '- If any detail is unclear in the reference image, reproduce ambiguity faithfully — do NOT invent or assume.',
  '- Do not "improve" the design. Do not add details that seem logical. Only reproduce what is visible.',
  '- If you are uncertain about a design element, keep it simple and faithful rather than creative.',
].join('\n')

type GenerationPipeline = 'garment_photo' | 'design_realize'
const STORED_PROMPT_MAX_CHARS = 1200

function isDevDataUrlStorageAllowed(): boolean {
  return process.env.NODE_ENV === 'development'
}

const DESIGN_BASE_BY_STYLE: Record<RenderStyleLevel, string> = {
  clean_cgi: [
    'PRIMARY TASK (read first — single unambiguous job):',
    '- Input: a 2D design reference (sketch, line art, flat mockup, screenshot, or simple graphic).',
    '- Output: exactly ONE square clean CGI 3D render of the garment (or apparel item), preserving design fidelity.',
    '- This is NOT: photoreal lifestyle mockup, real-camera product photo, mesh export, or multi-angle sheet.',
    '',
    'MODE: CLEAN CGI',
    '- Prioritize clean, simplified material response and highly controlled digital lighting.',
    '- Keep surfaces smooth/intentional and design-visualization-like (not camera-real).',
    '',
    'INPUT HANDLING:',
    '- Focus on apparel/design artwork only. Ignore UI chrome, rulers, grid, watermarks, bezels, and photo-of-paper edges.',
    '- If multiple views appear, prioritize the clearest main view.',
    '',
    'DESIGN FIDELITY (non-negotiable):',
    '- Preserve graphics, logos, typography shapes, color relationships, and relative placement exactly.',
    '- Do NOT invent branding or extra text.',
    '- Typography fallback policy: if text is too small/ambiguous, preserve shape mass and spacing; do NOT hallucinate letters.',
    '- Silhouette confidence rule: if garment type is uncertain, keep the closest inferred category but do NOT add category-defining features not present in the reference.',
    '',
    'STYLE:',
    '- Stylized 3D render output with visible dimensional form; not a flat CAD trace.',
    '- No added text/overlays/watermarks beyond what exists as print on the product.',
  ].join('\n'),
  semi_real_cgi: [
    'PRIMARY TASK (read first — single unambiguous job):',
    '- Input: a 2D design reference (sketch, line art, flat mockup, screenshot, or simple graphic).',
    '- Output: exactly ONE square semi-real CGI 3D render of the garment (or apparel item), preserving design fidelity.',
    '- This is NOT: real-camera photography or photoreal lifestyle mockup.',
    '',
    'MODE: SEMI-REAL CGI (PROTOREAL)',
    '- Use richer material response, nuanced fold shading, and stronger physical believability than clean CGI.',
    '- Keep result clearly CGI (studio-rig digital render behavior, not camera/photo artifacts).',
    '',
    'INPUT HANDLING:',
    '- Focus on apparel/design artwork only. Ignore UI chrome, rulers, grid, watermarks, bezels, and photo-of-paper edges.',
    '- If multiple views appear, prioritize the clearest main view.',
    '',
    'DESIGN FIDELITY (non-negotiable):',
    '- Preserve graphics, logos, typography shapes, color relationships, and relative placement exactly.',
    '- Do NOT invent branding or extra text.',
    '- Typography fallback policy: if text is too small/ambiguous, preserve shape mass and spacing; do NOT hallucinate letters.',
    '- Silhouette confidence rule: if garment type is uncertain, keep the closest inferred category but do NOT add category-defining features not present in the reference.',
    '',
    'STYLE:',
    '- Semi-real CGI render with controlled digital shading; maintain clear 3D form and volume.',
    '- No added text/overlays/watermarks beyond what exists as print on the product.',
  ].join('\n'),
  toon_tech: [
    'PRIMARY TASK (read first — single unambiguous job):',
    '- Input: a 2D design reference (sketch, line art, flat mockup, screenshot, or simple graphic).',
    '- Output: exactly ONE square toon-tech stylized 3D render of the garment (or apparel item), preserving design fidelity.',
    '- This is NOT: 2D illustration, comic panel, or painterly concept art.',
    '',
    'MODE: TOON-TECH 3D',
    '- Use stylized shading with clean gradient ramps and slightly emphasized edge definition.',
    '- Maintain true volumetric 3D geometry and physically plausible garment structure.',
    '',
    'INPUT HANDLING:',
    '- Focus on apparel/design artwork only. Ignore UI chrome, rulers, grid, watermarks, bezels, and photo-of-paper edges.',
    '- If multiple views appear, prioritize the clearest main view.',
    '',
    'DESIGN FIDELITY (non-negotiable):',
    '- Preserve graphics, logos, typography shapes, color relationships, and relative placement exactly.',
    '- Do NOT invent branding or extra text.',
    '- Typography fallback policy: if text is too small/ambiguous, preserve shape mass and spacing; do NOT hallucinate letters.',
    '- Silhouette confidence rule: if garment type is uncertain, keep the closest inferred category but do NOT add category-defining features not present in the reference.',
    '',
    'STYLE:',
    '- Stylized toon-tech 3D only; hard ban on 2D cartoon/illustration output.',
    '- No added text/overlays/watermarks beyond what exists as print on the product.',
  ].join('\n'),
  photoreal_flatlay: [
    'PRIMARY TASK (read first — single unambiguous job):',
    '- Input: a 2D design reference (sketch, line art, flat mockup, screenshot, or simple graphic).',
    '- Output: exactly ONE square photoreal product photograph of the garment (or apparel item), preserving design fidelity.',
    '- This is NOT: stylized CGI, toon render, or concept art.',
    '',
    'MODE: PHOTOREAL FLATLAY PRODUCT SHOT',
    '- Render as a realistic e-commerce top-down flatlay product photograph.',
    '- Keep real fabric grounding/weight/contact behavior and natural fold response.',
    '',
    'INPUT HANDLING:',
    '- Focus on apparel/design artwork only. Ignore UI chrome, rulers, grid, watermarks, bezels, and photo-of-paper edges.',
    '- If multiple views appear, prioritize the clearest main view.',
    '',
    'DESIGN FIDELITY (non-negotiable):',
    '- Preserve graphics, logos, typography shapes, color relationships, and relative placement exactly.',
    '- Do NOT invent branding or extra text.',
    '- Typography fallback policy: if text is too small/ambiguous, preserve shape mass and spacing; do NOT hallucinate letters.',
    '- Silhouette confidence rule: if garment type is uncertain, keep the closest inferred category but do NOT add category-defining features not present in the reference.',
    '',
    'STYLE:',
    '- Photoreal product-shot look (not CGI/toon).',
    '- No added text/overlays/watermarks beyond what exists as print on the product.',
  ].join('\n'),
}

const DESIGN_REALIZE_WHITE_STUDIO_BLOCK = [
  'FRAMING & SET (fixed — render pipeline):',
  '- One output image only: square, clean 3D render stage. Match the general viewing angle and pose implied by the reference (front, three-quarter, flat lay, etc.).',
  '- Center the subject; show the full item with comfortable margin; aspect ratio 1:1 square.',
  '- Environment: minimal neutral render backdrop (white to very light grey gradient, ~#F3F3F3 to #FFFFFF), no room/lifestyle context, no props.',
  '- Lighting: controlled CGI studio rig (soft key + fill + subtle rim) with smooth shadows; clean rendered separation from background.',
  '- If the job is a tight crop / detail refinement, keep the same neutral render backdrop.',
].join('\n')

const DESIGN_REALIZE_PHOTOREAL_FLATLAY_BLOCK = [
  'FRAMING & SET (fixed — photoreal flatlay mode):',
  '- One output image only: square, top-down flatlay product photograph.',
  '- Camera: approximately 90 degrees overhead; natural perspective (no wide-angle distortion).',
  '- Subject framing: full garment visible with comfortable margins; centered in 1:1 frame.',
  '- Garment grounding: fabric lies on the surface with believable weight/contact; no floating sections.',
  '- Environment: clean studio flatlay surface; minimal and unobtrusive; no props/rooms/lifestyle context.',
  '- Lighting: soft e-commerce studio lighting with realistic short grounded shadows; no harsh streaks.',
].join('\n')

const DESIGN_FIDELITY_HARDLOCK = [
  'IDENTITY LOCK (critical — non-negotiable):',
  '- Treat the reference as the source of truth for product identity. Reconstruct/render it faithfully; do NOT redesign.',
  '- Preserve exact graphic/logo count, placement, relative scale, spacing, orientation, and edge boundaries.',
  '- Preserve exact colorway relationships and panel color blocking; do NOT swap hues or simplify multi-tone regions.',
  '- Preserve typography faithfully: letterform silhouettes, spacing, occlusions, and ambiguity. Do NOT "clean up" or rewrite text.',
  '- If text/graphics are partially unclear, keep that ambiguity instead of inventing missing strokes/characters.',
  '- Preserve construction cues visible in the reference: seam paths, placket/zip path, rib zones, pocket positions, hood/collar presence, cuff/hem behavior.',
  '- Preserve the same dominant visible face/view family implied by the reference (front stays front, back stays back, etc.) unless explicitly changed.',
  '- If the reference contains UI/screenshot clutter, ignore all non-product context and realize only the apparel item.',
].join('\n')

const DESIGN_OUTPUT_QUALITY_GUARDRAILS = [
  'OUTPUT QUALITY GUARDRAILS:',
  '- Output exactly ONE square image (1:1).',
  '- Keep full product visibility with comfortable margins; no clipped hems/sleeves/logo edges unless the input crop itself is tight detail.',
  '- Maintain physically plausible volume and fold behavior for the chosen style family (CGI clean/semi/toon or photoreal flatlay).',
  '- Preserve textile realism for all fabrics: maintain weave/knit/yarn grain and avoid over-smoothed or plastic-looking material response.',
  '- No extra accessories, props, mannequins, people, or room context unless clearly required by the reference.',
  '- No added overlays, labels, watermarks, borders, split-views, or before/after composites.',
  '- No AI artifacts: warped geometry, duplicated logos, melted seams, illegible invented text, texture smearing, or denoised synthetic cloth gradients.',
].join('\n')

const NEGATIVE_DESIGN_WHITE_BG = [
  'BACKGROUND & PROPS (strict):',
  '- No wood, concrete, marble, fabric surfaces under the product, lifestyle rooms, or props.',
  '- No hands, pencils, sketch paper, clipboards, tape, rulers, or device/chrome.',
  '- No hangers, hooks, or mannequins unless the reference clearly shows one and fidelity requires it.',
].join('\n')

const NEGATIVE_GLOBAL_DESIGN = [
  'NEGATIVE (do NOT do any of the following):',
  '- Output must show ONLY the realized product; no UI, unrelated props, or clutter.',
  '- Follow the selected style family strictly (CGI modes stay CGI; photoreal mode stays photoreal).',
  '- No illustration/comic/vector/painterly sketch style.',
  '- Do NOT replace the artwork with a different design, different logo, or different color story.',
  '- Do NOT add watermarks, borders, letterboxing, device frames, or “before/after” layouts.',
].join('\n')

const FIDELITY_REMINDER_DESIGN = [
  'FINAL REMINDER — SKETCH TO 3D RENDER:',
  '- The output must remain the same product concept as the reference; do not substitute a different garment or different graphics.',
  '- Where the sketch is ambiguous (exact knit vs weave, minor seam paths), choose plausible defaults — no unrelated embellishments.',
  '- Preserve the layout and identity of visible graphics; do not “redesign for readability.”',
  '- Presentation mode must strictly follow the selected style family (CGI modes stay CGI; photoreal_flatlay stays photoreal).',
].join('\n')

const DESIGN_RENDER_STYLE_NEGATIVES: Partial<Record<RenderStyleLevel, string>> = {
  clean_cgi: [
    'ANTI-FAIL (clean CGI):',
    '- Strong anti-photography rule: no depth-sensor blur, no chromatic aberration, no film grain, no JPEG noise, no lens haze.',
  ].join('\n'),
  semi_real_cgi: [
    'ANTI-FAIL (semi-real CGI):',
    '- Strong anti-photography rule: no depth-sensor blur, no chromatic aberration, no film grain, no JPEG noise.',
    '- No lifelike worn-real photography artifacts (no sweat stains, no accidental fingerprints, no street grime).',
  ].join('\n'),
  toon_tech: [
    'ANTI-FAIL (toon-tech):',
    '- Strong anti-photography rule: no depth-sensor blur, no chromatic aberration, no film grain, no JPEG noise.',
    '- No 2D cartoon illustration; keep 3D depth and correct volume.',
  ].join('\n'),
  photoreal_flatlay: [
    'ANTI-FAIL (photoreal flatlay):',
    '- No CGI/plastic render shading, toon edge ramps, or synthetic gradient-only material response.',
    '- No stylized render look; keep physically realistic product-shot lighting and fabric shading.',
  ].join('\n'),
}

function normalizePipeline(input: unknown): GenerationPipeline {
  return input === 'design_realize' ? 'design_realize' : 'garment_photo'
}

function normalizeRenderStyleLevel(input: unknown): RenderStyleLevel {
  if (input === 'clean_cgi') return 'clean_cgi'
  if (input === 'semi_real_cgi') return 'semi_real_cgi'
  if (input === 'toon_tech') return 'toon_tech'
  if (input === 'photoreal_flatlay') return 'photoreal_flatlay'
  return 'clean_cgi'
}

function normalizeAspectRatio(input: unknown): GenerationAspectRatio {
  if (input === '4:5') return '4:5'
  if (input === '3:4') return '3:4'
  if (input === '16:9') return '16:9'
  if (input === '9:16') return '9:16'
  return '1:1'
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
    '- Allowed: lighting/exposure, contrast, crop/composition on the neutral render backdrop, subtle material clarity, removing obvious output noise — without inventing new print content.',
    '- Consistency latch (regenerate): keep the same view family as the current render unless explicitly changed (front stays front, three-quarter stays three-quarter, flat stays flat).',
    '- If instructions conflict with preserving design identity, ignore the conflicting parts.',
  ].join('\n')
}

function buildAspectRatioBlock(aspectRatio: GenerationAspectRatio): string {
  return [
    'ASPECT RATIO (strict):',
    `- Output image ratio must be exactly ${aspectRatio}.`,
    '- Keep the full subject framed for the selected shot type while honoring this ratio.',
    '- Never override this ratio with a default square crop.',
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
  renderStyleLevel?: RenderStyleLevel
  aspectRatio: GenerationAspectRatio
}) {
  const category = categoryForShotType(args.shotType)
  const isDesign = args.pipeline === 'design_realize'

  const garmentTypeAnchor = buildGarmentTypeAnchor(args.garmentType ?? '')

  if (isDesign) {
    const renderStyle = args.renderStyleLevel ?? 'clean_cgi'
    const baseCore = DESIGN_BASE_BY_STYLE[renderStyle]
    const styleNegative = DESIGN_RENDER_STYLE_NEGATIVES[renderStyle]
    const framingBlock =
      renderStyle === 'photoreal_flatlay'
        ? DESIGN_REALIZE_PHOTOREAL_FLATLAY_BLOCK
        : DESIGN_REALIZE_WHITE_STUDIO_BLOCK

    const base = [baseCore, DESIGN_FIDELITY_HARDLOCK, garmentTypeAnchor || undefined]
      .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      .join('\n\n')
    const negative = [NEGATIVE_GLOBAL_DESIGN, NEGATIVE_DESIGN_WHITE_BG, styleNegative].filter(
      (x): x is string => typeof x === 'string' && x.trim().length > 0
    ).join('\n')
    const userEditBlock = args.editInstructions
      ? buildEditInstructionsBlockDesign(args.editInstructions)
      : ''
    // Constraint order (design_realize):
    // 1) identity non-negotiables, 2) shot framing + surface/light, 3) negatives, 4) final reminder.
    return [
      base,
      framingBlock,
      DESIGN_OUTPUT_QUALITY_GUARDRAILS,
      buildAspectRatioBlock(args.aspectRatio),
      userEditBlock || undefined,
      negative,
      FIDELITY_REMINDER_DESIGN,
    ]
      .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      .join('\n---\n')
  }

  const baseCore = category === 'detail' ? `${BASE_FIDELITY}\n\n${BASE_DETAIL_CARVEOUT}` : BASE_FIDELITY
  const base = garmentTypeAnchor ? `${baseCore}\n\n${garmentTypeAnchor}` : baseCore

  const negative = [NEGATIVE_GLOBAL, NEGATIVE_BY_PRESET[args.preset], NEGATIVE_BY_CATEGORY[category]].join('\n')
  const preset = [PRESET_BASE[args.preset], PRESET_BY_CATEGORY[args.preset][category]].join('\n')

  const userEditBlock = args.editInstructions ? buildEditInstructionsBlock(args.editInstructions) : ''

  const shotPromptBody =
    category === 'flatlay'
      ? `${FLATLAYOUT_GHOST_MANNEQUIN_BLOCK}\n\n${SHOT_PROMPTS[args.shotType]}`
      : category === 'surface'
        ? `${SURFACE_DEGHOST_BLOCK}\n\n${SHOT_PROMPTS[args.shotType]}`
        : SHOT_PROMPTS[args.shotType]

  // Constraint order (garment_photo):
  // 1) identity non-negotiables, 2) shot framing, 3) surface/light physics, 4) negatives, 5) final reminder.
  return [
    base,
    shotPromptBody,
    preset,
    buildVariationSeed(args.preset, args.shotType, args.generationIndex, args.variationSeed),
    buildAspectRatioBlock(args.aspectRatio),
    userEditBlock || undefined,
    negative,
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

type ReplicatePrediction = {
  id?: string
  status?: string
  output?: unknown
  error?: string
  urls?: { get?: string }
}

function mapAspectRatioForReplicate(aspectRatio: GenerationAspectRatio): string {
  if (aspectRatio === '1:1') return '1:1'
  if (aspectRatio === '4:5') return '4:5'
  if (aspectRatio === '3:4') return '3:4'
  if (aspectRatio === '16:9') return '16:9'
  return '9:16'
}

function extractReplicateOutputUrl(output: unknown): string | undefined {
  if (typeof output === 'string' && output.length > 0) return output
  if (Array.isArray(output)) {
    for (const item of output) {
      const nested = extractReplicateOutputUrl(item)
      if (nested) return nested
    }
    return undefined
  }
  if (output && typeof output === 'object') {
    const maybeUrl = output as { url?: unknown }
    if (typeof maybeUrl.url === 'string' && maybeUrl.url.length > 0) return maybeUrl.url
  }
  return undefined
}

async function runReplicatePrediction(args: {
  apiKey: string
  prompt: string
  imageDataUris: string[]
  aspectRatio: GenerationAspectRatio
}): Promise<string> {
  const createRes = await fetch('https://api.replicate.com/v1/models/google/gemini-2.5-flash-image/predictions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      'Content-Type': 'application/json',
      Prefer: 'wait=60',
    },
    body: JSON.stringify({
      input: {
        prompt: args.prompt,
        image_input: args.imageDataUris,
        aspect_ratio: mapAspectRatioForReplicate(args.aspectRatio),
        output_format: 'png',
      },
    }),
  })

  const created = (await createRes.json().catch(() => ({}))) as ReplicatePrediction
  if (!createRes.ok) {
    throw new Error(created.error || `Replicate create failed (${createRes.status})`)
  }

  let prediction = created
  let pollUrl = created.urls?.get
  let polls = 0
  while ((prediction.status === 'starting' || prediction.status === 'processing') && pollUrl && polls < 15) {
    await sleep(1200)
    const pollRes = await fetch(pollUrl, {
      headers: { Authorization: `Bearer ${args.apiKey}` },
    })
    prediction = (await pollRes.json().catch(() => ({}))) as ReplicatePrediction
    if (!pollRes.ok) {
      throw new Error(prediction.error || `Replicate poll failed (${pollRes.status})`)
    }
    pollUrl = prediction.urls?.get ?? pollUrl
    polls += 1
  }

  if (prediction.status !== 'succeeded') {
    throw new Error(prediction.error || `Replicate status: ${prediction.status ?? 'unknown'}`)
  }

  const outputUrl = extractReplicateOutputUrl(prediction.output)
  if (!outputUrl) {
    throw new Error('Replicate returned no output URL.')
  }
  return outputUrl
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
  const internalSecret = getInternalQueueSecret()
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
    // Graceful degradation: when no Replicate token is configured, return a placeholder
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
    const renderStyleLevel = normalizeRenderStyleLevel((body as { renderStyleLevel?: unknown }).renderStyleLevel)
    const aspectRatio = normalizeAspectRatio((body as { aspectRatio?: unknown }).aspectRatio)

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
      renderStyleLevel,
      aspectRatio,
    }

    const prompt =
      editInstructions && editedFromId
        ? editInstructions
        : buildPrompt({
            shotType,
            preset,
            generationIndex,
            variationSeed,
            garmentType,
            editInstructions,
            pipeline,
            renderStyleLevel,
            aspectRatio,
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
      warning: 'Missing API key. Set REPLICATE_API_TOKEN to enable image generation.',
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
  const imageUrls = (body as { imageUrls?: unknown }).imageUrls

  const parsedInputs: Array<{ mimeType: string; base64: string }> = []
  if (Array.isArray(imageUrls) && imageUrls.length > 0) {
    for (const maybeUrl of imageUrls) {
      if (typeof maybeUrl !== 'string' || maybeUrl.length < 8) continue
      const parsed = await fetchImageUrlAsBase64(maybeUrl)
      if (parsed) parsedInputs.push(parsed)
    }
    if (parsedInputs.length === 0) {
      console.warn(`[mockups:${requestId}] imageUrls provided but none were fetchable`)
      return NextResponse.json({ error: 'imageUrls could not be fetched.' }, { status: 400 })
    }
  } else if (typeof imageDataUrl === 'string' && imageDataUrl.length >= 32) {
    const parsed = parseDataUrl(imageDataUrl)
    if (!parsed) {
      console.warn(`[mockups:${requestId}] imageDataUrl not a base64 data URL`)
      return NextResponse.json({ error: 'imageDataUrl must be a base64 data URL.' }, { status: 400 })
    }
    parsedInputs.push(parsed)
  } else if (typeof imageUrl === 'string' && imageUrl.length >= 8) {
    const parsed = await fetchImageUrlAsBase64(imageUrl)
    if (!parsed) {
      console.warn(`[mockups:${requestId}] Failed to fetch imageUrl`)
      return NextResponse.json({ error: 'imageUrl could not be fetched.' }, { status: 400 })
    }
    parsedInputs.push(parsed)
  } else {
    console.warn(`[mockups:${requestId}] Missing/invalid imageDataUrl/imageUrl/imageUrls`)
    return NextResponse.json({ error: 'imageDataUrl, imageUrl, or imageUrls is required.' }, { status: 400 })
  }

  const inputDataUris = parsedInputs.map((parsed) => {
    const inputMime = normalizeInteractionsImageMime(parsed.mimeType)
    return `data:${inputMime};base64,${parsed.base64}`
  })

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
  const renderStyleLevel = normalizeRenderStyleLevel((body as { renderStyleLevel?: unknown }).renderStyleLevel)
  const aspectRatio = normalizeAspectRatio((body as { aspectRatio?: unknown }).aspectRatio)

  const editInstructions = normalizeEditInstructions((body as { editInstructions?: unknown }).editInstructions)
  const editedFromIdRaw = (body as { editedFromId?: unknown }).editedFromId
  const editedFromId =
    typeof editedFromIdRaw === 'string' && editedFromIdRaw.trim().length > 0 ? editedFromIdRaw.trim() : undefined
  const editorBrandNameRaw = (body as { editorBrandName?: unknown }).editorBrandName
  const editorBrandName =
    typeof editorBrandNameRaw === 'string' && editorBrandNameRaw.trim().length > 0 ? editorBrandNameRaw.trim() : null

  const meta = {
    shotType,
    preset,
    generationIndex,
    variationSeed,
    garmentType,
    pipeline,
    renderStyleLevel,
    aspectRatio,
  }

  try {
    const maxAttempts = 2
    const prompt =
      editInstructions && editedFromId
        ? editInstructions
        : buildPrompt({
            shotType,
            preset,
            generationIndex,
            variationSeed,
            garmentType,
            editInstructions,
            pipeline,
            renderStyleLevel,
            aspectRatio,
          })

    let lastErrorMessage = ''
    let modelCalls = 0
    console.debug?.(
      `[mockups:${requestId}] start shotType=${shotType} preset=${preset} attempts=${maxAttempts} inputCount=${inputDataUris.length} generationIndex=${generationIndex}`
    )
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const attemptStartedAt = Date.now()
        console.debug?.(`[mockups:${requestId}] attempt ${attempt}/${maxAttempts} generating...`)
        modelCalls += 1
        const attemptPrompt =
          attempt === 1 || !lastErrorMessage ? prompt : `${prompt}\n\n${retryNote(lastErrorMessage)}`
        const outputUrl = await runReplicatePrediction({
          apiKey,
          prompt: attemptPrompt,
          imageDataUris: inputDataUris,
          aspectRatio,
        })
        console.debug?.(
          `[mockups:${requestId}] attempt ${attempt} response in ${Date.now() - attemptStartedAt}ms`
        )
        const resolved = await fetchImageUrlAsBase64(outputUrl)
        const base64 = resolved?.base64
        const mime = resolved?.mimeType || 'image/png'

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

