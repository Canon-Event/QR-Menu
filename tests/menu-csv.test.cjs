const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

function loadTypeScriptModule(file) {
  const filename = path.resolve(file)
  const source = fs.readFileSync(filename, 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} }
  Function('exports', 'require', 'module', '__filename', '__dirname', output)(module.exports, require, module, filename, path.dirname(filename))
  return module.exports
}

const { parseCsv, readMenuCsv, writeMenuCsv } = loadTypeScriptModule('lib/menu-csv.ts')

test('CSV parser supports commas, newlines, and escaped quotes in quoted fields', () => {
  assert.deepEqual(parseCsv('title,description\r\n"Curry, large","Rich\nand ""spicy"""\r\n'), [
    ['title', 'description'],
    ['Curry, large', 'Rich\nand "spicy"'],
  ])
})

test('menu CSV accepts friendly header aliases and ignores blank rows', () => {
  assert.deepEqual(readMenuCsv('\uFEFFname,category name,desc,amount,veg,status\nDosa,Breakfast,Crisp,120,no,hidden\n,,,,,\n'), [{
    rowNumber: 2,
    title: 'Dosa',
    category: 'Breakfast',
    description: 'Crisp',
    price: '120',
    isVeg: 'no',
    isAvailable: 'hidden',
  }])
})

test('menu CSV requires a dish title column', () => {
  assert.throws(() => readMenuCsv('category,price\nMains,200'), /title.*name/i)
})

test('CSV export quotes values and neutralizes spreadsheet formulas', () => {
  assert.equal(writeMenuCsv([['title', 'description'], ['=2+2', 'A "quoted" dish']]), '"title","description"\r\n"\'=2+2","A ""quoted"" dish"')
})
