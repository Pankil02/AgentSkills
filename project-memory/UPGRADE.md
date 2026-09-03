# Project Memory Upgrade & Migration Guide

> **Audience**: Developers, repository maintainers, and AI Coding Agents upgrading existing Project Memory (`.memory/`) bundles to the consolidated Scope Architecture.

---

## 🚀 Summary of Changes

In Project Memory 0.2+, the directory layout for tracked subfolder scopes has been streamlined to eliminate file sprawl and reduce token context consumption:

1. **Root Only Intent & Progress**:
   - `goal.md`, `progress.md`, and `tasks.md` exist **strictly in the root** `.memory/` directory and **nowhere else**.
   - Having `goal.md`, `progress.md`, or `tasks.md` inside any subfolder scope triggers a `root-only-file` validation error.

2. **Subfolder Scope Consolidation (`agents.md` + `log.md`)**:
   - Each tracked subfolder scope (`.memory/<scope>/`) contains **ONLY and ONLY**:
     - **`agents.md`**: Single unified file combining:
       - **Scope Architecture & Summary**: Entry points, API routes, database schemas, code anchors.
       - **Goal & Requirements**: Motivation, boundaries, structured requirements (`REQ-xxx`), and verifiable criteria (`AC-xxx`).
       - **Current State & Progress**: Lifecycle state, blockers/drift, and acceptance evidence table (`repo://` evidence paths).
       - **Tasks & Action Items**: Single next action (first), active tasks (≤ 5 items, ADHD-bounded), and backlog.
     - **`log.md`**: Append-only history of decisions, updates, and milestones for that scope.
   - Intermediate grouping directories no longer contain redundant `index.md` files.

---

## 📊 Before vs. After Layout

### Legacy Layout (0.1 - Early 0.2)
```text
.memory/
├── index.md
├── goal.md
├── progress.md
├── tasks.md
├── log.md
└── apps/api/src/domains/user/
    ├── index.md        ❌ REMOVED
    ├── goal.md         ❌ REMOVED (subfolder)
    ├── progress.md     ❌ REMOVED (subfolder)
    ├── tasks.md        ❌ REMOVED (subfolder)
    └── log.md          ✅ KEPT
```

### New Consolidated Layout (0.2+)
```text
.memory/
├── index.md            # Progressive-disclosure router (< 4 KB budget)
├── goal.md             # Project-wide intent & criteria (Root Only)
├── progress.md         # Project-wide state & evidence (Root Only)
├── tasks.md            # Project-wide active tasks (Root Only)
├── log.md              # Project history (append-only)
├── architecture/       # Dynamic architecture lenses & flows
├── sources/            # Registered source records
└── apps/api/src/domains/user/
    ├── agents.md       # ✅ UNIFIED: Architecture + Goal + Progress + ADHD Tasks
    └── log.md          # ✅ Append-only scope history
```

---

## ⚡ Automated Migration (`memory migrate`)

The built-in CLI migration engine automatically detects legacy subfolder files, consolidates and shifts all data into `agents.md`, updates `log.md`, and removes obsolete files without data loss.

### Running Migration

```bash
# Preview changes without modifying files:
memory migrate --dry-run --json

# Apply automated migration:
memory migrate
```

Or via bun / npm:
```bash
bun x memory migrate
# or
npx memory migrate
```

### What `memory migrate` Does Automatically

1. **Extracts All Data from Removed Subfolder Files**:
   - Reads `goal.md`: Extracts motivation, requirements, acceptance criteria (`AC-xxx`), boundaries, and status.
   - Reads `progress.md`: Extracts current state, blockers/drift, acceptance evidence table, and next actions.
   - Reads `tasks.md`: Extracts single next action, active tasks list, backlog, and completed summary.
2. **Generates Consolidated `agents.md`**:
   - Synthesizes all extracted sections into `.memory/<scope>/agents.md`.
   - Preserves frontmatter (`type: "Agents"`, `status`, `scope`, `timestamp`, `uid`).
3. **Appends Audit Event to `log.md`**:
   - Prepends an immutable audit entry in `.memory/<scope>/log.md`:
     ```markdown
     ### Migration: Scope Restructure
     - **Update:** Migrated legacy subfolder files (goal.md, progress.md, tasks.md) into unified `agents.md`.
     - **Evidence:** Automated `memory migrate` data shift.
     ```
4. **Removes Obsolete Files**:
   - Deletes `goal.md`, `progress.md`, `tasks.md`, and `index.md` from the subfolder.
   - Cleans up empty intermediate directory `index.md` files.
5. **Synchronizes & Validates**:
   - Refreshes router links in root `index.md` to point directly to `/<scope>/agents.md`.
   - Runs full bundle validation (`validateBundle`).

---

## 🤖 Instructions for AI Coding Agents

When working in an existing codebase with Project Memory:

1. **Detection**:
   - If `memory validate` reports `root-only-file` (e.g., `goal.md is only allowed in root .memory/, not in subfolders`), the repository has an unmigrated bundle.
2. **Action**:
   - Run `memory migrate` via shell to automatically shift data into `agents.md` and clean up legacy files.
3. **Navigation**:
   - When routing to a subfolder scope, read `.memory/<scope>/agents.md` directly. Do not look for or create `goal.md`, `progress.md`, or `tasks.md` in subfolders.
   - For scope status updates, edit `.memory/<scope>/agents.md` (or use `memory apply`).
