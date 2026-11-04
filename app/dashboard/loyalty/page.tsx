import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import LoyaltyDashboard from '@/components/loyalty/LoyaltyDashboard'
import type { Restaurant } from '@/types'

export default async function LoyaltyPage({ searchParams }: { searchParams: Promise<{ member?: string }> }) {
  const client = await createSupabaseServerClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) redirect('/login?next=/dashboard/loyalty')
  const { data: restaurant } = await client.from('restaurants').select('*').eq('owner_id', user.id).limit(1).maybeSingle()
  if (!restaurant) redirect('/dashboard/setup')
  return <LoyaltyDashboard restaurant={restaurant as Restaurant} phoneReady={process.env.LOYALTY_PHONE_AUTH_ENABLED === 'true'} initialMember={(await searchParams).member || ''} />
}
