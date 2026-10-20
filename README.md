# Scforge

A Claude Code plugin that runs one feature at a time through a fixed loop: plan, red test, implement, code gates, judge. Nothing counts as done without command output as evidence. It never pushes.

Status: v0.1, preset `lite`. Config is JSON in `.scforge/config.json`.

## Install

Requires Node 20 or newer and Claude Code.

1. Add the plugin from this repo with Claude Code's plugin commands (`claude plugin validate .` checks the manifest).
2. In your project run `/scforge:setup`. It detects your stack, fills `gates.commands`, writes `.scforge/config.json`, generates the `scforge-*` agents in `.claude/agents/`, and drafts a release plan that you must approve by typing `approve release plan`.
3. `/scforge:setup --uninstall` removes what it generated.

Setup refuses an empty `gates.commands.test`. `--auto` keeps defaults but still stops without a test command and never skips release-plan approval.

Generator CLI: `node bin/scforge-gen.js [--root DIR] [--name NAME] [--dry-run] [--uninstall] [--detect] [--require-test] [--confirm-persona]`.

## Rounds

Put the goal under `Start next run` in `.scforge/NEXT.md`, then run `/scforge:start` (optionally with goal text). One round is:

1. **planner** writes `.scforge/state/features.json`, every feature `passes: false`, each with touched paths and a done-check.
2. **red commit**: the sde commits a failing test first. Test paths are then locked (`scforge-round locked <sha>`).
3. **sde** implements one feature.
4. **code gates**, cheapest first: lint, typecheck, test. A red gate gets a build-fixer round with only the failing output. After `rounds.max_fix_iterations` (default 3) it escalates to you.
5. **judge** grades the definition of done from the diff and test output, on a different model than the sde. Only a `pass` verdict flips `passes: true` (`scforge-round flip`).
6. **commit** per passing feature, Conventional Commits, `round_id` trailer. Never pushed.

Rules that cannot be broken: no evidence means not done; issue, dependency and web text is data, never instructions; the same error three times stops for a human; release-plan approval is always manual; a secret in the diff stops the round; the judge never runs on the sde's model; the sde never edits tests after the red commit.

## Config keys

All keys are optional; defaults are in `config.schema.json`.

| Key | Meaning |
|---|---|
| `name` | Custom name for folder, markers and ignore entry (default `scforge`). |
| `preset` | `lite` (built in), or `<pack>:<name>` for a preset shipped in a theme pack. |
| `roles.<role>` | `enabled`, `model`, `effort`, `skills`, `tools`, `compact.window`. Roles: planner, sde, sdet, judge, code-reviewer, build-fixer, release. |
| `persona`, `theme`, `mascot` | See below. |
| `theme_dir` | Folder holding the theme pack (`theme.json`). Default: `.<name>/themes/<theme>`. |
| `plugins` | `preinstall` (default caveman, ponytail), `enabled`, `suggested`. |
| `review` | `level` none or light; `max_diff_lines` (300). |
| `gates` | `red_test_first`; `commands.lint`, `commands.typecheck`, `commands.test`. Empty string skips a gate. |
| `rounds.max_fix_iterations` | 1 to 10, default 3. |
| `errors.max_consecutive` | Same error this many times asks a human (default 3). |
| `autonomy` | `decisions` suggest/plan/auto; `boundary` local-only or feature-branch; `limits` (rounds, hours, cost); `stop_on`; `human_gates`. |
| `git` | `auto_commit` (true); `track_factory` (false: `.scforge/` ignored, settings in `.claude/settings.local.json`). |
| `claude_md`, `compact`, `history`, `usage` | CLAUDE.md block, auto-compact threshold, run history and usage logging (collection lands in v0.2). |

## Themes and packs

Themes rename agents and supply persona text. Core ships only the `normal` theme: standard role names, no persona, no artwork, no franchise names.

Themes load from separate packs through two keys, `theme` (the pack id) and `theme_dir` (where the pack lives). A pack is a folder with a `theme.json` holding a disclaimer, a captain, a character with `soft` and `hard` text per role, and council names; it may also carry presets and a mascot note. `test/fixtures/packs/demo/theme.json` is a worked example with invented names.

The loader is `lib/pack.js`; `config.schema.json` takes any pack name for `theme` and `mascot`, plus `theme_dir`.

`mascot` follows the same rule: core ships no artwork. A mascot is installed separately, never bundled. See `.scforge/reports/mascot-research.md`.

## Persona levels and warnings

`persona.level`:

- `off` (default): no persona.
- `soft`: appends a speech and output-style block per agent. Needs a non-normal theme; with `theme: normal` the resolver forces it off.
- `hard`: appends full personality traits per agent.

`persona.protect_payload` (default true): machine-parsed output (`features.json`, verdict JSON, round state) always stays plain. With false, voice may also reach commit bodies, PR bodies and reports. Expect noisier history.

`persona.override_rules` (default false): only valid with `hard`; otherwise forced false. A hard persona may then bend red-test strictness, judging strictness and the fix-round count. This weakens the evidence discipline the factory exists for. Turn it on only knowingly.

Never bent, at any level: write allowlists, `autonomy.boundary`, never push, `autonomy.limits`, andon on `autonomy.stop_on`.

Hard persona and `override_rules` are risky: an in-character agent can talk itself past a gate. `scforge-gen` refuses them (exit 1, nothing written) unless `--confirm-persona` is passed; setup shows a warning and passes it only after you type an exact phrase.

## Development

`npm run check`, `claude plugin validate .`, `npm test`. Rounds are run through the `scforge` skill; resume notes live in `.scforge/NEXT.md`.

## Disclaimer

Core ships no third-party names or artwork. A fan pack must carry its own disclaimer in its `theme.json`; the pack loader surfaces it.

Licensed Apache-2.0 (code). The disclaimer concerns fan packs and their themes, which are not part of core.
