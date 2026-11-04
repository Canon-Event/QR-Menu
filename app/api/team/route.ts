import { NextResponse } from 'next/server'
import { getOwnedRestaurant, rejectUnsafeRequest } from '@/lib/menu-api'
import { readJsonBody } from '@/lib/request-security'
import { posError } from '@/lib/pos-server'
export const dynamic = 'force-dynamic'
export async function GET() {
  const auth = await getOwnedRestaurant(); if ('error' in auth) return auth.error
  const { data, error } = await auth.supabase.rpc('team_admin', { p_restaurant_id: auth.restaurantId, p_action: 'list' })
  return error ? posError(error) : NextResponse.json({ members: data }, { headers: { 'Cache-Control': 'no-store' } })
}
export async function POST(request: Request) {
  const unsafe = rejectUnsafeRequest(request); if (unsafe) return unsafe
  const auth = await getOwnedRestaurant(); if ('error' in auth) return auth.error
  const body = await readJsonBody(request)
  if (!body || !['grant','revoke'].includes(body.action) || !body.data || typeof body.data !== 'object') return NextResponse.json({ error: 'Invalid team action.' }, { status: 400 })
  const { data, error } = await auth.supabase.rpc('team_admin', { p_restaurant_id: auth.restaurantId, p_action: body.action, p_data: body.data })
  return error ? (error.code === '22023' ? NextResponse.json({ error: error.message }, { status: 400 }) : posError(error)) : NextResponse.json({ members: data })
}
