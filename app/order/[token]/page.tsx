import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import { UUID } from '@/lib/pos'
import CustomerOrderTracker from '@/components/menu/CustomerOrderTracker'
export const dynamic = 'force-dynamic'
export const metadata = { robots: { index: false, follow: false }, referrer: 'no-referrer' as const }
export default async function OrderConfirmationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!UUID.test(token) || !process.env.SUPABASE_SERVICE_ROLE_KEY) notFound()
  const { data, error } = await supabaseAdmin().rpc('order_tracking', { p_token: token })
  if (error) return <main className="order-confirmation-page"><section><h1>Tracking is temporarily unavailable</h1><p>Please refresh shortly or ask the restaurant to check your order.</p></section></main>
  if (!data) notFound()
  return <CustomerOrderTracker token={token} initial={data} />
}
