import type { AiMenuItem } from './ai-menu'
import { groupMenuPortions, type PortionGroup } from './menu-portions'

export const menuReviewKey=(group:PortionGroup<AiMenuItem>)=>JSON.stringify([group.key,group.entries[0].item.category,group.name,group.entries.map(e=>[e.portion,e.item.price,e.item.isVeg])])
const validPrice=(price:number|null)=>price!==null&&Number.isFinite(price)&&price>=0&&price<=1_000_000&&Math.abs(Math.round(price*100)-price*100)<=0.00001
export const menuGroupReady=(group:PortionGroup<AiMenuItem>)=>!!group.name.trim()&&group.entries.every(({item})=>!!item.category.trim()&&validPrice(item.price)&&item.isVeg!==null)
export const menuPriceFlagged=(group:PortionGroup<AiMenuItem>)=>group.entries.some(({item})=>!validPrice(item.price)||!!item.note)
export function validReviewKeys(items:AiMenuItem[],value:unknown){
  if(!Array.isArray(value)||value.length>100||value.some(key=>typeof key!=='string'||key.length>1000))throw new Error('Invalid item review status.')
  const allowed=new Set(groupMenuPortions(items,item=>item.category).filter(menuGroupReady).map(menuReviewKey))
  return [...new Set(value as string[])].filter(key=>allowed.has(key))
}
