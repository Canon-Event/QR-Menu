import { NextResponse } from 'next/server'
import { rejectUnsafeRequest } from '@/lib/menu-api'
import { createRateLimiter, clientIp, readJsonBody } from '@/lib/request-security'
import { UUID } from '@/lib/pos'
import { merchantFor, provider, ProviderError } from '@/lib/pos-payments'
import { gateway, posError } from '@/lib/pos-server'

const limited = createRateLimiter(30)
export async function POST(request: Request) {
  const unsafe = rejectUnsafeRequest(request); if (unsafe) return unsafe
  if (limited(clientIp(request))) return NextResponse.json({ error: 'Too many payment attempts. Try again shortly.' }, { status: 429 })
  const body = await readJsonBody(request)
  if (!UUID.test(body?.token || '') || !UUID.test(body?.request_key || '')) return NextResponse.json({ error: 'Invalid payment request.' }, { status: 400 })
  const lookup = await gateway('lookup', { token: body!.token })
  if (lookup.error) return NextResponse.json({ error: 'Bill not found.' }, { status: 404 })
  const account = merchantFor(lookup.data.restaurant_id)
  if (!account) return NextResponse.json({ error: 'Online payments are not connected for this restaurant.' }, { status: 503 })
  const reserved = await gateway('checkout', { token: body!.token, request_key: body!.request_key, account_key_id: account.keyId })
  if (reserved.error) return posError(reserved.error)
  const checkout = reserved.data
  if (checkout.fresh) {
    try {
      const order = await provider(account, 'orders', { amount: Number(checkout.amount_paise), currency: 'INR', receipt: checkout.id, notes: { pos_checkout_id: checkout.id } })
      if (!/^order_[A-Za-z0-9]+$/.test(order.id || '') || order.amount !== Number(checkout.amount_paise) || order.currency !== 'INR') throw new ProviderError(false)
      const attached = await gateway('attach', { checkout_id: checkout.id, account_key_id: account.keyId, provider_order_id: order.id })
      if (attached.error) return posError(attached.error)
      checkout.provider_order_id = order.id
    } catch (error) {
      if (error instanceof ProviderError && error.rejected) await gateway('checkout_failed', { checkout_id: checkout.id })
      return NextResponse.json({ error: 'Payment setup is awaiting confirmation. Please try again shortly.' }, { status: 503 })
    }
  }
  if (!checkout.provider_order_id && !checkout.fresh) {
    // A lost POST response is ambiguous. Find the existing order by our unique
    // receipt instead of issuing another POST or trusting a browser reference.
    try {
      const existing = await provider(account, `orders?receipt=${encodeURIComponent(checkout.id)}&count=100`)
      const matches = existing.items?.filter((o: any) => o.receipt === checkout.id && o.notes?.pos_checkout_id === checkout.id && o.amount === Number(checkout.amount_paise) && o.currency === 'INR' && /^order_[A-Za-z0-9]+$/.test(o.id || ''))
      if (matches?.length === 1) {
        const attached = await gateway('attach', { checkout_id: checkout.id, account_key_id: account.keyId, provider_order_id: matches[0].id })
        if (attached.error) return posError(attached.error)
        checkout.provider_order_id = matches[0].id
      }
    } catch { /* The same attempt remains reserved until reconciliation succeeds. */ }
  }
  if (!checkout.provider_order_id) return NextResponse.json({ error: 'A payment request is already being prepared. Please try again shortly.' }, { status: 409 })
  return NextResponse.json({ checkoutId: checkout.id, orderId: checkout.provider_order_id, keyId: account.keyId, amount: Number(checkout.amount_paise), currency: 'INR', name: lookup.data.seller.legal_name })
}
