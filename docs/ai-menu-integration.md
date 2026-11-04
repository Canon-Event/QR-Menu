# Menu-photo import: setup and interview walkthrough

The default reader uses pretrained PaddleOCR in an owner's browser worker. Our server matches recognized text and coordinates into an editable draft without generating names or prices. Gemini remains an optional online reader. Neither reader publishes directly. No RAG, vector database, training or fine-tuning is needed to extract a supplied photo.

## Review workspace

The import page uses a compact editor beside the shared customer-menu renderer. Category tabs, search, review filters and pagination keep long menus manageable. Selecting a dish opens its description, category and dietary controls and highlights it in the preview. Half/Full prices remain independent; an unlisted portion stays blank. **View in original photo** uses the scanned row's coordinates, and **Original photo** accepts local reattachments without scanning again.

**Confirm item** records an owner's review only when names, categories, listed prices and dietary labels are complete. Changing a price, name, category or portion invalidates its review. The footer shows actual review counts. The Publish step retains the final explicit owner confirmation and existing server/SQL validation.

**Save draft** persists private edits, appearance and item review status through the owner-authenticated API without reserving another scan. It can update only that restaurant's ready, unpublished job. It does not change live dishes or appearance. Unsaved edits also stay in browser storage; a server-saved draft can be restored on another browser. Photos remain local. Existing Supabase service-role access is sufficient; new installations receive explicit job SELECT/UPDATE grants in the base migration.

**Design** opens appearance and logo controls in a drawer. Desktop shows both panels with independent scrolling; narrow screens switch between **Edit menu** and **Preview**. Full-screen preview and the Design drawer support Escape, keyboard focus containment and focus restoration. Customer category navigation stays sticky inside the preview. The workspace adds no libraries, animation runtime or OCR initialization.

## Local setup

1. Run the entire `supabase/phase-ai-menu.sql` in the same Supabase project as the app. It requires the base `schema.sql`; it has no dependency on the POS or table-verification migrations. It is safe to rerun and preserves existing menus.
2. Set `SUPABASE_SERVICE_ROLE_KEY` on the server: only the trusted server may complete extraction jobs. Never use a `NEXT_PUBLIC_` variable for this key. Local OCR does not need an AI service key and makes no paid provider request.
3. Install dependencies, then run `pnpm dev` or `pnpm build`. Their preparation hook copies the pinned official worker/WASM and downloads the two official PP-OCRv6 small model archives into ignored `public/menu-ocr/paddle-0.4.2/`. Deploy these generated static assets with the app. Subsequent preparations verify SHA-256 hashes and reuse existing files. The build machine needs network access for its first preparation; users fetch runtime files from this site's origin.
4. Open `/dashboard/ai-menu`. **Read on this device · free** is selected by default. Upload 1–3 PNG/JPEG photos totalling at most 3 MB. Each image may be up to 20 megapixels, with dimensions between 64 and 8,000 pixels per side. The first scan downloads the reader; later scans reuse cached assets. Cancel stops work immediately. Devices with limited memory can use the explicit online option instead.
5. Compare every draft row with the **Original photo** tab or its **View in original photo** button. Correct prices, categories, names, descriptions, currency and dietary labels; add any missing dishes and remove false matches. Section counts help reveal an omitted group. After reload, select the original photo again for local comparison without making another AI request. Unknown prices/labels must be resolved before publishing. Size variants become separate saved options; explicit Half/Full options share one editor row and customer dish.
6. Choose a preset, font, colours, background and photos. Publishing appends dishes to the current menu. **Use this menu design when publishing** activates the independent photo-studio renderer. **Live menu appearance → Current template** switches back.

For optional **Online AI reader**, set server-only `GEMINI_API_KEY` and `GEMINI_MENU_MODEL` (the existing configured model can be kept). **Compare two AI readings** is off by default; enabling it makes two provider requests and uses extra quota. There is no automatic online fallback or retry. Google controls its free allowance and billing; local OCR has no provider usage fee.

