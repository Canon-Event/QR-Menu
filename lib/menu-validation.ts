export const MENU_LIMITS = {
  categoryName: 80,
  dishName: 120,
  description: 500,
  maxPrice: 1_000_000,
  maxSortOrder: 100_000,
  ingredientName: 100,
  maxQuantity: 1_000_000_000,
} as const

export function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return ''
  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength + 1)
}

export const INGREDIENT_UNITS = ['g', 'kg', 'ml', 'l', 'piece', 'portion', 'tsp', 'tbsp'] as const

export function parseQuantity(value: unknown) {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  if (typeof number !== 'number' || !Number.isFinite(number) || number < 0 || number > MENU_LIMITS.maxQuantity) return null
  return Math.round(number * 1000) / 1000
}

export function parseUnit(value: unknown) {
  return typeof value === 'string' && (INGREDIENT_UNITS as readonly string[]).includes(value) ? value : null
}

export function parseSortOrder(value: unknown) {
  const number = Number(value)
  return Number.isInteger(number) && number >= 0 && number <= MENU_LIMITS.maxSortOrder ? number : null
}

export function parsePrice(value: unknown) {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  if (typeof number !== 'number' || !Number.isFinite(number) || number < 0 || number > MENU_LIMITS.maxPrice) return null
  return Math.round(number * 100) / 100
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}
