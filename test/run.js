'use strict'
// Assert-based self-check: schema validator, every resolver rule, generator, uninstall, worktree root.
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync, execFileSync } = require('child_process')
const { validate } = require('../lib/schema')
const { resolve } = require('../lib/resolve')
const { generate, uninstall } = require('../lib/generate')
const { factoryRoot } = require('../lib/paths')
const { detect } = require('../lib/detect')
const { findPack, loadPack, loadPreset } = require('../lib/pack')

const pluginDir = path.resolve(__dirname, '..')
const schema = JSON.parse(fs.readFileSync(path.join(pluginDir, 'config.schema.json'), 'utf8'))
const preset = JSON.parse(fs.readFileSync(path.join(pluginDir, 'presets', 'lite.json'), 'utf8'))
const FIX = path.join(__dirname, 'fixtures', 'packs', 'demo')
const tmpBase = process.env.SCFORGE_TEST_TMP || os.tmpdir()

let passed = 0
function t(title, fn) {
  try {
    fn()
    passed++
    console.log(`ok   ${title}`)
  } catch (e) {
    process.exitCode = 1
    console.error(`FAIL ${title}\n     ${e.message.split('\n').join('\n     ')}`)
  }
}

const res = user => resolve(user, { schema, preset })
const rules = r => r.fixes.map(f => f.rule)
const mkdir = () => fs.mkdtempSync(path.join(tmpBase, 'nw-'))
const put = (root, rel, text) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
  fs.writeFileSync(path.join(root, rel), text)
}
const get = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8')
const has = (root, rel) => fs.existsSync(path.join(root, rel))
function listFiles(root, dir = '') {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(d => {
    const rel = path.posix.join(dir, d.name)
    return d.isDirectory() ? listFiles(root, rel) : [rel]
  })
}
const snapshot = root => Object.fromEntries(listFiles(root).map(f => [f, get(root, f)]))
function gen(root, user = {}, opts = {}) {
  const r = res(user)
  assert.deepStrictEqual(r.errors, [])
  return generate(root, r.config, { pluginDir, ...opts })
}

// schema
t('schema: empty config and the lite preset are valid', () => {
  assert.deepStrictEqual(validate(schema, {}), [])
  assert.deepStrictEqual(validate(schema, preset), [])
})
t('schema: unknown key, bad enum and bad range are rejected', () => {
  assert.match(validate(schema, { parallel: { features: 2 } })[0], /unknown key/)
  assert.match(validate(schema, { roles: { sde: { effort: 'ultra' } } })[0], /must be one of/)
  assert.match(validate(schema, { compact: { threshold_pct: 0 } })[0], />= 1/)
  assert.match(validate(schema, { compact: { threshold_pct: 101 } })[0], /<= 100/)
  assert.match(validate(schema, { autonomy: { boundary: 'merge-main' } })[0], /must be one of/)
})

// resolver rules
t('resolver: invalid config returns errors and no config', () => {
  const r = res({ preset: 'max' })
  assert.strictEqual(r.config, null)
  assert.ok(r.errors.length)
})
t('resolver: precedence is user over preset over defaults', () => {
  const r = res({ roles: { sde: { effort: 'high' } } })
  assert.strictEqual(r.config.roles.sde.effort, 'high')
  assert.strictEqual(r.config.roles.sde.model, 'sonnet')
  assert.strictEqual(r.config.git.auto_commit, true)
  assert.strictEqual(r.config.autonomy.boundary, 'feature-branch')
})
t('resolver rule team-mode: team becomes subagent', () => {
  const r = res({ roles: { sde: { mode: 'team' } } })
  assert.strictEqual(r.config.roles.sde.mode, 'subagent')
  assert.ok(rules(r).includes('team-mode'))
})
t('resolver rule required-role: planner, sde and judge cannot be disabled', () => {
  const r = res({ roles: { planner: { enabled: false } } })
  assert.strictEqual(r.config.roles.planner.enabled, true)
  assert.ok(rules(r).includes('required-role'))
})
t('resolver rule judge-model: judge moves off the sde model', () => {
  assert.ok(!rules(res({})).includes('judge-model'))
  const r = res({ roles: { sde: { model: 'opus' } } })
  assert.strictEqual(r.config.roles.judge.model, 'sonnet')
  assert.ok(rules(r).includes('judge-model'))
  const both = res({ roles: { sde: { model: 'haiku' }, judge: { model: 'haiku' } } })
  assert.strictEqual(both.config.roles.judge.model, 'opus')
})
t('resolver rule red-test-sde: noted only while the sdet is off', () => {
  assert.ok(rules(res({})).includes('red-test-sde'))
  assert.ok(!rules(res({ roles: { sdet: { enabled: true } } })).includes('red-test-sde'))
  assert.ok(!rules(res({ gates: { red_test_first: false } })).includes('red-test-sde'))
})
t('resolver rule no-test-gate: warns while the test command is empty', () => {
  assert.ok(rules(res({})).includes('no-test-gate'))
  assert.ok(!rules(res({ gates: { commands: { test: 'npm test' } } })).includes('no-test-gate'))
})
t('resolver rule reviewer-disabled: warns when light review has no reviewer', () => {
  assert.ok(!rules(res({})).includes('reviewer-disabled'))
  assert.ok(rules(res({ roles: { 'code-reviewer': { enabled: false } } })).includes('reviewer-disabled'))
  assert.ok(!rules(res({ review: { level: 'none' }, roles: { 'code-reviewer': { enabled: false } } })).includes('reviewer-disabled'))
})

