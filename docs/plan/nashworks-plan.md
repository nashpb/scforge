# Nashworks: generic, adaptive factory plugin

## Context
Nashworks grows out of a working multi-agent factory first built for one internal project: markdown roles, a charter, shared state files (board, handoff, mistakes) and a Workflow script for rounds. That version had no plugin manifest, config, reviewers, UI or presets, and was tied to its project. This repo starts clean; only the generic round workflow (`judge/round.workflow.js`) and the council roles (`roles/`) carry over.
Goal: a generic, adaptive Claude Code plugin named **Nashworks**, built by the factory itself, published on GitHub for others.

## Verdict on original ideas
- **0 Configurator, 2 Security reviewer, 6 Code reviewer:** NEEDED.
- **7 Presets, 3 Per-agent skills/plugins, 1 UI:** GREAT.
- **4 Agent teams:** OPTIONAL switch, built last.
- **5 Runtime token minimizer:** DROPPED. It spends tokens to save tokens. Replaced by per-role metrics plus cuts suggested on re-setup.
- **`/reload-skills`, `/reload-plugins` by Claude:** not possible; slash commands are user-only. `/reload-skills` does not exist (step 0, 2026-10-18); `/reload-plugins` does and needs no restart. Factory installs via `claude plugin install`, writes `enabledPlugins` and agent `skills:`, then asks the user to run `/reload-plugins` once.

## Consolidation (merged or removed)
- `mode`, `review.human_gates` and lights-out merge into one `autonomy` block. `preset_suggestion` and next-session prompts merge into one `suggestions` block.
- Setup UI, dashboard, board, history and usage views merge into one page: `/nashworks-ui` with tabs.
- `HANDOFF.md` merges into `NEXT.md`. `lessons.md` and postmortems merge into `MISTAKES.md`. `lean` preset merges into `lite`.
- `metrics.jsonl` is the raw event log; each history record is the per-run rollup. Pruning a history record also prunes that run's events, so neither grows without bound.
- `/nashworks-tune` is removed. Re-running `/nashworks-setup` on an existing install proposes cuts from `metrics.jsonl`.
- `/nashworks-setup --auto` is a flag, not a separate command.
- Reviewers: keep ECC `code-reviewer` + ECC `security-reviewer`, plus semgrep only in `strict`. Removed from gate: built-in `security-review` (overlaps ECC), `cavecrew-reviewer`, `ponytail-review` (ponytail mode on builders covers it).
- ECC subset: remove `strategic-compact` (auto compactor covers it). Fold `build-error-resolver` into the build-fixer role and `verification-loop` into `verify-gate`. Keep `refactor-cleaner` and `tdd-workflow` as vendored.
- Councils (decision, product) stay as optional roles, disabled in `lite`.

## Commands (8)
Plugin commands get the plugin namespace. Files are `commands/setup.md` etc., so users type `/nashworks:setup`. This plan writes `/nashworks-x` as shorthand for `/nashworks:x`. Export renames `plugin.json` `name`, so the namespace follows the custom name.
- `/nashworks-setup [--auto] [--remove-claude-md] [--uninstall]`: detect stack, run release planner, propose preset, roles, plugins and skills. Re-run = re-tune from metrics. `--uninstall` removes exactly the files in `.nashworks/generated.json`, the CLAUDE.md block and the `.gitignore` line.
- `/nashworks-start [--incognito]`: suggests preset (per `suggestions`), regenerates agents, starts the loop.
- `/nashworks-board`: kanban in the terminal.
- `/nashworks-history [run-id]`: past runs, default last 200.
- `/nashworks-stats [run-id|all]`: usage stats per run or overall.
- `/nashworks-ui`: single local HTML page. Tabs: Config (saves to `config.yaml`), Board, Live (round graph), History, Usage, Approvals, Release.
- `/nashworks-feedback [text]`: send feedback through triage (see Upstream).
- `/nashworks-export`: renamed copy to the user's own repo (see Custom name).

## `.nashworks/` layout
```
.nashworks/
  config.yaml          # active config (schema: config.schema.json shipped in the plugin)
  NEXT.md              # next-session file (resume, next run, requirements, alternatives)
  constitution.md      # rules that cannot be broken
  release-plan.md      # approved release plan (+ approval record)
  CLAUDE.factory.md    # factory rules imported by CLAUDE.md
  generated.json       # every file setup wrote outside this dir
  presets/             # lite, standard, max-quality, security-heavy, lights-out
  state/               # state.json, features.json, decisions.md, BOARD.md (generated), MISTAKES.md,
                       # approvals.jsonl, metrics.jsonl, feedback.jsonl, dismissed.json
  history/             # one JSON per run, capped at history.max_runs
  evals/               # fixed eval tasks for this project
  reports/
```
Git-ignored by default: setup appends the dir to `.gitignore` once. `git.track_factory: true` removes the line.
- **Worktrees:** worktrees are fresh checkouts, so ignored files are missing there. Every role resolves the factory dir from the main worktree (parent of `git rev-parse --git-common-dir`) and reads and writes state there.
- **Generated files:** agents are written as `.claude/agents/nashworks-<role>.md` (prefixed, so user agents are never overwritten). They live in `.claude/agents/`, not in the plugin, because plugin-shipped agents ignore `hooks`, `mcpServers` and `permissionMode` frontmatter (step 0, 2026-10-18). Plugin-level hooks go in `hooks/hooks.json`. Settings go to `.claude/settings.local.json` while `track_factory: false`, `.claude/settings.json` when true. Every generated path is recorded in `.nashworks/generated.json`; `--uninstall` and regeneration use only that list.

