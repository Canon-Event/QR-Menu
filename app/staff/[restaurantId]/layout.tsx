import type { ReactNode } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import NotificationProvider from '@/components/notifications/NotificationProvider'
import { UUID } from '@/lib/pos'

export default async function StaffRestaurantLayout({ children, params }: { children: ReactNode; params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params
  if (!UUID.test(restaurantId)) redirect('/staff')
  const client = await createSupabaseServerClient(), { data: { user } } = await client.auth.getUser()
  if (!user) redirect('/login?next=/staff')
  const { data: contexts } = await client.rpc('team_context')
  if (!contexts?.some((r: { id: string }) => r.id === restaurantId)) return <main className="pos-app"><h1>Workspace unavailable</h1><p>Your account no longer has access to this restaurant.</p><Link href="/staff">Choose a workspace</Link></main>
  return <NotificationProvider key={`${user.id}:${restaurantId}`} userId={user.id} restaurantId={restaurantId}>{children}</NotificationProvider>
}
