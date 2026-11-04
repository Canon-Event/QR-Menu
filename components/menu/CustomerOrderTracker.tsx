'use client'
import { useEffect, useState } from 'react'
import { formatCurrency } from '@/lib/currency'
import OrderBillLink from '@/components/billing/OrderBillLink'
export type CustomerOrder = { order_number: number; status: string; kitchen_status?: string | null; updated_at: string; currency: string; total: number; restaurant_name: string; slug: string; items: { dish_name: string; quantity: number; line_total: number }[] }
const labels: Record<string, string> = { pending: 'Order received', confirmed: 'Confirmed', preparing: 'Preparing', ready: 'Ready to serve', completed: 'Completed', cancelled: 'Cancelled' }
export default function CustomerOrderTracker({ token, initial }: { token: string; initial: CustomerOrder }) {
  const [order, setOrder] = useState(initial), [error, setError] = useState(''), [unavailable, setUnavailable] = useState(false)
  useEffect(() => {
    let active = true, timer: ReturnType<typeof setTimeout>, failures = 0, terminal = ['completed','cancelled'].includes(initial.status), running = false, revoked = false
    const controller = new AbortController()
    const refresh = async () => {
      if (!active || running || document.hidden || revoked) return
      running = true
      const requestController = new AbortController(), cancel = () => requestController.abort()
      controller.signal.addEventListener('abort', cancel, { once: true })
      const deadline = setTimeout(cancel, 12000)
      try {
        const response = await fetch(`/api/public/orders/${token}`, { cache: 'no-store', signal: requestController.signal }), result = await response.json()
        if (!active) return
        if (response.status === 404 || response.status === 410) { revoked = true; setUnavailable(true); return }
        if (!response.ok) throw new Error(result.error || 'Status could not be refreshed.')
        setOrder(result.order); terminal = ['completed','cancelled'].includes(result.order.status); failures = 0; setError('')
      } catch (err) { if (active) { failures++; setError(requestController.signal.aborted ? 'Status check timed out. Retrying automatically.' : err instanceof Error ? err.message : 'Connection interrupted. Retrying automatically.') } }
      finally { running = false; clearTimeout(deadline); controller.signal.removeEventListener('abort', cancel) }
    }
    const schedule = () => { clearTimeout(timer); if (!active || revoked) return; timer = setTimeout(async () => { await refresh(); schedule() }, failures ? Math.min(60000, 5000 * 2 ** Math.min(failures, 4)) : terminal ? 60000 : 5000) }
    const wake = () => { if (!document.hidden) void refresh().finally(schedule) }
    void refresh().finally(schedule)
    window.addEventListener('online', wake); window.addEventListener('focus', wake); document.addEventListener('visibilitychange', wake)
    return () => { active = false; controller.abort(); clearTimeout(timer); window.removeEventListener('online', wake); window.removeEventListener('focus', wake); document.removeEventListener('visibilitychange', wake) }
  }, [token, initial.status])
  if (unavailable) return <main className="order-confirmation-page"><section><h1>Tracking link unavailable</h1><p>This link was revoked or the order is no longer available. Ask the restaurant for help.</p></section></main>
  return <main className="order-confirmation-page"><section><div className={`order-confirmation-icon ${order.status}`}>{order.status === 'cancelled' ? '×' : '✓'}</div><p className="dashboard-kicker">Order #{order.order_number}</p><h1 aria-live="polite">{labels[order.status] || 'Order received'}</h1><p>{order.restaurant_name} has received your order.</p>
    {order.status !== 'cancelled' && order.kitchen_status && <p role="status">Kitchen: {({ queued: 'In the queue', preparing: 'Preparing your food', ready: 'Ready to serve', served: 'Served', cancelled: 'Please speak with the restaurant' } as Record<string,string>)[order.kitchen_status]}</p>}
    {error && <p role="status">{error} Your last known status is shown.</p>}
    <div className="confirmation-items">{order.items.map((item, index) => <div key={index}><span>{item.quantity} × {item.dish_name}</span><b>{formatCurrency(item.line_total, order.currency)}</b></div>)}<div className="confirmation-total"><span>Total</span><b>{formatCurrency(order.total, order.currency)}</b></div></div>
    <OrderBillLink orderToken={token} /><p className="confirmation-help">Status updates automatically. Keep this private link to check your order.</p><a href={`/menu/${order.slug}`}>Back to menu</a>
  </section></main>
}
