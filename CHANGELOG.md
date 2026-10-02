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

## [3.0.0] — 2026-10-02

### `feature-proposal` 2.0.0 (token-free localhost viewer, prompt quality gates & quantitative rubric, BREAKING)
- **Token-Free Localhost Presentation (Breaking)**:
  - Eliminated per-session capability tokens, `#token=...` URL fragments, and `Authorization: Bearer <token>` headers from the local HTTP viewer.
  - Server binds strictly to IPv4 `127.0.0.1` and displays a clean, direct loopback URL: `http://127.0.0.1:<port>/`.
  - Reloading, bookmarking, and opening multiple browser tabs no longer require passing or restoring authentication tokens.
- **API Contract Updates (Breaking for Custom API Integrations)**:
  - `/api/proposal`, `/api/tabs/:id`, and `/api/source/:id` endpoints require zero authentication tokens or headers.
  - Host authority (`127.0.0.1:<port>`), Origin matching, fetch-metadata (`Sec-Fetch-Site`), and filesystem traversal boundaries remain strictly enforced.
  - `startViewer()` programmatic interface no longer returns or accepts `token`.
- **Enforced Agent Rules & Quality Gates (Breaking for Agent Generation Contract)**:
  - **Intake Discipline**: Strict limit of ≤3 blocking questions; non-blocking unknowns must be recorded as explicit labeled assumptions (`ASM-01`, `ASM-02`).
  - **Evidence-First Contract**: Code inspection must cite exact `path:line` or `symbol` references; metrics must be explicitly tagged as `observed`, `target`, `estimate`, or `assumption`.
  - **Quantitative System Design Rubric**: Enforces explicit workload mathematics (peak QPS, Little's Law concurrency, payload wire/compressed bytes, connection occupancy) and specialist coverage across database, compute, latency percentiles (p50/p95/p99), and object storage.
  - **Zero Unsupported Guarantees**: Prohibits speculative claims ("infinitely scalable", "zero downtime", "100% secure") and canned microservice architectures without measured workload justification.
  - **Justified N/A**: Non-applicable dimensions (e.g., no DB for local client UI) must document an explicit technical rationale and a revisit trigger.
- **Robustness, Navigation & Accessibility**:
  - Single-flight refresh coordination with two-version snapshot retention (current and previous last-good).
  - Structured diagnostics envelope for syntax, manifest, or compile errors without dropping active viewer sessions.
  - Full WAI-ARIA tabstrip compliance with manual arrow-key roving tabindex, Home/End jump keys, Enter/Space activation, real tabpanels, skip navigation, and accessible SVG alternative data tables.
- **Data & Schema Compatibility**:
  - Existing proposal bundles remain `schemaVersion: 1` and require zero data conversion or manual edits.
- **Migration**:
  1. Preview updates across agents and scopes:
     ```bash
     npx github:Pankil02/AgentSkills update --dry-run
     ```
  2. Apply the update:
     ```bash
     npx github:Pankil02/AgentSkills update
     ```
  3. Stop any currently running viewer process and restart it:
     ```bash
     node <skill>/scripts/proposal.mjs view --plan docs/proposals/YYYY-MM-DD-<slug>/proposal.md
     ```
  4. Open the plain loopback URL (e.g., `http://127.0.0.1:4317/`).
  5. If you have custom scripts or tools calling `/api/proposal` or `/api/tabs/:id`, remove the `Authorization` header.
  6. Existing proposal files and directories require no migration.

---

## [2.6.0] — 2026-10-02

### `feature-proposal` 1.4.0 (system design architecture SVG icons, non-breaking)
- **Authentic System Design Architecture Icons**:
  - Replaced plain emojis with a full vector SVG catalog of 20+ specialized system architecture and cloud design icons:
    - **`cdn`**: Global content delivery network with edge server nodes and signal broadcast links.
    - **`database` / `sql`**: Multi-tiered disk cylinder database with platter rims and query indicators.
    - **`redis` / `cache`**: Isometric stacked in-memory cache plates with indicator markers.
    - **`browser` / `frontend`**: Browser window with top window controls and web globe.
    - **`app-server` / `compute`**: Microprocessor / CPU processor chip with circuit core and bus connection pins.
    - **`server` / `web-server`**: Dual-chassis server rack with drive bays, status LEDs, and interconnects.
    - **`load-balancer`**: Traffic distributor node branching cleanly into balanced outputs.
    - **`api-gateway`**: Ingress/egress gateway portal with crossing routing paths.
    - **`queue` / `kafka`**: Pipeline message buffer with in-flight packet cards and flow direction.
    - **`external` / `third-party`**: API integration gear with central core.
    - **`storage` / `s3`**: Object storage bucket with handle and data wave.
    - **`auth`**: Security shield with padlock.
    - **`worker` / `cron`**: Periodic timer with circular cycle arrows.
    - **`search` / `elasticsearch`**: Search lens with index sparkle.
    - **`metrics`**: Telemetry monitor with heartbeat/pulse ECG wave.
    - **`notification` / `email`**: Sealed envelope with dispatch fold.
    - **`container` / `docker`**: 3D modular container cube.
    - **`state` / `workflow`**: State machine transition nodes.
    - **`user` / `actor`**: User persona avatar.
    - **`network` / `dns`**: Routing globe with equatorial network rings.
- **Node Card Layout & Design**:
  - Upgraded node cards to 236x74px with rounded corners (`rx: 6, ry: 6`) and a dedicated 46x46px tinted icon tile badge on the left (`rx: 8, ry: 8`).
  - Added 28x28px tinted icon badges to sequence diagram participant boxes.
  - Implemented automatic, intelligent icon inference from node labels, IDs, details, and roles (e.g., PostgreSQL → database, Redis → cache, Cloudflare → cdn, Nginx → load-balancer, Web Client → browser).
  - Added support for explicit `"icon"` attribute on graph nodes and sequence participants in `diagram-json`.
  - Upgraded hover states with subtle elevation filter and tile brightness shift.
  - Enhanced accessible alternative text table with an icon identifier column.
- **Migration:** Run `npx github:Pankil02/AgentSkills update`. Fully backward compatible; existing diagrams automatically receive matched system design icons without manual edits.

---

## [2.5.0] — 2026-10-02

### `feature-proposal` 1.3.0 (visual icon badges, animated live indicators & callout typography, non-breaking)
- **Visual Icon System**:
  - Added role emoji icons (`👤 ACTOR`, `⚙️ SERVICE`, `🗄️ STORE`, `📨 QUEUE`, `🌐 EXTERNAL`, `🔄 STATE`) with dynamic badge width scaling and precise SVG typography.
  - Added participant icon resolution for sequence diagrams based on name and role heuristics.
  - Added animated pulsing live status indicator (`.brand-badge` with `.badge-dot` keyframe animation).
  - Enhanced tab strip buttons with icon hover scaling (`.tab-icon` 1.18x hover / 1.1x selected).
- **Rich Callouts, Verdicts & Badges**:
  - Implemented `.badge-verdict-chosen`, `.badge-verdict-rejected`, and `.badge-recommended` with icon glyphs and tailored color tokens.
  - Added impact level badges (`.badge-level-high`, `.badge-level-med`, `.badge-level-low`) and heading icons (`.heading-icon`).
  - Upgraded callouts with structured headers (`.callout-header`, `.callout-icon`) and distinct left border accents.
  - Added custom accordion caret indicators with open-state rotation and task-list checkbox styling.
- **Migration:** Run `npx github:Pankil02/AgentSkills update`. No schema changes required; all proposals remain 100% backward compatible.

---

## [2.4.0] — 2026-10-01

### `feature-proposal` 1.2.0 (lightweight fixed diagrams & auto-layout, non-breaking)
- **Fixed & Lightweight Presentation**:
  - Eliminated the movable/draggable canvas, dotted grid background (`radial-gradient`), pan-and-zoom state, and toolbar zoom buttons (`Fit`, `−`, `+`, `Reset`).
  - Diagram is now rendered as a clean, static, high-contrast SVG directly in the document flow with natural height and native smooth horizontal scrolling (`overflow-x: auto`) for smaller viewports.
  - Added "Copy SVG" action in the diagram toolbar for instant raw SVG clipboard export.
  - Increased card dimensions (224x68px), line weights (1.75px), and font sizes (13px titles, 10px details, 8px badges) for superior readability and prominent visual impact.
  - Collapsed the accessible data table alternative by default so diagrams remain light and uncluttered.
- **Agent Authoring Consistency**:
  - `lane` (0–4) and `order` (0–3) are now optional in `diagram-json`. When omitted, the deterministic layout engine automatically assigns topological column ranks and row stages.
  - `role` defaults to `"service"` and `kind` defaults to `"sync"` when unspecified.
  - Automatic column compression removes phantom whitespace gaps when non-contiguous lanes are authored.
  - Orthogonal circuit-style routing eliminates diagonal crossing collisions.
- **Migration:** Run `npx github:Pankil02/AgentSkills update`. No schema migration needed; all existing proposals remain 100% backward compatible.

---

## [2.3.0] — 2026-10-01

### `feature-proposal` 1.1.0 (renamed from `new-feature-planning-proposal`, non-breaking)
- **Renamed Skill**: `new-feature-planning-proposal` is now concisely named `feature-proposal`.
- **Collapsible UI Arrow Indicators**: Added animated chevron up-down indicator for all collapsible and expandable sections (`<details>`, `.accordion`, and diagram text alternative tables).
- **Diagram Layering & Text Visibility**:
  - Re-architected graph diagrams into strict SVG painting layers (`layer-edges` at base, `layer-nodes` in middle, `layer-labels` on top) so text and background pills never hide under node cards or line paths.
  - Implemented dynamic node card sizing (`CARD_WIDTH`), generous lane spacing (`LANE_WIDTH`, `CARD_GAP`), and vertical row heights (`ROW_HEIGHT`) derived from longest labels to eliminate label clipping.
  - Added orthogonal cross-row stepped routing that connects to card top/bottom faces, avoiding line and label collisions with in-row edges.
  - Added dynamic participant box widths and message label pill backgrounds in sequence diagrams.
- **Backward Compatibility**: `AgentSkills` installer and updater automatically resolve legacy alias `new-feature-planning-proposal` to `feature-proposal`.
- **Migration:** Run `npx github:Pankil02/AgentSkills update` to update existing installs in-place, or install freshly via `npx github:Pankil02/AgentSkills install feature-proposal`.

---

## [2.2.0] — 2026-10-01

### `new-feature-planning-proposal` 1.0.0 (new skill, non-breaking)
- Added evidence-based feature proposals with explicit alternatives, workload budgets and relevant enterprise edge cases.
- Added a dependency-free loopback browser viewer with small tabs, native diagrams and exact Markdown source.
- Proposals remain editable Markdown bundles outside installed skill directories; JSON is derived, not a second source.
- **Migration:** none.

### `project-memory` 2.1.0, `software-design-patterns` 2.0.0, `plan-walkthrough` 1.0.0
- No change.

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
