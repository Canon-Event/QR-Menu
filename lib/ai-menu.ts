// Shared by the editor and server. This module contains no credentials or provider calls.
import { readPortionName } from './menu-portions'
export const AI_MENU_MAX_ITEMS = 100
export const AI_MENU_MAX_BYTES = 3 * 1024 * 1024
export const BASIC_FONTS = ['manrope', 'poppins', 'playfair'] as const
export const BASIC_LAYOUTS = ['editorial', 'cards'] as const
export const BASIC_BACKDROPS = ['glow', 'dots', 'grid', 'none'] as const
export const BASIC_COVER_IMAGES = [
  { src: '/templates/green-bistro/cover-food.jpg', label: 'At the table' },
  { src: '/templates/green-bistro/pasta.jpg', label: 'Fresh pasta' },
  { src: '/templates/green-bistro/burrata.jpg', label: 'Garden fresh' },
] as const
export type BasicMenuStyle = {
  font: typeof BASIC_FONTS[number]
  accent: string
  background: string
  text: string
  density: 'compact' | 'comfortable'
  layout?: typeof BASIC_LAYOUTS[number]
  backdrop?: typeof BASIC_BACKDROPS[number]
  motion?: 'none' | 'gentle'
  heroImage?: string
  tagline?: string
  showImages?: boolean
}
export const DEFAULT_BASIC_STYLE: BasicMenuStyle = {
  font: 'manrope', accent: '#92400e', background: '#fffaf3', text: '#242424', density: 'comfortable',
}
export const BASIC_MENU_PRESETS: { id: string; name: string; description: string; style: BasicMenuStyle }[] = [
  { id: 'saffron', name: 'Saffron', description: 'Warm & editorial', style: { ...DEFAULT_BASIC_STYLE, font: 'playfair', layout: 'editorial', backdrop: 'glow', motion: 'none' } },
  { id: 'garden', name: 'Garden', description: 'Fresh & botanical', style: { ...DEFAULT_BASIC_STYLE, accent: '#285443', background: '#f1f5ee', text: '#20372d', layout: 'cards', backdrop: 'dots', motion: 'none' } },
  { id: 'midnight', name: 'After hours', description: 'Dark & refined', style: { ...DEFAULT_BASIC_STYLE, font: 'playfair', accent: '#edc48a', background: '#161c23', text: '#f5eee4', layout: 'editorial', backdrop: 'glow', motion: 'none' } },
  { id: 'rose', name: 'Rose café', description: 'Soft & playful', style: { ...DEFAULT_BASIC_STYLE, font: 'poppins', accent: '#8d3c55', background: '#fff3f3', text: '#382832', layout: 'cards', backdrop: 'grid', motion: 'none' } },
  { id: 'minimal', name: 'Studio', description: 'Clean & considered', style: { ...DEFAULT_BASIC_STYLE, accent: '#333333', background: '#fafafa', text: '#242424', layout: 'editorial', backdrop: 'none', motion: 'none' } },
]
export type AiMenuItem = { category: string; name: string; description: string; price: number | null; isVeg: boolean | null; note: string; source?: { page: number; box: [number,number,number,number] } }
export type AiMenuDraft = { currency: string | null; items: AiMenuItem[]; warnings: string[] }
const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED']

