export type Tier = 1 | 2 | 3

export interface Restaurant {
  id: string
  owner_id: string
  name: string
  slug: string
  logo_url?: string
  description?: string
  address?: string
  phone?: string
  currency: string
  qr_foreground: string
  qr_background: string
  qr_margin: number
  tier: Tier
  template: 'A' | 'B' | 'C' | string
  custom_css?: string
  template_settings?: Record<string, {
    font?: string
    primaryColor?: string
    textScale?: number
    imageUrl?: string
    restaurantNameSize?: number
    subtitleSize?: number
    menuTitleSize?: number
    categorySize?: number
    dishNameSize?: number
    descriptionSize?: number
    priceSize?: number
    addressSize?: number
    coverEyebrow?: string
    coverSideNote?: string
    coverTagline?: string
    menuLabel?: string
    sectionKicker?: string
    categoryTagline?: string
    thankYouTitle?: string
    thankYouSubtitle?: string
    thankYouMessage?: string
    openingHours?: string
    coverMenuNote?: string
    coverFooter?: string
    socialHandle?: string
    reserveLabel?: string
    reserveMessage?: string
    ingredientNoteTitle?: string
    ingredientNote?: string
    closingFooter?: string
    menuImageOne?: string
    menuImageTwo?: string
    menuImageThree?: string
    menuImageFour?: string
    backImageUrl?: string
    menuPageLayout?: 'four' | 'botanical' | 'both'
  }>
  is_active: boolean
  created_at: string
}

export interface Category {
  id: string
  restaurant_id: string
  name: string
  sort_order: number
}

export interface Dish {
  id: string
  restaurant_id: string
  category_id?: string
  name: string
  description?: string
  price: number
  is_veg: boolean
  is_available: boolean
  sort_order: number
  // tier 2+
  image_url?: string
  video_url?: string
  // tier 3
  model_url?: string
  created_at: string
}

export interface Ingredient {
  id: string
  restaurant_id: string
  name: string
  quantity: number
  unit: string
  low_stock_threshold: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface DishIngredient {
  id: string
  restaurant_id: string
  dish_id: string
  ingredient_id: string
  quantity: number
  unit: string
}

export interface MenuData {
  restaurant: Restaurant
  categories: Category[]
  dishes: Dish[]
  addons: string[]   // addon_key[] — e.g. ['template_pack_1']
}
