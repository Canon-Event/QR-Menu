import { resolveMenuDesign } from './menu-design'

export const MENU_FONT_KEYS = ['serif', 'sans', 'display', 'playfair', 'cinzel', 'cormorant', 'poppins', 'great-vibes', 'kalam', 'patrick-hand', 'bodoni-moda'] as const

export function menuFontVariable(font?: string) {
  if (font === 'serif') return 'Georgia, serif'
  if (font === 'sans') return 'var(--font-manrope, Arial), sans-serif'
  if (font === 'display') return 'var(--font-dm-serif)'
  if (font === 'playfair') return 'var(--font-playfair)'
  if (font === 'cinzel') return 'var(--font-cinzel)'
  if (font === 'cormorant') return 'var(--font-cormorant)'
  if (font === 'poppins') return 'var(--font-poppins)'
  if (font === 'great-vibes') return 'var(--font-great-vibes)'
  if (font === 'kalam') return 'var(--font-kalam)'
  if (font === 'patrick-hand') return 'var(--font-patrick-hand)'
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
  const resolved = resolveMenuDesign(template, design)
  const sized = (key: keyof typeof resolved) => `${resolved[key]}px`
  return {
    '--menu-primary': resolved.primaryColor,
    '--menu-heading-font': menuFontVariable(resolved.font),
    '--menu-name-size': sized('restaurantNameSize'),
    '--menu-subtitle-size': sized('subtitleSize'),
    '--menu-title-size': sized('menuTitleSize'),
    '--menu-category-size': sized('categorySize'),
    '--menu-dish-name-size': sized('dishNameSize'),
    '--menu-description-size': sized('descriptionSize'),
    '--menu-price-size': sized('priceSize'),
    '--menu-address-size': sized('addressSize'),
  }
}
