'use strict'
const { validate, withDefaults, deepMerge } = require('./schema')

const REQUIRED_ROLES = ['planner', 'sde', 'judge']

// Precedence: safety rules (below), then the user's config, then the preset, then schema defaults.
// Returns { config, fixes, errors }. Every changed or noteworthy setting adds one entry to fixes.
function resolve(userConfig, { schema, preset }) {
  const errors = validate(schema, userConfig)
  if (errors.length) return { config: null, fixes: [], errors }
  const config = withDefaults(schema, deepMerge(preset, userConfig))
  const fixes = []
  const note = (level, rule, message) => fixes.push({ level, rule, message })
  const roles = config.roles

  for (const [role, r] of Object.entries(roles)) {
    if (r.mode === 'team') {
      r.mode = 'subagent'
      note('fix', 'team-mode', `roles.${role}.mode: team is not available in v0.1, using subagent`)
    }
  }

  for (const role of REQUIRED_ROLES) {
    if (!roles[role]) roles[role] = { enabled: true, mode: 'subagent' }
    if (!roles[role].enabled) {
      roles[role].enabled = true
      note('fix', 'required-role', `roles.${role}: the round cannot run without it, enabled`)
    }
  }

  const modelOf = r => r.model || 'inherit'
  if (modelOf(roles.judge) === modelOf(roles.sde)) {
    const was = modelOf(roles.judge)
    roles.judge.model = modelOf(roles.sde) === 'opus' ? 'sonnet' : 'opus'
    note('fix', 'judge-model', `roles.judge.model: ${was} equals the sde model, moved to ${roles.judge.model}`)
  }

  if (config.gates.red_test_first && !(roles.sdet && roles.sdet.enabled)) {
    note('info', 'red-test-sde', 'gates.red_test_first with no sdet: the sde commits the failing test first')
  }

  if (!config.gates.commands.test) {
    note('warn', 'no-test-gate', 'gates.commands.test is empty: red-test-first and evidence checks cannot be enforced')
  }

  if (config.review.level === 'light' && !(roles['code-reviewer'] && roles['code-reviewer'].enabled)) {
    note('warn', 'reviewer-disabled', 'review.level is light but roles.code-reviewer is disabled: the review step is skipped')
  }

  if (config.persona.level !== 'off' && config.theme === 'normal') {
    config.persona.level = 'off'
    note('fix', 'persona-needs-theme', 'persona.level needs a non-normal theme for its voice, set to off')
  }

  if (config.persona.override_rules && config.persona.level !== 'hard') {
    config.persona.override_rules = false
    note('fix', 'override-needs-hard', 'persona.override_rules needs persona.level hard, set to false')
  }

  if (config.mascot === 'strawhat') {
    note('info', 'mascot-pack', 'mascot strawhat: core ships no artwork; install the separate fan pack')
  }

  return { config, fixes, errors: [] }
}

module.exports = { resolve, REQUIRED_ROLES }
