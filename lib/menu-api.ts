import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export function rejectUnsafeRequest(request: Request, multipart = false) {
  const contentLength = Number(request.headers.get('content-length') || 0)
  if (contentLength > (multipart ? 4 * 1024 * 1024 + 65536 : 32_000)) return NextResponse.json({ error: 'Request is too large.' }, { status: 413 })
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== (multipart ? 'multipart/form-data' : 'application/json')) {
    return NextResponse.json({ error: 'Content-Type must be application/json.' }, { status: 415 })
  }
  const origin = request.headers.get('origin')
  if (request.headers.get('sec-fetch-site') === 'cross-site') return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 })
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 })
  return null
}

export async function getOwnedRestaurant() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'You must be signed in.' }, { status: 401 }) }
  const { data: restaurant, error } = await supabase.from('restaurants').select('id').eq('owner_id', user.id).limit(1).maybeSingle()
  if (error) return { error: NextResponse.json({ error: 'Could not verify restaurant ownership.' }, { status: 503 }) }
  if (!restaurant) return { error: NextResponse.json({ error: 'Set up your restaurant first.' }, { status: 404 }) }
  return { supabase, restaurantId: restaurant.id as string }
}

export function menuDatabaseError(error: { code?: string }) {
  if (error.code === '23503') return NextResponse.json({ error: 'A selected menu record no longer exists.' }, { status: 400 })
  if (error.code === '23505') return NextResponse.json({ error: 'That record already exists.' }, { status: 409 })
  if (error.code === '42501') return NextResponse.json({ error: 'You do not have permission to change this menu.' }, { status: 403 })
  return NextResponse.json({ error: 'The menu could not be updated. Please try again.' }, { status: 503 })
}
