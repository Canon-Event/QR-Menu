import type { CategoryPresentation } from './menu-layout'

export type Design = {
  font: string
  primaryColor: string
  imageUrl: string
  restaurantNameSize: number
  subtitleSize: number
  menuTitleSize: number
  categorySize: number
  dishNameSize: number
  descriptionSize: number
  priceSize: number
  addressSize: number
  coverEyebrow?: string
  coverSideNote?: string
  coverTagline?: string
  menuLabel?: string
  sectionKicker?: string
  categoryTagline?: string
  thankYouTitle?: string
  thankYouSubtitle?: string
  thankYouMessage?: string
  openingHours?: string
  coverMenuNote?: string
  coverFooter?: string
  socialHandle?: string
  reserveLabel?: string
  reserveMessage?: string
  ingredientNoteTitle?: string
  ingredientNote?: string
  closingFooter?: string
  menuImageOne?: string
  menuImageTwo?: string
  menuImageThree?: string
  menuImageFour?: string
  backImageUrl?: string
  menuPageLayout?: 'four' | 'botanical' | 'both'
  categoryPresentation?: CategoryPresentation
}
export type SizeKey = 'restaurantNameSize' | 'subtitleSize' | 'menuTitleSize' | 'categorySize' | 'dishNameSize' | 'descriptionSize' | 'priceSize' | 'addressSize'
export type ImageKey = 'imageUrl' | 'menuImageOne' | 'menuImageTwo' | 'menuImageThree' | 'menuImageFour' | 'backImageUrl'
type FontMeta = { family: string; category: string; variants: string[] }

