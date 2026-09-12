import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import OrdersBoard from '@/components/dashboard/OrdersBoard'

export default async function OrdersPage() {
  const supabase = await createSupabaseServerClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) redirect('/login?next=/dashboard/orders')
  const { data: restaurant } = await supabase.from('restaurants').select('id,name').eq('owner_id', user.id).limit(1).maybeSingle(); if (!restaurant) redirect('/dashboard/setup')
  const { data: orders } = await supabase.from('orders').select('id,order_number,customer_name,customer_phone,customer_note,status,currency,total,created_at,order_items(dish_name,quantity,line_total)').eq('restaurant_id', restaurant.id).order('created_at', { ascending: false }).limit(100)
  return <main className="analytics-page"><header className="analytics-header"><div><a href="/dashboard">← Dashboard</a><h1>Orders</h1><p>Manage incoming orders for {restaurant.name}.</p></div><a href="/dashboard/analytics">View analytics →</a></header><OrdersBoard initialOrders={(orders || []) as any} /></main>
}
