# Changelog

All notable changes to `@pankil/agent-skills` and its skills. Format: [Keep a Changelog](https://keepachangelog.com), versions follow [SemVer](https://semver.org).

Every entry states: **what changed**, **breaking?**, and **migration** (what an installed user or agent must do). Project data (`.memory/`, source code, configs) is never modified by `update`.

## How to update (users & agents)

```bash
npx github:Pankil02/AgentSkills update --dry-run   # preview: shows vX → vY per install
npx github:Pankil02/AgentSkills update             # apply (old copies backed up)
```

- Scans project (`cwd`) and global scopes for every supported agent; updates only skills that are installed.
- Copies: staged, swapped atomically, old version kept in `<agent-dir>/.agent-skills-backups/`. Use `--no-backup` to skip.
- Symlinks to your own clone: left alone → run `git pull` in the clone.
- Broken or npx-cache symlinks: replaced with a persistent copy.
- `skills.sh` users: `npx skills@latest update`.
- After updating, apply any **Migration** steps listed below for versions between your old and new version.

---

## [2.1.0] — 2026-09-30

### `project-memory` 2.1.0 (non-breaking, backward-compatible entry points & routing)
- **Added**:
  - Typed fact catalog `.memory/.meta/entrypoints.json` (schemaVersion 1) as single source of truth for repository shape, scopes, entry points, and verification commands.
  - Task and path routing CLI command: `memory route [--task <t>] [--for-path <p>] [--limit <n>]` providing deepest matching scopes, start paths, and verification commands without deep scanning.
  - Continuous synchronization of root `AGENTS.md` managed block (`<!-- memory:start -->` ... `<!-- memory:end -->`) and `.memory/index.md` with strict byte-budget compaction (< 4,000 bytes target, < 6,000 bytes hard limit).
  - Human instruction review engine: `memory agents-sync --review` audits unmanaged human instructions, reporting marker issues, broken local links, and oversized files. `memory apply-review --plan-file <f> --approval <a>` applies exact byte-offset patches with base sha256 validation while strictly prohibiting edits to managed blocks.
  - Entry-point quality evaluation and rubric: `memory validate --entrypoints --quality` scoring across orientation, scope ownership, task routing, verification, freshness, context economy, and semantic clarity (100-point rubric + binary safety gates).
  - Support for generic repositories without forced DDD architecture via `architectureMode: "unconfirmed" | "ddd" | "other"`.
- **Breaking**: no. Existing 0.3 bundles continue to function identically; entrypoints catalog is automatically created on next `sync`.
- **Migration:** none. Run `memory sync` to generate the entry points catalog and refresh `AGENTS.md`.

### `software-design-patterns` 2.0.0, `plan-walkthrough` 1.0.0
- No change.

---

## [2.0.0] — 2026-09-27

### `project-memory` 2.0.0 (breaking; bundle format 0.2 → 0.3)
- **Removed**: goal/requirements tracking (`goal.md`, `REQ`/`AC` IDs, lifecycle states, completion checks), task tracking (`tasks.md`, active-task caps, time estimates), `progress.md`, ADHD rules, Grill-Me interviews, `/mem-tasks`, `/mem-reflect`, the Pi `complete` action, and the duplicate `memory-*` workflow files.
- **Added**: `conventions.md` (commands, `MUST`/`NEVER` rules, pitfalls; governs every path in `memory check`); `decisions/D-NNN-slug.md` via `memory decide` (records rejected options and supersession; only accepted decisions govern); `memory decisions`; `memory log` with `--recent/--type/--since/--query/--all` reads and `--add` writes; monthly log archiving to `log/YYYY-MM.md` during `memory sync`; `/mem-log` workflow; Pi `memory_apply record_decision`.
- **Changed**: root `index.md` is a pure router showing recent decisions, recent activity, and scopes (about 2 KB). Scope `agents.md` is a brief (Purpose, Map, Rules, Pitfalls). All adapters (Pi, Kilo, Antigravity, AGENTS.md block) share one on-demand loading preamble. Key changes require 2–3 options with one (Recommended) and explicit approval. `archive/` is read-only.
- **Breaking**: yes. The 1.x CLI cannot write 0.3 bundles, and 2.0 refuses to write 0.2 bundles until you migrate.
- **Migration:** in each project with `.memory/`, run `memory migrate --dry-run`, then `memory migrate`, then `memory validate`. Old `goal.md`, `progress.md`, `tasks.md`, the root `index.md`, and 0.2 scope `agents.md` files are copied byte-for-byte to `.memory/archive/legacy/<same path>`; the log is kept. Kilo/Antigravity installs: re-run the installer with `--force`, then delete the old `.kilo/command/` or `.agents/workflows/` files `memory-*.md`, `mem-reflect.md`, and `mem-tasks.md`. Removed reference files: `skills/memory/references/interviews.md` and `maintenance.md` (guidance is now in `SKILL.md`). Guide: `project-memory/skills/memory/references/upgrade.md`.

### `software-design-patterns` 2.0.0, `plan-walkthrough` 1.0.0
- No change.

---

## [1.3.0] — 2026-09-28

### `plan-walkthrough` 1.0.0 (new skill, non-breaking)
- Plans only: investigates code, records decisions with rejected alternatives, saves plan to `docs/plans/`, replies with a short walkthrough + copy-paste handoff prompt for a fresh agent chat.
- **Migration:** none. Install: `npx github:Pankil02/AgentSkills install plan-walkthrough`.

### `project-memory` 1.4.0, `software-design-patterns` 2.0.0
- No change.

## [1.2.0] — 2026-09-27

### Added
- `update` / `upgrade` CLI command (`--dry-run`, `--json`, `--scope`, `--no-backup`, skill filter).
- `CHANGELOG.md` as the single source of upgrade/migration notes.

### Changed
- Installs run from an npx/bunx cache now copy instead of symlinking (cache symlinks broke when the cache was purged).
- `--version` reads from `package.json`.

### `software-design-patterns` 1.1.0 → 2.0.0 (breaking file layout)
- Rewritten as a minimal, knowledge-only skill: `SKILL.md` (rules + symptom→pattern router) + 6 references: `solid`, `creational`, `structural`, `behavioral`, `decisions`, `architecture`.
- Covers SOLID, all 23 GoF patterns, DDD, architecture, distributed/resilience patterns; enforces SOLID + pattern-by-symptom.
- Removed: `assets/`, `evals/`, `examples/`, `scripts/validate.py`, and old `references/*-patterns.md`, `comparisons.md`, `review-playbook.md`, `coverage-index.md`, `further-reading.md`.
- **Migration:** run `update`. Removed files disappear from the installed copy (kept in backup). If your own docs/rules link to removed reference files, repoint them:
  - `object-patterns.md` → `creational.md` / `structural.md` / `behavioral.md`
  - `comparisons.md`, `review-playbook.md` → `decisions.md`
  - `architecture-patterns.md`, `domain-data-patterns.md`, `distributed-concurrency.md` → `architecture.md`

### `project-memory` 1.4.0
- No change. Legacy `.memory/` layouts: run `memory migrate --dry-run` then `memory migrate` (see `project-memory/UPGRADE.md`).

## [1.1.0]
- Baseline release: `install`, `list`, `doctor`, `validate`, `uninstall`; `project-memory` 1.4.0, `software-design-patterns` 1.1.0.
