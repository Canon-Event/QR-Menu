import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { UUID } from '@/lib/pos'
export async function staffAuth(request: Request) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Sign in with your staff email.' }, { status: 401 }) }
  const restaurantId = new URL(request.url).searchParams.get('restaurant') || ''
  if (!UUID.test(restaurantId)) return { error: NextResponse.json({ error: 'Choose a restaurant.' }, { status: 400 }) }
  // Every database entry point checks the current membership; no cached role claims.
  return { supabase, restaurantId }
}