## `config.yaml`
**v0.1 stores the config as `.nashworks/config.json`** (same keys and schema), so the generator needs no dependency; a YAML front end can follow once a parser is justified. Everything below that says `config.yaml` means this file.
Core keys below. Later sections add `git`, `people`, `upstream`, `suggestions`, `board`, `history`, `usage`, `privacy`; each key is defined once (the two `git` snippets are one block). The full schema ships as `config.schema.json`, so the UI and the resolver validate the same thing.
```yaml
name: nashworks              # custom name, see below
roles.<name>: { enabled, mode: subagent|team, model, effort, skills: [], tools: [], compact: {...} }
main.skills: []
plugins: { preinstall: [caveman, ponytail], enabled: [], suggested: [] }
parallel: { features: 1, worktrees: true }
review: { level: none|light|strict }   # light: ECC code-reviewer on RC diff; strict: + ECC security-reviewer + semgrep on every PR, high findings block
compact: { enabled: true, threshold_pct: 70, strategy: auto|handoff }
claude_md: { enabled: true, target: CLAUDE.md }
autonomy:
  decisions: suggest|plan|auto          # installs, role changes, preset choice, ticket writes
  lights_out: false
  boundary: local-only|feature-branch|push-branch|open-pr|merge-main|release   # always applies: furthest the factory may go
  on_end: stop|new-round|new-factory
  release_on_end: false
  limits: { max_rounds: 10, max_hours: 8, max_cost_usd: 50 }
  stop_on: [gate-fail-3x, security-high, secret-found]
  human_gates: [spec, plan, rc, push]   # lights_out skips these up to the boundary; supervised keeps them
```

## Lights-out mode
- `lights_out: true` runs rounds with no human gate up to `boundary`. Anything past the boundary queues for a human.
- `on_end` acts inside the running session; `suggestions.mode: auto` acts when a new session opens. Both need `autonomy.decisions: auto`.
- `on_end: new-factory` starts the next factory when the judge ends one. `release_on_end` cuts a release first, per the approved release plan.
- Hard stops: `limits` hit, any `stop_on` event. The factory writes `NEXT.md` and stops.
- Never bypassable: release plan approval, secret found, `merge-main`/`release` without a release plan.

## Release planner agent
- Runs during first `/nashworks-setup`. Reads `git tag`, `git log`, CHANGELOG, CI release workflows, branch names. Infers versioning (SemVer, CalVer), commit convention, release branches, tag format.
- No history found: suggests the common default. SemVer + Conventional Commits + annotated `vX.Y.Z` tags + `CHANGELOG.md` + releases from `main`.
- Writes `.nashworks/release-plan.md`. Needs human approval every time; no config key, `auto` mode or lights-out can skip it. Approval = user types an explicit confirmation; the record (who, when, plan hash) is stored in the file.
- After approval, every release follows the plan. The release role checks the plan hash before tagging. Plan edits need a new approval.

## Auto compactor
- Factory-wide: `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` (confirm in step 0) in the generated settings `env`. A `PreCompact` hook saves `NEXT.md` first.
- Per role: step 0 (2026-10-18) found a per-subagent setting: frontmatter `autoCompactWindow` (100000-1000000, Claude Code v2.1.296+), overridden by env `CLAUDE_CODE_AUTO_COMPACT_WINDOW`. In-process teammates honor it; split-pane teammates do not. Generated agents set `autoCompactWindow` from `roles.<name>.compact`. `strategy: handoff` (the role prompt carries a budget; at the budget the agent writes its handoff and returns, and the dispatcher re-spawns it) stays only as the fallback for older versions or split-pane teammates.
- Still to test: `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` honored from settings `env` (see `step0-platform-check.md`).

## CLAUDE.md section
Setup adds one marked block and never touches text outside it. Re-run replaces only the block. `claude_md.enabled: false` removes it.
```
<!-- nashworks:start -->
@.nashworks/CLAUDE.factory.md
<!-- nashworks:end -->
```
A factory rule that contradicts an existing project rule gets flagged and is never overwritten.

## Custom name
- `name:` in config renames the folder (`.<name>/`), the UI title, the CLAUDE.md markers and `.gitignore` entry. Setup migrates the old folder in one move.
- Slash commands keep the `/nashworks:` namespace inside the installed plugin. The namespace comes from `plugin.json` `name`, and a stable name keeps docs and support working. Setup can generate project alias commands `.claude/commands/<name>-start.md` that call the plugin commands (listed in `generated.json`).
- Full rename, commands included: `/nashworks-export`. It copies the plugin, renames plugin, commands and paths, creates the user's repo (`gh repo create`) and pushes. Human approval is required before the push.

## People + stacked PRs
```yaml
people:
  assignees: ["@me"]      # default: the gh user; [] allowed
  reviewers: []           # GitHub users or teams; [] allowed
git:
  track_factory: false
  stacked_prs: auto|always|off       # git only; off for other VCS
  stack_tool: auto|plain|git-spice|graphite
  # split size comes from review.max_diff_lines (see Prior art D)
```
- Setup asks: "Assign factory PRs and issues to you (`<gh user>`)?" and "Regular reviewers?" Empty answers are valid. `--auto` keeps `@me` and empty reviewers.
- Applied to every PR and issue the factory opens in the project: `gh pr create --assignee ... --reviewer ...`. Not applied to upstream feedback issues.
- Stacked PRs: parallel independent features use worktrees; dependent tasks inside one feature stack. `auto` stacks when the founder plans ordered dependent tasks or the diff passes `review.max_diff_lines`.
- Preinstalled caveman and ponytail go in at project scope only; setup says so. User scope would change Claude's behavior in every project.
- `stack_tool: auto` uses `git-spice` or `gt` if installed. Otherwise plain git: branch on branch, `gh pr create --base <parent>`, `git rebase --update-refs` after a lower PR changes. No new dependency.
- Resolver: stacks need `boundary >= open-pr`. Below that, the stack stays as local branches. Non-git VCS forces `off`.

