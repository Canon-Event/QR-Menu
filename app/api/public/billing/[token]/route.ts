import { NextResponse } from 'next/server'
import { UUID } from '@/lib/pos'
import { merchantFor } from '@/lib/pos-payments'
import { gateway, publicBill } from '@/lib/pos-server'

export const dynamic = 'force-dynamic'
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!UUID.test(token)) return NextResponse.json({ error: 'Bill not found.' }, { status: 404 })
  const result = await gateway('lookup', { token })
  if (result.error || !result.data) return NextResponse.json({ error: 'Bill not found.' }, { status: 404 })
  return NextResponse.json({ bill: publicBill(result.data), gatewayReady: Boolean(merchantFor(result.data.restaurant_id)) }, { headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow' } })
}
