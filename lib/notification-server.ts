import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createRateLimiter } from '@/lib/request-security'
import { UUID } from '@/lib/pos'

const limited = createRateLimiter(240, 60_000)
export const notificationHeaders = { 'Cache-Control': 'no-store, private', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow' }
export function notificationError(error: { code?: string } | null) {
  const denied = error?.code === '42501', invalid = error?.code?.startsWith('22') || error?.code?.startsWith('23')
  return NextResponse.json({ error: denied ? 'This workspace or notification is no longer available to your account.' : invalid ? 'Check the notification settings and try again.' : 'Notifications are temporarily unavailable. Your orders are still saved.' }, { status: denied ? 403 : invalid ? 400 : 503, headers: notificationHeaders })
}
export async function notificationAuth(request: Request, requireRestaurant = true) {
  const client = await createSupabaseServerClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Sign in to view notifications.' }, { status: 401, headers: notificationHeaders }) }
  if (limited(user.id)) return { error: NextResponse.json({ error: 'Please wait a moment before retrying.' }, { status: 429, headers: { ...notificationHeaders, 'Retry-After': '60' } }) }
  const restaurantId = new URL(request.url).searchParams.get('restaurant') || ''
  if (requireRestaurant && !UUID.test(restaurantId)) return { error: NextResponse.json({ error: 'Choose a restaurant.' }, { status: 400, headers: notificationHeaders }) }
  return { client, user, restaurantId }
}
export function notificationCursor(value: string | null) { return value === null || (/^\d{1,18}$/.test(value) && BigInt(value) <= BigInt('9223372036854775807')) }
export function pushConfiguration() {
  const publicKey = process.env.WEB_PUSH_PUBLIC_KEY || ''
  return { pushConfigured: Boolean(publicKey && process.env.WEB_PUSH_PRIVATE_KEY && process.env.WEB_PUSH_SUBJECT), pushPublicKey: publicKey }
}
export function validPushSubscription(value: any) {
  if (!value || typeof value.endpoint !== 'string' || value.endpoint.length > 4096) return false
  try {
    const u = new URL(value.endpoint)
    return u.protocol === 'https:' && !u.username && !u.password && !u.port && !u.hash
      && /^(fcm\.googleapis\.com|(?:[a-z0-9-]+\.)?push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)$/.test(u.hostname)
      && /^[A-Za-z0-9_-]{87}$/.test(value.keys?.p256dh || '') && /^[A-Za-z0-9_-]{22}$/.test(value.keys?.auth || '')
  } catch { return false }
}