// persona, theme, mascot
t('persona, theme and mascot defaults', () => {
  const c = res({}).config
  assert.deepStrictEqual(c.persona, { level: 'off', protect_payload: true, override_rules: false })
  assert.strictEqual(c.theme, 'normal')
  assert.strictEqual(c.mascot, 'normal')
})
t('persona, theme and mascot reject bad values', () => {
  assert.ok(res({ persona: { level: 'loud' } }).errors.length)
  assert.ok(res({ persona: { extra: 1 } }).errors.length)
  assert.ok(res({ persona: { protect_payload: 'yes' } }).errors.length)
  assert.ok(res({ theme: 'Bad Name' }).errors.length)
  assert.ok(res({ mascot: 'Bad Name' }).errors.length)
})
t('resolver rule persona-needs-theme: persona off without a theme', () => {
  const r = res({ persona: { level: 'soft' } })
  assert.ok(rules(r).includes('persona-needs-theme'))
  assert.strictEqual(r.config.persona.level, 'off')
  const ok = res({ persona: { level: 'soft' }, theme: 'demo' })
  assert.ok(!rules(ok).includes('persona-needs-theme'))
  assert.strictEqual(ok.config.persona.level, 'soft')
  assert.ok(!rules(res({})).includes('persona-needs-theme'))
})
t('resolver rule override-needs-hard: override only with hard persona', () => {
  const r = res({ persona: { level: 'soft', override_rules: true }, theme: 'demo' })
  assert.ok(rules(r).includes('override-needs-hard'))
  assert.strictEqual(r.config.persona.override_rules, false)
  const n = res({ persona: { override_rules: true } })
  assert.ok(rules(n).includes('override-needs-hard'))
  const h = res({ persona: { level: 'hard', override_rules: true }, theme: 'demo' })
  assert.ok(!rules(h).includes('override-needs-hard'))
  assert.strictEqual(h.config.persona.override_rules, true)
})
t('resolver rule mascot-pack: noted for any non-normal mascot', () => {
  assert.ok(rules(res({ mascot: 'demo' })).includes('mascot-pack'))
  assert.ok(!rules(res({})).includes('mascot-pack'))
})

// generator
const SEED_MD = '# Mine\n\nproject rules\n'
const SEED_IGNORE = 'node_modules\n'
const SEED_SETTINGS = { permissions: { allow: ['Bash(ls)'] } }
function seeded() {
  const root = mkdir()
  put(root, 'CLAUDE.md', SEED_MD)
  put(root, '.gitignore', SEED_IGNORE)
  put(root, '.claude/settings.local.json', JSON.stringify(SEED_SETTINGS, null, 2) + '\n')
  return root
}

