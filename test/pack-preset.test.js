'use strict'
// Preset ids: "<pack>:<name>" only; names follow the id rule at pack load, not at lookup.
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { loadPack, loadPreset } = require('../lib/pack')

const pluginDir = path.join(__dirname, '..')
const FIX = path.join(__dirname, 'fixtures', 'packs', 'demo')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pack-preset-'))
let failed = 0, passed = 0
const t = (name, fn) => { try { fn(); passed++ } catch (e) { failed++; console.log(`FAIL ${name}: ${e.message}`) } }

t('extra colon segment is an unknown preset', () => {
  assert.throws(() => loadPreset(pluginDir, root, { preset: 'demo:max:x', theme_dir: FIX }), /unknown preset/)
})
t('capitalised preset name is an unknown preset', () => {
  assert.throws(() => loadPreset(pluginDir, root, { preset: 'demo:Max', theme_dir: FIX }), /unknown preset/)
})
t('pack with a badly named preset is refused at load', () => {
  const dir = path.join(root, 'bad')
  const pack = JSON.parse(fs.readFileSync(path.join(FIX, 'theme.json'), 'utf8'))
  pack.presets.Max = pack.presets.max
  fs.mkdirSync(dir)
  fs.writeFileSync(path.join(dir, 'theme.json'), JSON.stringify(pack))
  assert.throws(() => loadPack(dir, pluginDir), /presets\.Max: .*must match/)
})

console.log(`${passed} passed${failed ? ', some FAILED' : ''}`)
process.exit(failed ? 1 : 0)
