import { readJsonBody } from '@/lib/request-security'
import { NextResponse } from 'next/server'
import { getOwnedRestaurant, menuDatabaseError, rejectUnsafeRequest } from '@/lib/menu-api'
import { isUuid } from '@/lib/menu-validation'

const statuses = ['pending','confirmed','preparing','ready','completed','cancelled']
export async function PATCH(request: Request) {
  const unsafe = rejectUnsafeRequest(request); if (unsafe) return unsafe
  const auth = await getOwnedRestaurant(); if ('error' in auth) return auth.error
  const body = (await readJsonBody(request) ?? {})
  if (!isUuid(body?.id) || !statuses.includes(body?.status)) return NextResponse.json({ error: 'Invalid order update.' }, { status: 400 })
  const { data, error } = await auth.supabase.from('orders').update({ status: body.status, updated_at: new Date().toISOString() }).eq('id', body.id).eq('restaurant_id', auth.restaurantId).select('*').maybeSingle()
  if (error) return menuDatabaseError(error)
  if (!data) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  return NextResponse.json({ order: data })
}
