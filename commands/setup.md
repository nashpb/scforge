---
description: Set up Scforge in this repo, or re-tune an existing install. Flags --auto, --uninstall.
argument-hint: "[--auto] [--uninstall]"
allowed-tools: Bash, Read, Write, Edit, Agent
---

Generator: `node "${CLAUDE_PLUGIN_ROOT}/bin/scforge-gen.js"`. Call it `GEN` below. Arguments: `$ARGUMENTS`.

## --uninstall
Run `GEN --uninstall`. Print its output. Stop.

## Setup
1. **Detect.** Run `GEN --detect`. It prints `{stack, commands:{lint,typecheck,test}}` for this repo.
2. **Config.** If `.scforge/config.json` exists, read it and keep every value already set. Otherwise start from `{}`. Fill `gates.commands` from step 1 only where empty. Without `--auto`, show the three commands and let the user edit them.
3. **Test command is required.** If `gates.commands.test` is still empty, ask for one. With `--auto`, stop and say a test command is needed. Never continue without it.
4. **Questions** (skip with `--auto`; keep defaults): `git.track_factory` (default false), keep board/history/usage on, assign PRs to `@me`.5. **Write** `.scforge/config.json` (JSON, only keys that differ from the preset).
6. **Generate.** Run `GEN --require-test`. Show its output. Exit 1 means fix config and repeat.7. **Preinstall caveman and ponytail** at project scope only. Scope is `local` when `git.track_factory` is false, else `project`. Check `claude plugin list` first and skip any already installed. Otherwise run `claude plugin install caveman@caveman --scope <scope>` and `claude plugin install ponytail@ponytail --scope <scope>`. Say they apply to this project only. Skip with a note if a marketplace is missing; do not add marketplaces.
8. **Release plan.** Spawn the `release-planner` agent. Show `.scforge/release-plan.md`. **Approval is never skipped, not even with `--auto`.** Ask the user to type `approve release plan`. On that exact reply, replace `pending` under `## Approval` with: user (`git config user.name`), UTC timestamp, and the sha256 of the file text above the `## Approval` heading (`node -e` with `crypto`). Anything else leaves it `pending`; tell the user releases stay blocked.
9. **Re-run on an existing install.** Also read `.scforge/state/metrics.jsonl` if present and propose cuts (roles or gates that never changed an outcome). Apply only what the user accepts.

State plainly at the end: commits, PRs and the release plan are real work and persist.
