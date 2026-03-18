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

type Preset = 'raw' | 'editorial' | 'luxury' | 'natural' | 'surprise'
type InteractionsImageMime =
  | 'image/png'
  | 'image/jpeg'
  | 'image/webp'
  | 'image/heic'
  | 'image/heif'

type ShotCategory = 'flatlay' | 'surface' | 'detail'

function getApiKey(): string | undefined {
  return process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY
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
  switch (mimeType) {
    case 'image/png':
    case 'image/jpeg':
    case 'image/webp':
    case 'image/heic':
    case 'image/heif':
      return mimeType
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
  'The provided image is the EXACT physical garment — do not redesign, reinterpret, or alter it in any way.',
  '',
  'PRODUCT FIDELITY (non-negotiable):',
  '- Preserve exact print placement, graphics, logo position, and colorway',
  '- Preserve true garment silhouette and structure',
  '- Preserve realistic fabric weight and natural fold behaviour',
  '- Do NOT reshape, smooth, or make the garment look digitally rendered',
  '- Do NOT add, remove, or modify any design element',
  '- Do NOT introduce logos, watermarks, or text not present in the original',
  '',
  'PERMITTED REFINEMENTS ONLY:',
  '- Remove dust, lint, and sensor noise',
  '- Improve fabric clarity and thread definition',
  '- Correct uneven or poor lighting from the reference image',
  '- Make the garment look professionally pressed and shoot-ready',
  '',
  'OUTPUT:',
  '- Aspect ratio: 1:1 square',
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
  '- Do NOT add extra garments, duplicate sleeves, duplicate collars, or mirrored/duplicated prints.',
  '- Do NOT alter typography, warp logos, or “correct” artwork; keep graphics identical.',
  '- Do NOT invent new seams, pockets, zippers, tags, drawstrings, buttons, or fabric panels.',
  '- Do NOT add hangers/hands/mannequins/people unless the shot type explicitly requires it.',
  '- Do NOT output CGI/illustration/painterly styles, plastic sheen, or “AI texture”. Photoreal only.',
  '- Do NOT add text, watermarks, brand marks, UI overlays, or borders.',
].join('\n')

const NEGATIVE_BY_CATEGORY: Record<ShotCategory, string> = {
  flatlay: [
    'NEGATIVE (flat lay specific):',
    '- No hangers, hooks, people, hands, mannequins, or props touching the garment.',
    '- No perspective tilt for strict top-down shots; no wide-angle distortion.',
    '- No horizon line, no corners/room edges, no “infinite cyclorama curve”; the surface is a single flat plane.',
    '- No warped/bent background plane; no wavy geometry; no texture stretch/smear; avoid repeating patterns.',
    '- Avoid gritty HDR, over-sharpened “AI noise,” or watercolor-like texture on the surface.',
  ].join('\n'),
  surface: [
    'NEGATIVE (surface shots specific):',
    '- No warped hangers, no thick plastic hangers with logos, no retail tags unless present in original.',
    '- No busy backgrounds; keep background premium and unobtrusive.',
    '- No bent walls or warped planes; avoid stretched textures and unnatural perspective.',
    '- Avoid heavy vignettes/gradients that imply curved geometry unless explicitly requested.',
  ].join('\n'),
  detail: [
    'NEGATIVE (detail shots specific):',
    '- Do NOT turn texture into noise or watercolor; avoid over-smoothing.',
    '- Avoid blown highlights on fabric; preserve weave detail and realistic shading.',
    '- Background must be minimal and non-distracting; no warped patterns behind the subject.',
  ].join('\n'),
}

const SHOT_PROMPTS: Record<ShotType, string> = {
  flatlay_topdown: [
    'SHOT TYPE: Top-down flat lay',
    '- Camera perfectly overhead at 90°, no perspective distortion',
    '- Garment centred and symmetrically composed',
    '- Full garment visible with clean breathing room on all edges',
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
    '- Ensure sleeve ends are fully visible and not cropped',
  ].join('\n'),
  flatlay_relaxed: [
    'SHOT TYPE: Relaxed / crumpled flat lay',
    '- Camera overhead, slight off-centre angle acceptable',
    '- Garment casually placed — intentional relaxed energy',
    '- Natural folds and creases visible and celebrated',
    '- Not messy, but deliberately unstudied',
    '- Feels candid, not staged',
    '- Keep folds realistic with correct fabric weight (not rubbery, not paper-like)',
  ].join('\n'),
  flatlay_folded: [
    'SHOT TYPE: Folded logo shot',
    '- Garment neatly folded so the primary print or logo is centred and fully visible',
    '- Fold lines clean and intentional',
    '- Camera overhead at 90°',
    '- Compact, square composition',
    '- Fold should feel retail-ready, like a display table',
    '- Ensure the logo/graphic is not distorted by folds; keep proportions correct',
  ].join('\n'),
  surface_draped: [
    'SHOT TYPE: Draped over surface',
    '- Garment loosely draped over the edge of a surface or object',
    '- Half-hanging, half-resting — natural gravity in the fabric',
    '- Not a flat lay — the garment has dimension and movement',
    '- Front face visible and dominant',
    '- Lifestyle feel, less clinical than a flat lay',
    '- Drape should look physically plausible; fabric should not fuse into the surface',
    '- Keep background minimal and premium (no clutter)',
  ].join('\n'),
  surface_hanging: [
    'SHOT TYPE: Hanging shot',
    '- Garment on a minimal hook or hanger',
    '- Wall or surface behind it as background',
    '- Full garment visible, hanging naturally',
    '- Slight natural drape from gravity',
    '- Camera straight-on, not angled',
    '- Keep hanger/hook minimal and unbranded',
    '- Avoid warped shoulders; keep silhouette true to the garment',
  ].join('\n'),
  detail_print: [
    'SHOT TYPE: Print close-up',
    '- Extreme tight crop on the primary graphic or print',
    '- Fill the entire frame with the design',
    '- Razor sharp focus on the artwork',
    '- Fabric texture subtly visible beneath the print',
    '- No garment edges visible — pure design focus',
    '- Preserve exact letterforms/linework; no hallucinated strokes or “helpful” sharpening artifacts',
  ].join('\n'),
  detail_fabric: [
    'SHOT TYPE: Fabric texture macro',
    '- Extreme close-up on the material weave and texture',
    '- No print or graphic needed — pure material study',
    '- Communicates fabric quality and weight',
    '- Slightly off-centre crop for editorial feel',
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
    '- Surface: smooth slate / honed stone, near-black, subtle tight grain (no visible pattern warping)',
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
  surprise: [
    'VISUAL DIRECTION: Surprise',
    '- Surface: [RANDOMISED — see variation seed]',
    '- Lighting: [RANDOMISED — see variation seed]',
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
    ].join('\\n'),
    surface:
      'CONTEXT (surface): maintain realistic gravity folds and clean separation from background; keep background premium and not cluttered.',
    detail:
      'CONTEXT (detail): avoid crushed blacks or blown highlights; preserve micro texture and true print edges.',
  },
  editorial: {
    flatlay: [
      'CONTEXT (flat lay):',
      '- Slate/stone reads as a flat studio surface (single plane), no visible corner or horizon.',
      '- Keep styling minimal and precise; even exposure; avoid harsh shadow cut-offs.',
      '- Texture grain is tight and subtle; do not introduce streaks, banding, or warped patterns.',
    ].join('\\n'),
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
    ].join('\\n'),
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
    ].join('\\n'),
    surface:
      'CONTEXT (surface): believable window-light falloff; keep background calm and coherent.',
    detail:
      'CONTEXT (detail): warm but accurate color; texture should remain realistic, not “softened away.”',
  },
  surprise: {
    flatlay: [
      'CONTEXT (flat lay):',
      '- Surprise comes from surface + lighting choices, but the surface must still be a single flat plane (no corners/horizon).',
      '- Keep it clean and symmetric when required; do not introduce warped patterns or curved geometry.',
    ].join('\\n'),
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

  const compositions = [
    'centred with generous breathing room',
    'slightly off-centre to the left',
    'slightly off-centre to the right',
    'centred tight — garment fills 80% of frame',
    'centred with asymmetric negative space',
  ] as const

  const surfaces = [
    'raw concrete',
    'slate',
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
    `- This is generation #${generationIndex} of this shot type for this project — ensure it looks noticeably different from previous generations`,
    '- Do not repeat the exact same composition or lighting setup as any prior generation',
  ]

  if (preset === 'surprise') {
    lines.push(`- Surface: ${pickOne(rand, surfaces)}`)
    lines.push(`- Lighting: ${pickOne(rand, lightings)}`)
    lines.push(`- Lens: ${pickOne(rand, lenses)}`)
    lines.push(`- Depth of field: ${pickOne(rand, dof)}`)
  }

  return lines.join('\n')
}

