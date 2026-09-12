export const MENU_FONT_KEYS = ['serif', 'sans', 'display', 'playfair', 'cinzel', 'cormorant', 'poppins', 'great-vibes', 'bodoni-moda'] as const

export function menuFontVariable(font?: string) {
  if (font === 'sans') return 'var(--font-manrope)'
  if (font === 'display') return 'var(--font-dm-serif)'
  if (font === 'playfair') return 'var(--font-playfair)'
  if (font === 'cinzel') return 'var(--font-cinzel)'
  if (font === 'cormorant') return 'var(--font-cormorant)'
  if (font === 'poppins') return 'var(--font-poppins)'
  if (font === 'great-vibes') return 'var(--font-great-vibes)'
  if (font === 'bodoni-moda') return 'var(--font-bodoni-moda)'
  if (font && /^[A-Za-z0-9 .'-]{1,100}$/.test(font)) return `'${font.replace(/'/g, "\\'")}', sans-serif`
  return 'Georgia, serif'
}

export function isBuiltInMenuFont(font?: string) {
  return Boolean(font && (MENU_FONT_KEYS as readonly string[]).includes(font))
}

export function googleFontStylesheetUrl(font?: string) {
  if (!font || isBuiltInMenuFont(font) || !/^[A-Za-z0-9 .'-]{1,100}$/.test(font)) return ''
  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font).replace(/%20/g, '+')}&display=swap`
}

type MenuDesign = {
  font?: string
  primaryColor?: string
  textScale?: number
  restaurantNameSize?: number
  subtitleSize?: number
  menuTitleSize?: number
  categorySize?: number
  dishNameSize?: number
  descriptionSize?: number
  priceSize?: number
  addressSize?: number
}

export function menuDesignVariables(design: MenuDesign = {}, template = 'A') {
  const legacyScale = Number.isFinite(design.textScale) ? Number(design.textScale) : 1
  const sized = (value: number | undefined, fallback: number) => `${value ?? Math.round(fallback * legacyScale)}px`
  return {
    '--menu-primary': design.primaryColor || undefined,
    '--menu-heading-font': design.font ? menuFontVariable(design.font) : template === 'C' ? 'var(--font-bodoni-moda)' : menuFontVariable(design.font),
    '--menu-name-size': sized(design.restaurantNameSize, template === 'B' ? 68 : template === 'A' ? 38 : 82),
    '--menu-subtitle-size': sized(design.subtitleSize, 12),
    '--menu-title-size': sized(design.menuTitleSize, template === 'B' ? 34 : template === 'C' ? 58 : 64),
    '--menu-category-size': sized(design.categorySize, template === 'B' ? 38 : template === 'C' ? 30 : 16),
    '--menu-dish-name-size': sized(design.dishNameSize, 14),
    '--menu-description-size': sized(design.descriptionSize, 12),
    '--menu-price-size': sized(design.priceSize, 14),
    '--menu-address-size': sized(design.addressSize, 10),
  }
}
