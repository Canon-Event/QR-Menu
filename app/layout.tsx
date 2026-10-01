import type { Metadata } from 'next'
import { Bodoni_Moda, Cinzel, Cormorant_Garamond, DM_Serif_Display, Great_Vibes, Kalam, Manrope, Patrick_Hand, Playfair_Display, Poppins } from 'next/font/google'
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
const kalam = Kalam({ subsets: ['latin'], weight: ['300', '400', '700'], variable: '--font-kalam' })
const patrickHand = Patrick_Hand({ subsets: ['latin'], weight: '400', variable: '--font-patrick-hand' })
const bodoniModa = Bodoni_Moda({ subsets: ['latin'], style: ['normal', 'italic'], variable: '--font-bodoni-moda' })

export const metadata: Metadata = {
  title: 'WIIT — Digital Menus, Just a Scan Away',
  description: 'Create a digital menu for your restaurant or café. Contactless. Fast. Beautiful.',
  icons: {
    icon: [
      { url: '/assets/brand/wiit-favicon-32.png?v=2', sizes: '32x32', type: 'image/png' },
      { url: '/assets/brand/wiit-app-icon-512.png?v=2', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: '/assets/brand/wiit-favicon-32.png?v=2',
    apple: [{ url: '/assets/brand/wiit-apple-touch-icon.png?v=2', sizes: '180x180', type: 'image/png' }],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${manrope.variable} ${dmSerif.variable} ${playfair.variable} ${cinzel.variable} ${cormorant.variable} ${poppins.variable} ${greatVibes.variable} ${kalam.variable} ${patrickHand.variable} ${bodoniModa.variable}`}>
      <body className="font-sans bg-cream text-ink antialiased">{children}</body>
    </html>
  )
}
