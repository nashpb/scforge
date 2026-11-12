#!/usr/bin/env node
'use strict'
// Usage: scforge-round gates [--reset] | locked <red-sha> | flip <verdict.json> | event <kind> [json] | guard [<red-sha>] | secrets [--staged] [<base>] [--root DIR]
// Deterministic round steps; the start command calls these and the LLM roles do the rest.
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { validate } = require('../lib/schema')
const { resolve } = require('../lib/resolve')
const { factoryRoot } = require('../lib/paths')
const { scanDiff } = require('../lib/secrets')
const { gateEvents, featureStartEvent, verdictEvent, suiteEvent, startEvent, endEvent, noteEvent, infoEvent, suiteEndEvent, append } = require('../lib/live')
const { runGates, decide, lockedViolations, guardReasons, flipPasses, checkVerdict } = require('../lib/round')

const argv = process.argv.slice(2)
const opt = f => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : null)
const pluginDir = path.resolve(__dirname, '..')
const TEST_GLOBS = ['test/**', 'tests/**', '**/*.test.*', '**/*.spec.*']

function main() {
  const [cmd, arg] = argv
  const root = opt('--root') ? path.resolve(opt('--root')) : factoryRoot(process.cwd())
  const nw = path.join(root, '.scforge')
  const readJson = f => JSON.parse(fs.readFileSync(f, 'utf8'))
  // Load, validate and resolve config once; live events go out only when live.enabled and a round id exists.
  const stateFile = path.join(nw, 'state', 'round.json')
  const loadConfig = () => {
    const cfgFile = path.join(nw, 'config.json')
    const user = fs.existsSync(cfgFile) ? readJson(cfgFile) : {}
    const schema = readJson(path.join(pluginDir, 'config.schema.json'))
    const invalid = validate(schema, user)
    if (invalid.length) throw new Error(`config: ${invalid.join('; ')}`)
    const preset = readJson(path.join(pluginDir, 'presets', `${user.preset || 'lite'}.json`))
    return resolve(user, { schema, preset }).config
  }
  const savedId = () => (fs.existsSync(stateFile) ? readJson(stateFile).roundId : undefined)
  const emitter = config => {
    const id = opt('--round') || savedId()
    if (!config.live.enabled || !id) return () => {}
    const reports = path.resolve(root, config.live.reports)
    return (...events) => events.forEach(e => append(reports, id, e))
  }
  if (cmd === 'gates') {
    const config = loadConfig()
    const roundId = opt('--round') || savedId()
    const prev = !argv.includes('--reset') && fs.existsSync(stateFile) ? readJson(stateFile) : { fixRounds: 0, seen: [] }
    const gates = runGates(config.gates.commands, process.cwd())
    const { next, state } = decide(gates, prev)
    const emit = emitter(config)
    for (const g of gates.results) emit(...gateEvents(g, g.code !== 0 && prev.fixRounds > 0 ? 'retry' : undefined))
    fs.mkdirSync(path.dirname(stateFile), { recursive: true })
    fs.writeFileSync(stateFile, JSON.stringify(roundId ? { ...state, roundId } : state, null, 2))
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
    let verdict
    try { verdict = readJson(arg) } catch (e) { throw new Error(`verdict: ${e.message}`) }
    const errs = checkVerdict(verdict)
    if (errs.length) throw new Error(`verdict: ${errs.join('; ')}`)
    fs.writeFileSync(file, JSON.stringify(flipPasses(readJson(file), verdict), null, 2))
    // live must never change flip's outcome: bad config just skips it
    let emit = () => {}
    try { emit = emitter(loadConfig()) } catch {}
    emit(featureStartEvent(verdict.feature), verdictEvent(verdict.feature, verdict.verdict === 'pass' ? 'pass' : 'fail', verdict.reason))
    return 0
  }
  if (cmd === 'event') {
    const kind = arg
    const b = argv[2] && !argv[2].startsWith('--') ? JSON.parse(argv[2]) : {}
    const stage = () => (b.phase === 'end'
      ? endEvent({ id: b.id, kind: b.kind || 'pass', ms: b.ms, text: b.text })
      : startEvent({ id: b.id, cls: 'stage', m: b.m, params: '', thread: 'main' }))
    const build = {
      suite: () => suiteEvent(b),
      stage,
      note: () => noteEvent(b.id, b.k, b.v),
      info: () => infoEvent(b.k, b.v),
      end: () => suiteEndEvent(b.name),
    }[kind]
    if (!build) throw new Error('event kind must be suite|stage|note|info|end')
    emitter(loadConfig())(build())
    return 0
  }
  if (cmd === 'guard') {
    const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 1 << 28 })
    const cfgFile = path.join(nw, 'config.json')
    const maxLines = (fs.existsSync(cfgFile) && readJson(cfgFile).review || {}).max_diff_lines || 300
    const reasons = guardReasons({
      diff: git('diff', '--cached', '-U0'),
      redChanged: arg && !arg.startsWith('--') ? git('diff', '--cached', '--name-only', arg).split('\n').filter(Boolean) : null,
      lockedGlobs: TEST_GLOBS,
      maxLines,
    })
    console.log(JSON.stringify({ reasons }))
    return reasons.length ? 1 : 0
  }
  if (cmd === 'secrets') {
    const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 1 << 28 })
    const base = argv.slice(1).find((a, i, v) => !a.startsWith('--') && v[i - 1] !== '--root')
    if (!argv.includes('--staged') && !base) {
      try { git('rev-parse', '--verify', '-q', 'main') } catch { throw new Error('branch main not found; pass <base> explicitly') }
    }
    const diff = argv.includes('--staged')
      ? git('diff', '--cached', '-U0')
      : git('diff', '-U0', base || git('merge-base', 'main', 'HEAD').trim())
    const findings = scanDiff(diff)
    console.log(JSON.stringify({ findings }))
    return findings.length ? 1 : 0
  }
  throw new Error('usage: scforge-round gates [--reset] | locked <red-sha> | flip <verdict.json> | event <suite|stage|note|info|end> [json] | guard [<red-sha>] | secrets [--staged] [<base>] [--round ID] [--root DIR]')
}

try {
  process.exitCode = main()
} catch (e) {
  console.error(e.message)
  process.exitCode = 2
}
