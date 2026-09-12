import { readJsonBody } from '@/lib/request-security'
import { NextResponse } from 'next/server'
import { getOwnedRestaurant, menuDatabaseError, rejectUnsafeRequest } from '@/lib/menu-api'
import { cleanText, isUuid, MENU_LIMITS, parseSortOrder } from '@/lib/menu-validation'

export async function POST(request: Request) {
  const unsafe = rejectUnsafeRequest(request)
  if (unsafe) return unsafe
  const auth = await getOwnedRestaurant()
  if ('error' in auth) return auth.error
  const body = (await readJsonBody(request) ?? {})
  const name = cleanText(body?.name, MENU_LIMITS.categoryName)
  if (name.length < 1 || name.length > MENU_LIMITS.categoryName) return NextResponse.json({ error: 'Category name must be 1–80 characters.' }, { status: 400 })

  const { data: last } = await auth.supabase.from('categories').select('sort_order').eq('restaurant_id', auth.restaurantId).order('sort_order', { ascending: false }).limit(1).maybeSingle()
  const { data, error } = await auth.supabase.from('categories').insert({ restaurant_id: auth.restaurantId, name, sort_order: Math.min((last?.sort_order ?? -1) + 1, MENU_LIMITS.maxSortOrder) }).select('*').single()
  if (error) return menuDatabaseError(error)
  return NextResponse.json({ category: data }, { status: 201 })
}

export async function PATCH(request: Request) {
  const unsafe = rejectUnsafeRequest(request)
  if (unsafe) return unsafe
  const auth = await getOwnedRestaurant()
  if ('error' in auth) return auth.error
  const body = (await readJsonBody(request) ?? {})
  if (!isUuid(body?.id)) return NextResponse.json({ error: 'Invalid category.' }, { status: 400 })
  const updates: { name?: string; sort_order?: number } = {}
  if ('name' in (body ?? {})) {
    const name = cleanText(body.name, MENU_LIMITS.categoryName)
    if (!name || name.length > MENU_LIMITS.categoryName) return NextResponse.json({ error: 'Category name must be 1–80 characters.' }, { status: 400 })
    updates.name = name
  }
  if ('sortOrder' in (body ?? {})) {
    const sortOrder = parseSortOrder(body.sortOrder)
    if (sortOrder === null) return NextResponse.json({ error: 'Invalid sort order.' }, { status: 400 })
    updates.sort_order = sortOrder
  }
  if (!Object.keys(updates).length) return NextResponse.json({ error: 'No valid changes supplied.' }, { status: 400 })
  const { data, error } = await auth.supabase.from('categories').update(updates).eq('id', body.id).eq('restaurant_id', auth.restaurantId).select('*').maybeSingle()
  if (error) return menuDatabaseError(error)
  if (!data) return NextResponse.json({ error: 'Category not found.' }, { status: 404 })
  return NextResponse.json({ category: data })
}

export async function DELETE(request: Request) {
  const unsafe = rejectUnsafeRequest(request)
  if (unsafe) return unsafe
  const auth = await getOwnedRestaurant()
  if ('error' in auth) return auth.error
  const body = (await readJsonBody(request) ?? {})
  if (!isUuid(body?.id)) return NextResponse.json({ error: 'Invalid category.' }, { status: 400 })
  const { data, error } = await auth.supabase.from('categories').delete().eq('id', body.id).eq('restaurant_id', auth.restaurantId).select('id').maybeSingle()
  if (error) return menuDatabaseError(error)
  if (!data) return NextResponse.json({ error: 'Category not found.' }, { status: 404 })
  return NextResponse.json({ deleted: data.id })
}
