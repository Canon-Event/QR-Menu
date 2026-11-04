import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createEmployeeDemoData } from '@/lib/employee-demo-data'
import EmployeeDirectoryV2 from '@/components/dashboard/EmployeeDirectoryV2'
import EmployeeOperations from '@/components/dashboard/EmployeeOperations'

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/dashboard/employees')

  const { data: restaurant } = await supabase.from('restaurants').select('id, name').eq('owner_id', user.id).limit(1).maybeSingle()
  if (!restaurant) redirect('/dashboard/setup')

  const { demo } = await searchParams
  const today = new Date().toISOString().slice(0, 10)
  const [{ data: employees }, { data: departments }, { data: outlets }, { data: leaves }, { data: attendance }] = await Promise.all([
    supabase.from('employees').select('*,departments(id,name),outlets(id,name)').eq('restaurant_id', restaurant.id).order('full_name'),
    supabase.from('departments').select('id,name').eq('restaurant_id', restaurant.id).order('name'),
    supabase.from('outlets').select('id,name').eq('restaurant_id', restaurant.id).eq('is_active', true).order('name'),
    supabase.from('leave_requests').select('*,employees(full_name,employee_code)').eq('restaurant_id', restaurant.id).order('created_at', { ascending: false }),
    supabase.from('attendance').select('*').eq('restaurant_id', restaurant.id).eq('attendance_date', today),
  ])

  const liveEmployees = await Promise.all((employees || []).map(async (employee) => {
    if (!employee.photo_path) return employee
    const { data } = await supabase.storage.from('employee-photos').createSignedUrl(employee.photo_path, 3600)
    return { ...employee, photo_url: data?.signedUrl }
  }))
  const hasDashboardData = Boolean(employees?.length || departments?.length || outlets?.length || leaves?.length || attendance?.length)
  const demoMode = demo === '1' || !hasDashboardData
  const sample = createEmployeeDemoData(today)
  const displayEmployees = demoMode ? sample.employees : liveEmployees
  const displayDepartments = demoMode ? sample.departments : departments || []
  const displayOutlets = demoMode ? sample.outlets : outlets || []
  const displayLeaves = demoMode ? sample.leaves : leaves || []
  const displayAttendance = demoMode ? sample.attendance : attendance || []
  const pendingLeaves = displayLeaves.filter((leave) => leave.status === 'pending').length
  const todayPresent = displayAttendance.filter((record) => ['present', 'late', 'half_day'].includes(record.status)).length

  return <>
    <EmployeeDirectoryV2
      initialEmployees={displayEmployees as any}
      departments={displayDepartments as any}
      outlets={displayOutlets as any}
      restaurantName={restaurant.name}
      pendingLeaves={pendingLeaves}
      todayPresent={todayPresent}
      demoMode={demoMode}
    />
    <EmployeeOperations
      initialEmployees={displayEmployees as any}
      initialLeaves={displayLeaves as any}
      initialAttendance={displayAttendance as any}
      demoMode={demoMode}
    />
  </>
}
