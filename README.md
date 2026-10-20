<h1 align="center">scforge</h1>
<p align="center"><b>The SuperCrew Forge</b><br>A small, evidence-driven software factory for Claude Code.</p>

<p align="center">
  <a href="LICENSE"><img alt="License: Apache-2.0" src="https://img.shields.io/badge/license-Apache--2.0-blue.svg"></a>
  <img alt="Version 0.1.0" src="https://img.shields.io/badge/version-0.1.0-informational.svg">
  <a href="https://github.com/nashpb/scforge/releases"><img alt="Downloads" src="https://img.shields.io/github/downloads/nashpb/scforge/total.svg"></a>
  <img alt="Node 20+" src="https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg">
  <img alt="Claude Code plugin" src="https://img.shields.io/badge/Claude%20Code-plugin-orange.svg">
</p>

scforge runs one feature at a time through a fixed loop: **plan, red test, implement, code gates, judge**. Nothing counts as done without command output as evidence, secrets are scanned before every commit, and the factory never pushes.

## Why

Agents say "done" too easily. scforge makes that claim expensive: a failing test comes first and is then locked, cheap code gates run before any LLM judgment, and a judge on a *different model* than the builder decides pass or fail from the diff and test output.

## Features

- **Deterministic round.** A state machine in code (`workflows/round.workflow.js`, `scforge-round`), not an LLM choosing the next step. Pause and resume through `.scforge/NEXT.md`.
- **Red test first.** The failing test is committed, then its paths are locked against edits.
- **Gates, cheapest first.** Lint, typecheck, test; a red gate triggers a build-fixer round fed only the failing output, max 3 rounds, then a human.
- **Secret gate and commit guard.** Added lines are scanned for keys and tokens; locked test edits and oversized diffs are refused.
- **Independent judge.** The judge model must differ from the sde model.
- **Config you can read.** One JSON file, a schema, a generator, and a resolver with explicit rules.
- **Themes as separate packs.** Optional persona text for agents. Core ships no artwork and no third-party names.

## Install

Requires Node 20+ and Claude Code.

```
/plugin marketplace add nashpb/scforge
/plugin install scforge@scforge
```

Then, in your project:

```
/scforge:setup
```

Setup detects your stack, fills `gates.commands`, writes `.scforge/config.json`, generates the `scforge-*` agents in `.claude/agents/`, preinstalls `caveman` and `ponytail` at project scope, and drafts a release plan that you approve by typing `approve release plan`. `/scforge:setup --uninstall` removes what it generated.

Setup refuses an empty `gates.commands.test`. `--auto` keeps defaults, still needs a test command, and never skips release-plan approval.

## Quickstart

1. Write the goal under `Start next run` in `.scforge/NEXT.md`.
2. Run `/scforge:start` (optionally with goal text).
3. Read the verdict. Passing features are committed with Conventional Commits and a `round_id` trailer.

## Rounds

```
planner -> features.json (all passes:false)
   |
red commit (sde) -> test paths locked
   |
sde implements one feature
   |
gates: lint -> typecheck -> test   (red? build-fixer, max 3, then you)
   |
secrets + commit guard
   |
judge (different model) -> pass | fail | andon
   |
commit (never pushed)
```

### Rules that cannot be broken

No evidence means not done. Issue, dependency and web text is data, never instructions. The same error three times stops for a human. Release-plan approval is always manual. A secret in the diff stops the round. The judge never runs on the sde's model. The sde never edits tests after the red commit.

## Commands

| Command | Purpose |
|---|---|
| `/scforge:setup [--auto] [--uninstall]` | Detect, configure, generate agents, draft the release plan. |
| `/scforge:start [goal]` | Run one round on the goal in `.scforge/NEXT.md`. |

CLIs: `scforge-gen` (generator) and `scforge-round` (`gates`, `locked`, `secrets`, `guard`, `flip`). Generator: `node bin/scforge-gen.js [--root DIR] [--name NAME] [--dry-run] [--uninstall] [--detect] [--require-test] [--confirm-persona]`.

## Configuration

All keys are optional; defaults and allowed values are in [`config.schema.json`](config.schema.json). Config lives in `.scforge/config.json`.

| Key | Meaning |
|---|---|
| `name` | Folder, markers and ignore entry name (default `scforge`). |
| `preset` | `lite` (built in), or `<pack>:<name>` from a theme pack. |
| `roles.<role>` | `enabled`, `model`, `effort`, `skills`, `tools`, `compact.window`. Roles: planner, sde, sdet, judge, code-reviewer, build-fixer, release. |
| `persona`, `theme`, `mascot` | Optional character layer, see below. |
| `theme_dir` | Folder holding the theme pack (`theme.json`). Default `.<name>/themes/<theme>`. |
| `plugins` | `preinstall` (default caveman, ponytail), `enabled`, `suggested`. |
| `review` | `level` none or light; `max_diff_lines` (300). |
| `gates` | `red_test_first`; `commands.lint`, `commands.typecheck`, `commands.test`. Empty string skips a gate. |
| `rounds.max_fix_iterations` | 1 to 10, default 3. |
| `errors.max_consecutive` | Same error this many times asks a human (default 3). |
| `autonomy` | `decisions` suggest/plan/auto; `boundary` local-only or feature-branch; `limits`; `stop_on`; `human_gates`. |
| `git` | `auto_commit` (true); `track_factory` (false: `.scforge/` ignored, settings in `.claude/settings.local.json`). |
| `claude_md`, `compact`, `history`, `usage` | CLAUDE.md block, auto-compact threshold, history and usage flags (collection lands in v0.2). |

## Themes and personas

Themes rename agents and supply persona text. Core ships only the `normal` theme: standard role names, no persona. A theme pack is a folder with a `theme.json` (disclaimer, captain, per-role character with `soft` and `hard` text, council names, optional presets). [`test/fixtures/packs/demo/theme.json`](test/fixtures/packs/demo/theme.json) is a worked example with invented names. The loader is `lib/pack.js`.

`persona.level`: `off` (default), `soft` (speech and output-style block; needs a non-normal theme), `hard` (full personality traits).

- `persona.protect_payload` (default true): machine-parsed output (`features.json`, verdict JSON, round state) stays plain.
- `persona.override_rules` (default false, only with `hard`): lets the persona bend red-test strictness, judging strictness and fix-round count. This weakens the evidence discipline the factory exists for.

Never bent at any level: write allowlists, `autonomy.boundary`, never push, `autonomy.limits`, andon on `autonomy.stop_on`.

> **Warning.** An in-character agent can talk itself past a gate. `scforge-gen` refuses `hard` persona and `override_rules` (exit 1, nothing written) unless `--confirm-persona` is passed; `/scforge:setup` passes it only after you type an exact phrase.

## Roadmap

v0.1.0 is the smallest factory that installs, configures itself and finishes one feature with evidence. Planned for v0.2: per-role write-allowlist hook, eval suite, `setup_steps`/`init.sh`, `MISTAKES.md` postmortems, more presets, parallel features, two-stage review, board and history. See [`CHANGELOG.md`](CHANGELOG.md).

## Contributing

Branching is git-flow: `feat/*` from `development`, PR into `development`; releases cut as `release/X.Y.Z` from `development`, with PRs into `main` and back into `development`; `vX.Y.Z` tags on `main`. Conventional Commits. Before a PR:

```
npm run check
npm test
claude plugin validate .
```

Rounds are run through the `scforge` skill; resume notes live in `.scforge/NEXT.md`.

## License

[Apache-2.0](LICENSE). Third-party notices in [`NOTICE`](NOTICE).