t('generate: writes agents, settings, CLAUDE.md block, ignore line and manifest', () => {
  const root = seeded()
  const { warnings } = gen(root)
  for (const role of ['planner', 'sde', 'judge', 'build-fixer']) assert.ok(has(root, `.claude/agents/scforge-${role}.md`), role)
  assert.ok(!has(root, '.claude/agents/scforge-sdet.md'))
  assert.ok(!has(root, '.claude/agents/scforge-release.md'))
  assert.ok(warnings.some(w => w.includes('code-reviewer')))
  const sde = get(root, '.claude/agents/scforge-sde.md')
  assert.match(sde, /^---\nname: scforge-sde\n/)
  assert.match(sde, /\nmodel: sonnet\n/)
  assert.match(sde, /generated by scforge/)
  assert.match(get(root, '.claude/agents/scforge-judge.md'), /\nmodel: opus\n/)
  assert.ok(!/autoCompactWindow/.test(sde))
  gen(root, { roles: { sde: { compact: { window: 627472 } } } })
  assert.match(get(root, '.claude/agents/scforge-sde.md'), /\nautoCompactWindow: 627472\n/)
  gen(root)
  const settings = JSON.parse(get(root, '.claude/settings.local.json'))
  assert.strictEqual(settings.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE, '70')
  assert.deepStrictEqual(settings.permissions, SEED_SETTINGS.permissions)
  const md = get(root, 'CLAUDE.md')
  assert.ok(md.startsWith(SEED_MD))
  assert.match(md, /<!-- scforge:start -->\n@\.scforge\/CLAUDE\.factory\.md\n<!-- scforge:end -->\n$/)
  assert.strictEqual(get(root, '.gitignore'), 'node_modules\n.scforge/\n')
  assert.ok(has(root, '.scforge/generated.json'))
  assert.ok(has(root, '.scforge/CLAUDE.factory.md'))
})
t('generate: a second run changes nothing', () => {
  const root = seeded()
  gen(root)
  const before = snapshot(root)
  const again = gen(root)
  assert.deepStrictEqual(again.actions, [])
  assert.deepStrictEqual(snapshot(root), before)
})
t('generate: dry run writes nothing', () => {
  const root = seeded()
  const before = snapshot(root)
  const { actions } = gen(root, {}, { dryRun: true })
  assert.ok(actions.length > 0)
  assert.deepStrictEqual(snapshot(root), before)
})
t('generate: refuses to overwrite a file it did not generate and writes nothing', () => {
  const root = seeded()
  put(root, '.claude/agents/scforge-sde.md', 'mine\n')
  const before = snapshot(root)
  assert.throws(() => gen(root), /not generated by scforge/)
  assert.deepStrictEqual(snapshot(root), before)
})
t('generate: disabling a role removes only its generated file', () => {
  const root = seeded()
  gen(root)
  gen(root, { roles: { 'build-fixer': { enabled: false } } })
  assert.ok(!has(root, '.claude/agents/scforge-build-fixer.md'))
  assert.ok(has(root, '.claude/agents/scforge-sde.md'))
})
t('generate: track_factory true moves settings and drops the ignore line', () => {
  const root = seeded()
  gen(root)
  gen(root, { git: { track_factory: true } })
  assert.strictEqual(JSON.parse(get(root, '.claude/settings.json')).env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE, '70')
  const local = JSON.parse(get(root, '.claude/settings.local.json'))
  assert.strictEqual(local.env, undefined)
  assert.deepStrictEqual(local.permissions, SEED_SETTINGS.permissions)
  assert.strictEqual(get(root, '.gitignore'), SEED_IGNORE)
})
t('generate: claude_md.enabled false removes the block and restores the text', () => {
  const root = seeded()
  gen(root)
  gen(root, { claude_md: { enabled: false } })
  assert.strictEqual(get(root, 'CLAUDE.md'), SEED_MD)
})
t('generate: a custom name changes the folder, markers and agent prefix', () => {
  const root = seeded()
  gen(root, { name: 'acme' })
  assert.ok(has(root, '.acme/generated.json'))
  assert.match(get(root, '.claude/agents/acme-sde.md'), /\nname: acme-sde\n/)
  assert.match(get(root, 'CLAUDE.md'), /<!-- acme:start -->\n@\.acme\/CLAUDE\.factory\.md\n<!-- acme:end -->/)
  assert.match(get(root, '.gitignore'), /^\.acme\/$/m)
})
t('generate: CRLF files keep their line endings', () => {
  const root = mkdir()
  put(root, 'CLAUDE.md', '# Mine\r\n')
  gen(root)
  assert.ok(!/(^|[^\r])\n/.test(get(root, 'CLAUDE.md')), 'bare LF found')
  assert.match(get(root, 'CLAUDE.md'), /<!-- scforge:start -->\r\n@\.scforge\/CLAUDE\.factory\.md\r\n<!-- scforge:end -->\r\n$/)
})

