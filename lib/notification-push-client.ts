const DEVICE = 'qrush:push-device', OWNER = 'qrush:push-owner'
export function pushSupported() { return typeof window !== 'undefined' && window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window }
export async function detachNotificationPush() {
  try {
    const device = localStorage.getItem(DEVICE)
    if (device) await fetch('/api/notifications/push', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ device }), keepalive: true })
  } catch { /* Local cleanup must also run when the network is unavailable. */ }
  try {
    const registration = await navigator.serviceWorker?.getRegistration('/')
    if (registration?.active?.scriptURL.endsWith('/notifications-sw.js')) {
      await (await registration.pushManager.getSubscription())?.unsubscribe()
      for (const notification of await registration.getNotifications()) notification.close()
    }
  } catch { /* Service-worker authorization also rejects signed-out accounts. */ }
  try { localStorage.removeItem(OWNER) } catch { /* Optional browser storage. */ }
}
export async function checkPushAccount(userId: string) {
  try { if (localStorage.getItem(OWNER) && localStorage.getItem(OWNER) !== userId) await detachNotificationPush() } catch { /* Storage can be disabled. */ }
}
export async function renewNotificationPush(restaurant: string, user: string) {
  if (!pushSupported() || Notification.permission !== 'granted') return
  try {
    if (localStorage.getItem(OWNER) !== user) return
    const device = localStorage.getItem(DEVICE), registration = await navigator.serviceWorker.getRegistration('/')
    if (!device || !registration?.active?.scriptURL.endsWith('/notifications-sw.js')) return
    const subscription = await registration.pushManager.getSubscription()
    if (subscription) await fetch(`/api/notifications/push?restaurant=${restaurant}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ device, subscription: subscription.toJSON() }) })
  } catch { /* The next workspace visit retries renewal without asking permission. */ }
}
export async function enableNotificationPush(restaurant: string, user: string, publicKey: string) {
  if (!pushSupported()) throw new Error('Background notifications are not supported here. On supported phones, try installing this site on your home screen.')
  if (Notification.permission === 'denied') throw new Error('Notifications are blocked. Change this site’s browser permission before trying again.')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Notification permission was not granted.')
  await checkPushAccount(user)
  const existing = await navigator.serviceWorker.getRegistration('/')
  if (existing?.active && !existing.active.scriptURL.endsWith('/notifications-sw.js')) throw new Error('An existing service worker needs notification integration before push can be enabled.')
  await navigator.serviceWorker.register('/notifications-sw.js', { scope: '/' })
  const registration = await navigator.serviceWorker.ready
  const raw = atob(publicKey.replace(/-/g, '+').replace(/_/g, '/')), applicationServerKey = Uint8Array.from(raw, c => c.charCodeAt(0))
  const subscription = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })
  let device = localStorage.getItem(DEVICE)
  if (!device) { device = crypto.randomUUID(); localStorage.setItem(DEVICE, device) }
  const response = await fetch(`/api/notifications/push?restaurant=${restaurant}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ device, subscription: subscription.toJSON() }) })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Could not enable background notifications.')
  localStorage.setItem(OWNER, user)
}
