---
name: plan-walkthrough
description: Produces a deep, phased implementation plan, saves it to docs/plans/ in the repo, then replies with a short decision-focused walkthrough and a copy-paste prompt to implement only phase 1 in a fresh chat. Each implementing chat returns durable context and a prompt for the next phase. Use when the user asks to plan, design, spec, or scope a feature/refactor/fix before coding, or says "plan this", "make a plan", "walkthrough". Skip for trivial edits or when the user asks to implement directly.
version: 2.0.0
author: Pankil
license: MIT
tags:
  - planning
  - architecture
  - system-design
  - handoff
---

# Plan & Walkthrough

Plan only. **Never edit source code, configs, or dependencies.** The only write is the plan file.

## 1. Investigate (before writing anything)

1. Restate the goal in one sentence. If a decision-changing ambiguity exists, ask ≤3 sharp questions, then stop. Otherwise state assumptions and proceed.
2. Read the real code: entry points, the modules touched, their callers, tests, build/test commands, conventions, existing libs. Reuse over reinvent.
3. Locate hot paths, I/O boundaries, data ownership, and failure points. Every claim in the plan must cite a real path (`src/x.ts:fn`).

## 2. Decide like a staff engineer

For each significant decision (data model, boundaries, sync vs async, storage, caching, concurrency, API shape, module layout):
- List 2–3 real options → the flaw of each rejected one → why the chosen one wins **for this codebase and load**.
- Optimize in order: correctness → latency (p99, round-trips, N+1, allocations, blocking I/O, payload size) → simplicity → extensibility.
- Smallest design that meets the need. No speculative abstractions, no new dependency without a stated reason.
- Default to: idempotent writes, explicit timeouts, bounded queues/retries, input validation at boundaries, least privilege, backward-compatible migrations.

## 3. Divide into context-bounded phases

- Split implementation into numbered, dependency-ordered phases. Each phase must fit one fresh chat and deliver a coherent, independently verifiable result; split large phases further. Do not invent extra phases for tiny work.
- Specify each phase's objective, dependencies, files, ordered checkbox steps, exact verification commands, acceptance criteria, and explicit out-of-scope work.
- Keep the build green at phase boundaries. Put prerequisite contracts before consumers; defer optional work rather than leaving an untestable partial change.
- Use the plan as durable shared context: retain design decisions, track phase status, and record completed work, verification results, deviations, blockers, and next-phase prerequisites. Never rely on previous chat history.

## 4. Write the plan file

Path: `docs/plans/YYYY-MM-DD-<kebab-slug>.md` (reuse an existing plans dir if the repo has one). Structure:

```markdown
# <Title>
Status: ready · Current phase: 1 · Owner: next agent · Created: YYYY-MM-DD

## Goal & non-goals
## Context (current state, cited paths)
## Design
- Architecture / data flow (ASCII diagram if >2 components)
- Data model & contracts (types, schemas, API signatures)
- Decisions: | Decision | Chosen | Rejected (flaw) | Why |
- Performance budget (latency targets, hot-path notes, complexity)
- Failure modes & security (validation, authz, retries, timeouts)
## File changes
| File | New/Modify/Delete | Change |
## Phase overview
| Phase | Objective | Dependencies | Status |
| 1 | <bounded outcome> | none | pending |
| 2 | <bounded outcome> | phase 1 | pending |
## Implementation phases
### Phase 1: <name>
- Objective / dependencies:
- Files / contracts:
- Out of scope (including later-phase work):
- Steps:
  - [ ] <atomic step> — files — done-when <verifiable check>
- Verification: <exact commands and expected results>
- Acceptance criteria: <observable completion conditions>
### Phase 2: <name>
<repeat the same structure for every phase; omit if only one phase is needed>
## Phase completion records
<Implementing agents append one record per phase: changes/files, contracts/decisions,
commands and results, deviations/blockers, remaining work, next-phase prerequisites.>
## Testing & verification (exact commands, cases incl. edge/failure)
## Rollout, migration & rollback
## Risks & open questions
```

Rules: steps ordered so the build stays green after each; each step independently verifiable; include exact signatures and commands; no vague verbs ("handle", "improve") without specifics. Fully plan all phases now, but authorize only one phase per implementing chat.

## 5. Reply (this exact shape, ≤40 lines)

**Walkthrough** — telegraphic bullets, no filler:
- **Goal:** one line.
- **Design:** the system shape and data flow in 1–3 lines.
- **Key decisions:** per decision → `chosen` over `alt` (flaw) — why it wins.
- **Code structure:** where new logic lives and why (boundaries, ownership).
- **Files:** `path` — key change (top files only; full list in plan).
- **Phases:** numbered outcomes; only phase 1 runs in the next chat.
- **Latency/risks:** hot-path impact, top risk + mitigation.
- **Open questions:** only if any.

**Plan saved:** `docs/plans/<file>.md`

**Handoff prompt** (in a code block so it copies cleanly):

```text
Implement ONLY phase 1 of the plan at docs/plans/<file>.md in this repo. Do not implement later phases.
Context: <2–3 lines: goal, chosen architecture, key constraints>.
Read the plan, repo instructions, and relevant cited files before editing. Confirm phase dependencies and current repo state. Execute only this phase's steps; run its verification and keep the build green. Follow the plan's decisions; if reality contradicts the plan, stop and report the conflict instead of improvising.
Tick completed steps and update phase status. Record changes/files, contracts/decisions, actual test commands/results, deviations/blockers, and next-phase prerequisites in the plan. Mark complete only when acceptance criteria pass; never claim unrun checks passed.
Finish with a concise completion/context summary and a copy-paste prompt for a NEW chat to implement ONLY phase 2. That prompt must include the plan path, next phase number/objective, completed phases, relevant files/contracts, verification status, constraints/blockers, and these same one-phase-only execution and handoff instructions. Each subsequent chat repeats this process for the next phase. If blocked, return a same-phase resume prompt instead of advancing. After the final phase, return the final verification summary and remaining risks; no next-phase prompt.
```

## 6. Implementing-chat handoff contract

The initial prompt must carry this contract forward; every subsequent prompt must repeat it, substituting the next phase number and actual completion context (not placeholders).

- **One chat, one phase:** implement only the authorized phase. Do not automatically start another phase, spawn a replacement chat, or make unrelated changes.
- **Durable checkpoint:** update the plan's steps, phase status, and completion record before handing off. Preserve prior records. Include known working-tree changes or commit references when available; never commit automatically.
- **Return context:** completed phase and outcome, key files/contracts, tests run and results, deviations/blockers, and what remains. Keep it concise; the plan holds detailed context.
- **Return the next prompt:** identify the same plan path and exactly one next phase; include the context above and repeat the execution/checkpoint/handoff contract so a fresh agent needs no previous conversation.
- **Stop safely:** failed acceptance checks or unmet dependencies mean the phase is incomplete. Record the blocker and return a resume prompt for the same phase; do not advance. If all phases are complete, mark the plan complete and summarize final verification and remaining risks.