export const defaults: Record<string, Design> = {
  A: { font: 'serif', primaryColor: '#854d48', imageUrl: '', restaurantNameSize: 44, subtitleSize: 14, menuTitleSize: 64, categorySize: 30, dishNameSize: 16, descriptionSize: 14, priceSize: 16, addressSize: 14 },
  B: { font: 'display', primaryColor: '#294236', imageUrl: '', restaurantNameSize: 52, subtitleSize: 14, menuTitleSize: 34, categorySize: 30, dishNameSize: 16, descriptionSize: 14, priceSize: 16, addressSize: 14, coverEyebrow: 'GOOD FOOD · BRIGHTER DAYS', coverSideNote: 'FRESH INGREDIENTS · GREAT COMPANY', coverTagline: 'Eat well · Be together', menuLabel: 'MENU', coverMenuNote: 'Thoughtfully crafted for brighter gatherings', coverFooter: 'A warmer table for a brighter tomorrow', sectionKicker: 'Simple ingredients · extraordinary moments', categoryTagline: 'Fresh flavours, brighter days', thankYouTitle: 'Thank You', thankYouSubtitle: 'for Dining With Us', thankYouMessage: 'Thank you for being part of our table. Good food tastes even better when shared.', openingHours: 'Please contact us for today’s hours', socialHandle: '@yourrestaurant', reserveLabel: 'OUR DIGITAL MENU', reserveMessage: 'Good food brings people together', ingredientNoteTitle: 'A NOTE ON INGREDIENTS', ingredientNote: 'We use fresh, high-quality ingredients and are happy to assist with dietary requirements or allergen information.', closingFooter: 'A brighter tomorrow tastes better together', menuImageOne: '', menuImageTwo: '', menuImageThree: '', menuImageFour: '', backImageUrl: '' },
  C: { font: 'bodoni-moda', primaryColor: '#601b28', imageUrl: '', restaurantNameSize: 60, subtitleSize: 14, menuTitleSize: 58, categorySize: 30, dishNameSize: 16, descriptionSize: 14, priceSize: 16, addressSize: 14, coverEyebrow: 'GOOD FOOD · BRIGHTER PEOPLE', coverSideNote: 'GOOD FOOD · BRIGHTER CONVERSATIONS', menuLabel: 'Menu', coverTagline: 'TIMELESS FLAVOURS · BEAUTIFUL MOMENTS', coverFooter: 'A TABLE FOR BRIGHTER DAYS', sectionKicker: 'ESTABLISHED', categoryTagline: 'SMALL PLATES · BEAUTIFUL MOMENTS', thankYouTitle: 'Thank You', thankYouSubtitle: 'FOR BEING PART OF OUR STORY', thankYouMessage: 'Your presence at our table means the world to us. Great food creates kinder conversations, brighter days, and a more beautiful tomorrow.', openingHours: 'Please contact us for today’s opening hours', socialHandle: '@yourrestaurant', reserveLabel: 'OUR DIGITAL MENU', reserveMessage: 'Scan the QR code to revisit our menu', closingFooter: 'À BIENTÔT' },
  D: { font: 'kalam', primaryColor: '#315d17', imageUrl: '', restaurantNameSize: 52, subtitleSize: 14, menuTitleSize: 28, categorySize: 30, dishNameSize: 16, descriptionSize: 14, priceSize: 16, addressSize: 14, menuLabel: 'MENU', coverTagline: 'All Day Breakfast • Café • Mocktails', sectionKicker: 'Breakfast Delights', categoryTagline: 'Freshly made • served all day', thankYouTitle: 'Thank You', thankYouSubtitle: 'for brunching with us', thankYouMessage: 'Good food tastes better when shared.', openingHours: 'Mon – Sun\n8:00 AM – 5:00 PM', socialHandle: '@yourrestaurant', reserveMessage: 'Scan for Menu, Feedback & More', closingFooter: 'See you again soon', backImageUrl: '' },
}
export const names: Record<string, string> = { A: 'Heritage', B: 'Green Bistro', C: 'Italian', D: 'Bloom & Brunch' }
export const menuCopyLimits: Partial<Record<keyof Design,number>> = {
  coverEyebrow:100, coverSideNote:100, coverTagline:100, menuLabel:40, sectionKicker:100,
  categoryTagline:100, thankYouTitle:80, thankYouSubtitle:100, thankYouMessage:240,
  openingHours:160, coverMenuNote:140, coverFooter:140, socialHandle:80, reserveLabel:80,
  reserveMessage:140, ingredientNoteTitle:100, ingredientNote:300, closingFooter:140,
}
export const heritageTextControls: { key: keyof Design; label: string; multiline?: boolean }[] = [
  { key:'menuLabel', label:'Menu title' }, { key:'coverTagline', label:'Cover tagline' },
  { key:'thankYouTitle', label:'Closing title' }, { key:'thankYouMessage', label:'Closing message', multiline:true },
  { key:'openingHours', label:'Opening hours', multiline:true }, { key:'ingredientNote', label:'Ingredient note', multiline:true },
]
export const bistroTextControls: { key: keyof Design; label: string; multiline?: boolean }[] = [
  { key: 'coverEyebrow', label: 'Cover left note' },
  { key: 'coverSideNote', label: 'Cover right note' },
  { key: 'coverTagline', label: 'Cover tagline' },
  { key: 'menuLabel', label: 'Menu title' },
  { key: 'coverMenuNote', label: 'Cover menu note' },
  { key: 'coverFooter', label: 'Cover footer line' },
  { key: 'sectionKicker', label: 'Section image caption' },
  { key: 'categoryTagline', label: 'Category tagline' },
  { key: 'thankYouTitle', label: 'Closing title' },
  { key: 'thankYouSubtitle', label: 'Closing subtitle' },
  { key: 'thankYouMessage', label: 'Closing message', multiline: true },
  { key: 'openingHours', label: 'Opening hours', multiline: true },
  { key: 'socialHandle', label: 'Social handle' },
  { key: 'reserveLabel', label: 'Reservation label' },
  { key: 'reserveMessage', label: 'Reservation message' },
  { key: 'ingredientNoteTitle', label: 'Ingredient note title' },
  { key: 'ingredientNote', label: 'Ingredient note', multiline: true },
  { key: 'closingFooter', label: 'Closing footer' },
]
export const italianTextControls: { key: keyof Design; label: string; multiline?: boolean }[] = [
  { key: 'coverEyebrow', label: 'Closing-page left note' },
  { key: 'coverSideNote', label: 'Top-right note' },
  { key: 'menuLabel', label: 'Menu title' },
  { key: 'coverTagline', label: 'Menu tagline' },
  { key: 'coverFooter', label: 'Lower-left note' },
  { key: 'sectionKicker', label: 'Establishment line' },
  { key: 'categoryTagline', label: 'Category tagline' },
  { key: 'thankYouTitle', label: 'Closing title' },
  { key: 'thankYouSubtitle', label: 'Closing subtitle' },
  { key: 'thankYouMessage', label: 'Closing message', multiline: true },
  { key: 'openingHours', label: 'Opening hours', multiline: true },
  { key: 'socialHandle', label: 'Social handle' },
  { key: 'reserveLabel', label: 'Reservation label' },
  { key: 'reserveMessage', label: 'Reservation message' },
  { key: 'closingFooter', label: 'Closing footer' },
]
export const bloomTextControls: { key: keyof Design; label: string; multiline?: boolean }[] = [
  { key: 'menuLabel', label: 'Cover menu label' },
  { key: 'coverTagline', label: 'Cover tagline' },
  { key: 'sectionKicker', label: 'Menu page title' },
  { key: 'categoryTagline', label: 'Category tagline' },
  { key: 'thankYouTitle', label: 'Closing title' },
  { key: 'thankYouSubtitle', label: 'Closing subtitle' },
  { key: 'thankYouMessage', label: 'Closing message', multiline: true },
  { key: 'openingHours', label: 'Opening hours', multiline: true },
  { key: 'socialHandle', label: 'Social handle' },
  { key: 'reserveMessage', label: 'QR code message', multiline: true },
  { key: 'closingFooter', label: 'Closing footer' },
]
export const bistroImageControls: { key: ImageKey; label: string; fallback: string }[] = [
  { key: 'imageUrl', label: 'Cover image', fallback: 'Original template artwork' },
  { key: 'menuImageOne', label: 'Default starter photo', fallback: 'Starter artwork' },
  { key: 'menuImageTwo', label: 'Default pasta photo', fallback: 'Pasta artwork' },
  { key: 'menuImageThree', label: 'Default drinks photo', fallback: 'Drinks artwork' },
  { key: 'menuImageFour', label: 'Default grill photo', fallback: 'Grill artwork' },
  { key: 'backImageUrl', label: 'Closing-page image', fallback: 'Supplied bistro image' },
]
export const bloomImageControls: { key: ImageKey; label: string; fallback: string }[] = [
  { key: 'imageUrl', label: 'Cover artwork', fallback: 'Bloom & Brunch watercolor cover' },
  { key: 'menuImageOne', label: 'Inner-page artwork', fallback: 'Tuscan breakfast watercolor page' },
  { key: 'menuImageTwo', label: 'Drinks-page artwork', fallback: 'Citrus and mocktail watercolor page' },
  { key: 'backImageUrl', label: 'Closing-page artwork', fallback: 'Countryside thank-you watercolor page' },
]
export const sizeControls: { key: SizeKey; label: string; min: number; max: number }[] = [
  { key: 'restaurantNameSize', label: 'Restaurant name', min: 24, max: 96 },
  { key: 'subtitleSize', label: 'Subtitle', min: 12, max: 36 },
  { key: 'menuTitleSize', label: 'MENU title', min: 24, max: 96 },
  { key: 'categorySize', label: 'Category heading', min: 20, max: 72 },
  { key: 'dishNameSize', label: 'Dish name', min: 14, max: 32 },
  { key: 'descriptionSize', label: 'Dish description', min: 12, max: 26 },
  { key: 'priceSize', label: 'Price', min: 14, max: 32 },
  { key: 'addressSize', label: 'Address', min: 12, max: 24 },
]


