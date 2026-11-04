import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { formatCurrency } from '@/lib/currency'
import { financialSummary } from '@/lib/reporting'
import { money } from '@/lib/pos'

export default async function AnalyticsPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/dashboard/analytics')

  const { data: restaurant } = await supabase.from('restaurants').select('id,name,currency').eq('owner_id', user.id).limit(1).maybeSingle()
  if (!restaurant) redirect('/dashboard/setup')

  const since = new Date(Date.now() - 30 * 86400000).toISOString()
  const [{ count: visits }, { data: orders }, { data: items }] = await Promise.all([
    supabase.from('menu_visits').select('*', { count: 'exact', head: true }).eq('restaurant_id', restaurant.id).gte('created_at', since),
    supabase.from('orders').select('id,total,status,created_at').eq('restaurant_id', restaurant.id).gte('created_at', since),
    supabase.from('order_items').select('dish_name,quantity,line_total,orders!inner(status,created_at)').eq('restaurant_id', restaurant.id).gte('orders.created_at', since).neq('orders.status', 'cancelled'),
  ])

  const { summary } = await financialSummary(supabase, restaurant.id, since)
  const isSamplePreview = false
  const displayedOrders = orders || []
  const valid = displayedOrders.filter(order => order.status !== 'cancelled')
  const revenue = valid.reduce((sum, order) => sum + Number(order.total), 0)
  const average = valid.length ? revenue / valid.length : 0
  const popular = new Map<string, { quantity: number; revenue: number }>()
  for (const item of items || []) {
    const entry = popular.get(item.dish_name) || { quantity: 0, revenue: 0 }
    entry.quantity += item.quantity
    entry.revenue += Number(item.line_total)
    popular.set(item.dish_name, entry)
  }
  const top = Array.from(popular.entries()).sort((a, b) => b[1].quantity - a[1].quantity).slice(0, 8)

  return <main className="analytics-page">
    <header className="analytics-header"><div><Link href="/dashboard">&lt;- Dashboard</Link><h1>Analytics</h1><p>{isSamplePreview ? 'Sample performance for the last 30 days.' : 'Real performance for the last 30 days.'}</p></div><Link href="/dashboard/orders">Manage orders -&gt;</Link></header>
    {isSamplePreview && <p className="dashboard-sample-note">Sample data preview · your live data is unchanged</p>}
    <section className="analytics-metrics">
      <div><small>Menu visits</small><b>{visits || 0}</b></div>
      <div><small>Orders</small><b>{valid.length}</b></div>
      <div><small>Net payments received</small><b>{summary ? money(summary.net_collected_paise) : '—'}</b></div>
      <div><small>Average order value</small><b>{formatCurrency(average, restaurant.currency)}</b></div>
    </section>
    <p className="dashboard-sample-note">Order activity includes unpaid orders. Payments received exclude processed refunds and include GST. Outstanding balances below cover all issued invoices.</p>
    {summary ? <section className="analytics-metrics"><div><small>Payments received</small><b>{money(summary.collected_paise)}</b></div><div><small>Refunds processed</small><b>{money(summary.refunded_paise)}</b></div><div><small>Outstanding invoices · all time</small><b>{money(summary.outstanding_paise)}</b></div><div><small>Overpayments to refund</small><b>{money(summary.overpaid_paise)}</b></div></section> : <p role="status">Payment reporting is unavailable. Activate the billing and reporting migrations to see verified collections.</p>}
    <section className="analytics-panel"><h2>Most ordered dishes</h2>{top.length ? <div className="popular-table">{top.map(([name, stats], index) => <div key={name}><span>{index + 1}</span><b>{name}</b><small>{stats.quantity} ordered</small><strong>{formatCurrency(stats.revenue, restaurant.currency)} ordered value</strong></div>)}</div> : <div className="menu-empty"><b>No order activity yet.</b><p>Dishes will appear after customer orders.</p></div>}</section>
  </main>
}
