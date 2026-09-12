'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import type { Category, Dish, MenuData } from '@/types'
import { formatCurrency } from '@/lib/currency'

const editableText = (value: string | undefined, fallback: string) => value === undefined ? fallback : value
const DISHES_PER_SECTION = 8

type ItalianSection = { key: string; name: string; dishes: Dish[]; continued: boolean }

function ItalianDish({ dish, currency }: { dish: Dish; currency: string }) {
  return <article className="italian-dish">
    <div><h3 className="menu-dish-name">{dish.name}</h3>{dish.description && <p className="menu-dish-description">{dish.description}</p>}</div>
    <strong className="menu-dish-price">{formatCurrency(dish.price, currency)}</strong>
  </article>
}

function splitItalianSection(category: Category, dishes: Dish[]): ItalianSection[] {
  return Array.from({ length: Math.ceil(dishes.length / DISHES_PER_SECTION) }, (_, index) => ({
    key: `${category.id}-${index}`,
    name: category.name,
    dishes: dishes.slice(index * DISHES_PER_SECTION, index * DISHES_PER_SECTION + DISHES_PER_SECTION),
    continued: index > 0,
  }))
}

function ItalianMenuSection({ section, currency, tagline }: { section: ItalianSection; currency: string; tagline: string }) {
  return <article className="italian-inner-section">
    <header><h2 className={`menu-category-name${section.name.length > 24 ? ' is-long' : ''}`}>{section.name}{section.continued ? ' — continued' : ''}</h2><p data-template-field="categoryTagline">{tagline}</p></header>
    <div className="italian-inner-dishes">{section.dishes.map(dish => <ItalianDish key={dish.id} dish={dish} currency={currency} />)}</div>
  </article>
}

function ItalianFeatureSection({ section, currency, placement }: { section: ItalianSection; currency: string; placement: 'top' | 'middle' | 'bottom-left' | 'bottom-right' }) {
  return <article className={`italian-feature-section italian-feature-${placement}`}>
    <h2 className={`menu-category-name${section.name.length > 24 ? ' is-long' : ''}`}>
      {section.name}{section.continued ? ' — continued' : ''}
    </h2>
    <div className="italian-feature-dishes">
      {section.dishes.map(dish => <ItalianDish key={dish.id} dish={dish} currency={currency} />)}
    </div>
  </article>
}

