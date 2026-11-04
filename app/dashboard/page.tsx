import Link from 'next/link'
import { NotificationBell } from '@/components/notifications/NotificationCenter'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { generateQRDataURL } from '@/lib/qr'
import { TIER_FEATURES } from '@/lib/tier'
import type { Dish, Restaurant, Tier } from '@/types'
import DashboardIdentity from '@/components/dashboard/DashboardIdentity'
import ThemeToggle from '@/components/ui/ThemeToggle'
import BrandLogo from '@/components/ui/BrandLogo'
import { IconArrowRight, IconDownloadSmall, IconExternalLink } from '@/components/marketing/Icons'
import { createDashboardSampleData } from '@/lib/dashboard-demo-data'
import DashboardTemplateBrowser from '@/components/dashboard/DashboardTemplateBrowser'
import { financialSummary } from '@/lib/reporting'
import { money } from '@/lib/pos'

const navGroups = [
  { label: 'Restaurant operations', items: [['Table verification', '/dashboard/table-access', '♧'], ['Billing & POS', '/dashboard/billing', '₹'], ['Menu photo import', '/dashboard/ai-menu', '▤']] },
  { label: 'Manage', items: [['Orders', '/dashboard/orders', '☷'], ['Loyalty & rewards', '/dashboard/loyalty', '✦'], ['Analytics', '/dashboard/analytics', '⌁'], ['Menu templates', '/dashboard/templates', '▣'], ['Dishes & categories', '/dashboard/menu', '◫'], ['Ingredients', '/dashboard/menu?tab=ingredients', '◌'], ['3D models', '/dashboard/menu?tab=models', '◇'], ['Media library', '/dashboard/menu?tab=media', '▧']] },
  { label: 'Customize', items: [['Restaurant details', '/dashboard/settings', '◉'], ['QR settings', '/dashboard/settings?tab=qr', '⌘'], ['Custom domain', '/dashboard/settings?tab=domain', '◎']] },
  { label: 'Account', items: [['Employees', '/dashboard/employees', '♙'], ['Subscription', '/plans', '◇'], ['Team members', '/dashboard/team', '♧'], ['Settings', '/dashboard/settings', '⚙']] },
]

function formatPrice(price: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(price)
}

