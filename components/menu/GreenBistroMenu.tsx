'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import type { Category, Dish, MenuData } from '@/types'
import { formatCurrency } from '@/lib/currency'

const fallbackImages = [
  '/templates/green-bistro/burrata.jpg',
  '/templates/green-bistro/pasta.jpg',
  '/templates/green-bistro/botanical-drink-v1.png',
  '/templates/green-bistro/steak.jpg',
]
const editableText = (value: string | undefined, fallback: string) => value === undefined ? fallback : value

function DishLine({ dish, currency }: { dish: Dish; currency: string }) {
  return <article className="bistro-dish">
    <div><h3 className="menu-dish-name">{dish.name}</h3>{dish.description && <p className="menu-dish-description">{dish.description}</p>}</div>
    <strong className="menu-dish-price">{formatCurrency(dish.price, currency)}</strong>
  </article>
}

type BistroGroup = { category: Category; dishes: Dish[]; image: string }

function BotanicalCategory({ group, currency, placement, imageSlot, tagline }: {
  group: BistroGroup
  currency: string
  placement: 'left' | 'top-right' | 'bottom-right'
  imageSlot: number
  tagline: string
}) {
  return <article className={`bistro-botanical-category ${placement}`}>
    <header>
      <h2 className="menu-category-name">{group.category.name}</h2>
      <span data-template-field="categoryTagline">{tagline}</span>
    </header>
    <div className="bistro-botanical-dishes">
      {group.dishes.map(dish => <DishLine key={dish.id} dish={dish} currency={currency} />)}
    </div>
    {placement !== 'top-right' && <figure>
      <img data-template-image-slot={imageSlot} data-default-src={group.image} src={group.image} alt={`${group.category.name} selection`} />
    </figure>}
  </article>
}

function BackPageIcon({ type }: { type: 'clock' | 'pin' | 'phone' }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true">
    {type === 'clock' && <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>}
    {type === 'pin' && <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>}
    {type === 'phone' && <path d="M8 3H5a2 2 0 0 0-2 2c0 8.8 7.2 16 16 16a2 2 0 0 0 2-2v-3l-4-1-1 2c-3.5-1.5-6.5-4.5-8-8l2-1Z"/>}
  </svg>
}

