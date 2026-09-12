import { readJsonBody } from '@/lib/request-security'
import { NextResponse } from 'next/server'
import { getOwnedRestaurant, menuDatabaseError, rejectUnsafeRequest } from '@/lib/menu-api'
import { cleanText, isUuid, MENU_LIMITS, parsePrice, parseSortOrder } from '@/lib/menu-validation'

function dishInput(body: any, partial = false) {
  const updates: Record<string, unknown> = {}
  if (!partial || 'name' in (body ?? {})) {
    const name = cleanText(body?.name, MENU_LIMITS.dishName)
    if (!name || name.length > MENU_LIMITS.dishName) return { error: 'Dish name must be 1–120 characters.' }
    updates.name = name
  }
  if (!partial || 'description' in (body ?? {})) {
    const description = cleanText(body?.description, MENU_LIMITS.description)
    if (description.length > MENU_LIMITS.description) return { error: 'Description cannot exceed 500 characters.' }
    updates.description = description || null
  }
  if (!partial || 'price' in (body ?? {})) {
    const price = parsePrice(body?.price)
    if (price === null) return { error: 'Enter a price from ₹0 to ₹10,00,000.' }
    updates.price = price
  }
  if (!partial || 'categoryId' in (body ?? {})) {
    if (body?.categoryId !== null && body?.categoryId !== '' && !isUuid(body?.categoryId)) return { error: 'Invalid category.' }
    updates.category_id = body?.categoryId || null
  }
  if ('isVeg' in (body ?? {})) {
    if (typeof body.isVeg !== 'boolean') return { error: 'Invalid food type.' }
    updates.is_veg = body.isVeg
  } else if (!partial) updates.is_veg = true
  if ('isAvailable' in (body ?? {})) {
    if (typeof body.isAvailable !== 'boolean') return { error: 'Invalid availability.' }
    updates.is_available = body.isAvailable
  } else if (!partial) updates.is_available = true
  if ('sortOrder' in (body ?? {})) {
    const sortOrder = parseSortOrder(body.sortOrder)
    if (sortOrder === null) return { error: 'Invalid sort order.' }
    updates.sort_order = sortOrder
  }
  return { updates }
}

async function categoryBelongsToRestaurant(supabase: any, restaurantId: string, categoryId: unknown) {
  if (!categoryId) return true
  const { data } = await supabase.from('categories').select('id').eq('id', categoryId).eq('restaurant_id', restaurantId).maybeSingle()
  return Boolean(data)
}

export async function POST(request: Request) {
  const unsafe = rejectUnsafeRequest(request); if (unsafe) return unsafe
  const auth = await getOwnedRestaurant(); if ('error' in auth) return auth.error
  const body = (await readJsonBody(request) ?? {})
  const parsed = dishInput(body)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
  if (!await categoryBelongsToRestaurant(auth.supabase, auth.restaurantId, body?.categoryId)) return NextResponse.json({ error: 'The selected category does not belong to your restaurant.' }, { status: 400 })
  const { data: last } = await auth.supabase.from('dishes').select('sort_order').eq('restaurant_id', auth.restaurantId).order('sort_order', { ascending: false }).limit(1).maybeSingle()
  const { data, error } = await auth.supabase.from('dishes').insert({ ...parsed.updates, restaurant_id: auth.restaurantId, sort_order: Math.min((last?.sort_order ?? -1) + 1, MENU_LIMITS.maxSortOrder) }).select('*').single()
  if (error) return menuDatabaseError(error)
  return NextResponse.json({ dish: data }, { status: 201 })
}

export async function PATCH(request: Request) {
  const unsafe = rejectUnsafeRequest(request); if (unsafe) return unsafe
  const auth = await getOwnedRestaurant(); if ('error' in auth) return auth.error
  const body = (await readJsonBody(request) ?? {})
  if (!isUuid(body?.id)) return NextResponse.json({ error: 'Invalid dish.' }, { status: 400 })
  const parsed = dishInput(body, true)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
  if (!Object.keys(parsed.updates).length) return NextResponse.json({ error: 'No valid changes supplied.' }, { status: 400 })
  if ('categoryId' in (body ?? {}) && !await categoryBelongsToRestaurant(auth.supabase, auth.restaurantId, body.categoryId)) return NextResponse.json({ error: 'The selected category does not belong to your restaurant.' }, { status: 400 })
  const { data, error } = await auth.supabase.from('dishes').update(parsed.updates).eq('id', body.id).eq('restaurant_id', auth.restaurantId).select('*').maybeSingle()
  if (error) return menuDatabaseError(error)
  if (!data) return NextResponse.json({ error: 'Dish not found.' }, { status: 404 })
  return NextResponse.json({ dish: data })
}

export async function DELETE(request: Request) {
  const unsafe = rejectUnsafeRequest(request); if (unsafe) return unsafe
  const auth = await getOwnedRestaurant(); if ('error' in auth) return auth.error
  const body = (await readJsonBody(request) ?? {})
  if (!isUuid(body?.id)) return NextResponse.json({ error: 'Invalid dish.' }, { status: 400 })
  const { data, error } = await auth.supabase.from('dishes').delete().eq('id', body.id).eq('restaurant_id', auth.restaurantId).select('id').maybeSingle()
  if (error) return menuDatabaseError(error)
  if (!data) return NextResponse.json({ error: 'Dish not found.' }, { status: 404 })
  return NextResponse.json({ deleted: data.id })
}
