'use strict'
// RunPulse live.jsonl events. Never throws into a round: write failures are logged and ignored.
const fs = require('fs')
const path = require('path')
const { scanDiff } = require('./secrets')

const STATUS = { pass: 'PASS', fail: 'FAIL', retry: 'RETRY', skip: 'SKIP', andon: 'FAIL' }
const ev = (t, o) => ({ ts: Date.now(), t, ...o })

// Gate tail only (last 20 lines); dropped entirely if the secret scan finds anything.
function safeError(text) {
  if (!text) return undefined
  const tail = String(text).split('\n').slice(-20).join('\n')
  if (scanDiff(tail.split('\n').map(l => '+' + l).join('\n')).length) return '[redacted: possible secret in output]'
  return tail
}

function endEvent(name, kind, text) {
  const e = ev('end', { name, status: STATUS[kind] })
  const error = kind === 'pass' || kind === 'skip' ? undefined : safeError(text)
  if (error) e.error = error
  return e
}

const suiteEvent = (roundId, planned) => ev('suite', { name: roundId, planned })
const featureEvent = (name, kind, text) => endEvent(name, kind, text)
const verdictEvent = (name, verdict, text) => endEvent(name, verdict === 'pass' ? 'pass' : 'fail', text)
const noteEvent = text => ev('note', { text })

// kind overrides the pass/fail derived from the exit code (retry, skip).
function gateEvents(g, kind) {
  const k = kind || (g.code === 0 ? 'pass' : 'fail')
  return [ev('start', { name: g.name }), endEvent(g.name, k, g.tail)]
}

function append(reports, roundId, event) {
  try {
    const dir = path.join(reports, roundId)
    fs.mkdirSync(dir, { recursive: true })
    fs.appendFileSync(path.join(dir, 'live.jsonl'), JSON.stringify(event) + '\n')
    return true
  } catch (e) {
    console.error(`scforge live: write failed (ignored): ${e.message}`)
    return false
  }
}

module.exports = { suiteEvent, gateEvents, featureEvent, verdictEvent, noteEvent, append }
