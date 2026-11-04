import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { UUID } from '@/lib/pos'
import { createRateLimiter, clientIp } from '@/lib/request-security'
import { notificationHeaders } from '@/lib/notification-server'
const limited = createRateLimiter(30, 60_000), aggregateLimited = createRateLimiter(6000, 60_000)
export const dynamic = 'force-dynamic'
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!UUID.test(token)) return NextResponse.json({ error: 'Order tracking link unavailable.' }, { status: 404, headers: notificationHeaders })
  const ip = clientIp(request)
  if (limited(`${ip}:${token}`) || aggregateLimited(ip)) return NextResponse.json({ error: 'Please wait before checking again.' }, { status: 429, headers: { ...notificationHeaders, 'Retry-After': '60' } })
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: 'Tracking is temporarily unavailable.' }, { status: 503, headers: notificationHeaders })
  const { data, error } = await supabaseAdmin().rpc('order_tracking', { p_token: token })
  if (error) return NextResponse.json({ error: 'Tracking is temporarily unavailable.' }, { status: 503, headers: notificationHeaders })
  return NextResponse.json(data ? { order: data } : { error: 'This tracking link is no longer available.' }, { status: data ? 200 : 404, headers: notificationHeaders })
}
