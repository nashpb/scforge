#!/usr/bin/env node
'use strict'
// Usage: nashworks-round gates [--reset] | locked <red-sha> | flip <verdict.json> [--root DIR]
// Deterministic round steps; the start command calls these and the LLM roles do the rest.
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { validate } = require('../lib/schema')
const { resolve } = require('../lib/resolve')
const { factoryRoot } = require('../lib/paths')
const { runGates, decide, lockedViolations, flipPasses } = require('../lib/round')

const argv = process.argv.slice(2)
const opt = f => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : null)
const pluginDir = path.resolve(__dirname, '..')
const TEST_GLOBS = ['test/**', 'tests/**', '**/*.test.*', '**/*.spec.*']

function main() {
  const [cmd, arg] = argv
  const root = opt('--root') ? path.resolve(opt('--root')) : factoryRoot(process.cwd())
  const nw = path.join(root, '.nashworks')
  const readJson = f => JSON.parse(fs.readFileSync(f, 'utf8'))
  if (cmd === 'gates') {
    const cfgFile = path.join(nw, 'config.json')
    const user = fs.existsSync(cfgFile) ? readJson(cfgFile) : {}
    const schema = readJson(path.join(pluginDir, 'config.schema.json'))
    const invalid = validate(schema, user)
    if (invalid.length) throw new Error(`config: ${invalid.join('; ')}`)
    const preset = readJson(path.join(pluginDir, 'presets', `${user.preset || 'lite'}.json`))
    const { config } = resolve(user, { schema, preset })
    const stateFile = path.join(nw, 'state', 'round.json')
    const prev = !argv.includes('--reset') && fs.existsSync(stateFile) ? readJson(stateFile) : { fixRounds: 0, seen: [] }
    const gates = runGates(config.gates.commands, process.cwd())
    const { next, state } = decide(gates, prev)
    fs.mkdirSync(path.dirname(stateFile), { recursive: true })
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2))
    console.log(JSON.stringify({ next, gates }))
    return next === 'judge' ? 0 : 1
  }
  if (cmd === 'locked') {
    if (!arg) throw new Error('locked needs the red commit sha')
    const changed = execFileSync('git', ['diff', '--name-only', `${arg}..HEAD`], { encoding: 'utf8' }).split('\n').filter(Boolean)
    const bad = lockedViolations(changed, TEST_GLOBS)
    console.log(JSON.stringify({ violations: bad }))
    return bad.length ? 1 : 0
  }
  if (cmd === 'flip') {
    if (!arg) throw new Error('flip needs a verdict json file')
    const file = path.join(nw, 'state', 'features.json')
    fs.writeFileSync(file, JSON.stringify(flipPasses(readJson(file), readJson(arg)), null, 2))
    return 0
  }
  throw new Error('usage: nashworks-round gates [--reset] | locked <red-sha> | flip <verdict.json>')
}

try {
  process.exitCode = main()
} catch (e) {
  console.error(e.message)
  process.exitCode = 2
}
