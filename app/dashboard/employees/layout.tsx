import { createSupabaseServerClient } from '@/lib/supabase-server'
import EmployeePhotoManager from '@/components/dashboard/EmployeePhotoManager'
import EmployeePortalLink from '@/components/dashboard/EmployeePortalLink'
import DepartmentOutletManager from '@/components/dashboard/DepartmentOutletManager'
import AttendanceReport from '@/components/dashboard/AttendanceReport'
import LeaveBalances from '@/components/dashboard/LeaveBalances'
import EmployeeMobileMenu from '@/components/dashboard/EmployeeMobileMenu'
import PayrollCostCard from '@/components/dashboard/PayrollCostCard'

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  let employees: any[] = []
  let leaveUrl = ''

  if (user) {
    const { data: restaurant } = await supabase.from('restaurants').select('id,slug').eq('owner_id', user.id).limit(1).maybeSingle()
    if (restaurant) {
      leaveUrl = `/leave/${restaurant.slug}`
      const { data } = await supabase.from('employees').select('id,full_name,employee_code,photo_path').eq('restaurant_id', restaurant.id).order('full_name')
      employees = await Promise.all((data || []).map(async (item) => {
        if (!item.photo_path) return item
        const { data: signed } = await supabase.storage.from('employee-photos').createSignedUrl(item.photo_path, 3600)
        return { ...item, photo_url: signed?.signedUrl }
      }))
    }
  }

  return <div className="employee-route-shell">
    {leaveUrl && <EmployeePortalLink href={leaveUrl} />}
    {children}
    <DepartmentOutletManager />
    <AttendanceReport />
    <LeaveBalances employees={employees} />
    <EmployeeMobileMenu />
    <PayrollCostCard />
    <EmployeePhotoManager employees={employees} />
  </div>
}
