# Changelog

## 0.1.0 - 2026-10-20

First release.

### Added
- Config keys for persona, theme and mascot, with resolver rules.
- Strawhat theme: agent names and persona blocks.
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