function buildPrompt(args: {
  shotType: ShotType
  preset: Preset
  generationIndex: number
  variationSeed: number
}) {
  const category = categoryForShotType(args.shotType)
  const base = category === 'detail' ? `${BASE_FIDELITY}\n\n${BASE_DETAIL_CARVEOUT}` : BASE_FIDELITY

  const negative = [NEGATIVE_GLOBAL, NEGATIVE_BY_CATEGORY[category]].join('\n')
  const preset = [PRESET_BASE[args.preset], PRESET_BY_CATEGORY[args.preset][category]].join('\n')

  return [base, negative, SHOT_PROMPTS[args.shotType], preset, buildVariationSeed(args.preset, args.shotType, args.generationIndex, args.variationSeed)].join(
    '\n---\n'
  )
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
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
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

    const requestedShotType = (body as { shotType?: unknown; type?: unknown }).shotType
    const legacyType = (body as { type?: unknown }).type
    const shotType: ShotType | undefined =
      requestedShotType === 'flatlay_topdown' ||
      requestedShotType === 'flatlay_45deg' ||
      requestedShotType === 'flatlay_sleeves' ||
      requestedShotType === 'flatlay_relaxed' ||
      requestedShotType === 'flatlay_folded' ||
      requestedShotType === 'surface_draped' ||
      requestedShotType === 'surface_hanging' ||
      requestedShotType === 'detail_print' ||
      requestedShotType === 'detail_fabric' ||
      requestedShotType === 'detail_collar'
        ? requestedShotType
        : legacyType === 'flat-lay'
          ? 'flatlay_topdown'
          : legacyType === 'product-shot'
            ? 'surface_hanging'
            : legacyType === 'detail'
              ? 'detail_print'
              : legacyType === 'lifestyle'
                ? 'surface_draped'
                : undefined

    const requestedPreset = (body as { preset?: unknown }).preset
    const preset: Preset =
      requestedPreset === 'raw' ||
      requestedPreset === 'editorial' ||
      requestedPreset === 'luxury' ||
      requestedPreset === 'natural' ||
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

    if (!shotType) {
      return NextResponse.json(
        {
          error:
            'shotType is required and must be one of: flatlay_topdown, flatlay_45deg, flatlay_sleeves, flatlay_relaxed, flatlay_folded, surface_draped, surface_hanging, detail_print, detail_fabric, detail_collar.',
        },
        { status: 400 }
      )
    }

    const prompt = buildPrompt({ shotType, preset, generationIndex, variationSeed })

    console.warn(`[mockups:${requestId}] Missing API key; returning placeholder for shotType=${shotType}`)
    return NextResponse.json({
      generatedImage: {
        id:
          typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}`,
        type: shotType,
        url: '',
        timestamp: Date.now(),
        prompt,
      },
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

  const requestedShotType = (body as { shotType?: unknown; type?: unknown }).shotType
  const legacyType = (body as { type?: unknown }).type
  const shotType: ShotType | undefined =
    requestedShotType === 'flatlay_topdown' ||
    requestedShotType === 'flatlay_45deg' ||
    requestedShotType === 'flatlay_sleeves' ||
    requestedShotType === 'flatlay_relaxed' ||
    requestedShotType === 'flatlay_folded' ||
    requestedShotType === 'surface_draped' ||
    requestedShotType === 'surface_hanging' ||
    requestedShotType === 'detail_print' ||
    requestedShotType === 'detail_fabric' ||
    requestedShotType === 'detail_collar'
      ? requestedShotType
      : legacyType === 'flat-lay'
        ? 'flatlay_topdown'
        : legacyType === 'product-shot'
          ? 'surface_hanging'
          : legacyType === 'detail'
            ? 'detail_print'
            : legacyType === 'lifestyle'
              ? 'surface_draped'
              : undefined

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

  const ai = new GoogleGenAI({ apiKey })

  try {
    const maxAttempts = clampInt((body as { attempts?: unknown }).attempts, 1, 3, 2)
    const prompt = buildPrompt({ shotType, preset, generationIndex, variationSeed })

    let lastErrorMessage = ''
    console.debug?.(
      `[mockups:${requestId}] start shotType=${shotType} preset=${preset} attempts=${maxAttempts} inputMime=${inputMime} generationIndex=${generationIndex}`
    )
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const attemptStartedAt = Date.now()
        console.debug?.(`[mockups:${requestId}] attempt ${attempt}/${maxAttempts} generating...`)
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

        const outputImage = interaction.outputs?.find((o: any) => o.type === 'image')
        const base64 = outputImage?.data
        const mime = outputImage?.mime_type || 'image/png'

        if (base64) {
          console.info?.(
            `[mockups:${requestId}] success shotType=${shotType} preset=${preset} mime=${mime} totalMs=${Date.now() - startedAt}`
          )

          let finalUrl = `data:${mime};base64,${base64}`
          if (isR2Configured()) {
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
              `users/${session.user.id}/projects/${projectPart}/generated/` +
              `${shotType}/${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Date.now()}.${ext}`
            const uploaded = await putObjectToR2({ key, body: bytes, contentType: mime })
            finalUrl = uploaded.url
            console.info?.(`[mockups:${requestId}] uploaded R2 url=${uploaded.url}`)
          } else {
            console.info?.(`[mockups:${requestId}] R2 not configured; storing as data URL`)
          }

          return NextResponse.json({
            generatedImage: {
              id:
                typeof crypto !== 'undefined' && 'randomUUID' in crypto
                  ? crypto.randomUUID()
                  : `${Date.now()}`,
              type: shotType,
              url: finalUrl,
              timestamp: Date.now(),
              prompt,
            },
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
      { error: `Image generation failed after ${maxAttempts} attempt(s). Last error: ${lastErrorMessage}` },
      { status: 502 }
    )
  } catch (e) {
    console.error(`[mockups:${requestId}] unexpected error: ${asErrorMessage(e)}`)
    return NextResponse.json({ error: asErrorMessage(e) }, { status: 502 })
  }
}

