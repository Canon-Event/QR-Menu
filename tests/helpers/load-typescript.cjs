const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const cache = new Map()
function loadTypeScript(file) {
  let filename = path.resolve(file)
  if (!path.extname(filename)) filename = ['.ts', '.tsx'].map(ext => filename + ext).find(candidate => fs.existsSync(candidate)) || filename
  if (cache.has(filename)) return cache.get(filename).exports
  const module = { exports: {} }
  cache.set(filename, module)
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText
  const resolve = name => name.startsWith('@/') ? loadTypeScript(name.slice(2)) : name.startsWith('.') ? loadTypeScript(path.resolve(path.dirname(filename), name)) : require(name)
  Function('exports', 'require', 'module', '__filename', '__dirname', output)(module.exports, resolve, module, filename, path.dirname(filename))
  return module.exports
}
module.exports = { loadTypeScript }
