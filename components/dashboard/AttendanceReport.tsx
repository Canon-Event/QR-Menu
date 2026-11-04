'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

type AttendanceRecord = {
  id: string
  attendance_date: string
  status: string
  overtime_minutes: number
  correction_note?: string | null
  employees?: { full_name: string; employee_code: string }
}

type RangeMode = 'weekly' | 'monthly' | 'yearly' | 'custom'
type ChartPoint = { key: string; label: string; axisLabel: string; value: number }

function toDateInput(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getRange(mode: RangeMode, from: string, to: string) {
  const today = new Date()
  if (mode === 'custom') return { from, to }
  if (mode === 'yearly') return { from: `${today.getFullYear()}-01-01`, to: `${today.getFullYear()}-12-31` }
  if (mode === 'monthly') {
    const first = new Date(today.getFullYear(), today.getMonth(), 1)
    const last = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    return { from: toDateInput(first), to: toDateInput(last) }
  }
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return { from: toDateInput(monday), to: toDateInput(sunday) }
}

function makeChartData(records: AttendanceRecord[], from: string, to: string, mode: RangeMode): ChartPoint[] {
  const monthly = mode === 'yearly'
  const counts = new Map<string, number>()
  for (const record of records) {
    if (['present', 'late', 'half_day'].includes(record.status)) {
      const key = monthly ? record.attendance_date.slice(0, 7) : record.attendance_date
      counts.set(key, (counts.get(key) || 0) + 1)
    }
  }

  const points: ChartPoint[] = []
  const cursor = new Date(`${from}T00:00:00`)
  const last = new Date(`${to}T00:00:00`)
  while (cursor <= last) {
    const key = monthly
      ? `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`
      : toDateInput(cursor)
    points.push({
      key,
      label: monthly
        ? cursor.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
        : cursor.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
      axisLabel: monthly
        ? cursor.toLocaleDateString('en-IN', { month: 'short' })
        : cursor.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      value: counts.get(key) || 0,
    })
    if (monthly) cursor.setMonth(cursor.getMonth() + 1)
    else cursor.setDate(cursor.getDate() + 1)
  }
  return points
}

function makeDemoAttendance(from: string, to: string): AttendanceRecord[] {
  const employees = [
    { full_name: 'Aarav Sharma', employee_code: 'EMP-001' },
    { full_name: 'Meera Patel', employee_code: 'EMP-002' },
    { full_name: 'Kabir Khan', employee_code: 'EMP-003' },
    { full_name: 'Ananya Das', employee_code: 'EMP-004' },
  ]
  const records: AttendanceRecord[] = []
  const cursor = new Date(`${from}T00:00:00`)
  const last = new Date(`${to}T00:00:00`)
  let index = 0
  while (cursor <= last) {
    if (cursor.getDay() !== 0 && cursor.getDay() !== 6) {
      const date = toDateInput(cursor)
      const count = 2 + (index % 3)
      for (let employeeIndex = 0; employeeIndex < count; employeeIndex += 1) {
        const employee = employees[employeeIndex]
        records.push({
          id: `demo-attendance-${date}-${employeeIndex}`,
          attendance_date: date,
          status: employeeIndex === 2 && index % 4 === 0 ? 'late' : 'present',
          overtime_minutes: employeeIndex === 1 && index % 5 === 0 ? 30 : 0,
          correction_note: null,
          employees: employee,
        })
      }
      index += 1
    }
    cursor.setDate(cursor.getDate() + 1)
  }
  return records
}

function AttendanceBarChart({ data }: { data: ChartPoint[] }) {
  return (
    <div className="attendance-chart-scroll">
      <div className="attendance-chart" role="img" aria-label="Employee attendance bar chart" style={{ width: data.length > 20 ? `${Math.max(900, data.length * 52)}px` : '100%' }}>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart accessibilityLayer data={data} margin={{ top: 22, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--attendance-grid)" />
            <XAxis
              dataKey="axisLabel"
              tickLine={false}
              tickMargin={10}
              axisLine={false}
              tick={{ fill: 'var(--attendance-tick)', fontSize: 11 }}
              interval={0}
              minTickGap={0}
            />
            <YAxis
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              width={34}
              tick={{ fill: 'var(--attendance-tick)', fontSize: 11 }}
            />
            <Tooltip
              cursor={false}
              contentStyle={{ background: 'var(--attendance-tooltip)', border: '1px solid var(--attendance-grid)', borderRadius: 8 }}
              labelStyle={{ color: 'var(--attendance-tooltip-text)', fontWeight: 700 }}
              itemStyle={{ color: 'var(--attendance-tooltip-text)' }}
              formatter={(value) => [value, 'Employees']}
              labelFormatter={(_, payload) => payload?.[0]?.payload?.label || ''}
            />
            <Bar dataKey="value" fill="var(--attendance-bar)" radius={[8, 8, 0, 0]} maxBarSize={54}>
              <LabelList dataKey="value" position="top" offset={10} fill="var(--attendance-label)" fontSize={12} formatter={(value) => Number(value) ? value : ''} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export default function AttendanceReport() {
  const [target, setTarget] = useState<Element | null>(null)
  const [mode, setMode] = useState<RangeMode>('weekly')
  const [customFrom, setCustomFrom] = useState(() => {
    const now = new Date()
    return toDateInput(new Date(now.getFullYear(), now.getMonth(), 1))
  })
  const [customTo, setCustomTo] = useState(() => toDateInput(new Date()))
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [samplePreview, setSamplePreview] = useState(false)
  const [demoMode, setDemoMode] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const range = useMemo(() => getRange(mode, customFrom, customTo), [mode, customFrom, customTo])

  useEffect(() => {
    setTarget(document.querySelector('.ems-main'))
    setDemoMode(new URLSearchParams(window.location.search).get('demo') === '1')
  }, [])
  useEffect(() => {
    if (!range.from || !range.to || range.from > range.to) {
      setError('Choose a valid start and end date.')
      setRecords([])
      setLoading(false)
      return
    }
    const controller = new AbortController()
    setLoading(true)
    setError('')
    if (demoMode || new URLSearchParams(window.location.search).get('demo') === '1') {
      setRecords(makeDemoAttendance(range.from, range.to))
      setSamplePreview(true)
      setLoading(false)
      return () => controller.abort()
    }
    fetch(`/api/attendance?from=${range.from}&to=${range.to}`, { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Could not load attendance.')
        const nextRecords = result.records || []
        setRecords(nextRecords.length ? nextRecords : makeDemoAttendance(range.from, range.to))
        setSamplePreview(!nextRecords.length)
      })
      .catch((reason) => {
        if (!(reason instanceof DOMException && reason.name === 'AbortError')) {
          setError(reason instanceof Error ? reason.message : 'Could not load attendance.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [range.from, range.to, demoMode])

  const totals = useMemo(() => ({
    present: records.filter((record) => ['present', 'half_day'].includes(record.status)).length,
    late: records.filter((record) => record.status === 'late').length,
    absent: records.filter((record) => record.status === 'absent').length,
    overtime: records.reduce((total, record) => total + Number(record.overtime_minutes || 0), 0),
    corrections: records.filter((record) => record.correction_note).length,
  }), [records])
  const chartData = useMemo(() => makeChartData(records, range.from, range.to, mode), [records, range.from, range.to, mode])
  const content = (
    <section className="ops attendance-report">
      <header>
        <div>
          <h2>Attendance Trends</h2>
          <p>Track daily employee attendance across the period you choose.</p>
        </div>
        <div className="attendance-period-controls" role="group" aria-label="Attendance date range">
          {(['weekly', 'monthly', 'yearly', 'custom'] as RangeMode[]).map((period) => (
            <button key={period} type="button" className={mode === period ? 'active' : ''} onClick={() => setMode(period)}>
              {period === 'custom' ? 'Customize' : period[0].toUpperCase() + period.slice(1)}
            </button>
          ))}
        </div>
      </header>
      {mode === 'custom' && (
        <div className="attendance-custom-range">
          <label>From<input type="date" value={customFrom} max={customTo} onChange={(event) => setCustomFrom(event.target.value)} /></label>
          <label>To<input type="date" value={customTo} min={customFrom} onChange={(event) => setCustomTo(event.target.value)} /></label>
        </div>
      )}
      {error && <p className="leave-error">{error}</p>}
      <div className="attendance-totals">
        <span>Present<b>{totals.present}</b></span>
        <span>Late<b>{totals.late}</b></span>
        <span>Absent<b>{totals.absent}</b></span>
        <span>Overtime<b>{Math.floor(totals.overtime / 60)}h {totals.overtime % 60}m</b></span>
        <span>Corrections<b>{totals.corrections}</b></span>
      </div>
      <div className="attendance-chart-card">
        <div className="attendance-chart-heading">
          <div><h3>Employees present</h3><p>{range.from} to {range.to}{samplePreview ? ' · sample data' : ''}</p></div>
          <span className="attendance-chart-legend"><i /> Present, late, or half-day</span>
        </div>
        {loading ? <p className="ops-empty">Loading attendance…</p> : <AttendanceBarChart data={chartData} />}
      </div>
      <div className="ops-table">
        <div className="ops-head attendance-report-row"><span>Employee</span><span>Date</span><span>Status</span><span>Overtime</span><span>Correction</span></div>
        {records.slice(0, 20).map((record) => (
          <div className="ops-row attendance-report-row" key={record.id}>
            <span><b>{record.employees?.full_name}</b><small>{record.employees?.employee_code}</small></span>
            <span>{record.attendance_date}</span>
            <span className={`ops-status ${record.status}`}>{record.status}</span>
            <span>{record.overtime_minutes || 0} min</span>
            <span>{record.correction_note || '—'}</span>
          </div>
        ))}
        {!loading && !records.length && !error && <p className="ops-empty">No attendance records for this period.</p>}
      </div>
    </section>
  )

  return target ? createPortal(content, target) : null
}
