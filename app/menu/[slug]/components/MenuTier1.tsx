'use client'

import type { MenuData, Dish, Category } from '@/types'
import { formatCurrency } from '@/lib/currency'
import HeritageMenuCover from '@/components/menu/HeritageMenuCover'
import HeritageVintagePages from '@/components/menu/HeritageVintagePages'

interface Props { data: MenuData }

function VegBadge({ isVeg }: { isVeg: boolean }) {
  return (
    <span
      className={`inline-block w-3 h-3 border-2 rounded-sm ${
        isVeg ? 'border-green-600' : 'border-red-600'
      }`}
      style={{
        background: isVeg ? '#16a34a' : '#dc2626',
      }}
    />
  )
}

function DishRow({ dish, currency }: { dish: Dish; currency: string }) {
  return (
    <div className="flex items-start justify-between py-3 border-b border-gray-100 last:border-0">
      <div className="flex gap-2 items-start">
        <VegBadge isVeg={dish.is_veg} />
        <div>
          <p className="menu-dish-name font-medium text-gray-900 text-sm">{dish.name}</p>
          {dish.description && (
            <p className="menu-dish-description text-xs text-gray-500 mt-0.5 max-w-xs">{dish.description}</p>
          )}
        </div>
      </div>
      <span className="menu-dish-price text-sm font-semibold text-gray-800 ml-4 shrink-0">
        {formatCurrency(dish.price, currency)}
      </span>
    </div>
  )
}

export default function MenuTier1({ data }: Props) {
  const { restaurant, categories, dishes } = data

  const grouped = categories.map((cat: Category) => ({
    category: cat,
    dishes: dishes.filter((d: Dish) => d.category_id === cat.id),
  }))

  const uncategorized = dishes.filter((d: Dish) => !d.category_id)

  return (
    <div className={`public-menu template-${restaurant.template.toLowerCase()} min-h-screen bg-white max-w-lg mx-auto ${restaurant.template === 'A' ? 'heritage-menu-shell' : 'px-4 py-6'}`}>
      {restaurant.template === 'A' && <HeritageMenuCover restaurant={restaurant} />}
      {/* Header */}
      {restaurant.template !== 'A' && <div className="text-center mb-8">
        {restaurant.logo_url && (
          <img
            src={restaurant.logo_url}
            alt={restaurant.name}
            className="w-16 h-16 rounded-full mx-auto mb-3 object-cover"
          />
        )}
        <h1 className="menu-restaurant-name text-2xl font-bold text-gray-900">{restaurant.name}</h1>
        {restaurant.description && <p className="menu-subtitle public-menu-description">{restaurant.description}</p>}
        {restaurant.address && <p className="menu-address public-menu-address">{restaurant.address}</p>}
      </div>}

      {/* Menu */}
      {restaurant.template === 'A' ? <HeritageVintagePages data={data} /> : <div id="menu-content">
      {grouped.map(({ category, dishes: catDishes }) =>
        catDishes.length === 0 ? null : (
          <section key={category.id} className={restaurant.template === 'A' ? 'heritage-menu-page' : 'mb-6'}>
            <h2 className="menu-category-name text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">
              {category.name}
            </h2>
            {catDishes.map((dish: Dish) => (
              <DishRow key={dish.id} dish={dish} currency={restaurant.currency} />
            ))}
          </section>
        )
      )}

      {uncategorized.length > 0 && (
        <section className={restaurant.template === 'A' ? 'heritage-menu-page' : 'mb-6'}>
          <h2 className="menu-category-name text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">
            Other
          </h2>
          {uncategorized.map((dish: Dish) => (
            <DishRow key={dish.id} dish={dish} currency={restaurant.currency} />
          ))}
        </section>
      )}
      </div>}
    </div>
  )
}
