'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Mascot } from 'page-mascot'
import { IconArrowRight, IconCheck } from '@/components/marketing/Icons'

type PlanName = 'Free' | 'Standard' | 'Premium'
type ChefMode = 'pointer' | 'touch' | 'keyboard' | null

const plans = [
  {
    name: 'Free',
    description: 'Guests can scan, browse and order from your menu.',
    price: '₹0',
    priceNote: '2% fee on each order',
    ongoingPrice: undefined,
    noteTitle: 'Need a custom look?',
    note: 'Ask us about custom menu design as a paid add-on.',
    reaction: '50% 0%',
    accessory: 'free',
    message: <>It’s <strong>FREE</strong>, chef! Let’s get cooking.</>,
    features: [
      'Guests choose dishes and quantities from your menu',
      'Choose from a selection of ready-made menu designs',
      'Track orders from a simple dashboard',
    ],
    action: 'Get started free',
  },
  {
    name: 'Standard',
    description: 'Bookings, a browsable QR menu, and useful tools for your team.',
    price: '₹1,499',
    priceNote: 'per month',
    ongoingPrice: undefined,
    noteTitle: undefined,
    note: undefined,
    reaction: '100% 50%',
    accessory: 'standard',
    message: <>Ooo chef, now we mean <strong>business</strong>!</>,
    features: [
      'Guests can book directly with your restaurant',
      'A QR menu for browsing dishes and prices',
      { label: 'Show guests photos and videos of your dishes', note: 'Limited media storage is included.' },
      'Manage staff details, roles and shifts',
      'One dashboard for your menu, bookings and team',
    ],
    action: 'Choose Standard',
  },
  {
    name: 'Premium',
    description: 'A menu designed for you, plus more for your team.',
    price: '₹7,999',
    priceNote: 'First month, including setup',
    ongoingPrice: 'From month two: ₹4,599/month',
    noteTitle: undefined,
    note: undefined,
    reaction: '50% 50%',
    accessory: 'premium',
    message: <>Okayyy chef, this hits <strong>DIFFERENT</strong>!</>,
    popular: true,
    features: [
      'Everything in Standard',
      'A custom menu designed around your restaurant',
      '3D views of your dishes',
      'Full access to employee management tools',
      'Advanced dashboard with analytics',
    ],
    action: 'Choose Premium',
  },
]

const mascotDirections = '/mascots/chef-directions.webp'
const mascotReactions = '/mascots/chef-reactions.webp'

function ChefSpeechBubble({ visible, children }: { visible: boolean; children: React.ReactNode }) {
  return (
    <div className="pricing-chef-bubble-slot">
      <div className={`pricing-chef-bubble ${visible ? 'is-visible' : ''}`}>
        <span aria-hidden={!visible} role={visible ? 'status' : undefined} aria-live={visible ? 'polite' : undefined}>{children}</span>
      </div>
    </div>
  )
}

function ChefAccessory({ kind, active, sparkling }: { kind: string; active: boolean; sparkling: boolean }) {
  if (!active) return null

  if (kind === 'free') {
    return <span className="pricing-chef-sign" aria-hidden="true">FREE</span>
  }

  if (kind === 'standard') {
    return (
      <span className="pricing-chef-menu" aria-hidden="true">
        <b>MENU</b><i /><i /><i />
      </span>
    )
  }

  if (kind === 'premium' && sparkling) {
    return (
      <span className="pricing-chef-sparkles" aria-hidden="true">
        <svg viewBox="0 0 20 20"><path d="M10 1.5 12 8l6.5 2-6.5 2-2 6.5L8 12l-6.5-2L8 8l2-6.5Z" /></svg>
        <svg viewBox="0 0 20 20"><path d="M10 1.5 12 8l6.5 2-6.5 2-2 6.5L8 12l-6.5-2L8 8l2-6.5Z" /></svg>
        <svg viewBox="0 0 20 20"><path d="M10 1.5 12 8l6.5 2-6.5 2-2 6.5L8 12l-6.5-2L8 8l2-6.5Z" /></svg>
      </span>
    )
  }

  return null
}

