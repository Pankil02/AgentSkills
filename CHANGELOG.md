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
