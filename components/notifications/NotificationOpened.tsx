'use client'
import { useEffect } from 'react'
import { useNotifications } from './NotificationProvider'
export default function NotificationOpened({ id }: { id: string }) {
  const context = useNotifications(), restaurant = context?.restaurantId, refresh = context?.refresh
  useEffect(() => {
    if (!restaurant) return
    // Runs only after an authorized resource successfully renders in the client;
    // server rendering and Link prefetch cannot mark the notification read.
    void fetch(`/api/notifications?restaurant=${restaurant}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'read', id }) }).then(response => { if (response.ok) void refresh?.() }).catch(() => {})
  }, [id, restaurant, refresh])
  return null
}