export default function PricingSection() {
  const [tipOpen, setTipOpen] = useState(false)
  const [activePlan, setActivePlan] = useState<PlanName | null>(null)
  const [activeMode, setActiveMode] = useState<ChefMode>(null)
  const [reactionPlan, setReactionPlan] = useState<PlanName | null>(null)
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    const directions = new Image()
    const reactions = new Image()
    directions.src = mascotDirections
    reactions.src = mascotReactions
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updatePreference = () => setReducedMotion(media.matches)
    updatePreference()
    media.addEventListener('change', updatePreference)
    return () => media.removeEventListener('change', updatePreference)
  }, [])

  useEffect(() => {
    if (!activePlan) return
    setReactionPlan(activePlan)
    const timer = window.setTimeout(() => setReactionPlan(null), activePlan === 'Premium' ? 650 : 450)
    return () => window.clearTimeout(timer)
  }, [activePlan])

  useEffect(() => {
    const dismissTouchMascot = (event: PointerEvent) => {
      const target = event.target
      if (event.pointerType === 'touch' && target instanceof Element && !target.closest('[data-pricing-chef]')) {
        setActivePlan(null)
        setActiveMode(null)
      }
    }
    document.addEventListener('pointerdown', dismissTouchMascot)
    return () => document.removeEventListener('pointerdown', dismissTouchMascot)
  }, [])

  useEffect(() => {
    if (!tipOpen && !activePlan) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setTipOpen(false)
        setActivePlan(null)
        setActiveMode(null)
      }
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [tipOpen, activePlan])

  return (
    <div className="pricing-cards mx-auto mt-8 grid max-w-[1050px] items-stretch gap-5 pb-5 lg:grid-cols-3">
      {plans.map(({ name, description, price, priceNote, ongoingPrice, noteTitle, note, reaction, accessory, message, popular, features, action }) => {
        const planName = name as PlanName
        const active = activePlan === planName
        const liveTracking = active && activeMode === 'pointer' && !reducedMotion
        const reacting = active && reactionPlan === planName

        return (
          <article
            key={name}
            onPointerEnter={(event) => {
              if (event.pointerType === 'mouse') {
                setActivePlan(planName)
                setActiveMode('pointer')
              }
            }}
            onPointerLeave={(event) => {
              if (event.pointerType === 'mouse') {
                setActivePlan(null)
                setActiveMode(null)
              }
            }}
            onFocus={(event) => {
              if ((event.target as HTMLElement).closest('[data-pricing-chef]')) {
                setActivePlan(planName)
                setActiveMode('keyboard')
              }
            }}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setActivePlan(null)
                setActiveMode(null)
              }
            }}
            onClick={(event) => {
              if ((event.target as HTMLElement).closest('[data-pricing-chef]') && liveTracking) {
                setActiveMode('pointer')
              }
            }}
            className={`relative flex min-h-[460px] flex-col rounded-2xl border bg-white p-6 text-left transition duration-300 ${popular ? 'border-brand-500 shadow-xl shadow-brand-500/10' : 'border-[var(--line)]'} ${active ? 'pricing-chef-card-active' : ''}`}
          >
            <div className="mb-3 flex h-6 items-center">
              {popular && <span className="rounded-full bg-forest px-3 py-1 text-[11px] font-semibold text-white">Best for growing restaurants</span>}
            </div>
            <div className="flex min-h-[112px] items-center gap-2">
              <div data-pricing-chef className={`pricing-chef-frame pricing-chef-${accessory} ${active ? 'is-active' : ''}`}>
                {liveTracking ? (
                  <Mascot directions={mascotDirections} reactions={mascotReactions} size={92} label={`${name} plan chef`} className="pricing-chef-live" />
                ) : (
                  <button
                    type="button"
                    className="pricing-chef-static"
                    aria-label={`Show the ${name} plan chef reaction`}
                    aria-expanded={active}
                    onClick={() => {
                      setActivePlan((current) => current === planName && activeMode === 'touch' ? null : planName)
                      setActiveMode((current) => current === 'touch' && activePlan === planName ? null : 'touch')
                    }}
                  >
                    <span aria-hidden="true" />
                  </button>
                )}
                {reacting && <span className="pricing-chef-reaction" aria-hidden="true" style={{ backgroundImage: `url(${mascotReactions})`, backgroundPosition: reaction }} />}
                <ChefAccessory kind={accessory} active={active} sparkling={reacting} />
              </div>
              <div className="min-w-0">
                <h2 className="font-serif text-2xl">{name}</h2>
                <p className="mt-1 text-sm leading-5 text-ink/65">{description}</p>
              </div>
            </div>
            <ChefSpeechBubble visible={active}>{message}</ChefSpeechBubble>
            <div className="mt-2 min-h-[104px] border-b border-[var(--line)] pb-4">
              <p className="flex min-h-9 flex-wrap items-baseline gap-x-2">
                <span className={`font-sans text-3xl font-bold tracking-tight ${popular ? 'text-brand-500' : ''}`}>{price}</span>
              </p>
              <p className="mt-1 text-xs text-ink/60">{priceNote}</p>
              {ongoingPrice && <p className="mt-1 text-xs font-semibold text-forest">{ongoingPrice}</p>}
            </div>
            <ul className="mt-5 space-y-3">
              {features.map((feature) => (
                <li key={typeof feature === 'string' ? feature : feature.label} className="flex gap-2.5 text-sm leading-5 text-ink/75">
                  <IconCheck className={`mt-0.5 h-4 w-4 shrink-0 ${popular ? 'text-brand-500' : 'text-forest'}`} />
                  <span>
                    {typeof feature === 'string' ? feature : <>{feature.label}<span className="mt-1 block text-xs leading-4 text-ink/55">{feature.note}</span></>}
                  </span>
                </li>
              ))}
            </ul>
            {note && (
              <aside className="mt-4 border-t border-[var(--line)] pt-3 text-xs leading-5 text-ink/60">
                {noteTitle && <span className="font-semibold text-forest">{noteTitle} </span>}
                <span>{note}</span>
              </aside>
            )}
            {name === 'Free' && (
              <button
                type="button"
                onClick={() => setTipOpen(true)}
                className="mt-3 self-start text-xs font-semibold text-forest underline decoration-forest/40 underline-offset-4 hover:decoration-forest"
                aria-haspopup="dialog"
              >
                A quick tip for getting started
              </button>
            )}
            <Link href="/register" className={`${popular ? 'button-primary' : 'button-outline'} mt-auto w-full py-3 text-sm`}>
              {action} <IconArrowRight className="h-4 w-4" />
            </Link>
          </article>
        )
      })}
      {tipOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/55 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setTipOpen(false)
          }}
        >
          <section role="dialog" aria-modal="true" aria-labelledby="free-plan-tip-title" className="w-full max-w-md rounded-2xl bg-white p-6 text-left shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-wide text-forest">A quick tip</p>
            <h2 id="free-plan-tip-title" className="mt-2 font-serif text-2xl">Try it at one table first</h2>
            <p className="mt-3 text-sm leading-6 text-ink/70">Want to see how QR ordering works before using it across your restaurant? Create your menu, place its QR code on one table, and try the order flow. Add it to more tables when you’re ready.</p>
            <button type="button" onClick={() => setTipOpen(false)} className="button-primary mt-5 w-full py-3 text-sm">Got it</button>
          </section>
        </div>
      )}
    </div>
  )
}
