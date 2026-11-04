import type { InboxItem } from './notifications'

export function playNotificationTone(context: AudioContext, type: string, volume: number) {
  if (context.state !== 'running') throw new Error('Enable sound in this tab first.')
  const notes = type === 'order.escalation' ? [880, 660, 880] : type === 'order.ready' ? [520, 780] : [660, 880]
  notes.forEach((frequency, index) => {
    const oscillator = context.createOscillator(), gain = context.createGain(), start = context.currentTime + index * .16
    oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(Math.min(1, volume) * .16, start + .015); gain.gain.exponentialRampToValueAtTime(.001, start + .13)
    oscillator.connect(gain); gain.connect(context.destination); oscillator.start(start); oscillator.stop(start + .15)
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect() }
  })
}

/** Web Locks serialize the shared high-water mark across tabs. The fallback
 * elects one visible tab using a short localStorage lease; with storage blocked,
 * automatic sound stays off instead of ringing in every tab. */
export async function claimNotificationSound(scope: string, items: InboxItem[], play: () => void) {
  if (document.hidden || !items.length) return false
  const key = `qrush:audio:${scope}`, highest = items.reduce((a, b) => BigInt(a.cursor) > BigInt(b.cursor) ? a : b).cursor
  const claimed = () => {
    if (document.hidden) return false
    try {
      if (BigInt(localStorage.getItem(key) || '0') >= BigInt(highest)) return false
      localStorage.setItem(key, highest); play(); return true
    } catch { return false }
  }
  if (navigator.locks) return navigator.locks.request(key, { ifAvailable: true }, lock => lock ? claimed() : false)
  try {
    const leaseKey = `${key}:lease`, id = crypto.randomUUID(), old = JSON.parse(localStorage.getItem(leaseKey) || 'null')
    if (old?.until > Date.now()) return false
    localStorage.setItem(leaseKey, JSON.stringify({ id, until: Date.now() + 2000 }))
    await new Promise(resolve => setTimeout(resolve, 100))
    try { return JSON.parse(localStorage.getItem(leaseKey) || 'null')?.id === id ? claimed() : false }
    finally { if (JSON.parse(localStorage.getItem(leaseKey) || 'null')?.id === id) localStorage.removeItem(leaseKey) }
  } catch { return false }
}