// uninstall
t('uninstall: restores seeded files exactly and removes every generated file', () => {
  const root = seeded()
  gen(root)
  uninstall(root, 'scforge')
  assert.strictEqual(get(root, 'CLAUDE.md'), SEED_MD)
  assert.strictEqual(get(root, '.gitignore'), SEED_IGNORE)
  assert.deepStrictEqual(JSON.parse(get(root, '.claude/settings.local.json')), SEED_SETTINGS)
  assert.deepStrictEqual(listFiles(root).sort(), ['.claude/settings.local.json', '.gitignore', 'CLAUDE.md'])
})
t('uninstall: removes files the generator created', () => {
  const root = mkdir()
  gen(root)
  uninstall(root, 'scforge')
  assert.deepStrictEqual(listFiles(root), [])
})
t('uninstall: keeps an ignore line that was already there', () => {
  const root = mkdir()
  put(root, '.gitignore', '.scforge/\n')
  gen(root)
  uninstall(root, 'scforge')
  assert.strictEqual(get(root, '.gitignore'), '.scforge/\n')
})
t('uninstall: leaves other factory state alone and fails without a manifest', () => {
  const root = mkdir()
  gen(root)
  put(root, '.scforge/NEXT.md', 'keep me\n')
  uninstall(root, 'scforge')
  assert.strictEqual(get(root, '.scforge/NEXT.md'), 'keep me\n')
  assert.throws(() => uninstall(root, 'scforge'), /nothing to uninstall/)
})

// paths
t('factoryRoot: the main checkout and a linked worktree resolve to the same root', () => {
  const root = mkdir()
  const git = (...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...a], { cwd: root, stdio: 'pipe' })
  git('init', '-q')
  git('commit', '-q', '--allow-empty', '-m', 'x')
  const wt = path.join(mkdir(), 'wt')
  git('worktree', 'add', '-q', wt)
  const real = p => fs.realpathSync(p)
  assert.strictEqual(real(factoryRoot(root)), real(root))
  assert.strictEqual(real(factoryRoot(wt)), real(root))
})

// CLI
t('cli: dry run succeeds, bad config exits 1, name mismatch exits 1', () => {
  const root = mkdir()
  const cli = (...a) => spawnSync(process.execPath, [path.join(pluginDir, 'bin', 'scforge-gen.js'), '--root', root, ...a], { encoding: 'utf8' })
  const dry = cli('--dry-run')
  assert.strictEqual(dry.status, 0, dry.stderr)
  assert.match(dry.stdout, /would write \.claude\/agents\/scforge-sde\.md/)
  assert.deepStrictEqual(listFiles(root), [])
  put(root, '.scforge/config.json', '{"preset":"max"}')
  const bad = cli()
  assert.strictEqual(bad.status, 1)
  assert.match(bad.stderr, /config: \.preset/)
  put(root, '.scforge/config.json', '{"name":"acme"}')
  const mismatch = cli()
  assert.strictEqual(mismatch.status, 1)
  assert.match(mismatch.stderr, /does not match folder/)
})

t('detect: node scripts, python default, unknown', () => {
  const root = mkdir()
  assert.strictEqual(detect(root).stack, 'unknown')
  put(root, 'package.json', '{"scripts":{"test":"x","lint":"y"}}')
  assert.deepStrictEqual(detect(root).commands, { lint: 'npm run lint', typecheck: '', test: 'npm test' })
  const py = mkdir()
  put(py, 'pyproject.toml', '[tool.ruff]\n')
  assert.deepStrictEqual(detect(py).commands, { lint: 'ruff check .', typecheck: '', test: 'python -m pytest' })
})

