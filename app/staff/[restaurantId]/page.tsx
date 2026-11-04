import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import StaffWorkspace from '@/components/staff/StaffWorkspace'
import { UUID } from '@/lib/pos'
export const dynamic = 'force-dynamic'
export default async function StaffRestaurant({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params
  if (!UUID.test(restaurantId)) redirect('/staff')
  const client = await createSupabaseServerClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) redirect(`/login?next=/staff/${restaurantId}`)
  const { data, error } = await client.rpc('team_workspace', { p_restaurant_id: restaurantId })
  if (error || !data) return <main className="pos-app"><section className="pos-panel"><h1>Workspace unavailable</h1><p>Your account needs active access to this restaurant.</p><Link href="/staff">Choose a workspace</Link></section></main>
  return <StaffWorkspace initial={data} />
}
