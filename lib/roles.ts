export type UserRole = 'free' | 'starter' | 'studio' | 'label' | 'admin'

export type Preset = 'raw' | 'editorial' | 'luxury' | 'natural' | 'studio' | 'surprise'

export interface RoleLimits {
  credits: number
  flatLayTypes: number
  surfaceShots: boolean
  detailShots: 'none' | 'print' | 'all'
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
    credits: 5,
    flatLayTypes: 2,
    surfaceShots: false,
    detailShots: 'print',
    presets: ['raw'],
    zip: true,
    shareLinks: true,
    resolution: 'standard',
    watermark: true,
    maxProjects: 1,
    generateMore: false,
    priority: false,
    api: false,
  },
  starter: {
    credits: 50,
    flatLayTypes: 5,
    surfaceShots: false,
    detailShots: 'print',
    presets: ['raw', 'editorial'],
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
    credits: 200,
    flatLayTypes: 5,
    surfaceShots: true,
    detailShots: 'all',
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
    credits: 500,
    flatLayTypes: 5,
    surfaceShots: true,
    detailShots: 'all',
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
    flatLayTypes: 5,
    surfaceShots: true,
    detailShots: 'all',
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

export type Feature = keyof Omit<RoleLimits, 'credits' | 'flatLayTypes' | 'maxProjects' | 'presets' | 'detailShots' | 'resolution'>

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
