import { notFound } from 'next/navigation'
import CustomerBill from '@/components/billing/CustomerBill'
import { UUID } from '@/lib/pos'
import { merchantFor } from '@/lib/pos-payments'
import { gateway, publicBill } from '@/lib/pos-server'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Your restaurant bill · WIIT', robots: { index: false, follow: false }, referrer: 'no-referrer' }
export default async function BillPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!UUID.test(token) || !process.env.SUPABASE_SERVICE_ROLE_KEY) notFound()
  const result = await gateway('lookup', { token })
  if (result.error || !result.data) notFound()
  return <CustomerBill token={token} initialBill={publicBill(result.data)} gatewayReady={Boolean(merchantFor(result.data.restaurant_id))} />
}
