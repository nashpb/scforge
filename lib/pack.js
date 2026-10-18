'use strict'
const fs = require('fs')
const path = require('path')
const { deepMerge } = require('./schema')

const ID = /^[a-z][a-z0-9-]*$/
const TOP = ['id', 'disclaimer', 'captain', 'roles', 'councils', 'presets', 'mascot']
const PRESET_KEYS = ['persona', 'theme', 'mascot']
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v)

// A pack is <theme_dir>/theme.json, or <root>/.<name>/themes/<theme>/theme.json once installed.
// Checks the id itself: callers may skip validate(), and the id becomes a path segment.
function findPack(root, user) {
  if (!ID.test(user.theme)) throw new Error(`theme ${JSON.stringify(user.theme)}: must match ${ID}`)
  if (user.theme_dir) return path.resolve(root, user.theme_dir)
  return path.join(root, `.${user.name || 'scforge'}`, 'themes', user.theme)
}

function checkChar(c, at, bad) {
  if (!isObj(c)) return bad(`${at}: must be an object`)
  if (!ID.test(c.character)) bad(`${at}.character: must match ${ID}`)
  for (const k of ['display', 'soft', 'hard']) {
    const v = c[k]
    if (typeof v !== 'string' || !v.trim()) bad(`${at}.${k}: must be a non-empty string`)
    else if (/[\r\n]/.test(v)) bad(`${at}.${k}: must be one line`)
    else if (v.length > 1200) bad(`${at}.${k}: must be at most 1200 characters`)
  }
}

function loadPack(dir, pluginDir) { // eslint-disable-line no-unused-vars
  const file = path.join(dir, 'theme.json')
  if (!fs.existsSync(file)) throw new Error(`theme pack not found: ${file}`)
  const pack = JSON.parse(fs.readFileSync(file, 'utf8'))
  const bad = m => { throw new Error(`theme pack ${file}: ${m}`) }
  if (!isObj(pack)) bad('must be an object')
  for (const k of Object.keys(pack)) if (!TOP.includes(k)) bad(`${k}: unknown key`)
  if (!ID.test(pack.id)) bad(`id: must match ${ID}`)
  if (typeof pack.disclaimer !== 'string') bad('disclaimer: must be a string')
  checkChar(pack.captain, 'captain', bad)
  if (!isObj(pack.roles)) bad('roles: must be an object')
  for (const [r, c] of Object.entries(pack.roles)) checkChar(c, `roles.${r}`, bad)
  if (!isObj(pack.councils)) bad('councils: must be an object')
  const str = (v, at) => { if (typeof v !== 'string' || !v.trim() || /[\r\n]/.test(v)) bad(`${at}: must be a non-empty one-line string`) }
  const pc = pack.councils['product-council'], dc = pack.councils['decision-council']
  if (!isObj(pc)) bad('councils.product-council: must be an object')
  str(pc.name, 'councils.product-council.name')
  if (!isObj(dc)) bad('councils.decision-council: must be an object')
  str(dc.name, 'councils.decision-council.name')
  str(dc.chair, 'councils.decision-council.chair')
  if (!isObj(dc.seats)) bad('councils.decision-council.seats: must be an object')
  for (const [s, c] of Object.entries(dc.seats)) str(c, `councils.decision-council.seats.${s}`)
  if (!Array.isArray(dc.never_sits)) bad('councils.decision-council.never_sits: must be an array')
  dc.never_sits.forEach((c, i) => str(c, `councils.decision-council.never_sits[${i}]`))
  for (const [n, p] of Object.entries(pack.presets || {})) {
    if (!isObj(p)) bad(`presets.${n}: must be an object`)
    for (const k of Object.keys(p)) if (!PRESET_KEYS.includes(k)) bad(`presets.${n}.${k}: a pack preset may only set ${PRESET_KEYS.join(', ')}`)
  }
  return pack
}

// "lite" is built in; "<pack>:<name>" is the lite base plus that pack's preset.
function loadPreset(pluginDir, root, user) {
  const id = user.preset || 'lite'
  const lite = JSON.parse(fs.readFileSync(path.join(pluginDir, 'presets', 'lite.json'), 'utf8'))
  if (id === 'lite') return lite
  const [theme, name] = id.split(':')
  if (!name) throw new Error(`unknown preset ${id}`)
  // theme_dir holds the configured theme's pack; a preset from another pack loads from its installed location.
  const dir = findPack(root, { ...user, theme, theme_dir: !user.theme || user.theme === theme ? user.theme_dir : undefined })
  const pack = loadPack(dir, pluginDir)
  if (pack.id !== theme) throw new Error(`preset ${id}: pack in ${dir} has id ${pack.id}, not ${theme}`)
  const p = Object.hasOwn(pack.presets || {}, name) && pack.presets[name]
  if (!p) throw new Error(`theme pack ${theme} has no preset ${name}`)
  return deepMerge(lite, p)
}

module.exports = { findPack, loadPack, loadPreset }