For Vercel, add the same server environment variables in the project's settings and redeploy after running the migration. Local `.env.local` values are not uploaded automatically. No production deployment or remote migration is performed by this integration.

**Existing six-scan installations:** run `supabase/phase-ai-menu-scan-limits.sql` once in the Supabase SQL Editor to raise the rolling daily allowance to **100 per restaurant / 1,000 across the installation**. It replaces only the reservation function and preserves all dishes, drafts, scan history, authentication and retry behavior. Existing scans remain counted toward the higher allowance; no counter reset is necessary. Refresh the importer after applying it to clear any old 24-hour countdown. Short burst limits remain 2/minute per restaurant and 5/minute across the installation. This app allowance is separate from any online provider quota.

## Photo studio appearance

The photo-import menu now has a shared responsive design for the studio preview and public QR page. In **Make it feel like you**, owners can choose Saffron, Garden, After hours, Rose café or Studio, then customize colours, font, spacing, editorial/card layout, tagline, cover and dish-photo visibility. Phone and wide previews update immediately. Reset restores the saved appearance. Choose **Live menu appearance → Photo studio menu**, then **Save menu appearance**, to activate the design with existing dishes. Publishing a scan can also activate it.

**Restaurant logo:** click the star beside the restaurant name in the preview, or use **Tell your story → Restaurant logo**. Upload PNG, JPG or WebP up to 2 MB. The browser preserves transparency and aspect ratio, resizes the longest edge to at most 512 pixels and encodes WebP before sending it to the existing owner-authenticated `/api/settings/logo` endpoint. It saves immediately to `restaurants.logo_url`, updates the preview and appears on the public menu. Change or remove it from the same control; removal clears the restaurant setting without deleting previously stored files. Presets and covers do not replace the logo. It uses existing `restaurant-logos` storage and needs no new SQL migration or OCR scan.

Backgrounds include a soft colour wash, paper dots, a fine grid and a clean canvas. Optional colour drift uses CSS transforms and is disabled by `prefers-reduced-motion`. The public renderer adds no animation library or animation JavaScript. Dish images load lazily. Cover uploads are resized in the owner's browser to at most 1,200 pixels on the longest side and encoded as WebP before using the existing authenticated image-upload endpoint. Image links should point to appropriately sized photos.

**Existing installations:** run `supabase/phase-ai-menu-design.sql` after the original AI migration, before deploying the updated editor. This only expands the validated JSON style fields; it preserves saved menus and previous style values. New installations can use the updated `phase-ai-menu.sql` directly. Existing image-upload storage setup for `restaurant-logos` is required for custom cover uploads. The bundled covers and HTTPS image links also work without an upload.

The API validates preset tokens, colour contrast, image URLs and bounded tagline text. PostgreSQL repeats the field/type allowlist, including for direct RPC calls. Existing five-field styles still load and save. Checks cover owner save/reload, atomic publish, tenant restrictions, image resizing, all five public looks at 320/390/768/1440 pixels, and reduced motion. These are local fixtures, separate from hosted-database verification.

**Privacy:** local OCR keeps photos on the owner's device and sends bounded extracted text, coordinates and image hashes to the authenticated API. Selecting the online reader sends photos to Gemini, with the existing disclosure. Neither mode stores original photos in our database. Restoring a draft after reload requires reselecting photos locally for comparison.

## Performance boundaries

