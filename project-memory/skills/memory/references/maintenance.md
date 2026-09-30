# Entry-Point Maintenance & Instruction Review

This reference documents the maintenance cycle, atomic application, pre-image snapshots, and review procedures for `AGENTS.md` and `.memory/index.md`.

---

## 1. Safe Maintenance Cycle

Entry points are maintained through atomic write guarantees:
1. **Planning**: `memory sync --dry-run` or `memory agents-sync --check` creates a side-effect-free maintenance plan with base hashes.
2. **Snapshot**: A pre-image snapshot of both root `AGENTS.md` and `.memory/` is captured in memory.
3. **Validation**: Document base hashes are checked against disk to ensure no concurrent modification occurred.
4. **Atomic Swap**: Updated files are written atomically under a directory lock. If any failure occurs, the exact pre-image snapshot is restored.

---

## 2. No-Op Guarantee

When a project is unchanged:
- File contents remain byte-identical.
- `mtime` timestamps on disk are preserved without touch mutations.
- Maintenance is completely idempotent.

---

## 3. Human Instruction Review Engine

When drift or inconsistencies occur in human-authored instructions:
- `memory agents-sync --review --json`: Generates an `AgentsReviewPlan` targeting only the unmanaged human regions.
- `memory apply-review --plan-file <f> --approval "<reason>"`:
  - Validates `baseSha256` of `AGENTS.md`.
  - Ensures non-overlapping byte offsets.
  - Prohibits any modification within the managed markers (`<!-- memory:start -->` ... `<!-- memory:end -->`).
  - Requires non-empty user approval string.
