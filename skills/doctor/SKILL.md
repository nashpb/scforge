---
name: doctor
description: Check that the Scforge install in this repo works. Use when the user says "SC Forge doctor", asks whether Scforge is set up properly, or after /scforge:setup.
---

# SC Forge doctor

Read-only health check. Change nothing. Run each check, then print one table: check, `ok`/`blocker`/`todo`, evidence, fix command. Blockers first.

Blockers and to-dos are the same classes `/scforge:setup` uses (see `commands/setup.md`).

## Checks
Resolve the main checkout root first: the parent of `git rev-parse --git-common-dir`, as an absolute path. Read only that root's `.scforge/`, and pass `--root <root>` to every `RND` and `GEN` call. `RND` is `node "${CLAUDE_PLUGIN_ROOT}/bin/scforge-round.js"`; `GEN` is `node "${CLAUDE_PLUGIN_ROOT}/bin/scforge-gen.js"`.

| Check | How | Class if it fails |
|---|---|---|
| Git repo | `git rev-parse --git-dir` | blocker: `!git init` |
| Node 20+ | `node -v` | blocker: install Node 20+ |
| Config valid JSON | parse `.scforge/config.json` and `.claude/settings.local.json` (an empty file counts as invalid) | blocker: fix it, or `!echo '{}' > .claude/settings.local.json` |
| Test command set | `gates.commands.test` is non-empty (`GEN --detect` suggests one) | blocker: set it in `.scforge/config.json` |
| Generated | `.scforge/generated.json` exists and each `scforge-*` agent it lists exists in `.claude/agents/` | blocker: `/scforge:setup` |
| Gates run | `RND gates --reset`, read the JSON | todo if red; show the failing tail |
| Release plan | `.scforge/release-plan.md` names an approver under `## Approval`, not `pending` | todo: type `approve release plan` during `/scforge:setup` |
| Companion plugins | `claude plugin list` shows `caveman` and `ponytail`; flag user scope | todo: `!claude plugin install caveman@caveman --scope local` (same for ponytail) |
| Dynamic workflows | `disableWorkflows` is not true in settings, `CLAUDE_CODE_DISABLE_WORKFLOWS` is unset; ask the user to confirm `/workflows` opens | todo: `/config`, turn on "Dynamic workflows" |
| Branch | current branch is not `main` or `development` | todo: `!git switch -c feat/<name>` |

## Rules
- Never write a file, install a plugin or edit settings. Print the command for the user.
- A check you could not run is `unknown`, not `ok`.
- Finish with one line: `healthy`, `N to-dos`, or `N blockers`.
