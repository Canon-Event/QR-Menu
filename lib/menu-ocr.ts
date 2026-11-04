import { AI_MENU_MAX_ITEMS, parseAiMenuDraft, type AiMenuDraft, type AiMenuItem } from './ai-menu'

export const MENU_OCR_VERSION = 'paddle-0.4.2-v6'
export const MENU_OCR_MAX_BODY = 256_000
export type OcrLine = { text: string; score: number; poly: [number, number][] }
export type OcrPage = { width: number; height: number; items: OcrLine[] }
export type OcrUpload = { version: typeof MENU_OCR_VERSION; imageHashes: string[]; pages: OcrPage[] }

/** Client observations are owner input, never trusted merely because they claim to be OCR. */
export function parseOcrUpload(value: unknown): OcrUpload {
  const body = value as Partial<OcrUpload> | null
  if (!body || body.version !== MENU_OCR_VERSION || !Array.isArray(body.pages) || !body.pages.length || body.pages.length > 3 || !Array.isArray(body.imageHashes) || body.imageHashes.length !== body.pages.length || body.imageHashes.some(hash => typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash))) throw new Error('Choose up to three menu pages and start a new scan.')
  let count = 0
  const pages = body.pages.map(page => {
    if (!page || !Number.isInteger(page.width) || !Number.isInteger(page.height) || page.width < 64 || page.height < 64 || page.width > 8000 || page.height > 8000 || page.width * page.height > 20_000_000 || !Array.isArray(page.items) || (count += page.items.length) > 600) throw new Error('This scan is too large. Read smaller menu sections.')
    const items = page.items.map(line => {
      if (!line || typeof line.text !== 'string' || line.text.length > 256 || /[\u0000-\u001f]/.test(line.text) || typeof line.score !== 'number' || !Number.isFinite(line.score) || line.score < 0 || line.score > 1 || !Array.isArray(line.poly) || line.poly.length !== 4 || line.poly.some(point => !Array.isArray(point) || point.length !== 2 || point.some(n => typeof n !== 'number' || !Number.isFinite(n)) || point[0] < -2 || point[1] < -2 || point[0] > page.width + 2 || point[1] > page.height + 2)) throw new Error('The text reader returned invalid observations. Start a new scan.')
      return { text: line.text.trim().replace(/\s+/g, ' '), score: line.score, poly: line.poly.map(p => [p[0], p[1]] as [number, number]) }
    })
    return { width: page.width, height: page.height, items }
  })
  return { version: MENU_OCR_VERSION, imageHashes: [...body.imageHashes], pages }
}

const amountPattern = '(?:\\d{1,3}(?:,\\d{3})+(?:\\.\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?)'
const money = new RegExp(`^(?:(USD|INR|EUR|GBP|AED|Rs\\.?|[$₹€£])\\s*)?(${amountPattern})(?:\\s*(USD|INR|EUR|GBP|AED))?$`, 'i')
const inline = new RegExp(`^(.+?)\\s+((?:USD|INR|EUR|GBP|AED|Rs\\.?|[$₹€£])\\s*${amountPattern}|${amountPattern}\\s*(?:USD|INR|EUR|GBP|AED))$`, 'i')
const suspiciousPrice = /^(?:[Ss]\s*\d+(?:[.,]\d{1,2})?|Rs\.?\s*(?=[\dIlOo.,]*[\dIlOo])[\dIlOo.,]+)$/i
const currencyOnly = /^(?:USD|INR|EUR|GBP|AED|Rs\.?|[$₹€£])$/i
const portionLabel = /^(?:half|full)$/i
const hasLetters = (text: string) => /[A-Za-z\u00c0-\uffff]/.test(text)
const codes: Record<string, string> = { USD:'USD', INR:'INR', EUR:'EUR', GBP:'GBP', AED:'AED', '₹':'INR', '€':'EUR' }
type Line = OcrLine & { id: number; x1: number; x2: number; y1: number; y2: number; cy: number; height: number }
function geometry(line: OcrLine, id: number): Line {
  const x=line.poly.map(p=>p[0]),y=line.poly.map(p=>p[1]),x1=Math.min(...x),x2=Math.max(...x),y1=Math.min(...y),y2=Math.max(...y)
  return { ...line,id,x1,x2,y1,y2,cy:(y1+y2)/2,height:Math.max(1,y2-y1) }
}
function priceOf(text: string) {
  const match=text.match(money)
  if (!match) return null
  const normalized=match[2].includes(',') && !/,\d{3}/.test(match[2]) ? match[2].replace(',','.') : match[2].replace(/,/g,'')
  const amount=Number(normalized)
  if (!Number.isFinite(amount) || amount>1_000_000) return null
  const unit=(match[1]||match[3]||'').toUpperCase()
  return { amount,currency:codes[unit]||null,unit }
}
const commonHeading = /^(?:starters?|appeti[sz]ers?|main(?: course)?s?|entr[ée]es?|beverages?|drinks?|desserts?|sides?|salads?|soups?|breakfast|lunch|dinner|pizzas?|pastas?|burgers?|sandwiches?|cocktails?|mocktails?|coffee|tea)$/i

