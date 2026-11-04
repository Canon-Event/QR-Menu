import { NextResponse } from 'next/server'
import { rejectUnsafeRequest } from '@/lib/menu-api'
import { createRateLimiter, clientIp, readJsonBody } from '@/lib/request-security'
import { UUID } from '@/lib/pos'
import { merchantFor, provider, verifySignature, capturedPayment } from '@/lib/pos-payments'
import { gateway, posError } from '@/lib/pos-server'

const limited = createRateLimiter(60)
export async function POST(request: Request) {
  const unsafe = rejectUnsafeRequest(request); if (unsafe) return unsafe
  if (limited(clientIp(request))) return NextResponse.json({ error: 'Please wait before checking this payment again.' }, { status: 429 })
  const body = await readJsonBody(request)
  if (!UUID.test(body?.token || '') || !UUID.test(body?.checkoutId || '') || !/^pay_[A-Za-z0-9]+$/.test(body?.paymentId || '')) return NextResponse.json({ error: 'Invalid payment reference.' }, { status: 400 })
  const [lookup, attempt] = await Promise.all([gateway('lookup', { token: body!.token }), gateway('checkout_get', { checkout_id: body!.checkoutId })])
  if (lookup.error || attempt.error || lookup.data.id !== attempt.data.bill_id) return NextResponse.json({ error: 'Payment reference not found.' }, { status: 404 })
  const account = merchantFor(lookup.data.restaurant_id), checkout = attempt.data
  if (!account || account.keyId !== checkout.account_key_id) return NextResponse.json({ error: 'Payment verification is temporarily unavailable.' }, { status: 503 })
  if (!verifySignature(`${checkout.provider_order_id}|${body!.paymentId}`, body!.signature, account.keySecret)) return NextResponse.json({ error: 'Invalid payment signature.' }, { status: 400 })
  try {
    const payment = await provider(account, `payments/${body!.paymentId}`)
    if (!capturedPayment(payment, checkout.provider_order_id, Number(checkout.amount_paise))) return NextResponse.json({ pending: true, message: 'Payment is awaiting confirmation. Your bill will update automatically.' }, { status: 202 })
    const applied = await gateway('capture', { restaurant_id: lookup.data.restaurant_id, account_key_id: account.keyId, provider_order_id: checkout.provider_order_id, provider_payment_id: payment.id, amount_paise: payment.amount, currency: payment.currency })
    if (applied.error) return posError(applied.error)
    return NextResponse.json({ confirmed: true })
  } catch { return NextResponse.json({ pending: true, message: 'Payment confirmation is delayed. Your bill will update automatically.' }, { status: 202 }) }
}
