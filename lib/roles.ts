export type UserRole = 'free' | 'starter' | 'studio' | 'label' | 'admin'

export type Preset = 'raw' | 'editorial' | 'luxury' | 'natural' | 'studio' | 'surprise'
export type ShotType =
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

export interface RoleLimits {
  credits: number
  /** -1 = unlimited */
  assetHistoryRetentionDays: number
  flatLayTypes: number
  surfaceShots: boolean
  detailShots: 'none' | 'print' | 'all'
  blockedShotTypes: ShotType[]
  presets: Preset[]
  zip: boolean
  shareLinks: boolean
  resolution: 'standard' | 'hd' | '4k'
  watermark: boolean
  /** -1 = unlimited */
  maxProjects: number
  generateMore: boolean
  priority: boolean
  api: boolean
}

export const ROLE_LIMITS: Record<UserRole, RoleLimits> = {
  free: {
    credits: 8,
    assetHistoryRetentionDays: 7,
    flatLayTypes: 2,
    surfaceShots: false,
    detailShots: 'print',
    blockedShotTypes: ['flatlay_sleeves', 'flatlay_relaxed', 'flatlay_folded'],
    presets: ['studio'],
    zip: true,
    shareLinks: true,
    resolution: 'standard',
    watermark: true,
    maxProjects: 3,
    generateMore: false,
    priority: false,
    api: false,
  },
  starter: {
    credits: 100,
    assetHistoryRetentionDays: 90,
    flatLayTypes: 5,
    surfaceShots: false,
    detailShots: 'print',
    blockedShotTypes: [],
    presets: ['raw', 'editorial', 'studio'],
    zip: true,
    shareLinks: true,
    resolution: 'hd',
    watermark: false,
    maxProjects: 20,
    generateMore: true,
    priority: false,
    api: false,
  },
  studio: {
    credits: 300,
    assetHistoryRetentionDays: 365,
    flatLayTypes: 5,
    surfaceShots: true,
    detailShots: 'all',
    blockedShotTypes: [],
    presets: ['raw', 'editorial', 'luxury', 'natural', 'studio', 'surprise'],
    zip: true,
    shareLinks: true,
    resolution: '4k',
    watermark: false,
    maxProjects: 100,
    generateMore: true,
    priority: false,
    api: false,
  },
  label: {
    credits: 750,
    assetHistoryRetentionDays: -1,
    flatLayTypes: 5,
    surfaceShots: true,
    detailShots: 'all',
    blockedShotTypes: [],
    presets: ['raw', 'editorial', 'luxury', 'natural', 'studio', 'surprise'],
    zip: true,
    shareLinks: true,
    resolution: '4k',
    watermark: false,
    maxProjects: -1,
    generateMore: true,
    priority: true,
    api: true,
  },
  admin: {
    credits: -1,
    assetHistoryRetentionDays: -1,
    flatLayTypes: 5,
    surfaceShots: true,
    detailShots: 'all',
    blockedShotTypes: [],
    presets: ['raw', 'editorial', 'luxury', 'natural', 'studio', 'surprise'],
    zip: true,
    shareLinks: true,
    resolution: '4k',
    watermark: false,
    maxProjects: -1,
    generateMore: true,
    priority: true,
    api: true,
  },
}

export type Feature = keyof Omit<
  RoleLimits,
  'credits' | 'assetHistoryRetentionDays' | 'flatLayTypes' | 'maxProjects' | 'presets' | 'detailShots' | 'resolution' | 'blockedShotTypes'
>

export function getRoleLimits(role: UserRole): RoleLimits {
  return ROLE_LIMITS[role] ?? ROLE_LIMITS.free
}

export function canAccess(role: UserRole, feature: Feature): boolean {
  const limits = getRoleLimits(role)
  return Boolean(limits[feature])
}

export function isValidRole(value: unknown): value is UserRole {
  return typeof value === 'string' && ['free', 'starter', 'studio', 'label', 'admin'].includes(value)
}
