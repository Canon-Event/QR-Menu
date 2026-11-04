import { readJsonBody } from '@/lib/request-security'
import { NextResponse } from 'next/server'; import { getOwnedRestaurant, menuDatabaseError, rejectUnsafeRequest } from '@/lib/menu-api'; import { cleanText, isUuid } from '@/lib/menu-validation'
const statuses=['present','absent','late','half_day','leave']; const datePattern=/^\d{4}-\d{2}-\d{2}$/; const timePattern=/^([01]\d|2[0-3]):[0-5]\d$/
function isValidDate(value:string){if(!datePattern.test(value))return false;const date=new Date(`${value}T00:00:00.000Z`);return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===value}
export async function GET(request:Request){
  const auth=await getOwnedRestaurant();if('error'in auth)return auth.error
  const params=new URL(request.url).searchParams
  let from:string,to:string
  if(params.has('from')||params.has('to')){
    from=params.get('from')||'';to=params.get('to')||''
    if(!isValidDate(from)||!isValidDate(to)||from>to)return NextResponse.json({error:'Choose a valid date range.'},{status:400})
    const days=(Date.parse(`${to}T00:00:00.000Z`)-Date.parse(`${from}T00:00:00.000Z`))/86400000
    if(days>366)return NextResponse.json({error:'Choose a date range of one year or less.'},{status:400})
  }else{
    const month=params.get('month')||new Date().toISOString().slice(0,7)
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return NextResponse.json({error:'Invalid month.'},{status:400})
    from=`${month}-01`;to=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),0)).toISOString().slice(0,10)
  }
  const records:any[]=[]
  for(let offset=0;;offset+=1000){
    const{data,error}=await auth.supabase.from('attendance').select('id,employee_id,attendance_date,status,check_in,check_out,overtime_minutes,correction_note,employees(full_name,employee_code)').eq('restaurant_id',auth.restaurantId).gte('attendance_date',from).lte('attendance_date',to).order('attendance_date',{ascending:false}).range(offset,offset+999)
    if(error)return menuDatabaseError(error)
    records.push(...(data||[]))
    if(!data||data.length<1000)break
  }
  return NextResponse.json({records})
}
export async function PUT(request:Request){const unsafe=rejectUnsafeRequest(request);if(unsafe)return unsafe;const auth=await getOwnedRestaurant();if('error'in auth)return auth.error;const body=(await readJsonBody(request) ?? {});if(!isUuid(body?.employeeId)||!datePattern.test(body?.date||'')||!statuses.includes(body?.status))return NextResponse.json({error:'Invalid attendance record.'},{status:400});const checkIn=body?.checkIn||null,checkOut=body?.checkOut||null;if((checkIn&&!timePattern.test(checkIn))||(checkOut&&!timePattern.test(checkOut)))return NextResponse.json({error:'Invalid check-in or check-out time.'},{status:400});const overtime=Number(body?.overtimeMinutes||0);if(!Number.isInteger(overtime)||overtime<0||overtime>1440)return NextResponse.json({error:'Invalid overtime minutes.'},{status:400});const {data:employee}=await auth.supabase.from('employees').select('id').eq('id',body.employeeId).eq('restaurant_id',auth.restaurantId).maybeSingle();if(!employee)return NextResponse.json({error:'Employee not found.'},{status:404});const note=cleanText(body?.note,300);const {data,error}=await auth.supabase.from('attendance').upsert({restaurant_id:auth.restaurantId,employee_id:employee.id,attendance_date:body.date,status:body.status,check_in:checkIn,check_out:checkOut,note:note||null,overtime_minutes:overtime,correction_note:body?.correction?note||null:undefined,corrected_at:body?.correction?new Date().toISOString():undefined,updated_at:new Date().toISOString()},{onConflict:'employee_id,attendance_date'}).select('*').single();if(error)return menuDatabaseError(error);return NextResponse.json({attendance:data})}
