import { NextResponse } from 'next/server'
import { UUID } from '@/lib/pos'
import { merchantFor, verifySignature, capturedPayment } from '@/lib/pos-payments'
import { gateway, syncRefund } from '@/lib/pos-server'

export async function POST(request: Request, context: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await context.params
  if (!UUID.test(restaurantId)) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  const account = merchantFor(restaurantId)
  if (!account) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  const reader = request.body?.getReader(); if (!reader) return NextResponse.json({ error: 'Missing payload.' }, { status: 400 })
  const chunks: Uint8Array[] = []; let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break
      size += value.byteLength
      if (size > 65536) { await reader.cancel(); return NextResponse.json({ error: 'Payload too large.' }, { status: 413 }) }
      chunks.push(value)
    }
    const raw = Buffer.concat(chunks).toString('utf8')
    if (!verifySignature(raw, request.headers.get('x-razorpay-signature'), account.webhookSecret)) return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 })
    const event = JSON.parse(raw)
    if (event.event === 'payment.captured') {
      const payment = event.payload?.payment?.entity
      if (!capturedPayment(payment, payment?.order_id, payment?.amount)) return NextResponse.json({ error: 'Invalid captured payment.' }, { status: 400 })
      const result = await gateway('capture', { restaurant_id: restaurantId, account_key_id: account.keyId, provider_order_id: payment.order_id, provider_payment_id: payment.id, amount_paise: payment.amount, currency: payment.currency })
      if (result.error) return NextResponse.json({ error: 'Payment could not be reconciled yet.' }, { status: 503 })
    } else if (['refund.created', 'refund.processed', 'refund.failed'].includes(event.event)) {
      await syncRefund(restaurantId, event.payload?.refund?.entity, account.keyId)
    }
    return NextResponse.json({ received: true })
  } catch { return NextResponse.json({ error: 'Webhook could not be processed. Retry delivery.' }, { status: 503 }) }
  finally { reader.releaseLock() }
}