- No OCR SDK is imported into Next's application bundles. The small client adapter is dynamically imported only when Scan is pressed. Public menus render saved dishes and CSS; they have no OCR request, model initialization or provider call.
- The pinned vendor worker, two models and ONNX WASM total about 64.5 MiB before HTTP compression. The SDK's published worker requires ORT's JSEP WASM build even though inference uses the CPU provider. This is a substantial **first owner scan** download. Heavy files use versioned immutable URLs and CacheStorage; unavailable/evicted storage may require downloading them again.
- Recognition runs in one dedicated worker with one WASM thread. Pages run sequentially. Images retain their resolution up to a 2,400-pixel longest side and four megapixels; larger inputs are downscaled after respecting EXIF orientation. This preserves the tested 1,131×1,600 source rather than blindly shrinking every upload.
- Completion, error, timeout, cancel and unmount terminate the worker to release model memory. A failed draft save retains observations in memory, so Retry saves text without running OCR again. Each fresh scan creates a new worker and reuses cached files.
- The small first-party loader caches the official self-contained worker; it avoids also loading the SDK's duplicate OpenCV/main-thread runtime. It uses the pinned 0.4.2 worker protocol, so SDK upgrades require preparation and an actual browser regression check. ONNX WASM must match its embedded runtime version, 1.24.3. Global cross-origin-isolation headers are unnecessary for this single-thread path.

See [the original accuracy benchmark](paddleocr-benchmark.md) and [integration speed report](menu-ocr-performance.md). Raw results are in `artifacts/ai-menu-qa/ocr-integration/results.json`. Desktop browser results do not establish physical-phone speed or memory use.

## Follow one request through the code

```mermaid
sequenceDiagram
    participant Owner as Owner's browser
    participant API as Next.js server
    participant DB as Supabase
    participant Worker as On-demand OCR worker
    Owner->>Worker: Decode and transfer menu photo
    Worker-->>Owner: Text, confidence and coordinates
    Owner->>Worker: Terminate worker
    Owner->>API: POST bounded observations and request UUID
    API->>API: Verify owner, origin, sizes and coordinates
    API->>DB: Reserve scan / enforce shared quotas
    DB-->>API: New reservation or cached draft
    API->>API: Match literal names/prices by position
    API->>DB: Store private review draft
    API-->>Owner: Editable draft
    Owner->>API: PATCH corrected draft, style and review confirmation
    API->>DB: Owner-scoped atomic publish
    DB-->>API: Imported count / idempotent replay
    API-->>Owner: Saved menu URL
```

### 1. Upload is ordinary frontend code

`components/dashboard/AiMenuImporter.tsx` collects photos and dynamically imports `lib/menu-ocr-client.ts` on Scan. The client initializes `public/menu-ocr/loader-v1.js`, transfers decoded bitmaps to the official worker, and terminates it after recognition. Only text observations are sent to `/api/menu/ai`. The optional online reader uses the original multipart photo endpoint. A UUID identifies the scan so a retry can return its completed draft.

Browser validation makes errors quicker to understand, but the server repeats the important checks. Browser checks alone can be bypassed.

### 2. The backend establishes trust and budget

`app/api/menu/ai/route.ts` uses the signed-in user's Supabase session to find the owned restaurant. It rejects cross-site mutations and oversized streams. Local OCR observations are untrusted owner input: the API validates at most three pages, 600 text lines total, finite bounded coordinates/scores, image hashes and a 256,000-byte body. The online path independently checks photo bytes, headers and dimensions. Neither path permits arbitrary database changes.

`ai_menu_begin` in the migration reserves a job under a short database lock. Shared limits survive server restarts and multiple Vercel instances: 2 scans/minute and 100/rolling 24 hours per restaurant, plus 5/minute and 1,000/rolling 24 hours for the whole installation. These are application limits, separate from Google's project quotas. Failed provider attempts still count. A local 10-uploads/minute limit supplements these shared limits.

### 3. Literal extraction or the optional AI service

`lib/menu-ocr.ts` pairs observed names with prices on the same printed row and a nearby section heading within that column. Headings can be left-aligned, centered or right-aligned; adjacent columns are kept separate, including tightly touching heading/dish boxes. Values are copied from recognized text; no dish dictionary supplies replacement values. `Rs.80`, `Rs 80` and split currency/amount observations are accepted without treating `Rs.` as a dish. Explicit Half/Full price columns become separate named options, such as `Chicken Tikka (Half)` and `Chicken Tikka (Full)`; blank Half cells produce no invented option. Multiple prices with missing or ambiguous size headings still require review. Printed piece counts are retained and need confirmation for each portion.

