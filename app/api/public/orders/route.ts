import { createRateLimiter } from '@/lib/request-security'
import { rejectUnsafeRequest } from '@/lib/menu-api'
import { readJsonBody } from '@/lib/request-security'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { orderError } from '@/lib/orders'
import { accessToken, tableIpHash, tableResponse, tokenHash } from '@/lib/table-access-server'
import { UUID } from '@/lib/pos'

const rateLimited = createRateLimiter(300, 60_000)
export async function POST(request: Request) {
  const unsafe = rejectUnsafeRequest(request); if (unsafe) return unsafe
  let ip: string
  try { ip = tableIpHash(request) } catch { return NextResponse.json({ error: 'Ordering is not configured.' }, { status: 503 }) }
  if (rateLimited(ip)) return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429, headers: { 'Retry-After': '60' } })

  if (!request.headers.get('content-type')?.startsWith('application/json')) return NextResponse.json({ error: 'Invalid request.' }, { status: 415 })
  const origin = request.headers.get('origin'); if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: 'Invalid origin.' }, { status: 403 })
  const body = (await readJsonBody(request) ?? {})
  const name = typeof body?.customerName === 'string' ? body.customerName.trim().replace(/\s+/g, ' ') : ''
  const phone = typeof body?.phone === 'string' ? body.phone.trim() : ''
  const note = typeof body?.note === 'string' ? body.note.trim() : ''
  if (!/^[a-z0-9-]{3,50}$/.test(body?.slug || '') || !/^[0-9a-f-]{36}$/i.test(body?.idempotencyKey || '') || name.length < 2 || name.length > 100 || phone.length > 30 || note.length > 500 || !Array.isArray(body?.items) || body.items.length < 1 || body.items.length > 50) return NextResponse.json({ error: 'Please provide valid order details.' }, { status: 400 })
  if (body.tableScan != null && (typeof body.tableScan !== 'string' || !UUID.test(body.tableScan))) return NextResponse.json({ error: 'Invalid table scan.' }, { status: 400 })
  const quantities = new Map<string, number>()
  for (const item of body.items) { const qty = Number(item?.quantity); if (!/^[0-9a-f-]{36}$/i.test(item?.dishId || '') || !Number.isInteger(qty) || qty < 1 || qty > 99) return NextResponse.json({ error: 'Invalid order item.' }, { status: 400 }); quantities.set(item.dishId, (quantities.get(item.dishId) || 0) + qty) }
  if (Array.from(quantities.values()).some(quantity => quantity > 99)) return NextResponse.json({ error: 'Too many of the same dish.' }, { status: 400 })
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: 'Ordering is not configured.' }, { status: 503 })
  const admin = supabaseAdmin()
  const args = { p_slug: body.slug, p_key: body.idempotencyKey, p_name: name, p_phone: phone, p_note: note, p_items: Array.from(quantities, ([dishId, quantity]) => ({ dishId, quantity })) }
  let result
  try {
    result = await admin.rpc('orders_submit_table', { ...args, p_hash: tokenHash(accessToken(request, body.slug)), p_ip: ip, p_scan: body.tableScan || null })
    // Older opt-out installations keep working. The updated SQL engine itself
    // rejects unapproved requests whenever verification is enabled.
    if (['42883','PGRST202'].includes(result.error?.code || '')) result = await admin.rpc('orders_submit', args)
  } catch { return tableResponse({ error: 'Ordering is temporarily unavailable.', http_status: 503 }) }
  const { data, error } = result
  if (data?.http_status) return tableResponse(data)
  if (error) { const result = orderError(error); return NextResponse.json({ error: result.error }, { status: result.status }) }
  return NextResponse.json({ public_token: data.public_token, order_number: data.order_number }, { status: data.duplicate ? 200 : 201 })
}
