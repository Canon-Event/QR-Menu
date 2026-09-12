import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import { formatCurrency } from '@/lib/currency'

export const dynamic = 'force-dynamic'
export default async function OrderConfirmationPage({ params }: { params: Promise<{ token: string }> }) {
  if (!/^[0-9a-f-]{36}$/i.test((await params).token) || !process.env.SUPABASE_SERVICE_ROLE_KEY) notFound()
  const admin = supabaseAdmin()
  const { data: order } = await admin.from('orders').select('id,order_number,customer_name,status,currency,total,created_at,restaurant_id').eq('public_token', (await params).token).maybeSingle()
  if (!order) notFound()
  const [{ data: restaurant }, { data: items }] = await Promise.all([admin.from('restaurants').select('name,slug').eq('id', order.restaurant_id).single(), admin.from('order_items').select('dish_name,quantity,line_total').eq('order_id', order.id).order('dish_name')])
  const labels: Record<string, string> = { pending: 'Order received', confirmed: 'Confirmed', preparing: 'Preparing', ready: 'Ready for pickup', completed: 'Completed', cancelled: 'Cancelled' }
  return <main className="order-confirmation-page"><section><div className={`order-confirmation-icon ${order.status}`}>{order.status === 'cancelled' ? '×' : '✓'}</div><p className="dashboard-kicker">Order #{order.order_number}</p><h1>{labels[order.status] || 'Order received'}</h1><p>Thanks, {order.customer_name}. {restaurant?.name} has received your order.</p><div className="confirmation-items">{(items || []).map((item, index) => <div key={index}><span>{item.quantity} × {item.dish_name}</span><b>{formatCurrency(item.line_total, order.currency)}</b></div>)}<div className="confirmation-total"><span>Total</span><b>{formatCurrency(order.total, order.currency)}</b></div></div><p className="confirmation-help">Save this page to check your latest order status.</p><a href={`/menu/${restaurant?.slug}`}>Back to menu</a></section></main>
}
