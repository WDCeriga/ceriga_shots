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
  '- The output must contain ONLY the garment plus any minimal required, unbranded support implied by the shot type (e.g. a simple hook/hanger for hanging shots) — zero trace of the input image context.',
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
  '- Aspect ratio: 1:1 square; crop centered on the subject',
  '- When the shot type requires full garment visibility, ensure no cropped hems/sleeves/logo edges',
  '- Never crop or cut off printed text/letterforms that are visible in the reference image; keep all visible print boundaries within frame.',
  '- Shadows must be realistic: grounded, not unnaturally long, and not razor-sharp; avoid shadow streaking/silhouette exaggeration.',
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
  '- Output MUST depict ONLY the garment and any minimal required, unbranded support (e.g., a simple hook/hanger for hanging shots); no UI, no device frames, no other surrounding objects.',
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

const SHOT_PROMPTS: Record<ShotType, string> = {
  flatlay_topdown: [
    'SHOT TYPE: Top-down flat lay',
    '- Camera perfectly overhead at 90°, no perspective distortion',
    '- Garment centred and symmetrically composed',
    '- Full garment visible with clean breathing room on all edges',
    '- Ensure the full printed area is fully visible and not cropped (including sleeve-text and logo boundaries that are present in the reference).',
    '- Fabric MUST lie directly on the surface (no hovering/float gap; no detached fabric sections).',
    '- Perfectly still — no motion blur',
    '- Sleeves naturally relaxed at sides',
    '- The garment should fill ~70–80% of the frame with even margin on all sides',
    '- Keep edges straight; avoid any “melted” or warped fabric',
  ].join('\n'),
  flatlay_45deg: [
    'SHOT TYPE: 45° angled flat lay',
    '- Camera positioned at approximately 45° angle to the surface',
    '- Garment laid flat but shot from a diagonal viewpoint',
    '- Creates depth and dimension while maintaining flat lay feel',
    '- Slight dynamic tension in the composition',
    '- Full garment visible',
    '- Use a natural perspective (avoid wide-angle); keep logo/print proportions identical',
  ].join('\n'),
  flatlay_sleeves: [
    'SHOT TYPE: Symmetrical sleeve spread',
    '- Camera perfectly overhead at 90°',
    '- Both sleeves extended fully outward in a symmetrical wing shape',
    '- Body of garment centred, sleeves spread left and right',
    '- Architectural, structured composition',
    '- Maximum breathing room around all edges',
    '- Ensure sleeve ends and all visible printed text/letterforms are fully visible and not cropped.',
    '- Fabric MUST lie directly on the surface (no hovering/float gap).',
  ].join('\n'),
  flatlay_relaxed: [
    'SHOT TYPE: Relaxed / crumpled flat lay',
    '- Camera overhead, slight off-centre angle acceptable',
    '- Garment casually placed — intentional relaxed energy',
    '- Natural folds and creases visible and celebrated',
    '- Not messy, but deliberately unstudied',
    '- Feels candid, not staged',
    '- Keep folds realistic with correct fabric weight (not rubbery, not paper-like)',
    '- Fabric MUST remain grounded and in contact with the surface (no hovering/float gap).',
  ].join('\n'),
  flatlay_folded: [
    'SHOT TYPE: Folded logo shot',
    '- Garment neatly folded so the primary print or logo is centred and fully visible',
    '- Fold lines clean and intentional',
    '- Camera overhead at 90°',
    '- Compact, square composition',
    '- Fold should feel retail-ready, like a display table',
    '- Ensure the logo/graphic is not distorted by folds; keep proportions correct',
    '- Never crop or cut off visible logo/typography within the reference image.',
    '- Folded garment MUST be physically grounded on the surface (no hovering/float gap).',
  ].join('\n'),
  surface_draped: [
    'SHOT TYPE: Draped over surface',
    '- Garment loosely draped over the edge of a surface or object',
    '- Half-hanging, half-resting — natural gravity in the fabric',
    '- Not a flat lay — the garment has dimension and movement',
    '- Front face visible and dominant',
    '- Lifestyle feel, less clinical than a flat lay',
    '- Drape should look physically plausible; fabric should not fuse into the surface',
    '- Ensure all visible front-facing printed text/graphics are within frame and not cropped.',
    '- Fabric MUST be grounded on the surface/edge (no hovering/float gap; no detached fabric sections).',
    '- Keep background minimal and premium (no clutter)',
  ].join('\n'),
  surface_hanging: [
    'SHOT TYPE: Hanging shot',
    '- Garment on a minimal hook or hanger',
    '- The hanger/support structure must be simple and minimal (single thin hook / single shoulder bar) with NO extra shapes or decorative elements.',
    '- Ensure the garment has clear physical contact/support from the hanger (no floating/hover gap).',
    '- Wall or surface behind it as background',
    '- Full garment visible, hanging naturally',
    '- Slight natural drape from gravity',
    '- The garment MUST be physically supported by the hanger/hook with visible contact (no hovering/float gap).',
    '- Use simple unbranded shoulder support/clip points so the garment is clearly held in place.',
    '- Camera straight-on, not angled',
    '- Keep hanger/hook minimal and unbranded',
    '- Avoid warped shoulders; keep silhouette true to the garment',
    '- Ensure the full garment and all visible printed text/letterforms are within frame and not cropped.',
  ].join('\n'),
  detail_print: [
    'SHOT TYPE: Print close-up',
    '- Extreme tight crop on the primary graphic or print',
    '- Fill the entire frame with the design',
    '- Razor sharp focus on the artwork',
    '- Fabric texture subtly visible beneath the print',
    '- No garment edges visible — pure design focus',
    '- Preserve exact letterforms/linework; no hallucinated strokes or “helpful” sharpening artifacts',
    '- Do NOT clip the outermost visible edges of the printed letterforms/graphics within the crop; preserve the visible boundaries.',
  ].join('\n'),
  detail_fabric: [
    'SHOT TYPE: Fabric texture macro',
    '- Extreme close-up on the material weave and texture',
    '- Focus is on weave/texture; if any print/graphics are visible inside the crop, preserve them exactly and do not remove/alter them.',
    '- Do NOT cut off important garment edges or print/letterform boundaries; preserve the full boundaries of whatever is visible inside the crop.',
    '- Communicates fabric quality and weight',
    '- Slightly off-centre crop for editorial feel is allowed, but keep all important subject boundaries fully visible within the crop.',
    '- Depth of field can be shallow — edges can softly fall off',
    '- Do NOT invent a different weave; keep texture consistent with the original garment material',
  ].join('\n'),
  detail_collar: [
    'SHOT TYPE: Collar / neckline detail',
    '- Tight crop focused on the neckline, collar rib, or hood opening',
    '- Garment folded or positioned so neckline is the clear subject',
    '- Stitching and finish quality visible',
    '- Builds product trust and premium signal',
    '- Camera slightly angled for dimension',
    '- Keep stitches clean and realistic; do not invent extra seam lines',
    '- Do NOT crop off visible collar/neckline edges or visible stitch boundaries; keep all visible edges inside the frame.',
  ].join('\n'),
}