t('cli: --detect prints JSON, --require-test refuses empty test gate', () => {
  const root = mkdir()
  const cli = (...a) => spawnSync(process.execPath, [path.join(pluginDir, 'bin', 'scforge-gen.js'), '--root', root, ...a], { encoding: 'utf8' })
  assert.strictEqual(JSON.parse(cli('--detect').stdout).stack, 'unknown')
  const no = cli('--require-test', '--dry-run')
  assert.strictEqual(no.status, 1)
  assert.match(no.stderr, /gates\.commands\.test is empty/)
  put(root, '.scforge/config.json', '{"gates":{"commands":{"test":"npm test"}}}')
  assert.strictEqual(cli('--require-test', '--dry-run').status, 0)
})

t('cli: hard persona or override_rules refused without --confirm-persona', () => {
  const root = mkdir()
  const cli = (...a) => spawnSync(process.execPath, [path.join(pluginDir, 'bin', 'scforge-gen.js'), '--root', root, ...a], { encoding: 'utf8' })
  put(root, '.scforge/config.json', JSON.stringify({ theme: 'demo', theme_dir: FIX, persona: { level: 'hard' } }))
  const no = cli()
  assert.strictEqual(no.status, 1)
  assert.match(no.stderr, /--confirm-persona/)
  assert.ok(!fs.existsSync(path.join(root, '.claude')))
  assert.strictEqual(cli('--confirm-persona', '--dry-run').status, 0)
  put(root, '.scforge/config.json', JSON.stringify({ theme: 'demo', theme_dir: FIX, persona: { level: 'hard', override_rules: true } }))
  assert.strictEqual(cli('--dry-run').status, 1)
  assert.strictEqual(cli('--confirm-persona', '--dry-run').status, 0)
})

const { runGates, decide, lockedViolations, flipPasses } = require('../lib/round')

t('round: runGates stops at the first red gate and keeps its output tail', () => {
  const node = c => `"${process.execPath}" -e "${c}"`
  const r = runGates({ lint: node('0'), typecheck: node("console.error('bad type');process.exit(2)"), test: node('0') }, os.tmpdir())
  assert.strictEqual(r.ok, false)
  assert.deepStrictEqual(r.results.map(x => x.name), ['lint', 'typecheck'])
  assert.strictEqual(r.results[1].code, 2)
  assert.match(r.results[1].tail, /bad type/)
  assert.strictEqual(runGates({ lint: '', test: node('0') }, os.tmpdir()).ok, true)
})

t('round: decide gives judge on green, fix with new evidence, escalate on repeat or after 3', () => {
  assert.strictEqual(decide({ ok: true }, { fixRounds: 0, seen: [] }).next, 'judge')
  const red = tail => ({ ok: false, results: [{ name: 'test', code: 1, tail }] })
  const a = decide(red('boom'), { fixRounds: 0, seen: [] })
  assert.strictEqual(a.next, 'fix')
  assert.strictEqual(decide(red('boom'), a.state).next, 'escalate')
  let st = { fixRounds: 0, seen: [] }
  for (const e of ['e1', 'e2', 'e3']) st = decide(red(e), st).state
  assert.strictEqual(decide(red('e4'), st).next, 'escalate')
})

t('round: lockedViolations flags test paths changed after the red commit', () => {
  assert.deepStrictEqual(lockedViolations(['src/a.js', 'test/a.test.js'], ['test/**']), ['test/a.test.js'])
  assert.deepStrictEqual(lockedViolations(['src/a.js'], ['test/**']), [])
})

t('round: flipPasses only on a pass verdict', () => {
  const f = { features: [{ id: 'f1', passes: false }] }
  assert.strictEqual(flipPasses(f, { feature: 'f1', verdict: 'fail' }).features[0].passes, false)
  assert.strictEqual(flipPasses(f, { feature: 'f1', verdict: 'andon' }).features[0].passes, false)
  assert.strictEqual(flipPasses(f, { feature: 'f1', verdict: 'pass' }).features[0].passes, true)
  assert.strictEqual(f.features[0].passes, false)
})

t('round: checkVerdict accepts a plain verdict, rejects voiced or malformed ones', () => {
  const { checkVerdict } = require('../lib/round')
  assert.deepStrictEqual(checkVerdict({ feature: 'f1', verdict: 'pass', items: [] }), [])
  assert.deepStrictEqual(checkVerdict({ feature: 'f1', verdict: 'andon' }), [])
  assert.ok(checkVerdict({ verdict: 'pass' }).length)
  assert.ok(checkVerdict({ feature: '', verdict: 'pass' }).length)
  assert.ok(checkVerdict({ feature: 'f1', verdict: 'passed!' }).length)
  assert.ok(checkVerdict('pass').length)
  assert.ok(checkVerdict(null).length)
  assert.ok(checkVerdict([]).length)
  assert.ok(checkVerdict({ feature: 'f1', verdict: 'pass', items: 'x' }).length)
})

