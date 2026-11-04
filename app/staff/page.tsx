import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
export const dynamic = 'force-dynamic'
export default async function StaffPage() {
  const client = await createSupabaseServerClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) redirect('/login?next=/staff')
  const { data, error } = await client.rpc('team_context')
  return <main className="pos-app"><header className="pos-header"><div><p className="pos-eyebrow">Signed in as {user.email}</p><h1>Staff workspace</h1></div><Link href="/login?next=/staff">Use a different account</Link></header><section className="pos-panel">{error ? <p role="alert">Staff access is unavailable. Ask the owner to check the staff permissions migration.</p> : data?.length ? data.map((r: any) => <p key={r.id}><Link href={`/staff/${r.id}`}>{r.name} →</Link> · {r.role}</p>) : <p>Ask your restaurant owner to grant access to your verified email in Team members, then refresh this page.</p>}</section></main>
}
