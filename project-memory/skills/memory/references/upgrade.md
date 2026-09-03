# Reference: Project Memory Upgrade & Scope Migration

> **Context**: For AI Agents and engineers upgrading legacy `.memory/` bundles to the consolidated Scope Architecture.

---

## 🎯 Architecture Purpose

The 0.2+ scope consolidation reduces LLM context switching, eliminates file fragmentation, and enforces ADHD execution focus:

- **Root `.memory/`**: Holds project-wide intent (`goal.md`), progress verification (`progress.md`), tasks (`tasks.md`), router (`index.md`), history (`log.md`), and system architecture flows (`architecture/`).
- **Subfolder Scopes (`.memory/<scope>/`)**: Contains strictly **`agents.md`** and **`log.md`**.
  - `agents.md` consolidates:
    1. Scope architecture summary & entry points
    2. Feature requirements & acceptance criteria (`AC-NNN`)
    3. Operational progress, blockers, and acceptance evidence table
    4. ADHD tasks (single next action first, active tasks ≤ 5, backlog)

---

## 🔄 Shifting Legacy Data to `agents.md`

When upgrading legacy bundles, data is shifted from removed files into `agents.md`:

| Legacy Source File | Extracted Sections | Destination Section in `agents.md` |
|---|---|---|
| `<scope>/goal.md` | `## Motivation`, `## Scope & non-goals`, `## Requirements`, `## Acceptance criteria`, `## Constraints & dependencies` | `## Goal & Requirements` |
| `<scope>/goal.md` | `## Scope Architecture`, `## Auto-Detected Architecture` | `## Scope Architecture & Summary` |
| `<scope>/progress.md` | `## Current state`, `## Blockers & drift`, `## Acceptance evidence` | `## Current State & Progress` |
| `<scope>/progress.md` or `<scope>/tasks.md` | `## Next action` or `## Single next action` | `### Single next action` (under `## Tasks & Action Items`) |
| `<scope>/tasks.md` | `## Active tasks (Do Now)`, `## Backlog (Do Later)`, `## Completed tasks summary` | `## Tasks & Action Items` |
| `<scope>/log.md` | Retained in place | Prepends migration audit event |
| `<scope>/index.md` | Removed | Links updated in root `index.md` router |

---

## ⚡ Execution Command

To perform automated migration with atomic rollback safety:

```bash
memory migrate
```

Dry-run validation:
```bash
memory migrate --dry-run --json
```

---

## 🛡️ Validation Rules Enforced

1. **`root-only-file`**: `goal.md`, `progress.md`, and `tasks.md` are rejected if present in any subfolder scope.
2. **`agents.md` Validation**:
   - Requires frontmatter: `type: "Agents"`, `status`, `title`, `description`, `timestamp`, `scope`.
   - If `status: active`, requires `### Single next action` with `Action`, `Requirement`, `Likely files`, `Verification`, and `Approval`.
   - Hard budget: warned above 8,000 bytes.
   - Active tasks: max 5 items.
