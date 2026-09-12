import type { Tier } from '@/types'

export const TIER_FEATURES = {
  1: {
    label: 'Menu Only',
    hasImages: false,
    hasVideos: false,
    has3D: false,
    freeCustomization: false,
    baseTemplates: 3,
  },
  2: {
    label: 'Menu + Media',
    hasImages: true,
    hasVideos: true,
    has3D: false,
    freeCustomization: false,
    baseTemplates: 3,
  },
  3: {
    label: '3D Experience',
    hasImages: true,
    hasVideos: true,
    has3D: true,
    freeCustomization: true,
    baseTemplates: 3,
  },
} as const

export function tierCan(tier: Tier, feature: keyof typeof TIER_FEATURES[1]) {
  return TIER_FEATURES[tier][feature]
}

export function hasAddon(addons: string[], key: string) {
  return addons.includes(key)
}

// Returns true if restaurant can access a premium template key
export function canUseTemplate(
  template: string,
  addons: string[]
): boolean {
  const base = ['A', 'B', 'C']
  if (base.includes(template)) return true
  // Premium templates unlocked via addon
  return hasAddon(addons, `template_${template.toLowerCase()}`)
}
