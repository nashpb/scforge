# Step 0: platform check (2026-10-18)

Checked against code.claude.com docs (fetched 2026-10-18), GitHub docs, and local CLI `claude` 2.1.302.
Verdicts: **confirmed**, **changed** (plan edited), **unknown** (not documented; do not build on it without a test).
Caveat: the docs agent read only the first ~100k characters of the hooks and env-vars pages.

## Agents and context

| # | Item | Verdict | Facts | Plan impact |
|---|------|---------|-------|-------------|
| 1 | Subagent `skills:` and `effort:` | confirmed | `skills` (list, preloaded, max 32); `effort` low/medium/high/xhigh/max. Unknown frontmatter keys are silently ignored. | none |
| 2 | `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` | confirmed, partly unknown | Range 1-100; can only lower the threshold; applies to main session and subagents. Honored from settings `env`: **unknown**. | Auto compactor: test the `env` path in the generated settings before relying on it. |
| 3 | Per-subagent compaction | **changed** | Frontmatter `autoCompactWindow` (int 100000-1000000, v2.1.296+); env `CLAUDE_CODE_AUTO_COMPACT_WINDOW` overrides it. In-process teammates honor it; split-pane teammates ignore it. | Auto compactor: use `autoCompactWindow`; `strategy: handoff` becomes the fallback for older versions only. |
| 4 | Agent teams | confirmed, partly unknown | `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` (shell or settings `env`), experimental, interactive sessions only. `teammateMode` setting. Model order: spawn prompt, subagent `model`, `CLAUDE_CODE_SUBAGENT_MODEL`, lead. Skills from the definition are NOT applied to teammates. Hooks: `TeammateIdle`, `TaskCreated`, `TaskCompleted`. Per-teammate env: **unknown**. | Teams stay optional/last. `roles.<name>.skills` does not work in team mode. |
| 5 | Hooks | confirmed, one unknown | `PreCompact` (manual/auto), `SessionStart` (startup, resume, clear, compact, fork), `SessionEnd` (clear, resume, logout, prompt_input_exit, other). `additionalContext` capped at 10,000 chars. `SessionEnd` default timeout 1.5 s (raise per hook, max 60 s). `SessionEnd` firing on `/clear`: **unknown** (the `clear` matcher implies it). | Incognito cleanup needs a raised `timeout`; test `/clear` by hand. NEXT.md injection must stay under 10k chars. |
| 6 | PreToolUse path blocking | confirmed | Deny via JSON `permissionDecision: deny` or exit 2. Hook input has `agent_id` and `agent_type`, so per-role allowlists work. Path field in examples: `tool_input.file_path`. | Write-allowlist hook is feasible. Full Write/Edit input schema not verified. |
| 7 | Transcript usage fields | **changed** | JSONL entry format is documented as internal and may change. | Usage stats must not parse transcripts as the primary source. |
| 8 | OpenTelemetry | confirmed, with a catch | `CLAUDE_CODE_ENABLE_TELEMETRY=1` plus OTLP env. `api_request` event carries input/output/cache tokens, `cost_usd`, `duration_ms`, `model`. Repo `.claude/settings.json` cannot enable telemetry. | Usage stats: the per-minute view needs a source other than repo settings (see "Open questions"). |

## Plugins and packaging

