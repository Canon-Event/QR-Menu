import NotificationDetail from '@/components/notifications/NotificationDetail'
export const dynamic = 'force-dynamic'
export default async function NotificationResource({ params }: { params: Promise<{ restaurantId: string; id: string }> }) {
  return <NotificationDetail {...await params} />
}
