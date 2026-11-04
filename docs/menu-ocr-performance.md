# Menu OCR integration: performance check

Measured 2026-11-01 on the same Windows/Ryzen 5 5600H desktop as the [accuracy benchmark](paddleocr-benchmark.md). Headless Chromium ran the actual React importer, official PaddleOCR worker, PP-OCRv6 small models, API route and local PostgreSQL. The original 1,131×1,600 Canva preview was used. No OCR response or provider response was substituted.

| Check | Observed result |
|---|---|
| Open importer and select photo | Zero OCR requests or workers |
| First complete OCR pass | 9.10 s; 64.48 MiB of static assets |
| Retry after failed draft save | 0.078 s; observations reused, no OCR worker |
| Fresh scan with cached assets | 8.24 s; zero OCR network requests |
| Main-thread 16 ms heartbeat during first scan | Largest observed gap 17.8 ms |
| Names, prices and categories | All 15 exact rows, five per section |
| Data posted to save draft | 3,846 bytes of JSON; no image bytes |
| Worker after completion/cancel/unmount | Terminated |
| Guest renderer | Zero OCR requests or workers |
| Provider calls in local mode | Zero |

First-scan timing uses **local HTTP**, so it does not estimate downloading 65 MiB over a real customer's connection. No bandwidth or CPU throttling was applied. The heartbeat is a responsiveness observation, not a Core Web Vitals measurement. Physical-phone speed, battery and peak memory have not been measured. The earlier standalone test showed substantial browser memory use, so the online reader remains an explicit option for constrained owner devices.

The worker caches vendor JavaScript, model archives and WASM under versioned URLs. Cache writes finish before initialization continues: terminating the worker promptly can otherwise interrupt an outstanding large WASM write. JavaScript module loading also benefits from normal HTTP caching. Browsers may evict caches; unavailable storage degrades to network loading. Completion and cancellation release the worker rather than retaining model sessions between scans.

The app's public menus render saved database rows and existing CSS. OCR assets are prepared as static files at build time, outside Next's page bundles. The lightweight client adapter is dynamically imported from the owner's Scan action. The production build passed; neither guest nor initial owner chunks contain the OCR runtime/worker protocol. The separate adapter chunk is 5,846 bytes before compression. Production inspection is recorded in `artifacts/ai-menu-qa/ocr-integration/production-bundles.json`.

Reproduce after preparing assets with `node scripts/prepare-menu-ocr.cjs`, then run `pnpm test:menu-ocr:browser`. Supply a benchmark JPEG path as the first argument to `node tests/menu-ocr-browser-qa.cjs` if the original ignored artifact is unavailable. Playwright, Chromium and PGlite must be available, as described in [setup](ai-menu-integration.md). Results and source-review screenshots are written under `artifacts/ai-menu-qa/ocr-integration/`.

## Centered headings regression — 2026-11-01

A second supplied menu exposed a layout-matching bug: its four headings were all read correctly by OCR, but the parser required headings to start near dish names. Centered/right-aligned `SIDES`, `DRINKS` and `ENTREES` therefore became `General` (20 rows); only `DESSERT` matched (5 rows).

Heading matching now uses the horizontal span from dish name to price, allowing headings anywhere inside that column. It rejects headings belonging to neighboring columns and oversized titles, then selects the nearest eligible heading above the row. Mixed-case `Entrées` is supported as well. It uses existing text coordinates, with no extra model initialization, OCR pass, provider request or customer bundle dependency.

Actual browser inference on the 535×693 user-supplied image now returns all 25 exact name/price pairs under **SIDES 7, DRINKS 6, DESSERT 5, ENTREES 7**. Repeated names in Sides and Entrees remain separate dishes. The supplied WebP was converted losslessly to PNG for the existing PNG/JPEG uploader; no sharpening, enlargement or text replacement was performed. Cached scanning took 9.61 s on this desktop, with zero OCR network requests. Matching already-recognized observations took a median 0.28 ms across 250 calls; this is parser timing, separate from recognition.

