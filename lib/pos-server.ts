import 'server-only'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { merchantFor, provider } from '@/lib/pos-payments'
import type { Bill } from '@/lib/pos'

export function posError(error: { code?: string; message?: string }) {
  if (['42P01', '42883', 'PGRST202', 'PGRST205'].includes(error.code || '')) return NextResponse.json({ error: 'Billing has not been activated in this workspace. Follow the billing setup guide.', setupRequired: true }, { status: 503 })
  if (error.code === '42501') return NextResponse.json({ error: 'You do not have access to this restaurant.' }, { status: 403 })
  if (error.code === 'P0001') return NextResponse.json({ error: error.message || 'This billing action is unavailable.' }, { status: 409 })
  if (error.code === '23505' || error.code === '40001') return NextResponse.json({ error: 'This record changed or already exists. Refresh and try again.' }, { status: 409 })
  if (error.code?.startsWith('22') || error.code?.startsWith('23')) return NextResponse.json({ error: 'Please check the bill details and selected records.' }, { status: 400 })
  return NextResponse.json({ error: 'Billing is temporarily unavailable.' }, { status: 503 })
}
export async function gateway(action: string, data: Record<string, unknown>) {
  return supabaseAdmin().rpc('pos_gateway_action', { p_action: action, p_data: data })
}
// Explicit allowlist: tokens never expose staff IDs, request keys or gateway references.
export function publicBill(bill: Bill) {
  const { invoice_number, issued_at, seller, customer, lines, price_mode, tax_status, rate_bps, gross_paise, discount_paise, taxable_paise, cgst_paise, state_tax_paise, rounding_paise, total_paise, paid_paise, credited_paise, balance_paise, overpaid_paise } = bill
  return { invoice_number, issued_at, seller: { legal_name: seller.legal_name, address: seller.address, gstin: seller.gstin, state_code: seller.state_code, sac: seller.sac }, customer, lines, price_mode, tax_status, rate_bps, gross_paise, discount_paise, taxable_paise, cgst_paise, state_tax_paise, rounding_paise, total_paise, paid_paise, credited_paise, balance_paise, overpaid_paise, credits: bill.credits.map(c => ({ credit_number: c.credit_number, amount_paise: c.amount_paise, taxable_paise: c.taxable_paise, cgst_paise: c.cgst_paise, state_tax_paise: c.state_tax_paise, rounding_paise: c.rounding_paise, reason: c.reason, created_at: c.created_at })), payments: bill.payments.map(p => ({ method: p.method, amount_paise: p.amount_paise, created_at: p.created_at })) }
}
export async function syncRefund(restaurantId: string, entity: any, accountKey: string, refundId?: string) {
  if (!/^rfnd_[A-Za-z0-9]+$/.test(entity?.id || '') || !/^pay_[A-Za-z0-9]+$/.test(entity?.payment_id || '') || !Number.isSafeInteger(entity?.amount) || entity.amount <= 0 || entity.currency !== 'INR' || !['pending', 'processed', 'failed'].includes(entity?.status)) throw new Error('Invalid refund response.')
  const result = await gateway('refund_update', { restaurant_id: restaurantId, account_key_id: accountKey, provider_payment_id: entity.payment_id, provider_refund_id: entity.id, amount_paise: entity.amount, currency: entity.currency, state: entity.status, refund_id: refundId || entity.notes?.pos_refund_id || '' })
  if (result.error) throw new Error('Refund confirmation is pending.')
  return result.data
}
export async function reconcileRefund(restaurantId: string, refund: any) {
  const account = merchantFor(restaurantId)
  if (!account || account.keyId !== refund.account_key_id) throw new Error('The original payment account must be connected to refund this payment.')
  let entity
  if (refund.provider_refund_id) entity = await provider(account, `refunds/${refund.provider_refund_id}`)
  else if (refund.fresh) entity = await provider(account, `payments/${refund.provider_payment_id}/refund`, { amount: Number(refund.amount_paise), notes: { pos_refund_id: refund.id }, receipt: refund.id })
  else {
    // Never blindly repeat a money-moving POST after a timeout.
    const existing = await provider(account, `payments/${refund.provider_payment_id}/refunds?count=100`)
    entity = existing.items?.find((item: any) => item.notes?.pos_refund_id === refund.id)
    if (!entity) throw new Error('Refund confirmation is pending. The request will not be sent twice.')
  }
  if (entity.payment_id !== refund.provider_payment_id || entity.amount !== Number(refund.amount_paise)) throw new Error('Refund confirmation does not match the request.')
  return syncRefund(restaurantId, entity, account.keyId, refund.id)
}