export default function GreenBistroMenu({ data }: { data: MenuData }) {
  const { restaurant, categories, dishes } = data
  const design = restaurant.template_settings?.B || {}
  const [menuQr, setMenuQr] = useState('')
  useEffect(() => { QRCode.toDataURL(`${window.location.origin}/menu/${restaurant.slug}`, { width: 260, margin: 1, color: { dark: '#203622', light: '#f7f1e4' } }).then(setMenuQr).catch(() => setMenuQr('')) }, [restaurant.slug])
  const configuredImages = [design.menuImageOne, design.menuImageTwo, design.menuImageThree, design.menuImageFour]
  const groups = categories.map((category: Category, index: number) => ({
    category,
    dishes: dishes.filter((dish: Dish) => dish.category_id === category.id),
    image: configuredImages[index % 4] || dishes.find((dish: Dish) => dish.category_id === category.id && dish.image_url)?.image_url || fallbackImages[index % fallbackImages.length],
  })).filter(group => group.dishes.length)
  const uncategorized = dishes.filter((dish: Dish) => !dish.category_id)
  if (uncategorized.length) groups.push({ category: { id: 'other', name: 'Other' } as Category, dishes: uncategorized, image: uncategorized.find((dish: Dish) => dish.image_url)?.image_url || fallbackImages[groups.length % fallbackImages.length] })
  const botanicalPages = Array.from({ length: Math.ceil(groups.length / 3) }, (_, page) => groups.slice(page * 3, page * 3 + 3))
  const fourSectionPages = Array.from({ length: Math.ceil(groups.length / 4) }, (_, page) => groups.slice(page * 4, page * 4 + 4))
  const menuPageLayout = design.menuPageLayout === 'four' || design.menuPageLayout === 'botanical' || design.menuPageLayout === 'both'
    ? design.menuPageLayout
    : 'both'
  const categoryTagline = editableText(design.categoryTagline, 'Fresh flavours, brighter days')
  const restaurantNameClass = `menu-restaurant-name${restaurant.name.trim().length > 18 ? ' is-long' : ''}`

  return <div className="public-menu template-b green-bistro-menu" data-menu-page-layout={menuPageLayout}>
    <section className="bistro-cover bistro-frame">
      <div className="bistro-corner-copy"><span data-template-field="coverEyebrow">{editableText(design.coverEyebrow, 'GOOD FOOD · BRIGHTER DAYS')}</span><span data-template-field="coverSideNote">{editableText(design.coverSideNote, 'FRESH INGREDIENTS · GREAT COMPANY')}</span></div>
      <header className="bistro-brand">
        {restaurant.logo_url ? <img src={restaurant.logo_url} alt={`${restaurant.name} logo`} /> : <i aria-hidden="true">❧</i>}
        <small>THE</small><h1 className={restaurantNameClass}>{restaurant.name}</h1>
        <p className="menu-subtitle">{restaurant.description || 'Modern western kitchen'}</p>
        <em data-template-field="coverTagline">{editableText(design.coverTagline, 'Eat well · Be together')}</em>
        <strong className="menu-cover-title" data-template-field="menuLabel">{editableText(design.menuLabel, 'MENU')}</strong>
        <span className="bistro-menu-note" data-template-field="coverMenuNote">{editableText(design.coverMenuNote, 'Thoughtfully crafted for brighter gatherings')}</span>
      </header>
      <img className="bistro-cover-food" data-default-src="/templates/green-bistro/cover-background-v2.png" src={design.imageUrl || '/templates/green-bistro/cover-background-v2.png'} alt="Featured restaurant dish" />
      <div className="bistro-bottom-copy"><span data-template-field="sectionKicker">{editableText(design.sectionKicker, 'Simple ingredients · extraordinary moments')}</span><span data-template-field="coverFooter">{editableText(design.coverFooter, 'A warmer table for a brighter tomorrow')}</span></div>
      <a className="bistro-view-menu" href="#bistro-menu-content">View menu ↓</a>
    </section>

    <div id="bistro-menu-content" className="bistro-pages">
      {botanicalPages.map((botanicalGroups, botanicalPageIndex) => <section className="bistro-botanical-page bistro-frame" key={`botanical-page-${botanicalPageIndex}`}>
        <img className="bistro-botanical-background" src="/templates/green-bistro/botanical-background-v2.png" alt="" aria-hidden="true" />
        <div className="bistro-corner-copy"><span data-template-field="coverEyebrow">{editableText(design.coverEyebrow, 'GOOD FOOD · BRIGHTER DAYS')}</span><span data-template-field="coverSideNote">{editableText(design.coverSideNote, 'FRESH INGREDIENTS · GREAT COMPANY')}</span></div>
        <header className="bistro-inner-brand"><small>THE</small><b className={restaurantNameClass}>{restaurant.name}</b><p className="menu-subtitle">{restaurant.description || 'Modern western kitchen'}</p></header>
        <aside className="bistro-botanical-note" data-template-field="coverTagline">{editableText(design.coverTagline, 'Eat well · Be together')}</aside>
        <div className="bistro-botanical-grid">
          {botanicalGroups[0] && <BotanicalCategory group={botanicalGroups[0]} currency={restaurant.currency} placement="left" imageSlot={(botanicalPageIndex * 3) % 4} tagline={categoryTagline} />}
          {botanicalGroups[1] && <BotanicalCategory group={botanicalGroups[1]} currency={restaurant.currency} placement="top-right" imageSlot={(botanicalPageIndex * 3 + 1) % 4} tagline={categoryTagline} />}
          {botanicalGroups[2] && <BotanicalCategory group={botanicalGroups[2]} currency={restaurant.currency} placement="bottom-right" imageSlot={(botanicalPageIndex * 3 + 2) % 4} tagline={categoryTagline} />}
        </div>
        <footer><span data-template-field="sectionKicker">{editableText(design.sectionKicker, 'Simple ingredients · extraordinary moments')}</span><b>{String(botanicalPageIndex + 2).padStart(2, '0')}</b><em>{restaurant.name}</em></footer>
      </section>)}
      {fourSectionPages.map((pageGroups, pageIndex) => <section className="bistro-menu-page bistro-frame" key={`four-section-page-${pageIndex}`}>
        <img className="bistro-inner-background" src="/templates/green-bistro/inner-background-v2.png" alt="" aria-hidden="true" />
        <div className="bistro-corner-copy"><span data-template-field="coverEyebrow">{editableText(design.coverEyebrow, 'GOOD FOOD · BRIGHTER DAYS')}</span><span data-template-field="coverSideNote">{editableText(design.coverSideNote, 'FRESH INGREDIENTS · GREAT COMPANY')}</span></div>
        <header className="bistro-inner-brand"><small>THE</small><b className={restaurantNameClass}>{restaurant.name}</b><p className="menu-subtitle">{restaurant.description || 'Modern western kitchen'}</p></header>
        <aside className="bistro-inner-note left" data-template-field="coverFooter">{editableText(design.coverFooter, 'A warmer table for a brighter tomorrow')}</aside><aside className="bistro-inner-note right" data-template-field="sectionKicker">{editableText(design.sectionKicker, 'Good food · greener times')}</aside>
        <div className="bistro-inner-list">{pageGroups.map((group, groupIndex) => {
          const index = pageIndex * 4 + groupIndex
          const defaultImage = dishes.find((dish: Dish) => dish.category_id === group.category.id && dish.image_url)?.image_url || fallbackImages[index % fallbackImages.length]
          return <article className="bistro-inner-category" key={group.category.id}>
            <figure><img data-template-image-slot={index % 4} data-default-src={defaultImage} src={group.image} alt={`${group.category.name} selection`} /></figure>
            <div className="bistro-category-copy"><header><h2 className="menu-category-name">{group.category.name}</h2><span data-template-field="categoryTagline">{editableText(design.categoryTagline, 'Fresh flavours, brighter days')}</span></header>{group.dishes.map(dish => <DishLine key={dish.id} dish={dish} currency={restaurant.currency} />)}</div>
          </article>
        })}</div>
        <footer><span data-template-field="coverTagline">{editableText(design.coverTagline, 'Eat well · Be together')}</span><b>{String(pageIndex + 2 + (menuPageLayout === 'both' ? botanicalPages.length : 0)).padStart(2, '0')}</b><em>{restaurant.name}</em></footer>
      </section>)}
      {!groups.length && <section className="bistro-menu-page bistro-frame bistro-empty"><h2 className="menu-category-name">Menu coming soon</h2><p>Add categories and dishes from your dashboard.</p></section>}
    </div>

    <section className="bistro-back bistro-frame">
      <img className="bistro-back-image" data-default-src="/templates/green-bistro/back-background-v2.png" src={design.backImageUrl || '/templates/green-bistro/back-background-v2.png'} alt="" aria-hidden="true" />
      <div className="bistro-corner-copy"><span data-template-field="coverEyebrow">{editableText(design.coverEyebrow, 'GOOD FOOD · BRIGHTER DAYS')}</span><span data-template-field="coverSideNote">{editableText(design.coverSideNote, 'FRESH INGREDIENTS · GREAT COMPANY')}</span></div>
      <header className="bistro-back-brand"><small>THE</small><b className={restaurantNameClass}>{restaurant.name}</b><p className="menu-subtitle">{restaurant.description || 'Modern western kitchen'}</p><em data-template-field="coverTagline">{editableText(design.coverTagline, 'Eat well · Be together')}</em></header>
      <div className="bistro-thanks"><h2 data-template-field="thankYouTitle">{editableText(design.thankYouTitle, 'Thank You')}</h2><h3 data-template-field="thankYouSubtitle">{editableText(design.thankYouSubtitle, 'for Dining With Us')}</h3><p data-template-field="thankYouMessage">{editableText(design.thankYouMessage, 'Thank you for being part of our table. Good food tastes even better when shared.')}</p></div>
      <div className="bistro-contact"><div><BackPageIcon type="clock"/><b>OPENING HOURS</b><span data-template-field="openingHours">{editableText(design.openingHours, 'Please contact us for today’s hours')}</span></div><div><BackPageIcon type="pin"/><b>OUR ADDRESS</b><span className="menu-address">{restaurant.address || 'Address available at the restaurant'}</span></div><div><BackPageIcon type="phone"/><b>CONTACT US</b><span>{restaurant.phone || 'Contact details coming soon'}</span><small data-template-field="socialHandle">{editableText(design.socialHandle, '@yourrestaurant')}</small></div></div>
      <div className="bistro-reservation">{menuQr && <img src={menuQr} alt="QR code to open this menu" />}<div><b data-template-field="reserveLabel">{editableText(design.reserveLabel, 'RESERVE A TABLE')}</b><p data-template-field="reserveMessage">{editableText(design.reserveMessage, 'Good food brings people together')}</p></div></div>
      <div className="bistro-ingredient-note"><b data-template-field="ingredientNoteTitle">{editableText(design.ingredientNoteTitle, 'A NOTE ON INGREDIENTS')}</b><p data-template-field="ingredientNote">{editableText(design.ingredientNote, 'We use fresh, high-quality ingredients and are happy to assist with dietary requirements or allergen information.')}</p></div>
      <footer data-template-field="closingFooter">{editableText(design.closingFooter, 'A brighter tomorrow tastes better together')}</footer>
    </section>
  </div>
}
