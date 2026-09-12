'use client'

import { FormEvent, useState } from 'react'
import { IconArrowRight } from '@/components/marketing/Icons'

type FormState = 'idle' | 'sending' | 'success' | 'error'

export default function ContactForm() {
  const [state, setState] = useState<FormState>('idle')
  const [message, setMessage] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setState('sending')
    setMessage('')
    const form = event.currentTarget
    const formData = new FormData(form)
    const payload = Object.fromEntries(formData.entries())

    try {
      const response = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to send your message.')
      form.reset()
      setState('success')
      setMessage('Thanks. We received your message and will be in touch soon.')
    } catch (error) {
      setState('error')
      setMessage(error instanceof Error ? error.message : 'Unable to send your message.')
    }
  }

  return <form onSubmit={handleSubmit} className="mt-5 space-y-3" noValidate>
    <div className="grid gap-3 sm:grid-cols-2"><Field name="name" label="Your Name" type="text" required /><Field name="email" label="Email Address" type="email" required /></div>
    <Field name="phone" label="Phone Number" type="tel" />
    <Field name="subject" label="Subject" type="text" required />
    <label className="block"><span className="sr-only">Your Message</span><textarea name="message" required minLength={10} maxLength={2000} rows={5} placeholder="Your Message" className="contact-field resize-y" /></label>
    <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
    <div className="flex flex-wrap items-center gap-4"><button type="submit" disabled={state === 'sending'} className="button-dark px-4 py-2 text-[10px] disabled:cursor-wait disabled:opacity-60">{state === 'sending' ? 'Sending...' : 'Send Message'} <IconArrowRight className="h-3 w-3" /></button>{message && <p role="status" className={`text-xs ${state === 'success' ? 'text-ink' : 'text-red-700'}`}>{message}</p>}</div>
  </form>
}

function Field({ name, label, type, required = false }: { name: string; label: string; type: string; required?: boolean }) {
  return <label className="block"><span className="sr-only">{label}</span><input name={name} type={type} required={required} maxLength={name === 'email' ? 254 : 120} placeholder={label} className="contact-field" /></label>
}
