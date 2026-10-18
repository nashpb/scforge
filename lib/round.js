'use strict'
const { spawnSync } = require('child_process')

const GATE_ORDER = ['lint', 'typecheck', 'test']
const MAX_FIX_ROUNDS = 3

// Runs gates cheapest first and stops at the first red one. Empty commands are skipped.
function runGates(commands, cwd) {
  const results = []
  for (const name of GATE_ORDER) {
    if (!commands[name]) continue
    const p = spawnSync(commands[name], { cwd, shell: true, encoding: 'utf8' })
    const code = p.status === null ? 1 : p.status
    results.push({ name, code, tail: ((p.stdout || '') + (p.stderr || '')).trim().split('\n').slice(-20).join('\n') })
    if (code !== 0) return { ok: false, results }
  }
  return { ok: true, results }
}

// Next step after a gate run. A fix round needs new evidence: the same failure twice escalates.
function decide(gates, state) {
  if (gates.ok) return { next: 'judge', state }
  const failure = gates.results[gates.results.length - 1]
  const key = `${failure.name}:${failure.tail}`
  if (state.fixRounds >= MAX_FIX_ROUNDS || state.seen.includes(key)) return { next: 'escalate', state }
  return { next: 'fix', state: { fixRounds: state.fixRounds + 1, seen: [...state.seen, key] } }
}

const globToRe = g => new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\0').replace(/\*/g, '[^/]*').replace(/\0/g, '.*') + '$')

// Files changed after the red commit that sit under a locked (test) glob.
function lockedViolations(changed, lockedGlobs) {
  const res = lockedGlobs.map(globToRe)
  return changed.filter(f => res.some(r => r.test(f)))
}

// Only a pass verdict flips passes; returns a copy.
function flipPasses(features, verdict) {
  return {
    ...features,
    features: features.features.map(f => (f.id === verdict.feature && verdict.verdict === 'pass' ? { ...f, passes: true } : f)),
  }
}

module.exports = { runGates, decide, lockedViolations, flipPasses, MAX_FIX_ROUNDS }
