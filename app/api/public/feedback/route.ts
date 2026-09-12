import { createRateLimiter, clientIp } from '@/lib/request-security'
import { rejectUnsafeRequest } from '@/lib/menu-api'
import { readJsonBody } from '@/lib/request-security'
import { NextResponse } from 'next/server'
import { cleanText } from '@/lib/menu-validation'
const allowed = ['food','service','ambience','value','other']
const rateLimited = createRateLimiter(10)
export async function POST(request: Request) {
  const unsafe = rejectUnsafeRequest(request); if (unsafe) return unsafe
  if (rateLimited(clientIp(request))) return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 })
 const body = (await readJsonBody(request) ?? {}); const rating = Number(body?.rating); const slug = cleanText(body?.slug, 100).toLowerCase(); const category = cleanText(body?.category, 30); const message = cleanText(body?.message, 1500); if (!/^[a-z0-9-]{2,100}$/.test(slug) || !Number.isInteger(rating) || rating < 1 || rating > 5 || !allowed.includes(category) || message.length < 3) return NextResponse.json({ error: 'Please complete the feedback form.' }, { status: 400 }); const { createClient } = await import('@supabase/supabase-js'); const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!); const { data: restaurant } = await supabase.from('restaurants').select('id').eq('slug', slug).maybeSingle(); if (!restaurant) return NextResponse.json({ error: 'Restaurant not found.' }, { status: 404 }); const { error } = await supabase.from('customer_feedback').insert({ restaurant_id: restaurant.id, rating, category, message, customer_name: cleanText(body?.name, 100) || null, contact: cleanText(body?.contact, 120) || null }); if (error) return NextResponse.json({ error: 'Could not submit feedback.' }, { status: 500 }); return NextResponse.json({ ok: true }) }
