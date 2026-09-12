'use client'

import Link from 'next/link'
import {
  IconFacebook,
  IconInstagram,
  IconLeaf,
  IconLinkedin,
  IconSend,
  IconTwitter,
} from '@/components/marketing/Icons'

const columns = [
  {
    heading: 'Product',
    links: ['Features', 'Menu Templates', '3D Models', 'Pricing', 'Integrations'],
  },
  {
    heading: 'Resources',
    links: ['How It Works', 'Blog', 'FAQ', 'Help Center', 'Guides'],
  },
  {
    heading: 'Company',
    links: ['About Us', 'Contact Us', 'Privacy Policy', 'Terms & Conditions'],
  },
]

const socials = [
  { icon: IconFacebook, label: 'Facebook' },
  { icon: IconInstagram, label: 'Instagram' },
  { icon: IconLinkedin, label: 'LinkedIn' },
  { icon: IconTwitter, label: 'Twitter' },
]

export default function Footer() {
  return (
    <footer className="marketing-footer border-t border-[var(--line)] bg-white">
      <div className="page-shell py-14">
        <div className="marketing-footer-grid">
          <div>
            <Link href="/" className="flex items-center gap-2.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-brand-500 text-brand-500">
                <IconLeaf className="h-5 w-5" />
              </span>
              <span className="text-2xl font-extrabold tracking-tight">
                <span className="text-forest">QR</span> <span className="italic text-brand-500">MENU</span>
              </span>
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-6 text-ink/60">
              Smart, Simple, Contactless. Create beautiful digital menus and elevate your restaurant experience.
            </p>
            <div className="mt-5 flex items-center gap-3">
              {socials.map(({ icon: Icon, label }) => (
                <a
                  key={label}
                  href="#"
                  aria-label={label}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-ink/15 text-ink transition hover:border-ink hover:text-forest"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          {columns.map((col) => (
            <div key={col.heading}>
              <p className="text-xs font-bold uppercase tracking-[0.1em] text-forest">{col.heading}</p>
              <ul className="mt-4 space-y-3">
                {col.links.map((link) => (
                  <li key={link}>
                    <a href="#" className="text-sm text-ink/65 transition hover:text-ink">
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div>
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-forest">Stay Updated</p>
            <p className="mt-4 text-sm leading-6 text-ink/60">Subscribe to get updates and offers straight to your inbox.</p>
            <form className="mt-4 flex overflow-hidden rounded-md border border-[var(--line)] bg-white" onSubmit={(e) => e.preventDefault()}>
              <input
                type="email"
                placeholder="Enter your email"
                aria-label="Email address"
                className="w-full min-w-0 bg-transparent px-4 py-3 text-sm text-ink outline-none placeholder:text-ink/40"
              />
              <button
                type="submit"
                aria-label="Subscribe"
                className="flex shrink-0 items-center justify-center bg-brand-500 px-4 text-white transition hover:bg-brand-600"
              >
                <IconSend className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-[var(--line)] pt-6 text-xs text-ink/50 sm:flex-row">
          <p>© {new Date().getFullYear()} QR Menu. All rights reserved.</p>
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 items-center rounded-md border border-[var(--line)] px-2.5 text-[11px] font-black italic text-[#1A1F71]">VISA</span>
            <span className="flex h-7 w-11 items-center justify-center rounded-md border border-[var(--line)]">
              <span className="relative flex h-3.5 w-6 items-center justify-center">
                <span className="absolute left-0 h-3.5 w-3.5 rounded-full bg-[#EB001B] opacity-90" />
                <span className="absolute right-0 h-3.5 w-3.5 rounded-full bg-[#F79E1B] opacity-90" />
              </span>
            </span>
            <span className="flex h-7 items-center rounded-md border border-[var(--line)] px-2.5 text-[10px] font-extrabold text-forest">
              RuPay<span className="text-brand-500">›</span>
            </span>
            <span className="flex h-7 items-center rounded-md border border-[var(--line)] px-2.5 text-[10px] font-extrabold text-ink">
              UPI<span className="text-brand-500">›</span>
            </span>
          </div>
        </div>
      </div>
    </footer>
  )
}
