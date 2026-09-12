import ContactForm from '@/components/marketing/ContactForm'
import Footer from '@/components/marketing/Footer'
import Navbar from '@/components/marketing/Navbar'
import { IconHeadset, IconMail, IconMapPin, IconPhone, IconRefresh } from '@/components/marketing/ContactIcons'
import { IconChevronRight } from '@/components/marketing/Icons'

const faqs = [
  ['What is QR Menu?', 'QR Menu is a digital menu that customers can open instantly by scanning a QR code.'],
  ['What happens if I change my plan?', 'Your account updates at the next billing cycle, while your existing menu stays available.'],
  ['How does the QR Menu work?', 'We create a unique QR code for your restaurant. Customers scan it with their phone camera to view your menu.'],
  ['Do you offer customer support?', 'Yes. Our support team can help with setup, menu updates, and plan questions.'],
  ['Can I customize my menu?', 'You can customize your menu content and, depending on your plan, its branding and template.'],
  ['Can I update my menu anytime?', 'Yes. Changes are published in real time without needing to reprint your QR code.'],
  ['Is there a setup fee?', 'No. There is no setup fee for starting a FlavorBox account.'],
  ['Is my data secure?', 'We use Supabase security controls and server-side validation to protect your account data.'],
]

export const metadata = {
  title: 'Contact Us — FlavorBox',
  description: 'Contact the FlavorBox support team for help with your digital menu.',
}

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-[var(--surface)]">
      <section className="border-b border-[var(--line)] bg-white">
        <div className="page-shell">
          <Navbar active="Contact" ctaLabel="View Plans" ctaHref="/plans" />
        </div>
        <div className="page-shell contact-layout">
          <div className="contact-intro">
            <p className="eyebrow">Contact support</p>
            <h1 className="serif-heading mt-2 text-4xl leading-none sm:text-5xl">Get in Touch</h1>
            <p className="mt-5 max-w-sm text-sm leading-6 text-ink/65">Have questions or need help? Our team is here to assist you. Let&apos;s build something better together.</p>
          </div>
            <div className="contact-details">
              <ContactDetail icon={IconMail} title="Email Us" text="support@flavorbox.com" />
              <ContactDetail icon={IconPhone} title="Call Us" text="+91 98765 43210" />
              <ContactDetail icon={IconRefresh} title="Business Hours" text="Mon - Sat: 9:00 AM - 7:00 PM" />
              <ContactDetail icon={IconMapPin} title="Our Office" text="123, Business Park, Sector 62, Noida, Uttar Pradesh - 201309" />
            </div>
          <div className="contact-message">
            <h2 className="font-serif text-2xl">Send us a Message</h2>
            <p className="mt-1 text-xs text-ink/60">Fill out the form and we&apos;ll get back to you as soon as possible.</p>
            <ContactForm />
          </div>
        </div>
      </section>

        <section className="contact-faq page-shell py-10 sm:py-14">
        <div className="text-center"><p className="eyebrow">FAQ</p><h2 className="serif-heading mt-1 text-3xl sm:text-4xl">Frequently Asked Questions</h2><p className="mt-2 text-xs text-ink/60">Find answers to the most common questions.</p></div>
        <div className="mx-auto mt-7 grid max-w-[900px] gap-2 md:grid-cols-2"><div className="space-y-2">{faqs.filter((_, index) => index % 2 === 0).map(([question, answer]) => <FaqItem key={question} question={question} answer={answer} />)}</div><div className="space-y-2">{faqs.filter((_, index) => index % 2 !== 0).map(([question, answer]) => <FaqItem key={question} question={question} answer={answer} />)}</div></div>
            <div className="mx-auto mt-3 flex max-w-[900px] flex-col items-center justify-between gap-4 rounded-md border border-ink/15 bg-[var(--surface-warm)] px-6 py-4 sm:flex-row"><div className="flex items-center gap-4"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-forest text-white"><IconHeadset className="h-5 w-5" /></span><div><p className="font-serif text-lg">Still have questions?</p><p className="text-[10px] text-ink/60">Our support team is here to help you.</p></div></div><a href="mailto:support@flavorbox.com" className="button-dark px-5 py-2 text-xs">Chat with our support team <IconChevronRight className="h-4 w-4" /></a></div>
      </section>

      <Footer />
    </main>
  )
}

function ContactDetail({ icon: Icon, title, text }: { icon: React.ComponentType<{ className?: string }>; title: string; text: string }) {
  return <div className="flex items-start gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-forest text-white"><Icon className="h-3.5 w-3.5" /></span><div><p className="text-[11px] font-bold">{title}</p><p className="mt-0.5 max-w-[220px] text-[10px] leading-4 text-ink/65">{text}</p></div></div>
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  return <details className="group rounded-md border border-[var(--line)] bg-white"><summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2.5 text-[10px] font-semibold marker:hidden">{question}<span className="text-sm font-normal transition group-open:rotate-45">+</span></summary><p className="border-t border-[var(--line)] px-4 py-3 text-[10px] leading-4 text-ink/60">{answer}</p></details>
}