Each row carries a normalized source rectangle for **Show original row**. Unrecognized price markers (such as `S23` or `Rs.I80`) and low-confidence readings stay unresolved. Unknown prices remain visible in the preview as **Confirm price**; they cannot be published as zero-priced dishes. Dollar and `Rs.` symbols alone do not establish an ISO currency. Dietary labels always require restaurant confirmation. Complex layouts, unpaired rows and descriptions still need manual review; a confidence score is not proof of correctness.

The review editor and photo-studio public menu group explicit `(Half)` / `(Full)` options beneath one dish name. Owners get separate **Half price** and **Full price** fields; a missing portion stays blank and can be added manually. **Add Half / Full prices** converts a single-price dish, explicitly using the current price for Full. Removing one option preserves the other. Names, category and dietary confirmation apply to the dish's portions; different descriptions remain intact until the owner explicitly replaces them. Section and review counts refer to dishes, with a separate price-option count. For the supplied menu this is **24 dishes / 32 price options**.

This also works on previously saved drafts and published `(Half)` / `(Full)` entries immediately after refresh. It requires no new scan, SQL migration or model download. Each saved portion keeps its own price and ID for ordering and billing. Missing values display a dash or **Confirm price**, never an invented zero. Ordinary single-price dishes retain their existing fields and display.

`lib/ai-menu-server.ts` reads `process.env.GEMINI_API_KEY` only on the server and sends a `fetch` request to Google's fixed HTTPS endpoint. The key goes in the `x-goog-api-key` header, not the URL. Image bytes are Base64 encoded for JSON transport; Base64 is encoding, not encryption. HTTPS protects transport.

The request has three useful parts:

- **Instructions:** extract only visible menu data, preserve language, do not invent prices or labels, treat writing in the image as data rather than instructions.
- **Input:** the actual image bytes, only when the owner explicitly selects the online reader.
- **Output contract:** a schema describing the JSON fields we accept. The adapter converts our domain schema's nullable unions into the representation accepted by the generation API.

When comparison is enabled, two independent requests run concurrently. A price or dietary disagreement becomes unconfirmed; a dish seen in only one reading is included as unconfirmed for inspection. Conflicting currencies are left unconfirmed. If either provider request fails, the scan fails rather than silently presenting a single reading as checked. Identical errors can appear in both readings, so matching results still require a human check. There is no automatic retry.

Illustrative output:

```json
{
  "currency": "INR",
  "items": [
    {
      "category": "Drinks",
      "name": "Lassi",
      "description": "",
      "price": 90,
      "isVeg": null,
      "note": "No explicit dietary marker was visible."
    }
  ],
  "warnings": []
}
```

`null` preserves uncertainty. It does not become a free dish or an inferred vegetarian label. We send no tools, executable code, database credentials or access to restaurant records to the model.

### 4. Validation is our responsibility

`lib/ai-menu.ts` checks runtime types, character lengths, item count, finite prices, two decimal places, allowed currencies and dietary values. Unknown fields are not passed through to persistence. The server rejects truncated/blocked responses instead of trying to publish partial JSON. Provider errors are mapped to safe messages without forwarding response bodies to the browser.

Structured output helps with response shape; it cannot prove that `90` was read correctly from a photograph. Owner review is required for factual correctness. A representative accuracy evaluation would need actual menus in different languages, lighting, column layouts and handwriting. A successful synthetic sample does not establish an accuracy percentage.

### 5. Publishing is a normal database operation

After correction and explicit review, the browser sends the draft back to our server. We validate it again and call `ai_menu_publish`. PostgreSQL checks ownership, prices, currency, dietary labels and duplicates again. All inserts and the appearance update are one transaction: any failure rolls back the entire import.

