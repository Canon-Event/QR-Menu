import { readFormBody } from '@/lib/request-security'
import { NextResponse } from 'next/server'
import { getOwnedRestaurant, rejectUnsafeRequest } from '@/lib/menu-api'
import { isUuid } from '@/lib/menu-validation'
import { supabaseAdmin } from '@/lib/supabase'

const allowed = new Map([['image/jpeg','jpg'],['image/png','png'],['image/webp','webp']])
export async function POST(request: Request) {
  const unsafe = rejectUnsafeRequest(request, true); if (unsafe) return unsafe
  const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return NextResponse.json({error:'Invalid request origin.'},{status:403})
  const auth=await getOwnedRestaurant();if('error'in auth)return auth.error
  const form=await readFormBody(request).catch(()=>null),employeeId=form?.get('employeeId'),file=form?.get('photo')
  if(!isUuid(employeeId)||!(file instanceof File))return NextResponse.json({error:'Select a valid employee photo.'},{status:400})
  const extension=allowed.get(file.type);if(!extension||file.size<1||file.size>3145728)return NextResponse.json({error:'Use a JPG, PNG or WebP image up to 3 MB.'},{status:400})
  const {data:employee}=await auth.supabase.from('employees').select('id,photo_path').eq('id',employeeId).eq('restaurant_id',auth.restaurantId).maybeSingle();if(!employee)return NextResponse.json({error:'Employee not found.'},{status:404})
  if(!process.env.SUPABASE_SERVICE_ROLE_KEY)return NextResponse.json({error:'Photo storage is not configured.'},{status:503})
  const admin=supabaseAdmin(),path=`${auth.restaurantId}/${employee.id}/${crypto.randomUUID()}.${extension}`
  const bytes=Buffer.from(await file.arrayBuffer());const{error:uploadError}=await admin.storage.from('employee-photos').upload(path,bytes,{contentType:file.type,upsert:false,cacheControl:'3600'});if(uploadError){const configurationError=/signature|jwt|bucket not found/i.test(uploadError.message);return NextResponse.json({error:configurationError?'Employee photo storage is not configured correctly. Check the service-role key and run the employee migration.':'Could not upload employee photo.'},{status:503})}
  const{error:updateError}=await admin.from('employees').update({photo_path:path,updated_at:new Date().toISOString()}).eq('id',employee.id).eq('restaurant_id',auth.restaurantId);if(updateError){await admin.storage.from('employee-photos').remove([path]);return NextResponse.json({error:'Could not attach employee photo.'},{status:503})}
  if(employee.photo_path)await admin.storage.from('employee-photos').remove([employee.photo_path])
  const{data:signed}=await admin.storage.from('employee-photos').createSignedUrl(path,3600)
  return NextResponse.json({photoPath:path,photoUrl:signed?.signedUrl||null})
}
