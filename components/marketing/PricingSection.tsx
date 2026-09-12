'use client'

import Link from 'next/link'
import { useState } from 'react'
import { IconArrowRight, IconCheck, IconCircleSlash, IconCrown, IconStar } from '@/components/marketing/Icons'

const plans = [
  { name: 'Basic', description: 'Perfect for small cafés and startups.', monthly: 499, icon: IconCircleSlash, features: ['Unlimited Menu Items', 'QR Code Access', 'Basic Analytics', 'Custom Categories', 'Email Support'] },
  { name: 'Premium', description: 'Great for growing restaurants.', monthly: 999, icon: IconStar, popular: true, features: ['Everything in Basic', 'Food Images', 'Advanced Analytics', 'Custom Branding', 'Priority Support', 'Multiple QR Codes'] },
  { name: 'Pro', description: 'For large restaurants and chains.', monthly: 1499, icon: IconCrown, features: ['Everything in Premium', 'Multi-branch Support', 'Team Access', 'Detailed Reports', 'API Access', '24/7 Priority Support'] },
]

export default function PricingSection() {
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly')
  const isYearly = billing === 'yearly'

  return (
    <>
      <div className="mx-auto mt-4 inline-flex items-center rounded-full border border-[var(--line)] bg-white p-1 text-xs font-semibold shadow-sm" role="group" aria-label="Billing period">
        <button type="button" onClick={() => setBilling('monthly')} aria-pressed={!isYearly} className={`rounded-full px-5 py-2 transition ${!isYearly ? 'bg-forest text-white' : 'text-ink/70 hover:text-ink'}`}>Monthly</button>
        <button type="button" onClick={() => setBilling('yearly')} aria-pressed={isYearly} className={`rounded-full px-5 py-2 transition ${isYearly ? 'bg-forest text-white' : 'text-ink/70 hover:text-ink'}`}>Yearly</button>
        <span className="mr-1 rounded-full bg-sage px-2 py-1 text-[10px] text-forest/80">Save 20%</span>
      </div>

      <div className="pricing-cards mx-auto mt-8 grid max-w-[890px] items-stretch gap-6 pb-5 lg:grid-cols-3 lg:gap-6">
        {plans.map(({ name, description, monthly, icon: Icon, popular, features }) => {
          const price = isYearly ? Math.round(monthly * 0.8) : monthly
          return (
            <article key={name} className={`relative flex min-h-[305px] flex-col rounded-[10px] border bg-white px-6 pb-5 ${popular ? 'border-brand-500 pt-11 shadow-lg shadow-brand-500/10 lg:-mt-3' : 'border-[var(--line)] pt-6'}`}>
              {popular && <div className="absolute inset-x-0 top-0 rounded-t-[9px] bg-forest py-1.5 text-center text-[9px] font-semibold uppercase tracking-wider text-white">Most Popular</div>}
              <div className="flex items-start gap-3"><span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${popular ? 'bg-brand-500 text-white' : 'bg-sage text-forest'}`}><Icon className="h-5 w-5" /></span><div><h2 className="font-serif text-xl">{name}</h2><p className="mt-0.5 max-w-[145px] text-[10px] leading-4 text-ink/65">{description}</p></div></div>
              <p className="mt-5 border-b border-[var(--line)] pb-3 font-sans text-3xl font-bold tracking-tight"><span className={`mr-1 text-sm ${popular ? 'text-brand-500' : ''}`}>₹</span><span className={popular ? 'text-brand-500' : ''}>{price.toLocaleString('en-IN')}</span><span className="ml-1 text-[10px] font-medium text-ink/60">/month</span></p>
              <ul className="mt-3 flex-1 space-y-1.5">{features.map((feature) => <li key={feature} className="flex gap-2 text-[10px] leading-4 text-ink/75"><IconCheck className={`h-3.5 w-3.5 shrink-0 ${popular ? 'text-brand-500' : 'text-forest'}`} />{feature}</li>)}</ul>
              <Link href="/register" className={`${popular ? 'button-primary' : 'button-outline'} mt-4 w-full py-2 text-[11px]`}>Get Started <IconArrowRight className="h-3 w-3" /></Link>
            </article>
          )
        })}
      </div>
    </>
  )
}
