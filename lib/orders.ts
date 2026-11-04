export type OrderItem = { dish_name: string; quantity: number; line_total: number }
export type ServiceOrder = { id: string; order_number: number; customer_name: string; customer_phone?: string; customer_note?: string; status: string; version: number; currency: string; total: number; created_at: string; order_items: OrderItem[] }
export const ORDER_TRANSITIONS: Record<string, string[]> = { pending: ['confirmed', 'cancelled'], confirmed: ['preparing', 'cancelled'], preparing: ['ready', 'cancelled'], ready: ['completed', 'cancelled'], completed: [], cancelled: [] }
export function orderError(error: { code?: string; message?: string }) {
  const status = ({ '42501': 403, '22023': 400, P0404: 404, P0409: 409, '23505': 409, '40001': 409 } as Record<string, number>)[error.code || '']
  return { status: status || 503, error: status ? error.message || 'This order could not be updated.' : 'Ordering is temporarily unavailable. Refresh and try again.' }
}
