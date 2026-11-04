import type { Category, Dish, MenuData } from '@/types'

export const CATEGORY_KINDS = [
  ['starters', 'Starters & small plates'], ['soups_salads', 'Soups & salads'],
  ['pasta', 'Pasta & risotto'], ['pizza', 'Pizza & wood-fired dishes'],
  ['grill', 'Grill & steaks'], ['mains', 'Main courses'], ['breads', 'Breads & sides'],
  ['indian_snacks', 'Chaat & Indian snacks'], ['south_indian', 'South Indian'],
  ['breakfast', 'Breakfast & brunch'], ['desserts', 'Desserts & sweets'],
  ['drinks', 'Drinks & beverages'], ['other', 'General menu (no food-specific artwork)'],
] as const
export type CategoryKind = typeof CATEGORY_KINDS[number][0]
export type CategoryPresentation = Record<string, { kind?: CategoryKind; imageUrl?: string }>

export function parseCategoryPresentation(value: unknown): CategoryPresentation {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 100) throw new Error('Choose valid category artwork settings.')
  return Object.fromEntries(Object.entries(value).map(([id, raw]) => {
    if ((id !== 'other' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) || !raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Choose valid category artwork settings.')
    const { kind, imageUrl } = raw as { kind?: unknown; imageUrl?: unknown }
    if (kind !== undefined && !CATEGORY_KINDS.some(([key]) => key === kind)) throw new Error('Choose a valid category type.')
    if (imageUrl !== undefined && (typeof imageUrl !== 'string' || (imageUrl !== '' && (!/^https:\/\//i.test(imageUrl) || imageUrl.length > 2048)))) throw new Error('Category images must use an HTTPS URL.')
    return [id, { ...(kind ? { kind: kind as CategoryKind } : {}), ...(imageUrl ? { imageUrl: imageUrl as string } : {}) }]
  }))
}

export function inferCategoryKind(name: string): CategoryKind {
  const text = name.toLowerCase().replace(/[-_&/]/g, ' ')
  const patterns: [CategoryKind, RegExp][] = [
    ['drinks', /\b(drinks?|beverages?|sips?|mocktails?|cocktails?|coolers?|juices?|smoothies?|shakes?|coffee|coffees|tea|teas|chai|lassi|sodas?)\b/],
    ['desserts', /\b(desserts?|sweets?|cakes?|ice\s*cream|gelato|puddings?|mithai)\b/],
    ['pizza', /\b(pizzas?|wood\s*fired|flatbreads?)\b/],
    ['pasta', /\b(pastas?|risottos?|spaghetti|penne|ravioli|lasagn[ae])\b/],
    ['soups_salads', /\b(soups?|salads?)\b/],
    ['south_indian', /\b(south\s*indian|dosas?|idlis?|uttapams?|vada)\b/],
    ['indian_snacks', /\b(chaats?|street\s*food|samosas?|pakoras?|pav\s*bhaji)\b/],
    ['breakfast', /\b(breakfast|brunch|pancakes?|waffles?|eggs?|omelett?es?|toast)\b/],
    ['starters', /\b(starters?|appeti[sz]ers?|antipasti|small\s*plates?|snacks?|tapas)\b/],
    ['grill', /\b(grill(?:ed|s)?|steaks?|barbecues?|bbq|kebabs?|tandoor(?:i)?)\b/],
    ['breads', /\b(breads?|naans?|rotis?|parathas?|sides?)\b/],
    ['mains', /\b(mains?|main\s*course|curr(?:y|ies)|entrees?|entrées?|rice|biryanis?|thalis?)\b/],
  ]
  return patterns.find(([, pattern]) => pattern.test(text))?.[0] || 'other'
}

export type MenuGroup = { category: Category; dishes: Dish[]; kind: CategoryKind; image?: string }

// Images belong to a food category, never to its position in a restaurant's list.
const bistroImages: Partial<Record<CategoryKind, string>> = {
  starters: '/templates/green-bistro/burrata.jpg', soups_salads: '/templates/green-bistro/burrata.jpg',
  pasta: '/templates/green-bistro/pasta.jpg', pizza: '/templates/green-bistro/pizza.jpg',
  grill: '/templates/green-bistro/steak.jpg', drinks: '/templates/green-bistro/botanical-drink-v1.png',
  desserts: '/templates/green-bistro/dessert-v1.png',
}

export function groupMenu(data: MenuData, template: string): MenuGroup[] {
  const presentation = data.restaurant.template_settings?.[template]?.categoryPresentation || {}
  const ids = new Set(data.categories.map(category => category.id))
  const categories = [...data.categories].sort((a, b) => a.sort_order - b.sort_order)
  const dishes = [...data.dishes].sort((a, b) => a.sort_order - b.sort_order)
  const groups = categories.map(category => ({ category, dishes: dishes.filter(dish => dish.is_available && dish.category_id === category.id) }))
  const other = dishes.filter(dish => dish.is_available && (!dish.category_id || !ids.has(dish.category_id)))
  if (other.length) groups.push({ category: { id: 'other', restaurant_id: data.restaurant.id, name: 'Other', sort_order: Number.MAX_SAFE_INTEGER }, dishes: other })
  return groups.filter(group => group.dishes.length).map(group => {
    const custom = presentation[group.category.id]
    const kind = custom?.kind || inferCategoryKind(group.category.name)
    const design = data.restaurant.template_settings?.B
    const legacyImage = template === 'B' ? ({ starters: design?.menuImageOne, pasta: design?.menuImageTwo, drinks: design?.menuImageThree, grill: design?.menuImageFour } as Partial<Record<CategoryKind, string>>)[kind] : undefined
    const image = custom?.imageUrl || group.dishes.find(dish => dish.image_url)?.image_url || legacyImage || (template === 'B' ? bistroImages[kind] : undefined)
    return { ...group, kind, image }
  })
}

