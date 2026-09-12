import type { Restaurant } from '@/types'

export default function HeritageMenuCover({ restaurant }: { restaurant: Restaurant }) {
  const design = restaurant.template_settings?.A
  return (
    <section className="heritage-menu-cover" aria-label={`${restaurant.name} menu cover`}>
      <img className="heritage-menu-art" src={design?.imageUrl || '/templates/heritage/heritage-cover-v1.png'} alt="" aria-hidden="true" />
      <div className="heritage-menu-identity">
        {restaurant.logo_url ? <img className="heritage-menu-logo" src={restaurant.logo_url} alt={`${restaurant.name} logo`} /> : <span className="heritage-menu-logo-fallback" aria-hidden="true">✦</span>}
        <h1 className="menu-restaurant-name">{restaurant.name}</h1>
        {restaurant.description && <p className="menu-subtitle">{restaurant.description}</p>}
        <strong className="menu-cover-title">MENU</strong>
      </div>
      <a href="#menu-content" className="heritage-menu-enter">View menu <span aria-hidden="true">↓</span></a>
    </section>
  )
}
