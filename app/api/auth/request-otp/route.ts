import { NextResponse } from 'next/server'
import { clientIp, createRateLimiter, readJsonBody } from '@/lib/request-security'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const limited = createRateLimiter(5)
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request: Request) {
  const key = clientIp(request)
  if (limited(key)) return NextResponse.json({ error: 'Please wait before trying again.' }, { status: 429 })
  const body = await readJsonBody(request)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!email || email.length > 254 || !emailPattern.test(email)) return NextResponse.json({ error: 'Unable to process your request.' }, { status: 400 })

  try {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: new URL('/dashboard', request.url).toString() } })
    if (error) return NextResponse.json({ error: 'Unable to process your request.' }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Unable to process your request.' }, { status: 500 })
  }
}
