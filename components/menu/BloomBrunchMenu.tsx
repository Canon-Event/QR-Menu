'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import type { Category, Dish, MenuData } from '@/types'
import { formatCurrency } from '@/lib/currency'

const editableText = (value: string | undefined, fallback: string) => value === undefined ? fallback : value
const DISHES_PER_SECTION = 4
const DRINKS_PER_SECTION = 9
const DRINK_CATEGORY_PATTERN = /\b(mocktails?|iced\s*teas?|beverages?|drinks?|coolers?|juices?|smoothies?|shakes?|coffees?|teas?)\b/i

type BloomSection = {
  key: string
  name: string
  dishes: Dish[]
  continued: boolean
}

function splitSection(category: Category, dishes: Dish[], pageSize = DISHES_PER_SECTION): BloomSection[] {
  return Array.from({ length: Math.ceil(dishes.length / pageSize) }, (_, index) => ({
    key: `${category.id}-${index}`,
    name: category.name,
    dishes: dishes.slice(index * pageSize, (index + 1) * pageSize),
    continued: index > 0,
  }))
}

function BloomDrink({ dish, currency }: { dish: Dish; currency: string }) {
  return <article className="bloom-drink">
    <div>
      <h3 className="menu-dish-name">{dish.name}</h3>
      {dish.description && <p className="menu-dish-description">{dish.description}</p>}
    </div>
    <strong className="menu-dish-price">{formatCurrency(dish.price, currency)}</strong>
  </article>
}

