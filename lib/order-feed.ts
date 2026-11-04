import { NextResponse } from 'next/server'
import { UUID } from '@/lib/pos'
import { orderError } from '@/lib/orders'
export function orderPageResult(data: any) {
  const orders = (data?.orders || []).slice(0, 50), last = orders.at(-1)
  return { ...data, orders, next_cursor: data?.orders?.length > 50 && last ? Buffer.from(JSON.stringify([last.created_at, last.id])).toString('base64url') : null }
}
export async function getOrderFeed(client: any, restaurantId: string, request?: Request) {
  const q = new URL(request?.url || 'https://local/orders').searchParams
  let cursor: [string, string] | null = null
  try {
    if (q.has('cursor')) {
      if ((q.get('cursor') || '').length > 200) throw new Error()
      cursor = JSON.parse(Buffer.from(q.get('cursor')!, 'base64url').toString('utf8'))
      if (!Array.isArray(cursor) || cursor.length !== 2 || !UUID.test(cursor[1]) || typeof cursor[0] !== 'string' || !Number.isFinite(Date.parse(cursor[0]))) throw new Error()
    }
    if (q.has('id') && !UUID.test(q.get('id')!)) throw new Error()
  } catch { return NextResponse.json({ error: 'Invalid order cursor or identifier.' }, { status: 400 }) }
  const { data, error } = await client.rpc('orders_page', { p_restaurant_id: restaurantId, p_history: q.get('history') === 'true', p_cursor_time: cursor?.[0] || null, p_cursor_id: cursor?.[1] || null, p_id: q.get('id') || null })
  if (error) { const failure = orderError(error); return NextResponse.json({ error: failure.error }, { status: failure.status }) }
  return NextResponse.json(orderPageResult(data), { headers: { 'Cache-Control': 'no-store' } })
}
