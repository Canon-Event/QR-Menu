'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import QRCode from 'qrcode'
import type { Dish, MenuData, Restaurant } from '@/types'
import { groupMenu } from '@/lib/menu-layout'
import { formatCurrency } from '@/lib/currency'
import { resolveMenuDesign, type Design } from '@/lib/menu-design'
import { googleFontStylesheetUrl, menuDesignVariables } from '@/lib/menu-fonts'

const art: Record<string, { cover: string; back?: string; symbol: string }> = {
  A: { cover: '/templates/heritage/heritage-cover-v1.png', symbol: '✦' },
  B: { cover: '/templates/green-bistro/cover-background-v2.png', back: '/templates/green-bistro/back-background-v2.png', symbol: '❧' },
  C: { cover: '/templates/italian/italian-cover-background-v1.png', back: '/templates/italian/italian-back-page-background-v1.png', symbol: '❦' },
  D: { cover: '/templates/bloom-brunch/bloom-brunch-cover-v1.png', back: '/templates/bloom-brunch/bloom-brunch-back-v1.png', symbol: '✿' },
}

/** Failed optional artwork collapses gracefully; menu text never depends on an image loading. */
export function MenuImage({ src, className = '', alt = '' }: { src: string; className?: string; alt?: string }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [src])
  return failed ? null : <img className={className} src={src} alt={alt} onError={() => setFailed(true)} loading="lazy" />
}

export function MenuCover({ restaurant, design, template }: { restaurant: Restaurant; design: Design; template: string }) {
  const artwork = art[template] || art.A
  return <section className="md-cover" aria-label={`${restaurant.name} menu cover`}>
    <MenuImage className="md-cover-art" src={design.imageUrl || artwork.cover} />
    <div className="md-cover-notes"><span>{design.coverEyebrow}</span><span>{design.coverSideNote}</span></div>
    <header className="md-cover-identity">
      {restaurant.logo_url ? <MenuImage className="md-logo" src={restaurant.logo_url} alt={`${restaurant.name} logo`} /> : <span className="md-symbol" aria-hidden="true">{artwork.symbol}</span>}
      <h1>{restaurant.name}</h1>
      {restaurant.description && <p className="md-subtitle">{restaurant.description}</p>}
      <p className="md-menu-title">{design.menuLabel ?? 'Menu'}</p>
      {design.coverTagline && <p className="md-tagline">{design.coverTagline}</p>}
      {design.coverMenuNote && <p className="md-cover-note">{design.coverMenuNote}</p>}
    </header>
    <div className="md-cover-bottom"><p>{design.coverFooter}</p><a className="md-enter" href="#menu-content">View menu <span aria-hidden="true">↓</span></a></div>
  </section>
}

export function MenuDish({ dish, currency }: { dish: Dish; currency: string }) {
  return <li className="md-dish" data-dish-id={dish.id}>
    <div className="md-dish-heading"><h3>{dish.name}</h3><span className="md-price">{formatCurrency(dish.price, currency)}</span></div>
    {dish.description && <p className="md-description">{dish.description}</p>}
    <span className={`md-diet ${dish.is_veg ? 'is-veg' : 'is-nonveg'}`}><i aria-hidden="true" />{dish.is_veg ? 'Vegetarian' : 'Non-vegetarian'}</span>
  </li>
}

