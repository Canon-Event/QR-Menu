type Draft = { slug: string; customerName: string; phone: string; note: string; items: { dishId: string; quantity: number }[]; context?: string }
export type PendingOrder = { key: string; draft: Draft }
export function pendingOrder(storage: Pick<Storage, 'getItem' | 'setItem'> | null, draft: Draft, previous?: PendingOrder | null): PendingOrder {
  const normalized = { ...draft, items: [...draft.items].sort((a,b) => a.dishId.localeCompare(b.dishId)) }
  const fingerprint = JSON.stringify(normalized)
  let saved = previous
  try { saved ||= JSON.parse(storage?.getItem(`wiit-order:${draft.slug}`) || 'null') } catch { /* Storage can be disabled. */ }
  if (saved && /^[0-9a-f-]{36}$/i.test(saved.key) && JSON.stringify(saved.draft) === fingerprint) return saved
  const result = { key: crypto.randomUUID(), draft: normalized }
  try { storage?.setItem(`wiit-order:${draft.slug}`, JSON.stringify(result)) } catch { /* In-memory retries still use the same key. */ }
  return result
}
