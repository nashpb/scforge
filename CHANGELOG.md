# Changelog

## 0.1.0 - 2026-10-20

First release.

### Added
- Config keys for persona, theme and mascot, with resolver rules.
- Theme-pack mechanism: agent names and persona blocks come from external packs.
- Theme pack loader.
- `scforge-gen --confirm-persona` gate for hard persona and `override_rules`.
- Council roles run on sonnet medium.
- Secret gate, commit guard and round workflow.
- `scforge-round` flip rejects a non-plain verdict.

### Changed
- Renamed nashworks to scforge.

### Fixed
- Pack preset ids parsed by regex; bad preset names refused at load.
- Pack loader hardened.
- LF line endings restored on files converted to CRLF.
- Secrets step in round workflow and `start.md` scans from merge-base.

### Known gaps (moved to 0.2)
- Write-allowlist PreToolUse hook (allowlists are a prompt rule only).
- Eval suite in `evals/`.
- `setup_steps` and `init.sh` smoke test.
- `MISTAKES.md` postmortem file.
- `claude plugin validate .` warnings.
- Presets and a first external theme pack (separate repo).
- Config override for the rules that cannot be broken.