function headingForRow(headings: Line[], name: Line, price: Line) {
  // A heading may be centered or right-aligned inside the name-to-price column.
  // Its left edge need not align with the dish name. Restrict its center and
  // width to this column so a nearby heading cannot label the adjacent column.
  const left=Math.min(name.x1,price.x1),right=Math.max(name.x2,price.x2),padding=name.height*.75
  return headings.filter(heading=>{
    const center=(heading.x1+heading.x2)/2
    // Tight scans can give a heading's bounding box a few pixels of overlap
    // with the first dish. Its center still needs to be above that dish.
    return heading.cy<name.y1&&center>=left-padding&&center<=right+padding&&heading.x2-heading.x1<=right-left+padding*2
  }).sort((a,b)=>b.y2-a.y2||Math.abs((a.x1+a.x2-left-right)/2)-Math.abs((b.x1+b.x2-left-right)/2))[0]
}

type PortionBand = { half: Line; full: Line }
function portionBandsFor(headers: Line[]): PortionBand[] {
  const fulls=headers.filter(h=>h.text.toLowerCase()==='full')
  return headers.filter(h=>h.text.toLowerCase()==='half').map(half=>({half,full:fulls.filter(full=>Math.abs(full.cy-half.cy)<Math.max(full.height,half.height)*.75)
    .sort((a,b)=>Math.abs(a.x1-half.x1)-Math.abs(b.x1-half.x1))[0]}))
    .filter((band):band is PortionBand=>!!band.full).sort((a,b)=>Math.max(b.half.cy,b.full.cy)-Math.max(a.half.cy,a.full.cy))
}
function portionForPrice(bands: PortionBand[], name: Line, price: Line) {
  const center=(price.x1+price.x2)/2
  for(const band of bands){
    if(band.half.cy>=price.y1||band.full.cy>=price.y1||band.half.x1<=name.x2||band.full.x1<=name.x2)continue
    const halfCenter=(band.half.x1+band.half.x2)/2,fullCenter=(band.full.x1+band.full.x2)/2,gap=Math.abs(halfCenter-fullCenter)
    const halfDistance=Math.abs(halfCenter-center),fullDistance=Math.abs(fullCenter-center)
    if(Math.min(halfDistance,fullDistance)>gap*.6)continue
    return halfDistance<fullDistance?'Half':'Full'
  }
  return null
}

