import type { MenuData } from '@/types'
import MenuDocument from './MenuDocument'

export default function ItalianMenu({ data }: { data: MenuData }) {
  return <MenuDocument data={data} template="C" />
}
