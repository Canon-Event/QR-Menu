import { readJsonBody } from '@/lib/request-security'
import { NextResponse } from 'next/server'
import { getOwnedRestaurant, menuDatabaseError, rejectUnsafeRequest } from '@/lib/menu-api'
import { cleanText, isUuid, MENU_LIMITS, parseQuantity, parseUnit } from '@/lib/menu-validation'

function ingredientInput(body: any, partial = false) {
  const updates: Record<string, unknown> = {}
  if (!partial || 'name' in (body ?? {})) {
    const name = cleanText(body?.name, MENU_LIMITS.ingredientName)
    if (!name || name.length > MENU_LIMITS.ingredientName) return { error: 'Ingredient name must be 1–100 characters.' }
    updates.name = name
  }
  if (!partial || 'quantity' in (body ?? {})) {
    const quantity = parseQuantity(body?.quantity)
    if (quantity === null) return { error: 'Enter a valid non-negative stock quantity.' }
    updates.quantity = quantity
  }
  if (!partial || 'unit' in (body ?? {})) {
    const unit = parseUnit(body?.unit)
    if (!unit) return { error: 'Select a valid unit.' }
    updates.unit = unit
  }
  if (!partial || 'lowStockThreshold' in (body ?? {})) {
    const threshold = parseQuantity(body?.lowStockThreshold)
    if (threshold === null) return { error: 'Enter a valid non-negative low-stock threshold.' }
    updates.low_stock_threshold = threshold
  }
  if ('isActive' in (body ?? {})) {
    if (typeof body.isActive !== 'boolean') return { error: 'Invalid active status.' }
    updates.is_active = body.isActive
  } else if (!partial) updates.is_active = true
  updates.updated_at = new Date().toISOString()
  return { updates }
}

export async function POST(request: Request) {
  const unsafe = rejectUnsafeRequest(request); if (unsafe) return unsafe
  const auth = await getOwnedRestaurant(); if ('error' in auth) return auth.error
  const body = (await readJsonBody(request) ?? {})
  const parsed = ingredientInput(body)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const { data, error } = await auth.supabase.from('ingredients').insert({ ...parsed.updates, restaurant_id: auth.restaurantId }).select('*').single()
  if (error) return menuDatabaseError(error)
  return NextResponse.json({ ingredient: data }, { status: 201 })
}

export async function PATCH(request: Request) {
  const unsafe = rejectUnsafeRequest(request); if (unsafe) return unsafe
  const auth = await getOwnedRestaurant(); if ('error' in auth) return auth.error
  const body = (await readJsonBody(request) ?? {})
  if (!isUuid(body?.id)) return NextResponse.json({ error: 'Invalid ingredient.' }, { status: 400 })
  const parsed = ingredientInput(body, true)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
  if (Object.keys(parsed.updates).length === 1) return NextResponse.json({ error: 'No valid changes supplied.' }, { status: 400 })
  const { data, error } = await auth.supabase.from('ingredients').update(parsed.updates).eq('id', body.id).eq('restaurant_id', auth.restaurantId).select('*').maybeSingle()
  if (error) return menuDatabaseError(error)
  if (!data) return NextResponse.json({ error: 'Ingredient not found.' }, { status: 404 })
  return NextResponse.json({ ingredient: data })
}

export async function DELETE(request: Request) {
  const unsafe = rejectUnsafeRequest(request); if (unsafe) return unsafe
  const auth = await getOwnedRestaurant(); if ('error' in auth) return auth.error
  const body = (await readJsonBody(request) ?? {})
  if (!isUuid(body?.id)) return NextResponse.json({ error: 'Invalid ingredient.' }, { status: 400 })
  const { data, error } = await auth.supabase.from('ingredients').delete().eq('id', body.id).eq('restaurant_id', auth.restaurantId).select('id').maybeSingle()
  if (error) return menuDatabaseError(error)
  if (!data) return NextResponse.json({ error: 'Ingredient not found.' }, { status: 404 })
  return NextResponse.json({ deleted: data.id })
}