export default function ItalianMenu({ data }: { data: MenuData }) {
  const { restaurant, categories, dishes } = data
  const design = restaurant.template_settings?.C || {}
  const [menuQr, setMenuQr] = useState('')
  useEffect(() => {
    QRCode.toDataURL(`${window.location.origin}/menu/${restaurant.slug}`, {
      width: 260,
      margin: 1,
      color: { dark: '#601b28', light: '#f7efe1' },
    }).then(setMenuQr).catch(() => setMenuQr(''))
  }, [restaurant.slug])
  const groups = categories.map((category: Category) => ({ category, dishes: dishes.filter((dish: Dish) => dish.category_id === category.id) })).filter(group => group.dishes.length)
  const uncategorized = dishes.filter((dish: Dish) => !dish.category_id)
  const completeGroups = uncategorized.length
    ? [...groups, { category: { id: 'other', restaurant_id: restaurant.id, name: 'Other', sort_order: Number.MAX_SAFE_INTEGER } as Category, dishes: uncategorized }]
    : groups
  const sections = completeGroups.flatMap(group => splitItalianSection(group.category, group.dishes))
  const pageTwoSections = sections.slice(0, 2)
  const pageThreeSections = sections.slice(2, 6)
  const remainingSections = sections.slice(6)
  const remainingPages = Array.from({ length: Math.ceil(remainingSections.length / 2) }, (_, index) => remainingSections.slice(index * 2, index * 2 + 2))
  const featurePlacements = ['top', 'middle', 'bottom-left', 'bottom-right'] as const
  const categoryTagline = editableText(design.categoryTagline, 'SMALL PLATES · BEAUTIFUL MOMENTS')

  return <div className="public-menu template-c italian-menu-shell">
    <section className="italian-cover" aria-label={`${restaurant.name} Italian menu cover`}>
      <img className="italian-cover-background" data-default-src="/templates/italian/italian-cover-background-v1.png" src={design.imageUrl || '/templates/italian/italian-cover-background-v1.png'} alt="" aria-hidden="true" />
      <p className="italian-top-note" data-template-field="coverSideNote">{editableText(design.coverSideNote, 'GOOD FOOD · BRIGHTER CONVERSATIONS')}</p>
      <header className="italian-cover-identity">
        {restaurant.logo_url && <img src={restaurant.logo_url} alt={`${restaurant.name} logo`} />}
        <h1 className={`menu-restaurant-name${restaurant.name.trim().length > 22 ? ' is-long' : ''}`}>{restaurant.name}</h1>
        <p className="menu-subtitle">{restaurant.description || 'Italian kitchen & café'}</p>
      </header>
      <div className="italian-menu-mark">
        <b className="menu-cover-title" data-template-field="menuLabel">{editableText(design.menuLabel, 'Menu')}</b>
        <i aria-hidden="true">◆</i>
        <p data-template-field="coverTagline">{editableText(design.coverTagline, 'TIMELESS FLAVOURS · BEAUTIFUL MOMENTS')}</p>
      </div>
      <p className="italian-side-note" data-template-field="coverFooter">{editableText(design.coverFooter, 'A TABLE FOR BRIGHTER DAYS')}</p>
      <p className="italian-established" data-template-field="sectionKicker">{editableText(design.sectionKicker, 'ESTABLISHED')}</p>
      <a href="#italian-menu-content" className="italian-cover-enter" aria-label="View menu">↓</a>
    </section>

    <div id="italian-menu-content" className="italian-menu-pages">
      {pageTwoSections.length > 0 && <section className="italian-inner-page">
        <img className="italian-inner-background" src="/templates/italian/italian-inner-background-v1.png" alt="" aria-hidden="true" />
        <p className="italian-inner-top-note">GOOD FOOD BRINGS PEOPLE TOGETHER</p>
        <div className="italian-inner-sections">
          {pageTwoSections.map(section => <ItalianMenuSection key={section.key} section={section} currency={restaurant.currency} tagline={categoryTagline} />)}
        </div>
        <footer><span>A MORE DELICIOUS TOMORROW</span><b>02</b></footer>
      </section>}

      {pageThreeSections.length > 0 && <section className="italian-feature-page" aria-label="Italian menu page 3">
        <img className="italian-feature-background" src="/templates/italian/italian-feature-page-background-v1.png" alt="" aria-hidden="true" />
        <p className="italian-feature-top-note" data-template-field="coverTagline">{editableText(design.coverTagline, 'GOOD FOOD BRINGS PEOPLE TOGETHER')}</p>
        <div className="italian-feature-sections">
          {pageThreeSections.map((section, index) => <ItalianFeatureSection key={section.key} section={section} currency={restaurant.currency} placement={featurePlacements[index]} />)}
        </div>
        <footer><span data-template-field="coverFooter">{editableText(design.coverFooter, 'GOOD COMPANY · GREAT FOOD · BRIGHTER DAYS')}</span><b>03</b></footer>
      </section>}

      {remainingPages.map((pageSections, pageIndex) => <section className="italian-inner-page" key={`italian-inner-page-${pageIndex + 4}`}>
        <img className="italian-inner-background" src="/templates/italian/italian-inner-background-v1.png" alt="" aria-hidden="true" />
        <p className="italian-inner-top-note">GOOD FOOD BRINGS PEOPLE TOGETHER</p>
        <div className="italian-inner-sections">
          {pageSections.map(section => <ItalianMenuSection key={section.key} section={section} currency={restaurant.currency} tagline={categoryTagline} />)}
        </div>
        <footer><span>A MORE DELICIOUS TOMORROW</span><b>{String(pageIndex + 4).padStart(2, '0')}</b></footer>
      </section>)}
    </div>

    <section className="italian-back-page" aria-label={`${restaurant.name} menu closing page`}>
      <img className="italian-back-background" src="/templates/italian/italian-back-page-background-v1.png" alt="" aria-hidden="true" />
      <p className="italian-back-side italian-back-side-left" data-template-field="coverEyebrow">{editableText(design.coverEyebrow, 'GOOD FOOD · BRIGHTER PEOPLE')}</p>
      <p className="italian-back-side italian-back-side-right" data-template-field="coverSideNote">{editableText(design.coverSideNote, 'A MORE BEAUTIFUL TABLE · ALWAYS')}</p>

      <header className="italian-back-brand">
        <h2 className={`menu-restaurant-name${restaurant.name.trim().length > 22 ? ' is-long' : ''}`}>{restaurant.name}</h2>
        <p className="menu-subtitle">{restaurant.description || 'Italian kitchen & café'}</p>
      </header>

      <div className="italian-back-thanks">
        <h3 data-template-field="thankYouTitle">{editableText(design.thankYouTitle, 'Thank You')}</h3>
        <b data-template-field="thankYouSubtitle">{editableText(design.thankYouSubtitle, 'FOR BEING PART OF OUR STORY')}</b>
        <p data-template-field="thankYouMessage">{editableText(design.thankYouMessage, `Your presence at our table means the world to us. At ${restaurant.name}, we believe great food creates kinder conversations, brighter days, and a more beautiful tomorrow. We’re so grateful you’re here.`)}</p>
      </div>

      <p className="italian-back-promise" data-template-field="sectionKicker">{editableText(design.sectionKicker, 'SAME GOOD FOOD · A BRIGHTER TOMORROW')}</p>

      <div className="italian-back-details">
        <section><b>HOURS</b><p data-template-field="openingHours">{editableText(design.openingHours, 'Please contact us for today’s opening hours')}</p></section>
        <section className="italian-back-detail-center"><p data-template-field="categoryTagline">{editableText(design.categoryTagline, 'GOOD FOOD · BRIGHTER PEOPLE · ALWAYS')}</p></section>
        <section><b>VISIT US</b><address className="menu-address">{restaurant.address || 'Address available at the restaurant'}</address><a href={restaurant.phone ? `tel:${restaurant.phone}` : undefined}>{restaurant.phone || 'Contact details coming soon'}</a><small data-template-field="socialHandle">{editableText(design.socialHandle, '@yourrestaurant')}</small></section>
      </div>

      <div className="italian-back-reservation">
        {menuQr && <img src={menuQr} alt={`QR code for ${restaurant.name} menu`} />}
        <div><b data-template-field="reserveLabel">{editableText(design.reserveLabel, 'RESERVE A TABLE')}</b><p data-template-field="reserveMessage">{editableText(design.reserveMessage, 'Scan the QR code to revisit our menu')}</p></div>
      </div>

      <p className="italian-back-corner italian-back-corner-left" data-template-field="coverFooter">{editableText(design.coverFooter, 'SAVOUR · CONVERSE · BELONG')}</p>
      <p className="italian-back-corner italian-back-corner-right" data-template-field="coverTagline">{editableText(design.coverTagline, 'SIMPLE MOMENTS · LAST LONGER')}</p>
      <footer data-template-field="closingFooter">{editableText(design.closingFooter, 'À BIENTÔT')}</footer>
    </section>
  </div>
}
