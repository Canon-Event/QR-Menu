/* Dedicated notification worker. No fetch caching or offline interception. */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function once(id) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('qrush-push', 1)
    open.onupgradeneeded = () => open.result.createObjectStore('seen', { keyPath: 'id' })
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const db = open.result, tx = db.transaction('seen', 'readwrite'), store = tx.objectStore('seen'), get = store.get(id)
      let fresh = false
      get.onsuccess = () => { if (!get.result) { fresh = true; store.put({ id, at: Date.now() }) } }
      const cursor = store.openCursor()
      cursor.onsuccess = () => { const row = cursor.result; if (!row) return; if (row.value.at < Date.now() - 86400000) row.delete(); row.continue() }
      tx.oncomplete = () => { db.close(); resolve(fresh) }; tx.onerror = () => { db.close(); reject(tx.error) }
    }
  })
}
function forget(id) {
  return new Promise(resolve => {
    const request = indexedDB.open('qrush-push', 1)
    request.onerror = resolve
    request.onsuccess = () => { const db = request.result, tx = db.transaction('seen', 'readwrite'); tx.objectStore('seen').delete(id); tx.oncomplete = () => { db.close(); resolve() } }
  })
}
function acknowledged(client, restaurantId) {
  return new Promise(resolve => {
    const channel = new MessageChannel(), timer = setTimeout(() => { channel.port1.close(); resolve(false) }, 1000)
    channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); resolve(event.data?.received === true) }
    client.postMessage({ type: 'qrush-notification', restaurantId }, [channel.port2])
  })
}
self.addEventListener('push', event => event.waitUntil((async () => {
  let payload
  try { payload = event.data.json() } catch { return }
  if (!uuid.test(payload.id || '') || !uuid.test(payload.subscription || '')) return
  // Check the current cookie session and current permissions/preferences before
  // showing even the minimal lock-screen message (including after account switch).
  const response = await fetch(`/api/notifications/push?id=${payload.id}&subscription=${payload.subscription}`, { credentials: 'include', cache: 'no-store' })
  if (!response.ok) return
  const data = await response.json()
  if (!data.show || !/^\/staff\/[0-9a-f-]+\/notifications\/[0-9a-f-]+$/.test(data.href)) return
  const visible = (await self.clients.matchAll({ type: 'window', includeUncontrolled: true })).filter(client => client.visibilityState === 'visible')
  if (visible.length && (await Promise.all(visible.map(client => acknowledged(client, data.href.split('/')[2])))).some(Boolean)) return
  if (!await once(payload.id)) return
  try { await self.registration.showNotification('Restaurant update', { body: 'Open your workspace to review a new notification.', tag: payload.id, renotify: false, icon: '/assets/brand/wiit-app-icon-512.png', data: { href: data.href } }) }
  catch (error) { await forget(payload.id); throw error }
})().catch(() => {})))
self.addEventListener('notificationclick', event => {
  event.notification.close()
  const href = event.notification.data?.href
  if (!/^\/staff\/[0-9a-f-]+\/notifications\/[0-9a-f-]+$/.test(href || '')) return
  // Middleware preserves this internal destination through login. The resource
  // page checks current authorization again; clicking never changes money.
  event.waitUntil(self.clients.openWindow(href))
})
