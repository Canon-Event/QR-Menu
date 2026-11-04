import type { MenuData } from '@/types'
import MenuDocument from './MenuDocument'

export default function GreenBistroMenu({ data }: { data: MenuData }) {
  return <MenuDocument data={data} template="B" />
}
