---
name: plan-walkthrough
description: Produces a deep, senior-grade implementation plan for what the user wants, saves it to docs/plans/ in the repo, then replies with a short decision-focused walkthrough and a copy-paste handoff prompt for a fresh agent chat to implement it. Use when the user asks to plan, design, spec, or scope a feature/refactor/fix before coding, or says "plan this", "make a plan", "walkthrough". Skip for trivial edits or when the user asks to implement directly.
version: 1.0.0
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

## 3. Write the plan file

Path: `docs/plans/YYYY-MM-DD-<kebab-slug>.md` (reuse an existing plans dir if the repo has one). Structure:

```markdown
# <Title>
Status: ready · Owner: next agent · Created: YYYY-MM-DD

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
## Implementation steps
1. <atomic step> — files — done-when <verifiable check>
## Testing & verification (exact commands, cases incl. edge/failure)
## Rollout, migration & rollback
## Risks & open questions
```

Rules: steps ordered so the build stays green after each; each step independently verifiable; include exact signatures and commands; no vague verbs ("handle", "improve") without specifics.

## 4. Reply (this exact shape, ≤40 lines)

**Walkthrough** — telegraphic bullets, no filler:
- **Goal:** one line.
- **Design:** the system shape and data flow in 1–3 lines.
- **Key decisions:** per decision → `chosen` over `alt` (flaw) — why it wins.
- **Code structure:** where new logic lives and why (boundaries, ownership).
- **Files:** `path` — key change (top files only; full list in plan).
- **Latency/risks:** hot-path impact, top risk + mitigation.
- **Open questions:** only if any.

**Plan saved:** `docs/plans/<file>.md`

**Handoff prompt** (in a code block so it copies cleanly):

```text
Implement the plan at docs/plans/<file>.md in this repo.
Context: <2–3 lines: goal, chosen architecture, key constraints>.
Read the plan fully and the files it cites before editing. Execute steps in order; run the verification after each step and keep the build green. Follow the plan's decisions; if reality contradicts the plan, stop and report the conflict instead of improvising. Update the plan's Status and tick completed steps as you go. Finish with: changes made, tests run, deviations.
```