export function resolveMenuDesign(template: string, saved: Partial<Design> & { textScale?: number } = {}): Design {
  // Materialize API copy defaults before previewing, so a first save cannot blank fallback wording.
  const base = {
    coverEyebrow: '', coverSideNote: '', coverTagline: '', menuLabel: 'Menu',
    sectionKicker: '', categoryTagline: '', thankYouTitle: 'Thank you', thankYouSubtitle: '',
    thankYouMessage: 'Good food tastes better when shared. We look forward to welcoming you again.',
    openingHours: '', coverMenuNote: '', coverFooter: '', socialHandle: '', reserveLabel: 'Our digital menu',
    reserveMessage: 'Scan to visit our menu again.', ingredientNoteTitle: 'Made with care',
    ingredientNote: 'Please ask our team about ingredients and allergens before ordering.', closingFooter: '',
    menuImageOne: '', menuImageTwo: '', menuImageThree: '', menuImageFour: '', backImageUrl: '',
    ...(defaults[template] || defaults.A),
  }
  const design = { ...base, menuPageLayout: 'both' as const, ...Object.fromEntries(Object.entries(saved).filter(([, value]) => value !== undefined)) } as Design
  for (const control of sizeControls) {
    const candidate = saved[control.key] ?? Math.round(base[control.key] * (Number.isFinite(saved.textScale) ? saved.textScale! : 1))
    design[control.key] = Number.isFinite(candidate) ? Math.min(control.max, Math.max(control.min, Math.round(candidate))) : base[control.key]
  }
  if (!/^#[0-9a-f]{6}$/i.test(design.primaryColor)) design.primaryColor = base.primaryColor
  if (!design.font || !/^[A-Za-z0-9 .'-]{1,100}$/.test(design.font)) design.font = base.font
  return design
}

/** WCAG contrast against the light paper used by the restaurant document. */
export function menuColorContrast(color: string, template: string) {
  const paper = ({ A: '#f7efdc', B: '#f5f1e5', C: '#f5ecdc', D: '#faf7e9' } as Record<string,string>)[template] || '#f7efdc'
  if (!/^#[0-9a-f]{6}$/i.test(color)) return 0
  const luminance = (hex: string) => [1,3,5].map(offset => parseInt(hex.slice(offset,offset+2),16)/255).map(value => value <= .04045 ? value/12.92 : ((value+.055)/1.055)**2.4).reduce((sum,value,index) => sum+value*[.2126,.7152,.0722][index],0)
  const foreground=luminance(color), background=luminance(paper)
  return (Math.max(foreground,background)+.05)/(Math.min(foreground,background)+.05)
}
