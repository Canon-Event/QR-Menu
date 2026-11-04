'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useEmployeeWorkspace } from '@/components/dashboard/EmployeeWorkspaceTabs'

type Emp = { id: string; full_name: string; employee_code: string; status: string; shift: string }
type Leave = { id: string; employee_id: string; leave_type: string; starts_on: string; ends_on: string; reason?: string; status: string; employees?: { full_name: string; employee_code: string } | null }
type Att = { id: string; employee_id: string; attendance_date: string; status: string; check_in?: string | null; check_out?: string | null; note?: string | null; overtime_minutes?: number }
type AttendanceForm = { status: string; checkIn: string; checkOut: string; note: string; overtimeMinutes?: number }

async function call(url: string, method: string, body: object) {
  const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Request failed.')
  return data
}

function todayInput() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export default function EmployeeOperations({ initialEmployees, initialLeaves, initialAttendance, demoMode = false }: { initialEmployees: Emp[]; initialLeaves: Leave[]; initialAttendance: Att[]; demoMode?: boolean }) {
  const { activeTab } = useEmployeeWorkspace()
  const [target, setTarget] = useState<Element | null>(null)
  const [employees] = useState(initialEmployees)
  const [leaves, setLeaves] = useState(initialLeaves)
  const [attendance, setAttendance] = useState(initialAttendance)
  const [tab, setTab] = useState<'leave' | 'attendance'>('attendance')
  useEffect(() => { if (new URLSearchParams(window.location.search).get('tab') === 'leave') setTab('leave') }, [])
  const [date, setDate] = useState(todayInput)
  const [optionsEmployee, setOptionsEmployee] = useState('')
  const [options, setOptions] = useState<AttendanceForm>({ status: 'present', checkIn: '', checkOut: '', note: '', overtimeMinutes: 0 })
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [successIsAbsent, setSuccessIsAbsent] = useState(false)

  useEffect(() => setTarget(document.querySelector('.ems-main')), [])
  const records = useMemo(() => new Map(attendance.filter((item) => item.attendance_date === date).map((item) => [item.employee_id, item])), [attendance, date])
  const activeEmployees = employees.filter((employee) => employee.status !== 'inactive')
  const markedCount = activeEmployees.filter((employee) => records.has(employee.id)).length

  async function decide(id: string, status: string) {
    setBusy(id)
    setError('')
    try {
      const result = await call('/api/leave-requests', 'PATCH', { id, status })
      setLeaves((items) => items.map((item) => item.id === id ? result.leave : item))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not update request.')
    } finally {
      setBusy('')
    }
  }

  async function saveAttendance(employeeId: string, values: AttendanceForm) {
    setBusy(employeeId)
    setError('')
    setSuccess('')
    setSuccessIsAbsent(false)
    try {
      const result = await call('/api/attendance', 'PUT', { employeeId, date, ...values })
      setAttendance((items) => [
        ...items.filter((item) => !(item.employee_id === result.attendance.employee_id && item.attendance_date === result.attendance.attendance_date)),
        result.attendance,
      ])
      const employeeName = employees.find((employee) => employee.id === employeeId)?.full_name || 'Employee'
      setSuccessIsAbsent(values.status === 'absent')
      setSuccess(values.status === 'present'
        ? `Attendance marked for ${employeeName}.`
        : values.status === 'absent'
          ? `Attendance marked absent for ${employeeName}.`
          : `Attendance saved for ${employeeName}.`)
      setOptionsEmployee('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save attendance.')
    } finally {
      setBusy('')
    }
  }

  async function markAttendance(employee: Emp, status: 'present' | 'absent') {
    const current = records.get(employee.id)
    await saveAttendance(employee.id, {
      status,
      checkIn: current?.check_in || '',
      checkOut: current?.check_out || '',
      note: current?.note || '',
      overtimeMinutes: current?.overtime_minutes || 0,
    })
  }

  function openOptions(employee: Emp) {
    const current = records.get(employee.id)
    setOptionsEmployee(optionsEmployee === employee.id ? '' : employee.id)
    setOptions({
      status: current?.status || 'present',
      checkIn: current?.check_in || '',
      checkOut: current?.check_out || '',
      note: current?.note || '',
      overtimeMinutes: current?.overtime_minutes || 0,
    })
  }

  function submitOptions(event: FormEvent, employeeId: string) {
    event.preventDefault()
    void saveAttendance(employeeId, options)
  }

  const content = <section className="ops" hidden={activeTab !== 'operations'}>
    <header>
      <div><h2>Workforce Operations</h2><p>Mark attendance in one click, or review leave requests.</p></div>
      <div className="ops-tabs">
        <button className={tab === 'attendance' ? 'active' : ''} onClick={() => setTab('attendance')}>Daily Attendance</button>
        <button className={tab === 'leave' ? 'active' : ''} onClick={() => setTab('leave')}>Leave Management</button>
      </div>
    </header>
    {error && <p className="leave-error">{error}</p>}
    {tab === 'leave' ? <div className="ops-table">
      <div className="ops-head"><span>Employee</span><span>Leave type</span><span>From</span><span>To</span><span>Reason</span><span>Status</span><span>Actions</span></div>
      {leaves.map((leave) => <div className="ops-row" key={leave.id}>
        <span><b>{leave.employees?.full_name}</b><small>{leave.employees?.employee_code}</small></span>
        <span>{leave.leave_type}</span><span>{leave.starts_on}</span><span>{leave.ends_on}</span><span>{leave.reason || '—'}</span>
        <span className={`ops-status ${leave.status}`}>{leave.status}</span>
        <span>{leave.status === 'pending' ? <>
          <button disabled={demoMode || busy === leave.id} onClick={() => decide(leave.id, 'approved')}>Approve</button>
          <button className="reject" disabled={demoMode || busy === leave.id} onClick={() => decide(leave.id, 'rejected')}>Reject</button>
        </> : <small>Decision recorded</small>}</span>
      </div>)}
      {!leaves.length && <p className="ops-empty">No leave requests yet.</p>}
    </div> : <div className="ops-attendance">
      {success && <p className={`attendance-success-message${successIsAbsent ? ' absent' : ''}`} role="status" aria-live="polite">✓ {success}</p>}
      <div className="attendance-roster-heading">
        <div><h3>Mark attendance</h3><p>{markedCount} of {activeEmployees.length} employees marked. Tap once to mark someone present; add times only when needed.</p></div>
        <label>Date<input type="date" value={date} onChange={(event) => { setDate(event.target.value); setSuccess(''); setSuccessIsAbsent(false) }} /></label>
      </div>
      {demoMode && <p className="attendance-preview-note">Sample preview is read only.</p>}
      <div className="attendance-roster">
        {activeEmployees.map((employee) => {
          const item = records.get(employee.id)
          const markedPresent = item?.status === 'present'
          const markedAbsent = item?.status === 'absent'
          return <article className="attendance-roster-person" key={employee.id}>
            <div className="attendance-person-info">
              <span className="attendance-avatar">{employee.full_name.slice(0, 1).toUpperCase()}</span>
              <div><b>{employee.full_name}</b><small>{employee.employee_code} · {employee.shift}</small></div>
            </div>
            <div className="attendance-person-state">
              <span className={`ops-status ${item?.status || 'unmarked'}`}>{item?.status || 'Not marked'}</span>
              {(item?.check_in || item?.check_out) && <small>{item.check_in || '—'} – {item.check_out || '—'}</small>}
            </div>
            <div className="attendance-person-actions">
              <button className={`attendance-mark-button${markedPresent ? ' marked' : ''}`} disabled={demoMode || busy === employee.id || markedPresent} onClick={() => void markAttendance(employee, 'present')}>
                {busy === employee.id ? 'Saving…' : markedPresent ? 'Marked ✓' : 'Mark present'}
              </button>
              <button className={`attendance-mark-absent-button${markedAbsent ? ' marked' : ''}`} disabled={demoMode || busy === employee.id || markedAbsent} onClick={() => void markAttendance(employee, 'absent')}>
                {busy === employee.id ? 'Saving…' : markedAbsent ? 'Absent ✓' : 'Mark absent'}
              </button>
              <button className="attendance-options-button" type="button" disabled={demoMode || busy === employee.id} onClick={() => openOptions(employee)}>
                {optionsEmployee === employee.id ? 'Close' : 'Add timing'}
              </button>
            </div>
            {optionsEmployee === employee.id && <form className="attendance-options" onSubmit={(event) => submitOptions(event, employee.id)}>
              <label>Status<select value={options.status} onChange={(event) => setOptions({ ...options, status: event.target.value })}>{['present', 'late', 'half_day', 'absent', 'leave'].map((status) => <option key={status} value={status}>{status.replace('_', ' ')}</option>)}</select></label>
              <label>Check-in <span>(optional)</span><input type="time" value={options.checkIn} onChange={(event) => setOptions({ ...options, checkIn: event.target.value })} /></label>
              <label>Check-out <span>(optional)</span><input type="time" value={options.checkOut} onChange={(event) => setOptions({ ...options, checkOut: event.target.value })} /></label>
              <label className="attendance-note-field">Note <span>(optional)</span><input value={options.note} maxLength={300} onChange={(event) => setOptions({ ...options, note: event.target.value })} /></label>
              <button className="attendance-save-options" disabled={busy === employee.id}>{busy === employee.id ? 'Saving…' : 'Save attendance'}</button>
            </form>}
          </article>
        })}
        {!employees.length && <p className="ops-empty">Add employees before recording attendance.</p>}
      </div>
    </div>}
  </section>

  return target ? createPortal(content, target) : null
}