| # | Item | Verdict | Facts | Plan impact |
|---|------|---------|-------|-------------|
| 9 | `/reload-plugins` | confirmed; `/reload-skills` **changed** | `/reload-plugins [--force]` applies changes without restart. No `/reload-skills` command exists. Claude calling it: **unknown** (docs describe it as user-run; refused over remote connections). | Plan Verdict section edited. |
| 10 | `claude plugin install --scope` | confirmed | `user` (default), `project` (`.claude/settings.json`), `local` (`.claude/settings.local.json`); writes `enabledPlugins`. Local > project > user. | none. Project scope is committed, so the preinstall of caveman/ponytail follows the `track_factory` choice. Use `local` when `track_factory: false`. |
| 11 | Namespacing and components | confirmed | `commands/*.md` become `/<plugin>:<file>`; agents `<plugin>:<agent>`; hooks in `hooks/hooks.json` (top-level `hooks` key); `bin/` is on the Bash PATH; `.mcp.json` supported. `${CLAUDE_PLUGIN_ROOT}` works in hook and MCP commands but is NOT in the Bash tool environment. | Scripts called by Claude must go through `bin/` on PATH, not a root variable. |
| 12 | Manifests | confirmed | `plugin.json`: only `name` required (kebab-case). `marketplace.json`: `name`, `owner`, `plugins[]` (each `name` + `source`). One-step install: `/plugin install name --marketplace owner/repo` (v2.1.275+). | Step 2 can add `marketplace.json` as planned. |
| 13 | Directory submission | **changed** | No `PublishPlugin` tool. Submit at claude.ai/directory/manage (needs a paid claude.ai plan); run `claude plugin validate --strict` first. `claude-plugins-official` does not take portal submissions. | Publishing section edited. |
| 14 | MCP visibility | unknown | `claude mcp list` scope filtering and plugin-server listing are not documented. Plugin servers show in `/mcp` as `plugin:<plugin>:<server>`. `claude plugin list --json` exists. No Jira example in docs. | Ticketing detection needs a hands-on test with a real Jira MCP. |
| 15 | Plugin subagent limits | **changed** | Plugin agents ignore `hooks`, `mcpServers`, `permissionMode`, `initialPrompt`. | Generated agents go to `.claude/agents/`, where the fields work. The plugin's own hooks go in `hooks/hooks.json`. |

## Web and local checks

| # | Item | Verdict | Facts |
|---|------|---------|-------|
| 16 | GitHub traffic API | confirmed | Last 14 days only; needs write access to the repo. The daily cron to persist counts is required. |
| 17 | Code search and forks | unknown, with a catch | Docs do not mention forks. Default branch only; files over 350 KiB excluded. `.scforge/` is git-ignored by default, so a search for it finds almost nothing; `.claude/settings.local.json` is ignored too. Passive counting by code search only sees projects with `track_factory: true`. |
| 18 | Local CLI | confirmed | `claude` 2.1.302. `claude plugin` has `validate`, `tag`, `eval`, `details`, `init`. No Jira MCP installed here, so item 14 cannot be tested yet. |
| 19 | Main-worktree resolution | confirmed (2026-10-18, step 3) | In the main checkout `git rev-parse --git-common-dir` prints `.git` (relative); from a linked worktree it prints the main `.git` path. `lib/paths.js` `factoryRoot` resolves both to the main checkout, covered by `test/run.js` against a real temp repo and worktree. |

## Useful finds not on the original list
- `claude plugin eval` runs `evals/**/case.yaml` (or `prompt.md` + `graders/*.md`) against a plugin with a no-plugin baseline. This can be the plugin's eval suite runner (Prior art H).
- `claude plugin validate`, `claude plugin tag` (creates `{name}--v{version}` tags), and `claude plugin details` (token cost) exist. They can replace some of the planned `plugin-dev` checks and the tagging step.

## Open questions (carried to `.scforge/NEXT.md`)
1. `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` from settings `env`: test.
2. `SessionEnd` on `/clear`: test.
3. Per-teammate env: test, only if agent teams are built.
4. Usage stats source: OTel cannot be switched on from repo settings, so choose between a user-level setup step, hook-based counting (`SubagentStop`, `Stop` hooks), or `claude -p --output-format json` for headless rounds.
5. `claude mcp list` and `claude plugin list --json` with a real Jira MCP: test.
6. ~~Linked-worktree `--git-common-dir`~~: done, see item 19.
7. Whether Claude can run `/reload-plugins` itself: treat as no.
