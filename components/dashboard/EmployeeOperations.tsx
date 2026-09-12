'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

type Emp = { id: string; full_name: string; employee_code: string; status: string; shift: string }
type Leave = { id: string; employee_id: string; leave_type: string; starts_on: string; ends_on: string; reason?: string; status: string; employees?: { full_name: string; employee_code: string } | null }
type Att = { id: string; employee_id: string; attendance_date: string; status: string; check_in?: string; check_out?: string }

async function call(url: string, method: string, body: object) {
  const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Request failed.')
  return data
}

export default function EmployeeOperations({ initialEmployees, initialLeaves, initialAttendance }: { initialEmployees: Emp[]; initialLeaves: Leave[]; initialAttendance: Att[] }) {
  const [target, setTarget] = useState<Element | null>(null)
  const [employees] = useState(initialEmployees)
  const [leaves, setLeaves] = useState(initialLeaves)
  const [attendance, setAttendance] = useState(initialAttendance)
  const [tab, setTab] = useState<'leave' | 'attendance'>('leave')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [form, setForm] = useState({ employeeId: '', date: new Date().toISOString().slice(0, 10), status: 'present', checkIn: '09:00', checkOut: '18:00', note: '' })

  useEffect(() => setTarget(document.querySelector('.ems-main')), [])
  const records = useMemo(() => new Map(attendance.filter((item) => item.attendance_date === form.date).map((item) => [item.employee_id, item])), [attendance, form.date])

  async function decide(id: string, status: string) {
    setBusy(id); setError('')
    try { const result = await call('/api/leave-requests', 'PATCH', { id, status }); setLeaves((items) => items.map((item) => item.id === id ? result.leave : item)) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update request.') }
    finally { setBusy('') }
  }
  async function record(event: FormEvent) {
    event.preventDefault(); setBusy('attendance'); setError('')
    try { const result = await call('/api/attendance', 'PUT', form); setAttendance((items) => [...items.filter((item) => !(item.employee_id === result.attendance.employee_id && item.attendance_date === result.attendance.attendance_date)), result.attendance]); setForm({ ...form, employeeId: '', note: '' }) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save attendance.') }
    finally { setBusy('') }
  }

  const content = <section className="ops">
    <header><div><h2>Workforce Operations</h2><p>Review leave requests and record daily attendance.</p></div><div className="ops-tabs"><button className={tab === 'leave' ? 'active' : ''} onClick={() => setTab('leave')}>Leave Management</button><button className={tab === 'attendance' ? 'active' : ''} onClick={() => setTab('attendance')}>Daily Attendance</button></div></header>
    {error && <p className="leave-error">{error}</p>}
    {tab === 'leave' ? <div className="ops-table"><div className="ops-head"><span>Employee</span><span>Leave type</span><span>From</span><span>To</span><span>Reason</span><span>Status</span><span>Actions</span></div>{leaves.map((leave) => <div className="ops-row" key={leave.id}><span><b>{leave.employees?.full_name}</b><small>{leave.employees?.employee_code}</small></span><span>{leave.leave_type}</span><span>{leave.starts_on}</span><span>{leave.ends_on}</span><span>{leave.reason || '—'}</span><span className={`ops-status ${leave.status}`}>{leave.status}</span><span>{leave.status === 'pending' ? <><button disabled={busy === leave.id} onClick={() => decide(leave.id, 'approved')}>Approve</button><button className="reject" disabled={busy === leave.id} onClick={() => decide(leave.id, 'rejected')}>Reject</button></> : <small>Decision recorded</small>}</span></div>)}{!leaves.length && <p className="ops-empty">No leave requests yet.</p>}</div> : <div className="ops-attendance"><form onSubmit={record}><label>Date<input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label><label>Employee<select required value={form.employeeId} onChange={(event) => setForm({ ...form, employeeId: event.target.value })}><option value="">Select employee</option>{employees.filter((employee) => employee.status !== 'inactive').map((employee) => <option value={employee.id} key={employee.id}>{employee.full_name} · {employee.employee_code}</option>)}</select></label><label>Status<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>{['present', 'late', 'half_day', 'absent', 'leave'].map((status) => <option key={status}>{status.replace('_', ' ')}</option>)}</select></label><label>Check-in<input type="time" value={form.checkIn} onChange={(event) => setForm({ ...form, checkIn: event.target.value })} /></label><label>Check-out<input type="time" value={form.checkOut} onChange={(event) => setForm({ ...form, checkOut: event.target.value })} /></label><label>Note<input value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></label><button disabled={busy === 'attendance'}>{busy === 'attendance' ? 'Saving…' : 'Save attendance'}</button></form><div className="ops-table"><div className="ops-head attendance"><span>Employee</span><span>Shift</span><span>Status</span><span>Check-in</span><span>Check-out</span></div>{employees.map((employee) => { const item = records.get(employee.id); return <div className="ops-row attendance" key={employee.id}><span><b>{employee.full_name}</b><small>{employee.employee_code}</small></span><span>{employee.shift}</span><span className={`ops-status ${item?.status || 'unmarked'}`}>{item?.status || 'Not marked'}</span><span>{item?.check_in || '—'}</span><span>{item?.check_out || '—'}</span></div> })}</div></div>}
  </section>

  return target ? createPortal(content, target) : null
}
