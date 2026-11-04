'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { AiMenuDraft, AiMenuItem } from '@/lib/ai-menu'
import { AI_MENU_MAX_ITEMS } from '@/lib/ai-menu'
import { groupMenuPortions, type MenuPortion, type PortionGroup } from '@/lib/menu-portions'
import { menuGroupReady, menuPriceFlagged, menuReviewKey } from '@/lib/menu-review'
import StudioIcon from './StudioIcon'

type Group=PortionGroup<AiMenuItem>
type Props={
  draft:AiMenuDraft|null; busy:boolean; ready:boolean; savedAt:string|null; dirty:boolean;
  reviewedKeys:string[]; error:string; notice:string; upload:ReactNode; preview:ReactNode; design:ReactNode; publish:ReactNode;
  designOpen:boolean; onDesign:(open:boolean)=>void; onExpand:()=>void; onSave:()=>void; onDiscard:()=>void;
  onCurrency:(value:string|null)=>void; onEdit:(group:Group,values:Partial<AiMenuItem>)=>void;
  onPrice:(group:Group,portion:MenuPortion|null,price:number|null)=>void; onRemove:(indices:number[])=>void;
  onAdd:(category:string)=>void; onMove:(group:Group,direction:-1|1)=>void; onPortions:(group:Group)=>void;
  onSelect:(indices:number[])=>void; onSource:(item:AiMenuItem)=>void; onReviewed:(group:Group)=>void;
  currencyMessage:string; onRenameCategory:(from:string,to:string)=>void;
}

