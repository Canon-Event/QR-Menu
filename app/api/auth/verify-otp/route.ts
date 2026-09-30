import { NextResponse } from 'next/server'
import { clientIp, createRateLimiter, readJsonBody } from '@/lib/request-security'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const limited = createRateLimiter(10)
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request: Request) {
  if (limited(clientIp(request))) return NextResponse.json({ error: 'Unable to verify this code right now.' }, { status: 429 })
  const body = await readJsonBody(request)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const token = typeof body?.token === 'string' ? body.token.trim() : ''
  if (!email || email.length > 254 || !emailPattern.test(email) || !/^\d{6,8}$/.test(token)) return NextResponse.json({ error: 'Unable to verify this code.' }, { status: 400 })

  try {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' })
    if (error) return NextResponse.json({ error: 'Unable to verify this code.' }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Unable to verify this code.' }, { status: 500 })
  }
}
