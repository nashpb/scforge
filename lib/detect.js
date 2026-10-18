'use strict'
const fs = require('fs')
const path = require('path')

const read = (root, f) => {
  try { return fs.readFileSync(path.join(root, f), 'utf8') } catch { return null }
}

// Guesses gates.commands from marker files. A guess is a proposal: setup shows it to the user.
function detect(root) {
  const pkg = read(root, 'package.json')
  if (pkg) {
    const scripts = (JSON.parse(pkg).scripts) || {}
    const pm = fs.existsSync(path.join(root, 'pnpm-lock.yaml')) ? 'pnpm' : fs.existsSync(path.join(root, 'yarn.lock')) ? 'yarn' : 'npm'
    const run = s => (s in scripts ? `${pm} run ${s}` : '')
    return {
      stack: 'node',
      commands: {
        lint: run('lint'),
        typecheck: run('typecheck') || (fs.existsSync(path.join(root, 'tsconfig.json')) ? 'npx tsc --noEmit' : ''),
        test: 'test' in scripts ? (pm === 'npm' ? 'npm test' : `${pm} test`) : ''
      }
    }
  }
  const pyproject = read(root, 'pyproject.toml') || ''
  if (pyproject || read(root, 'requirements.txt') || read(root, 'setup.py')) {
    return {
      stack: 'python',
      commands: {
        lint: /\[tool\.ruff/.test(pyproject) ? 'ruff check .' : '',
        typecheck: /\[tool\.mypy/.test(pyproject) ? 'mypy .' : '',
        test: 'python -m pytest'
      }
    }
  }
  if (read(root, 'go.mod')) return { stack: 'go', commands: { lint: 'go vet ./...', typecheck: '', test: 'go test ./...' } }
  if (read(root, 'Cargo.toml')) return { stack: 'rust', commands: { lint: 'cargo clippy', typecheck: 'cargo check', test: 'cargo test' } }
  return { stack: 'unknown', commands: { lint: '', typecheck: '', test: '' } }
}

module.exports = { detect }
