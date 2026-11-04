import { NextResponse } from 'next/server'
import { staffAuth } from '@/lib/staff-server'
import { rejectUnsafeRequest } from '@/lib/menu-api'
import { readJsonBody } from '@/lib/request-security'
import { posError } from '@/lib/pos-server'
import { UUID } from '@/lib/pos'
export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  const auth = await staffAuth(request); if ('error' in auth) return auth.error
  const { data, error } = await auth.supabase.rpc('team_workspace', { p_restaurant_id: auth.restaurantId })
  return error ? posError(error) : NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
}
export async function POST(request: Request) {
  const unsafe = rejectUnsafeRequest(request); if (unsafe) return unsafe
  const auth = await staffAuth(request); if ('error' in auth) return auth.error
  const body = await readJsonBody(request)
  if (!body || !UUID.test(body.key || '') || typeof body.name !== 'string' || typeof body.note !== 'string' || !Array.isArray(body.items) || (body.visitId && !UUID.test(body.visitId))) return NextResponse.json({ error: 'Invalid order.' }, { status: 400 })
  const { data, error } = await auth.supabase.rpc('team_order', { p_restaurant_id: auth.restaurantId, p_key: body.key, p_name: body.name, p_note: body.note, p_items: body.items, p_visit_id: body.visitId || null })
  return error ? posError(error) : NextResponse.json({ result: data })
}
