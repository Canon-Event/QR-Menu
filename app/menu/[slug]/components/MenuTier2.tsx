'use client'

import { useState } from 'react'
import type { MenuData, Dish, Category } from '@/types'
import { formatCurrency } from '@/lib/currency'

interface Props { data: MenuData }

function MediaModal({ dish, currency, onClose }: { dish: Dish; currency: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 bg-black/80 z-50 flex items-end justify-center"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-lg rounded-t-2xl p-4 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Media */}
        {dish.video_url ? (
          <video
            src={dish.video_url}
            className="w-full rounded-xl object-cover max-h-64"
            autoPlay
            controls
            playsInline
          />
        ) : dish.image_url ? (
          <img
            src={dish.image_url}
            alt={dish.name}
            className="w-full rounded-xl object-cover max-h-64"
          />
        ) : null}

        <div className="mt-4">
          <div className="flex items-center gap-2">
            <span
              className={`w-3 h-3 rounded-sm border-2 ${
                dish.is_veg ? 'border-green-600 bg-green-600' : 'border-red-600 bg-red-600'
              }`}
            />
            <h3 className="menu-dish-name text-lg font-bold text-gray-900">{dish.name}</h3>
          </div>
          {dish.description && (
            <p className="menu-dish-description text-sm text-gray-500 mt-1">{dish.description}</p>
          )}
          <p className="menu-dish-price text-xl font-bold text-gray-900 mt-3">{formatCurrency(dish.price, currency)}</p>
        </div>

        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 text-2xl leading-none"
        >
          ×
        </button>
      </div>
    </div>
  )
}

function DishCard({ dish, currency, onClick }: { dish: Dish; currency: string; onClick: () => void }) {
  const hasMedia = !!(dish.image_url || dish.video_url)

  return (
    <div
      className={`flex items-center justify-between py-3 border-b border-gray-100 last:border-0 ${
        hasMedia ? 'cursor-pointer' : ''
      }`}
      onClick={hasMedia ? onClick : undefined}
    >
      <div className="flex gap-3 items-center">
        {dish.image_url ? (
          <img
            src={dish.image_url}
            alt={dish.name}
            className="w-14 h-14 rounded-lg object-cover shrink-0"
          />
        ) : (
          <div className="w-14 h-14 rounded-lg bg-gray-100 shrink-0" />
        )}
        <div>
          <div className="flex items-center gap-1.5">
            <span
              className={`w-2.5 h-2.5 rounded-sm border-2 ${
                dish.is_veg
                  ? 'border-green-600 bg-green-600'
                  : 'border-red-600 bg-red-600'
              }`}
            />
            <p className="menu-dish-name font-medium text-gray-900 text-sm">{dish.name}</p>
          </div>
          {dish.description && (
            <p className="menu-dish-description text-xs text-gray-500 mt-0.5 line-clamp-2 max-w-[200px]">
              {dish.description}
            </p>
          )}
        </div>
      </div>
      <div className="ml-4 flex flex-col items-end gap-1 shrink-0">
        <span className="menu-dish-price text-sm font-bold text-gray-900">{formatCurrency(dish.price, currency)}</span>
        {hasMedia && (
          <span className="text-[10px] text-blue-500 font-medium">
            {dish.video_url ? '▶ Video' : '📷 View'}
          </span>
        )}
      </div>
    </div>
  )
}

export default function MenuTier2({ data }: Props) {
  const { restaurant, categories, dishes } = data
  const [selected, setSelected] = useState<Dish | null>(null)

  const grouped = categories.map((cat: Category) => ({
    category: cat,
    dishes: dishes.filter((d: Dish) => d.category_id === cat.id),
  }))
  const uncategorized = dishes.filter((d: Dish) => !d.category_id)

  return (
    <div className={`public-menu template-${restaurant.template.toLowerCase()} min-h-screen bg-white max-w-lg mx-auto px-4 py-6`}>
      {/* Header */}
      <div className="text-center mb-8">
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
      </div>

      {grouped.map(({ category, dishes: catDishes }) =>
        catDishes.length === 0 ? null : (
          <section key={category.id} className="mb-6">
            <h2 className="menu-category-name text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">
              {category.name}
            </h2>
            {catDishes.map((dish: Dish) => (
              <DishCard key={dish.id} dish={dish} currency={restaurant.currency} onClick={() => setSelected(dish)} />
            ))}
          </section>
        )
      )}

      {uncategorized.length > 0 && (
        <section className="mb-6">
          <h2 className="menu-category-name text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Other</h2>
          {uncategorized.map((dish: Dish) => (
            <DishCard key={dish.id} dish={dish} currency={restaurant.currency} onClick={() => setSelected(dish)} />
          ))}
        </section>
      )}

      {selected && (
        <MediaModal dish={selected} currency={restaurant.currency} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}
