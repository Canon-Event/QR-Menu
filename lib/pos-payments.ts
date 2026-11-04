import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'

export type Merchant = { keyId: string; keySecret: string; webhookSecret: string }
export function merchantFor(restaurantId: string): Merchant | null {
  try {
    const account = JSON.parse(process.env.POS_RAZORPAY_ACCOUNTS || '{}')[restaurantId]
    if (!account || !/^rzp_(test|live)_[A-Za-z0-9]+$/.test(account.keyId) || typeof account.keySecret !== 'string' || account.keySecret.length < 16 || typeof account.webhookSecret !== 'string' || account.webhookSecret.length < 16) return null
    return { keyId: account.keyId, keySecret: account.keySecret, webhookSecret: account.webhookSecret }
  } catch { return null }
}
export function verifySignature(body: string, signature: string | null, secret: string) {
  if (!signature || !/^[a-f0-9]{64}$/i.test(signature)) return false
  const expected = createHmac('sha256', secret).update(body, 'utf8').digest()
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'))
}
export class ProviderError extends Error {
  constructor(public rejected: boolean) { super('The payment provider could not complete the request.') }
}
export async function provider(account: Merchant, path: string, body?: Record<string, unknown>) {
  let response: Response
  try {
    response = await fetch(`https://api.razorpay.com/v1/${path}`, {
      method: body ? 'POST' : 'GET', cache: 'no-store', signal: AbortSignal.timeout(15_000),
      headers: { Authorization: `Basic ${Buffer.from(`${account.keyId}:${account.keySecret}`).toString('base64')}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
  } catch { throw new ProviderError(false) }
  if (!response.ok) throw new ProviderError([400, 401, 403, 404, 422].includes(response.status))
  try { return await response.json() } catch { throw new ProviderError(false) }
}
export function capturedPayment(payment: any, orderId: string, amount: number) {
  return payment?.status === 'captured' && payment?.captured === true && payment?.order_id === orderId && payment?.currency === 'INR' && Number.isSafeInteger(payment?.amount) && payment.amount === amount && /^pay_[A-Za-z0-9]+$/.test(payment?.id || '')
}
