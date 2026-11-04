import { NextResponse } from 'next/server'
import { getOwnedRestaurant, rejectUnsafeRequest } from '@/lib/menu-api'
import { createRateLimiter, readFormBody, readJsonBody } from '@/lib/request-security'
import { AI_MENU_MAX_BYTES, parseAiMenuDraft, parseEditableAiMenuDraft, parseBasicStyle } from '@/lib/ai-menu'
import { validReviewKeys } from '@/lib/menu-review'
import { AiMenuError, extractMenu, inspectMenuImage, menuImageFingerprint } from '@/lib/ai-menu-server'
import { isUuid } from '@/lib/menu-validation'
import { supabaseAdmin } from '@/lib/supabase'
import { createHash } from 'node:crypto'
import { MENU_OCR_MAX_BODY, draftFromOcr, parseOcrUpload } from '@/lib/menu-ocr'

export const runtime = 'nodejs'
export const maxDuration = 60
const uploadLimited = createRateLimiter(10, 60_000)
const json = (body: unknown, status = 200, retry?: number) => NextResponse.json(body, {
  status, headers: { 'Cache-Control': 'private, no-store', ...(retry ? { 'Retry-After': String(retry) } : {}) },
})
function dbError(error: { code?: string }) {
  if (['PGRST202', '42P01', '42703', '42883'].includes(error.code || '')) return json({ error: 'Apply supabase/phase-ai-menu.sql before using menu scanning.' }, 503)
  if (error.code === '42501') return json({ error: 'Only the restaurant owner can use menu scanning.' }, 403)
  if (error.code === '23505') return json({ error: 'A dish with this name already exists in that category. Rename or remove it from the draft.' }, 409)
  if (error.code === '22023') return json({ error: 'Check every dish, price, dietary label, currency and review confirmation.' }, 400)
  return json({ error: 'The menu scan could not be saved. Please try again.' }, 503)
}
function result(data: Record<string, unknown>) {
  return json(data, Number(data.http_status) || 200, Number(data.retry_after) || undefined)
}

export async function GET() {
  const auth = await getOwnedRestaurant(); if ('error' in auth) return auth.error
  const { data, error } = await auth.supabase.rpc('ai_menu_state', { p_restaurant: auth.restaurantId })
  return error ? dbError(error) : json({ ...data, configured: !!process.env.GEMINI_API_KEY && !!process.env.SUPABASE_SERVICE_ROLE_KEY, ocrConfigured: !!process.env.SUPABASE_SERVICE_ROLE_KEY })
}

export async function POST(request: Request) {
  const localOcr = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() === 'application/json'
  const unsafe = rejectUnsafeRequest(request, !localOcr, localOcr ? MENU_OCR_MAX_BODY : undefined); if (unsafe) return unsafe
  const auth = await getOwnedRestaurant(); if ('error' in auth) return auth.error
  if (localOcr) {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: 'Menu draft storage needs the server service key.' }, 503)
    if (uploadLimited(auth.restaurantId)) return json({ error: 'Too many requests. Wait a minute before trying again.' }, 429, 60)
    const body = await readJsonBody(request, MENU_OCR_MAX_BODY)
    if (!body || body.action !== 'ocr' || !isUuid(body.requestId)) return json({ error: 'Start a new menu scan.' }, 400)
    let upload, draft
    try { upload = parseOcrUpload(body.observations); draft = draftFromOcr(upload) }
    catch (error) { return json({ error: error instanceof Error ? error.message : 'Check the scanned pages.' }, 400) }
    const fingerprint = createHash('sha256').update(JSON.stringify(upload)).digest('hex')
    const { data, error } = await auth.supabase.rpc('ai_menu_begin', { p_restaurant: auth.restaurantId, p_request: body.requestId, p_fingerprint: fingerprint })
    if (error) return dbError(error)
    if (!data?.reserved) return result(data || { http_status: 503, error: 'Could not reserve a menu draft.' })
    const saved = await supabaseAdmin().rpc('ai_menu_complete', { p_request: body.requestId, p_draft: draft })
    return saved.error ? dbError(saved.error) : json({ id: body.requestId, draft })
  }
  if (!process.env.GEMINI_API_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: 'Menu scanning needs GEMINI_API_KEY and SUPABASE_SERVICE_ROLE_KEY in the server environment.' }, 503)
  if (uploadLimited(auth.restaurantId)) return json({ error: 'Too many uploads. Wait a minute before trying again.' }, 429, 60)
  const form = await readFormBody(request, AI_MENU_MAX_BYTES + 65_536)
  if (!form) return json({ error: 'Upload up to three PNG/JPEG photos, totalling at most 3 MB.' }, 413)
  const requestId = form.get('requestId'), files = form.getAll('photos')
  const verifyValue = form.get('verify')
  if (verifyValue !== null && verifyValue !== 'true' && verifyValue !== 'false') return json({ error: 'Choose a valid scan mode.' }, 400)
  const verify = verifyValue === 'true'
  if (!isUuid(requestId) || !files.length || files.length > 3 || files.some(file => !(file instanceof File))) return json({ error: 'Choose 1–3 PNG/JPEG photos and start a new scan.' }, 400)
  if (files.reduce((total, file) => total + (file as File).size, 0) > AI_MENU_MAX_BYTES) return json({ error: 'Menu photos must total 3 MB or less.' }, 413)
  const images: { bytes: Buffer; mime: string }[] = []
  try {
    for (const file of files as File[]) {
      const bytes = Buffer.from(await file.arrayBuffer()), info = inspectMenuImage(bytes, file.type)
      images.push({ bytes, mime: info.mime })
    }
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Invalid photo.' }, error instanceof AiMenuError ? error.status : 400) }
  const { data, error } = await auth.supabase.rpc('ai_menu_begin', { p_restaurant: auth.restaurantId, p_request: requestId, p_fingerprint: menuImageFingerprint(images, verify) })
  if (error) return dbError(error)
  if (!data?.reserved) return result(data || { http_status: 503, error: 'Could not reserve a scan.' })
  try {
    const draft = await extractMenu(images, verify)
    const saved = await supabaseAdmin().rpc('ai_menu_complete', { p_request: requestId, p_draft: draft })
    if (saved.error) return dbError(saved.error)
    return json({ id: requestId, draft })
  } catch (error) {
    // No response bodies, images or secrets are logged. Failed reservations stay counted.
    try { await supabaseAdmin().rpc('ai_menu_complete', { p_request: requestId, p_draft: null }) } catch { /* reservation expires safely */ }
    return json({ error: error instanceof AiMenuError ? error.message : 'Menu scanning failed. Please try again.' }, error instanceof AiMenuError ? error.status : 502, error instanceof AiMenuError ? error.retryAfter : undefined)
  }
}

