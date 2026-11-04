import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import MenuManager from '@/components/dashboard/MenuManager'
import IngredientsManager from '@/components/dashboard/IngredientsManager'
import { createDashboardSampleData } from '@/lib/dashboard-demo-data'
import type { Category, Dish, DishIngredient, Ingredient } from '@/types'

export default async function MenuManagementPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/dashboard/menu')
  const { data: restaurant } = await supabase.from('restaurants').select('id, name, slug').eq('owner_id', user.id).limit(1).maybeSingle()
  if (!restaurant) redirect('/dashboard/setup')

  const params = await searchParams
  const showIngredients = params.tab === 'ingredients'
  const [{ data: categories }, { data: dishes }, { data: ingredients }, { data: links }] = await Promise.all([
    supabase.from('categories').select('*').eq('restaurant_id', restaurant.id).order('sort_order').order('name'),
    supabase.from('dishes').select('*').eq('restaurant_id', restaurant.id).order('sort_order').order('created_at'),
    showIngredients ? supabase.from('ingredients').select('*').eq('restaurant_id', restaurant.id).order('name') : Promise.resolve({ data: [] }),
    showIngredients ? supabase.from('dish_ingredients').select('*').eq('restaurant_id', restaurant.id) : Promise.resolve({ data: [] }),
  ])
  const isSamplePreview = !categories?.length && !dishes?.length
  const sample = createDashboardSampleData()
  const displayCategories = isSamplePreview
    ? sample.categories.map((category) => ({ ...category, restaurant_id: restaurant.id }))
    : categories ?? []
  const displayDishes = isSamplePreview
    ? sample.dishes.map((dish) => ({ ...dish, restaurant_id: restaurant.id }))
    : dishes ?? []

  if (showIngredients) {
    const createdAt = new Date().toISOString()
    const displayIngredients = isSamplePreview
      ? sample.ingredients.map((ingredient) => ({ ...ingredient, restaurant_id: restaurant.id, created_at: createdAt, updated_at: createdAt }))
      : ingredients ?? []
    const displayLinks = isSamplePreview
      ? sample.links.map((link) => ({ ...link, restaurant_id: restaurant.id }))
      : links ?? []
    return <IngredientsManager initialIngredients={displayIngredients as Ingredient[]} initialLinks={displayLinks as DishIngredient[]} dishes={displayDishes as Dish[]} restaurantName={restaurant.name} demoMode={isSamplePreview} />
  }

  return <MenuManager initialCategories={displayCategories as Category[]} initialDishes={displayDishes as Dish[]} restaurantName={restaurant.name} menuUrl={`/menu/${restaurant.slug}`} demoMode={isSamplePreview} />
}
