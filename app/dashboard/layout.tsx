import type { ReactNode } from 'react'
import DashboardRouteShell from '@/components/dashboard/DashboardRouteShell'
import NotificationProvider from '@/components/notifications/NotificationProvider'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const client = await createSupabaseServerClient()
  const { data: { user } } = await client.auth.getUser()
  const { data: restaurant } = user ? await client.from('restaurants').select('id').eq('owner_id', user.id).limit(1).maybeSingle() : { data: null }
  const content = <DashboardRouteShell>{children}</DashboardRouteShell>
  return user && restaurant ? <NotificationProvider key={`${user.id}:${restaurant.id}`} userId={user.id} restaurantId={restaurant.id}>{content}</NotificationProvider> : content
}
