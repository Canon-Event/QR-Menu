import type { MenuData } from '@/types'
import MenuDocument from './MenuDocument'

export default function BloomBrunchMenu({ data }: { data: MenuData }) {
  return <MenuDocument data={data} template="D" />
}