function Icon({ children }: { children: string }) {
  return <span aria-hidden="true" className="dashboard-icon">{children}</span>
}

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const userName = typeof user.user_metadata?.full_name === 'string' && user.user_metadata.full_name.trim()
    ? user.user_metadata.full_name.trim()
    : typeof user.user_metadata?.name === 'string' && user.user_metadata.name.trim()
      ? user.user_metadata.name.trim()
      : user.email?.split('@')[0] || 'there'

  const { data: restaurants } = await supabase.from('restaurants').select('id, name, slug, tier, template, logo_url, is_active, created_at').eq('owner_id', user.id).limit(1)
  const restaurant = restaurants?.[0] as Restaurant | undefined
  if (!restaurant) return <div className="dashboard-empty">No restaurant set up yet. <Link href="/dashboard/setup">Set up now <IconArrowRight className="h-4 w-4" /></Link></div>

  const [qrDataURL, dishResult, categoryResult, recentResult, visitResult, orderResult, ingredientResult] = await Promise.all([
    generateQRDataURL(restaurant.slug),
    supabase.from('dishes').select('*', { count: 'exact', head: true }).eq('restaurant_id', restaurant.id),
    supabase.from('categories').select('*', { count: 'exact', head: true }).eq('restaurant_id', restaurant.id),
    supabase.from('dishes').select('id, name, price, is_veg, is_available, created_at').eq('restaurant_id', restaurant.id).order('created_at', { ascending: false }).limit(4),
    supabase.from('menu_visits').select('*', { count: 'exact', head: true }).eq('restaurant_id', restaurant.id),
    supabase.from('orders').select('total,status').eq('restaurant_id', restaurant.id),
    supabase.from('ingredients').select('*', { count: 'exact', head: true }).eq('restaurant_id', restaurant.id),
  ])
  const sample = createDashboardSampleData()
  const isSamplePreview = !dishResult.count && !categoryResult.count && !orderResult.data?.length && !visitResult.count && !ingredientResult.count
  const tier = (restaurant.tier as Tier) || 1
  const features = TIER_FEATURES[tier]
  const dishes = (isSamplePreview ? sample.recentDishes : recentResult.data ?? []) as Dish[]
  const orders = isSamplePreview ? sample.orders : orderResult.data ?? []
  const dishCount = isSamplePreview ? sample.dishCount : dishResult.count ?? 0
  const visitorCount = isSamplePreview ? sample.visits : visitResult.count ?? 0
  const ingredientCount = isSamplePreview ? sample.ingredientCount : ingredientResult.count ?? 0
  const activeOrders = orders.filter(order => order.status !== 'cancelled')
  const { summary: financials } = await financialSummary(supabase, restaurant.id)

  return <div className="dashboard-layout">
    <aside className="dashboard-sidebar">
      <Link href="/dashboard" className="dashboard-brand"><BrandLogo className="wiit-logo-dashboard" /></Link>
      <nav className="dashboard-nav">
        <Link className="dashboard-nav-active" href="/dashboard"><Icon>⌂</Icon>Dashboard</Link>
        {navGroups.map((group) => <div className="dashboard-nav-group" key={group.label}><p>{group.label}</p>{group.items.map(([label, href, icon]) => <Link href={href} key={label}><Icon>{icon}</Icon>{label}{label === '3D models' && <small>PRO</small>}</Link>)}</div>)}
      </nav>
      <div className="support-box"><b>Need help?</b><p>Chat with our support team. We’re here to help you.</p><a href="/contact">Contact support <IconArrowRight className="h-4 w-4" /></a></div>
    </aside>
    <main className="dashboard-main">
      <details className="dashboard-mobile-navigation">
        <summary>Workspace navigation</summary>
        <nav aria-label="Workspace navigation">
          <Link href="/dashboard" aria-current="page">Overview</Link>
          {navGroups.flatMap(group => group.items).map(([label, href]) => <Link key={label} href={href}>{label}</Link>)}
          <a href="/contact">Contact support</a>
        </nav>
      </details>
      <header className="dashboard-topbar"><div className="mobile-brand"><BrandLogo className="wiit-logo-mobile" /></div><div className="topbar-actions"><ThemeToggle /><a href={`/menu/${restaurant.slug}`} target="_blank" rel="noreferrer">View restaurant <IconExternalLink className="h-3 w-3" /></a><NotificationBell /><DashboardIdentity displayName={userName} restaurantName={restaurant.name} /></div></header>
      <div className="dashboard-content">
        <div className="welcome-row"><div><p className="dashboard-kicker">{features.label} workspace</p><h1>Welcome back, {userName}! <span>👋</span></h1><p>Here’s what’s happening with your restaurant today.</p>{isSamplePreview && <small className="dashboard-sample-note">Sample data preview · your live data is unchanged</small>}</div><Link className="primary-button" href="/dashboard/menu">+ Add new dish</Link></div>
        <section className="metric-grid"><div className="metric-card green"><div className="metric-icon">▣</div><p>Total dishes</p><strong>{dishCount}</strong><small>{activeOrders.length} customer orders</small><span className="metric-spark">⌁</span></div><div className="metric-card amber"><div className="metric-icon">₹</div><p>Net payments received</p><strong>{financials ? money(financials.net_collected_paise) : '—'}</strong><small>{financials ? 'Recorded receipts less processed refunds' : 'Activate billing and reporting'}</small><span className="metric-spark">⌁</span></div><div className="metric-card lilac"><div className="metric-icon">◎</div><p>Menu visitors</p><strong>{visitorCount.toLocaleString('en-IN')}</strong><small>Unique daily visits</small><span className="metric-spark">⌁</span></div><div className="metric-card coral"><div className="metric-icon">☷</div><p>Pending orders</p><strong>{orders.filter(order => order.status === 'pending').length}</strong><small><Link href="/dashboard/orders">Manage orders →</Link></small><span className="metric-spark">⌁</span></div></section>
        <div className="qr-strip"><img className="qr-thumbnail" src={qrDataURL} alt="QR code for your menu" /><div><b>Your menu is live</b><small>{`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/menu/${restaurant.slug}`}</small><a href={qrDataURL} download={`${restaurant.slug}-qr.png`}>Download QR code <span>↓</span></a></div><a className="qr-open-link" href={`/menu/${restaurant.slug}`} target="_blank" rel="noreferrer">Open menu <span>↗</span></a></div>
        <div className="dashboard-columns"><section className="dashboard-panel templates-panel"><div className="panel-heading"><div><h2>Menu templates</h2><p>Choose a beautiful look for your digital menu.</p></div><Link href="/dashboard/templates">View all <span>→</span></Link></div><DashboardTemplateBrowser activeTemplate={restaurant.template} /></section><section className="dashboard-panel inventory-panel"><div className="panel-heading"><div><h2>Dishes & ingredients</h2><p>Keep your menu fresh and organized.</p></div></div><Link className="inventory-row" href="/dashboard/menu"><span className="inventory-icon green-icon">♨</span><div><small>Dishes</small><b>{dishCount}</b><p>Live on your menu</p></div><span className="outline-button">Manage dishes</span></Link><Link className="inventory-row" href="/dashboard/menu?tab=ingredients"><span className="inventory-icon amber-icon">⌁</span><div><small>Ingredients</small><b>{ingredientCount}</b><p>Track your stock</p></div><span className="outline-button">Manage ingredients</span></Link></section></div>
        <div className="dashboard-columns lower-columns"><section className="dashboard-panel recent-panel"><div className="panel-heading"><div><h2>Recent menu updates</h2><p>The latest dishes added to your restaurant.</p></div><Link href="/dashboard/menu">View all <span>→</span></Link></div>{dishes.length ? <div className="recent-list">{dishes.map((dish) => <Link href={`/dashboard/menu?edit=${dish.id}`} className="recent-item" key={dish.id}><span className={`veg-dot ${dish.is_veg ? 'veg' : 'nonveg'}`} /><div><b>{dish.name}</b><small>{dish.is_available ? 'Available' : 'Hidden'} · {formatPrice(Number(dish.price))}</small></div><span>✎</span></Link>)}</div> : <div className="empty-list">Your newest dishes will appear here.</div>}</section><section className={`dashboard-panel model-panel ${features.has3D ? 'is-enabled' : ''}`}><div className="panel-heading"><div><h2>3D model customization</h2><p>{features.has3D ? 'Personalize your restaurant’s 3D experience.' : 'Bring your menu to life with the Super plan.'}</p></div><span className="pro-badge">{features.has3D ? 'Included' : 'PRO'}</span></div><div className="model-preview"><div className="table table-one" /><div className="table table-two" /><div className="model-plant" /><div className="model-chair chair-one" /><div className="model-chair chair-two" /></div><div className="model-footer"><span>◇</span><div><b>{features.has3D ? 'Your 3D model is ready' : 'Unlock the 3D experience'}</b><small>{features.has3D ? 'Change layout, colors and objects' : 'Available on the Super plan'}</small></div><Link href={features.has3D ? '/dashboard/menu?tab=models' : '/plans'}>{features.has3D ? 'Customize' : 'Explore plans'} <span>→</span></Link></div></section></div>
        <section className="dashboard-panel plan-panel"><div className="plan-copy"><span className="crown">♕</span><div><p className="dashboard-kicker">Your plan</p><h2>{features.label} <span>Active</span></h2><p>Everything you need to run a beautiful digital menu.</p></div></div><a className="dark-button" href="/plans">Manage plan <span>→</span></a></section>
      </div>
    </main>
  </div>
}
