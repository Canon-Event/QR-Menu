'use client'

import { useState, Suspense, lazy } from 'react'
import type { MenuData, Dish, Category } from '@/types'
import { formatCurrency } from '@/lib/currency'

// Lazy load the 3D viewer so Three.js only loads on tier 3
const Dish3DViewer = lazy(() => import('@/components/dish/Dish3DViewer'))

interface Props { data: MenuData }

function DishCard({ dish, currency, onClick }: { dish: Dish; currency: string; onClick: () => void }) {
  return (
    <div
      className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0 cursor-pointer"
      onClick={onClick}
    >
      <div className="flex gap-3 items-center">
        {dish.image_url ? (
          <img
            src={dish.image_url}
            alt={dish.name}
            className="w-16 h-16 rounded-xl object-cover shrink-0"
          />
        ) : (
          <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-orange-100 to-amber-50 shrink-0 flex items-center justify-center text-2xl">
            🍽
          </div>
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
            <p className="menu-dish-name font-semibold text-gray-900 text-sm">{dish.name}</p>
          </div>
          {dish.description && (
            <p className="menu-dish-description text-xs text-gray-500 mt-0.5 line-clamp-2 max-w-[200px]">
              {dish.description}
            </p>
          )}
          {dish.model_url && (
            <span className="text-[10px] text-purple-500 font-semibold mt-1 block">
              ✦ View in 3D
            </span>
          )}
        </div>
      </div>
      <span className="menu-dish-price text-sm font-bold text-gray-900 ml-4 shrink-0">{formatCurrency(dish.price, currency)}</span>
    </div>
  )
}

function DishModal({ dish, currency, onClose }: { dish: Dish; currency: string; onClose: () => void }) {
  const [view, setView] = useState<'image' | '3d' | 'video'>(
    dish.model_url ? '3d' : dish.image_url ? 'image' : 'video'
  )

  return (
    <div
      className="fixed inset-0 bg-black/80 z-50 flex items-end justify-center"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-lg rounded-t-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* View switcher */}
        {(dish.model_url || dish.image_url || dish.video_url) && (
          <div className="flex border-b border-gray-100">
            {dish.model_url && (
              <button
                className={`flex-1 py-2 text-xs font-semibold ${
                  view === '3d' ? 'text-purple-600 border-b-2 border-purple-600' : 'text-gray-400'
                }`}
                onClick={() => setView('3d')}
              >
                3D Model
              </button>
            )}
            {dish.image_url && (
              <button
                className={`flex-1 py-2 text-xs font-semibold ${
                  view === 'image' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-400'
                }`}
                onClick={() => setView('image')}
              >
                Photo
              </button>
            )}
            {dish.video_url && (
              <button
                className={`flex-1 py-2 text-xs font-semibold ${
                  view === 'video' ? 'text-red-500 border-b-2 border-red-500' : 'text-gray-400'
                }`}
                onClick={() => setView('video')}
              >
                Video
              </button>
            )}
          </div>
        )}

        {/* Media area */}
        <div className="h-72 bg-gray-50 relative">
          {view === '3d' && dish.model_url && (
            <Suspense
              fallback={
                <div className="flex items-center justify-center h-full text-sm text-gray-400">
                  Loading 3D…
                </div>
              }
            >
              <Dish3DViewer modelUrl={dish.model_url} />
            </Suspense>
          )}
          {view === 'image' && dish.image_url && (
            <img
              src={dish.image_url}
              alt={dish.name}
              className="w-full h-full object-cover"
            />
          )}
          {view === 'video' && dish.video_url && (
            <video
              src={dish.video_url}
              className="w-full h-full object-cover"
              autoPlay
              controls
              playsInline
            />
          )}
        </div>

        {/* Info */}
        <div className="p-4 pb-8">
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
          <p className="menu-dish-price text-2xl font-bold text-gray-900 mt-3">{formatCurrency(dish.price, currency)}</p>
        </div>

        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-black/10 text-gray-600 hover:bg-black/20 text-lg"
        >
          ×
        </button>
      </div>
    </div>
  )
}

export default function MenuTier3({ data }: Props) {
  const { restaurant, categories, dishes } = data
  const [selected, setSelected] = useState<Dish | null>(null)

  const grouped = categories.map((cat: Category) => ({
    category: cat,
    dishes: dishes.filter((d: Dish) => d.category_id === cat.id),
  }))
  const uncategorized = dishes.filter((d: Dish) => !d.category_id)

  return (
    <div className={`public-menu template-${restaurant.template.toLowerCase()} min-h-screen bg-white max-w-lg mx-auto px-4 py-6`}>
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
        <span className="text-xs text-purple-500 font-semibold mt-1 block">✦ 3D Menu Experience</span>
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
        <DishModal dish={selected} currency={restaurant.currency} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}
