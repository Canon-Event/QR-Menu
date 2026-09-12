'use client'

import { FormEvent, useMemo, useState } from 'react'
import type { Category, Dish } from '@/types'

type Props = { initialCategories: Category[]; initialDishes: Dish[]; restaurantName: string; menuUrl: string }
type DishDraft = { id?: string; name: string; description: string; price: string; categoryId: string; isVeg: boolean; isAvailable: boolean }
const emptyDish: DishDraft = { name: '', description: '', price: '', categoryId: '', isVeg: true, isAvailable: true }

async function mutate(url: string, method: string, body: object) {
  const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || 'Something went wrong. Please try again.')
  return result
}

export default function MenuManager({ initialCategories, initialDishes, restaurantName, menuUrl }: Props) {
  const [categories, setCategories] = useState(initialCategories)
  const [dishes, setDishes] = useState(initialDishes)
  const [categoryName, setCategoryName] = useState('')
  const [editingCategory, setEditingCategory] = useState<string | null>(null)
  const [draft, setDraft] = useState<DishDraft>(emptyDish)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)

  const grouped = useMemo(() => categories.map(category => ({ category, dishes: dishes.filter(dish => dish.category_id === category.id) })), [categories, dishes])
  const uncategorized = dishes.filter(dish => !dish.category_id || !categories.some(category => category.id === dish.category_id))
  const notify = (kind: 'error' | 'success', text: string) => setMessage({ kind, text })

  async function saveCategory(event: FormEvent) {
    event.preventDefault(); setBusy('category'); setMessage(null)
    try {
      if (editingCategory) {
        const result = await mutate('/api/menu/categories', 'PATCH', { id: editingCategory, name: categoryName })
        setCategories(items => items.map(item => item.id === editingCategory ? result.category : item)); notify('success', 'Category updated.')
      } else {
        const result = await mutate('/api/menu/categories', 'POST', { name: categoryName })
        setCategories(items => [...items, result.category]); notify('success', 'Category added.')
      }
      setCategoryName(''); setEditingCategory(null)
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Could not save category.') } finally { setBusy('') }
  }

  async function removeCategory(category: Category) {
    if (!confirm(`Delete “${category.name}”? Its dishes will become uncategorized.`)) return
    setBusy(category.id); setMessage(null)
    try {
      await mutate('/api/menu/categories', 'DELETE', { id: category.id })
      setCategories(items => items.filter(item => item.id !== category.id)); setDishes(items => items.map(item => item.category_id === category.id ? { ...item, category_id: undefined } : item)); notify('success', 'Category deleted.')
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Could not delete category.') } finally { setBusy('') }
  }

  async function moveCategory(index: number, direction: -1 | 1) {
    const other = index + direction
    if (other < 0 || other >= categories.length) return
    const reordered = [...categories]; [reordered[index], reordered[other]] = [reordered[other], reordered[index]]
    setCategories(reordered); setBusy('sort-category')
    try { await Promise.all(reordered.map((category, sortOrder) => mutate('/api/menu/categories', 'PATCH', { id: category.id, sortOrder }))) }
    catch (error) { setCategories(categories); notify('error', error instanceof Error ? error.message : 'Could not reorder categories.') } finally { setBusy('') }
  }

  async function saveDish(event: FormEvent) {
    event.preventDefault(); setBusy('dish'); setMessage(null)
    try {
      const payload = { name: draft.name, description: draft.description, price: draft.price, categoryId: draft.categoryId || null, isVeg: draft.isVeg, isAvailable: draft.isAvailable }
      if (draft.id) {
        const result = await mutate('/api/menu/dishes', 'PATCH', { id: draft.id, ...payload })
        setDishes(items => items.map(item => item.id === draft.id ? result.dish : item)); notify('success', 'Dish updated.')
      } else {
        const result = await mutate('/api/menu/dishes', 'POST', payload)
        setDishes(items => [...items, result.dish]); notify('success', 'Dish added to your menu.')
      }
      setDraft(emptyDish)
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Could not save dish.') } finally { setBusy('') }
  }

  function editDish(dish: Dish) {
    setDraft({ id: dish.id, name: dish.name, description: dish.description || '', price: String(dish.price ?? ''), categoryId: dish.category_id || '', isVeg: dish.is_veg, isAvailable: dish.is_available })
    document.getElementById('dish-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  async function patchDish(dish: Dish, changes: object) {
    setBusy(dish.id); setMessage(null)
    try { const result = await mutate('/api/menu/dishes', 'PATCH', { id: dish.id, ...changes }); setDishes(items => items.map(item => item.id === dish.id ? result.dish : item)) }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Could not update dish.') } finally { setBusy('') }
  }

  async function moveDish(group: Dish[], index: number, direction: -1 | 1) {
    const other = index + direction
    if (other < 0 || other >= group.length) return
    const reordered = [...group]; [reordered[index], reordered[other]] = [reordered[other], reordered[index]]
    const positions = new Map(reordered.map((dish, sortOrder) => [dish.id, sortOrder]))
    const previous = dishes
    setDishes(items => items.map(dish => positions.has(dish.id) ? { ...dish, sort_order: positions.get(dish.id)! } : dish))
    setBusy('sort-dish')
    try { await Promise.all(reordered.map((dish, sortOrder) => mutate('/api/menu/dishes', 'PATCH', { id: dish.id, sortOrder }))) }
    catch (error) { setDishes(previous); notify('error', error instanceof Error ? error.message : 'Could not reorder dishes.') } finally { setBusy('') }
  }

  async function removeDish(dish: Dish) {
    if (!confirm(`Delete “${dish.name}”? This cannot be undone.`)) return
    setBusy(dish.id); setMessage(null)
    try { await mutate('/api/menu/dishes', 'DELETE', { id: dish.id }); setDishes(items => items.filter(item => item.id !== dish.id)); if (draft.id === dish.id) setDraft(emptyDish); notify('success', 'Dish deleted.') }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Could not delete dish.') } finally { setBusy('') }
  }

  function DishRow({ dish, group, index }: { dish: Dish; group: Dish[]; index: number }) {
    return <article className={`menu-admin-dish ${dish.is_available ? '' : 'is-hidden'}`}><span className={`food-marker ${dish.is_veg ? 'veg' : 'nonveg'}`} aria-label={dish.is_veg ? 'Vegetarian' : 'Non-vegetarian'} /><div className="menu-admin-dish-copy"><b>{dish.name}</b><small>{dish.description || 'No description'} · ₹{Number(dish.price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</small></div><div className="dish-sort"><button title="Move dish up" disabled={index === 0 || busy === 'sort-dish'} onClick={() => moveDish(group, index, -1)}>↑</button><button title="Move dish down" disabled={index === group.length - 1 || busy === 'sort-dish'} onClick={() => moveDish(group, index, 1)}>↓</button></div><label className="availability-toggle"><input type="checkbox" checked={dish.is_available} disabled={busy === dish.id} onChange={() => patchDish(dish, { isAvailable: !dish.is_available })} /><span />{dish.is_available ? 'Live' : 'Hidden'}</label><button onClick={() => editDish(dish)}>Edit</button><button className="danger-link" disabled={busy === dish.id} onClick={() => removeDish(dish)}>Delete</button></article>
  }

  return <main className="menu-admin-page"><header className="menu-admin-topbar"><div><a href="/dashboard">← Dashboard</a><h1>{restaurantName} menu</h1><p>Manage what guests see when they scan your QR code.</p></div><a className="outline-button-large" href={menuUrl} target="_blank" rel="noreferrer">View live menu ↗</a></header>
    {message && <div className={`menu-flash ${message.kind}`} role="status">{message.text}<button aria-label="Dismiss" onClick={() => setMessage(null)}>×</button></div>}
    <div className="menu-admin-grid"><section className="menu-admin-main"><div className="menu-section-heading"><div><h2>Categories & dishes</h2><p>{dishes.length} dishes across {categories.length} categories</p></div></div>
      {!categories.length && !dishes.length && <div className="menu-empty"><b>Your menu is ready for its first item.</b><p>Create a category, then add a dish using the forms on this page.</p></div>}
      {grouped.map(({ category, dishes: categoryDishes }, index) => <section className="category-block" key={category.id}><header><div><h3>{category.name}</h3><small>{categoryDishes.length} {categoryDishes.length === 1 ? 'dish' : 'dishes'}</small></div><div className="category-actions"><button title="Move up" disabled={index === 0 || busy === 'sort-category'} onClick={() => moveCategory(index, -1)}>↑</button><button title="Move down" disabled={index === categories.length - 1 || busy === 'sort-category'} onClick={() => moveCategory(index, 1)}>↓</button><button onClick={() => { setEditingCategory(category.id); setCategoryName(category.name) }}>Rename</button><button className="danger-link" disabled={busy === category.id} onClick={() => removeCategory(category)}>Delete</button></div></header>{categoryDishes.length ? categoryDishes.map((dish, dishIndex) => <DishRow dish={dish} group={categoryDishes} index={dishIndex} key={dish.id} />) : <p className="category-empty">No dishes in this category yet.</p>}</section>)}
      {uncategorized.length > 0 && <section className="category-block"><header><div><h3>Uncategorized</h3><small>{uncategorized.length} dishes</small></div></header>{uncategorized.map((dish, dishIndex) => <DishRow dish={dish} group={uncategorized} index={dishIndex} key={dish.id} />)}</section>}
    </section><aside className="menu-admin-sidebar"><form className="menu-editor-card" onSubmit={saveCategory}><h2>{editingCategory ? 'Rename category' : 'Add category'}</h2><label htmlFor="category-name">Category name</label><input id="category-name" required minLength={1} maxLength={80} value={categoryName} onChange={event => setCategoryName(event.target.value)} placeholder="e.g. Starters" /><div className="form-actions">{editingCategory && <button type="button" className="text-button" onClick={() => { setEditingCategory(null); setCategoryName('') }}>Cancel</button>}<button className="save-button" disabled={busy === 'category'}>{busy === 'category' ? 'Saving…' : editingCategory ? 'Save name' : 'Add category'}</button></div></form>
      <form id="dish-form" className="menu-editor-card" onSubmit={saveDish}><h2>{draft.id ? 'Edit dish' : 'Add dish'}</h2><label htmlFor="dish-name">Dish name</label><input id="dish-name" required maxLength={120} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} placeholder="e.g. Paneer Tikka" /><label htmlFor="dish-description">Description <span>optional</span></label><textarea id="dish-description" maxLength={500} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} placeholder="A short, appetizing description" /><div className="field-row"><div><label htmlFor="dish-price">Price (₹)</label><input id="dish-price" required type="number" min="0" max="1000000" step="0.01" value={draft.price} onChange={event => setDraft({ ...draft, price: event.target.value })} /></div><div><label htmlFor="dish-category">Category</label><select id="dish-category" value={draft.categoryId} onChange={event => setDraft({ ...draft, categoryId: event.target.value })}><option value="">Uncategorized</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div></div><div className="choice-row"><label><input type="radio" name="food-type" checked={draft.isVeg} onChange={() => setDraft({ ...draft, isVeg: true })} /> Vegetarian</label><label><input type="radio" name="food-type" checked={!draft.isVeg} onChange={() => setDraft({ ...draft, isVeg: false })} /> Non-vegetarian</label></div><label className="checkbox-row"><input type="checkbox" checked={draft.isAvailable} onChange={event => setDraft({ ...draft, isAvailable: event.target.checked })} /> Show this dish on the public menu</label><div className="form-actions">{draft.id && <button type="button" className="text-button" onClick={() => setDraft(emptyDish)}>Cancel</button>}<button className="save-button" disabled={busy === 'dish'}>{busy === 'dish' ? 'Saving…' : draft.id ? 'Save changes' : 'Add dish'}</button></div></form></aside></div></main>
}
