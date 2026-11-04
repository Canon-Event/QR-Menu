import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'

// A separate cookie keeps a restaurant owner's login intact when they try their card.
export async function createLoyaltyClient() {
  const cookieStore = await cookies()
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookieOptions: { name: 'wiit-loyalty-auth', sameSite: 'lax', path: '/', httpOnly: true, secure: process.env.NODE_ENV === 'production' },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: entries => { for (const { name, value, options } of entries) cookieStore.set(name, value, options) },
    },
  })
}

export async function loadLoyaltyWallet(client: SupabaseClient, member: { id: string }) {
  const [stamps, rewards] = await Promise.all([
    client.from('loyalty_stamps').select('id,member_id,status,bill_reference,paid_amount,created_at,reward_id').eq('member_id', member.id).order('created_at', { ascending: false }),
    client.from('loyalty_rewards').select('*').eq('member_id', member.id).order('created_at', { ascending: false }),
  ])
  if (stamps.error || rewards.error) throw new Error('Could not load this card. Please try again.')
  return { member, stamps: stamps.data || [], rewards: rewards.data || [] }
}

export function loyaltyError(error: { code?: string; message?: string }) {
  const known = ['Program unavailable.', 'Verify your phone number first.', 'This card belongs to another restaurant.', 'This bill has already earned a stamp.', 'Enter a qualifying paid bill amount.', 'Reward is no longer available.', 'Reward already used; this stamp cannot be reversed.', 'Program rules are locked after the first customer joins.', 'Card not found.', 'Stamp not found.', 'You cannot change another restaurant’s program.', 'Reference already used for a different action.']
  const message = known.find(value => error.message?.includes(value))
  if (message) return NextResponse.json({ error: message }, { status: 409 })
  if (error.code === '42501') return NextResponse.json({ error: 'Sign in to the correct account to continue.' }, { status: 403 })
  if (error.code === '23505') return NextResponse.json({ error: 'This bill has already earned a stamp.' }, { status: 409 })
  return NextResponse.json({ error: 'Loyalty is temporarily unavailable. Please try again.' }, { status: 503 })
}
