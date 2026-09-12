import Link from 'next/link'
import Navbar from '@/components/marketing/Navbar'
import Footer from '@/components/marketing/Footer'
import PricingSection from '@/components/marketing/PricingSection'
import { IconArrowRight, IconCalendarCheck, IconHeadset, IconRefresh, IconShieldCheck } from '@/components/marketing/Icons'

const footerItems = [
  { icon: IconCalendarCheck, title: '14-Day Free Trial', text: 'No credit card required.' },
  { icon: IconRefresh, title: 'Cancel Anytime', text: 'No hidden charges.' },
  { icon: IconShieldCheck, title: 'Secure & Reliable', text: 'Your data is safe with us.' },
]

export const metadata = { title: 'Plans — FlavorBox', description: 'Choose a FlavorBox digital menu plan for your restaurant.' }

export default function PlansPage() {
  return (
    <main className="min-h-screen bg-[var(--surface)]">
      <section className="page-shell">
        <Navbar active="Pricing" ctaLabel="Get Started" ctaHref="/register" />
        <div className="pb-8 pt-8 text-center sm:pt-10">
          <h1 className="serif-heading mt-2 text-4xl leading-tight sm:text-[3.4rem]">Choose the <span className="text-brand-500">Perfect Plan</span></h1>
          <p className="mt-2 text-sm text-ink/60">Simple pricing. Powerful features. Built for every restaurant.</p>
          <PricingSection />
        </div>

          <div className="mx-auto mb-5 flex max-w-[890px] flex-col gap-4 rounded-[10px] bg-[var(--surface-warm)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-forest text-white"><IconHeadset className="h-5 w-5" /></span><div><p className="font-serif text-lg">Need help choosing a plan?</p><p className="mt-0.5 text-[10px] text-ink/60">Our team is here to help you find the right fit.</p></div></div><Link href="/contact" className="button-outline shrink-0 px-5 py-2 text-[10px]">Contact Sales <IconArrowRight className="h-3 w-3" /></Link>
        </div>
      </section>
      <div className="bg-forest text-white"><div className="page-shell grid gap-5 py-5 sm:grid-cols-2 lg:grid-cols-3">{footerItems.map(({ icon: Icon, title, text }) => <div key={title} className="flex gap-3 border-white/20 sm:border-r sm:pr-4 last:border-0"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 text-white"><Icon className="h-5 w-5" /></span><div><p className="text-[11px] font-semibold">{title}</p><p className="mt-1 max-w-[150px] text-[9px] leading-4 text-white/60">{text}</p></div></div>)}</div></div>

      <Footer />
    </main>
  )
}
