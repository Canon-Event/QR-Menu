'use client'

import type { MenuData } from '@/types'
import { formatCurrency } from '@/lib/currency'
import { buildMenuPages, pageTitle, type MenuSection } from '@/lib/menu-layout'

type VintageSection = MenuSection

function VintageSectionBlock({ section, placement = '' , currency }: { section: VintageSection; placement?: string; currency: string }) {
  return <article className={`heritage-vintage-section ${placement}`} style={{ gridRow: section.slot + 1 }}>
    <h3 className="menu-category-name">{section.name}{section.continued ? ' — continued' : ''}</h3>
    <div>{section.dishes.map(dish => <div className="heritage-vintage-dish" key={dish.id}>
      <div><b className="menu-dish-name">{dish.name}</b><i aria-hidden="true"/><strong className="menu-dish-price">{formatCurrency(dish.price, currency)}</strong></div>
      {dish.description && <p className="menu-dish-description">{dish.description}</p>}
    </div>)}</div>
  </article>
}

export default function HeritageVintagePages({ data }: { data: MenuData }) {
  const { restaurant } = data
  const pages = buildMenuPages(data, 'A')

  return <div id="menu-content" className="heritage-vintage-pages">
    {pages.map((page, pageIndex) => {
      const categoryTitle = pageTitle(page.sections)
      const title = page.sections.length > 2 || categoryTitle.length > 36 ? 'Our Menu' : categoryTitle
      const isSpecialsPage = page.layout === 'heritage-specials'
      return <section className={`heritage-vintage-page ${page.layout}${isSpecialsPage ? ' heritage-specials-page' : ''}`} key={`heritage-vintage-${pageIndex}`}>
        {page.layout !== 'heritage-general' && <img className="heritage-vintage-background" src={isSpecialsPage ? '/templates/heritage/vintage-specials-background-v1.png' : '/templates/heritage/vintage-inner-background-v3.png'} alt="" aria-hidden="true" />}
        <header className="heritage-vintage-identity">
          {restaurant.logo_url && <img src={restaurant.logo_url} alt={`${restaurant.name} logo`} />}
          <b className={`menu-restaurant-name${restaurant.name.length > 22 ? ' is-long' : ''}`}>{restaurant.name}</b>
          <span className="menu-subtitle">{restaurant.description || 'Authentic flavours · thoughtfully served'}</span>
        </header>
        <h2 className={`heritage-vintage-title menu-cover-title${title.length > 30 ? ' is-long' : ''}`}>{title}</h2>
        <div className={isSpecialsPage ? 'heritage-specials-layout' : 'heritage-vintage-sections'}>
          {page.sections.map(section => <VintageSectionBlock key={section.key} section={section} currency={restaurant.currency} placement={isSpecialsPage ? ['featured', 'lower-left', 'lower-right'][section.slot] : ''} />)}
        </div>
        <footer><span>{String(pageIndex + 2).padStart(2, '0')}</span></footer>
      </section>
    })}
    {!pages.length && <section className="heritage-vintage-empty"><h3>Menu coming soon</h3><p>Add categories and dishes from your dashboard.</p></section>}
  </div>
}
