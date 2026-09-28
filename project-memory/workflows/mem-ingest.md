# Re-scan Codebase into Project Memory

Refresh observed facts after the codebase has grown or changed shape.

1. Load the `project-memory` skill.
2. Run `memory init` (idempotent: it adds missing files and never overwrites existing ones), then `memory sync --json`.
3. Read the `changedPaths` and `affectedScopes` in the output. For each affected scope, open only its `agents.md` and update Map if entry points, routes, or schemas moved.
4. Stale architecture flows (the `stale-flow-fingerprint` / `stale-repo-path` warnings from `memory validate`): update only the affected `Flow.md`.
5. New top-level areas found? Propose tracking them (2-3 options, one Recommended) before `memory scaffold --scope <path>`.
6. Log one entry: `memory log --add --type finding --title "Re-scanned codebase" --summary "<what moved>"`.
