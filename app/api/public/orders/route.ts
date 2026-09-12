import { createRateLimiter, clientIp } from '@/lib/request-security'
import { rejectUnsafeRequest } from '@/lib/menu-api'
import { readJsonBody } from '@/lib/request-security'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const rateLimited = createRateLimiter(10)
export async function POST(request: Request) {
  const unsafe = rejectUnsafeRequest(request); if (unsafe) return unsafe
  if (rateLimited(clientIp(request))) return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 })

  if (!request.headers.get('content-type')?.startsWith('application/json')) return NextResponse.json({ error: 'Invalid request.' }, { status: 415 })
  const origin = request.headers.get('origin'); if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: 'Invalid origin.' }, { status: 403 })
  const body = (await readJsonBody(request) ?? {})
  const name = typeof body?.customerName === 'string' ? body.customerName.trim().replace(/\s+/g, ' ') : ''
  const phone = typeof body?.phone === 'string' ? body.phone.trim() : ''
  const note = typeof body?.note === 'string' ? body.note.trim() : ''
  if (!/^[a-z0-9-]{3,50}$/.test(body?.slug || '') || !/^[0-9a-f-]{36}$/i.test(body?.idempotencyKey || '') || name.length < 2 || name.length > 100 || phone.length > 30 || note.length > 500 || !Array.isArray(body?.items) || body.items.length < 1 || body.items.length > 50) return NextResponse.json({ error: 'Please provide valid order details.' }, { status: 400 })
  const quantities = new Map<string, number>()
  for (const item of body.items) { const qty = Number(item?.quantity); if (!/^[0-9a-f-]{36}$/i.test(item?.dishId || '') || !Number.isInteger(qty) || qty < 1 || qty > 99) return NextResponse.json({ error: 'Invalid order item.' }, { status: 400 }); quantities.set(item.dishId, (quantities.get(item.dishId) || 0) + qty) }
  if (Array.from(quantities.values()).some(quantity => quantity > 99)) return NextResponse.json({ error: 'Too many of the same dish.' }, { status: 400 })
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: 'Ordering is not configured.' }, { status: 503 })
  const admin = supabaseAdmin()
  const { data: restaurant } = await admin.from('restaurants').select('id,currency').eq('slug', body.slug).eq('is_active', true).maybeSingle()
  if (!restaurant) return NextResponse.json({ error: 'Restaurant is not accepting orders.' }, { status: 404 })
  const { data: existing } = await admin.from('orders').select('public_token,order_number').eq('restaurant_id', restaurant.id).eq('idempotency_key', body.idempotencyKey).maybeSingle()
  if (existing) return NextResponse.json(existing)
  const ids = Array.from(quantities.keys())
  const { data: dishes } = await admin.from('dishes').select('id,name,price').eq('restaurant_id', restaurant.id).eq('is_available', true).in('id', ids)
  if (!dishes || dishes.length !== ids.length) return NextResponse.json({ error: 'One or more dishes are no longer available.' }, { status: 409 })
  const rows = dishes.map(dish => ({ dish_id: dish.id, dish_name: dish.name, unit_price: Number(dish.price), quantity: quantities.get(dish.id)!, line_total: Math.round(Number(dish.price) * quantities.get(dish.id)! * 100) / 100 }))
  const total = Math.round(rows.reduce((sum, row) => sum + row.line_total, 0) * 100) / 100
  const { data: order, error } = await admin.from('orders').insert({ restaurant_id: restaurant.id, idempotency_key: body.idempotencyKey, customer_name: name, customer_phone: phone || null, customer_note: note || null, currency: restaurant.currency, subtotal: total, total }).select('id,public_token,order_number').single()
  if (error || !order) return NextResponse.json({ error: 'Could not place your order.' }, { status: 503 })
  const { error: itemError } = await admin.from('order_items').insert(rows.map(row => ({ ...row, order_id: order.id, restaurant_id: restaurant.id })))
  if (itemError) { await admin.from('orders').delete().eq('id', order.id); return NextResponse.json({ error: 'Could not place your order.' }, { status: 503 }) }
  return NextResponse.json({ public_token: order.public_token, order_number: order.order_number }, { status: 201 })
}
