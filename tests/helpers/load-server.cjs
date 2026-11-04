const fs = require('node:fs'), path = require('node:path'), ts = require('typescript')
function loadServer(file, overrides = {}, env = {}, cache = new Map()) {
  const filename = path.resolve(/\.tsx?$/.test(file) ? file : fs.existsSync(file + '.ts') ? file + '.ts' : file + '.tsx')
  if (cache.has(filename)) return cache.get(filename).exports
  const module = { exports: {} }; cache.set(filename,module)
  const code = ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText
  Function('module','exports','require','process',code)(module,module.exports,name => {
    if(name==='server-only') return {}
    if(name in overrides) return overrides[name]
    if(name.startsWith('@/')) return loadServer(name.slice(2),overrides,env,cache)
    if(name.startsWith('.')) return loadServer(path.resolve(path.dirname(filename),name),overrides,env,cache)
    return require(name)
  },{env})
  return module.exports
}
module.exports={loadServer}
