'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import BrandLogo from '@/components/ui/BrandLogo'
import ThemeToggle from '@/components/ui/ThemeToggle'
import StudioIcon, { type StudioIconName } from './StudioIcon'

const navigation = [
  {
    label: 'Manage',
    links: [
      { label: 'Orders', href: '/dashboard/orders' },
      { label: 'Billing & POS', href: '/dashboard/billing' },
      { label: 'Table verification', href: '/dashboard/table-access' },
      { label: 'Loyalty & rewards', href: '/dashboard/loyalty' },
      { label: 'Analytics', href: '/dashboard/analytics' },
      { label: 'Menu templates', href: '/dashboard/templates' },
      { label: 'Dishes & categories', href: '/dashboard/menu' },
      { label: 'Menu photo import', href: '/dashboard/ai-menu' },
      { label: 'Ingredients', href: '/dashboard/menu?tab=ingredients' },
      { label: '3D models', href: '/dashboard/menu?tab=models' },
      { label: 'Media library', href: '/dashboard/menu?tab=media' },
    ],
  },
  {
    label: 'Customize',
    links: [
      { label: 'Restaurant details', href: '/dashboard/settings' },
      { label: 'QR settings', href: '/dashboard/settings?tab=qr' },
      { label: 'Custom domain', href: '/dashboard/settings?tab=domain' },
    ],
  },
  {
    label: 'Account',
    links: [
      { label: 'Employees', href: '/dashboard/employees' },
      { label: 'Subscription', href: '/plans' },
      { label: 'Team members', href: '/dashboard/team' },
      { label: 'Settings', href: '/dashboard/settings' },
    ],
  },
]

function isActive(pathname: string, href: string) {
  const path = href.split('?')[0]
  return path === '/dashboard' ? pathname === path : pathname === path || pathname.startsWith(`${path}/`)
}

export default function DashboardRouteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || ''
  const fullScreenRoute = pathname === '/dashboard/setup'
    || pathname === '/dashboard/menu-preview'
    || /^\/dashboard\/templates\/[^/]+\/edit$/.test(pathname)

  // The home page already renders this navigation. Setup and preview pages use full-screen layouts.
  if (pathname === '/dashboard' || fullScreenRoute) return children

  if(pathname==='/dashboard/ai-menu')return <div className="menu-studio-shell"><aside className="studio-rail"><Link href="/dashboard" className="studio-rail-brand" aria-label="WIIT dashboard home"><img src="/assets/brand/wiit-favicon-mark.png" alt="WIIT" width="34" height="34"/></Link><nav aria-label="Dashboard navigation">{([
    ['home','Dashboard','/dashboard'],['menu','Menu photo import','/dashboard/ai-menu'],['photo','Media library','/dashboard/menu?tab=media'],['grid','Menu templates','/dashboard/templates'],['settings','Restaurant settings','/dashboard/settings'],
  ] as [StudioIconName,string,string][]).map(([icon,label,href])=><Link key={href} href={href} title={label} aria-label={label} aria-current={href===pathname?'page':undefined}><StudioIcon name={icon}/></Link>)}</nav><Link className="studio-rail-help" href="/contact" title="Help & support" aria-label="Help & support"><StudioIcon name="help"/></Link></aside><div className="studio-shell-main">{children}</div></div>

  return (
    <div className="dashboard-route-shell">
      <aside className="dashboard-sidebar dashboard-route-sidebar">
        <Link href="/dashboard" className="dashboard-brand" aria-label="WIIT dashboard home">
          <BrandLogo className="wiit-logo-dashboard" />
        </Link>
        <nav className="dashboard-nav" aria-label="Dashboard navigation">
          <Link
            href="/dashboard"
            className={pathname === '/dashboard' ? 'dashboard-nav-active' : undefined}
            aria-current={pathname === '/dashboard' ? 'page' : undefined}
          >
            Dashboard
          </Link>
          {navigation.map((group) => (
            <div className="dashboard-nav-group" key={group.label}>
              <p>{group.label}</p>
              {group.links.map((link) => {
                const active = isActive(pathname, link.href)
                return (
                  <Link
                    key={`${group.label}-${link.label}`}
                    href={link.href}
                    className={active ? 'dashboard-nav-active' : undefined}
                    aria-current={active ? 'page' : undefined}
                  >
                    {link.label}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>
        <div className="dashboard-route-footer">
          <ThemeToggle />
          <span>Appearance</span>
          <Link href="/contact">Help & support</Link>
        </div>
      </aside>
      <div className="dashboard-route-main">{children}</div>
    </div>
  )
}
