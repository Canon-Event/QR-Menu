import type { CSSProperties } from 'react'
import type { MenuData } from '@/types'
import { safeBasicStyle, type BasicMenuStyle } from '@/lib/ai-menu'
import { groupMenuPortions, type MenuPortion } from '@/lib/menu-portions'

const fonts = {
  manrope: 'var(--font-manrope, Arial), sans-serif',
  poppins: 'var(--font-poppins, Arial), sans-serif',
  playfair: 'var(--font-playfair, Georgia), serif',
}

/** The same renderer powers the editor preview and the public QR menu. */
export default function BasicMenu({ data, style: rawStyle, unconfirmedDietaryIds = [], unconfirmedPriceIds = [], currencyConfirmed = true, onLogoClick, editingDishIds=[] }: { data: MenuData; style?: BasicMenuStyle; unconfirmedDietaryIds?: string[]; unconfirmedPriceIds?: string[]; currencyConfirmed?: boolean; onLogoClick?:()=>void; editingDishIds?:string[] }) {
  const style = safeBasicStyle(rawStyle ?? data.restaurant.basic_menu_style)
  const groups = data.categories.map(category => ({ name: category.name, dishes: data.dishes.filter(d => d.is_available && d.category_id === category.id) }))
  const uncategorized = data.dishes.filter(d => d.is_available && !data.categories.some(c => c.id === d.category_id))
  if (uncategorized.length) groups.push({ name: 'Menu', dishes: uncategorized })
  const visibleGroups = groups.filter(group => group.dishes.length).map(group=>({...group,rows:groupMenuPortions(group.dishes)}))
  const dishCount = visibleGroups.reduce((count, group) => count + group.rows.length, 0)
  const format = currencyConfirmed
    ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: data.restaurant.currency || 'INR', maximumFractionDigits: 2 })
    : new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 })
  return <main className={`basic-menu basic-menu-${style.density} basic-menu-${style.layout || 'editorial'} basic-menu-backdrop-${style.backdrop || 'glow'} basic-menu-motion-${style.motion || 'none'}`} style={{ '--basic-accent': style.accent, '--basic-background': style.background, '--basic-text': style.text, '--basic-heading-font': fonts[style.font], fontFamily: fonts[style.font], backgroundColor: style.background, color: style.text } as CSSProperties}>
    <div className="basic-menu-atmosphere" aria-hidden="true"><span /><span /></div>
    <div className="basic-menu-content">
      <div className="basic-menu-masthead">{onLogoClick?<div className="basic-menu-wordmark"><button type="button" className="basic-menu-logo-button" onClick={onLogoClick} aria-label={data.restaurant.logo_url?'Change restaurant logo':'Add restaurant logo'} title={data.restaurant.logo_url?'Change restaurant logo':'Add restaurant logo'}>{data.restaurant.logo_url?<img src={data.restaurant.logo_url} alt="" width="32" height="32"/>:<span aria-hidden="true">✳</span>}</button><a href="#basic-menu-selection" className="basic-menu-wordmark-name">{data.restaurant.name}</a></div>:<a href="#basic-menu-selection" className="basic-menu-wordmark">{data.restaurant.logo_url ? <img src={data.restaurant.logo_url} alt="" width="32" height="32" /> : <span aria-hidden="true">✳</span>}<span>{data.restaurant.name}</span></a>}<span className="basic-menu-masthead-note">THE MENU <i aria-hidden="true" /></span></div>
      <header className={`basic-menu-header${style.heroImage ? ' has-cover' : ''}`}>
        <div className="basic-menu-intro"><p className="basic-menu-eyebrow"><span aria-hidden="true" /> A seat at our table</p><h1>{data.restaurant.name}</h1><p className="basic-menu-tagline">{style.tagline || data.restaurant.description || 'Good food. A little discovery. Your next favourite.'}</p><a className="basic-menu-explore" href="#basic-menu-selection">Explore the menu <span aria-hidden="true">↗</span></a><div className="basic-menu-hero-meta"><span>{String(dishCount).padStart(2, '0')} dishes to discover</span><span>{String(visibleGroups.length).padStart(2, '0')} categories</span></div></div>
        {style.heroImage ? <figure className="basic-menu-cover"><img src={style.heroImage} alt={`A taste of ${data.restaurant.name}`} width="640" height="720" decoding="async" fetchPriority="high" /><figcaption>Something good is on the menu <span aria-hidden="true">✦</span></figcaption></figure> : <div className="basic-menu-seal" aria-hidden="true"><span>GATHER · TASTE · ENJOY</span><b>✳</b><span>MADE FOR YOUR TABLE</span></div>}
      </header>
      {visibleGroups.length > 0 && <nav className="basic-menu-category-nav" aria-label="Menu categories">{visibleGroups.map((group, index) => <a key={index} href={`#basic-category-${index}`}><span>{String(index + 1).padStart(2, '0')}</span>{group.name}</a>)}</nav>}
      <div id="basic-menu-selection" className="basic-menu-selection">
      {visibleGroups.map((group, index) => <section className="basic-menu-section" id={`basic-category-${index}`} key={index}>
        <header className="basic-menu-section-heading"><div><span className="basic-menu-section-number">/ {String(index + 1).padStart(2, '0')}</span><h2>{group.name}</h2></div><span>{group.rows.length} {group.rows.length === 1 ? 'dish' : 'dishes'}</span></header>
        <div className="basic-menu-dishes">{group.rows.map(row=>{
          const dish=row.entries[0].item,sameDescription=row.entries.every(e=>e.item.description===dish.description)
          const sameDiet=row.entries.every(e=>e.item.is_veg===dish.is_veg&&!unconfirmedDietaryIds.includes(e.item.id))
          const editing=row.entries.some(e=>editingDishIds.includes(e.item.id))
          return <article id={`basic-dish-${dish.id}`} className={`basic-menu-dish${row.portioned?' has-portions':''}${dish.image_url && style.showImages !== false ? ' has-photo' : ''}${editing?' is-editing':''}`} key={dish.id}>
          {dish.image_url && style.showImages !== false && <img src={dish.image_url} alt={dish.name} loading="lazy" decoding="async" width="112" height="112" />}
          <div className="basic-menu-dish-copy"><h3>{row.name}</h3>{editing&&<span className="basic-menu-editing-badge">Editing this item</span>}{sameDescription&&dish.description && <p>{dish.description}</p>}{sameDiet && <span className="basic-menu-diet"><span className={`basic-food-marker ${dish.is_veg ? 'is-veg' : 'is-nonveg'}`} aria-hidden="true" />{dish.is_veg ? 'Vegetarian' : 'Non-vegetarian'}</span>}</div>
          {row.portioned?<div className="basic-menu-portion-prices" aria-label={`Prices for ${row.name}`}>{(['Half','Full'] as MenuPortion[]).map(portion=>{
            const option=row.entries.find(e=>e.portion===portion)?.item
            return <div className={`basic-menu-portion-price${option?'':' is-unlisted'}`} key={portion} data-portion={portion}><span>{portion}</span><strong className={option&&unconfirmedPriceIds.includes(option.id)?'basic-menu-price-unconfirmed':undefined}>{!option?<span aria-label={`${portion} price not listed`}>—</span>:unconfirmedPriceIds.includes(option.id)?'Confirm price':format.format(Number(option.price))}</strong>{option&&!sameDescription&&option.description&&<small>{option.description}</small>}{option&&!sameDiet&&!unconfirmedDietaryIds.includes(option.id)&&<small>{option.is_veg?'Vegetarian':'Non-vegetarian'}</small>}</div>
          })}</div>:<strong className={unconfirmedPriceIds.includes(dish.id) ? 'basic-menu-price-unconfirmed' : undefined}>{unconfirmedPriceIds.includes(dish.id) ? 'Confirm price' : format.format(Number(dish.price))}</strong>}
        </article>})}</div>
      </section>)}
      </div>
      {!data.dishes.some(d => d.is_available) && <p className="basic-menu-empty">The menu is being prepared. Please ask a member of staff.</p>}
      <footer className="basic-menu-footer"><span className="basic-menu-footer-symbol" aria-hidden="true">✳</span><h2>Come hungry. Leave happy.</h2><p>Please ask our team about ingredients and allergens.</p>{data.restaurant.address && <address>{data.restaurant.address}</address>}<span className="basic-menu-footer-brand">{data.restaurant.name} <span aria-hidden="true">·</span> Made to be enjoyed</span></footer>
    </div>
  </main>
}
