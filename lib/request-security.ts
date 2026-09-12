// Local protection only: production replicas also need a shared edge rate limit.
export function createRateLimiter(limit: number, windowMs = 600_000, capacity = 10_000) {
  const entries = new Map<string, { count: number; expires: number }>()
  return (key: string, now = Date.now()) => {
    while (entries.size) {
      const [id, entry] = entries.entries().next().value!
      if (entry.expires > now) break
      entries.delete(id)
    }
    const entry = entries.get(key)
    if (entry) return ++entry.count > limit
    // Fail closed when full instead of evicting active limits.
    if (entries.size >= capacity) return true
    entries.set(key, { count: 1, expires: now + windowMs })
    return false
  }
}

export async function readFormBody(request: Request, maxBytes = 4 * 1024 * 1024 + 65536) {
  const reader = request.body?.getReader()
  if (!reader) return null
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) { await reader.cancel(); return null }
      chunks.push(value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    return await new Response(bytes, { headers: { 'Content-Type': request.headers.get('content-type') || '' } }).formData()
  } catch { return null } finally { reader.releaseLock() }
}

export function clientIp(request: Request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim().slice(0, 128) || 'unknown'
}

/** Bound actual streamed bytes, including requests without Content-Length. */
export async function readJsonBody(request: Request): Promise<Record<string, any> | null> {
  const reader = request.body?.getReader()
  if (!reader) return null
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 32_000) {
        await reader.cancel()
        return null
      }
      chunks.push(value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    return body && typeof body === 'object' && !Array.isArray(body) ? body : null
  } catch {
    return null
  } finally {
    reader.releaseLock()
  }
}
