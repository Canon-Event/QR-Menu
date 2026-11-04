import { PaddleOCR } from '@paddleocr/paddleocr-js'

let ocr = null
const status = text => { document.getElementById('status').textContent = text }
window.benchmark = {
  async initialize(model) {
    if (ocr) { await ocr.dispose(); ocr = null }
    status(`Loading ${model}…`)
    const start = performance.now()
    ocr = await PaddleOCR.create({
      lang: 'en', ocrVersion: model, worker: true,
      ortOptions: { backend: 'wasm', wasmPaths: '/ort/', numThreads: 1, simd: true },
    })
    return { initMs: performance.now() - start, summary: ocr.getInitializationSummary() }
  },
  async recognize(width, upscale = 1, height) {
    status(`Recognizing at ${width || 'original'} pixel width…`)
    const photo = await createImageBitmap(await (await fetch('/source-image')).blob())
    const canvas = document.getElementById('source')
    canvas.width = width || photo.width; canvas.height = height || Math.round(photo.height * canvas.width / photo.width)
    canvas.getContext('2d').drawImage(photo, 0, 0, canvas.width, canvas.height); photo.close()
    let input = canvas
    if (upscale > 1) {
      input = document.createElement('canvas'); input.width=canvas.width*upscale; input.height=canvas.height*upscale
      const drawing=input.getContext('2d');drawing.imageSmoothingQuality='high';drawing.drawImage(canvas,0,0,input.width,input.height)
    }
    const blob = await new Promise(resolve => input.toBlob(resolve, 'image/png'))
    const start = performance.now(), [result] = await ocr.predict(blob)
    const wallMs = performance.now() - start
    document.getElementById('output').textContent = JSON.stringify(result, null, 2)
    status(`${result.items.length} recognized lines in ${(wallMs / 1000).toFixed(2)} s`)
    return { ...result, originalInput: {width:canvas.width,height:canvas.height},upscale,wallMs, jsHeapBytes: performance.memory?.usedJSHeapSize ?? null }
  },
  async dispose() { if (ocr) await ocr.dispose(); ocr = null },
}
status('Ready.')
