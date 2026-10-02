---
name: feature-proposal
description: Plans features with low-overhead proposals, workload trade-offs, edge cases, and an interactive local viewer.
version: 2.0.0
author: Pankil
license: MIT
tags: [planning, architecture, proposals, viewer]
---

# Feature Proposal

> Plan only. Never implement proposed features. Output an authored proposal bundle under `docs/proposals/YYYY-MM-DD-<slug>/`.

## 1. Task Router

- **Plan / Update**: Author proposal in `docs/proposals/YYYY-MM-DD-<slug>/`. Read `references/planning.md` and `references/format.md`.
- **Check**: `node <skill>/scripts/proposal.mjs check --plan <path> [--json]`.
- **View**: `node <skill>/scripts/proposal.mjs view --plan <path> [--port <port>]`. Opens `http://127.0.0.1:<port>/`. See `references/viewer.md`.

## 2. Intake & Evidence

- **Clarify**: Ask <=3 blocking questions (actors, scale, latency, data rules); else label assumptions (`ASM-01`) and proceed.
- **Evidence First**: Inspect active code (entry points, schemas, queries, tests). Cite `path:line` or `symbol`. Label values: observed, target, estimate, or assumption.
- **Reuse First**: Evaluate existing modules, tables, and endpoints before adding new services, caches, or brokers.

## 3. Decision Contract

- **Fair Alternatives**: Compare 2–3 viable architectures under same workload/correctness constraints. No straw men.
- **Priority**: (1) Correctness & security → (2) Budgets (workload/latency) → (3) Minimal resource work (DB/CPU/RAM/wire) → (4) Simplicity → (5) Maintainability.
- **Recommendation**: State chosen option, accepted downside, confidence, and revisit threshold.

## 4. Audience & Owning-Section Matrix

One owning section per fact under `docs/proposals/YYYY-MM-DD-<slug>/`:
- `proposal.md`: Manifest with `proposal-meta` JSON; reading guide.
- `01-overview.md`: Outcome (<=25 words), recommendation, alternative, downside, assumptions.
- `02-requirements.md`: Actors, criteria, non-goals, workload inputs, glossary, UI states.
- `03-options.md`: 2–3 viable architectures, shared workload comparison, trade-offs, revisit triggers.
- `04-architecture.md`: Components/owners, boundaries, `diagram-json` flow, failure policies.
- `05-data-api.md`: Endpoints/errors, schemas/indexes, query costs, payload/blob rules, migrations.
- `06-performance.md`: Workload sizing, CPU/DB/RAM/latency/transfer budgets, validation methods.
- `07-risks.md`: Failure matrix, controls, tests, residual risks, security, N/A justifications.
- `08-delivery.md`: File map, ordered atomic steps, tests, rollout/rollback, handoff prompt.
- **Layering**: Plain summaries first; technical specs in `### Technical details {#slug}` (`<details>`).

## 5. Quality Gate

- **Workload & Budgets**: Explicit units (`bytes`, `KiB`, `QPS`, `ms`); peak = active users × ops/day × burst; Little's Law for concurrency.
- **Specialist Coverage**: Quantify DB queries/locks, CPU work, latency (p50/p95/p99), wire vs compressed bytes, blob limits.
- **Justified N/A**: Non-applicable dimensions (e.g. no DB for local UI) require reason and trigger.
- **Validation**: `check --json` passes with zero errors and no broken internal anchors.

## 6. Handoff Contract

Reply in chat (<=40 lines, excluding prompt):
1. **Headline & Outcome**: One-sentence recommendation and summary.
2. **Key Decisions**: Bulleted chosen vs rejected options with trade-offs.
3. **Artifact Paths**: Saved proposal directory and `proposal.md` path.
4. **Viewer**: Exact command to launch the local viewer.
5. **Fresh-Chat Prompt**: Standalone prompt to hand off implementation.
