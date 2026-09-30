import { NextResponse } from 'next/server'
import { getOwnedRestaurant, menuDatabaseError, rejectUnsafeRequest } from '@/lib/menu-api'
import { cleanText, MENU_LIMITS, parsePrice } from '@/lib/menu-validation'
import { MENU_CSV_HEADERS, readMenuCsv, writeMenuCsv } from '@/lib/menu-csv'
import { readFormBody } from '@/lib/request-security'

const MAX_FILE_BYTES = 1024 * 1024
const MAX_ROWS = 500

function parseBoolean(value: string, fallback: boolean, kind: 'veg' | 'available') {
  const normalized = value.trim().toLowerCase().replace(/[\s_-]+/g, '')
  if (!normalized) return fallback
  const truthy = kind === 'veg'
    ? ['true', 'yes', '1', 'veg', 'vegetarian']
    : ['true', 'yes', '1', 'available', 'live', 'active']
  const falsy = kind === 'veg'
    ? ['false', 'no', '0', 'nonveg', 'nonvegetarian']
    : ['false', 'no', '0', 'unavailable', 'hidden', 'inactive']
  if (truthy.includes(normalized)) return true
  if (falsy.includes(normalized)) return false
  return null
}

export async function GET() {
  const auth = await getOwnedRestaurant()
  if ('error' in auth) return auth.error
  const [{ data: categories, error: categoryError }, { data: dishes, error: dishError }] = await Promise.all([
    auth.supabase.from('categories').select('id,name').eq('restaurant_id', auth.restaurantId),
    auth.supabase.from('dishes').select('name,description,price,is_veg,is_available,category_id,sort_order').eq('restaurant_id', auth.restaurantId).order('sort_order').order('created_at'),
  ])
  if (categoryError) return menuDatabaseError(categoryError)
  if (dishError) return menuDatabaseError(dishError)
  const categoryNames = new Map((categories ?? []).map(category => [category.id, category.name]))
  const csv = writeMenuCsv([
    [...MENU_CSV_HEADERS],
    ...(dishes ?? []).map(dish => [dish.name, categoryNames.get(dish.category_id) ?? '', dish.description ?? '', dish.price ?? 0, dish.is_veg, dish.is_available]),
  ])
  return new Response(`\uFEFF${csv}\r\n`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="menu-export.csv"',
      'Cache-Control': 'private, no-store',
    },
  })
}

export async function POST(request: Request) {
  const unsafe = rejectUnsafeRequest(request, true)
  if (unsafe) return unsafe
  const auth = await getOwnedRestaurant()
  if ('error' in auth) return auth.error
  const form = await readFormBody(request, MAX_FILE_BYTES + 65_536)
  const upload = form?.get('file')
  if (!(upload instanceof File)) return NextResponse.json({ error: 'Choose a CSV file to import.' }, { status: 400 })
  if (upload.size > MAX_FILE_BYTES) return NextResponse.json({ error: 'CSV files must be 1 MB or smaller.' }, { status: 413 })
  if (!upload.name.toLowerCase().endsWith('.csv')) return NextResponse.json({ error: 'Only .csv files can be imported.' }, { status: 415 })

  let sourceRows
  try { sourceRows = readMenuCsv(await upload.text()) }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'The CSV could not be read.' }, { status: 400 }) }
  if (!sourceRows.length) return NextResponse.json({ error: 'The CSV has headers but no menu items.' }, { status: 400 })
  if (sourceRows.length > MAX_ROWS) return NextResponse.json({ error: `Import up to ${MAX_ROWS} dishes at a time.` }, { status: 400 })

  const errors: string[] = []
  const parsed = sourceRows.map(row => {
    const title = cleanText(row.title, MENU_LIMITS.dishName)
    const category = cleanText(row.category, MENU_LIMITS.categoryName)
    const description = cleanText(row.description, MENU_LIMITS.description)
    const price = parsePrice(row.price || 0)
    const isVeg = parseBoolean(row.isVeg, true, 'veg')
    const isAvailable = parseBoolean(row.isAvailable, true, 'available')
    if (!title || title.length > MENU_LIMITS.dishName) errors.push(`Row ${row.rowNumber}: title must be 1–120 characters.`)
    if (category.length > MENU_LIMITS.categoryName) errors.push(`Row ${row.rowNumber}: category cannot exceed 80 characters.`)
    if (description.length > MENU_LIMITS.description) errors.push(`Row ${row.rowNumber}: description cannot exceed 500 characters.`)
    if (price === null) errors.push(`Row ${row.rowNumber}: price must be between 0 and 1,000,000.`)
    if (isVeg === null) errors.push(`Row ${row.rowNumber}: is_veg must be yes/no, true/false, veg/non-veg, or 1/0.`)
    if (isAvailable === null) errors.push(`Row ${row.rowNumber}: is_available must be yes/no, true/false, available/hidden, or 1/0.`)
    return { title, category, description, price, isVeg, isAvailable }
  })
  if (errors.length) return NextResponse.json({ error: `Fix ${errors.length} CSV ${errors.length === 1 ? 'error' : 'errors'} before importing.`, errors: errors.slice(0, 25) }, { status: 400 })

  const { data: existingCategories, error: existingError } = await auth.supabase.from('categories').select('*').eq('restaurant_id', auth.restaurantId).order('sort_order')
  if (existingError) return menuDatabaseError(existingError)
  const categoryByName = new Map((existingCategories ?? []).map(category => [category.name.trim().toLocaleLowerCase(), category]))
  const missingNames: string[] = []
  for (const row of parsed) {
    const key = row.category.toLocaleLowerCase()
    if (row.category && !categoryByName.has(key) && !missingNames.some(name => name.toLocaleLowerCase() === key)) missingNames.push(row.category)
  }

  let createdCategories: any[] = []
  if (missingNames.length) {
    const nextSortOrder = Math.max(-1, ...(existingCategories ?? []).map(category => category.sort_order ?? 0)) + 1
    const { data, error } = await auth.supabase.from('categories').insert(missingNames.map((name, index) => ({ restaurant_id: auth.restaurantId, name, sort_order: nextSortOrder + index }))).select('*')
    if (error) return menuDatabaseError(error)
    createdCategories = data ?? []
    for (const category of createdCategories) categoryByName.set(category.name.trim().toLocaleLowerCase(), category)
  }

  const { data: lastDish } = await auth.supabase.from('dishes').select('sort_order').eq('restaurant_id', auth.restaurantId).order('sort_order', { ascending: false }).limit(1).maybeSingle()
  const nextDishSortOrder = (lastDish?.sort_order ?? -1) + 1
  const dishRecords = parsed.map((row, index) => ({
    restaurant_id: auth.restaurantId,
    category_id: row.category ? categoryByName.get(row.category.toLocaleLowerCase())?.id ?? null : null,
    name: row.title,
    description: row.description || null,
    price: row.price,
    is_veg: row.isVeg,
    is_available: row.isAvailable,
    sort_order: nextDishSortOrder + index,
  }))
  const { data: importedDishes, error: importError } = await auth.supabase.from('dishes').insert(dishRecords).select('*')
  if (importError) {
    if (createdCategories.length) await auth.supabase.from('categories').delete().in('id', createdCategories.map(category => category.id)).eq('restaurant_id', auth.restaurantId)
    return menuDatabaseError(importError)
  }
  return NextResponse.json({ categories: createdCategories, dishes: importedDishes ?? [], imported: importedDishes?.length ?? 0 }, { status: 201 })
}
