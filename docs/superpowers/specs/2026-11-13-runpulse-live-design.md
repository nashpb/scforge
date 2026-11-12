# RunPulse live view for scforge rounds

## Intent
The owner wants scforge to use RunPulse (github.com/nashpb/runpulse, a dependency-free terminal UI for live test runs) as its TUI for viewing work. First step: live progress of a round. Later: history, features backlog, verdicts.

## Approaches
- A. Scforge writes RunPulse's existing event stream (`live.jsonl`); RunPulse unchanged. Cheap, decoupled; non-pass/fail data shows only as notes.
- B. Extend RunPulse with scforge screens that read `.scforge/state/*`. Richest, but changes a second repo and couples it to scforge file formats.
- C. A now, B later where A is too thin. **Picked by the owner.**

This design covers phase 1 (A) only. Phase 2 (B) is a separate design.

## Design (phase 1)
- New `lib/live.js`: pure functions that turn round steps into RunPulse events (`ts`, `t`, ...) and an appender that writes one JSON line per event to `<reports>/<roundId>/live.jsonl`. Reports folder defaults to `.scforge/reports` and is overridable with `live.reports` in config.
- Mapping: round = `suite` (name = round id, `planned` = features plus gates). Each gate (lint, typecheck, test) and each feature = a test row (`start`/`end`). Pass = PASS, red gate or failed verdict = FAIL, a fix round = RETRY, an unreached row = SKIP. Andon = FAIL with the stop reason in `error`. `note` carries role, branch, commit. `info` carries goal and preset.
- Emit points: `scforge-round gates` (per gate), `scforge-round flip` (verdict), plus a new `scforge-round event <kind> [...]` subcommand that `commands/start.md` calls at plan, red test, sde and judge steps so every stage shows.
- Opt in: config key `live {enabled bool (default false), reports string}`. When off, behaviour is unchanged and no files are written.
- `/scforge:setup` writes a minimal `runpulse.json` (`reports` pointing at the live folder) when live is enabled. `/scforge:start` prints the one-line command to watch: `node <runpulse>/bin/runpulse.mjs attach`.
- RunPulse is NOT a dependency. Scforge only writes files in its documented contract; user installs RunPulse separately.

## Goals
Watch plan, red test, sde, gates and judge of a live round in RunPulse with no change to RunPulse.

## Non-goals
Bundling or installing RunPulse; history, backlog and cost views (phase 2); changing the TestNG adapter.

## Anti-goals
Live events must never change round outcomes, block a round, or leak secrets (event `error` text is the gate tail already shown today, passed through the existing secret scan). A write failure to `live.jsonl` is logged and ignored.

## Constraints
Plain JSON only in machine-parsed files. Node 20, no dependencies. Gates: `npm run check`, `claude plugin validate .`, `npm test`. Work runs as rounds through the scforge skill, on branch `feat/runpulse-live` from `development`. No push.

## Left to the builder
Exact event field names beyond the contract, run id format, `event` subcommand argument shape, test layout in `test/run.js`.
