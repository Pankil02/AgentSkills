# Synchronize Project Memory

Refresh fingerprints and generated views, validate bundle integrity, report status, or register/integrate sources.

1. Activate the `project-memory` skill.
2. If a source path or URL argument was supplied (e.g. `/mem-sync docs/spec.md` or `https://...`):
   - Run `memory record --source <path|url> --json`.
   - Integrate supported claims with citations into existing wiki pages.
3. Standard sync (`/mem-sync`):
   - Run `memory sync --json`. (Pass `--fetch-remote` to refresh approved URL sources).
   - Review changed repository paths, index changes, and validation status output.
4. Report status: active scope, goal status, blockers, source freshness, and next action.
