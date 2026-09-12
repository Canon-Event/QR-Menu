'use client'

import type { Category, Dish, MenuData } from '@/types'
import { formatCurrency } from '@/lib/currency'

type VintageSection = {
  key: string
  name: string
  dishes: Dish[]
  continued: boolean
}

const DISHES_PER_SECTION = 5
const SECTIONS_PER_PAGE = 3

function splitSection(category: Category, dishes: Dish[]): VintageSection[] {
  return Array.from({ length: Math.ceil(dishes.length / DISHES_PER_SECTION) }, (_, index) => ({
    key: `${category.id}-${index}`,
    name: category.name,
    dishes: dishes.slice(index * DISHES_PER_SECTION, index * DISHES_PER_SECTION + DISHES_PER_SECTION),
    continued: index > 0,
  }))
}

function joinPageTitle(sections: VintageSection[]) {
  const names = sections.map(section => section.name).filter((name, index, all) => all.indexOf(name) === index)
  if (!names.length) return 'Menu'
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`
}

function VintageSectionBlock({ section, placement = '' , currency }: { section: VintageSection; placement?: string; currency: string }) {
  return <article className={`heritage-vintage-section ${placement}`}>
    <h3 className="menu-category-name">{section.name}{section.continued ? ' — continued' : ''}</h3>
    <div>{section.dishes.map(dish => <div className="heritage-vintage-dish" key={dish.id}>
      <div><b className="menu-dish-name">{dish.name}</b><i aria-hidden="true"/><strong className="menu-dish-price">{formatCurrency(dish.price, currency)}</strong></div>
      {dish.description && <p className="menu-dish-description">{dish.description}</p>}
    </div>)}</div>
  </article>
}

export default function HeritageVintagePages({ data }: { data: MenuData }) {
  const { restaurant, categories, dishes } = data
  const populated = categories.map(category => ({ category, dishes: dishes.filter(dish => dish.category_id === category.id) })).filter(group => group.dishes.length)
  const uncategorized = dishes.filter(dish => !dish.category_id)
  const groups = uncategorized.length
    ? [...populated, { category: { id: 'other', restaurant_id: restaurant.id, name: 'Other', sort_order: Number.MAX_SAFE_INTEGER } as Category, dishes: uncategorized }]
    : populated
  const sections = groups.flatMap(group => splitSection(group.category, group.dishes))
  const pageCount = Math.max(2, Math.ceil(sections.length / SECTIONS_PER_PAGE))
  const pages = Array.from({ length: pageCount }, (_, index) => sections.slice(index * SECTIONS_PER_PAGE, index * SECTIONS_PER_PAGE + SECTIONS_PER_PAGE))

  return <div id="menu-content" className="heritage-vintage-pages">
    {pages.map((pageSections, pageIndex) => {
      const pageTitle = joinPageTitle(pageSections)
      const isSpecialsPage = pageIndex === 1
      return <section className={`heritage-vintage-page${isSpecialsPage ? ' heritage-specials-page' : ''}`} key={`heritage-vintage-${pageIndex}`}>
        <img className="heritage-vintage-background" src={isSpecialsPage ? '/templates/heritage/vintage-specials-background-v1.png' : '/templates/heritage/vintage-inner-background-v3.png'} alt="" aria-hidden="true" />
        <header className="heritage-vintage-identity">
          {restaurant.logo_url && <img src={restaurant.logo_url} alt={`${restaurant.name} logo`} />}
          <b className={`menu-restaurant-name${restaurant.name.length > 22 ? ' is-long' : ''}`}>{restaurant.name}</b>
          <span className="menu-subtitle">{restaurant.description || 'Authentic flavours · thoughtfully served'}</span>
        </header>
        <h2 className={`heritage-vintage-title menu-cover-title${pageTitle.length > 30 ? ' is-long' : ''}`}>{pageTitle}</h2>
        <div className={isSpecialsPage ? 'heritage-specials-layout' : 'heritage-vintage-sections'}>
          {pageSections.length ? pageSections.map((section, sectionIndex) => <VintageSectionBlock key={section.key} section={section} currency={restaurant.currency} placement={isSpecialsPage ? ['featured', 'lower-left', 'lower-right'][sectionIndex] : ''} />) : isSpecialsPage ? null : <article className="heritage-vintage-empty"><h3>Menu coming soon</h3><p>Add categories and dishes from your dashboard.</p></article>}
        </div>
        <footer><span>{String(pageIndex + 2).padStart(2, '0')}</span></footer>
      </section>
    })}
  </div>
}