## Upstream: usage count + feedback
One config block, one module:
```yaml
upstream:
  repo: nashpb/nashworks        # kept by /nashworks-export; forks can add their own repo too
  telemetry: ask|on|off         # setup asks once; --auto defaults to off
  feedback: { agents: true, auto_file: false, min_score: 4, max_per_day: 1 }
```
**Usage count (originals and forks):**
- Passive, no consent needed: GitHub stars, forks and clone/view traffic (`gh api repos/nashpb/nashworks/traffic/clones`; last 14 days only, write access required), fork network list. Public GitHub code search for `.nashworks/` and the plugin name works only for projects that commit them (`track_factory: true`, default branch, files under 350 KiB), because both are git-ignored by default (step 0, 2026-10-18).
- Opt-in ping: on `setup` and `start`, one HTTPS POST to a tiny endpoint (Cloudflare Worker + KV, free tier). Payload: random install id, plugin version, plugin name, fork flag (name or repo differs from upstream), event. No code, paths, repo names or user data.
- Disclosed in README and asked during setup. Hidden or forced pings would break user trust and plugin directory rules, and scanners flag them. A fork can switch the ping off; passive counts still see it.
- Your view: an `Adoption` tab (not the local Usage tab) in a private page (or `/nashworks-ui` when run inside your own repo) that pulls the KV counts plus GitHub stats.

**Feedback loop:**
- Agents log factory friction (role prompt gaps, missing capability, bad default, bug) to `state/feedback.jsonl` with a 1-5 score. The judge and reviewers log by default; other roles when `feedback.agents: true`.
- Local first: re-running `/nashworks-setup` reads the log and fixes what config can fix. Repeat items also go into `MISTAKES.md`.
- `/nashworks-feedback [text]`: user feedback, same pipeline.
- Triage before any issue: (1) search factory docs and config: is there an existing option that solves it? If yes, propose that fix locally and stop. (2) `gh issue list --repo <upstream> --search` for duplicates. If one exists, add a +1 comment (with approval), no new issue. (3) Otherwise draft an issue.
- Issue rules: redact code, secrets, paths and repo names. Title prefix `[agent-feedback]` or `[user-feedback]`. Labels `source:agent`/`source:user`, plus `from-fork` when a fork files it. The repo ships `.github/ISSUE_TEMPLATE/` for both.
- Filing needs human approval by default. `auto_file: true` lets agent items with score >= `min_score` file without asking, limited to `max_per_day`. Lights-out queues drafts unless `auto_file` is on.

## Contradiction resolver
Runs in the generator on every load and prints each fix:
- `features > 1` with `worktrees: false`: cap at 1 (auto) or ask (suggest/plan).
- `mode: team` under a subagent dispatcher: switch to subagent.
- `review.level: none` with `security-heavy` preset: preset wins.
- Disabled role referenced in round flow: skip its step, warn.
- `lights_out` with `boundary` past `push-branch` and no approved release plan: boundary drops to `push-branch`.
- `release_on_end: true` with no release plan: disabled until approval.
- `auto_push: true` below `push-branch`: off. Stacks below `open-pr`: local branches only.
- `suggestions.mode: auto` or `on_end` other than `stop` without `decisions: auto`: falls back to suggest.
- `gates.red_test_first` with no sdet: sde does the red commit (see Lite).
- `roles.judge.model == roles.sde.model`: judge moves to the other tier, with a warning.
- Incognito: history, upstream ping and feedback filing forced off for the session.
- Precedence: safety rules, then `config.yaml`, then preset, then defaults.

## Next-session file (`.nashworks/NEXT.md`)
One file, always current. It replaces `HANDOFF.md` (compaction handoff and session handoff were the same job). Sections:
1. **Resume:** where the current run stopped (round, feature, worktree, last gate, open andon), for compaction and crashes.
2. **Start next run:** a ready-to-use prompt (`/nashworks-start ...` with preset and goal filled in).
3. **New requirements:** captured from the user mid-session, from agent feedback and from ticket pulls; each with source and date. The planner consumes them next run and marks them done.
4. **Alternatives:** other paths the agents suggest (different preset, deferred features, cheaper config from usage stats, retro findings), each with one line of why.
- **Updated by the orchestrator** (not by agents freely) at: end of each round, `PreCompact`, `SessionEnd`, andon stop, limit stop, and whenever the user states a new requirement. Writes are section replacements, so the file never grows without bound; done requirements move to the run's history record.
- **Session start:** a `SessionStart` hook (startup, resume, clear) reads `NEXT.md` and injects a short summary. The main agent then opens with: "Continue run / add requirements / pick an alternative?" and shows the three sections briefly.
- Incognito keeps `NEXT.md` in the session temp dir, so it is gone at session end.

### Session-start suggestions (configurable)
One block controls everything shown when a session starts or is reopened (startup, resume, `/clear`):
```yaml
suggestions:
  enabled: true
  mode: suggest|auto|off          # auto starts the next run without asking; only if autonomy.decisions: auto (resolver)
  repeat: every_session|until_dismissed|once   # default every_session
  include: [preset, next_run, requirements, alternatives, config_tips]   # preset = old preset_suggestion
  max_items: 5
```
- `next_run`, `requirements`, `alternatives` come from `NEXT.md`.
- `config_tips` come from the resolver and usage stats, e.g. "auto_push is off; 6 pushes waited on you last run, turn on?" or "sde used 40% of tokens; try effort medium?".
- `until_dismissed`: the user dismisses an item ("skip that"); its id goes to `state/dismissed.json` and it does not reappear until its data changes. `every_session` shows current items on every new or reopened session.