export async function PATCH(request: Request) {
  const unsafe = rejectUnsafeRequest(request, false, 100_000); if (unsafe) return unsafe
  const auth = await getOwnedRestaurant(); if ('error' in auth) return auth.error
  const body = await readJsonBody(request, 100_000)
  if (!body) return json({ error: 'The request is invalid or too large. Publish fewer dishes at once.' }, 400)
  try {
    if(body.action==='draft'){
      if(!isUuid(body.id))return json({error:'Choose an unfinished menu draft.'},400)
      if(!process.env.SUPABASE_SERVICE_ROLE_KEY)return json({error:'Draft saving needs the server service key.'},503)
      const draft=parseEditableAiMenuDraft(body.draft),style=parseBasicStyle(body.style)
      const savedAt=new Date().toISOString()
      const stored={...draft,_reviewedKeys:validReviewKeys(draft.items,body.reviewedKeys||[]),_style:style,_useBasic:body.useBasic===true,_savedAt:savedAt}
      if(Buffer.byteLength(JSON.stringify(stored))>90_000)return json({error:'This draft is too large. Save fewer dishes at once.'},400)
      const {data,error}=await supabaseAdmin().from('ai_menu_jobs').update({draft:stored})
        .eq('id',body.id).eq('restaurant_id',auth.restaurantId).eq('status','ready').is('published',null).select('id').maybeSingle()
      if(error)return dbError(error)
      if(!data)return json({error:'This draft is no longer editable. Refresh to load the current menu.'},409)
      return json({saved:true,savedAt})
    }
    if (body.action === 'discard' && isUuid(body.id)) {
      const { data, error } = await auth.supabase.rpc('ai_menu_discard', { p_restaurant: auth.restaurantId, p_request: body.id })
      return error ? dbError(error) : result(data)
    }
    const style = parseBasicStyle(body.style)
    if (body.action === 'style') {
      if (!['basic', 'template'].includes(body.presentation)) return json({ error: 'Choose a menu presentation.' }, 400)
      const { data, error } = await auth.supabase.rpc('ai_menu_configure', { p_restaurant: auth.restaurantId, p_style: style, p_presentation: body.presentation })
      if (error?.code === '22023') return json({ error: 'The saved menu appearance could not be updated. Apply supabase/phase-ai-menu-design.sql to enable the new design controls.' }, 400)
      return error ? dbError(error) : result(data)
    }
    if (body.action !== 'publish' || !isUuid(body.id) || body.reviewed !== true || typeof body.useBasic !== 'boolean') return json({ error: 'Review and confirm the complete draft before publishing.' }, 400)
    const draft = parseAiMenuDraft(body.draft, true)
    const { data, error } = await auth.supabase.rpc('ai_menu_publish', {
      p_restaurant: auth.restaurantId, p_request: body.id, p_draft: draft, p_style: style, p_basic: body.useBasic, p_reviewed: true,
    })
    return error ? dbError(error) : result(data)
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Check the draft.' }, 400) }
}
