export const NOTIFICATION_CATEGORIES = ['orders', 'kitchen', 'inventory', 'staff', 'feedback', 'billing'] as const
export type NotificationPreferences = { sound_enabled: boolean; volume: number; push_enabled: boolean; categories: string[] }
export type NotificationSettings = { reminders_enabled: boolean; first_seconds: number; escalation_seconds: number; repeat_seconds: number; max_repeats: number; feedback_threshold: number }
export type InboxItem = { id: string; cursor: string; read_at: string | null; type: string; category: string; severity: 'info' | 'warning' | 'urgent'; metadata: Record<string, unknown>; created_at: string; resource_id: string; resource_kind: string; actionable: boolean }
export type NotificationFeed = { items: InboxItem[]; head: string; unread: number; server_time: string; preferences: NotificationPreferences; settings: NotificationSettings | null; pushConfigured?: boolean; pushPublicKey?: string }
export const DEFAULT_PREFERENCES: NotificationPreferences = { sound_enabled: false, volume: .35, push_enabled: false, categories: [...NOTIFICATION_CATEGORIES] }
const titles: Record<string, string> = {
  'order.new': 'New order', 'order.reminder': 'Order awaiting acceptance', 'order.escalation': 'Pending order needs a manager',
  'order.ready': 'Ready to serve', 'order.cancelled': 'Order cancelled', 'kitchen.new': 'New kitchen ticket',
  'kitchen.cancelled': 'Kitchen ticket cancelled', 'kitchen.changed': 'Kitchen ticket changed', 'inventory.low': 'Low stock',
  'leave.new': 'New leave request', 'feedback.poor': 'Customer feedback needs attention', 'refund.failed': 'Refund failed',
  'payment.discrepancy': 'Payment reconciliation needed', 'cash.discrepancy': 'Cash closing difference',
}
export function notificationTitle(item: Pick<InboxItem, 'type' | 'metadata'>) {
  const title = titles[item.type] || 'Restaurant update'
  return item.metadata.order_number ? `${title} · #${item.metadata.order_number}` : title
}
export function notificationDescription(item: Pick<InboxItem, 'type' | 'metadata' | 'actionable'>) {
  if (!item.actionable) return 'This work is no longer outstanding. Open for details.'
  if (item.type === 'inventory.low') return `${String(item.metadata.name || 'Ingredient')}: ${item.metadata.quantity} ${item.metadata.unit} remaining.`
  if (item.type === 'feedback.poor') return `${item.metadata.rating}/5 rating. Review the customer’s feedback.`
  if (item.type === 'order.escalation') return 'Still pending. A manager should review and accept or cancel this order.'
  if (item.type === 'order.ready') return 'Collect from the kitchen and serve the guest.'
  if (typeof item.metadata.item_count === 'number') return `${item.metadata.item_count} items${typeof item.metadata.table === 'string' ? ` · ${item.metadata.table}` : ' · No table assigned'}. Open the order for details.`
  if (typeof item.metadata.reason === 'string') return item.metadata.reason
  return 'Open the record to review and take action.'
}
export function notificationHref(restaurant: string, id: string, ownerView = false) { return ownerView ? `/dashboard/notifications/${id}` : `/staff/${restaurant}/notifications/${id}` }
export function freshAudible(items: InboxItem[], prefs: NotificationPreferences, serverTime: string) {
  const now = Date.parse(serverTime)
  return items.filter(item => !item.read_at && item.actionable && prefs.categories.includes(item.category)
    && now - Date.parse(item.created_at) < 60_000 && now >= Date.parse(item.created_at))
    .sort((a, b) => Number(b.severity === 'urgent') - Number(a.severity === 'urgent'))
}
export function notificationBackoff(failures: number) { return Math.min(60_000, 5000 * 2 ** Math.min(failures, 4)) }
export function safeInternalHref(value: unknown): value is string {
  return typeof value === 'string' && /^\/(dashboard|staff)(\/|\?|$)/.test(value) && !/[\\\u0000-\u001f]/.test(value)
}