export function MenuContent({ data, template }: { data: MenuData; template: string }) {
  const design = resolveMenuDesign(template, data.restaurant.template_settings?.[template])
  const groups = groupMenu(data, template)
  return <div id="menu-content" className="md-content">
    {groups.length > 1 && <nav className="md-category-nav" aria-label="Menu categories">{groups.map(group => <a key={group.category.id} href={`#category-${group.category.id}`}>{group.category.name}</a>)}</nav>}
    <section className="md-paper" aria-label="Food and drinks">
      <header className="md-paper-heading"><span aria-hidden="true">{art[template]?.symbol}</span><p>{data.restaurant.name}</p><h2>{template === 'D' ? design.sectionKicker : design.menuLabel || 'Our menu'}</h2>{design.categoryTagline && <p>{design.categoryTagline}</p>}</header>
      {groups.length ? <div className="md-category-grid" data-layout={design.menuPageLayout}>{groups.map(group => <section className={`md-category md-category-${group.kind}`} id={`category-${group.category.id}`} key={group.category.id}>
        <header><h2>{group.category.name}</h2>{['A','C'].includes(template) && <span className="md-category-engraving" aria-hidden="true" />}</header>
        {template === 'D' && (group.kind === 'drinks' || group.kind === 'breakfast' || design.menuImageOne) && <figure className="md-category-image md-brunch-art"><MenuImage src={group.kind === 'drinks' ? design.menuImageTwo || '/templates/bloom-brunch/bloom-brunch-drinks-v1.png' : design.menuImageOne || '/templates/bloom-brunch/bloom-brunch-inner-v1.png'} /><figcaption>{design.categoryTagline}</figcaption></figure>}
        {template === 'B' && group.image && <figure className="md-category-image"><MenuImage src={group.image} alt={`${group.category.name} inspiration`} /><figcaption>{design.sectionKicker}</figcaption></figure>}
        <ul>{group.dishes.map(dish => <MenuDish key={dish.id} dish={dish} currency={data.restaurant.currency} />)}</ul>
      </section>)}</div> : <div className="md-empty"><h2>Something delicious is on its way</h2><p>Our menu will be available here soon. Please ask the team for today’s selection.</p></div>}
      {['A','C'].includes(template) && <div className="md-landscape" aria-hidden="true" />}
      <footer className="md-paper-footer"><span>{design.ingredientNoteTitle || 'Made with care'}</span><p>{design.ingredientNote || 'Please ask our team about ingredients and allergens before ordering.'}</p></footer>
    </section>
  </div>
}

function MenuClosing({ restaurant, design, template }: { restaurant: Restaurant; design: Design; template: string }) {
  const [qr, setQr] = useState('')
  useEffect(() => {
    let active = true
    QRCode.toDataURL(`${window.location.origin}/menu/${restaurant.slug}`, { width: 180, margin: 2, color: { dark: '#203622', light: '#ffffff' } }).then(value => { if (active) setQr(value) }).catch(() => { if (active) setQr('') })
    return () => { active = false }
  }, [restaurant.slug])
  return <section className="md-closing" aria-label="Visit us">
    {(design.backImageUrl || art[template]?.back) && <MenuImage className="md-closing-art" src={design.backImageUrl || art[template].back!} />}
    <div className="md-closing-copy"><span className="md-symbol" aria-hidden="true">{art[template]?.symbol}</span><p className="md-closing-brand">{restaurant.name}</p><h2>{design.thankYouTitle ?? 'Thank you'}</h2>{design.thankYouSubtitle && <h3>{design.thankYouSubtitle}</h3>}<p>{design.thankYouMessage ?? 'Good food tastes better when shared. We look forward to welcoming you again.'}</p>
      {template === 'C' && design.sectionKicker && <p className="md-tagline">{design.sectionKicker}</p>}
      <dl className="md-contact"><div><dt>Opening hours</dt><dd>{design.openingHours || 'Ask our team for today’s hours.'}</dd></div>{restaurant.address && <div><dt>Visit us</dt><dd><address>{restaurant.address}</address></dd></div>}{restaurant.phone && <div><dt>Contact</dt><dd><a href={`tel:${restaurant.phone}`}>{restaurant.phone}</a></dd></div>}{design.socialHandle && <div><dt>Follow along</dt><dd>{design.socialHandle}</dd></div>}</dl>
      <div className="md-qr">{qr && <img src={qr} width="96" height="96" alt={`QR code for ${restaurant.name} menu`} />}<div><b>{design.reserveLabel || 'Our digital menu'}</b><p>{design.reserveMessage || 'Scan to visit our menu again.'}</p></div></div>
      {design.closingFooter && <p className="md-closing-footer">{design.closingFooter}</p>}
    </div>
  </section>
}

/** The same document is mounted by public, editor, gallery and dashboard previews. */
export default function MenuDocument({ data, template = data.restaurant.template }: { data: MenuData; template?: string }) {
  const design = resolveMenuDesign(template, data.restaurant.template_settings?.[template])
  const fontUrl = googleFontStylesheetUrl(design.font)
  return <div className={`menu-document menu-document-${template.toLowerCase()}`} style={menuDesignVariables(design, template) as CSSProperties}>
    {fontUrl && <link rel="stylesheet" href={fontUrl} />}
    <MenuCover restaurant={data.restaurant} design={design} template={template} />
    <MenuContent data={data} template={template} />
    <MenuClosing restaurant={data.restaurant} design={design} template={template} />
  </div>
}
