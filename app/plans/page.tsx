import type { Metadata } from 'next'
import Link from 'next/link'
import Navbar from '@/components/marketing/Navbar'
import Footer from '@/components/marketing/Footer'
import PricingSection from '@/components/marketing/PricingSection'
import { IconArrowRight, IconCalendarCheck, IconHeadset, IconRefresh, IconShieldCheck } from '@/components/marketing/Icons'

export const metadata: Metadata = {
  title: 'QR Menu Pricing for Restaurants | WIIT Plans',
  description: 'Compare WIIT plans for restaurant QR menus, online ordering, bookings, dish 3D models, and employee management. Start free or choose a monthly plan.',
  keywords: ['restaurant QR menu pricing', 'digital menu plans', 'QR code ordering for restaurants', 'restaurant employee management'],
}

const footerItems = [
  { icon: IconCalendarCheck, title: '14-day free trial', text: 'No credit card required.' },
  { icon: IconRefresh, title: 'Cancel anytime', text: 'No hidden charges.' },
  { icon: IconShieldCheck, title: 'Secure and reliable', text: 'Your data is safe with us.' },
]

const faqs = [
  {
    question: 'How does the Free plan charge for orders?',
    answer: 'The Free plan has no monthly subscription. It includes a 2% fee on each order transaction made through the dynamic QR menu.',
  },
  {
    question: 'What is the difference between a dynamic and a static QR menu?',
    answer: 'With Free, guests can choose items and quantities to place an order from your QR menu. Standard and Premium have a QR menu guests can browse, plus direct booking.',
  },
  {
    question: 'What do I get with Premium?',
    answer: 'Premium includes everything in Standard, plus a custom menu design, 3D dish views, full employee management, and an advanced dashboard with analytics.',
  },
  {
    question: 'How does Premium pricing work?',
    answer: 'The first month is ₹7,999 and includes setup. From the second month onward, Premium is ₹4,599 per month.',
  },
]

export default function PlansPage() {
  return (
    <main className="min-h-screen bg-[var(--surface)]">
      <section className="page-shell">
        <Navbar active="Pricing" ctaLabel="Get Started" ctaHref="/register" />
        <div className="pb-10 pt-8 text-center sm:pt-12">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-forest">Straightforward plans for restaurants</p>
          <h1 className="serif-heading mt-3 text-4xl leading-tight sm:text-[3.4rem]">QR menu pricing that <span className="text-brand-500">fits your restaurant</span></h1>
          <p className="mx-auto mt-3 max-w-2xl text-base leading-7 text-ink/65">Start with a free QR ordering menu, then add bookings, richer dish displays, and tools for your team as you grow.</p>
          <PricingSection />
          <p className="mx-auto mt-1 max-w-2xl text-xs leading-5 text-ink/55">Premium includes setup in the first month. Free plan orders have a 2% transaction fee.</p>
        </div>

        <section className="mx-auto mb-10 max-w-[900px] rounded-2xl border border-[var(--line)] bg-white px-6 py-7 sm:px-8" aria-labelledby="plan-help-heading">
          <div className="grid gap-7 md:grid-cols-[1fr_0.85fr] md:items-center">
            <div>
              <h2 id="plan-help-heading" className="font-serif text-2xl">A quick guide to the plans</h2>
              <p className="mt-2 text-sm leading-6 text-ink/65">Free includes QR ordering and a simple dashboard to track orders. Standard adds direct bookings, menu media, employee tools, and a dashboard for your day-to-day work. Premium adds a custom menu design, 3D dish views, full employee management, and analytics.</p>
            </div>
            <div className="flex flex-col gap-3 rounded-xl bg-[var(--surface-warm)] p-5 sm:flex-row sm:items-center sm:justify-between md:flex-col md:items-start">
              <div className="flex items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-forest text-white"><IconHeadset className="h-5 w-5" /></span><div><p className="font-serif text-lg">Need a hand choosing?</p><p className="mt-1 text-xs text-ink/60">Tell us what your restaurant needs.</p></div></div>
              <Link href="/contact" className="button-outline shrink-0 px-5 py-2.5 text-xs">Talk to our team <IconArrowRight className="h-3.5 w-3.5" /></Link>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[900px] pb-12" aria-labelledby="plans-faq-heading">
          <h2 id="plans-faq-heading" className="serif-heading text-center text-3xl">Plans, explained</h2>
          <div className="mt-5 divide-y divide-[var(--line)] rounded-2xl border border-[var(--line)] bg-white px-5 sm:px-7">
            {faqs.map(({ question, answer }) => (
              <details key={question} className="group py-5">
                <summary className="cursor-pointer list-none pr-8 text-sm font-semibold text-ink marker:hidden [&::-webkit-details-marker]:hidden">{question}</summary>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-ink/65">{answer}</p>
              </details>
            ))}
          </div>
        </section>
      </section>

      <div className="bg-forest text-white">
        <div className="page-shell grid gap-5 py-5 sm:grid-cols-2 lg:grid-cols-3">
          {footerItems.map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex gap-3 border-white/20 sm:border-r sm:pr-4 last:border-0">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 text-white"><Icon className="h-5 w-5" /></span>
              <div><p className="text-sm font-semibold">{title}</p><p className="mt-1 max-w-[180px] text-xs leading-5 text-white/70">{text}</p></div>
            </div>
          ))}
        </div>
      </div>
      <Footer />
    </main>
  )
}
