type SampleOrderItem = { dish_name: string; quantity: number; line_total: number }

export type SampleOrder = {
  id: string
  order_number: number
  customer_name: string
  customer_phone: string
  customer_note: string
  status: string
  currency: string
  total: number
  created_at: string
  order_items: SampleOrderItem[]
}

export function createDashboardSampleData(now = new Date()) {
  const daysAgo = (days: number) => {
    const date = new Date(now)
    date.setDate(date.getDate() - days)
    return date.toISOString()
  }
  const orders: SampleOrder[] = [
    { id: 'sample-order-1049', order_number: 1049, customer_name: 'Riya Kapoor', customer_phone: '+91 98765 41001', customer_note: 'Less spicy, please', status: 'pending', currency: 'INR', total: 845, created_at: daysAgo(0), order_items: [{ dish_name: 'Paneer Tikka', quantity: 1, line_total: 345 }, { dish_name: 'Butter Naan', quantity: 2, line_total: 200 }, { dish_name: 'Masala Chaas', quantity: 1, line_total: 100 }] },
    { id: 'sample-order-1048', order_number: 1048, customer_name: 'Arjun Mehta', customer_phone: '+91 98765 41002', customer_note: '', status: 'preparing', currency: 'INR', total: 810, created_at: daysAgo(0), order_items: [{ dish_name: 'Dal Makhani', quantity: 1, line_total: 390 }, { dish_name: 'Jeera Rice', quantity: 1, line_total: 240 }, { dish_name: 'Gulab Jamun', quantity: 2, line_total: 180 }] },
    { id: 'sample-order-1047', order_number: 1047, customer_name: 'Sara Thomas', customer_phone: '+91 98765 41003', customer_note: 'No onion', status: 'ready', currency: 'INR', total: 580, created_at: daysAgo(1), order_items: [{ dish_name: 'Garden Veg Biryani', quantity: 1, line_total: 420 }, { dish_name: 'Mango Lassi', quantity: 1, line_total: 160 }] },
    { id: 'sample-order-1046', order_number: 1046, customer_name: 'Kabir Singh', customer_phone: '+91 98765 41004', customer_note: '', status: 'completed', currency: 'INR', total: 1255, created_at: daysAgo(2), order_items: [{ dish_name: 'Chicken Tikka', quantity: 1, line_total: 465 }, { dish_name: 'Butter Naan', quantity: 2, line_total: 200 }, { dish_name: 'Dal Makhani', quantity: 1, line_total: 390 }] },
    { id: 'sample-order-1045', order_number: 1045, customer_name: 'Neha Verma', customer_phone: '+91 98765 41005', customer_note: '', status: 'completed', currency: 'INR', total: 765, created_at: daysAgo(4), order_items: [{ dish_name: 'Paneer Tikka', quantity: 1, line_total: 345 }, { dish_name: 'Garden Veg Biryani', quantity: 1, line_total: 420 }] },
  ]
  const popularDishes = [
    { name: 'Paneer Tikka', quantity: 28, revenue: 9660 },
    { name: 'Butter Naan', quantity: 24, revenue: 2400 },
    { name: 'Dal Makhani', quantity: 19, revenue: 7410 },
    { name: 'Garden Veg Biryani', quantity: 16, revenue: 6720 },
    { name: 'Chicken Tikka', quantity: 13, revenue: 6045 },
  ]
  const recentDishes = [
    { id: 'sample-dish-1', name: 'Paneer Tikka', price: 345, is_veg: true, is_available: true, created_at: daysAgo(0) },
    { id: 'sample-dish-2', name: 'Garden Veg Biryani', price: 420, is_veg: true, is_available: true, created_at: daysAgo(1) },
    { id: 'sample-dish-3', name: 'Chicken Tikka', price: 465, is_veg: false, is_available: true, created_at: daysAgo(2) },
    { id: 'sample-dish-4', name: 'Mango Lassi', price: 160, is_veg: true, is_available: false, created_at: daysAgo(3) },
  ]
  const categories = [
    { id: 'sample-category-1', name: 'Starters', sort_order: 0 },
    { id: 'sample-category-2', name: 'Main Course', sort_order: 1 },
    { id: 'sample-category-3', name: 'Drinks & Desserts', sort_order: 2 },
  ]
  const dishes = [
    { ...recentDishes[0], category_id: categories[0].id, description: 'Chargrilled paneer with peppers and house spices.', sort_order: 0 },
    { ...recentDishes[1], category_id: categories[1].id, description: 'Fragrant basmati rice with seasonal vegetables.', sort_order: 0 },
    { ...recentDishes[2], category_id: categories[0].id, description: 'Smoky chicken tikka with mint chutney.', sort_order: 1 },
    { ...recentDishes[3], category_id: categories[2].id, description: 'Fresh mango blended with chilled yogurt.', sort_order: 0 },
    { id: 'sample-dish-5', category_id: categories[1].id, name: 'Dal Makhani', description: 'Slow-cooked black lentils finished with cream.', price: 390, is_veg: true, is_available: true, sort_order: 1, created_at: daysAgo(5) },
    { id: 'sample-dish-6', category_id: categories[2].id, name: 'Gulab Jamun', description: 'Warm milk dumplings with cardamom syrup.', price: 90, is_veg: true, is_available: true, sort_order: 1, created_at: daysAgo(6) },
  ]
  const ingredients = [
    { id: 'sample-ingredient-1', name: 'Paneer', quantity: 4.5, unit: 'kg', low_stock_threshold: 2, is_active: true },
    { id: 'sample-ingredient-2', name: 'Basmati rice', quantity: 8, unit: 'kg', low_stock_threshold: 3, is_active: true },
    { id: 'sample-ingredient-3', name: 'Fresh cream', quantity: 1.2, unit: 'litre', low_stock_threshold: 2, is_active: true },
    { id: 'sample-ingredient-4', name: 'Mango pulp', quantity: 0.8, unit: 'kg', low_stock_threshold: 1.5, is_active: true },
  ]
  const links = [
    { id: 'sample-link-1', dish_id: 'sample-dish-1', ingredient_id: 'sample-ingredient-1', quantity: 0.2, unit: 'kg' },
    { id: 'sample-link-2', dish_id: 'sample-dish-2', ingredient_id: 'sample-ingredient-2', quantity: 0.25, unit: 'kg' },
    { id: 'sample-link-3', dish_id: 'sample-dish-5', ingredient_id: 'sample-ingredient-3', quantity: 0.1, unit: 'litre' },
    { id: 'sample-link-4', dish_id: 'sample-dish-6', ingredient_id: 'sample-ingredient-3', quantity: 0.05, unit: 'litre' },
  ]
  return { orders, popularDishes, recentDishes, categories, dishes, ingredients, links, dishCount: dishes.length, ingredientCount: ingredients.length, visits: 1287 }
}