function text(value: unknown, max: number, required = false): string {
  if (typeof value !== 'string' || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new Error('The menu contains invalid text.')
  const result = value.trim().replace(/\s+/g, ' ')
  if (result.length > max || (required && !result)) throw new Error(`Menu text must be ${required ? '1' : '0'}–${max} characters.`)
  return result
}

/** JSON syntax from an AI is not proof that its contents are usable. */
function validateAiMenuDraft(value: unknown, publishing: boolean, editing: boolean): AiMenuDraft {
  const body = value as Partial<AiMenuDraft> | null
  if (!body || typeof body !== 'object' || Array.isArray(body) || !Array.isArray(body.items) || (!editing && !body.items.length) || body.items.length > AI_MENU_MAX_ITEMS) throw new Error('A draft must contain 1–100 dishes.')
  if (body.currency !== null && !CURRENCIES.includes(body.currency as string)) throw new Error('Check the menu currency.')
  if (!Array.isArray(body.warnings) || body.warnings.length > 20) throw new Error('Invalid menu warnings.')
  const seen = new Set<string>()
  const items = body.items.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`Check dish ${index + 1}.`)
    const result: AiMenuItem = {
      category: text(item.category, 80, !editing), name: text(item.name, 120, !editing), description: text(item.description, 500),
      price: item.price, isVeg: item.isVeg, note: text(item.note, 200),
    }
    if(publishing&&!readPortionName(result.name).name.trim())throw new Error(`Dish ${index+1}: enter its name before publishing.`)
    if (item.source !== undefined) {
      const source=item.source
      if(!source||!Number.isInteger(source.page)||source.page<1||source.page>3||!Array.isArray(source.box)||source.box.length!==4||source.box.some(n=>typeof n!=='number'||!Number.isFinite(n)||n<0||n>1)||source.box[2]<=0||source.box[3]<=0||source.box[0]+source.box[2]>1.001||source.box[1]+source.box[3]>1.001)throw new Error('Invalid source reference.')
      result.source={page:source.page,box:[...source.box]}
    }
    if (result.price !== null && (typeof result.price !== 'number' || !Number.isFinite(result.price) || result.price < 0 || result.price > 1_000_000 || Math.abs(Math.round(result.price * 100) - result.price * 100) > 0.00001)) throw new Error(`Dish ${index + 1}: enter a price with up to two decimal places.`)
    if (result.isVeg !== null && typeof result.isVeg !== 'boolean') throw new Error(`Dish ${index + 1}: check the dietary label.`)
    if (publishing && (result.price === null || result.isVeg === null)) throw new Error(`Dish ${index + 1}: confirm its price and vegetarian/non-vegetarian label before publishing.`)
    const key = `${result.category.toLowerCase()}\n${result.name.toLowerCase()}`
    if (publishing && seen.has(key)) throw new Error(`Duplicate dish: ${result.name}. Rename its size or remove the duplicate.`)
    seen.add(key)
    return result
  })
  return { currency: body.currency as string | null, items, warnings: body.warnings.map(w => text(w, 250)) }
}
export function parseAiMenuDraft(value: unknown, publishing = false): AiMenuDraft { return validateAiMenuDraft(value, publishing, false) }
/** Local recovery may include an unfinished row; publishing always uses the strict validator. */
export function parseEditableAiMenuDraft(value: unknown): AiMenuDraft { return validateAiMenuDraft(value, false, true) }

/** Two readings are a review aid, not proof of correctness. Disagreements need owner input. */
export function compareAiMenuDrafts(first: AiMenuDraft, second: AiMenuDraft): AiMenuDraft {
  const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
  const key = (item: AiMenuItem) => `${normalize(item.category)}\n${normalize(item.name)}`
  const candidates = new Map<string, number[]>()
  second.items.forEach((item, index) => candidates.set(key(item), [...(candidates.get(key(item)) || []), index]))
  const used = new Set<number>()
  const note = (original: string, warning: string) => [warning, original].filter(Boolean).join(' ').slice(0, 200)
  let unmatched = false, disagreements = false
  const items = first.items.map(item => {
    const match = candidates.get(key(item))?.shift()
    if (match === undefined) {
      unmatched = true
      return { ...item, price: null, isVeg: null, note: note(item.note, 'Found in only one reading. Confirm the dish and price against the photo, or remove it.') }
    }
    used.add(match)
    const other = second.items[match]
    const issues: string[] = []
    if (item.price !== other.price) { disagreements = true; issues.push(`Price differs (${item.price ?? '?'} vs ${other.price ?? '?'}).`) }
    if (item.isVeg !== other.isVeg) { disagreements = true; issues.push('Dietary labels differ.') }
    if (normalize(item.description) !== normalize(other.description)) { disagreements = true; issues.push('Check description.') }
    return { ...item, price: item.price === other.price ? item.price : null, isVeg: item.isVeg === other.isVeg ? item.isVeg : null, note: note(item.note, issues.join(' ')) }
  })
  second.items.forEach((item, index) => {
    if (!used.has(index)) {
      unmatched = true
      items.push({ ...item, price: null, isVeg: null, note: note(item.note, 'Found in only one reading. Confirm the dish and price against the photo, or remove it.') })
    }
  })
  if (items.length > AI_MENU_MAX_ITEMS) throw new Error('The readings contain too many dishes to review at once. Scan smaller sections.')
  const warnings = [
    'Two AI readings can repeat the same mistake. Check every row, price and category against the original photo.',
    ...(first.currency !== second.currency ? ['The readings disagree on currency. Confirm it from the original menu.'] : []),
    ...(unmatched ? ['Some dishes appeared in only one reading. Check for omissions, duplicates and incorrect categories.'] : []),
    ...(disagreements ? ['Some readings disagree. Resolve the flagged prices and labels before publishing.'] : []),
    ...first.warnings, ...second.warnings,
  ]
  return parseAiMenuDraft({ currency: first.currency === second.currency ? first.currency : null, items, warnings: [...new Set(warnings)].slice(0, 20) })
}

