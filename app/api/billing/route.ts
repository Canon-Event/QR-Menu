import { getOwnedRestaurant, rejectUnsafeRequest } from '@/lib/menu-api'
import { billingGet, billingPost } from '@/lib/billing-api'
export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  const auth = await getOwnedRestaurant(); if ('error' in auth) return auth.error
  return billingGet(request, auth)
}
export async function POST(request: Request) {
  const unsafe = rejectUnsafeRequest(request); if (unsafe) return unsafe
  const auth = await getOwnedRestaurant(); if ('error' in auth) return auth.error
  return billingPost(request, auth)
}
