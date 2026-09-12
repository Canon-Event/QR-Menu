import Image from 'next/image'
import Link from 'next/link'
import Navbar from '@/components/marketing/Navbar'
import Footer from '@/components/marketing/Footer'
import {
  IconArrowRight,
  IconDownload,
  IconGift,
  IconPhone,
  IconPencil,
  IconPlay,
  IconQrCode,
  IconStar,
  IconTrendingUp,
  IconUsers,
} from '@/components/marketing/Icons'

export const metadata = {
  title: 'QR Menu for Restaurants and Cafés | FlavorBox',
  description: 'Create a beautiful digital QR menu for your restaurant or café. Add dishes, update prices, and share your menu with one easy-to-scan QR code.',
}

const benefits = [
  { icon: IconUsers, title: 'Contactless', text: 'Safe & hygienic experience' },
  { icon: IconDownload, title: 'Easy to Update', text: 'Real-time changes anytime' },
  { icon: IconPhone, title: 'Mobile Friendly', text: 'Works on all devices' },
  { icon: IconTrendingUp, title: 'Increase Sales', text: 'Better customer experience' },
]

const steps = [
  { number: '01', icon: IconPencil, title: 'Create Your Menu', text: 'Add your items, images, prices and categories.' },
  { number: '02', icon: IconQrCode, title: 'Generate QR Code', text: 'We generate a unique QR code for your menu.' },
  { number: '03', icon: IconUsers, title: 'Share & Enjoy', text: 'Place the QR on your table and let customers scan & order.' },
]

export default function HomePage() {
  return (
    <main className="marketing-home">
      <section className="page-shell">
        <Navbar active="Home" ctaLabel="View Plans" ctaHref="/plans" />

        <div className="home-hero">
          <div className="relative z-10">
            <p className="eyebrow mb-4">A simpler way to serve your menu</p>
            <h1 className="serif-heading max-w-xl text-5xl leading-[0.98] sm:text-6xl lg:text-[4.5rem]">
              Your Digital Menu,<br /><span className="text-brand-500">Just a Scan</span> Away.
            </h1>
            <p className="mt-6 max-w-md text-base leading-7 text-ink/65">
              Create a digital menu for your restaurant or café, share it with one QR code, and update it whenever your menu changes.
            </p>
            <div className="home-hero-actions mt-7 flex flex-wrap gap-3">
              <Link href="#how-it-works" className="button-dark">
                Explore Menu Demo <IconArrowRight className="h-4 w-4" />
              </Link>
              <Link href="#how-it-works" className="button-outline">
                <IconPlay className="h-4 w-4" /> See How It Works
              </Link>
            </div>
            <div className="mt-8 flex max-w-md items-center gap-3 border-l-2 border-brand-500 pl-3 text-xs text-ink/60"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-500"><IconStar className="h-4 w-4" /></span><div><p className="whitespace-normal font-serif text-xs text-ink sm:whitespace-nowrap sm:text-sm">“Designed to make your food—and your brand—impossible to overlook.”</p><p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-ink/45">Digital menus for independent restaurants and cafés</p></div></div>
          </div>

          <div className="home-hero-image relative mx-auto w-full max-w-[440px]">
           <Image
              src="/assets/images/hero-food-hd.png"
              alt="A plated dish on a restaurant table with a FlavorBox QR menu card"
              width={989}
              height={1029}
              priority
              sizes="(max-width: 768px) 85vw, 40vw"
              quality={85}
              className="relative h-auto w-full drop-shadow-2xl"
            />
          </div>
        </div>

        <div id="features" className="grid gap-6 border-y border-[var(--line)] py-7 sm:grid-cols-2 lg:grid-cols-4">
          {benefits.map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex items-center gap-3">
              <Icon className="h-6 w-6 shrink-0 text-forest" />
              <div><p className="text-sm font-bold">{title}</p><p className="mt-1 text-xs text-ink/60">{text}</p></div>
            </div>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="home-steps relative bg-surface-warm/45 py-12 sm:py-20">
        <div className="page-shell text-center">
          <p className="eyebrow">Simple by design</p>
          <h2 className="serif-heading mt-3 text-4xl sm:text-5xl">Create a QR menu in minutes</h2>
          <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-ink/60">Add your menu, share one QR code, and keep every dish up to date.</p>
          <div className="mt-12 grid gap-10 md:grid-cols-3">
            {steps.map(({ number, icon: Icon, title, text }) => (
              <div key={number} className="relative">
                <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-brand-500"><Icon className="h-7 w-7" /></span>
                <p className="mt-3 text-[10px] font-bold tracking-widest text-ink/45">{number}</p>
                <h3 className="mt-2 font-serif text-xl font-bold">{title}</h3>
                <p className="mx-auto mt-2 max-w-[220px] text-sm leading-6 text-ink/60">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="contact" className="bg-forest text-white">
        <div className="page-shell flex flex-col gap-6 py-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4"><span className="flex h-12 w-12 items-center justify-center rounded-full border border-white/30"><IconGift className="h-6 w-6" /></span><div><p className="font-semibold">Ready to put your menu online?</p><p className="mt-1 text-xs text-white/60">Start with the essentials and grow when your restaurant is ready.</p></div></div>
          <Link href="/register" className="button-light shrink-0">Get Started Now <IconArrowRight className="h-4 w-4" /></Link>
        </div>
      </section>

      <Footer />
    </main>
  )
}