function luminance(hex: string) {
  const rgb = [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722
}
export function parseBasicStyle(value: unknown): BasicMenuStyle {
  const style = value as BasicMenuStyle | null
  if (!style || !BASIC_FONTS.includes(style.font) || !['compact', 'comfortable'].includes(style.density)) throw new Error('Choose a supported font and spacing.')
  for (const color of [style.accent, style.background, style.text]) if (typeof color !== 'string' || !/^#[a-f\d]{6}$/i.test(color)) throw new Error('Choose a valid six-digit colour.')
  const bg = luminance(style.background)
  for (const color of [style.text, style.accent]) {
    const fg = luminance(color), ratio = (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05)
    if (ratio < 4.5) throw new Error('Choose darker text/accent or a different background so the menu stays readable.')
  }
  const result: BasicMenuStyle = { font: style.font, accent: style.accent.toLowerCase(), background: style.background.toLowerCase(), text: style.text.toLowerCase(), density: style.density }
  if (style.layout !== undefined) {
    if (!BASIC_LAYOUTS.includes(style.layout)) throw new Error('Choose an editorial or card layout.')
    result.layout = style.layout
  }
  if (style.backdrop !== undefined) {
    if (!BASIC_BACKDROPS.includes(style.backdrop)) throw new Error('Choose a supported background effect.')
    result.backdrop = style.backdrop
  }
  if (style.motion !== undefined) {
    if (!['none', 'gentle'].includes(style.motion)) throw new Error('Choose a supported motion setting.')
    result.motion = style.motion
  }
  if (style.tagline !== undefined) result.tagline = text(style.tagline, 100)
  if (style.showImages !== undefined) {
    if (typeof style.showImages !== 'boolean') throw new Error('Choose whether to show dish photos.')
    result.showImages = style.showImages
  }
  if (style.heroImage !== undefined) {
    if (typeof style.heroImage !== 'string' || style.heroImage.length > 2048) throw new Error('Choose a valid cover image URL.')
    const src = style.heroImage.trim()
    if (src && !BASIC_COVER_IMAGES.some(image => image.src === src)) {
      let url: URL
      try { url = new URL(src) } catch { throw new Error('Use an HTTPS image URL.') }
      if (url.protocol !== 'https:' || url.username || url.password || /\s/.test(src)) throw new Error('Use an HTTPS image URL without credentials or spaces.')
    }
    result.heroImage = src
  }
  return result
}
export function safeBasicStyle(value: unknown) {
  try { return parseBasicStyle(value) } catch { return { ...DEFAULT_BASIC_STYLE } }
}

// No free-form HTML, CSS, links, dietary inference or database operations from the model.
export const AI_MENU_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['currency', 'items', 'warnings'],
  properties: {
    currency: { type: ['string', 'null'], enum: [...CURRENCIES, null] },
    warnings: { type: 'array', maxItems: 20, items: { type: 'string' } },
    items: { type: 'array', minItems: 1, maxItems: AI_MENU_MAX_ITEMS, items: {
      type: 'object', additionalProperties: false, required: ['category', 'name', 'description', 'price', 'isVeg', 'note'],
      properties: {
        category: { type: 'string' }, name: { type: 'string' }, description: { type: 'string' },
        price: { type: ['number', 'null'], minimum: 0, maximum: 1_000_000 },
        isVeg: { type: ['boolean', 'null'] }, note: { type: 'string' },
      },
    } },
  },
}
