import { NextResponse } from 'next/server'
import { notificationAuth, notificationCursor, notificationError, notificationHeaders, pushConfiguration } from '@/lib/notification-server'
import { readJsonBody } from '@/lib/request-security'
import { rejectUnsafeRequest } from '@/lib/menu-api'
import { UUID } from '@/lib/pos'
import { NOTIFICATION_CATEGORIES } from '@/lib/notifications'
export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  const auth = await notificationAuth(request); if ('error' in auth) return auth.error
  const q = new URL(request.url).searchParams, before = q.get('before'), after = q.get('after')
  if (!notificationCursor(before) || !notificationCursor(after) || (before && after)) return NextResponse.json({ error: 'Invalid cursor.' }, { status: 400 })
  const { data, error } = await auth.client.rpc('notification_feed', { p_restaurant_id: auth.restaurantId, p_before: before, p_after: after, p_unread: q.get('unread') === 'true' })
  return error ? notificationError(error) : NextResponse.json({ ...data, ...pushConfiguration() }, { headers: notificationHeaders })
}
export async function POST(request: Request) {
  const unsafe = rejectUnsafeRequest(request); if (unsafe) return unsafe
  const auth = await notificationAuth(request); if ('error' in auth) return auth.error
  const body = await readJsonBody(request, 4096)
  if (!body) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  let result
  if (body.action === 'read' && UUID.test(body.id || '')) result = await auth.client.rpc('notification_read', { p_restaurant_id: auth.restaurantId, p_id: body.id })
  else if (body.action === 'read_all' && typeof body.cutoff === 'string' && notificationCursor(body.cutoff)) result = await auth.client.rpc('notification_read', { p_restaurant_id: auth.restaurantId, p_cutoff: body.cutoff })
  else if (body.action === 'preferences' && typeof body.data?.sound_enabled === 'boolean' && typeof body.data?.push_enabled === 'boolean' && typeof body.data?.volume === 'number' && body.data.volume >= 0 && body.data.volume <= 1 && Array.isArray(body.data.categories) && body.data.categories.length <= 6 && body.data.categories.every((v: any) => NOTIFICATION_CATEGORIES.includes(v))) result = await auth.client.rpc('notification_configure', { p_restaurant_id: auth.restaurantId, p_action: 'preferences', p_data: body.data })
  else if (body.action === 'settings' && typeof body.data?.reminders_enabled === 'boolean' && ['first_seconds', 'escalation_seconds', 'repeat_seconds', 'max_repeats', 'feedback_threshold'].every(k => Number.isInteger(body.data[k]))) result = await auth.client.rpc('notification_configure', { p_restaurant_id: auth.restaurantId, p_action: 'settings', p_data: body.data })
  else return NextResponse.json({ error: 'Invalid notification request.' }, { status: 400 })
  return result.error ? notificationError(result.error) : NextResponse.json(result.data, { headers: notificationHeaders })
}
