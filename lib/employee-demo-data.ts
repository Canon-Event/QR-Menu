export function createEmployeeDemoData(today: string) {
  const [year, month, day] = today.split('-').map(Number)
  const joinedOn = `${year}-${String(month).padStart(2, '0')}-01`
  const employees = [
    { id: 'demo-employee-1', employee_code: 'EMP-001', full_name: 'Aarav Sharma', role: 'Restaurant Manager', email: 'aarav@example.test', phone: '+91 90000 10001', status: 'active', shift: 'Morning', joined_on: joinedOn, employment_type: 'full_time', monthly_salary: 42000, department_id: 'demo-department-1', outlet_id: 'demo-outlet-1', departments: { id: 'demo-department-1', name: 'Management' }, outlets: { id: 'demo-outlet-1', name: 'Main Branch' } },
    { id: 'demo-employee-2', employee_code: 'EMP-002', full_name: 'Meera Patel', role: 'Head Chef', email: 'meera@example.test', phone: '+91 90000 10002', status: 'active', shift: 'Morning', joined_on: joinedOn, employment_type: 'full_time', monthly_salary: 34000, department_id: 'demo-department-2', outlet_id: 'demo-outlet-1', departments: { id: 'demo-department-2', name: 'Kitchen' }, outlets: { id: 'demo-outlet-1', name: 'Main Branch' } },
    { id: 'demo-employee-3', employee_code: 'EMP-003', full_name: 'Kabir Khan', role: 'Server', email: 'kabir@example.test', phone: '+91 90000 10003', status: 'active', shift: 'Evening', joined_on: joinedOn, employment_type: 'full_time', monthly_salary: 22000, department_id: 'demo-department-2', outlet_id: 'demo-outlet-2', departments: { id: 'demo-department-2', name: 'Kitchen' }, outlets: { id: 'demo-outlet-2', name: 'Garden Outlet' } },
    { id: 'demo-employee-4', employee_code: 'EMP-004', full_name: 'Ananya Das', role: 'Cashier', email: 'ananya@example.test', phone: '+91 90000 10004', status: 'on_leave', shift: 'Flexible', joined_on: joinedOn, employment_type: 'part_time', monthly_salary: 18000, department_id: 'demo-department-1', outlet_id: 'demo-outlet-2', departments: { id: 'demo-department-1', name: 'Management' }, outlets: { id: 'demo-outlet-2', name: 'Garden Outlet' } },
  ]
  const attendance = employees.slice(0, 3).map((employee, index) => ({
    id: `demo-attendance-${index + 1}`,
    employee_id: employee.id,
    attendance_date: today,
    status: index === 2 ? 'late' : 'present',
    check_in: index === 2 ? '09:18' : '08:55',
    check_out: '17:30',
    overtime_minutes: index === 1 ? 30 : 0,
    correction_note: null,
  }))
  const leaveStart = new Date(year, month - 1, day + 3)
  const leaveEnd = new Date(year, month - 1, day + 4)
  const date = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
  const leaves = [{
    id: 'demo-leave-1', employee_id: employees[3].id, leave_type: 'casual',
    starts_on: date(leaveStart), ends_on: date(leaveEnd), reason: 'Family event', status: 'pending',
    employees: { full_name: employees[3].full_name, employee_code: employees[3].employee_code },
  }]
  return {
    employees,
    departments: [{ id: 'demo-department-1', name: 'Management' }, { id: 'demo-department-2', name: 'Kitchen' }],
    outlets: [{ id: 'demo-outlet-1', name: 'Main Branch' }, { id: 'demo-outlet-2', name: 'Garden Outlet' }],
    attendance,
    leaves,
  }
}
