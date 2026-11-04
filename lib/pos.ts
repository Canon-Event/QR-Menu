export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function paise(value: unknown): number {
  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : ''
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(text)) throw new Error('Enter an amount with at most two decimal places.')
  const [whole, fraction = ''] = text.split('.')
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  if (!Number.isSafeInteger(amount) || amount > 1_000_000_000) throw new Error('Amount is too large.')
  return amount
}
export function money(value: number | string) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(value) / 100)
}
export function indiaDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}
export type PosSettings = {
  enabled: boolean; kitchen_enabled: boolean; legal_name: string; address: string; state_code: string; gstin: string
  tax_status: 'unregistered' | 'composition' | 'regular'; restaurant_class: 'standard' | 'specified'; price_mode: 'inclusive' | 'exclusive'; sac: string
}
export const defaultPosSettings: PosSettings = { enabled: false, kitchen_enabled: false, legal_name: '', address: '', state_code: '29', gstin: '', tax_status: 'unregistered', restaurant_class: 'standard', price_mode: 'inclusive', sac: '996331' }
export type Bill = {
  id: string; restaurant_id: string; public_token: string; invoice_number: string; issued_at: string
  seller: PosSettings; customer: { name: string; address: string; gstin: string; note: string }
  lines: { name: string; quantity: number; unit_paise: number }[]; price_mode: string; tax_status: string; rate_bps: number
  gross_paise: number; discount_paise: number; taxable_paise: number; cgst_paise: number; state_tax_paise: number; rounding_paise: number; total_paise: number
  paid_paise: number; credited_paise: number; balance_paise: number; overpaid_paise: number
  payments: { id: string; method: string; amount_paise: number; created_at: string }[]
  refunds: { id: string; payment_id: string; amount_paise: number; state: string; reason: string }[]
  credits: { credit_number: string; amount_paise: number; taxable_paise: number; cgst_paise: number; state_tax_paise: number; rounding_paise: number; reason: string; created_at: string }[]
}
export function stateTaxLabel(state: string) { return ['04', '26', '31', '35', '38'].includes(state) ? 'UTGST' : 'SGST' }
