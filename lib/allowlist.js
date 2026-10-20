'use strict'
// Pure per-role write allowlist; fails closed on anything unknown or unreadable.
const path = require('path')

// shortcut: only ** and * (no ?, [], {}); upgrade if a touches glob needs more.
function globToRe(g) {
  const s = g.replace(/\\/g, '/').replace(/^\.\//, '')
  let re = ''
  for (let i = 0; i < s.length; i++) {
    if (s.startsWith('**/', i)) { re += '(?:.*/)?'; i += 2 }
    else if (s.startsWith('**', i)) { re += '.*'; i++ }
    else if (s[i] === '*') re += '[^/]*'
    else re += s[i].replace(/[.+?^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${re}$`)
}

function parse(features) {
  try {
    const f = typeof features === 'string' ? JSON.parse(features) : features
    const list = Array.isArray(f) ? f : f && f.features
    return Array.isArray(list) ? list : null
  } catch { return null }
}

function decide({ role, filePath, root, features } = {}) {
  const deny = (reason) => ({ allow: false, reason })
  if (typeof filePath !== 'string' || !filePath || typeof root !== 'string' || !root) return deny('missing path or root')
  const abs = path.resolve(root, filePath.replace(/\\/g, '/'))
  const rel = path.relative(path.resolve(root), abs).replace(/\\/g, '/')
  if (!rel || rel === '..' || rel.startsWith('../') || path.isAbsolute(rel)) return deny('path outside root')
  const under = (dir) => rel.startsWith(dir)
  const ok = (why) => ({ allow: true, reason: why })
  switch (role) {
    case 'sdet': return under('tests/') ? ok('sdet: tests/') : deny('sdet may write only under tests/')
    case 'planner': return under('.scforge/') ? ok('planner: .scforge/') : deny('planner may write only under .scforge/')
    case 'judge': return under('.scforge/state/') ? ok('judge: .scforge/state/') : deny('judge may write only under .scforge/state/')
    case 'sde':
    case 'build-fixer': {
      const list = parse(features)
      if (!list) return deny('features.json missing or unparsable')
      for (const f of list) {
        if (!f || f.passes !== false) continue
        for (const t of f.tasks || []) {
          for (const g of (t && t.touches) || []) {
            if (typeof g === 'string' && globToRe(g).test(rel)) return ok(`touches of ${f.id}`)
          }
        }
      }
      return deny('path not in touches of any unfinished feature')
    }
    default: return deny(`role ${role} is read-only`)
  }
}

module.exports = { decide }
