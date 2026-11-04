'use client'

import { FormEvent, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

type Employee = { id: string; full_name: string; employee_code: string }
type Balance = { id: string; leave_type: string; entitlement: number; used_days: number; employees?: { full_name: string; employee_code: string } }

export default function LeaveBalances({ employees }: { employees: Employee[] }) {
  const [target, setTarget] = useState<Element | null>(null)
  const [balances, setBalances] = useState<Balance[]>([])
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [employeeId, setEmployeeId] = useState('')
  const [leaveType, setLeaveType] = useState('casual')
  const [entitlement, setEntitlement] = useState('12')
  const [error, setError] = useState('')
  const [demoMode, setDemoMode] = useState(() => employees.some((employee) => employee.id.startsWith('demo-employee-')))

  useEffect(() => {
    setTarget(document.querySelector('.ems-main'))
    setDemoMode(employees.some((employee) => employee.id.startsWith('demo-employee-')) || new URLSearchParams(window.location.search).get('demo') === '1')
  }, [])

  useEffect(() => {
    if (demoMode || new URLSearchParams(window.location.search).get('demo') === '1') {
      setBalances([
        { id: 'demo-balance-1', leave_type: 'annual', entitlement: 12, used_days: 2, employees: { full_name: 'Aarav Sharma', employee_code: 'EMP-001' } },
        { id: 'demo-balance-2', leave_type: 'casual', entitlement: 10, used_days: 3, employees: { full_name: 'Meera Patel', employee_code: 'EMP-002' } },
      ])
      return
    }
    fetch(`/api/leave-balances?year=${year}`).then((response) => response.json()).then((result) => setBalances(result.balances || []))
  }, [year, demoMode])

  async function save(event: FormEvent) {
    event.preventDefault()
    if (demoMode) return
    const response = await fetch('/api/leave-balances', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ employeeId, leaveType, entitlement: Number(entitlement), year: Number(year) }) })
    const result = await response.json()
    if (!response.ok) return setError(result.error || 'Could not save balance.')
    setBalances((items) => [...items.filter((balance) => balance.id !== result.balance.id), result.balance])
    setError('')
  }

  if (!target) return null
  return createPortal(
    <section id="leave-balances" className="ops leave-balances">
      <header>
        <div><h2>Leave Balances</h2><p>Set annual leave allowances and monitor usage.{demoMode && ' Sample preview · editing is disabled.'}</p></div>
        <label>Year <input type="number" value={year} onChange={(event) => setYear(event.target.value)} /></label>
      </header>
      <div className="lb-content">
        <form onSubmit={save}>
          <select required value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}><option value="">Select employee</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name} · {employee.employee_code}</option>)}</select>
          <select value={leaveType} onChange={(event) => setLeaveType(event.target.value)}>{['annual', 'casual', 'sick', 'unpaid'].map((type) => <option key={type}>{type}</option>)}</select>
          <input type="number" min="0" max="365" value={entitlement} onChange={(event) => setEntitlement(event.target.value)} />
          <button disabled={demoMode}>Save balance</button>
          {error && <p className="leave-error">{error}</p>}
        </form>
        <div className="lb-list">{balances.map((balance) => <div key={balance.id}><span><b>{balance.employees?.full_name}</b><small>{balance.employees?.employee_code}</small></span><span>{balance.leave_type}</span><span>{balance.used_days} / {balance.entitlement} days</span></div>)}{!balances.length && <p>No leave balances set for {year}.</p>}</div>
      </div>
    </section>,
    target,
  )
}