## Auto commit and auto push
Yes, both are configurable. `autonomy.boundary` caps how far the factory can go; these toggles choose what it does inside that cap:
```yaml
git:
  auto_commit: true      # commit each task after its gates pass (Conventional Commits, round_id trailer)
  auto_push: false       # push the feature branch after each passing round
  push_on: round|feature|release
```
- Resolver: `auto_push: true` needs `boundary >= push-branch`; otherwise it is switched off with a message. `auto_commit: false` keeps changes staged per task and lists them in `NEXT.md` Resume.
- Never auto: push to `main` and force-push (`merge-main` boundary plus the release plan cover the only path to `main`).
- Supervised mode with `auto_push: false` turns the `push` human gate into a batched "push these N branches?" prompt.
- Old charter rule "agents never push; the owner commits and pushes" becomes the `lite`/`standard` default: `auto_commit: true, auto_push: false`.

## Lite mode
- `preset: lite` (replaces the earlier `lean` preset; one minimal preset, not two). It is the smallest factory that still works:
  - Roles: planner (founder), sde, judge. The sdet is optional and off by default. With no sdet, the sde writes the failing test as a separate "red" commit first; after that commit the write hook locks test paths for the rest of the task.
  - Gates: code gates only (lint, typecheck, test). Review `light`, one reviewer.
  - `parallel.features: 1`, no worktrees, no stacked PRs, no agent teams, no councils, no UI server, no release automation (the release plan still needs approval before any release).
  - Haiku/low effort on mechanical steps.
- Board, history and usage stats are **not** switched off silently. On choosing lite, setup asks: "Keep board, history and usage stats on? (they add ~0 tokens; they are local file writes)". The answer goes into config.
- Lite is the **[v0.1]** default for first-time setup on small repos. `standard` is suggested when the repo or task scope is larger.

## Board (kanban)
- One source of truth: `.nashworks/state.json` (from the orchestrator). `BOARD.md` becomes a generated view, never hand-edited.
- Columns: Backlog, Planned, In progress, Review, Blocked (andon), Done. Cards show feature, role, worktree/branch, PR link, ticket key, age in column.
- CLI: `/nashworks-board` prints the kanban as text in the terminal (also `node bin/board.js` without Claude). UI: Board tab in `/nashworks-ui` with drag to reorder Backlog and Planned only (the state machine owns later columns).
- **Ticketing integration (on by default when a provider is found):**
  - Setup detects providers at global, user and project scope: Jira through an Atlassian MCP server or connector; any other ticketing system through the generic MCP adapter (user maps its create/list/update/comment tools once in config). Detection reads `claude mcp list`, `claude plugin list` and the settings files.
  - Sync: pull tickets into Backlog; push status changes, PR links and gate evidence as comments. Created tickets get `people.assignees`.
  - Ticket writes are outward-facing, so they follow `autonomy.decisions` (suggest/plan = draft and ask, auto = write). Lights-out queues ticket writes unless `boundary >= open-pr`.
  - Agents never touch tickets unless ticketing is enabled; the old "user pushes tickets by hand" rule becomes `sync: pull` or `provider: none`.
```yaml
board:
  enabled: true
  ticketing:
    provider: auto|jira|mcp|none      # auto = first detected; mcp = generic adapter
    sync: both|pull|push
    project: ""                       # Jira project key or the provider's project id
    status_map: {}                    # column -> ticket status, prefilled per provider
    mcp_tools: {}                     # generic adapter: {list, create, update, comment} -> MCP tool names
```

