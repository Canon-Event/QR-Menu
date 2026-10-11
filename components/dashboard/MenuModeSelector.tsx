'use client'

import type { MenuMode } from '@/types'

type Props = {
  value: MenuMode
  onChange: (mode: MenuMode) => void
  disabled?: boolean
}

const modes = [
  { value: 'view_only', title: 'View menu only', description: 'Guests browse dishes and prices on their phone, then order verbally with your staff.' },
  { value: 'ordering', title: 'Menu with ordering', description: 'Guests choose dish quantities and submit an order from their phone. Orders appear in your dashboard.' },
] as const

export default function MenuModeSelector({ value, onChange, disabled = false }: Props) {
  return (
    <fieldset className="menu-mode-selector" disabled={disabled}>
      <legend>How should guests use your menu?</legend>
      <div className="menu-mode-options">
        {modes.map(mode => (
          <label key={mode.value} className={`menu-mode-option${value === mode.value ? ' selected' : ''}`}>
            <input type="radio" name="menuMode" value={mode.value} checked={value === mode.value} onChange={() => onChange(mode.value)} />
            <span><b>{mode.title}</b><small>{mode.description}</small></span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
