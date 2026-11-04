import { NextResponse } from 'next/server'
import { getOwnedRestaurant, rejectUnsafeRequest } from '@/lib/menu-api'
import { readJsonBody, createRateLimiter } from '@/lib/request-security'
import { isUuid } from '@/lib/menu-validation'
import { normalizeCardCode, parseLoyaltyProgram } from '@/lib/loyalty'
import { loadLoyaltyWallet, loyaltyError } from '@/lib/loyalty-server'

const limited = createRateLimiter(120)
export async function GET(request: Request) {
  try {
    const auth = await getOwnedRestaurant(); if ('error' in auth) return auth.error
    const code = new URL(request.url).searchParams.get('member')
    if (code !== null) {
      const cardCode = normalizeCardCode(code)
      if (!cardCode) return NextResponse.json({ error: 'Enter the 12-character code from the customer’s card.' }, { status: 400 })
      const { data: member, error } = await auth.supabase.from('loyalty_members').select('*').eq('restaurant_id', auth.restaurantId).eq('card_code', cardCode).maybeSingle()
      if (error) return loyaltyError(error)
      if (!member) return NextResponse.json({ error: 'No card found at your restaurant. Ask the customer to join rewards first.' }, { status: 404 })
      return NextResponse.json(await loadLoyaltyWallet(auth.supabase, member), { headers: { 'Cache-Control': 'private, no-store' } })
    }
    const [program, members, stamps, rewards, redeemed, activity] = await Promise.all([
      auth.supabase.from('loyalty_programs').select('*').eq('restaurant_id', auth.restaurantId).maybeSingle(),
      auth.supabase.from('loyalty_members').select('id', { count: 'exact', head: true }).eq('restaurant_id', auth.restaurantId),
      auth.supabase.from('loyalty_stamps').select('id', { count: 'exact', head: true }).eq('restaurant_id', auth.restaurantId).neq('status', 'reversed'),
      auth.supabase.from('loyalty_rewards').select('id', { count: 'exact', head: true }).eq('restaurant_id', auth.restaurantId).is('redeemed_at', null).is('revoked_at', null).gt('expires_at', new Date().toISOString()),
      auth.supabase.from('loyalty_rewards').select('id', { count: 'exact', head: true }).eq('restaurant_id', auth.restaurantId).not('redeemed_at', 'is', null),
      auth.supabase.from('loyalty_activity').select('id,action,note,created_at,loyalty_members(display_name)').eq('restaurant_id', auth.restaurantId).order('created_at', { ascending: false }).limit(20),
    ])
    if ([program, members, stamps, rewards, redeemed, activity].some(result => result.error)) return NextResponse.json({ error: 'Loyalty storage is not ready. Follow the setup steps in docs/stamp-card-guide.md, then reload.' }, { status: 503 })
    return NextResponse.json({ program: program.data, rulesLocked: !!members.count, stats: { members: members.count, stamps: stamps.count, ready: rewards.count, redeemed: redeemed.count }, activity: activity.data }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch { return NextResponse.json({ error: 'Could not load loyalty. Please try again.' }, { status: 503 }) }
}

export async function POST(request: Request) {
  const unsafe = rejectUnsafeRequest(request); if (unsafe) return unsafe
  try {
    const auth = await getOwnedRestaurant(); if ('error' in auth) return auth.error
    if (limited(auth.restaurantId)) return NextResponse.json({ error: 'Please wait a moment before trying again.' }, { status: 429 })
    const body = await readJsonBody(request)
    if (!body) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
    if (body.action === 'save') {
      let program
      try { program = parseLoyaltyProgram(body.program || {}, auth.restaurantId) }
      catch (cause) { return NextResponse.json({ error: cause instanceof Error ? cause.message : 'Check the card settings.' }, { status: 400 }) }
      if (program.enabled && process.env.LOYALTY_PHONE_AUTH_ENABLED !== 'true') return NextResponse.json({ error: 'Connect phone sign-in before activating rewards. See the setup guide.' }, { status: 409 })
      const { data, error } = await auth.supabase.from('loyalty_programs').upsert(program, { onConflict: 'restaurant_id' }).select('*').single()
      if (error) return loyaltyError(error)
      return NextResponse.json({ program: data })
    }
    let result
    if (body.action === 'award') {
      if (!isUuid(body.memberId) || !isUuid(body.requestKey) || typeof body.billReference !== 'string' || body.billReference.trim().length < 2 || body.billReference.trim().length > 80 || typeof body.paidAmount !== 'number' || !Number.isFinite(body.paidAmount) || body.paidAmount <= 0 || body.paidAmount > 1000000) return NextResponse.json({ error: 'Enter a bill reference and the amount paid.' }, { status: 400 })
      result = await auth.supabase.rpc('loyalty_award', { p_restaurant_id: auth.restaurantId, p_member_id: body.memberId, p_bill_reference: body.billReference, p_paid_amount: body.paidAmount, p_request_key: body.requestKey })
    } else if (body.action === 'redeem') {
      if (!isUuid(body.rewardId) || !isUuid(body.requestKey)) return NextResponse.json({ error: 'Choose a valid reward.' }, { status: 400 })
      result = await auth.supabase.rpc('loyalty_redeem', { p_restaurant_id: auth.restaurantId, p_reward_id: body.rewardId, p_request_key: body.requestKey })
    } else if (body.action === 'reverse') {
      if (!isUuid(body.stampId) || typeof body.reason !== 'string' || body.reason.trim().length < 3 || body.reason.trim().length > 200) return NextResponse.json({ error: 'Add a reason for reversing the stamp.' }, { status: 400 })
      result = await auth.supabase.rpc('loyalty_reverse', { p_restaurant_id: auth.restaurantId, p_stamp_id: body.stampId, p_reason: body.reason })
    } else return NextResponse.json({ error: 'Unknown loyalty action.' }, { status: 400 })
    if (result.error) return loyaltyError(result.error)
    return NextResponse.json({ ok: true, ...result.data })
  } catch { return NextResponse.json({ error: 'Could not complete this action. Try again with the same bill reference.' }, { status: 503 }) }
}
