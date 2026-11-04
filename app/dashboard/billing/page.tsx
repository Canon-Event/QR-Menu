import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import PosDashboard from '@/components/billing/PosDashboard'

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const client = await createSupabaseServerClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) redirect('/login?next=/dashboard/billing')
  const { data: restaurant } = await client.from('restaurants').select('id,name,address,currency').eq('owner_id', user.id).limit(1).maybeSingle()
  if (!restaurant) redirect('/dashboard/setup')
  const { data: dishes } = await client.from('dishes').select('id,name,price').eq('restaurant_id', restaurant.id).eq('is_available', true).order('name').limit(1000)
  return <PosDashboard restaurant={restaurant} dishes={dishes || []} initialTab={(await searchParams).tab} />
}
