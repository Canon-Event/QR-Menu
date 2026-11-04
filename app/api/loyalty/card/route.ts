import { NextResponse } from 'next/server'
import { createLoyaltyClient, loadLoyaltyWallet, loyaltyError } from '@/lib/loyalty-server'
import { rejectUnsafeRequest } from '@/lib/menu-api'
import { readJsonBody, clientIp, createRateLimiter } from '@/lib/request-security'

const limited = createRateLimiter(30)
export async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get('slug') || ''
  if (!/^[a-z0-9-]{3,50}$/.test(slug)) return NextResponse.json({ error: 'Invalid restaurant.' }, { status: 400 })
  try {
    const client = await createLoyaltyClient()
    const { data: restaurant } = await client.from('restaurants').select('id').eq('slug', slug).eq('is_active', true).maybeSingle()
    if (!restaurant) return NextResponse.json({ error: 'Restaurant unavailable.' }, { status: 404 })
    const { data: program, error } = await client.from('loyalty_programs').select('*').eq('restaurant_id', restaurant.id).maybeSingle()
    if (error) return loyaltyError(error)
    if (!program) return NextResponse.json({ error: 'Rewards are not set up yet.' }, { status: 404 })
    const { data: { user } } = await client.auth.getUser()
    const authenticated = !!(user?.phone && user.phone_confirmed_at)
    const { data: member, error: memberError } = authenticated ? await client.from('loyalty_members').select('*').eq('restaurant_id', restaurant.id).eq('customer_id', user!.id).maybeSingle() : { data: null, error: null }
    if (memberError) return loyaltyError(memberError)
    return NextResponse.json({ program, authenticated, wallet: member ? await loadLoyaltyWallet(client, member) : null, phoneReady: process.env.LOYALTY_PHONE_AUTH_ENABLED === 'true' }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch { return NextResponse.json({ error: 'Could not load rewards. Please try again.' }, { status: 503 }) }
}

export async function POST(request: Request) {
  const unsafe = rejectUnsafeRequest(request); if (unsafe) return unsafe
  if (limited(clientIp(request))) return NextResponse.json({ error: 'Please try again later.' }, { status: 429 })
  const body = await readJsonBody(request)
  if (!body || typeof body.name !== 'string' || body.name.trim().length < 2 || body.name.trim().length > 60 || !/^[a-z0-9-]{3,50}$/.test(body.slug || '')) return NextResponse.json({ error: 'Enter your name to join rewards.' }, { status: 400 })
  try {
    const client = await createLoyaltyClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user?.phone_confirmed_at || !user.phone) return NextResponse.json({ error: 'Verify your phone number first.' }, { status: 401 })
    const { data: restaurant } = await client.from('restaurants').select('id').eq('slug', body.slug).eq('is_active', true).maybeSingle()
    if (!restaurant) return NextResponse.json({ error: 'Restaurant unavailable.' }, { status: 404 })
    const { data: member, error } = await client.rpc('loyalty_join', { p_restaurant_id: restaurant.id, p_name: body.name.trim() })
    if (error) return loyaltyError(error)
    return NextResponse.json({ wallet: await loadLoyaltyWallet(client, member) })
  } catch { return NextResponse.json({ error: 'Could not join rewards. Please try again.' }, { status: 503 }) }
}
