# Upgrading to Project Memory 2.0 (format 0.3)

## What changed

- **Removed:** goal/requirements tracking (`goal.md`, `AC-NNN`, lifecycle states, completion), task tracking (`tasks.md`, active-task caps, time estimates), `progress.md`, the ADHD rules, the Grill-Me interviews, and `/mem-tasks` and `/mem-reflect`.
- **Added:** `conventions.md`, `decisions/D-NNN-*.md` (via `memory decide`), `memory log` with filtered reads (`--recent/--type/--since/--query/--all`), monthly log archiving in `memory sync`, and `/mem-log`.
- **Changed:** scope `agents.md` is now a short brief (Purpose, Map, Rules, Pitfalls). The root `index.md` is a pure router. Only accepted decisions govern paths. `conventions.md` applies to every path in `memory check`.

## Migrate

```sh
memory migrate --dry-run   # lists files to archive and create
memory migrate
memory validate
```

The migration:

1. Copies the old root `index.md`, every `goal.md`/`progress.md`/`tasks.md`, redundant scope `index.md` files, and 0.2-style scope `agents.md` files byte-for-byte into `.memory/archive/legacy/<same path>`.
2. Removes the legacy files from the live bundle and rebuilds each scope `agents.md` as a brief. The old architecture summary becomes `## Map`; `code_refs` and `governance` are kept.
3. Creates `conventions.md` and `decisions/index.md`, plus any mandatory architecture flows that are missing.
4. Writes a new router, appends a `migration` log entry, and syncs indexes and `AGENTS.md`.

Existing `log.md` history is kept as-is. Re-running the migration is a no-op. If an archive target already exists with different content, the migration stops and changes nothing.

## After migrating (agent checklist)

1. Read `.memory/archive/legacy/goal.md` (if present). Propose rules to move into `conventions.md` and past choices to record with `memory decide`. Ask the user first (2–3 options, one Recommended).
2. Drop requirements and tasks; keep them in your issue tracker.
3. Scope `agents.md`: fill in `## Purpose` (one line).

## Installed skill update

```sh
npx github:Pankil02/AgentSkills update --dry-run
npx github:Pankil02/AgentSkills update
```

Then run `memory migrate` in each project that has a `.memory/`. Kilo and Antigravity installs: re-run the installer with `--force`. The workflow files are now `mem-init`, `mem-ingest`, `mem-sync`, and `mem-log`; delete the old `memory-*.md`, `mem-reflect.md`, and `mem-tasks.md` copies.
