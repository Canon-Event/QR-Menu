import { createRateLimiter, clientIp } from '@/lib/request-security'
import { rejectUnsafeRequest } from '@/lib/menu-api'
import { readJsonBody } from '@/lib/request-security'
import { NextResponse } from 'next/server'

const rateLimited = createRateLimiter(5)

function escapeHtml(value: string) {
  return value.replace(/[&<>'\"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '\"': '&quot;' }[character] || character))
}

async function sendBrevoNotification(details: { name: string; email: string; phone: string; subject: string; message: string }) {
  const apiKey = process.env.BREVO_API_KEY
  const senderEmail = process.env.BREVO_SENDER_EMAIL
  const recipientEmail = process.env.CONTACT_NOTIFICATION_EMAIL
  if (!apiKey || !senderEmail || !recipientEmail) return { sent: false, reason: 'missing configuration' }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8_000)
  try {
    const safe = Object.fromEntries(Object.entries(details).map(([key, value]) => [key, escapeHtml(value)])) as typeof details
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { accept: 'application/json', 'api-key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        sender: { email: senderEmail, name: process.env.BREVO_SENDER_NAME || 'WIIT' },
        to: [{ email: recipientEmail }],
        replyTo: { email: details.email, name: details.name },
        subject: `Contact form: ${details.subject}`,
        htmlContent: `<h2>New contact form message</h2><p><strong>Name:</strong> ${safe.name}</p><p><strong>Email:</strong> ${safe.email}</p><p><strong>Phone:</strong> ${safe.phone || 'Not provided'}</p><p><strong>Subject:</strong> ${safe.subject}</p><p><strong>Message:</strong><br>${safe.message.replace(/\n/g, '<br>')}</p>`,
      }),
      signal: controller.signal,
    })
    if (!response.ok) return { sent: false, reason: `Brevo returned ${response.status}: ${(await response.text()).slice(0, 300)}` }
    return { sent: true }
  } catch {
    return { sent: false, reason: 'Brevo request failed or timed out' }
  } finally {
    clearTimeout(timeout)
  }
}

export async function POST(request: Request) {
  const unsafe = rejectUnsafeRequest(request); if (unsafe) return unsafe
  if (rateLimited(clientIp(request))) return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 })

  const ip = clientIp(request)

  let body: Record<string, unknown>
  try {
    const parsed = await readJsonBody(request)
    if (!parsed) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
    body = parsed
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  if (typeof body.website === 'string' && body.website.trim()) return NextResponse.json({ ok: true })

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const phone = typeof body.phone === 'string' ? body.phone.trim() : ''
  const subject = typeof body.subject === 'string' ? body.subject.trim() : ''
  const message = typeof body.message === 'string' ? body.message.trim() : ''

  if (!name || name.length > 120 || !subject || subject.length > 120 || message.length < 10 || message.length > 2000) return NextResponse.json({ error: 'Please complete the form with valid details.' }, { status: 400 })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
  if (phone.length > 40) return NextResponse.json({ error: 'Please enter a valid phone number.' }, { status: 400 })
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: 'Contact service is not configured yet.' }, { status: 503 })

  const { supabaseAdmin } = await import('@/lib/supabase')
  const { error } = await supabaseAdmin().from('contact_messages').insert({ name, email, phone: phone || null, subject, message, ip_address: ip })
  if (error) return NextResponse.json({ error: 'We could not send your message. Please try again.' }, { status: 500 })
  const notification = await sendBrevoNotification({ name, email, phone, subject, message })
  if (!notification.sent) console.error(`Brevo contact notification was not sent: ${notification.reason}`)
  return NextResponse.json({ ok: true, notificationSent: notification.sent })
}