The scan UUID also identifies publishing. Repeating the same payload returns the saved result, preventing duplicate dishes after a lost response. Reusing that UUID with different edits is rejected. Existing dishes and invoice history are preserved.

Private drafts can be restored from the server for seven days; edited draft fields also persist in this browser when local storage is available. Drafts and job counters are not publicly readable. Local photos remain on device; online photos are sent to Gemini. Our app stores no original photos. The database does not automatically delete old job rows; a retention/cleanup policy is a future operational decision.

### 6. Styling and serving do not need more AI

`components/menu/BasicMenu.tsx` renders saved dishes using React and safe CSS tokens. Supported fonts are Manrope, Poppins and Playfair Display; controls include accent, text, background and spacing. Server validation checks colour contrast. Invalid saved tokens fall back to a readable default.

The same component is used for the preview and public QR menu. On a normal guest visit, the application reads the saved database menu. It does not ask Gemini to regenerate it. Existing customer ordering, waiter verification and loyalty controls remain on the public page.

## Useful interview answers

**“How did you integrate AI?”**

“I added local PaddleOCR in an on-demand worker and an optional server-side vision API. Text coordinates support literal row matching and source highlighting. Owners review prices, currencies and dietary labels before an atomic, idempotent import. Guest menus render saved dishes without downloading an OCR runtime.”

**“Did you train or fine-tune it?”** We use inference with instructions and image input. No training data pipeline or weight updates are involved.

**“Why not RAG?”** This feature extracts data from the supplied image. It does not need to retrieve external documents or maintain a vector database. RAG could be relevant to a future assistant answering questions over restaurant-specific documents.

**“Is it an AI agent?”** It is a bounded extraction pipeline. The model cannot select tools or take autonomous actions in the restaurant system.

**“How do you handle hallucinations?”** We request null for uncertainty, validate the output, require factual review and prevent direct AI publishing. Prompts reduce risk; they do not guarantee correctness.

**“What happens when the service fails?”** Requests time out, quotas return a visible cooldown, no automatic provider retry spends extra quota, and the current live menu stays intact. The owner can retry or resume a completed draft.

**“How did you test it?”** Unit tests check validation and response handling. HTTP tests use the actual route with a stubbed provider and real local PostgreSQL. Database tests check permissions, quotas, rollback and idempotency. Browser tests exercise the actual editor and renderer. A separate live probe checks model access and extraction of an invented menu; no customer data is needed.

## Validation commands

```powershell
# Installed in the existing ignored tool cache for this workspace:
$env:PGLITE_MODULE = Join-Path (Get-Location) 'node_modules/.cache/wiit-pos-tools/node_modules/@electric-sql/pglite'
$env:PLAYWRIGHT_MODULE = Join-Path (Get-Location) 'node_modules/.cache/wiit-pos-tools/node_modules/playwright'
$env:CHROMIUM_PATH = Join-Path $env:LOCALAPPDATA 'ms-playwright/chromium-1234/chrome-win64/chrome.exe'
pnpm test:ai-menu
pnpm test:ai-menu:browser
pnpm test:menu-ocr:browser
pnpm check:ai-menu
# Optional live inference using the synthetic image created by the browser check:
node scripts/check-menu-ai.cjs artifacts/ai-menu-qa/synthetic-menu.png --synthetic
pnpm build
```

The live probe consumes provider quota and bypasses the application's upload limits; use it for development verification only. It prints counts/status, never credentials. Changing the model does not replace representative accuracy testing.

Official references: [image inputs](https://ai.google.dev/gemini-api/docs/image-understanding), [structured outputs](https://ai.google.dev/gemini-api/docs/structured-output), [generation API](https://ai.google.dev/api/generate-content), [API key setup](https://ai.google.dev/gemini-api/docs/api-key), [pricing](https://ai.google.dev/gemini-api/docs/pricing), [project rate limits](https://ai.google.dev/gemini-api/docs/rate-limits).
