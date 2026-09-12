import { createRateLimiter, clientIp } from '@/lib/request-security'
import { rejectUnsafeRequest } from '@/lib/menu-api'
import { readJsonBody } from '@/lib/request-security'
import { NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'

const rateLimited = createRateLimiter(60)
export async function POST(request: Request) {
  const unsafe = rejectUnsafeRequest(request); if (unsafe) return unsafe
  if (rateLimited(clientIp(request))) return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 })

  if (!request.headers.get('content-type')?.startsWith('application/json')) return NextResponse.json({ error: 'Invalid request.' }, { status: 415 })
  const origin = request.headers.get('origin'); if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: 'Invalid origin.' }, { status: 403 })
  const body = (await readJsonBody(request) ?? {})
  const slug = typeof body?.slug === 'string' ? body.slug : ''
  const session = typeof body?.session === 'string' ? body.session : ''
  if (!/^[a-z0-9-]{3,50}$/.test(slug) || !/^[0-9a-f-]{36}$/i.test(session)) return NextResponse.json({ error: 'Invalid visit.' }, { status: 400 })
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ ok: true })
  const admin = supabaseAdmin()
  const { data: restaurant } = await admin.from('restaurants').select('id').eq('slug', slug).eq('is_active', true).maybeSingle()
  if (!restaurant) return NextResponse.json({ error: 'Menu not found.' }, { status: 404 })
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const sessionKey = createHash('sha256').update(`${session}:${ip}:${process.env.SUPABASE_SERVICE_ROLE_KEY.slice(0, 12)}`).digest('hex')
  await admin.from('menu_visits').upsert({ restaurant_id: restaurant.id, session_key: sessionKey, visited_on: new Date().toISOString().slice(0, 10) }, { onConflict: 'restaurant_id,session_key,visited_on', ignoreDuplicates: true })
  return NextResponse.json({ ok: true })
}
