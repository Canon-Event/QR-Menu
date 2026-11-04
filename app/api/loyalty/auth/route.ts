import { NextResponse } from 'next/server'
import { rejectUnsafeRequest } from '@/lib/menu-api'
import { clientIp, createRateLimiter, readJsonBody } from '@/lib/request-security'
import { normalizeLoyaltyPhone } from '@/lib/loyalty'
import { createLoyaltyClient } from '@/lib/loyalty-server'

const sendLimited = createRateLimiter(5)
const verifyLimited = createRateLimiter(15)
const phoneLimited = createRateLimiter(3)
export async function POST(request: Request) {
  const unsafe = rejectUnsafeRequest(request); if (unsafe) return unsafe
  const body = await readJsonBody(request)
  if (!body || !['send', 'verify', 'signout'].includes(body.action)) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  try {
    const client = await createLoyaltyClient()
    if (body.action === 'signout') {
      const { error } = await client.auth.signOut({ scope: 'local' })
      if (error) return NextResponse.json({ error: 'Could not sign out. Try again.' }, { status: 503 })
      return NextResponse.json({ ok: true })
    }
    if (process.env.LOYALTY_PHONE_AUTH_ENABLED !== 'true') return NextResponse.json({ error: 'Phone sign-in is not ready at this restaurant yet.' }, { status: 503 })
    const phone = normalizeLoyaltyPhone(body.phone)
    if (!phone || !/^[a-z0-9-]{3,50}$/.test(body.slug || '')) return NextResponse.json({ error: 'Enter a valid phone number with country code.' }, { status: 400 })
    if ((body.action === 'send' ? sendLimited : verifyLimited)(clientIp(request))) return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 })
    const { data: restaurant } = await client.from('restaurants').select('id').eq('slug', body.slug).eq('is_active', true).maybeSingle()
    const { data: program } = restaurant ? await client.from('loyalty_programs').select('enabled').eq('restaurant_id', restaurant.id).maybeSingle() : { data: null }
    // Existing members can still sign in and redeem earned rewards when enrollment is paused.
    if (!program) return NextResponse.json({ error: 'Rewards are unavailable at this restaurant.' }, { status: 404 })
    if (body.action === 'send') {
      if (phoneLimited(phone)) return NextResponse.json({ error: 'Please wait before requesting another code.' }, { status: 429 })
      const { error } = await client.auth.signInWithOtp({ phone, options: { shouldCreateUser: true, channel: 'sms' } })
      if (error) return NextResponse.json({ error: 'We could not send a code. Please wait a minute and try again.' }, { status: 400 })
      return NextResponse.json({ ok: true })
    }
    if (typeof body.code !== 'string' || !/^\d{6}$/.test(body.code)) return NextResponse.json({ error: 'Enter the six-digit code from your SMS.' }, { status: 400 })
    const { error } = await client.auth.verifyOtp({ phone, token: body.code, type: 'sms' })
    if (error) return NextResponse.json({ error: 'That code is incorrect or expired. Please try again.' }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch { return NextResponse.json({ error: 'Phone sign-in is temporarily unavailable.' }, { status: 503 }) }
}
