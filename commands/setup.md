---
description: Set up Scforge in this repo, or re-tune an existing install. Flags --auto, --uninstall.
argument-hint: "[--auto] [--uninstall]"
allowed-tools: Bash, Read, Write, Edit, Agent, AskUserQuestion
---

Generator: `node "${CLAUDE_PLUGIN_ROOT}/bin/scforge-gen.js"`. Call it `GEN` below. Resolve the main checkout root first: the parent of `git rev-parse --git-common-dir`, as an absolute path. Read and write only that root's `.scforge/`, and pass `--root <root>` to every `GEN` call and to `scforge-round`. Arguments: `$ARGUMENTS`.

## Blockers and to-dos
Classify every problem found below as a blocker or a to-do.
- **Blocker**: setup cannot work without it. Stop at once, say what is wrong and the one command or action that fixes it, and do not continue until the user confirms it is fixed; then re-check it. `--auto` does not skip a blocker. Blockers: not a git repo (`git init`); Node older than 20; empty `gates.commands.test`; `.claude/settings.local.json` or `.scforge/config.json` not valid JSON; `GEN` exit 1.
- **To-do**: setup works, the install is weaker. Keep going and add it to a list. Known to-dos: release plan still `pending`; `caveman` or `ponytail` not installed or installed at user scope instead of project scope; dynamic workflows off (`disableWorkflows` true in settings, or `CLAUDE_CODE_DISABLE_WORKFLOWS` set, or `/workflows` unavailable); `GEN` warns about a role with no template.
- **At the end**, print the to-do list as a table: what, why it matters, and the exact command. Use `!<shell command>` for things the user runs in this prompt, and `/config` or other slash commands where that is the only way (dynamic workflows: `/config`, turn on "Dynamic workflows"). Do not print the table when the list is empty. Then tell the user to run the `doctor` skill (`/scforge:doctor`) to re-check the install at any time.
- Append each blocker and to-do hit to `.scforge/SETUP-ISSUES.md` with date, step and status.

## --uninstall
Run `GEN --uninstall`. Print its output. Stop.

## Setup
1. **Question tool.** First of all, check that `AskUserQuestion` is callable. If its schema is not loaded, load it with ToolSearch `select:AskUserQuestion`. If it is still unavailable, add a to-do and ask every question below as plain chat text. Nothing needs installing.
2. **Detect.** Run `GEN --detect`. It prints `{stack, commands:{lint,typecheck,test}}` for this repo. If `.scforge/config.json` exists, read it: its values are the defaults for every question below, and answering "keep" changes nothing.
3. **Ask, one section at a time.** Each section below is one `AskUserQuestion` call (max 4 questions; split a bigger section across two calls). Put the current value or preset default first, marked "(Recommended)". With `--auto`, skip every section and keep defaults, except the test command in section 1. Ask nothing outside its section.
4. **Write** `.scforge/config.json` (JSON, only keys that differ from the preset). Show a short summary of what changed, section by section.
5. **Test command check.** If `gates.commands.test` is still empty, it is a blocker. Never continue without it.

### Section 1: Project and gates
`gates.commands.lint`, `gates.commands.typecheck`, `gates.commands.test` (offer the detected command, or Other to type one), `gates.red_test_first`. The test command is required: if it is empty after the answers, ask again. With `--auto`, stop and say a test command is needed.
### Section 2: Roles
`preset`, which optional roles to enable (`sdet`, `release`), and the `model` and `effort` of `judge` and `sde`.
### Section 3: Review and fix loop
`review.level`, `review.max_diff_lines`, `rounds.max_fix_iterations`, `errors.max_consecutive`.
### Section 4: Autonomy and safety
`autonomy.decisions`, `autonomy.boundary`, `autonomy.limits` (`max_rounds`, `max_hours`, `max_cost_usd`), `autonomy.stop_on`, `autonomy.human_gates`.
### Section 5: Git and CLAUDE.md
`git.track_factory` (default false), `git.auto_commit`, `claude_md.enabled`, `claude_md.target`. PRs are assigned to `@me`; say so, do not ask.
### Section 6: Context and tracking
`compact.enabled`, `compact.threshold_pct`, `compact.strategy`, `history.enabled`, `usage.enabled`.
### Section 7: Persona and theme
`persona.level`, `persona.protect_payload`, `persona.override_rules`, `theme`, `mascot`. A `hard` level or `override_rules` true triggers the warning in the Generate step.
### Section 8: Companion plugins
`plugins.preinstall` (default `caveman`, `ponytail`), `plugins.enabled`, `plugins.suggested`.

6. **Generate.** If config has `persona.level` `hard` or `persona.override_rules` true, first print a big warning: an in-character agent can talk itself past a gate, and override_rules lets it bend red-test strictness, judging strictness and fix rounds (write allowlists, never-push and autonomy limits stay locked). Even with `--auto`, require the user to type exactly `I accept hard persona risk`. On that exact reply add `--confirm-persona`; otherwise do not pass it, and set persona to soft or off. Run `GEN --require-test` (plus `--confirm-persona` if confirmed). Show its output. Exit 1 means fix config and repeat.
7. **Preinstall caveman and ponytail** at project scope only. Scope is `local` when `git.track_factory` is false, else `project`. Check `claude plugin list` first and skip any already installed at project or local scope. If one is installed at user scope, add a to-do with the fix `claude plugin uninstall <name>@<name> --scope user`, then install it at <scope>. Otherwise run `claude plugin install caveman@caveman --scope <scope>` and `claude plugin install ponytail@ponytail --scope <scope>`. Say they apply to this project only. Skip with a note if a marketplace is missing; do not add marketplaces.
8. **Release plan.** If `## Approval` in `.scforge/release-plan.md` is not `pending`, skip this step. Otherwise spawn the `release-planner` agent. Show `.scforge/release-plan.md`. **Approval is never skipped, not even with `--auto`.** Ask the user to type `approve release plan`. On that exact reply, replace `pending` under `## Approval` with: user (`git config user.name`), UTC timestamp, and the sha256 of the file text above the `## Approval` heading (`node -e` with `crypto`). Anything else leaves it `pending`; tell the user releases stay blocked.
9. **Re-run on an existing install.** Also read `.scforge/state/metrics.jsonl` if present and propose cuts (roles or gates that never changed an outcome). Apply only what the user accepts.

State plainly at the end: commits, PRs and the release plan are real work and persist.
