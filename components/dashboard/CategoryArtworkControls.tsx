'use client'

import type { Category } from '@/types'
import { CATEGORY_KINDS, inferCategoryKind, type CategoryKind, type CategoryPresentation } from '@/lib/menu-layout'

type Props = {
  categories: Category[]
  uncategorizedCount: number
  template: string
  value: CategoryPresentation
  onChange: (value: CategoryPresentation) => void
  onUpload: (id: string, file?: File) => void
  uploading: boolean
}

export default function CategoryArtworkControls({ categories, uncategorizedCount, template, value, onChange, onUpload, uploading }: Props) {
  const entries = [...categories.map(category => ({ id: category.id, name: category.name })), ...(uncategorizedCount ? [{ id: 'other', name: 'Other (uncategorized dishes)' }] : [])]
  function update(id: string, changes: CategoryPresentation[string]) {
    onChange({ ...value, [id]: { ...value[id], ...changes } })
  }
  return <section className="category-artwork-controls">
    <header><b>Categories & artwork</b><small>Match each category to its food type. It keeps the same artwork and page style when your menu grows or changes order.</small></header>
    {uncategorizedCount > 0 && <p className="category-placement-notice">{uncategorizedCount} dishes have no category. <a href="/dashboard/menu">Assign their categories in Menu</a> so each dish appears in the right section.</p>}
    {!entries.length && <p><a href="/dashboard/menu">Add categories to your menu</a> to choose their artwork.</p>}
    {entries.map(category => {
      const inferred = inferCategoryKind(category.name)
      const automaticName = CATEGORY_KINDS.find(([kind]) => kind === inferred)?.[1]
      return <fieldset key={category.id}>
        <legend>{category.name}</legend>
        <label>Category type<select value={value[category.id]?.kind || 'auto'} onChange={event => update(category.id, { kind: event.target.value === 'auto' ? undefined : event.target.value as CategoryKind })}>
          <option value="auto">Automatic — {automaticName}</option>
          {CATEGORY_KINDS.map(([kind, label]) => <option value={kind} key={kind}>{label}</option>)}
        </select></label>
        {template === 'B' && <>
          <label>Category photo <span>Optional; otherwise uses a dish photo or matching artwork.</span><input type="url" maxLength={2048} placeholder="https://example.com/pasta.jpg" value={value[category.id]?.imageUrl || ''} onChange={event => update(category.id, { imageUrl: event.target.value })} /></label>
          <label className="workspace-upload-button">{uploading ? 'Uploading...' : 'Upload category photo'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={event => onUpload(category.id, event.target.files?.[0])} /></label>
          {value[category.id]?.imageUrl && <button type="button" onClick={() => update(category.id, { imageUrl: '' })}>Use automatic photo</button>}
        </>}
      </fieldset>
    })}
  </section>
}
