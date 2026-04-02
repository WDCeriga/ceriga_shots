export type GenerationPipeline = 'garment_photo' | 'design_realize' | 'background_remove'

export type RenderStyleLevel = 'clean_cgi' | 'semi_real_cgi' | 'toon_tech' | 'photoreal_flatlay'

export interface GeneratedImage {
  id: string
  type:
    | 'flat-lay'
    | 'product-shot'
    | 'lifestyle'
    | 'detail'
    | 'background_remove'
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
  url: string
  timestamp: number
  prompt?: string
  meta?: {
    shotType: GeneratedImage['type']
    preset: 'raw' | 'editorial' | 'luxury' | 'natural' | 'studio' | 'surprise'
    generationIndex: number
    variationSeed: number
    garmentType?: string
    pipeline?: GenerationPipeline
    renderStyleLevel?: RenderStyleLevel
  }
  /**
   * Optional edit attribution + request metadata.
   * These fields are populated when a user regenerates an existing asset via the Edit flow.
   */
  editedFromId?: string
  editRequest?: string
  editedByUserId?: string
  editedByBrandName?: string | null
  editedAt?: number
}

export interface GenerationState {
  status: 'idle' | 'generating' | 'complete' | 'error'
  total: number
  completed: number
  nextType?: GeneratedImage['type']
  shotTypes?: GeneratedImage['type'][]
  preset?: 'raw' | 'editorial' | 'luxury' | 'natural' | 'studio' | 'surprise'
  garmentType?: string
  pipeline?: GenerationPipeline
  /**
   * Optional smaller, compressed image URL used as the AI generation input.
   * Keeping this separate from `Project.originalImage` lets us preserve the
   * high-res original for UI/download while reducing model input cost.
   */
  sourceImageUrl?: string
  /**
   * Sketch/design realization only.
   * Controls output style family (CGI modes vs photoreal flatlay mode).
   */
  renderStyleLevel?: RenderStyleLevel
  errorMessage?: string
}

export interface Project {
  id: string
  name: string
  originalImage: string
  originalImageName: string
  generatedImages: GeneratedImage[]
  generatedCount?: number
  generation?: GenerationState
  createdAt: number
  updatedAt: number
}

