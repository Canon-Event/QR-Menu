import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { notificationTitle, safeInternalHref } from '@/lib/notifications'
import { UUID } from '@/lib/pos'
import NotificationOpened from './NotificationOpened'
export default async function NotificationDetail({ restaurantId, id, ownerView = false }: { restaurantId: string; id: string; ownerView?: boolean }) {
  const client = await createSupabaseServerClient()
  const { data, error } = UUID.test(id) ? await client.rpc('notification_open', { p_restaurant_id: restaurantId, p_id: id }) : { data: null, error: true }
  return <main className="notification-page"><Link href={ownerView ? '/dashboard/notifications' : `/staff/${restaurantId}/notifications`}>← Notifications</Link>
    {error || !data ? <><h1>Notification unavailable</h1><p>This record was removed or your access has changed. Ask your restaurant owner if you still need access.</p></> : <>
      <h1>{notificationTitle(data)}</h1><p>{data.actionable ? 'Review the details below.' : 'This work is no longer outstanding.'}</p>
      {data.details ? <><NotificationOpened id={id} /><dl className="notification-resource">{Object.entries(data.details).map(([key, value]) => <div key={key}><dt>{key.replaceAll('_', ' ')}</dt><dd>{Array.isArray(value) ? value.map((item: any, index) => <p key={index}>{item.quantity} × {item.name}</p>) : value === null ? '—' : key.endsWith('_paise') ? `₹${(Number(value) / 100).toFixed(2)}` : String(value)}</dd></div>)}</dl>{safeInternalHref(data.destination) && <Link className="notification-manage" href={data.destination}>Open workspace to manage this record →</Link>}</> : <p>The related record has been removed. This notification is retained as history.</p>}
    </>}
  </main>
}
