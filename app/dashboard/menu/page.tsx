import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import MenuManager from '@/components/dashboard/MenuManager'
import IngredientsManager from '@/components/dashboard/IngredientsManager'
import type { Category, Dish, DishIngredient, Ingredient } from '@/types'

export default async function MenuManagementPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/dashboard/menu')
  const { data: restaurant } = await supabase.from('restaurants').select('id, name, slug').eq('owner_id', user.id).limit(1).maybeSingle()
  if (!restaurant) redirect('/dashboard/setup')
  const [{ data: categories }, { data: dishes }, { data: ingredients }, { data: links }] = await Promise.all([
    supabase.from('categories').select('*').eq('restaurant_id', restaurant.id).order('sort_order').order('name'),
    supabase.from('dishes').select('*').eq('restaurant_id', restaurant.id).order('sort_order').order('created_at'),
    (await searchParams).tab === 'ingredients' ? supabase.from('ingredients').select('*').eq('restaurant_id', restaurant.id).order('name') : Promise.resolve({ data: [] }),
    (await searchParams).tab === 'ingredients' ? supabase.from('dish_ingredients').select('*').eq('restaurant_id', restaurant.id) : Promise.resolve({ data: [] }),
  ])
  if ((await searchParams).tab === 'ingredients') return <IngredientsManager initialIngredients={(ingredients ?? []) as Ingredient[]} initialLinks={(links ?? []) as DishIngredient[]} dishes={(dishes ?? []) as Dish[]} restaurantName={restaurant.name} />
  return <MenuManager initialCategories={(categories ?? []) as Category[]} initialDishes={(dishes ?? []) as Dish[]} restaurantName={restaurant.name} menuUrl={`/menu/${restaurant.slug}`} />
}
