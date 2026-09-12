import { readJsonBody } from '@/lib/request-security'
import { NextResponse } from 'next/server'
import { getOwnedRestaurant, menuDatabaseError, rejectUnsafeRequest } from '@/lib/menu-api'
import { isUuid, parseQuantity, parseUnit } from '@/lib/menu-validation'

export async function PUT(request: Request) {
  const unsafe = rejectUnsafeRequest(request); if (unsafe) return unsafe
  const auth = await getOwnedRestaurant(); if ('error' in auth) return auth.error
  const body = (await readJsonBody(request) ?? {})
  if (!isUuid(body?.dishId) || !Array.isArray(body?.items) || body.items.length > 200) return NextResponse.json({ error: 'Invalid recipe.' }, { status: 400 })
  const { data: dish } = await auth.supabase.from('dishes').select('id').eq('id', body.dishId).eq('restaurant_id', auth.restaurantId).maybeSingle()
  if (!dish) return NextResponse.json({ error: 'Dish not found.' }, { status: 404 })

  const seen = new Set<string>()
  const items: Array<{ restaurant_id: string; dish_id: string; ingredient_id: string; quantity: number; unit: string }> = []
  for (const item of body.items) {
    const quantity = parseQuantity(item?.quantity)
    const unit = parseUnit(item?.unit)
    if (!isUuid(item?.ingredientId) || seen.has(item.ingredientId) || quantity === null || quantity <= 0 || !unit) return NextResponse.json({ error: 'Each recipe item needs a unique ingredient and a quantity greater than zero.' }, { status: 400 })
    seen.add(item.ingredientId)
    items.push({ restaurant_id: auth.restaurantId, dish_id: dish.id, ingredient_id: item.ingredientId, quantity, unit })
  }
  if (items.length) {
    const { data: ownedIngredients } = await auth.supabase.from('ingredients').select('id').eq('restaurant_id', auth.restaurantId).in('id', Array.from(seen))
    if ((ownedIngredients?.length ?? 0) !== items.length) return NextResponse.json({ error: 'One or more ingredients do not belong to your restaurant.' }, { status: 400 })
  }

  const { error: deleteError } = await auth.supabase.from('dish_ingredients').delete().eq('dish_id', dish.id).eq('restaurant_id', auth.restaurantId)
  if (deleteError) return menuDatabaseError(deleteError)
  if (!items.length) return NextResponse.json({ items: [] })
  const { data, error } = await auth.supabase.from('dish_ingredients').insert(items).select('*')
  if (error) return menuDatabaseError(error)
  return NextResponse.json({ items: data })
}
