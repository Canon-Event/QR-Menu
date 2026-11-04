'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import BasicMenu from '@/components/menu/BasicMenu'
import BasicMenuStyleEditor from './BasicMenuStyleEditor'
import MenuReviewWorkspace from './MenuReviewWorkspace'
import StudioIcon from './StudioIcon'
import { menuGroupReady, menuReviewKey, validReviewKeys } from '@/lib/menu-review'
import { AI_MENU_MAX_BYTES, AI_MENU_MAX_ITEMS, parseAiMenuDraft, parseEditableAiMenuDraft, parseBasicStyle, safeBasicStyle, type AiMenuDraft, type AiMenuItem } from '@/lib/ai-menu'
import type { MenuData } from '@/types'
import type { OcrUpload } from '@/lib/menu-ocr'
import { groupMenuPortions, readPortionName, type MenuPortion, type PortionGroup } from '@/lib/menu-portions'

async function api(options?: RequestInit) {
  const response = await fetch('/api/menu/ai', { cache: 'no-store', ...options })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw Object.assign(new Error(result.error || 'The menu request failed.'), { status: response.status, retry: Number(response.headers.get('retry-after')) || 0 })
  return result
}
function storageKey(restaurant: string, job: string) { return `wiit:menu-draft:${restaurant}:${job}` }