const PRESET_BASE: Record<Preset, string> = {
  raw: [
    'VISUAL DIRECTION: Raw',
    '- Surface: poured concrete slab, cold grey; fine micro-texture only (subtle aggregate), uniform scale (no chunky pits)',
    '- Lighting: hard directional studio light, strong contrast, defined shadows',
    '- Mood: unpolished, confrontational, streetwear energy',
    '- Colour temperature: cool to neutral — no warmth',
    "- Feel: a brand that doesn't ask for permission",
  ].join('\n'),
  editorial: [
    'VISUAL DIRECTION: Editorial',
    '- Surface: matte charcoal seamless paper, perfectly uniform dark grey; zero visible texture, grain, or pattern — a clean studio infinity surface',
    '- Lighting: soft diffused overhead, even exposure, shadows are gentle and grounded',
    '- Mood: cold, precise, intentional — fashion week not hype drop',
    '- Colour temperature: cool, slightly desaturated',
    '- Feel: a luxury magazine product page',
  ].join('\n'),
  luxury: [
    'VISUAL DIRECTION: Luxury',
    '- Surface: dark veined marble, deep grey-black; low-sheen (not mirror), veins subtle and realistic (not repeated)',
    '- Lighting: soft overhead with gentle wrap, minimal shadow drama',
    '- Mood: refined, still, unhurried — the garment speaks alone',
    '- Colour temperature: neutral to slightly warm, never clinical',
    '- Feel: a high-end flagship store display',
  ].join('\n'),
  natural: [
    'VISUAL DIRECTION: Natural',
    '- Surface: aged wood, dark walnut / weathered oak; grain visible but not exaggerated; no repeating plank seams',
    '- Lighting: soft natural window light from one side, gentle falloff',
    '- Mood: organic, considered, warm without being casual',
    '- Colour temperature: slightly warm, earthy',
    '- Feel: a considered independent label with craft values',
  ].join('\n'),
  studio: [
    'VISUAL DIRECTION: Studio',
    '- Surface: clean white seamless backdrop — pure white cyclorama or white acrylic surface; zero texture, zero grain',
    '- Lighting: professional multi-light studio setup — large soft key light from above-front, fill from opposite side to reduce shadows, subtle rim/edge light for separation',
    '- Mood: clean, commercial, brand-ready — the standard for e-commerce and lookbooks',
    '- Colour temperature: neutral white, perfectly balanced — no warmth or coolness',
    '- Shadows: soft, minimal, grounded — just enough to anchor the garment without drama',
    '- Feel: a premium e-commerce product page or brand wholesale catalogue',
  ].join('\n'),
  surprise: [
    'VISUAL DIRECTION: Surprise',
    '- Surface and lighting are provided in the variation instructions below',
    '- Mood: unexpected combination — lean into the contrast',
    '- Colour temperature: follow the surface and lighting choice',
    "- Feel: something the brand hasn't tried before",
  ].join('\n'),
}

