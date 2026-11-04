import { createSupabaseServerClient } from '@/lib/supabase-server'
import NotificationDetail from '@/components/notifications/NotificationDetail'
export const dynamic = 'force-dynamic'
export default async function OwnerNotification({ params }: { params: Promise<{ id: string }> }) {
  const client = await createSupabaseServerClient(), { data: { user } } = await client.auth.getUser()
  const { data: restaurant } = user ? await client.from('restaurants').select('id').eq('owner_id', user.id).limit(1).maybeSingle() : { data: null }
  if (!restaurant) return <main className="notification-page"><h1>Workspace unavailable</h1></main>
  return <NotificationDetail restaurantId={restaurant.id} id={(await params).id} ownerView />
}
