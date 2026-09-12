import type { Metadata } from 'next'
import { Bodoni_Moda, Cinzel, Cormorant_Garamond, DM_Serif_Display, Great_Vibes, Manrope, Playfair_Display, Poppins } from 'next/font/google'
import './globals.css'
import './employee-operations.css'
import './templates.css'
import './responsive.css'

const manrope = Manrope({ subsets: ['latin'], variable: '--font-manrope' })
const dmSerif = DM_Serif_Display({ subsets: ['latin'], weight: '400', variable: '--font-dm-serif' })
const playfair = Playfair_Display({ subsets: ['latin'], variable: '--font-playfair' })
const cinzel = Cinzel({ subsets: ['latin'], variable: '--font-cinzel' })
const cormorant = Cormorant_Garamond({ subsets: ['latin'], weight: ['400', '600', '700'], variable: '--font-cormorant' })
const poppins = Poppins({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-poppins' })
const greatVibes = Great_Vibes({ subsets: ['latin'], weight: '400', variable: '--font-great-vibes' })
const bodoniModa = Bodoni_Moda({ subsets: ['latin'], style: ['normal', 'italic'], variable: '--font-bodoni-moda' })

export const metadata: Metadata = {
  title: 'FlavorBox — Digital Menus, Just a Scan Away',
  description: 'Create a digital menu for your restaurant or café. Contactless. Fast. Beautiful.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${manrope.variable} ${dmSerif.variable} ${playfair.variable} ${cinzel.variable} ${cormorant.variable} ${poppins.variable} ${greatVibes.variable} ${bodoniModa.variable}`}>
      <body className="font-sans bg-cream text-ink antialiased">{children}</body>
    </html>
  )
}