const PRESET_BY_CATEGORY: Record<Preset, Record<ShotCategory, string>> = {
  raw: {
    flatlay: [
      'CONTEXT (flat lay):',
      '- The concrete is a SINGLE flat planar surface filling the entire frame (no corners, no horizon, no curvature).',
      '- Concrete texture is subtle and uniform-scale; do not stretch/smear/repeat texture.',
      '- Shadows are crisp but controlled; do not create big gradients that imply a curved surface.',
      '- Keep edges crisp and proportions true; do not obscure the primary graphic with shadow.',
    ].join('\n'),
    surface:
      'CONTEXT (surface): maintain realistic gravity folds and clean separation from background; keep background premium and not cluttered.',
    detail:
      'CONTEXT (detail): avoid crushed blacks or blown highlights; preserve micro texture and true print edges.',
  },
  editorial: {
    flatlay: [
      'CONTEXT (flat lay):',
      '- Seamless paper reads as a perfectly flat, textureless studio surface (single plane), no visible corner or horizon.',
      '- Keep styling minimal and precise; even exposure; avoid harsh shadow cut-offs.',
      '- Surface must be completely uniform — no grain, streaks, banding, mottling, or warped patterns.',
    ].join('\n'),
    surface:
      'CONTEXT (surface): keep environment understated; the garment is hero; no busy scene elements.',
    detail:
      'CONTEXT (detail): crisp but natural; no “overprocessed” sharpening; preserve ink/fiber boundaries.',
  },
  luxury: {
    flatlay: [
      'CONTEXT (flat lay):',
      '- Marble reads as a flat tabletop surface; veins must be subtle, non-repeating, and not warped.',
      '- Premium softness; no gritty noise; keep highlights gentle and controlled.',
      '- Avoid strong reflections or mirrored sheen; keep a low-sheen, upscale finish.',
    ].join('\n'),
    surface:
      'CONTEXT (surface): quiet luxury; minimal scene; ensure hanger/hook is subtle and unbranded.',
    detail:
      'CONTEXT (detail): micro-contrast is subtle; avoid specular clipping; texture reads premium, not gritty.',
  },
  natural: {
    flatlay: [
      'CONTEXT (flat lay):',
      '- Wood reads as a flat tabletop surface; grain direction consistent; no warped or repeating plank patterns.',
      '- Light feels natural; shadows soft; no dramatic studio hard edges.',
      '- Avoid heavy vignettes or “curved table” gradients.',
    ].join('\n'),
    surface:
      'CONTEXT (surface): believable window-light falloff; keep background calm and coherent.',
    detail:
      'CONTEXT (detail): warm but accurate color; texture should remain realistic, not “softened away.”',
  },
  studio: {
    flatlay: [
      'CONTEXT (flat lay):',
      '- White surface is a SINGLE flat plane filling the entire frame — no corners, no horizon line, no curvature.',
      '- Background must be pure, even white — no grey gradients, no banding, no visible seams or creases.',
      '- Lighting is even and wrap-around; shadows are minimal and soft — just enough to ground the garment.',
      '- The garment should "pop" against the white with clean edges and natural color reproduction.',
    ].join('\n'),
    surface:
      'CONTEXT (surface): white background extends cleanly behind the garment; soft edge lighting for separation; no grey zones or uneven falloff.',
    detail:
      'CONTEXT (detail): neutral white surround; even illumination reveals true fabric color and texture without color cast; keep highlights controlled to avoid blown-out fabric edges.',
  },
  surprise: {
    flatlay: [
      'CONTEXT (flat lay):',
      '- Surprise comes from surface + lighting choices, but the surface must still be a single flat plane (no corners/horizon).',
      '- Keep it clean and symmetric when required; do not introduce warped patterns or curved geometry.',
    ].join('\n'),
    surface:
      'CONTEXT (surface): surprise comes from surface/lighting choices, not clutter or extra props.',
    detail:
      'CONTEXT (detail): surprise via lighting/surface feel only; do not change texture/weave or invent detail.',
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
  const slightlyOffLeft = 'slightly off-centre to the left' as const
  const slightlyOffRight = 'slightly off-centre to the right' as const
  const centredTight = 'centred tight — garment fills 80% of frame' as const
  const asymmetricNegativeSpace = 'centred with asymmetric negative space' as const

  // Shot prompts often imply strict symmetry/centering (especially top-down/sleeves/folded).
  // If the variation block suggests asymmetric composition, Gemini may override earlier constraints.
  // So we restrict allowed composition variants by shotType.
  let compositions: readonly string[]
  switch (shotType) {
    case 'flatlay_topdown': {
      compositions = [centredBreathingRoom]
      break
    }
    case 'flatlay_sleeves': {
      compositions = [centredBreathingRoom]
      break
    }
    case 'flatlay_folded': {
      compositions = [centredTight]
      break
    }
    case 'flatlay_45deg': {
      compositions = [centredBreathingRoom, slightlyOffLeft, slightlyOffRight, centredTight]
      break
    }
    case 'flatlay_relaxed': {
      // Keep it candid/off-centre, but avoid “asymmetric negative space” which tends to break the garment layout.
      compositions = [centredBreathingRoom, slightlyOffLeft, slightlyOffRight, centredTight]
      break
    }
    case 'surface_draped':
    case 'surface_hanging': {
      compositions = [centredBreathingRoom, slightlyOffLeft, slightlyOffRight, centredTight]
      break
    }
    case 'detail_print':
    case 'detail_collar': {
      compositions = [centredTight]
      break
    }
    case 'detail_fabric': {
      // Your shot prompt explicitly allows a slightly off-centre crop for editorial feel.
      compositions = [centredTight, slightlyOffLeft, slightlyOffRight]
      break
    }
  }

  const surfaces = [
    'raw concrete',
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

  const negative = [NEGATIVE_GLOBAL, NEGATIVE_BY_CATEGORY[category]].join('\n')
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
    const promptForStorage =
      prompt.length > STORED_PROMPT_MAX_CHARS
        ? `${prompt.slice(0, STORED_PROMPT_MAX_CHARS).trimEnd()}...`
        : prompt
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
      promptPreview: prompt.slice(0, 5000),
    })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    console.warn(`[mockups:${requestId}] Invalid JSON body`)
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
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

          const promptForStorage =
            prompt.length > STORED_PROMPT_MAX_CHARS
              ? `${prompt.slice(0, STORED_PROMPT_MAX_CHARS).trimEnd()}...`
              : prompt

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
      },
      { status: 502 }
    )
  } catch (e) {
    console.error(`[mockups:${requestId}] unexpected error: ${asErrorMessage(e)}`)
    return NextResponse.json({ error: asErrorMessage(e) }, { status: 502 })
  }
}