The observed text/coordinates are a checked-in regression fixture at `tests/fixtures/menu-ocr-four-sections.json`. Expected data is separate at `scripts/ocr-benchmark/expected-four-sections.json`. To run the actual browser check on a matching local PNG/JPEG:

```powershell
$env:OCR_QA_OUTPUT = 'artifacts/ai-menu-qa/ocr-four-sections'
node tests/menu-ocr-browser-qa.cjs <image.png> scripts/ocr-benchmark/expected-four-sections.json
```

Saved drafts retain their stored category values. Start a new scan to apply the corrected matching; this change does not rewrite existing drafts or published dishes.

## Rupee notation and Half/Full columns — 2026-11-01

The third supplied image (`images (1).jpg`, 466×659) contains 24 distinct dish rows and 32 printed prices across four sections. The old parser did not accept `Rs.` currency notation. A split `Rs.` + `80` observation could also mistake the currency prefix for a dish. Multiple prices previously became one unresolved row, and `HALF`/`FULL` could be mistaken for section headings.

The corrected parser recognizes literal rupee-prefix formats, excludes standalone currency tokens from name matching, and associates each price with explicitly observed Half/Full columns. It returns **SOUP 3, NON VEG SOUP 3, TANDOORI SNACKS 14, CHINESE STARTERS 12** named options. It creates no missing Half prices. Unlabeled or repeated size headings still leave prices unresolved. Heading centers support tight bounding boxes that touch the first dish. Portion headings are matched once per page; no additional OCR model pass or provider call is needed.

This low-resolution image does **not** yield perfect raw OCR. Veg Manchow's printed 80 has a recognition score of 0.832 and is left unconfirmed. Observed spelling errors include `Crispy Com`, `Chicken Lolipop`, `Afgani` instead of `Afghani`, and an accented `Tandoorí`; the app preserves these for review instead of silently rewriting them. The evaluation retains a separate human transcription and records these exceptions explicitly. Before manual correction, 26/32 size options have exact source names and prices; all 32 rows have their correct section and portion, 31 prices are supported, and one needs confirmation. Currency and every dietary label remain unconfirmed.

The real-browser check corrects the recorded spelling errors using the separate transcription, confirms the price/currency/dietary fields as simulated owner input, and publishes all 32 options through the actual API and isolated PostgreSQL transaction. It checks that uncertain-price rows remain visible in the preview as **Confirm price**, not zero. These checks do not publish anything to the hosted restaurant database. Cache reuse, worker cleanup and zero guest OCR downloads remain covered.

Actual observations: `tests/fixtures/menu-ocr-half-full.json`. Source transcription and recorded reading differences: `scripts/ocr-benchmark/expected-half-full.json`. Raw results and the review sheet are in `artifacts/ai-menu-qa/ocr-half-full/`.

```powershell
$env:OCR_QA_OUTPUT = 'artifacts/ai-menu-qa/ocr-half-full'
node tests/menu-ocr-browser-qa.cjs 'C:/path/to/images (1).jpg' scripts/ocr-benchmark/expected-half-full.json
```

## Half/Full editing and customer display

Half and Full now appear as labeled prices under one dish in the editor preview and photo-studio public menu. The owner editor has independently editable **Half price** / **Full price** inputs, manual portion creation/removal and one shared dish name. The same saved 32 options render as 24 dishes, including 10 Tandoori dishes and eight Chinese starters. Existing saved suffixes are recognized by the pure `lib/menu-portions.ts` helper; no OCR rerun, database migration or additional network request is required to display them. Ordering continues to receive all original option IDs and prices.

Checks cover editing both prices, restoring them after reload, adding/removing a missing Half without altering Full, converting a single-price dish, incomplete names, publishing all 32 values, and both prices remaining visible across five presets at 320/390/768/1440 pixels. The screenshots `artifacts/ai-menu-qa/half-full-editor.png` and `half-full-public-390.png` show the explicit fields and customer view. The OCR-backed browser harness also checks the grouped editor against the actual API and isolated PostgreSQL transaction.
