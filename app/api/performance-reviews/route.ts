import { readJsonBody } from '@/lib/request-security'
import { NextResponse } from 'next/server'
import { getOwnedRestaurant, rejectUnsafeRequest } from '@/lib/menu-api'
import { cleanText, isUuid } from '@/lib/menu-validation'

export async function POST(request: Request) {
  const unsafe = rejectUnsafeRequest(request); if (unsafe) return unsafe
  const auth = await getOwnedRestaurant(); if ('error' in auth) return auth.error
  const body = (await readJsonBody(request) ?? {})
  const scores = ['punctuality', 'taskCompletion', 'guestFeedback', 'managerRating'].map((key) => Number(body?.[key]))
  if (!isUuid(body?.employeeId) || !scores.every((score) => Number.isInteger(score) && score >= 1 && score <= 5)) return NextResponse.json({ error: 'Select an employee and valid 1–5 ratings.' }, { status: 400 })
  const { data: employee } = await auth.supabase.from('employees').select('id').eq('id', body.employeeId).eq('restaurant_id', auth.restaurantId).maybeSingle()
  if (!employee) return NextResponse.json({ error: 'Employee not found.' }, { status: 404 })
  const { data, error } = await auth.supabase.from('performance_reviews').insert({ restaurant_id: auth.restaurantId, employee_id: employee.id, review_date: body.reviewDate || new Date().toISOString().slice(0, 10), punctuality: scores[0], task_completion: scores[1], guest_feedback: scores[2], manager_rating: scores[3], notes: cleanText(body.notes, 1000) || null }).select('*,employees(full_name,employee_code)').single()
  if (error) return NextResponse.json({ error: 'Could not save review. Run the employee-management SQL migration.' }, { status: 500 })
  return NextResponse.json({ review: data })
}
