'use strict'
// Scans only added diff lines; findings never carry the matched value.
const RULES = [
  ['aws-access-key', /AKIA[0-9A-Z]{16}/],
  ['private-key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['github-token', /gh[pousr]_[A-Za-z0-9]{36,}/],
  ['sk-key', /sk-[A-Za-z0-9_-]{20,}/],
  ['slack-token', /xox[baprs]-[A-Za-z0-9-]+/],
  ['assignment', /(password|secret|token|api[_-]?key)\s*[:=]\s*['"][^'"]{8,}['"]/i],
]

function scanDiff(diffText) {
  const out = []
  let file = null
  let line = 0
  for (const raw of diffText.split('\n')) {
    const text = raw.replace(/\r$/, '')
    if (text.startsWith('+++ ')) { file = text.slice(4).replace(/^b\//, ''); continue }
    const h = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(text)
    if (h) { line = Number(h[1]); continue }
    if (text.startsWith('+')) {
      if (!text.includes('scforge:allow-secret')) {
        for (const [rule, re] of RULES) if (re.test(text)) out.push({ file, line, rule })
      }
      line++
    } else if (text.startsWith(' ')) line++
  }
  return out
}

module.exports = { scanDiff }
