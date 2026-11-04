import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import OrdersBoard from '@/components/dashboard/OrdersBoard'

export default async function OrdersPage() {
  const supabase = await createSupabaseServerClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) redirect('/login?next=/dashboard/orders')
  const { data: restaurant } = await supabase.from('restaurants').select('id,name').eq('owner_id', user.id).limit(1).maybeSingle(); if (!restaurant) redirect('/dashboard/setup')
  const { data, error } = await supabase.rpc('orders_page', { p_restaurant_id: restaurant.id })
  const orders = (data?.orders || []).slice(0, 50)
  return <main className="analytics-page"><header className="analytics-header"><div><Link href="/dashboard">← Dashboard</Link><h1>Orders</h1><p>Manage incoming orders for {restaurant.name}.</p></div><Link href="/dashboard/analytics">View analytics →</Link></header><OrdersBoard initialOrders={(orders || []) as any} initialError={error ? 'Orders are unavailable. Check the order reliability migration and refresh.' : ''} /></main>
}
