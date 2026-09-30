export const MENU_CSV_HEADERS = ['title', 'category', 'description', 'price', 'is_veg', 'is_available'] as const

export type MenuCsvRow = {
  rowNumber: number
  title: string
  category: string
  description: string
  price: string
  isVeg: string
  isAvailable: string
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_')
}

export function parseCsv(text: string) {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"'
        index += 1
      } else if (character === '"') quoted = false
      else field += character
      continue
    }
    if (character === '"') quoted = true
    else if (character === ',') { row.push(field); field = '' }
    else if (character === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (character !== '\r') field += character
  }

  if (quoted) throw new Error('The CSV contains an unclosed quoted value.')
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows
}

export function readMenuCsv(text: string): MenuCsvRow[] {
  const rows = parseCsv(text.replace(/^\uFEFF/, ''))
  const firstNonEmpty = rows.findIndex(row => row.some(value => value.trim()))
  if (firstNonEmpty < 0) throw new Error('The CSV is empty.')

  const headers = rows[firstNonEmpty].map(normalizeHeader)
  const findHeader = (...names: string[]) => headers.findIndex(header => names.includes(header))
  const indexes = {
    title: findHeader('title', 'name', 'dish', 'dish_name'),
    category: findHeader('category', 'category_name'),
    description: findHeader('description', 'desc'),
    price: findHeader('price', 'amount'),
    isVeg: findHeader('is_veg', 'veg', 'vegetarian', 'food_type'),
    isAvailable: findHeader('is_available', 'available', 'availability', 'status'),
  }
  if (indexes.title < 0) throw new Error('The CSV needs a “title” or “name” column.')

  return rows.slice(firstNonEmpty + 1)
    .map((values, offset) => ({ values, rowNumber: firstNonEmpty + offset + 2 }))
    .filter(({ values }) => values.some(value => value.trim()))
    .map(({ values, rowNumber }) => ({
      rowNumber,
      title: values[indexes.title]?.trim() ?? '',
      category: indexes.category >= 0 ? values[indexes.category]?.trim() ?? '' : '',
      description: indexes.description >= 0 ? values[indexes.description]?.trim() ?? '' : '',
      price: indexes.price >= 0 ? values[indexes.price]?.trim() ?? '' : '',
      isVeg: indexes.isVeg >= 0 ? values[indexes.isVeg]?.trim() ?? '' : '',
      isAvailable: indexes.isAvailable >= 0 ? values[indexes.isAvailable]?.trim() ?? '' : '',
    }))
}

function safeSpreadsheetValue(value: unknown) {
  const text = String(value ?? '')
  return /^[=+\-@]/.test(text) ? `'${text}` : text
}

export function csvCell(value: unknown) {
  const text = safeSpreadsheetValue(value).replace(/"/g, '""')
  return `"${text}"`
}

export function writeMenuCsv(rows: Array<Array<unknown>>) {
  return rows.map(row => row.map(csvCell).join(',')).join('\r\n')
}
