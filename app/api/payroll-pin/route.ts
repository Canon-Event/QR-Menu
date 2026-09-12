import { createRateLimiter, readJsonBody } from '@/lib/request-security'
import { NextResponse } from 'next/server'
import { randomBytes, scrypt, timingSafeEqual } from 'crypto'
import { getOwnedRestaurant, rejectUnsafeRequest } from '@/lib/menu-api'

const validPin = (value: unknown) => typeof value === 'string' && /^\d{6}$/.test(value)
const limited = createRateLimiter(5)
const derive = (pin: string, salt: string) => new Promise<Buffer>((resolve, reject) => {
  scrypt(pin, salt, 32, (error, key) => error ? reject(error) : resolve(key))
})
const hashPin = async (pin: string) => { const salt = randomBytes(16).toString('hex'); return `${salt}:${(await derive(pin, salt)).toString('hex')}` }
const matchesPin = async (pin: string, stored: string) => {
  if (!/^[0-9a-f]{32}:[0-9a-f]{64}$/.test(stored)) return false
  const [salt, hash] = stored.split(':')
  return timingSafeEqual(await derive(pin, salt), Buffer.from(hash, 'hex'))
}

export async function GET() { const auth = await getOwnedRestaurant(); if ('error' in auth) return auth.error; const { data, error } = await auth.supabase.from('payroll_security').select('restaurant_id').eq('restaurant_id', auth.restaurantId).maybeSingle(); if (error) return NextResponse.json({ error: 'Payroll security is unavailable. Run the employee-management SQL migration.' }, { status: 500 }); return NextResponse.json({ configured: Boolean(data) }) }

export async function POST(request: Request) {
  const unsafe = rejectUnsafeRequest(request); if (unsafe) return unsafe
  const auth = await getOwnedRestaurant(); if ('error' in auth) return auth.error
  const body = (await readJsonBody(request) ?? {})
  if (limited(auth.restaurantId)) return NextResponse.json({ error: 'Too many PIN attempts. Try again later.' }, { status: 429 })
  if (!['set', 'verify'].includes(body.action)) return NextResponse.json({ error: 'Invalid action.' }, { status: 400 })
  if (!validPin(body?.pin)) return NextResponse.json({ error: 'Use a six-digit Payroll PIN.' }, { status: 400 })
  if (body?.action === 'set') {
    if (body.pin !== body.confirmPin) return NextResponse.json({ error: 'PIN confirmation does not match.' }, { status: 400 })
    const { error } = await auth.supabase.from('payroll_security').upsert({ restaurant_id: auth.restaurantId, pin_hash: await hashPin(body.pin), updated_at: new Date().toISOString() })
    if (error) return NextResponse.json({ error: 'Could not save Payroll PIN. Run the employee-management SQL migration.' }, { status: 500 })
    return NextResponse.json({ ok: true })
  }
  const { data, error } = await auth.supabase.from('payroll_security').select('pin_hash').eq('restaurant_id', auth.restaurantId).maybeSingle()
  if (error || !data || !(await matchesPin(body.pin, data.pin_hash))) return NextResponse.json({ error: 'Incorrect Payroll PIN.' }, { status: 401 })
  const { data: employees } = await auth.supabase.from('employees').select('monthly_salary').eq('restaurant_id', auth.restaurantId).eq('status', 'active')
  const amount = (employees || []).reduce((total, employee) => total + Number(employee.monthly_salary || 0), 0)
  return NextResponse.json({ ok: true, amount })
}
