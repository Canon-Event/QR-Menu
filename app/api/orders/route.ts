import { readJsonBody } from '@/lib/request-security'
import { NextResponse } from 'next/server'
import { getOwnedRestaurant, menuDatabaseError, rejectUnsafeRequest } from '@/lib/menu-api'
import { isUuid } from '@/lib/menu-validation'
import { orderError } from '@/lib/orders'
import { getOrderFeed } from '@/lib/order-feed'

const statuses = ['pending','confirmed','preparing','ready','completed','cancelled']
export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  const auth = await getOwnedRestaurant(); if ('error' in auth) return auth.error
  return getOrderFeed(auth.supabase, auth.restaurantId, request)
}
export async function PATCH(request: Request) {
  const unsafe = rejectUnsafeRequest(request); if (unsafe) return unsafe
  const auth = await getOwnedRestaurant(); if ('error' in auth) return auth.error
  const body = (await readJsonBody(request) ?? {})
  if (!isUuid(body?.id) || !statuses.includes(body?.status) || !Number.isInteger(body?.version)) return NextResponse.json({ error: 'Invalid order update.' }, { status: 400 })
  const { data, error } = await auth.supabase.rpc('orders_change', { p_restaurant_id: auth.restaurantId, p_order_id: body.id, p_version: body.version, p_status: body.status, p_reason: typeof body.reason === 'string' ? body.reason.slice(0,300) : '' })
  if (error) { const result = orderError(error); return NextResponse.json({ error: result.error }, { status: result.status }) }
  return NextResponse.json({ order: data })
}