export default function AiMenuImporter({ menu }: { menu: MenuData }) {
  const router = useRouter()
  const [files, setFiles] = useState<File[]>([]), [previews, setPreviews] = useState<string[]>([])
  const [draft, setDraft] = useState<AiMenuDraft | null>(null), [job, setJob] = useState<string | null>(null)
  const [reader, setReader] = useState<'device' | 'online'>('device')
  const [verifyScan, setVerifyScan] = useState(false)
  const [ocrConfigured, setOcrConfigured] = useState(false)
  const [scanProgress, setScanProgress] = useState('')
  const [sourceFocus, setSourceFocus] = useState<AiMenuItem['source'] | null>(null)
  const [sourceCurrency, setSourceCurrency] = useState<string | null>(null)
  const [previewContent, setPreviewContent] = useState<'menu' | 'photo'>('menu')
  const [style, setStyle] = useState(safeBasicStyle(menu.restaurant.basic_menu_style))
  const [logoUrl,setLogoUrl]=useState(menu.restaurant.logo_url||'')
  const validPreviewStyle = useRef(style)
  const [savedStyle, setSavedStyle] = useState(style)
  const [uploadingCover, setUploadingCover] = useState(false)
  const [previewWidth, setPreviewWidth] = useState<'phone' | 'wide'>('wide')
  const [designOpen,setDesignOpen]=useState(false),[expanded,setExpanded]=useState(false)
  const [editingIds,setEditingIds]=useState<string[]>([])
  const [reviewedKeys,setReviewedKeys]=useState<string[]>([]),[dirty,setDirty]=useState(false),[savedAt,setSavedAt]=useState<string|null>(null)
  const previewRef=useRef<HTMLElement>(null),expandTrigger=useRef<HTMLElement|null>(null)
  const [presentation, setPresentation] = useState<'basic' | 'template'>(menu.restaurant.menu_presentation || 'template')
  const [useBasic, setUseBasic] = useState(true), [reviewed, setReviewed] = useState(false)
  const [ready, setReady] = useState(false), [configured, setConfigured] = useState(false), [busy, setBusy] = useState('')
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [until, setUntil] = useState(0), [seconds, setSeconds] = useState(0)
  const scanRequest = useRef<string | null>(null)
  const scanAbort = useRef<AbortController | null>(null)
  const ocrObservations = useRef<OcrUpload | null>(null)
  useEffect(() => () => scanAbort.current?.abort(), [])

  useEffect(() => {
    let active = true
    api().then(state => {
      if (!active) return
      const loadedStyle = safeBasicStyle(state.style)
      setStyle(loadedStyle); setSavedStyle(loadedStyle); setPresentation(state.presentation === 'basic' ? 'basic' : 'template')
      setConfigured(state.configured === true); setOcrConfigured(state.ocrConfigured === true); setReady(true)
      if (state.job) {
        let restored = state.job.draft
        try {
          const saved = localStorage.getItem(storageKey(menu.restaurant.id, state.job.id))
          if (saved) {const local=JSON.parse(saved);parseEditableAiMenuDraft(local);if(local._dirty||!restored._savedAt||(local._savedAt&&local._savedAt>=restored._savedAt))restored=local}
        } catch { /* fall back to the server's extraction */ }
        setDraft(parseEditableAiMenuDraft(restored)); setSourceCurrency(parseEditableAiMenuDraft(state.job.draft).currency); setJob(state.job.id)
        try { setReviewedKeys(validReviewKeys(parseEditableAiMenuDraft(restored).items,restored._reviewedKeys||[])) } catch { setReviewedKeys([]) }
        if(restored._style)setStyle(safeBasicStyle(restored._style))
        if(typeof restored._useBasic==='boolean')setUseBasic(restored._useBasic)
        setSavedAt(typeof restored._savedAt==='string'?restored._savedAt:null);setDirty(restored._dirty===true)
        setNotice('Your unfinished scan has been restored. Review it before publishing.')
      }
    }).catch(err => { if (active) setError(err.message) })
    return () => { active = false }
  }, [menu.restaurant.id])

  useEffect(() => {
    const urls = files.map(file => URL.createObjectURL(file)); setPreviews(urls)
    return () => urls.forEach(url => URL.revokeObjectURL(url))
  }, [files])
  useEffect(() => {
    if (draft && job) try { localStorage.setItem(storageKey(menu.restaurant.id, job), JSON.stringify({...draft,_reviewedKeys:reviewedKeys,_style:style,_useBasic:useBasic,_savedAt:savedAt,_dirty:dirty})) } catch { /* storage is optional */ }
  }, [draft, job, menu.restaurant.id,reviewedKeys,style,useBasic,savedAt,dirty])
  useEffect(()=>{
    if(!expanded||designOpen)return
    expandTrigger.current=document.activeElement as HTMLElement
    const root=previewRef.current
    root?.querySelector<HTMLElement>('[aria-label="Close full screen preview"]')?.focus()
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){setExpanded(false);return}
      if(event.key!=='Tab'||!root)return
      const nodes=[...root.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled)')].filter(el=>el.getClientRects().length)
      const first=nodes[0],last=nodes[nodes.length-1]
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
    }
    document.addEventListener('keydown',key)
    return()=>{document.removeEventListener('keydown',key);expandTrigger.current?.focus()}
  },[expanded,designOpen])
  useEffect(() => {
    const update = () => setSeconds(Math.max(0, Math.ceil((until - Date.now()) / 1000)))
    update(); const timer = setInterval(update, 1000); return () => clearInterval(timer)
  }, [until])

  function fail(err: { message?: string; retry?: number }) {
    setError(err.message || 'Something went wrong. Please try again.')
    if (err.retry) setUntil(Date.now() + err.retry * 1000)
  }
  function edit(index: number, values: Partial<AiMenuItem>) {
    setReviewed(false); setDirty(true); setError('')
    setDraft(current => current && ({ ...current, items: current.items.map((item, i) => i === index ? { ...item, ...values } : item) }))
  }
  function editGroup(group: PortionGroup<AiMenuItem>, values: Partial<AiMenuItem>) {
    const entries=new Map(group.entries.map(entry=>[entry.index,entry]))
    setReviewed(false);setDirty(true);setError('')
    setDraft(current=>current&&({...current,items:current.items.map((item,index)=>{
      const entry=entries.get(index);if(!entry)return item
      return {...item,...values,...(values.name!==undefined?{name:entry.portion?`${values.name} (${entry.portion})`:values.name}:{})}
    })}))
  }
  function editPortionPrice(group: PortionGroup<AiMenuItem>, portion: MenuPortion, price: number | null) {
    const entry=group.entries.find(entry=>entry.portion===portion)
    if(entry){edit(entry.index,{price});return}
    if(price===null)return
    setReviewed(false);setDirty(true);setError('')
    setDraft(current=>{
      if(!current||current.items.length>=AI_MENU_MAX_ITEMS)return current
      const template=group.entries[0].item
      return {...current,items:[...current.items,{...template,name:`${group.name} (${portion})`,price,note:'',source:undefined}]}
    })
  }
  function removeEntries(indices:number[]) {
    setReviewed(false);setDirty(true);setError('');setDraft(current=>current&&({...current,items:current.items.filter((_,index)=>!indices.includes(index))}))
  }
  async function scan() {
    if (!files.length || busy || seconds) return
    setBusy('scan'); setError(''); setNotice('')
    const controller = new AbortController(); scanAbort.current = controller
    if (!scanRequest.current) scanRequest.current = crypto.randomUUID()
    try {
      let data
      if (reader === 'device') {
        if (!ocrObservations.current) {
          // Keep the initial route and all public-menu bundles free of the OCR client/runtime.
          const { readMenuOnDevice } = await import('@/lib/menu-ocr-client')
          ocrObservations.current = await readMenuOnDevice(files, { signal: controller.signal, onProgress: setScanProgress })
        }
        setScanProgress('Saving extracted text for review…')
        data = await api({ method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'ocr', requestId: scanRequest.current, observations: ocrObservations.current }) })
      } else {
        setScanProgress('Reading with the online reader…')
        const form = new FormData(); form.set('requestId', scanRequest.current); form.set('verify', String(verifyScan)); files.forEach(file => form.append('photos', file))
        data = await api({ method: 'POST', body: form, signal: controller.signal })
      }
      if (data.published) { setNotice('This upload has already been published. Choose new photos to start another scan.'); return }
      const extracted = parseAiMenuDraft(data.draft)
      setDraft(extracted); setSourceCurrency(extracted.currency); setJob(data.id); setReviewed(false)
      setReviewedKeys([]);setDirty(false);setSavedAt(null);setEditingIds([])
      setNotice('Draft ready. Check every dish against the original photos, especially prices and dietary labels.')
    } catch (err) {
      const e = err as Error & { status?: number; retry?: number }
      if (e.name === 'AbortError') { setNotice('Scan cancelled. Your current menu is unchanged.'); return }
      if (e.status && e.status !== 409) scanRequest.current = null
      fail(e)
    } finally { scanAbort.current = null; setBusy(''); setScanProgress('') }
  }
  async function mutate(body: object) { return api({ method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) }
  async function saveDraft(){
    if(!draft||!job)return
    setBusy('draft');setError('');setNotice('')
    try{
      const checked=parseEditableAiMenuDraft(draft),checkedStyle=parseBasicStyle(style),keys=validReviewKeys(checked.items,reviewedKeys)
      const result=await mutate({action:'draft',id:job,draft:checked,style:checkedStyle,useBasic,reviewedKeys:keys})
      setSavedAt(result.savedAt);setDirty(false);setNotice('Draft saved. You can return to it later. Your live menu has not changed.')
    }catch(err){fail(err as Error)}finally{setBusy('')}
  }
  function addDish(category:string){setDraft(current=>current&&current.items.length<AI_MENU_MAX_ITEMS?{...current,items:[...current.items,{category,name:'',description:'',price:null,isVeg:null,note:''}]}:current);setReviewed(false);setDirty(true)}
  function moveDish(group:PortionGroup<AiMenuItem>,direction:-1|1){
    if(!draft)return
    const groups=groupMenuPortions(draft.items,item=>item.category),index=groups.findIndex(g=>g.key===group.key),other=index+direction
    if(other<0||other>=groups.length)return
    ;[groups[index],groups[other]]=[groups[other],groups[index]]
    setDraft({...draft,items:groups.flatMap(g=>g.entries.map(e=>e.item))});setReviewedKeys([]);setDirty(true);setReviewed(false)
  }
  function selectDish(indices:number[]){
    const ids=indices.map(i=>`draft-${i}`);setEditingIds(ids);setPreviewContent('menu')
    requestAnimationFrame(()=>{
      const canvas=previewRef.current?.querySelector('.ai-menu-preview-canvas'),dish=document.getElementById(`basic-dish-${ids[0]}`)
      if(canvas&&dish)canvas.scrollTo({top:(canvas as HTMLElement).scrollTop+dish.getBoundingClientRect().top-canvas.getBoundingClientRect().top-110,behavior:'smooth'})
    })
  }
  async function publish() {
    setError(''); setNotice('')
    try {
      const checked = parseAiMenuDraft(draft, true), checkedStyle = parseBasicStyle(style)
      if (checked.currency !== menu.restaurant.currency) throw new Error(`The menu must use ${menu.restaurant.currency}. Check and correct the currency and prices.`)
      if (!reviewed) throw new Error('Confirm that you have checked the prices and dietary labels.')
      setBusy('publish')
      const result = await mutate({ action: 'publish', id: job, draft: checked, style: checkedStyle, useBasic, reviewed: true })
      const dishCount=groupMenuPortions(checked.items,item=>item.category).length
      if (job) try { localStorage.removeItem(storageKey(menu.restaurant.id, job)) } catch { /* optional */ }
      setDraft(null); setJob(null); setFiles([]); setReviewed(false); setSourceCurrency(null); setPreviewContent('menu'); setSourceFocus(null); scanRequest.current = null; ocrObservations.current = null
      if (useBasic) setPresentation('basic')
      setSavedStyle(checkedStyle)
      setNotice(`Published ${dishCount} dishes${result.imported!==dishCount?` with ${result.imported} price options`:''}. You can now manage them in Dishes & categories.`)
      router.refresh()
    } catch (err) { fail(err as Error) } finally { setBusy('') }
  }
  async function saveStyle() {
    setError(''); setNotice(''); setBusy('style')
    try { const checked = parseBasicStyle(style); await mutate({ action: 'style', style: checked, presentation }); setStyle(checked); setSavedStyle(checked); setNotice('Menu appearance saved.'); router.refresh() }
    catch (err) { fail(err as Error) } finally { setBusy('') }
  }
  async function discard() {
    if (!job) return
    setBusy('discard'); setError('')
    try {
      await mutate({ action: 'discard', id: job })
      try { localStorage.removeItem(storageKey(menu.restaurant.id, job)) } catch { /* optional */ }
      setDraft(null); setJob(null); setFiles([]); setSourceCurrency(null); setPreviewContent('menu'); setSourceFocus(null); scanRequest.current = null; ocrObservations.current = null; setNotice('Draft discarded.')
    } catch (err) { fail(err as Error) } finally { setBusy('') }
  }

  const categories = draft ? [...new Set(draft.items.map(item => item.category))].map((name, index) => ({ id: `preview-${index}`, restaurant_id: menu.restaurant.id, name, sort_order: index })) : menu.categories
  const reviewGroups=draft?groupMenuPortions(draft.items,item=>item.category):[]
  const preview: MenuData = draft ? { ...menu, restaurant: { ...menu.restaurant, logo_url:logoUrl||undefined, currency: draft.currency || menu.restaurant.currency }, categories, dishes: draft.items.flatMap((item, index) => !readPortionName(item.name).name.trim() ? [] : [{
    id: `draft-${index}`, restaurant_id: menu.restaurant.id, category_id: categories.find(c => c.name === item.category)?.id,
    name: item.name, description: item.description, price: item.price ?? 0, is_veg: item.isVeg === true, is_available: true, sort_order: index, created_at: '',
  }]) } : {...menu,restaurant:{...menu.restaurant,logo_url:logoUrl||undefined}}
  let styleIssue = ''
  try { validPreviewStyle.current = parseBasicStyle(style) }
  catch (reason) { styleIssue = reason instanceof Error ? reason.message : 'Check your appearance settings.' }

  const upload = <section className="ai-menu-card"><h2>1. Upload menu photos</h2><p>Choose up to 3 clear PNG/JPEG photos, totalling 3 MB. Scan long menus in smaller sections, up to 100 dishes per draft.</p>
        <label>Text reader<select aria-label="Text reader" value={reader} disabled={!!busy} onChange={event => { setReader(event.target.value as 'device' | 'online'); scanRequest.current = null }}><option value="device">Read on this device · free</option><option value="online">Online AI reader</option></select></label>
        {reader === 'device' ? <p>Photos are read on your device; only extracted text is saved. Your first scan downloads about 65 MB of reader files, then reuses them for later scans. On a slow connection or a device with limited memory, you can choose the online reader.</p> : <p>These photos are sent to Google Gemini for extraction. Use menu pages only. Google’s free API tier may use submitted content to improve its products.</p>}
        {ready && !(reader === 'device' ? ocrConfigured : configured) && <p role="status">{reader === 'online' ? 'An administrator needs to configure the server AI key before scanning is available.' : 'Menu draft saving is not available yet. Ask your administrator to finish setup.'}</p>}
        <label className="ai-menu-file">Menu photos<input type="file" accept="image/png,image/jpeg" multiple disabled={!!busy} onChange={event => {
          const selected = [...(event.target.files || [])]; setError(''); scanRequest.current = null; ocrObservations.current = null; setSourceFocus(null)
          if (selected.length > 3 || selected.reduce((sum, file) => sum + file.size, 0) > AI_MENU_MAX_BYTES || selected.some(file => !['image/png', 'image/jpeg'].includes(file.type))) { setError('Choose 1–3 PNG/JPEG photos totalling 3 MB or less.'); setFiles([]); event.target.value = ''; return }
          setFiles(selected)
        }} /></label>
        <div className="ai-menu-photos">{previews.map((src, index) => <a href={src} key={src} target="_blank" rel="noreferrer"><img src={src} alt={`Menu photo ${index + 1}`} /><span>Page {index + 1}</span></a>)}</div>
        {reader === 'online' && <label className="ai-menu-check ai-menu-verify"><input type="checkbox" checked={verifyScan} disabled={!!busy} onChange={event => { setVerifyScan(event.target.checked); scanRequest.current = null }} /><span>Compare two AI readings<small>Uses two Google AI requests, more quota and extra processing. Review is still essential.</small></span></label>}
        <button className="ai-menu-primary" disabled={!ready || !(reader === 'device' ? ocrConfigured : configured) || !files.length || !!busy || !!seconds} onClick={scan}>{busy === 'scan' ? 'Reading your menu…' : seconds ? `Try again in ${seconds}s` : 'Scan menu photos'}</button>{busy === 'scan' && <button className="ai-menu-cancel" type="button" onClick={() => scanAbort.current?.abort()}>Cancel scan</button>}
        {scanProgress && <p className="ai-menu-scan-progress" role="status">{scanProgress}</p>}<small>100 saved scans per restaurant in 24 hours, up to 2 per minute. Failed online attempts also count. No automatic retries.</small>
      </section>
  const design = <section className="ai-menu-card ai-menu-design-card" id="ai-menu-design"><div className="ai-menu-section-heading"><h2>Make it feel like you</h2><span className="ai-menu-design-badge">LIVE PREVIEW</span></div><p>Start with a look you love. Fine-tune the details below, even with your existing dishes.</p>
        <BasicMenuStyleEditor style={style} onChange={value=>{setStyle(value);if(draft)setDirty(true)}} disabled={!!busy || !ready} dishes={menu.dishes} onError={setError} onUploading={setUploadingCover} branding={{url:logoUrl,restaurantName:menu.restaurant.name,onChange:url=>{setLogoUrl(url);router.refresh()}}} />
        {styleIssue && <p className="ai-menu-style-issue" role="status">{styleIssue} Your last valid design stays in the preview.</p>}
        <div className="ai-menu-design-save"><span>{JSON.stringify(style) === JSON.stringify(savedStyle) ? 'Your saved appearance' : 'Unsaved appearance changes'}</span><button type="button" disabled={!!busy || uploadingCover || JSON.stringify(style) === JSON.stringify(savedStyle)} onClick={() => {setStyle(savedStyle);if(draft)setDirty(true)}}>Reset changes</button></div>
        {!draft && <><label>Live menu appearance<select aria-label="Live menu appearance" value={presentation} disabled={!!busy || uploadingCover} onChange={event => setPresentation(event.target.value as 'basic' | 'template')}><option value="template">Current template</option><option value="basic">Photo studio menu</option></select></label>{presentation === 'template' && <p className="ai-menu-appearance-hint">Choose “Photo studio menu” to show this design on your live menu.</p>}<button className="ai-menu-primary" disabled={!ready || !!busy || uploadingCover || !!styleIssue} onClick={saveStyle}>{busy === 'style' ? 'Saving…' : 'Save menu appearance'}</button></>}
      </section>
  const currencyMessage=draft&&(draft.currency!==menu.restaurant.currency||(sourceCurrency&&sourceCurrency!==menu.restaurant.currency))?`${draft.currency?`Draft: ${draft.currency}.`:'Confirm the photo’s currency.'} Restaurant: ${menu.restaurant.currency}. Changing currency does not convert prices. Check every price.`:''
  const currentReviewKeys=reviewGroups.filter(group=>reviewedKeys.includes(menuReviewKey(group))&&menuGroupReady(group)).map(menuReviewKey)
  const publishPanel=<div className="studio-publish-controls">
    <label className="ai-menu-check"><input type="checkbox" checked={useBasic} disabled={!!busy} onChange={event=>{setUseBasic(event.target.checked);setDirty(true)}}/>Use this menu design when publishing</label>
    <label className="ai-menu-check"><input type="checkbox" checked={reviewed} disabled={!!busy} onChange={event=>{setReviewed(event.target.checked);if(event.target.checked)setReviewedKeys(reviewGroups.filter(menuGroupReady).map(menuReviewKey));setDirty(true)}}/>I checked every dish, price, currency and dietary label against the original menu.</label>
    <p className="studio-publish-hint">Missing prices and unconfirmed dietary labels must be corrected before publishing.</p>
    <button className="studio-button studio-primary" disabled={!!busy||uploadingCover||!!styleIssue||!reviewed||!draft?.items.length} onClick={publish}>{busy==='publish'?'Publishing…':'Publish reviewed dishes'}<StudioIcon name="arrow"/></button>
  </div>
  const previewPanel=<aside className={`ai-menu-preview ai-menu-preview-${previewWidth} studio-menu-preview${expanded?' is-expanded':''}`} id="ai-menu-preview" ref={previewRef} role={expanded?'dialog':undefined} aria-modal={expanded?true:undefined} aria-label={expanded?'Full screen menu preview':undefined}>
    <div className="studio-preview-toolbar"><div className="studio-preview-tabs" role="group" aria-label="Review view"><button type="button" aria-pressed={previewContent==='menu'} onClick={()=>setPreviewContent('menu')}>Live menu</button><button type="button" aria-pressed={previewContent==='photo'} onClick={()=>setPreviewContent('photo')}>Original photo</button></div><div className="studio-preview-tools"><span className="studio-live-indicator"><i/>Live preview</span><label className="studio-preview-size"><StudioIcon name={previewWidth==='phone'?'phone':'monitor'}/><select aria-label="Preview size" value={previewWidth} onChange={e=>setPreviewWidth(e.target.value as 'wide'|'phone')}><option value="wide">Desktop</option><option value="phone">Phone</option></select></label><button className="studio-button" aria-label={expanded?'Close full screen preview':'Expand preview'} onClick={()=>setExpanded(!expanded)}><StudioIcon name={expanded?'close':'expand'}/><span>{expanded?'Close':'Expand'}</span></button></div></div>
    <div className="ai-menu-preview-canvas" hidden={previewContent==='photo'}>{draft&&!draft.currency&&<p className="ai-preview-currency">Currency unconfirmed — prices are shown without a currency symbol.</p>}<BasicMenu data={preview} style={validPreviewStyle.current} editingDishIds={editingIds} currencyConfirmed={!draft||!!draft.currency} unconfirmedDietaryIds={draft?.items.flatMap((item,index)=>item.isVeg===null?[`draft-${index}`]:[])} unconfirmedPriceIds={draft?.items.flatMap((item,index)=>item.price===null?[`draft-${index}`]:[])} onLogoClick={ready&&!busy&&!uploadingCover?()=>{setDesignOpen(true);document.getElementById('ai-menu-logo-input')?.click()}:undefined}/></div>
    {previewContent==='photo'&&<div className="ai-review-reference">{previews.length?previews.map((src,i)=><figure key={src}><div className="ai-review-source-frame"><img src={src} alt={`Original menu page ${i+1}`}/>{sourceFocus?.page===i+1&&<span className="ai-review-source-box" aria-label="Highlighted original row" style={{left:`${sourceFocus.box[0]*100}%`,top:`${sourceFocus.box[1]*100}%`,width:`${sourceFocus.box[2]*100}%`,height:`${sourceFocus.box[3]*100}%`}}/>}</div><figcaption><a href={src} target="_blank" rel="noreferrer">Open page {i+1} larger ↗</a></figcaption></figure>):<div className="studio-photo-empty"><StudioIcon name="photo"/><h3>Keep the original in view</h3><p>{draft?'Photos stay on your device. Reattach your originals to compare them with the extracted items.':'Upload your menu photo to see it here.'}</p></div>}<label>Choose {previews.length?'different ':''}original photos<input type="file" aria-label="Choose original photos" accept="image/png,image/jpeg" multiple disabled={!!busy} onChange={event=>{const selected=[...(event.target.files||[])];if(selected.length>3||selected.reduce((sum,file)=>sum+file.size,0)>AI_MENU_MAX_BYTES||selected.some(file=>!['image/png','image/jpeg'].includes(file.type))){setError('Choose 1–3 PNG/JPEG photos totalling 3 MB or less.');event.target.value='';return}setError('');setFiles(selected);event.target.value=''}}/><small>Select the same pages in their original order. Reattaching does not start a scan.</small></label></div>}
  </aside>
  return <MenuReviewWorkspace draft={draft} busy={!!busy||uploadingCover} ready={ready} savedAt={savedAt} dirty={dirty} reviewedKeys={currentReviewKeys} error={error} notice={notice} upload={upload} preview={previewPanel} design={design} publish={publishPanel} designOpen={designOpen} onDesign={setDesignOpen} onExpand={()=>setExpanded(true)} onSave={saveDraft} onDiscard={discard} currencyMessage={currencyMessage}
    onCurrency={value=>{setDraft(current=>current&&({...current,currency:value}));setReviewed(false);setDirty(true)}} onEdit={editGroup} onPrice={(group,portion,price)=>portion?editPortionPrice(group,portion,price):edit(group.entries[0].index,{price})} onRemove={removeEntries} onAdd={addDish} onMove={moveDish} onPortions={group=>edit(group.entries[0].index,{name:`${group.name} (Full)`})} onSelect={selectDish} onSource={item=>{setSourceFocus(item.source);setPreviewContent('photo')}} onReviewed={group=>{setReviewedKeys([...new Set([...currentReviewKeys,menuReviewKey(group)])]);setDirty(true)}} onRenameCategory={(from,to)=>{setDraft(current=>current&&({...current,items:current.items.map(item=>item.category===from?{...item,category:to}:item)}));setReviewed(false);setDirty(true)}}/>
}
