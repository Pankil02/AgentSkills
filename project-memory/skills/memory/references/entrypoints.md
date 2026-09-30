# Entry Points & Navigation Fact Catalog

This reference describes the architecture and operation of continuous agent entry points and the typed fact catalog (`.memory/.meta/entrypoints.json`).

---

## 1. Single Source of Truth

Agent entry points are continuously synchronized from a single typed, versioned fact catalog:
- Path: `.memory/.meta/entrypoints.json`
- Schema version: `1`

The catalog captures:
1. **Facts**: Purpose, Shape/Capabilities, Scopes, Verification Commands, and Boundaries.
2. **Commands**: Verified or discovered test, build, and lint recipes with associated execution contexts (`cwd` and `argv`).
3. **Routes**: Intent tokens, entry points, and governing instruction files.
4. **Rendered Hashes**: Content hashes of `AGENTS.md` and `.memory/index.md` to detect manual edits vs generated block edits.

---

## 2. Managed vs Unmanaged Regions

Root `AGENTS.md` files are protected from unintentional agent or tool overwrites:
- **Managed block**: Everything between `<!-- memory:start -->` and `<!-- memory:end -->`.
- **Human-authored instructions**: Everything outside the managed markers is strictly preserved verbatim.
- **Review workflow**: Human instructions are only modified through an explicit review plan (`memory agents-sync --review` and `memory apply-review --plan-file <f> --approval <a>`).

---

## 3. Byte Budgets & Compact Context

To avoid starving agent context windows during startup:
- Target combined size: < 4,000 bytes.
- Hard safety budget: < 6,000 bytes for `AGENTS.md` block and `.memory/index.md`.
- Compaction strategy: If a monorepo exceeds budgets, optional decision summaries and scope lists are truncated first with clear pointers to on-demand commands (`memory route`, `memory status`). Mandatory rules and governance checks are never truncated.

---

## 4. Generic Repositories & Architecture Modes

Repositories do not need to follow Domain-Driven Design (DDD) to use `project-memory`:
- `architectureMode: "unconfirmed"`: Default for new projects. Architecture lenses remain unconfirmed until explicitly scaffolding.
- `architectureMode: "ddd"`: Preserves existing DDD layer specifications (`Domain`, `Application`, `Infrastructure`, `Presentation`).
- `architectureMode: "other"`: Custom architecture boundaries.
