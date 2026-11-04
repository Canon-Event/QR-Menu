export type MenuPortion = 'Half' | 'Full'
export type PortionEntry<T> = { item: T; index: number; portion: MenuPortion | null }
export type PortionGroup<T> = { key: number; name: string; portioned: boolean; entries: PortionEntry<T>[] }

/** Explicit suffixes also work for already-saved menus; no rescan or new IDs. */
export function readPortionName(name: string): { name: string; portion: MenuPortion | null } {
  const match=name.match(/^(.*?)\s*\((half|full)\)\s*$/i)
  return match ? { name:match[1].trim(),portion:match[2].toLowerCase()==='half'?'Half':'Full' } : {name,portion:null}
}

/** Preserve every option and its original index/ID, including ambiguous duplicates. */
export function groupMenuPortions<T extends {name:string}>(items: T[], scope: (item:T)=>string=()=> ''): PortionGroup<T>[] {
  const groups:PortionGroup<T>[]=[],byName=new Map<string,PortionGroup<T>>()
  items.forEach((item,index)=>{
    const parsed=readPortionName(item.name),entry={item,index,portion:parsed.portion}
    const key=JSON.stringify([scope(item),parsed.name.trim().replace(/\s+/g,' ').toLowerCase()])
    const previous=parsed.portion?byName.get(key):undefined
    if(previous&&!previous.entries.some(e=>e.portion===parsed.portion))previous.entries.push(entry)
    else {
      const group={key:index,name:parsed.name,portioned:!!parsed.portion,entries:[entry]}
      groups.push(group);if(parsed.portion)byName.set(key,group)
    }
  })
  return groups
}
