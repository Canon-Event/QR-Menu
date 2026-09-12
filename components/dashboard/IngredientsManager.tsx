'use client'

import { FormEvent, useMemo, useState } from 'react'
import type { Dish, DishIngredient, Ingredient } from '@/types'
import { INGREDIENT_UNITS } from '@/lib/menu-validation'

type Props = { initialIngredients: Ingredient[]; initialLinks: DishIngredient[]; dishes: Dish[]; restaurantName: string }
type Draft = { id?: string; name: string; quantity: string; unit: string; lowStockThreshold: string; isActive: boolean }
const emptyDraft: Draft = { name: '', quantity: '', unit: 'g', lowStockThreshold: '0', isActive: true }

async function mutate(url: string, method: string, body: object) {
  const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || 'Something went wrong. Please try again.')
  return result
}

export default function IngredientsManager({ initialIngredients, initialLinks, dishes, restaurantName }: Props) {
  const [ingredients, setIngredients] = useState(initialIngredients)
  const [links, setLinks] = useState(initialLinks)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [selectedDish, setSelectedDish] = useState(dishes[0]?.id || '')
  const [recipeDraft, setRecipeDraft] = useState<DishIngredient[]>(initialLinks.filter(link => link.dish_id === dishes[0]?.id))
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)
  const activeIngredients = ingredients.filter(item => item.is_active)
  const lowStock = ingredients.filter(item => item.is_active && Number(item.quantity) <= Number(item.low_stock_threshold))
  const linkedCount = useMemo(() => new Set(links.map(link => link.ingredient_id)).size, [links])
  const notify = (kind: 'error' | 'success', text: string) => setMessage({ kind, text })

  async function saveIngredient(event: FormEvent) {
    event.preventDefault(); setBusy('ingredient'); setMessage(null)
    const payload = { name: draft.name, quantity: draft.quantity, unit: draft.unit, lowStockThreshold: draft.lowStockThreshold, isActive: draft.isActive }
    try {
      if (draft.id) {
        const result = await mutate('/api/inventory/ingredients', 'PATCH', { id: draft.id, ...payload })
        setIngredients(items => items.map(item => item.id === draft.id ? result.ingredient : item)); notify('success', 'Ingredient updated.')
      } else {
        const result = await mutate('/api/inventory/ingredients', 'POST', payload)
        setIngredients(items => [...items, result.ingredient]); notify('success', 'Ingredient added.')
      }
      setDraft(emptyDraft)
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Could not save ingredient.') } finally { setBusy('') }
  }

  function editIngredient(item: Ingredient) {
    setDraft({ id: item.id, name: item.name, quantity: String(item.quantity), unit: item.unit, lowStockThreshold: String(item.low_stock_threshold), isActive: item.is_active })
    document.getElementById('ingredient-form')?.scrollIntoView({ behavior: 'smooth' })
  }

  async function toggleIngredient(item: Ingredient) {
    setBusy(item.id)
    try { const result = await mutate('/api/inventory/ingredients', 'PATCH', { id: item.id, isActive: !item.is_active }); setIngredients(items => items.map(current => current.id === item.id ? result.ingredient : current)) }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Could not update ingredient.') } finally { setBusy('') }
  }

  async function removeIngredient(item: Ingredient) {
    if (!confirm(`Delete “${item.name}”? It will be removed from every linked dish.`)) return
    setBusy(item.id)
    try { await mutate('/api/inventory/ingredients', 'DELETE', { id: item.id }); setIngredients(items => items.filter(current => current.id !== item.id)); setLinks(items => items.filter(link => link.ingredient_id !== item.id)); setRecipeDraft(items => items.filter(link => link.ingredient_id !== item.id)); notify('success', 'Ingredient deleted.') }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Could not delete ingredient.') } finally { setBusy('') }
  }

  function chooseDish(dishId: string) { setSelectedDish(dishId); setRecipeDraft(links.filter(link => link.dish_id === dishId)) }
  function addRecipeItem() {
    const available = activeIngredients.find(item => !recipeDraft.some(link => link.ingredient_id === item.id))
    if (!available || !selectedDish) return
    setRecipeDraft(items => [...items, { id: `new-${available.id}`, restaurant_id: available.restaurant_id, dish_id: selectedDish, ingredient_id: available.id, quantity: 1, unit: available.unit }])
  }
  function updateRecipe(index: number, change: Partial<DishIngredient>) { setRecipeDraft(items => items.map((item, itemIndex) => itemIndex === index ? { ...item, ...change } : item)) }

  async function saveRecipe() {
    if (!selectedDish) return
    setBusy('recipe'); setMessage(null)
    try {
      const result = await mutate('/api/inventory/recipes', 'PUT', { dishId: selectedDish, items: recipeDraft.map(item => ({ ingredientId: item.ingredient_id, quantity: item.quantity, unit: item.unit })) })
      setLinks(items => [...items.filter(link => link.dish_id !== selectedDish), ...result.items]); setRecipeDraft(result.items); notify('success', 'Dish ingredients saved.')
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Could not save dish ingredients.') } finally { setBusy('') }
  }

  return <main className="menu-admin-page"><header className="menu-admin-topbar"><div><a href="/dashboard">← Dashboard</a><h1>{restaurantName} inventory</h1><p>Track ingredients and connect them to dishes.</p></div><a className="outline-button-large" href="/dashboard/menu">Manage dishes →</a></header>
    {message && <div className={`menu-flash ${message.kind}`} role="status">{message.text}<button aria-label="Dismiss" onClick={() => setMessage(null)}>×</button></div>}
    <section className="inventory-metrics"><div><small>Total ingredients</small><b>{ingredients.length}</b></div><div><small>Low or out of stock</small><b className={lowStock.length ? 'stock-danger' : ''}>{lowStock.length}</b></div><div><small>Linked to dishes</small><b>{linkedCount}</b></div></section>
    <div className="menu-admin-grid inventory-grid"><section className="menu-admin-main"><div className="menu-section-heading"><div><h2>Ingredient stock</h2><p>Quantities are managed manually until order automation is added.</p></div></div>{!ingredients.length ? <div className="menu-empty"><b>No ingredients yet.</b><p>Add your first stock item using the form.</p></div> : <div className="ingredient-table"><div className="ingredient-table-head"><span>Ingredient</span><span>Stock</span><span>Status</span><span>Actions</span></div>{ingredients.map(item => { const isLow = item.is_active && Number(item.quantity) <= Number(item.low_stock_threshold); return <article key={item.id}><div><b>{item.name}</b><small>{links.filter(link => link.ingredient_id === item.id).length} linked dishes</small></div><strong>{Number(item.quantity).toLocaleString('en-IN')} {item.unit}<small>Alert at {Number(item.low_stock_threshold).toLocaleString('en-IN')} {item.unit}</small></strong><span className={`stock-badge ${!item.is_active ? 'inactive' : isLow ? 'low' : 'good'}`}>{!item.is_active ? 'Inactive' : Number(item.quantity) === 0 ? 'Out of stock' : isLow ? 'Low stock' : 'In stock'}</span><div className="ingredient-actions"><button onClick={() => editIngredient(item)}>Edit</button><button disabled={busy === item.id} onClick={() => toggleIngredient(item)}>{item.is_active ? 'Disable' : 'Enable'}</button><button className="danger-link" disabled={busy === item.id} onClick={() => removeIngredient(item)}>Delete</button></div></article> })}</div>}</section>
      <aside className="menu-admin-sidebar"><form id="ingredient-form" className="menu-editor-card" onSubmit={saveIngredient}><h2>{draft.id ? 'Edit ingredient' : 'Add ingredient'}</h2><label htmlFor="ingredient-name">Ingredient name</label><input id="ingredient-name" required maxLength={100} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} placeholder="e.g. Paneer" /><div className="field-row"><div><label htmlFor="stock-quantity">Stock quantity</label><input id="stock-quantity" required type="number" min="0" max="1000000000" step="0.001" value={draft.quantity} onChange={event => setDraft({ ...draft, quantity: event.target.value })} /></div><div><label htmlFor="stock-unit">Unit</label><select id="stock-unit" value={draft.unit} onChange={event => setDraft({ ...draft, unit: event.target.value })}>{INGREDIENT_UNITS.map(unit => <option key={unit}>{unit}</option>)}</select></div></div><label htmlFor="low-threshold">Low-stock alert threshold</label><input id="low-threshold" required type="number" min="0" max="1000000000" step="0.001" value={draft.lowStockThreshold} onChange={event => setDraft({ ...draft, lowStockThreshold: event.target.value })} /><label className="checkbox-row"><input type="checkbox" checked={draft.isActive} onChange={event => setDraft({ ...draft, isActive: event.target.checked })} /> Active inventory item</label><div className="form-actions">{draft.id && <button type="button" className="text-button" onClick={() => setDraft(emptyDraft)}>Cancel</button>}<button className="save-button" disabled={busy === 'ingredient'}>{busy === 'ingredient' ? 'Saving…' : draft.id ? 'Save changes' : 'Add ingredient'}</button></div></form>
        <section className="menu-editor-card recipe-card"><h2>Dish ingredients</h2>{dishes.length ? <><label htmlFor="recipe-dish">Select dish</label><select id="recipe-dish" value={selectedDish} onChange={event => chooseDish(event.target.value)}>{dishes.map(dish => <option value={dish.id} key={dish.id}>{dish.name}</option>)}</select><div className="recipe-list">{recipeDraft.map((link, index) => <div className="recipe-row" key={`${link.ingredient_id}-${index}`}><select aria-label="Ingredient" value={link.ingredient_id} onChange={event => { const ingredient = ingredients.find(item => item.id === event.target.value); updateRecipe(index, { ingredient_id: event.target.value, unit: ingredient?.unit || link.unit }) }}>{activeIngredients.map(item => <option value={item.id} key={item.id} disabled={recipeDraft.some((other, otherIndex) => otherIndex !== index && other.ingredient_id === item.id)}>{item.name}</option>)}</select><input aria-label="Recipe quantity" type="number" min="0.001" max="1000000000" step="0.001" value={link.quantity} onChange={event => updateRecipe(index, { quantity: Number(event.target.value) })} /><select aria-label="Recipe unit" value={link.unit} onChange={event => updateRecipe(index, { unit: event.target.value })}>{INGREDIENT_UNITS.map(unit => <option key={unit}>{unit}</option>)}</select><button aria-label="Remove ingredient" onClick={() => setRecipeDraft(items => items.filter((_, itemIndex) => itemIndex !== index))}>×</button></div>)}</div><button type="button" className="recipe-add" disabled={!activeIngredients.some(item => !recipeDraft.some(link => link.ingredient_id === item.id))} onClick={addRecipeItem}>+ Add ingredient</button><button className="save-button" type="button" disabled={busy === 'recipe'} onClick={saveRecipe}>{busy === 'recipe' ? 'Saving…' : 'Save dish ingredients'}</button></> : <p className="recipe-empty">Add a dish before creating recipes.</p>}</section></aside></div></main>
}
