# PaddleOCR.js menu benchmark — 2026-10-31

The standalone benchmark ran actual PaddleOCR.js inference on the [Borcelle Canva template](https://www.canva.com/templates/EAGF12S9HtA-yellow-and-black-restaurant-food-menu/). Application code, the importer, its dependencies and database records were not changed for this benchmark.

The [public preview](https://marketplace.canva.com/EAGF12S9HtA/1/0/1131w/canva-yellow-and-black-restaurant-food-menu-ohRNgqoJW40.jpg) is 1131×1600 and 678,152 bytes. SHA-256: `8d5b09aa824d14a233b54fa6c8622c076abc0a0b2b960d559a7f6ab490485e89`. A 566×800 version was resized from that preview; it is not the original chat upload's binary.

Runtime: `@paddleocr/paddleocr-js` 0.4.2, bundled-worker-compatible ONNX Runtime WASM 1.24.3, one CPU thread in a browser worker, headless Chromium. Hardware: AMD Ryzen 5 5600H, 12 logical CPUs, 7.3 GiB OS-visible RAM, Windows x64. Three timing trials per case; accuracy below is the first trial. Expected answers were supplied only to the evaluator after inference.

| Model | Input | Exact dish + price + symbol pairs | All three headings | Warm median |
|---|---|---|---|---|
| PP-OCRv6 small | 1131×1600 | 15/15 | Yes | 6.59 s |
| PP-OCRv6 small | 566×800 | 14/15 | Yes | 4.66 s |
| PP-OCRv5 mobile | 1131×1600 | 14/15 | Yes | 5.73 s |
| PP-OCRv5 mobile | 566×800 | 15/15 | Yes | 4.95 s |

All 15 names were read exactly in these four cases. Each supported pair was assigned to the correct category. No extra menu rows were produced by the benchmark geometry parser. Matching ignores letter case and repeated whitespace, not spelling or currency-symbol errors.

PP-OCRv6 at 566×800 read the Iced Coffee price `$23` as `S23`, with a recognition score of about 0.959. The parser rejected that unsupported symbol instead of changing it. PP-OCRv5 at full size did not produce an exact supported pair for Fruit Salad. This demonstrates why a high OCR score alone is insufficient for publishing a price.

Initial runtime transfer was approximately 11 MiB. PP-OCRv6 initialization added approximately 53.7 MiB of transfers in the development harness, including 29.8 MiB of model files, and took 11.09 seconds. PP-OCRv5 initialization used 44.5 MiB, including 20.5 MiB of model files, and took 7.77 seconds. These development-transfer counts are not optimized production bundle sizes.

Summed browser process working-set snapshots were approximately 1.1 GiB after scans, against approximately 484 MiB after initial page load. They include browser overhead and may double-count shared pages; they are not pure OCR memory or a peak-memory measurement. No physical phone was connected. Phone-viewport screenshots run on this PC and establish no mobile speed or memory result.

Earlier exploratory 566×801 runs and a 2× enlargement trial are retained in the ignored artifacts. In that enlargement trial, the small-image `S23` error remained, while scanning took longer. Resizing should be benchmarked, not assumed to improve recognition.

PaddleOCR is a viable candidate on this example. Neither tested model dominated at both sizes, and one menu cannot establish general accuracy. A production design should preserve source quality, keep row/price evidence, flag unsupported or incomplete pairs, and load/cache the runtime only during owner imports. Test additional layouts and a physical phone before choosing browser-only deployment.

Reproduce with [the standalone harness](../scripts/ocr-benchmark/README.md). The raw results, annotated visual audit and detailed methodology are generated under ignored `artifacts/ai-menu-qa/paddleocr/` as `results.json`, `report.html` and `REPORT.md`.
