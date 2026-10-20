# Start here (new machine / new Claude account)

1. Clone: `git clone https://github.com/nashpb/scforge`
2. Set the repo identity: `git config user.name "Nishadh P B"` and `git config user.email nashpb@users.noreply.github.com`
3. Install the scrub hook: create `~/.scforge-banned.txt` (one banned word per line, kept outside the repo), then `cp hooks/pre-commit-scrub.sh .git/hooks/pre-commit`.
4. Install: Node 20+, `gh` logged in as `nashpb`.
5. Claude Code plugins used while building: caveman, ponytail, superpowers, plugin-dev.
6. Read `docs/plan/nashworks-plan.md`. Work only on v0.1 items (steps 0-5b) first.
7. First prompt for Claude: the "Start next run" line in `.scforge/NEXT.md`.

## Layout
- `.claude-plugin/plugin.json`: manifest (version 0.1.0).
- `agents/ commands/ skills/scforge/ hooks/ bin/ presets/ evals/ ui/ worker/ .github/ISSUE_TEMPLATE/`: empty plugin folders from the plan.
- `workflows/round.workflow.js`: round workflow driving the `scforge-round` steps.
- `roles/`: optional decision and product council roles.
- `.scforge/`: the factory's own state dir for dogfooding. Git-ignored by design; the skeleton is force-added so it travels.
