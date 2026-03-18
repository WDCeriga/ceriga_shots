export interface GeneratedImage {
  id: string
  type:
    | 'flat-lay'
    | 'product-shot'
    | 'lifestyle'
    | 'detail'
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
}

export interface GenerationState {
  status: 'idle' | 'generating' | 'complete' | 'error'
  total: number
  completed: number
  nextType?: GeneratedImage['type']
  shotTypes?: GeneratedImage['type'][]
  preset?: 'raw' | 'editorial' | 'luxury' | 'natural' | 'studio' | 'surprise'
  errorMessage?: string
}

export interface Project {
  id: string
  name: string
  originalImage: string
  originalImageName: string
  generatedImages: GeneratedImage[]
  generation?: GenerationState
  createdAt: number
  updatedAt: number
}

