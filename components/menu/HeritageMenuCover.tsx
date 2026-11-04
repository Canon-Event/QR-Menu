import type { Restaurant } from '@/types'
import { resolveMenuDesign } from '@/lib/menu-design'
import { MenuCover } from './MenuDocument'

export default function HeritageMenuCover({ restaurant }: { restaurant: Restaurant }) {
  return <MenuCover restaurant={restaurant} template="A" design={resolveMenuDesign('A', restaurant.template_settings?.A)} />
}