t('cli: flip rejects non-plain verdicts (exit 2, file untouched), accepts a good one', () => {
  const root = mkdir()
  const feats = JSON.stringify({ features: [{ id: 'f1', passes: false }] }, null, 2)
  put(root, '.scforge/state/features.json', feats)
  const flip = body => {
    put(root, 'v.json', body)
    return spawnSync(process.execPath, [path.join(pluginDir, 'bin', 'scforge-round.js'), 'flip', path.join(root, 'v.json'), '--root', root], { encoding: 'utf8' })
  }
  for (const bad of ['{"feature":"f1","verdict":"Aye, it passes, captain!"}', 'not json at all', '{"feature":"f1","verdict":"pass","items":"x"}']) {
    assert.strictEqual(flip(bad).status, 2, bad)
    assert.strictEqual(get(root, '.scforge/state/features.json'), feats)
  }
  const ok = flip('{"feature":"f1","verdict":"pass"}')
  assert.strictEqual(ok.status, 0, ok.stderr)
  assert.strictEqual(JSON.parse(get(root, '.scforge/state/features.json')).features[0].passes, true)
})

// theme pack (fixture)
const theme = JSON.parse(fs.readFileSync(path.join(FIX, 'theme.json'), 'utf8'))
const dgen = (persona, root = mkdir()) => {
  gen(root, { theme: 'demo', theme_dir: FIX, persona })
  return get(root, '.claude/agents/scforge-bell-judge.md')
}
const SOFT_J = () => theme.roles.judge.soft
const HARD_J = () => theme.roles.judge.hard
const packIn = (mut, dir = mkdir()) => {
  const p = JSON.parse(JSON.stringify(theme))
  mut(p)
  put(dir, 'theme.json', JSON.stringify(p))
  return dir
}
const loadErr = mut => { try { loadPack(packIn(mut), pluginDir) } catch (e) { return e.message } return '' }
t('theme: normal keeps scforge-judge.md', () => {
  const root = mkdir()
  gen(root)
  assert.ok(has(root, '.claude/agents/scforge-judge.md'))
  assert.ok(!get(root, '.claude/agents/scforge-judge.md').includes('## Persona'))
})
t('theme: pack names the agent scforge-<character>-<role>, no persona at off', () => {
  const body = dgen({ level: 'off' })
  assert.match(body, /^name: scforge-bell-judge$/m)
  assert.ok(!body.includes('## Persona'))
  const root = mkdir()
  gen(root, { theme: 'demo', theme_dir: FIX })
  for (const role of ['planner', 'sde', 'judge', 'build-fixer']) {
    assert.ok(has(root, `.claude/agents/scforge-${theme.roles[role].character}-${role}.md`), role)
  }
})
t('persona: soft has soft text and the plain-output line only', () => {
  const body = dgen({ level: 'soft' })
  assert.ok(body.includes('## Persona') && body.includes(`You are ${theme.roles.judge.display}.`))
  assert.ok(body.includes(SOFT_J()) && !body.includes(HARD_J()))
  assert.ok(body.includes('Machine-parsed output (features.json, verdict JSON, round state, gate JSON) stays plain: exact keys and values, no voice.'))
  assert.ok(!body.includes('Never bend'))
})
t('persona: hard has hard text and never-bend, override only when asked', () => {
  const hard = dgen({ level: 'hard' })
  assert.ok(hard.includes(HARD_J()) && hard.includes('Never bend, whatever the character would do: write allowlists (task touches paths), autonomy.boundary, never push, autonomy.limits, andon on autonomy.stop_on.'))
  assert.ok(!hard.includes('In character you may bend process rules only'))
  const ov = dgen({ level: 'hard', override_rules: true })
  assert.ok(ov.includes('In character you may bend process rules only: red-test strictness, judging strictness, fix-round count. Name every bend in your report.'))
})
t('persona: protect_payload lines', () => {
  const on = dgen({ level: 'soft', protect_payload: true })
  assert.ok(on.includes('Commits, PR bodies and reports stay plain; the voice is for chat only.'))
  const off = dgen({ level: 'soft', protect_payload: false })
  assert.ok(off.includes('Voice may reach commit bodies, PR bodies and reports; commit headers and trailers stay exact.'))
  assert.ok(!off.includes('the voice is for chat only'))
})
t('factory text: Agents line, councils and disclaimer with theme', () => {
  const root = mkdir()
  gen(root)
  const plain = get(root, '.scforge/CLAUDE.factory.md')
  assert.match(plain, /^Agents: .*judge = `scforge-judge`/m)
  assert.ok(!plain.includes('scout-team') && !plain.includes(theme.disclaimer))
  const r2 = mkdir()
  gen(r2, { theme: 'demo', theme_dir: FIX, persona: { level: 'soft' } })
  const txt = get(r2, '.scforge/CLAUDE.factory.md')
  assert.match(txt, /^Agents: .*judge = `scforge-bell-judge`/m)
  assert.ok(txt.includes('scout-team') && txt.includes('round-table') && txt.includes(theme.disclaimer))
  assert.ok(txt.includes('Captain (main session): Ada.') && txt.includes(theme.captain.soft))
  const r3 = mkdir()
  gen(r3, { theme: 'demo', theme_dir: FIX })
  assert.ok(!get(r3, '.scforge/CLAUDE.factory.md').includes('Captain (main session)'))
})
t('theme: switching back to normal removes themed agent files', () => {
  const root = mkdir()
  gen(root, { theme: 'demo', theme_dir: FIX })
  assert.ok(has(root, '.claude/agents/scforge-bell-judge.md'))
  gen(root)
  assert.ok(!has(root, '.claude/agents/scforge-bell-judge.md'))
  assert.ok(has(root, '.claude/agents/scforge-judge.md'))
})
t('theme: hard is idempotent, every block has the output and never-bend lines, uninstall is clean', () => {
  const root = seeded()
  const user = { theme: 'demo', theme_dir: FIX, persona: { level: 'hard', override_rules: true } }
  gen(root, user)
  const before = snapshot(root)
  assert.deepStrictEqual(gen(root, user).actions, [])
  assert.deepStrictEqual(snapshot(root), before)
  const themed = Object.keys(before).filter(f => f.startsWith('.claude/agents/'))
  assert.ok(themed.length >= 4)
  for (const f of [...themed, '.scforge/CLAUDE.factory.md']) {
    assert.match(before[f], /Machine-parsed output \(features\.json, verdict JSON, round state, gate JSON\) stays plain/, f)
    assert.match(before[f], /Never bend, whatever the character would do/, f)
    assert.match(before[f], /In character you may bend process rules only/, f)
  }
  uninstall(root, 'scforge')
  assert.deepStrictEqual(listFiles(root).sort(), ['.claude/settings.local.json', '.gitignore', 'CLAUDE.md'])
})
t('pack loader: finds by theme_dir (absolute and relative) and by installed location', () => {
  const root = mkdir()
  assert.strictEqual(findPack(root, { theme: 'demo', theme_dir: FIX }), FIX)
  assert.strictEqual(findPack(root, { theme: 'demo', theme_dir: path.relative(root, FIX) }), path.resolve(FIX))
  assert.strictEqual(findPack(root, { theme: 'demo' }), path.join(root, '.scforge', 'themes', 'demo'))
  put(root, '.scforge/themes/demo/theme.json', fs.readFileSync(path.join(FIX, 'theme.json'), 'utf8'))
  assert.strictEqual(loadPack(findPack(root, { theme: 'demo' }), pluginDir).id, 'demo')
  gen(root, { theme: 'demo' })
  assert.ok(has(root, '.claude/agents/scforge-bell-judge.md'))
})
t('pack loader: missing pack errors clearly', () => {
  const root = mkdir()
  assert.throws(() => loadPack(findPack(root, { theme: 'demo' }), pluginDir), /theme pack .*theme\.json/)
  assert.throws(() => gen(root, { theme: 'demo' }), /theme pack/)
})
t('pack validation: rejects unknown key, multi-line voice, over-long hard, bad character id', () => {
  assert.strictEqual(loadErr(() => {}), '')
  assert.match(loadErr(p => { p.extra = 1 }), /theme pack .*extra/)
  assert.match(loadErr(p => { p.roles.judge.soft = 'a\nb' }), /soft/)
  assert.match(loadErr(p => { p.captain.display = 'a\rb' }), /display/)
  assert.match(loadErr(p => { p.roles.judge.hard = 'x'.repeat(1201) }), /hard/)
  assert.match(loadErr(p => { p.roles.judge.character = 'Bad Id' }), /character/)
})
t('pack validation: preset may only set persona, theme, mascot', () => {
  for (const k of ['autonomy', 'gates', 'git', 'roles', 'name', 'preset']) {
    assert.match(loadErr(p => { p.presets.evil = { [k]: {} } }), new RegExp(k), k)
  }
  assert.strictEqual(loadErr(p => { p.presets.ok = { persona: { level: 'soft' } } }), '')
})
t('preset: lite and demo:max resolve through loadPreset', () => {
  const root = mkdir()
  assert.deepStrictEqual(loadPreset(pluginDir, root, {}), preset)
  const user = { preset: 'demo:max', theme_dir: FIX }
  const p = loadPreset(pluginDir, root, user)
  assert.deepStrictEqual(p.roles, preset.roles)
  assert.deepStrictEqual(p.persona, { level: 'hard', protect_payload: false, override_rules: true })
  const r = resolve(user, { schema, preset: p })
  assert.deepStrictEqual(r.errors, [])
  assert.strictEqual(r.config.theme, 'demo')
  assert.strictEqual(r.config.persona.level, 'hard')
  assert.strictEqual(r.config.persona.override_rules, true)
  assert.deepStrictEqual(r.config.autonomy, res({}).config.autonomy)
  assert.throws(() => loadPreset(pluginDir, root, { preset: 'demo:nope', theme_dir: FIX }), /nope/)
  assert.throws(() => loadPreset(pluginDir, root, { preset: 'nope' }), /nope/)
})
t('cli: gen --dry-run with demo:max plans the themed judge file', () => {
  const root = mkdir()
  put(root, '.scforge/config.json', JSON.stringify({ preset: 'demo:max', theme_dir: FIX }))
  const r = spawnSync(process.execPath, [path.join(pluginDir, 'bin', 'scforge-gen.js'), '--dry-run', '--confirm-persona', '--root', root], { encoding: 'utf8' })
  assert.strictEqual(r.status, 0, r.stderr)
  assert.match(r.stdout, /would write \.claude\/agents\/scforge-bell-judge\.md/)
})
t('config schema: theme_dir and pack presets', () => {
  assert.ok(res({ theme_dir: '' }).errors.length)
  assert.ok(res({ preset: 'Bad:x' }).errors.length)
  assert.deepStrictEqual(res({ preset: 'demo:max' }).errors, [])
})
t('start.md names agents by role, not hardcoded', () => {
  assert.ok(!/scforge-(planner|sde|build-fixer|judge)/.test(get(pluginDir, 'commands/start.md')))
})

t('no legacy judge nickname left', () => {
  const r = spawnSync('git', ['grep', '-n', '-I', 'G' + 'awd'], { cwd: pluginDir, encoding: 'utf8' })
  assert.strictEqual(r.status, 1, r.stdout)
})
t('no fan names in tracked files outside .scforge/NEXT.md', () => {
  const r = spawnSync('git', ['grep', '-n', '-I', '-i', '-w', '-E', 'strawhat|gear5|one piece|luffy|zoro|nami|robin|franky|usopp|chopper|sanji|jinbe|brook', '--', '.', ':!.scforge/NEXT.md', ':!nashworks', ':!test/run.js'], { cwd: pluginDir, encoding: 'utf8' })
  assert.strictEqual(r.status, 1, r.stdout)
})

t('council roles run on sonnet medium', () => {
  for (const f of ['product-council', 'decision-council']) {
    const fm = fs.readFileSync(path.join(pluginDir, 'roles', f + '.md'), 'utf8').split('---')[1]
    assert.match(fm, /\nmodel: sonnet\r?\n/, f)
    assert.match(fm, /\neffort: medium\r?\n/, f)
  }
})

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`)
