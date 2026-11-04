import { NextResponse } from 'next/server'
import { staffAuth } from '@/lib/staff-server'
import { rejectUnsafeRequest } from '@/lib/menu-api'
import { readJsonBody } from '@/lib/request-security'
import { UUID } from '@/lib/pos'
import { posError } from '@/lib/pos-server'
import { getOrderFeed } from '@/lib/order-feed'
export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  const auth = await staffAuth(request); if ('error' in auth) return auth.error
  return getOrderFeed(auth.supabase, auth.restaurantId, request)
}
export async function PATCH(request: Request) {
  const unsafe = rejectUnsafeRequest(request); if (unsafe) return unsafe
  const auth = await staffAuth(request); if ('error' in auth) return auth.error
  const body = await readJsonBody(request)
  if (!body || !UUID.test(body.id || '') || !Number.isInteger(body.version) || !['pending','confirmed','preparing','ready','completed','cancelled'].includes(body.status)) return NextResponse.json({ error: 'Invalid order update.' }, { status: 400 })
  const { data, error } = await auth.supabase.rpc('orders_change', { p_restaurant_id: auth.restaurantId, p_order_id: body.id, p_version: body.version, p_status: body.status, p_reason: typeof body.reason === 'string' ? body.reason.slice(0,300) : '' })
  // Match the staff read projection; do not return contact details, public bearer
  // tokens, replay keys or fingerprints from the full owner RPC response.
  const order = data && Object.fromEntries(['id','order_number','customer_name','customer_note','status','version','currency','total','created_at','order_items'].map(key => [key,data[key]]))
  if (order) order.order_items = (data.order_items || []).map((item: any) => ({ dish_name: item.dish_name, quantity: item.quantity, line_total: item.line_total }))
  return error ? posError(error) : NextResponse.json({ order })
}
