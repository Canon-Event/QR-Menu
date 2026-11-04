import { NextResponse } from 'next/server'
import { UUID } from '@/lib/pos'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!UUID.test(token) || !process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ billToken: null })
  const db = supabaseAdmin()
  const { data: order } = await db.from('orders').select('id,restaurant_id').eq('public_token', token).maybeSingle()
  if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  const { data: link } = await db.from('pos_bill_orders').select('bill_id').eq('order_id', order.id).eq('restaurant_id', order.restaurant_id).eq('active', true).maybeSingle()
  const { data: bill } = link ? await db.from('pos_bills').select('public_token').eq('id', link.bill_id).eq('restaurant_id', order.restaurant_id).maybeSingle() : { data: null }
  return NextResponse.json({ billToken: bill?.public_token || null }, { headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow' } })
}
