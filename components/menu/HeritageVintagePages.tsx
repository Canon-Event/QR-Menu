import type { MenuData } from '@/types'
import { MenuContent } from './MenuDocument'

export default function HeritageVintagePages({ data }: { data: MenuData }) {
  return <MenuContent data={data} template="A" />
}
