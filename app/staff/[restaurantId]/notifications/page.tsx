import Link from 'next/link'
import NotificationCenter from '@/components/notifications/NotificationCenter'
export default async function NotificationHistory({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params
  return <main className="notification-page"><Link href={`/staff/${restaurantId}`}>← Restaurant workspace</Link><h1>Notifications</h1><NotificationCenter full /></main>
}
