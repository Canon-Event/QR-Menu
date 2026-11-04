'use client'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import { DEFAULT_PREFERENCES, freshAudible, notificationBackoff, notificationTitle, type NotificationFeed, type NotificationPreferences, type NotificationSettings } from '@/lib/notifications'
import { claimNotificationSound, playNotificationTone } from '@/lib/notification-audio'
import { checkPushAccount, detachNotificationPush, enableNotificationPush, renewNotificationPush } from '@/lib/notification-push-client'
import { NotificationBell } from './NotificationCenter'

type Context = {
  restaurantId: string; userId: string; ownerView: boolean; feed: NotificationFeed | null; status: string; error: string; audioReady: boolean;
  refresh: () => Promise<void>; mutate: (body: unknown) => Promise<void>; enableSound: (test?: boolean) => Promise<void>;
  savePreferences: (value: NotificationPreferences) => Promise<void>; saveSettings: (value: NotificationSettings) => Promise<void>;
  enablePush: () => Promise<void>; disablePush: () => Promise<void>;
}
const Notifications = createContext<Context | null>(null)
export function useNotifications() { return useContext(Notifications) }
export default function NotificationProvider({ restaurantId, userId, children }: { restaurantId: string; userId: string; children: ReactNode }) {
  const pathname = usePathname()
  const [feed, setFeed] = useState<NotificationFeed | null>(null), [status, setStatus] = useState('Connecting'), [error, setError] = useState(''), [audioReady, setAudioReady] = useState(false), [toast, setToast] = useState('')
  const audio = useRef<AudioContext | null>(null), feedRef = useRef<NotificationFeed | null>(null), head = useRef<string | null>(null)
  const mounted = useRef(false), running = useRef(false), again = useRef(false), failures = useRef(0), authorized = useRef(true), abort = useRef<AbortController | null>(null), realtime = useRef(false)
  const generation = useRef(0)
  const stopSubscription = useRef<() => void>(() => {})
  const base = `/api/notifications?restaurant=${restaurantId}`
  const refresh = useCallback(async () => {
    if (!mounted.current || !authorized.current) return
    if (running.current) { again.current = true; return }
    running.current = true
    const version = generation.current, controller = abort.current
    try {
      const request = async (url: string) => {
        const timeout = new AbortController(), cancel = () => timeout.abort()
        controller?.signal.addEventListener('abort', cancel, { once: true })
        const timer = setTimeout(cancel, 12000)
        let response: Response, value: NotificationFeed & { error?: string }
        try { response = await fetch(url, { cache: 'no-store', signal: timeout.signal }); value = await response.json() }
        catch (error) { if (!controller?.signal.aborted && timeout.signal.aborted) throw new Error('Notification request timed out. Reconnecting.'); throw error }
        finally { clearTimeout(timer); controller?.signal.removeEventListener('abort', cancel) }
        if (version !== generation.current || !mounted.current) throw new DOMException('Obsolete request', 'AbortError')
        if (response.status === 401 || response.status === 403) { authorized.current = false; head.current = null; feedRef.current = null; setFeed(null); setAudioReady(false); void audio.current?.suspend(); stopSubscription.current() }
        if (!response.ok) throw new Error(value.error || 'Notifications could not be refreshed.')
        return value as NotificationFeed
      }
      const previous = head.current
      // Catch up by a server-assigned, commit-ordered inbox cursor, in bounded
      // batches. Latest-page reconciliation also synchronizes reads/devices.
      const changes = previous === null ? null : await request(`${base}&after=${previous}`)
      const latest = await request(base)
      if (!mounted.current || !authorized.current || version !== generation.current) return
      const arrivals = changes?.items.slice(0, 50) || []
      head.current = changes ? arrivals.at(-1)?.cursor || previous : latest.head
      if (head.current && BigInt(latest.head) > BigInt(head.current)) again.current = true
      feedRef.current = latest; setFeed(latest); failures.current = 0; setError(''); setStatus(realtime.current ? 'Live' : 'Connected · checking every 10 seconds')
      if (previous === null && latest.preferences.push_enabled) void renewNotificationPush(restaurantId, userId)
      if (previous !== null) {
        const candidates = freshAudible(arrivals, latest.preferences, latest.server_time)
        if (candidates.length && !document.hidden) {
          setToast(notificationTitle(candidates[0]))
          if (latest.preferences.sound_enabled && audio.current?.state === 'running') {
            await claimNotificationSound(`${userId}:${restaurantId}`, candidates, () => playNotificationTone(audio.current!, candidates[0].type, latest.preferences.volume))
          }
        }
      }
    } catch (e) {
      if (mounted.current && version === generation.current && !(e instanceof Error && e.name === 'AbortError')) { failures.current++; setError(e instanceof Error ? e.message : 'Connection interrupted. Retrying.'); setStatus(authorized.current ? 'Reconnecting' : 'Access unavailable') }
    } finally { if (version === generation.current) running.current = false }
  }, [base, restaurantId, userId])
  useEffect(() => {
    generation.current++; mounted.current = true; running.current = false; authorized.current = true; head.current = null; feedRef.current = null; setFeed(null); abort.current = new AbortController()
    let disposed = false
    const client = createSupabaseBrowserClient()
    let timer: ReturnType<typeof setTimeout>, debounce: ReturnType<typeof setTimeout>, channel: ReturnType<typeof client.channel> | null = null
    stopSubscription.current = () => { clearTimeout(timer); clearTimeout(debounce); if (channel) { void client.removeChannel(channel); channel = null } }
    const schedule = () => {
      clearTimeout(timer)
      if (disposed || !mounted.current || !authorized.current) return
      const delay = again.current ? 250 : failures.current ? notificationBackoff(failures.current) : 10_000
      again.current = false
      timer = setTimeout(async () => { if (!document.hidden) await refresh(); schedule() }, delay)
    }
    const update = () => { if (disposed || !authorized.current) return; clearTimeout(debounce); debounce = setTimeout(() => { if (!disposed) void refresh().finally(schedule) }, 150) }
    const wake = () => { if (!document.hidden) update() }
    const pushMessage = (event: MessageEvent) => {
      if (!disposed && authorized.current && !document.hidden && event.data?.type === 'qrush-notification' && event.data.restaurantId === restaurantId) {
        update(); event.ports[0]?.postMessage({ received: true })
      }
    }
    channel = client.channel(`notifications:${userId}:${restaurantId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'notification_signals', filter: `user_id=eq.${userId}` }, payload => {
      if ('restaurant_id' in payload.new && payload.new.restaurant_id === restaurantId) update()
    }).subscribe(value => {
      if (disposed) return
      realtime.current = value === 'SUBSCRIBED'
      if (realtime.current) update()
      else if (mounted.current && authorized.current) setStatus('Reconnecting · polling available')
    })
    const { data: authListener } = client.auth.onAuthStateChange((_event, session) => {
      if (disposed) return
      if (session?.user.id !== userId) {
        authorized.current = false; head.current = null; feedRef.current = null; setFeed(null); setToast(''); setStatus('Signed out'); setAudioReady(false)
        abort.current?.abort(); clearTimeout(timer); clearTimeout(debounce); if (channel) void client.removeChannel(channel)
        void audio.current?.suspend(); void detachNotificationPush()
      }
    })
    void checkPushAccount(userId)
    void refresh().finally(schedule)
    window.addEventListener('online', wake); window.addEventListener('focus', wake); document.addEventListener('visibilitychange', wake)
    navigator.serviceWorker?.addEventListener('message', pushMessage)
    return () => {
      disposed = true; generation.current++; mounted.current = false; abort.current?.abort(); clearTimeout(timer); clearTimeout(debounce)
      window.removeEventListener('online', wake); window.removeEventListener('focus', wake); document.removeEventListener('visibilitychange', wake)
      authListener.subscription.unsubscribe(); if (channel) void client.removeChannel(channel)
      navigator.serviceWorker?.removeEventListener('message', pushMessage)
      void audio.current?.close(); audio.current = null
    }
  }, [refresh, restaurantId, userId])
  useEffect(() => { if (!toast) return; const timeout = setTimeout(() => setToast(''), 5000); return () => clearTimeout(timeout) }, [toast])
  async function mutate(body: unknown) {
    const response = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), value = await response.json()
    if (!response.ok) throw new Error(value.error || 'Could not save notifications.')
    await refresh()
  }
  async function savePreferences(value: NotificationPreferences) { await mutate({ action: 'preferences', data: value }) }
  async function enableSound(test = false) {
    try {
      audio.current ||= new AudioContext()
      audio.current.onstatechange = () => { if (mounted.current) setAudioReady(audio.current?.state === 'running') }
      await audio.current.resume()
      if (audio.current.state !== 'running') throw new Error('Sound is blocked by this browser. Try enabling it again.')
      setAudioReady(true)
      const preferences = feedRef.current?.preferences || DEFAULT_PREFERENCES
      if (!test) await savePreferences({ ...preferences, sound_enabled: true })
      playNotificationTone(audio.current, 'order.new', preferences.volume)
    } catch (e) { setAudioReady(audio.current?.state === 'running'); throw e }
  }
  const value: Context = { restaurantId, userId, ownerView: Boolean(pathname?.startsWith('/dashboard')), feed, status, error, audioReady, refresh, mutate, enableSound, savePreferences,
    saveSettings: data => mutate({ action: 'settings', data }),
    enablePush: async () => { if (!feedRef.current?.pushConfigured) throw new Error('Background notifications need deployment configuration.'); await enableNotificationPush(restaurantId, userId, feedRef.current.pushPublicKey!); await savePreferences({ ...feedRef.current.preferences, push_enabled: true }) },
    disablePush: async () => { await savePreferences({ ...(feedRef.current?.preferences || DEFAULT_PREFERENCES), push_enabled: false }) },
  }
  return <Notifications.Provider value={value}>
    {pathname !== '/dashboard' && <div className="notification-toolbar"><span>Restaurant workspace</span><NotificationBell /></div>}
    {toast && <div className="notification-toast" role="status">{toast}<button type="button" onClick={() => setToast('')} aria-label="Dismiss notification">×</button></div>}
    {children}
  </Notifications.Provider>
}