## History
- One record per factory run in `.nashworks/history/<run-id>.json`: preset, config hash, start/end, rounds, outcome (judge verdict), features, PRs, tickets, releases, gate results, andons, approvals, and that run's usage stats.
- Retention: `history.max_runs: 200` (default), oldest removed first. `0` = unlimited.
- View: `/nashworks-history [run-id]` (CLI list, or one run's timeline) and a History tab in `/nashworks-ui`.

## Usage stats (local)
Collected for each run and rolled up for the whole factory. On by default; `usage.enabled: false` turns it off. These stay on the machine. They are separate from the opt-in upstream ping.
1. **Tokens and agents:** per-minute timeline; split by role, agent instance, model and phase; input, output, cache read and cache write; cost in USD; agents spawned per role (subagent vs teammate), duration, retries; compactions and handoffs.
2. **Output:** features done, fixes done, worktrees created and cleaned, PRs opened and merged, stack depth, commits, lines added and removed (`git diff --numstat` per round), files touched, tests added, releases cut, tickets synced.
3. **Quality and flow:** gate pass/fail, andon pulls, fix iterations, review findings by severity, `tests_modified_by_dev`, reverts and escaped defects, wall clock and queue time per stage, `merge_conflict_rate`.
4. **Human:** approvals, wait time per gate, override and rejection rate, `judge_human_agreement`.
5. **Efficiency:** `tokens_per_accepted_task`, cost per feature, cache hit rate, tool calls by type, hook denials (write allowlist, network).
- Data sources: agent result usage (tokens, tool uses, duration), hook events (`SubagentStop`, `Stop`), git. Step 0 (2026-10-18): session transcript JSONL is documented as internal and may change, so it is not a primary source. OpenTelemetry `api_request` events carry per-request tokens, cost and duration, but a repo `.claude/settings.json` cannot enable telemetry; the per-minute view therefore needs a user-level setup step or falls back to per-round totals. Decision pending (see `step0-platform-check.md`, open question 4).
- View: `/nashworks-stats [run-id|all]` (CLI tables and sparklines) and a Usage tab in `/nashworks-ui`.
```yaml
history: { enabled: true, max_runs: 200 }
usage: { enabled: true, bucket_sec: 60 }
```

## Incognito mode
- `/nashworks-start --incognito` (or `privacy.incognito: true`).
- Factory records (state, board, usage) go to a session temp dir, not `.nashworks/`. A `SessionEnd` hook deletes it, so data lasts until the session ends or `/clear` runs. Usage stays visible through `/nashworks-stats` while the session is alive.
- Not written: history record, `metrics.jsonl`, feedback log. No upstream ping, no feedback issues. Ticket sync pauses unless the user turns it on for that session.
- Code changes, commits, PRs and the release plan are real work and persist; setup says this plainly so users do not think incognito hides them.

## Prior art: what to add or change
Researched across AI-era plugins and frameworks, AI-era research, and pre-AI manufacturing and software theory. Items are merged by theme; duplicates across sources are folded into one line. **[v0.1]** = in the first milestone, **[v0.2]** = next milestone (trimmed from v0.1 by user choice), **[later]** = after that. Source caveats: pre-AI URLs and figures came from knowledge, not fetched; Spec Kit command names, BMAD track names and agent-teams hook names came from secondary write-ups. Step 0 re-checks the ones the build depends on.

### A. Orchestration core
- **[v0.1] Deterministic orchestrator.** The round is a state machine in code (`.nashworks/state.json` + the workflow script), not an LLM deciding the next step. Supports pause and resume. Sources: 12-factor agents (github.com/humanlayer/12-factor-agents); Anthropic "Building effective agents" (anthropic.com/engineering/building-effective-agents): workflows before agents.
- **[v0.1] Code gates before LLM gates, cheap to expensive.** Lint, typecheck, unit tests (< 10 min), then acceptance, security, then the judge. Sources: Building effective agents; Humble & Farley, *Continuous Delivery*.
- **[v0.1] One writer per partition.** The planner gives each task a `touches:` path set. Parallel writers only on disjoint sets (`parallel.partition: by_path`); read-only roles (reviewers, testers) run in parallel freely. Metric `merge_conflict_rate`. Sources: Cognition "Don't build multi-agents" (cognition.ai/blog/dont-build-multi-agents); Brooks' law; Conway's law / Team Topologies; Anthropic multi-agent research post (anthropic.com/engineering/multi-agent-research-system): multi-agent costs ~15x tokens and fits interdependent coding poorly.
- **[later] Native agent teams task list** for parallel features (shared tasks, dependencies, claim locks) instead of a custom bus, once step 0 confirms the API. Per-feature token budget and circuit breaker. Source: code.claude.com/docs/en/agent-teams.

### B. Planning and spec
- **[v0.2] Spec as source of truth.** `.nashworks/constitution.md` holds rules that cannot be broken; the judge enforces it. Acceptance criteria in EARS form ("WHEN x THEN the system SHALL y"), so the sdet maps tests 1:1. An analyze gate checks spec, plan and tasks against each other before any dev work. Sources: GitHub Spec Kit (github.com/github/spec-kit); AWS Kiro specs (kiro.dev/docs/specs); spec-driven development (github.blog).
- **[v0.1] Feature list starts failing.** The planner, acting as initializer, writes `features.json` with `passes: false`. Only QA or the judge flips a feature to passing. Dev does one feature per session (`dev.max_features_per_session: 1`). Source: Anthropic "Effective harnesses for long-running agents" (anthropic.com/engineering/effective-harnesses-for-long-running-agents).
- **[v0.2] Self-contained story files.** Each task file carries the context it needs, so the sde does not re-read the whole PRD. Source: BMAD-METHOD (github.com/bmad-code-org/BMAD-METHOD).
- **[v0.2] Planner honesty.** Underspecified tasks get `needs_clarification`, not a guess. Planner gives a confidence score; low confidence escalates to a human, even in lights-out. Tasks above `planner.max_task_hours` are split. Sources: Spec Kit `/clarify`; Devin docs (docs.devin.ai); METR task-horizon research (metr.org/blog/2025-03-19-measuring-ai-ability-to-complete-long-tasks).
- **[later] Preset picked by scope size** (quick fix vs feature vs product). Source: BMAD planning tracks.
- **[later] Work mix.** `round.mix: {feature: 60, fix: 25, debt: 15}` so features do not starve fixes and debt. Source: TPS heijunka.
- **[later] Threat model on plan.** `security.threat_model: on_plan` runs a STRIDE pass on the planner output. Source: shift-left security, OWASP SAMM (owaspsamm.org).

### C. Test and dev integrity
- **[v0.1] Red test first.** The sdet commits a failing reproduction or acceptance test before dev starts (`gates.red_test_first`). Sources: SWE-bench Verified (openai.com/index/introducing-swe-bench-verified); Agentless (arxiv.org/abs/2407.01489); superpowers TDD rule.
- **[v0.1] Per-role write allowlists, enforced by a PreToolUse hook, not by prompt.** sdet writes `tests/**` only; dev cannot edit test paths; reviewers and QA are read-only. Metric `tests_modified_by_dev`. Sources: Roo Code custom modes (docs.roocode.com/features/custom-modes); ImpossibleBench (arxiv.org/abs/2510.20270): models edit or delete tests to pass.
- **[v0.1] Deterministic setup steps.** `setup_steps:` in config plus an `init.sh` smoke test run at the start of every session and worktree. Sources: GitHub Copilot coding agent `copilot-setup-steps.yml`; Anthropic long-running harness.
- **[later] Mutation testing on changed lines.** `gates.mutation_score_min: 0.6`; catches tests that pass trivially. Source: Petrović et al., "State of Mutation Testing at Google", ICSE 2018.
- **[later] Best-of-N.** `dev.best_of_n` runs N worktrees, only when an automated test suite exists; winner by tests, then judge. Source: Large Language Monkeys (arxiv.org/abs/2407.21787).
- **[later] Architect/editor split inside sde** (strong model plans, cheap model edits) and a shared repo map. Source: Aider (aider.chat/docs/usage/modes.html, aider.chat/docs/repomap.html).
- **[later] Browser QA** with screenshots as evidence for web projects; found bugs become regression tests. Source: gstack `/qa` (github.com/garrytan/gstack).

### D. Review and judging
- **[v0.1] Two-stage review.** First "does it match the spec", then code quality and security. Source: obra/superpowers (github.com/obra/superpowers).
- **[v0.1] Evidence or not done.** The judge rejects any done claim with no attached command output or test result. The judge grades binary rubric items from `definition_of_done:`, sees the diff and test results, not the dev's reasoning. Sources: superpowers verification-before-completion; Definition of Done.
- **[v0.1] Judge bias guards.** Resolver rule: `roles.judge.model` must differ from `roles.sde.model`. **[v0.2]** A/B comparisons run in both orders and must agree. Metric `judge_human_agreement` from approval-gate outcomes. Sources: Zheng et al. (arxiv.org/abs/2306.05685); Panickssery et al. self-preference (arxiv.org/abs/2404.13076).
- **[v0.1] Small changes.** `review.max_diff_lines: 300`; bigger changes split into stacked PRs automatically. This replaces `git.stack_split_lines`. One reviewer by default; a second only on security-tagged paths. Source: Google eng-practices small CLs (google.github.io/eng-practices/review/developer/small-cls.html); Sadowski et al. 2018.
- **[v0.1] Fix rounds need new evidence.** A fix round runs only with failing test output or reviewer findings; `rounds.max_fix_iterations: 3`, then escalate. Sources: Reflexion (arxiv.org/abs/2303.11366); "LLMs cannot self-correct reasoning yet" (arxiv.org/abs/2310.01798).

### E. Flow and stop-the-line
- **[v0.1] Andon.** Any tester, QA or security role can pull `andon`. It freezes features stacked on the failing base and pings a human. The round resumes only after a root cause is logged. This merges with `autonomy.stop_on`. Source: Toyota jidoka/andon (global.toyota/en/company/vision-and-philosophy/production-system).
- **[v0.1] Escalate on repeat errors.** `errors.max_consecutive: 3`, then a structured `request_human` call. Source: 12-factor agents.
- **[later] WIP limits and bottleneck.** `limits.wip.open_prs`; planner cannot start a feature while the review queue is full. Per-stage queue age in metrics finds the bottleneck. If it is the human, cut dev parallelism and send one batched approval digest (fits the Approvals tab). Sources: Kanban (Anderson); Little's law; Theory of Constraints (*The Goal*, *The Phoenix Project*).
- **[later] Short-lived branches.** `branches.max_age_hours: 24`, `stack.max_depth: 3`. Source: trunkbaseddevelopment.com.

### F. Autonomy and safety
- **[v0.1] Lethal trifecta guard.** `security.allow_network` per role; default deny in lights-out for roles that read issues, dependencies or web content. Allowlist git remotes. Issue and web text is data, never instructions. New dependencies and install scripts go through the security reviewer. Source: Simon Willison (simonwillison.net/2025/Jun/16/the-lethal-trifecta).
- **[later] Command risk levels.** `autonomy.level: off|low|medium|high`; each shell command and MCP tool has a risk rating and auto-runs only at or below the level; a denylist always applies. Complements `boundary` (git actions). Headless CI mode stops on first failure. Source: Factory Droids auto-run (docs.factory.ai/cli/user-guides/auto-run).
- **[later] Error budget.** When change failure rate or rework rate exceeds `autonomy.error_budget`, the boundary drops one level until it recovers. Source: Google SRE book, "Embracing risk".
- **[later] Sandbox recommended for lights-out** (devcontainer or Docker). Source: OpenHands runtime (docs.all-hands.dev).

### G. Learning loop (merges MISTAKES.md, lessons, instincts, retro)
- **[v0.1] Blameless postmortem shape for MISTAKES.md:** timeline, 5 whys, contributing factors, countermeasure plus the check that verifies it. Fix the prompt or system, never blame an agent. One file, no separate `lessons.md`. Sources: Google SRE postmortem culture; Deming PDCA.
- **[v0.2] Poka-yoke promotion.** `mistakes.promote_after: 2`: a repeated entry must become a hook, lint rule or test. Metric `mistakes_promoted`. Source: Shingo, *Zero Quality Control*.
- **[later] Instincts.** Hooks record small learned behaviors with confidence; promoted to role skills or CLAUDE.md rules after repeats. Feeds the local feedback loop before any GitHub issue. Source: ECC continuous-learning-v2.
- **[later] Retro role** at the end of a factory: reads git history and metrics, proposes config changes. Source: gstack `/retro`.

### H. Metrics and evals
- **[v0.1] Objective metrics only**, never agent self-reports: wall clock, human review minutes, `tokens_per_accepted_task`, revert and rework rate, escaped defects. Every PR and issue tagged with `round_id` and prompt/preset version for traceback. Sources: METR developer RCT (metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study): devs were 19% slower while believing they were 20% faster; DevOps Three Ways.
- **[v0.1] Nashworks eval suite.** `.nashworks/evals/` (and the plugin's own `evals/`): fixed tasks re-run whenever config, model, skills or prompts change; report pass^3 and cost. This is the dogfood regression check. Sources: Anthropic agent eval practices; OpenHands SWE-bench scoring; existing `factory/judge/` A/B rules.
- **[later] DORA four keys + rework rate, SPACE human override rate.** Source: dora.dev; SPACE (queue.acm.org/detail.cfm?id=3454124).
- **[later] Control limits.** Alert only on points outside mean ± 3σ for round time, cost and escapes; no reacting to noise. Source: Deming SPC.

### I. Context and handoffs
- **[v0.1] Typed handoffs.** Role-to-role artifacts are schema-checked (required fields); the receiver can send incomplete work back. Reviewers return JSON findings, not transcripts. `handoff.max_tokens: 2000`. Sources: MetaGPT / ChatDev; Anthropic context engineering (anthropic.com/engineering/effective-context-engineering-for-ai-agents).
- **[v0.2] Append-only `.nashworks/decisions.md`** passed to every role with the full plan, so parallel writers share implicit decisions. Source: Cognition.

### J. Packaging
- **[v0.1] Haiku defaults for mechanical roles** (board, gates, formatting). Source: wshobson/agents (github.com/wshobson/agents).
- **[later] Role packs** installable separately (web QA pack, security pack, mobile pack). Source: wshobson/agents.

### Checked and skipped
- SuperClaude: personas and thinking flags are already covered by per-role model/effort.
- claude-flow (Ruflo): its own audit lists hive-mind transport and agent execution as stubs; nothing to copy.
- Kiro pattern-scoped steering: nested CLAUDE.md files already do this.

### Merged into existing config
`stop_on` + andon; `stack_split_lines` replaced by `review.max_diff_lines`; MISTAKES.md + lessons + postmortems into one file; `human_gates` gains `spec` (default on in supervised, configurable in lights-out); agent teams stay optional, default off (multi-agent token cost).

## Build order
**Milestone v0.1 (steps 0-5).** Ship this first, then the rest as v0.2+. The breadth is the biggest risk.
0. **Platform check (done 2026-10-18; results in `docs/plan/step0-platform-check.md`, open questions in `.nashworks/NEXT.md`).** Confirm: subagent frontmatter `skills:`/`effort:`; `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`; per-subagent compaction; agent teams enablement and per-teammate config; `/reload-plugins` vs restart; `claude plugin install --scope project`; plugin command namespace; GitHub traffic API retention (14 days, so the usage tab needs a daily cron to persist counts); code search coverage of forks; `SessionEnd` fires on `/clear`; per-message usage fields in session transcripts; OpenTelemetry export; how Jira and other ticketing MCP servers show up in `claude mcp list` / `claude plugin list` per scope. Adjust sections that fail.
1. **Fresh repo (done).** This repo was started clean from a scrubbed tree in one commit, authored with the GitHub noreply address. The old private repo stays as an archive and is never made public. A local pre-commit hook blocks banned words; its word list lives outside the repo (`~/.nashworks-banned.txt`).
2. **Plugin skeleton (hand-built).** `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `commands/`, `agents/`, `skills/nashworks/SKILL.md` (charter as skill). Write generic roles from this plan (roles, round, rubric) and ECC upstream. Vendor the ECC subset with license notice and pinned commit: `code-reviewer`, `security-reviewer`, `refactor-cleaner`, `tdd-workflow`, plus `build-error-resolver` and `verification-loop` merged into build-fixer and `verify-gate`.
3. **Config, generator and resolver (hand-built).** Writes prefixed agents, settings, `CLAUDE.md` block, `.gitignore`, `generated.json`. Node (no deps beyond a YAML parser, or JSON config if a parser would be the only dep). One assert-based self-check covers each resolver rule.
4. **Release planner agent and `/nashworks-setup`** (stack detection, project-scope preinstall, `--auto`, `--uninstall`). Built by Nashworks v0 on itself.
5. **Round workflow.** Port `judge/round.workflow.js` as the deterministic state machine: N parallel features partitioned by path, worktree per feature, stacks, red-test-first, write-allowlist hook, code gates then two-stage review, andon, max 3 fix rounds, boundary, typed handoffs, approvals and metrics logging. All **[v0.1]** items from Prior art land here or in steps 2-4. The eval suite is set up alongside, so every later step is measured.
5b. **Lite preset, CLI board, history, usage collection, `NEXT.md` + session-start suggestions, auto commit/push toggles, lights-out with the network guard** (`/nashworks-board`, `/nashworks-history`, `/nashworks-stats`).

### v0.1 slice (cut 2026-10-18)
The breadth above was the biggest risk, so v0.1 is the smallest factory that installs, configures itself and finishes one feature with evidence. Everything else moves to v0.2 (the **[v0.1]** tags in Prior art are read through this list; a tag not listed here means v0.2).
- **In v0.1:** steps 1-5 with only: `lite` preset (the sole preset); `config.yaml` + `config.schema.json` for the keys below; generator and resolver (rules touching in-slice keys only); `/nashworks:setup` (`--auto`, `--uninstall`) with release planner; `/nashworks:start`; one feature at a time, one worktree; round = planner → (red commit) → sde → code gates → judge; `NEXT.md` with Resume and Start next run; auto commit (push stays off); README draft.
- **In-slice config keys:** `name`, `roles`, `plugins`, `review.level` (`none|light`), `autonomy.decisions`, `autonomy.boundary` (capped at `feature-branch`), `autonomy.limits`, `autonomy.stop_on`, `git.auto_commit`, `git.track_factory`, `claude_md`, `compact`, `history`/`usage` flags (written, collected from v0.2).
- **Prior-art tags kept in v0.1:** deterministic orchestrator; code gates before LLM gates; feature list starts failing; red test first; per-role write allowlists (PreToolUse on `agent_type`); deterministic setup steps; evidence-or-not-done; judge model differs from sde model; fix rounds need new evidence (max 3); andon and escalate-on-repeat-errors; typed handoffs; MISTAKES.md postmortem shape; objective metrics (wall clock, rounds, gate results only); the plugin's own eval suite (`claude plugin eval`); Haiku for mechanical roles.
- **Moved to v0.2:** `standard`, `max-quality`, `security-heavy`, `lights-out` presets and lights-out mode; parallel features, partitioning, stacked PRs; two-stage review, ECC security reviewer, semgrep; board, history, usage collection, suggestions blocks; lethal-trifecta network guard; auto push; incognito; ticketing; UI; custom name and export; upstream module; agent teams; councils.
- **Scope check:** anything else found mid-build goes to `NEXT.md` New requirements, not into v0.1.

## Roles (v0.1 set; later roles are v0.2+)
| Role | Job | Model tier | Tools | Writes | In `lite` |
|------|-----|-----------|-------|--------|-----------|
| planner (founder) | Turn the goal into `features.json` (`passes: false`), tasks with `touches:`; writes the release plan draft | strong, medium effort | read, write `.nashworks/` | `.nashworks/**` only | yes |
| sde | Implements one feature; writes the red test first when no sdet | mid, medium effort | read, edit, bash | source paths; test paths locked after the red commit | yes |
| sdet | Writes failing tests before dev | mid | read, edit, bash | `tests/**` only | off by default |
| judge | Grades `definition_of_done`, flips `passes`, pulls andon; sees diff and test output, not dev reasoning | different model than sde | read, bash (read-only) | `.nashworks/state/**` | yes |
| code-reviewer (ECC, vendored) | One light review on the RC diff | mid | read | none | yes when `review.level: light` |
| build-fixer | Fixes lint/type/test failures from gate output | Haiku | read, edit, bash | source paths | on demand |
| release | Cuts a release per the approved plan; checks plan hash | mid | bash, git | tags, CHANGELOG | no (v0.2) |
Names follow the role files in `roles/`; `planner` replaces the older "founder" wherever both appear.

**v0.2+:**
5c. **[v0.2] prior-art items:** constitution, EARS criteria and analyze gate, story files, planner confidence and clarification, `decisions.md`, judge A/B ordering, poka-yoke promotion.
6. **`/nashworks-ui`** (all tabs), **ticketing sync** (Jira + generic MCP adapter), **incognito mode**.
7. **Custom name, `/nashworks-export`, agent teams switch.**
7b. **Upstream module.** Feedback log, triage, `/nashworks-feedback`, issue templates, opt-in ping, Cloudflare Worker (deployed by you; I write it and the deploy steps).
8. **README and publishing** (below). README draft ships with v0.1.

## README + publishing (repo only, not part of the factory)
- `README.md`: what it is, install (`/plugin marketplace add nashpb/nashworks`, `/plugin install nashworks@nashworks`), quick start, config reference, presets, lights-out safety, credits for ECC, caveman and ponytail.
- Publishing: make the rewritten `nashworks` repo public (employer cleared by user). Add `marketplace.json`. Tag `v0.1.0` per its own release plan. Submit to the official Claude Code plugin directory through the developer portal at claude.ai/directory/manage (needs a paid claude.ai plan; run `claude plugin validate --strict` first; there is no `PublishPlugin` tool, step 0 2026-10-18) and community lists (awesome-claude-code style repos). Post a short demo GIF.

## Dogfood
The earlier factory was tied to its first project, so it cannot judge a plugin repo. Hand-build steps 2-3 as Nashworks v0. Then Nashworks v0 runs on its own repo and builds steps 4+. Founder plans them as tasks. Judge rubric: plugin installs, setup generates valid agents, resolver fixes conflicts, gates block bad RCs, release plan cannot be bypassed.

## Verification
- `plugin-dev:plugin-validator` passes.
- Scratch repo: `/nashworks-setup --auto` creates `.nashworks/`, agents, settings and the CLAUDE.md block. It stops at release plan approval even with `--auto`.
- Setup run twice: one `.gitignore` line, one CLAUDE.md block, text outside markers unchanged.
- `name: acme` moves the folder to `.acme/` and updates UI title and markers.
- Resolver: `features: 3, worktrees: false` gets capped; lights-out with no release plan drops the boundary.
- Lights-out, `boundary: feature-branch`, `on_end: new-round`: runs 2 rounds unattended, never pushes.
- Planted secret: lights-out stops, writes `NEXT.md`.
- `parallel.features: 2`: two worktrees created and cleaned up.
- The banned-words pre-commit hook passes on every commit; `git log --format=%ae` shows only the noreply address.
- `parallel.features: 2` with worktrees: both features read `config.yaml` and write `BOARD.md` in the main worktree's `.nashworks/`.
- `git status` after setup with `track_factory: false`: clean except `.gitignore` and the CLAUDE.md block. Existing `.claude/agents/code-reviewer.md` is untouched.
- `--uninstall`: removes every path in `generated.json`, the block and the ignore line; nothing else changes.
- caveman and ponytail install at project scope only (`claude plugin list` in another dir does not show them); vendored ECC agents show in `/agents`.
- Feedback: an item that config already solves gets a local fix and no issue. A duplicate gets a +1 draft. A new item gets a redacted `[agent-feedback]` draft with the right labels. Nothing is filed without approval while `auto_file: false`.
- Scratch repo with remote: PR opened by the factory has `@me` assignee and configured reviewers; empty lists open it with none.
- Two dependent tasks with `stacked_prs: always`: PR 2 bases on PR 1's branch; after PR 1 changes, rebase updates PR 2.
- Lite preset: only planner, sde and judge agents are generated; setup asks about board, history and usage instead of switching them off.
- `/nashworks-board` shows a card moving Planned, In progress, Review, Done during a run; `BOARD.md` matches `state.json`.
- A generic ticketing MCP is installed: setup detects it, pulls one ticket into Backlog, pushes a status change after approval. Same check with a Jira MCP. No provider: board works without sync.
- `history.max_runs: 3` and 4 runs: oldest record removed. `/nashworks-history <id>` shows that run's timeline.
- `/nashworks-stats <run-id>`: per-minute tokens add up to the run total; per-role split, LOC added/removed match `git diff --numstat`; worktree count matches the worktrees created.
- `auto_push: true` with `boundary: feature-branch`: resolver turns it off and says why. `auto_commit: true`: one commit per passing task with the `round_id` trailer.
- Suggestions: with `repeat: until_dismissed`, a dismissed tip does not show on the next session; with `every_session` it does. `config_tips` names a real config key and value.
- `NEXT.md`: after a round, all four sections are current. A new session (and after `/clear`) opens with the continue / add / alternative suggestion. A requirement stated mid-session appears under New requirements and is consumed by the next run's planner.
- Incognito: stats visible during the session; after `/clear` the temp dir is gone; no file under `.nashworks/history/` and no `metrics.jsonl` line was written.
- Telemetry `off`: no network call (checked with a fake endpoint). `on`: one ping per event with only the listed fields.

