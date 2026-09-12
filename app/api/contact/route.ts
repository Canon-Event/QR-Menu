import { createRateLimiter, clientIp } from '@/lib/request-security'
import { rejectUnsafeRequest } from '@/lib/menu-api'
import { readJsonBody } from '@/lib/request-security'
import { NextResponse } from 'next/server'

const rateLimited = createRateLimiter(5)
export async function POST(request: Request) {
  const unsafe = rejectUnsafeRequest(request); if (unsafe) return unsafe
  if (rateLimited(clientIp(request))) return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 })

  const ip = clientIp(request)

  let body: Record<string, unknown>
  try {
    const parsed = await readJsonBody(request)
    if (!parsed) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
    body = parsed
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  if (typeof body.website === 'string' && body.website.trim()) return NextResponse.json({ ok: true })

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const phone = typeof body.phone === 'string' ? body.phone.trim() : ''
  const subject = typeof body.subject === 'string' ? body.subject.trim() : ''
  const message = typeof body.message === 'string' ? body.message.trim() : ''

  if (!name || name.length > 120 || !subject || subject.length > 120 || message.length < 10 || message.length > 2000) return NextResponse.json({ error: 'Please complete the form with valid details.' }, { status: 400 })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
  if (phone.length > 40) return NextResponse.json({ error: 'Please enter a valid phone number.' }, { status: 400 })
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: 'Contact service is not configured yet.' }, { status: 503 })

  const { supabaseAdmin } = await import('@/lib/supabase')
  const { error } = await supabaseAdmin().from('contact_messages').insert({ name, email, phone: phone || null, subject, message, ip_address: ip })
  if (error) return NextResponse.json({ error: 'We could not send your message. Please try again.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