function ClosingIcon({ type }: { type: 'clock' | 'phone' | 'social' | 'pin' }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true">
    {type === 'clock' && <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>}
    {type === 'phone' && <path d="M8 3H5a2 2 0 0 0-2 2c0 8.8 7.2 16 16 16a2 2 0 0 0 2-2v-3l-4-1-1 2c-3.5-1.5-6.5-4.5-8-8l2-1Z"/>}
    {type === 'social' && <><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" className="fill"/></>}
    {type === 'pin' && <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>}
  </svg>
}

function BloomDish({ dish, currency }: { dish: Dish; currency: string }) {
  return <article className="bloom-dish">
    <div>
      <h3 className="menu-dish-name">{dish.name}</h3>
      {dish.description && <p className="menu-dish-description">{dish.description}</p>}
    </div>
    <span className={`bloom-food-mark ${dish.is_veg ? 'veg' : 'nonveg'}`} aria-label={dish.is_veg ? 'Vegetarian' : 'Non-vegetarian'} />
    <strong className="menu-dish-price">{formatCurrency(dish.price, currency)}</strong>
  </article>
}

export default function BloomBrunchMenu({ data }: { data: MenuData }) {
  const { restaurant, categories, dishes } = data
  const design = restaurant.template_settings?.D || {}
  const [menuQr, setMenuQr] = useState('')
  useEffect(() => {
    QRCode.toDataURL(`${window.location.origin}/menu/${restaurant.slug}`, {
      width: 260,
      margin: 1,
      color: { dark: '#315d17', light: '#fbf8ef' },
    }).then(setMenuQr).catch(() => setMenuQr(''))
  }, [restaurant.slug])
  const grouped = categories
    .map(category => ({ category, dishes: dishes.filter(dish => dish.category_id === category.id) }))
    .filter(group => group.dishes.length)
  const uncategorized = dishes.filter(dish => !dish.category_id)
  if (uncategorized.length) {
    grouped.push({
      category: { id: 'other', restaurant_id: restaurant.id, name: 'Other', sort_order: Number.MAX_SAFE_INTEGER },
      dishes: uncategorized,
    })
  }
  const drinkGroups = grouped.filter(group => DRINK_CATEGORY_PATTERN.test(group.category.name))
  const foodGroups = grouped.filter(group => !DRINK_CATEGORY_PATTERN.test(group.category.name))
  const foodSections = foodGroups.flatMap(group => splitSection(group.category, group.dishes))
  const drinkSections = drinkGroups.flatMap(group => splitSection(group.category, group.dishes, DRINKS_PER_SECTION))
  const pages = Array.from({ length: Math.ceil(foodSections.length / 3) }, (_, index) => foodSections.slice(index * 3, index * 3 + 3))
  const drinkPages = Array.from({ length: Math.ceil(drinkSections.length / 2) }, (_, index) => drinkSections.slice(index * 2, index * 2 + 2))
  const coverArtwork = design.imageUrl || '/templates/bloom-brunch/bloom-brunch-cover-v1.png'
  const coverTagline = editableText(design.coverTagline, 'All Day Breakfast • Café • Mocktails')
  const categoryTagline = editableText(design.categoryTagline, 'Freshly made • served all day')

  return <div className="public-menu template-d bloom-brunch-menu">
    <section className="bloom-cover" aria-label={`${restaurant.name} brunch menu cover`}>
      <img className="bloom-cover-art" data-default-src="/templates/bloom-brunch/bloom-brunch-cover-v1.png" src={coverArtwork} alt="" aria-hidden="true" />
      <header className="bloom-cover-copy">
        {restaurant.logo_url && <img src={restaurant.logo_url} alt={`${restaurant.name} logo`} />}
        <small className="menu-cover-title" data-template-field="menuLabel">{editableText(design.menuLabel, 'MENU')}</small>
        <h1 className={`menu-restaurant-name${restaurant.name.trim().length > 22 ? ' is-long' : ''}`}>{restaurant.name}</h1>
        <span className="bloom-flower" aria-hidden="true">✿</span>
        <p className="menu-subtitle" data-template-field="coverTagline">{coverTagline}</p>
        {restaurant.description && <em>{restaurant.description}</em>}
      </header>
      <div className="bloom-cover-flourish" aria-hidden="true"><i />♥<i /></div>
      <a href="#bloom-menu-content" className="bloom-cover-enter" aria-label="View menu">↓</a>
    </section>

    <div id="bloom-menu-content" className="bloom-pages">
      {pages.map((page, pageIndex) => <section className="bloom-menu-page" key={`bloom-page-${pageIndex}`}>
        <img className="bloom-page-art" data-template-image-slot="0" data-default-src="/templates/bloom-brunch/bloom-brunch-inner-v1.png" src={design.menuImageOne || '/templates/bloom-brunch/bloom-brunch-inner-v1.png'} alt="" aria-hidden="true" />
        <header className="bloom-page-header">
          <span>{restaurant.name}</span>
          <h2 data-template-field="sectionKicker">{editableText(design.sectionKicker, 'Breakfast Delights')}</h2>
          <div aria-hidden="true"><i />♡<i /></div>
        </header>
        <div className="bloom-section-grid">
          {page.map(section => <article className="bloom-section" key={section.key}>
            <header>
              <h2 className={`menu-category-name${section.name.length > 24 ? ' is-long' : ''}`}>{section.name}{section.continued ? ' — continued' : ''}</h2>
              <p data-template-field="categoryTagline">{categoryTagline}</p>
            </header>
            <div>{section.dishes.map(dish => <BloomDish key={dish.id} dish={dish} currency={restaurant.currency} />)}</div>
          </article>)}
        </div>
        <footer><span>{restaurant.address || restaurant.phone || 'Made with fresh ingredients'}</span><b>{String(pageIndex + 2).padStart(2, '0')}</b></footer>
      </section>)}
      {drinkPages.map((page, pageIndex) => <section className="bloom-drinks-page" key={`bloom-drinks-page-${pageIndex}`}>
        <img className="bloom-drinks-art" data-template-image-slot="1" data-default-src="/templates/bloom-brunch/bloom-brunch-drinks-v1.png" src={design.menuImageTwo || '/templates/bloom-brunch/bloom-brunch-drinks-v1.png'} alt="" aria-hidden="true" />
        <div className="bloom-drinks-grid">
          {page.map(section => <article className="bloom-drinks-section" key={section.key}>
            <header><h2 className={`menu-category-name${section.name.length > 24 ? ' is-long' : ''}`}>{section.name}{section.continued ? ' — continued' : ''}</h2><div aria-hidden="true"><i />❧<i /></div></header>
            <div>{section.dishes.map(dish => <BloomDrink key={dish.id} dish={dish} currency={restaurant.currency} />)}</div>
          </article>)}
        </div>
        <footer><span>{restaurant.name}</span><b>{String(pages.length + pageIndex + 2).padStart(2, '0')}</b></footer>
      </section>)}
      {!pages.length && !drinkPages.length && <section className="bloom-menu-page bloom-empty">
        <img className="bloom-page-art" data-template-image-slot="0" data-default-src="/templates/bloom-brunch/bloom-brunch-inner-v1.png" src={design.menuImageOne || '/templates/bloom-brunch/bloom-brunch-inner-v1.png'} alt="" aria-hidden="true" />
        <h2 className="menu-category-name">Menu coming soon</h2>
        <p>Add categories and dishes from your dashboard.</p>
      </section>}
      <section className="bloom-back-page" aria-label={`${restaurant.name} contact details`}>
        <img className="bloom-back-art" data-default-src="/templates/bloom-brunch/bloom-brunch-back-v1.png" src={design.backImageUrl || '/templates/bloom-brunch/bloom-brunch-back-v1.png'} alt="" aria-hidden="true" />
        <header className="bloom-back-thanks">
          <span aria-hidden="true">♡</span>
          <h2 data-template-field="thankYouTitle">{editableText(design.thankYouTitle, 'Thank You')}</h2>
          <h3 data-template-field="thankYouSubtitle">{editableText(design.thankYouSubtitle, 'for brunching with us')}</h3>
          <p data-template-field="thankYouMessage">{editableText(design.thankYouMessage, 'Good food tastes better when shared.')}</p>
        </header>
        <div className="bloom-back-details">
          <section><ClosingIcon type="clock"/><div><b>OPENING HOURS</b><p data-template-field="openingHours">{editableText(design.openingHours, 'Mon – Sun\n8:00 AM – 5:00 PM')}</p></div></section>
          <section><ClosingIcon type="phone"/><div><b>CONTACT US</b><p>{restaurant.phone || 'Contact details coming soon'}</p></div></section>
          <section><ClosingIcon type="social"/><div><b>FOLLOW US</b><p data-template-field="socialHandle">{editableText(design.socialHandle, '@yourrestaurant')}</p></div></section>
          <section><ClosingIcon type="pin"/><div><b>VISIT US</b><address className="menu-address">{restaurant.address || 'Address coming soon'}</address></div></section>
        </div>
        <div className="bloom-back-qr">
          {menuQr && <img src={menuQr} alt="QR code to open this menu" />}
          <p data-template-field="reserveMessage">{editableText(design.reserveMessage, 'Scan for Menu, Feedback & More')}</p>
        </div>
        <footer data-template-field="closingFooter">{editableText(design.closingFooter, 'See you again soon')}</footer>
      </section>
    </div>
  </div>
}
