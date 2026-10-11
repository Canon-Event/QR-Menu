function menuFixture(names = ['Starters', 'Soups & Salads', 'Signature Sips', 'Pasta & Mains', 'Wood-fired Favorites', 'Grill House', 'Desserts']) {
  const categories = names.map((name, index) => ({ id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, name, sort_order: index, restaurant_id: 'restaurant' }))
  const dishes = categories.flatMap((category, index) => Array.from({ length: index === 3 ? 4 : 3 }, (_, row) => ({
    id: `${index}-${row}`, restaurant_id: 'restaurant', category_id: category.id,
    name: `${category.name.replace(/&/g, 'and')} dish ${row + 1}`,
    description: 'Fresh ingredients, prepared with herbs and house seasoning.',
    price: 240 + row * 30, is_veg: true, is_available: true, sort_order: row,
  })))
  return { restaurant: { id: 'restaurant', name: 'Green Bistro', slug: 'green-bistro', description: 'Modern western kitchen', currency: 'INR', template: 'B', template_settings: {}, menu_mode: 'view_only' }, categories, dishes, addons: [] }
}
module.exports = { menuFixture }
