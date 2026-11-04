// Ground truth never enters this parser or the browser OCR request.
const normalize = value => value.trim().replace(/\s+/g, ' ').toLowerCase()
function bounds(poly) {
  const points = poly.map(point => Array.isArray(point) ? point : [point.x, point.y])
  const xs = points.map(p => p[0]), ys = points.map(p => p[1])
  const x1=Math.min(...xs),x2=Math.max(...xs),y1=Math.min(...ys),y2=Math.max(...ys)
  return { x1,x2,y1,y2,cy:(y1+y2)/2,height:y2-y1 }
}
function parseRows(items) {
  const lines = items.map((item,id) => ({...item,id,...bounds(item.poly)}))
  const pricePattern = /^([$₹€£])\s*(\d+(?:[.,]\d{2})?)$/
  const standalone = lines.filter(line => pricePattern.test(line.text.trim()))
  const headings = lines.filter(line => /^[A-Z][A-Z &/]{3,}$/.test(line.text.trim()))
  const used = new Set(),rows=[]
  const categoryFor = line => headings.filter(h => h.y2 < line.y1 && Math.abs(h.x1-line.x1)<Math.max(45,line.height*2)).sort((a,b)=>b.y2-a.y2)[0]?.text || null
  for (const price of standalone) {
    const candidates = lines.filter(line => line.id!==price.id && !used.has(line.id) && !pricePattern.test(line.text.trim()) && /[a-z]/i.test(line.text) && line.x2<price.x1+line.height && Math.abs(line.cy-price.cy)<Math.max(line.height,price.height)*.65)
      .sort((a,b)=>Math.abs(a.cy-price.cy)-Math.abs(b.cy-price.cy)||b.x2-a.x2)
    const name=candidates[0]
    if (!name) continue
    used.add(name.id)
    const match=price.text.trim().match(pricePattern)
    rows.push({category:categoryFor(name),name:name.text,price:Number(match[2].replace(',','.')),symbol:match[1],score:Math.min(name.score,price.score),sourceIds:[name.id,price.id]})
  }
  for (const line of lines) {
    const match=line.text.trim().match(/^(.+?)\s+([$₹€£])\s*(\d+(?:[.,]\d{2})?)$/)
    if (!match) continue
    rows.push({category:categoryFor(line),name:match[1],price:Number(match[3].replace(',','.')),symbol:match[2],score:line.score,sourceIds:[line.id]})
  }
  return {rows,headings:headings.map(h=>h.text)}
}
function evaluate(items,expected) {
  const parsed=parseRows(items), findings=expected.rows.map(row=>{
    const matches=parsed.rows.filter(candidate=>normalize(candidate.name)===normalize(row.name))
    return {expected:row,recognized:matches,correctNameAndPrice:matches.some(m=>m.price===row.price&&m.symbol===expected.currencySymbol),correctCategory:matches.some(m=>normalize(m.category||'')===normalize(row.category))}
  })
  const recognizedNames=new Set(items.map(item=>normalize(item.text)))
  return {expectedRows:expected.rows.length,rawNamesReadExactly:expected.rows.filter(row=>recognizedNames.has(normalize(row.name))).length,
    correctNamePricePairs:findings.filter(f=>f.correctNameAndPrice).length,
    correctNamePriceAndCategory:findings.filter(f=>f.correctNameAndPrice&&f.correctCategory).length,
    expectedHeadingsRead:expected.headings.filter(h=>items.some(i=>normalize(i.text)===normalize(h))).length,
    unexpectedRows:parsed.rows.filter(row=>!expected.rows.some(e=>normalize(e.name)===normalize(row.name))),
    findings,parsedRows:parsed.rows}
}
module.exports={parseRows,evaluate}
