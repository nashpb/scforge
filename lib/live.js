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

function endEvent({ id, kind, ms, text }) {
  const e = ev('end', { id, status: STATUS[kind], ms })
  const error = kind === 'pass' || kind === 'skip' ? undefined : safeError(text)
  if (error) e.error = error
  return e
}

const suiteEvent = ({ name, runId, planned, xml, env, threads, parallel }) => ev('suite', { name, xml, env, runId, threads, parallel, planned })
const infoEvent = (k, v) => ev('info', { k, v })
const startEvent = ({ id, cls, m, params, thread }) => ev('start', { id, cls, m, params, thread })
const noteEvent = (id, k, v) => ev('note', { id, k, v })
const suiteEndEvent = name => ev('suite-end', { name })
const featureStartEvent = id => startEvent({ id: 'feature:' + id, cls: 'feature', m: id, params: '', thread: 'main' })
const featureEvent = (id, kind, text, ms) => endEvent({ id: 'feature:' + id, kind, ms, text })
const verdictEvent = (id, verdict, text, ms) => featureEvent(id, verdict === 'pass' ? 'pass' : 'fail', text, ms)

// kind overrides the pass/fail derived from the exit code (retry, skip).
function gateEvents(g, kind) {
  const k = kind || (g.code === 0 ? 'pass' : 'fail')
  const id = 'gate:' + g.name
  return [startEvent({ id, cls: 'gate', m: g.name, params: '', thread: 'main' }), endEvent({ id, kind: k, ms: g.ms, text: g.tail })]
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

module.exports = { suiteEvent, infoEvent, startEvent, endEvent, noteEvent, suiteEndEvent, gateEvents, featureStartEvent, featureEvent, verdictEvent, append }