export default function MenuReviewWorkspace(p:Props){
  const [step,setStep]=useState<'review'|'publish'>('review'),[mobile,setMobile]=useState<'editor'|'preview'>('editor')
  const [category,setCategory]=useState(''),[search,setSearch]=useState(''),[filter,setFilter]=useState('all'),[page,setPage]=useState(0),[pageSize,setPageSize]=useState(6)
  const [selected,setSelected]=useState(0),[actions,setActions]=useState<number|null>(null),[issue,setIssue]=useState('')
  const [manage,setManage]=useState(false),[categoryName,setCategoryName]=useState('')
  const drawer=useRef<HTMLDivElement>(null),drawerTrigger=useRef<HTMLElement|null>(null)
  const groups=p.draft?groupMenuPortions(p.draft.items,i=>i.category):[]
  const categories=[...new Set(groups.map(g=>g.entries[0].item.category))]
  const checked=new Set(p.reviewedKeys),reviewed=groups.filter(g=>checked.has(menuReviewKey(g))&&menuGroupReady(g)).length
  const flagged=groups.filter(g=>!checked.has(menuReviewKey(g))&&menuPriceFlagged(g))
  const pending=groups.filter(g=>!checked.has(menuReviewKey(g)))
  const shown=groups.filter(g=>(!category||g.entries[0].item.category===category)&&(!search||`${g.name} ${g.entries[0].item.category}`.toLowerCase().includes(search.toLowerCase()))&&(filter==='all'||(filter==='flagged'?flagged.includes(g):filter==='reviewed'?checked.has(menuReviewKey(g)):!checked.has(menuReviewKey(g)))))
  const lastPage=Math.max(0,Math.ceil(shown.length/pageSize)-1),currentPage=Math.min(page,lastPage),visible=shown.slice(currentPage*pageSize,(currentPage+1)*pageSize)
  const selectedGroup=groups.find(g=>g.key===selected)
  useEffect(()=>{if(!p.draft){setStep('review');setCategory('');setFilter('all');setPage(0)}},[!!p.draft])
  useEffect(()=>{setPage(0)},[category,search,filter,pageSize])
  useEffect(()=>{
    if(actions===null)return
    const outside=(event:PointerEvent)=>{if(!(event.target as Element).closest('.studio-item-actions'))setActions(null)}
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setActions(null)}
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape)
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape)}
  },[actions])
  useEffect(()=>{
    if(!p.designOpen)return
    drawerTrigger.current=document.activeElement as HTMLElement
    const root=drawer.current
    root?.querySelector<HTMLElement>('button')?.focus()
    const key=(e:KeyboardEvent)=>{
      if(e.key==='Escape'){p.onDesign(false);return}
      if(e.key!=='Tab'||!root)return
      const nodes=[...root.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]')].filter(el=>el.tabIndex!==-1&&el.getClientRects().length)
      const first=nodes[0],last=nodes[nodes.length-1]
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}
    }
    document.addEventListener('keydown',key)
    return()=>{document.removeEventListener('keydown',key);drawerTrigger.current?.focus()}
  },[p.designOpen])
  function select(g:Group){setSelected(g.key);setActions(null);setIssue('');p.onSelect(g.entries.map(e=>e.index))}
  function reveal(g:Group){setCategory(g.entries[0].item.category);setSearch('');setFilter('all');setPage(Math.floor(groups.filter(x=>x.entries[0].item.category===g.entries[0].item.category).indexOf(g)/pageSize));setStep('review');setMobile('editor');select(g)}
  function confirm(g:Group){
    if(!menuGroupReady(g)){setIssue('Add a dish name, category and every listed price, then confirm the dietary label.');requestAnimationFrame(()=>document.querySelector<HTMLElement>('.studio-row.is-selected [aria-invalid="true"]')?.focus());return false}
    p.onReviewed(g);setIssue('');return true
  }
  function next(){
    if(selectedGroup&&!checked.has(menuReviewKey(selectedGroup))&&!confirm(selectedGroup))return
    const nextGroup=pending.find(g=>g.key!==selectedGroup?.key)
    if(nextGroup)reveal(nextGroup);else setStep('publish')
  }
  function add(){setActions(null);p.onAdd(category||categories[categories.length-1]||'General');setFilter('all');setSearch('');setPageSize(100);setStep('review');setSelected(p.draft?.items.length||0)}
  return <main className="menu-studio ai-menu-editor" aria-label="Menu import workspace">
    <header className="studio-header"><div className="studio-title"><nav aria-label="Breadcrumb"><a href="/dashboard/menu">Menu</a><span>/</span><span>Import</span></nav><div><h1>{!p.draft?'Import your menu':step==='publish'?'Ready to publish?':'Review your menu'}</h1><span className={`studio-save-status${p.dirty?' is-dirty':''}`}><i/>{p.draft?(p.dirty?'Unsaved changes':p.savedAt?'Draft saved':'Draft ready'):'Photo to digital menu'}</span></div></div>
      <ol className="studio-steps" aria-label="Import progress"><li className={p.draft?'is-done':'is-current'} aria-current={!p.draft?'step':undefined}><span>{p.draft?<StudioIcon name="check"/>:1}</span><b>Upload</b></li><li className={p.draft?(step==='review'?'is-current':(groups.length>0&&!pending.length?'is-done':'')):''} aria-current={p.draft&&step==='review'?'step':undefined}><button disabled={!p.draft||p.busy} onClick={()=>setStep('review')}><span>{step==='publish'&&groups.length>0&&!pending.length?<StudioIcon name="check"/>:2}</span><b>Review</b></button></li><li className={p.draft&&step==='publish'?'is-current':''} aria-current={p.draft&&step==='publish'?'step':undefined}><button disabled={!p.draft||p.busy} onClick={()=>setStep('publish')}><span>3</span><b>Publish</b></button></li></ol>
      <div className="studio-header-actions"><button className="studio-button" disabled={!p.draft||p.busy||!p.ready} onClick={p.onSave}>Save draft</button><button className="studio-button studio-outline" onClick={p.onExpand}><StudioIcon name="expand"/><span>Preview full screen</span></button></div>
    </header>
    {(p.error||p.notice)&&<div className={`studio-message${p.error?' is-error':''}`} role={p.error?'alert':'status'}>{p.error||p.notice}</div>}
    <div className="studio-mobile-tabs" role="group" aria-label="Workspace view"><button aria-pressed={mobile==='editor'} onClick={()=>setMobile('editor')}>Edit menu</button><button aria-pressed={mobile==='preview'} onClick={()=>setMobile('preview')}>Preview</button></div>
    <div className={`studio-workbench show-${mobile}`}><section className="studio-editor" aria-label="Menu editor">
      {!p.draft?p.upload:step==='publish'?<div className="studio-publish"><span className="studio-eyebrow">03 / ONE LAST CHECK</span><h2>Your menu, ready for the table.</h2><p>{groups.length} dishes across {categories.length} categories. Publishing adds these dishes to your restaurant menu.</p><div className="studio-publish-summary"><b>{reviewed} of {groups.length} reviewed</b><span>{flagged.length} price {flagged.length===1?'flag':'flags'} remaining</span></div>{pending.length>0&&<button className="studio-text-button" onClick={()=>reveal(pending[0])}>Continue reviewing <StudioIcon name="arrow"/></button>}{p.publish}</div>:<>
      <div className="studio-editor-top"><div className="studio-panel-title"><h2>Menu items <span>{groups.length} dishes</span></h2><div><label className="studio-currency"><span className="sr-only">Menu currency</span><select aria-label="Menu currency" disabled={p.busy} value={p.draft.currency||''} onChange={e=>p.onCurrency(e.target.value||null)}><option value="">Currency</option>{['INR','USD','EUR','GBP','AED'].map(c=><option key={c}>{c}</option>)}</select></label><button className="studio-button studio-primary" onClick={add} disabled={p.busy||p.draft.items.length>=AI_MENU_MAX_ITEMS}><StudioIcon name="plus"/>Add item</button></div></div>
      {flagged.length>0&&<button className="studio-flag-banner" onClick={()=>{setFilter('flagged');setCategory('');setSearch('');setPage(0);select(flagged[0])}}><StudioIcon name="warning"/><b>{flagged.length} {flagged.length===1?'price needs':'prices need'} review</b><span>Review flagged <StudioIcon name="arrow"/></span></button>}
      {p.currencyMessage&&<p className="studio-currency-warning">{p.currencyMessage}</p>}
      <div className="studio-search-row"><label className="studio-search"><StudioIcon name="search"/><input type="search" aria-label="Search dishes" placeholder="Search dishes..." value={search} onChange={e=>setSearch(e.target.value)}/></label><select aria-label="Filter items" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All items</option><option value="flagged">Flagged prices</option><option value="pending">Not reviewed</option><option value="reviewed">Reviewed</option></select></div>
      <div className="studio-categories" role="group" aria-label="Extracted categories"><button aria-pressed={!category} onClick={()=>setCategory('')}>All <span>{groups.length}</span></button>{categories.map(c=><button key={c} aria-pressed={category===c} onClick={()=>{setCategory(c);setManage(false)}}>{c||'Uncategorised'} <span>{groups.filter(g=>g.entries[0].item.category===c).length}</span></button>)}</div></div>
      <div className="studio-table-area"><div className="studio-section-title"><h3>{category||'All dishes'}</h3><button className="studio-text-button" onClick={()=>{setManage(!manage);setCategoryName(category)}}>Manage categories</button></div>
      {manage&&<form className="studio-category-manager" onSubmit={e=>{e.preventDefault();const name=categoryName.trim();if(!name)return;if(category)p.onRenameCategory(category,name);else p.onAdd(name);setCategory(name);setSelected(category?selected:p.draft!.items.length);setPageSize(100);setManage(false);setActions(null)}}><label>{category?'Rename category':'Add category'}<input value={categoryName} maxLength={80} required onChange={e=>setCategoryName(e.target.value)}/></label><button className="studio-button" disabled={p.busy}>{category?'Rename':'Add with first dish'}</button><button className="studio-text-button" type="button" onClick={()=>setManage(false)}>Cancel</button></form>}
      {p.draft.warnings.length>0&&<details className="studio-scan-notes"><summary>Scan notes ({p.draft.warnings.length})</summary><ul>{p.draft.warnings.map((w,i)=><li key={i}>{w}</li>)}</ul></details>}
      <fieldset disabled={p.busy} className="studio-items"><legend className="sr-only">Edit extracted dishes</legend><div className="studio-table-head"><span>Dish</span><span>Half / Price</span><span>Full</span><span>Status</span><span/></div>
      {visible.map(g=>{
        const item=g.entries[0].item,isSelected=g.key===selected,isReviewed=checked.has(menuReviewKey(g)),isFlagged=!isReviewed&&menuPriceFlagged(g)
        const diet=g.entries.every(e=>e.item.isVeg===item.isVeg)?item.isVeg:null
        const sameDescription=g.entries.every(e=>e.item.description===item.description)
        const price=(portion:MenuPortion|null)=>{const entry=g.entries.find(e=>e.portion===portion);return <label className="studio-price-field"><span className="studio-price-label">{portion||'Price'}</span><span className="studio-price-input"><span aria-hidden="true">{p.draft!.currency==='INR'?'₹':p.draft!.currency||'—'}</span><input aria-label={`${portion||'Single'} price for ${g.name||'new dish'}`} data-menu-price={portion||'single'} data-item-index={entry?.index} type="number" min="0" max="1000000" step="0.01" value={entry?.item.price??''} placeholder={entry?'Confirm':'Not listed'} aria-invalid={!!entry&&entry.item.price===null} onFocus={()=>{if(!isSelected)select(g)}} onChange={e=>p.onPrice(g,portion,Number.isFinite(e.target.valueAsNumber)?e.target.valueAsNumber:null)}/></span></label>}
        return <article className={`studio-row ai-menu-draft${isSelected?' is-selected':''}${isFlagged?' is-flagged':''}`} data-category={item.category} data-pricing={g.portioned?'portions':'single'} key={g.key}>
          <div className="studio-item-line"><div className="studio-dish-cell"><button className="studio-row-toggle" aria-expanded={isSelected} aria-label={`Edit ${g.name||'new dish'}`} onClick={()=>{if(isSelected){setSelected(-1);p.onSelect([])}else select(g)}}><StudioIcon name="chevron"/></button><input aria-label="Dish name" value={g.name} maxLength={g.portioned?113:120} placeholder="Dish name" aria-invalid={!g.name.trim()} onFocus={()=>{if(!isSelected)select(g)}} onChange={e=>p.onEdit(g,{name:e.target.value})}/></div>{price(g.portioned?'Half':null)}{g.portioned?price('Full'):<span className="studio-no-full" aria-label="Single price">—</span>}
          <button className={`studio-item-status ${isReviewed?'is-reviewed':isFlagged?'is-flagged':'is-pending'}`} aria-label={`${isReviewed?'Reviewed':isFlagged?'Price needs review':'Not reviewed'}: ${g.name}`} title={isReviewed?'Reviewed':isFlagged?'Price needs review':'Not reviewed'} onClick={()=>select(g)}>{isReviewed?<StudioIcon name="check"/>:isFlagged?'!':<span/>}</button>
          <div className="studio-item-actions"><button className="studio-icon-button" aria-label={`Actions for ${g.name||'new dish'}`} aria-expanded={actions===g.key} onClick={()=>setActions(actions===g.key?null:g.key)}><StudioIcon name="more"/></button>{actions===g.key&&<div className="studio-action-menu"><button disabled={groups.indexOf(g)===0} onClick={()=>{p.onMove(g,-1);setActions(null);setSelected(-1);p.onSelect([])}}>Move up</button><button disabled={groups.indexOf(g)===groups.length-1} onClick={()=>{p.onMove(g,1);setActions(null);setSelected(-1);p.onSelect([])}}>Move down</button>{!g.portioned&&<button disabled={!g.name.trim()||g.name.length>113} onClick={()=>{p.onPortions(g);setActions(null)}}>Add Half / Full prices</button>}{g.portioned&&g.entries.length>1&&g.entries.map(e=><button key={e.index} onClick={()=>{p.onRemove([e.index]);setActions(null)}}>Remove {e.portion} price</button>)}<button className="is-danger" onClick={()=>{p.onRemove(g.entries.map(e=>e.index));setActions(null)}}>Remove dish</button></div>}</div></div>
          {isSelected&&<div className="studio-item-details">{g.entries.filter(e=>e.item.note).map(e=><p className="studio-item-note" key={e.index}>{e.portion?`${e.portion}: `:''}{e.item.note}</p>)}<div className="studio-detail-fields"><label className="studio-description">Description <span>(optional)</span><textarea aria-label="Description" maxLength={500} rows={2} value={sameDescription?item.description:''} placeholder={sameDescription?'Tell guests about this dish':'Descriptions differ. Editing applies to both portions.'} onChange={e=>p.onEdit(g,{description:e.target.value})}/><small>{sameDescription?item.description.length:0}/500</small></label><label>Dietary label<select aria-label="Dietary label" aria-invalid={diet===null} value={diet===null?'':diet?'veg':'nonveg'} onChange={e=>p.onEdit(g,{isVeg:e.target.value===''?null:e.target.value==='veg'})}><option value="">Not confirmed</option><option value="veg">Vegetarian</option><option value="nonveg">Non-vegetarian</option></select></label><label>Category<input aria-label="Category" value={item.category} list="studio-category-options" maxLength={80} aria-invalid={!item.category.trim()} onChange={e=>p.onEdit(g,{category:e.target.value})}/></label></div>
          {issue&&<p className="studio-item-error" role="alert">{issue}</p>}<div className="studio-item-review-actions"><button className="studio-button studio-primary" onClick={()=>confirm(g)} disabled={isReviewed}>{isReviewed?'Reviewed':'Confirm item'}</button><button className="studio-text-button" onClick={()=>{p.onSource(item);setMobile('preview')}}>View in original photo <StudioIcon name="expand"/></button></div></div>}
        </article>
      })}</fieldset><datalist id="studio-category-options">{categories.map(c=><option key={c} value={c}/>)}</datalist>
      {!shown.length&&<div className="studio-empty"><StudioIcon name="search"/><h3>No dishes found</h3><p>Try a different search or filter.</p><button className="studio-text-button" onClick={()=>{setSearch('');setFilter('all');setCategory('')}}>Show all dishes</button></div>}
      <div className="studio-pagination"><button className="studio-text-button" disabled={p.busy||p.draft.items.length>=AI_MENU_MAX_ITEMS} onClick={add}><StudioIcon name="plus"/>Add another dish</button><div><label className="studio-page-size"><span className="sr-only">Items per page</span><select aria-label="Items per page" value={pageSize} onChange={e=>setPageSize(Number(e.target.value))}><option value={6}>6 per page</option><option value={12}>12 per page</option><option value={100}>Show all</option></select></label><span>{shown.length?`${currentPage*pageSize+1}–${Math.min((currentPage+1)*pageSize,shown.length)} of ${shown.length}`:'0 items'}</span><button className="studio-icon-button" aria-label="Previous page" disabled={!currentPage} onClick={()=>setPage(currentPage-1)}><StudioIcon name="chevron" style={{transform:'rotate(180deg)'}}/></button><span className="studio-page-number">{currentPage+1}</span><button className="studio-icon-button" aria-label="Next page" disabled={currentPage===lastPage} onClick={()=>setPage(currentPage+1)}><StudioIcon name="chevron"/></button></div></div>
      </div></>}
    </section><div className="studio-preview-panel">{p.preview}</div></div>
    <footer className={`studio-footer${p.draft?' has-draft':''}`}><div className="studio-progress"><svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="16"/><circle cx="20" cy="20" r="16" strokeDasharray={`${groups.length?reviewed/groups.length*100.53:0} 100.53`}/></svg><p>{p.draft?<><b>{reviewed} of {groups.length} reviewed</b><span> · {groups.length-reviewed} remaining</span></>:<><b>A better menu starts here</b><span> · Upload a photo to begin</span></>}</p></div><div className="studio-footer-actions"><button className="studio-button studio-design-trigger" onClick={()=>p.onDesign(true)}><StudioIcon name="palette"/>Design</button>{p.draft&&<><button className="studio-button" disabled={p.busy} onClick={()=>step==='publish'?setStep('review'):p.onDiscard()}>{step==='publish'?'Back to review':'Discard draft'}</button><button className="studio-button studio-primary" disabled={p.busy} onClick={()=>step==='publish'?setStep('review'):next()}>{step==='publish'?'Edit items':pending.length?'Review next item':'Continue to publish'}<StudioIcon name="arrow"/></button></>}</div></footer>
    <div className="studio-drawer-backdrop" hidden={!p.designOpen} onClick={()=>p.onDesign(false)}/><div className="studio-design-drawer" hidden={!p.designOpen} ref={drawer} role="dialog" aria-modal="true" aria-label="Menu design"><div className="studio-drawer-heading"><div><span className="studio-eyebrow">MAKE IT YOURS</span><h2>Menu design</h2></div><button className="studio-icon-button" aria-label="Close design settings" onClick={()=>p.onDesign(false)}><StudioIcon name="close"/></button></div>{p.design}</div>
  </main>
}
