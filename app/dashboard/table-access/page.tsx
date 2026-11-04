import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import TableAccessPanel from '@/components/staff/TableAccessPanel'
export const dynamic = 'force-dynamic'
export default async function TableAccessPage() {
  const client = await createSupabaseServerClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) redirect('/login?next=/dashboard/table-access')
  const { data } = await client.from('restaurants').select('id').eq('owner_id', user.id).limit(1).maybeSingle()
  if (!data) redirect('/dashboard/setup')
  return <main className="pos-app"><header className="pos-header"><div><p className="pos-eyebrow">Guest access</p><h1>Table verification</h1><p>Approve guest phones in person before they can order.</p></div><Link href="/dashboard/billing?tab=Tables">Manage tables →</Link></header><TableAccessPanel restaurantId={data.id} /></main>
}
