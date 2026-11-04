# Standalone PaddleOCR.js benchmark

This harness does not import or modify application code, database records or the Gemini integration. Expected answers are read only by the Node evaluator after inference.

Install the pinned benchmark dependencies in the ignored tool cache:

```powershell
npm install --prefix node_modules/.cache/paddleocr-benchmark --no-save --no-audit --no-fund @paddleocr/paddleocr-js@0.4.2 vite@6.4.1 onnxruntime-web@1.24.3 --cache node_modules/.cache/ocr-npm
```

ONNX Runtime 1.24.3 matches the runtime bundled inside SDK 0.4.2's worker. Mixing its worker with another version's WASM binaries can fail.

Place the matching Canva preview in `artifacts/ai-menu-qa/paddleocr/borcelle-canva-1131.jpg`, or set `OCR_IMAGE` to its absolute path. The source is recorded in `expected-borcelle.json`. This expected file is specific to that image; do not reuse its accuracy labels for other menus.

```powershell
node scripts/ocr-benchmark/run.cjs
node scripts/ocr-benchmark/write-report.cjs
```

The default compares PP-OCRv6 small and PP-OCRv5 mobile at 1131×1600 and 566×800, using a browser worker and single-thread CPU/WASM. Each case has three timing trials. Physical-phone performance is not measured.

Set `OCR_MODEL=PP-OCRv6` to run one model. Optional `OCR_UPSCALE=2` downsizes to 566×800 first, then enlarges that low-resolution image; it does not substitute the high-resolution original. This writes a separate `results-upscale2.json`.

Artifacts, downloaded source images and model packages remain under ignored directories. `REPORT.md`, `report.html`, `results.json` and screenshots are generated in `artifacts/ai-menu-qa/paddleocr/`.

The small geometry parser is benchmark code, not a production menu parser. It intentionally leaves unsupported price symbols unmatched instead of silently changing them. The report distinguishes raw name recognition from names/prices/categories paired by this parser.
