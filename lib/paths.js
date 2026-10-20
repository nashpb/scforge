'use strict'
const { execFileSync } = require('child_process')
const path = require('path')

// Every role reads and writes factory state in the main worktree, because linked worktrees
// are fresh checkouts and do not contain git-ignored files.
function factoryRoot(cwd) {
  const common = execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd, encoding: 'utf8' }).trim()
  return path.dirname(path.resolve(cwd, common))
}

module.exports = { factoryRoot }
