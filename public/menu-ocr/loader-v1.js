// Small first-party loader. The large OCR runtime is fetched only inside this worker.
const base = new URL('./paddle-0.4.2/', self.location.href)
const cacheName = 'wiit-menu-ocr-0.4.2'
const originalFetch = self.fetch.bind(self)
let storage
async function cachedFetch(input, options) {
  const request = new Request(input, options)
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) return originalFetch(request)
  if (!storage) storage = typeof caches === 'undefined' ? Promise.resolve(null) : caches.open(cacheName).catch(() => null)
  const cache = await storage
  const saved = await cache?.match(request).catch(() => undefined)
  if (saved) return saved
  const response = await originalFetch(request)
  // Finish the write before model initialization: the worker is terminated after
  // recognition, which can otherwise interrupt a pending large WASM cache write.
  if (response.ok && cache) await cache.put(request, response.clone()).catch(() => {})
  return response
}
self.fetch = cachedFetch
try {
  const response = await cachedFetch(new URL('vendor-worker.js', base))
  if (!response.ok) throw new Error('Text reader files are unavailable.')
  const moduleUrl = URL.createObjectURL(await response.blob())
  try { await import(moduleUrl) } finally { URL.revokeObjectURL(moduleUrl) }
  self.postMessage({ kind: 'menu-ocr-ready' })
} catch {
  self.postMessage({ kind: 'menu-ocr-loader-error', message: 'Could not load the text reader. Check your connection and try again.' })
}
