'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export type EmployeeWorkspaceTab = 'overview' | 'directory' | 'operations' | 'departments' | 'leave-balances'

const tabs: { id: EmployeeWorkspaceTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'directory', label: 'Directory' },
  { id: 'operations', label: 'Leave & daily attendance' },
  { id: 'departments', label: 'Departments & outlets' },
  { id: 'leave-balances', label: 'Leave balances' },
]

const EmployeeWorkspaceContext = createContext<{
  activeTab: EmployeeWorkspaceTab
  setActiveTab: (tab: EmployeeWorkspaceTab) => void
} | null>(null)

export function useEmployeeWorkspace() {
  const context = useContext(EmployeeWorkspaceContext)
  if (!context) throw new Error('Employee workspace tabs must be used inside EmployeeWorkspaceProvider.')
  return context
}

export default function EmployeeWorkspaceProvider({ children }: { children: ReactNode }) {
  const [activeTab, setActiveTab] = useState<EmployeeWorkspaceTab>('overview')
  const [header, setHeader] = useState<HTMLElement | null>(null)

  useEffect(() => {
    setHeader(document.querySelector<HTMLElement>('.ems-header'))
    if (new URLSearchParams(window.location.search).get('tab') === 'leave') setActiveTab('operations')
  }, [])

  useEffect(() => {
    document.querySelector('.ems-main')?.setAttribute('data-active-tab', activeTab)
  }, [activeTab, header])

  return (
    <EmployeeWorkspaceContext.Provider value={{ activeTab, setActiveTab }}>
      {children}
      {header && createPortal(
        <nav className="employee-workspace-tabs" role="group" aria-label="Employee management sections">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              aria-pressed={activeTab === tab.id}
              className={activeTab === tab.id ? 'active' : ''}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>,
        header,
      )}
    </EmployeeWorkspaceContext.Provider>
  )
}
