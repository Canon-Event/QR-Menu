type BillingAuth = { supabase: any; restaurantId: string }
import { NextResponse } from 'next/server'
import { rejectUnsafeRequest } from '@/lib/menu-api'
import { readJsonBody } from '@/lib/request-security'
import { indiaDate, UUID } from '@/lib/pos'
import { merchantFor, ProviderError } from '@/lib/pos-payments'
import { gateway, posError, reconcileRefund } from '@/lib/pos-server'

export async function billingGet(request: Request, auth: BillingAuth) {
  const search = new URL(request.url).searchParams
  const date = search.get('date') || indiaDate(), bill = search.get('bill')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || (bill && !UUID.test(bill))) return NextResponse.json({ error: 'Invalid billing filter.' }, { status: 400 })
  const { data, error } = await auth.supabase.rpc('pos_owner_action', { p_restaurant_id: auth.restaurantId, p_action: 'state', p_data: { date, ...(bill ? { bill_id: bill } : {}) } })
  if (error) return posError(error)
  return NextResponse.json(bill ? { bill: data } : { ...data, restaurantId: auth.restaurantId, gatewayReady: Boolean(merchantFor(auth.restaurantId)) }, { headers: { 'Cache-Control': 'no-store' } })
}
const actions = new Set(['settings', 'preview', 'issue', 'void', 'cash', 'refund', 'table_create', 'visit_open', 'visit_assign', 'visit_transfer', 'visit_close', 'kitchen_send', 'kitchen_move', 'close_day'])
export async function billingPost(request: Request, auth: BillingAuth) {
  const unsafe = rejectUnsafeRequest(request); if (unsafe) return unsafe
  const body = await readJsonBody(request)
  if (!body || !actions.has(body.action) || !body.data || typeof body.data !== 'object' || Array.isArray(body.data)) return NextResponse.json({ error: 'Invalid billing request.' }, { status: 400 })
  for (const field of ['bill_id', 'payment_id', 'table_id', 'visit_id', 'order_id', 'ticket_id', 'request_key']) if (field in body.data && !UUID.test(body.data[field])) return NextResponse.json({ error: 'Invalid record reference.' }, { status: 400 })
  for (const field of ['amount_paise', 'discount_paise', 'opening_paise', 'counted_paise']) if (field in body.data && (!Number.isSafeInteger(body.data[field]) || body.data[field] < 0 || body.data[field] > 1_000_000_000)) return NextResponse.json({ error: 'Invalid amount.' }, { status: 400 })
  if (['issue', 'cash', 'refund'].includes(body.action) && !UUID.test(body.data.request_key || '')) return NextResponse.json({ error: 'A request key is required.' }, { status: 400 })
  if (body.action === 'refund') {
    const { data: payment, error: accessError } = await auth.supabase.rpc('pos_refund_payment', { p_restaurant_id: auth.restaurantId, p_payment_id: body.data.payment_id })
    if (accessError) return posError(accessError)
    if (!payment) return NextResponse.json({ error: 'Payment not found.' }, { status: 404 })
    if (payment.method === 'razorpay' && merchantFor(auth.restaurantId)?.keyId !== payment.account_key_id) return NextResponse.json({ error: 'Connect the original payment account before requesting a refund.' }, { status: 503 })
  }
  const { data, error } = await auth.supabase.rpc('pos_owner_action', { p_restaurant_id: auth.restaurantId, p_action: body.action, p_data: body.data })
  if (error) return posError(error)
  if (body.action === 'refund' && data.method === 'razorpay' && data.state !== 'processed') {
    if (data.state === 'failed') return NextResponse.json({ error: 'The provider rejected that refund request. Submit a new request to try again.' }, { status: 409 })
    try { await reconcileRefund(auth.restaurantId, data) }
    catch (error) {
      if (error instanceof ProviderError && error.rejected && data.fresh) {
        await gateway('refund_rejected', { refund_id: data.id })
        return NextResponse.json({ error: 'The provider rejected the refund request. Check the payment account and available balance before trying again.' }, { status: 409 })
      }
      return NextResponse.json({ result: data, notice: 'Refund is awaiting provider confirmation. Refresh or retry this same request; it will not be issued twice.' }, { status: 202 })
    }
  }
  return NextResponse.json({ result: data })
}