/** Values come only from observed text; no dictionary supplies a dish name or price. */
export function draftFromOcr(raw: unknown): AiMenuDraft {
  const upload=parseOcrUpload(raw),items:AiMenuItem[]=[],warnings=new Set<string>(),currencyCodes=new Set<string>()
  warnings.add('Check every dish and price against the original. OCR can misread text even with a high recognition score.')
  warnings.add('Confirm dietary labels with the restaurant. Names and ingredients alone do not establish them.')
  upload.pages.forEach((page,pageIndex)=>{
    const lines=page.items.map(geometry).filter(l=>l.text && l.height>1 && l.score>=.4).sort((a,b)=>a.y1-b.y1||a.x1-b.x1)
    const priceLines=lines.filter(l=>!currencyOnly.test(l.text)&&(priceOf(l.text)||suspiciousPrice.test(l.text)))
    const portionBands=portionBandsFor(lines.filter(l=>portionLabel.test(l.text)&&l.score>=.9))
    if(portionBands.length)warnings.add('Half/Full follow the printed price columns. Confirm portion sizes and piece counts before publishing.')
    const used=new Set<number>(),rows:{name:Line;prices:Line[];parts:Line[];inlineName?:string;inlinePrice?:string}[]=[]
    const canBeName=(line:Line)=>hasLetters(line.text)&&!priceOf(line.text)&&!suspiciousPrice.test(line.text)&&!currencyOnly.test(line.text)&&!portionLabel.test(line.text)&&!/https?:|www\.|^\+?\d[\d ()-]{5,}$/.test(line.text)
    for(const line of lines){
      const match=line.text.match(inline)
      if(!match)continue
      rows.push({name:line,prices:[line],parts:[line],inlineName:match[1],inlinePrice:match[2]});used.add(line.id)
    }
    for(const price of priceLines){
      const candidates=lines.filter(line=>canBeName(line)&&line.x2<price.x1+line.height*.3&&Math.abs(line.cy-price.cy)<Math.max(line.height,price.height)*.65)
        .sort((a,b)=>b.x2-a.x2||Math.abs(a.cy-price.cy)-Math.abs(b.cy-price.cy))
      const nearest=candidates[0]
      if(!nearest)continue
      if(used.has(nearest.id)){
        const previous=rows.find(row=>row.parts.some(part=>part.id===nearest.id))
        if(previous){previous.prices.push(price);used.add(price.id)}
        continue
      }
      // Join adjacent OCR fragments on the same printed row, without crossing a column gap.
      const parts=[nearest]
      for(const candidate of candidates.slice(1)){
        const left=parts[0]
        if(used.has(candidate.id)||left.x1-candidate.x2>Math.max(left.height,candidate.height)*2||Math.abs(left.cy-candidate.cy)>left.height*.5)break
        parts.unshift(candidate)
      }
      parts.forEach(part=>used.add(part.id));used.add(price.id)
      rows.push({name:{...parts[0],text:parts.map(p=>p.text).join(' '),x2:parts.at(-1)!.x2},prices:[price],parts})
    }
    const headings=lines.filter(l=>!used.has(l.id)&&l.score>=.75&&l.text.length<=80&&!currencyOnly.test(l.text)&&!portionLabel.test(l.text)&&(/^[A-Z][A-Z &/]{2,}$/.test(l.text)||commonHeading.test(l.text)))
    for(const row of rows.sort((a,b)=>a.name.y1-b.name.y1||a.name.x1-b.name.x1)){
      const name=row.inlineName||row.name.text
      if(!name.trim()||name.length>120){warnings.add('A dish name was too long to import. Add it manually from the photo.');continue}
      const lastPrice=row.prices.reduce((a,b)=>a.x2>b.x2?a:b)
      const heading=headingForRow(headings,row.name,lastPrice)
      const category=heading?.text||'General'
      if(!heading)warnings.add('Some rows have no clear section heading. Check their General category.')
      const portions=row.prices.map(price=>portionForPrice(portionBands,row.name,price))
      const ambiguous=row.prices.length>1&&(portions.some(p=>!p)||new Set(portions).size!==portions.length)
      const candidates=ambiguous?[{line:lastPrice,portion:null}]:row.prices.map((line,i)=>({line,portion:portions[i]}))
      for(const candidate of candidates){
        const price=priceOf(row.inlinePrice||candidate.line.text),notes:string[]=[]
        const confident=row.parts.every(part=>part.score>=.9)&&candidate.line.score>=.9
        if(!price)notes.push(`Unclear price “${candidate.line.text}”. Confirm it from the photo.`)
        if(!confident)notes.push('Text confidence is low. Check the name and price.')
        if(ambiguous)notes.push(`Multiple prices (${row.prices.map(p=>p.text).join(' / ')}) have no clear size labels. Confirm variants.`)
        if(price?.currency)currencyCodes.add(price.currency)
        const evidence=ambiguous?row.prices:[candidate.line]
        const x1=Math.max(0,Math.min(row.name.x1,...evidence.map(p=>p.x1))),y1=Math.max(0,Math.min(row.name.y1,...evidence.map(p=>p.y1))),x2=Math.min(page.width,Math.max(row.name.x2,...evidence.map(p=>p.x2))),y2=Math.min(page.height,Math.max(row.name.y2,...evidence.map(p=>p.y2)))
        const variantName=candidate.portion?`${name} (${candidate.portion})`:name
        if(variantName.length>120){warnings.add('A dish name with its size was too long to import. Add it manually from the photo.');continue}
        items.push({category,name:variantName,description:'',price:price&&confident&&!ambiguous?price.amount:null,isVeg:null,note:notes.join(' ').slice(0,200),source:{page:pageIndex+1,box:[x1/page.width,y1/page.height,(x2-x1)/page.width,(y2-y1)/page.height]}})
      }
    }
    for(const line of lines){
      for(const code of line.text.match(/\b(?:USD|INR|EUR|GBP|AED)\b/g)||[])currencyCodes.add(code)
    }
    warnings.add('Check for omitted items, descriptions and size variants. Add missing details using the original photo.')
  })
  if(!items.length)throw new Error('No dish and price rows could be matched reliably. Try a clear, closer photo of one menu section.')
  if(items.length>AI_MENU_MAX_ITEMS)throw new Error('More than 100 dishes were detected. Scan smaller sections.')
  if(currencyCodes.size!==1)warnings.add('Confirm the currency. $, Rs. and bare numbers do not identify an ISO currency; prices have not been converted.')
  return parseAiMenuDraft({currency:currencyCodes.size===1?[...currencyCodes][0]:null,items,warnings:[...warnings]})
}
