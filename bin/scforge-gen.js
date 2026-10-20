#!/usr/bin/env node
'use strict'
// Usage: scforge-gen [--root DIR] [--name NAME] [--dry-run] [--uninstall] [--detect] [--require-test] [--confirm-persona]
const fs = require('fs')
const path = require('path')
const { validate } = require('../lib/schema')
const { resolve } = require('../lib/resolve')
const { generate, uninstall } = require('../lib/generate')
const { factoryRoot } = require('../lib/paths')
const { detect } = require('../lib/detect')
const { loadPreset } = require('../lib/pack')

const argv = process.argv.slice(2)
const opt = f => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : null)
const pluginDir = path.resolve(__dirname, '..')
const name = opt('--name') || 'scforge'
const dryRun = argv.includes('--dry-run')

function main() {
  const root = opt('--root') ? path.resolve(opt('--root')) : factoryRoot(process.cwd())
  if (argv.includes('--detect')) {
    console.log(JSON.stringify(detect(root)))
    return 0
  }
  let result
  if (argv.includes('--uninstall')) {
    result = uninstall(root, name, { dryRun })
  } else {
    const file = path.join(root, `.${name}`, 'config.json')
    const user = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {}
    const schema = JSON.parse(fs.readFileSync(path.join(pluginDir, 'config.schema.json'), 'utf8'))
    const invalid = validate(schema, user)
    if (invalid.length) {
      invalid.forEach(e => console.error(`config: ${e}`))
      return 1
    }
    const preset = loadPreset(pluginDir, root, user)
    const { config, fixes } = resolve(user, { schema, preset })
    if (config.name !== name) {
      console.error(`config: name "${config.name}" does not match folder .${name}; renaming the folder is not implemented yet`)
      return 1
    }
    if (argv.includes('--require-test') && !config.gates.commands.test) {
      console.error('config: gates.commands.test is empty; set a test command before setup')
      return 1
    }
    if ((config.persona.level === 'hard' || config.persona.override_rules) && !argv.includes('--confirm-persona')) {
      console.error('config: persona level hard or override_rules true needs --confirm-persona (an in-character agent can talk itself past a gate); nothing written')
      return 1
    }
    fixes.forEach(f => console.log(`${f.level}: ${f.message}`))
    result = generate(root, config, { pluginDir, dryRun })
  }
  result.warnings.forEach(w => console.log(`warn: ${w}`))
  const verb = dryRun ? 'would ' : ''
  result.actions.forEach(a => console.log(verb + a))
  if (!result.actions.length) console.log('no changes')
  return 0
}

try {
  process.exitCode = main()
} catch (e) {
  console.error(e.message)
  process.exitCode = 1
}
