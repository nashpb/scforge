<!-- scforge:start -->
@.scforge/CLAUDE.factory.md
<!-- scforge:end -->

# Branching (git-flow)
- `main` holds released code only; `development` is integration. Never commit straight to either.
- Feature work: `feat/*` or `fix/*` from `development`, PR into `development`.
- Release: after all PRs merge, cut `release/X.Y.Z` from `development`; bump version, CHANGELOG and docs there. Open two PRs: release to `main` and release to `development`. Tag `vX.Y.Z` (annotated) on `main` after merge, then a GitHub Release.
- Hotfix: `hotfix/*` from `main`, PRs to `main` and `development`.
- Push only when the owner asks. Never force-push `main` or `development`.
