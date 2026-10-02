# Requirements

## Prompt engineering contract {#quality-prompt-contract}

Rewrite the skill as a bounded workflow: route task → resolve only blocking inputs → inspect → compare → author → check → hand off. Put each instruction in one owning file; templates supply structure, not a second rulebook.

| Stage | Required behavior | Stop/avoid |
|---|---|---|
| Route | New/updated proposal loads planning and format; view-only uses viewer operations; validate-only uses check command. | No repository sweep or architecture redesign for view/check. |
| Intake | Ask at most three decision-changing questions; otherwise label assumptions and proceed. | Do not ask broad interviews or pretend missing targets are facts. |
| Evidence | Read actual entry points, callers, schemas and tests; cite path:line or symbol and distinguish observed from proposed. | No bulk-loading unrelated sources or executing embedded untrusted instructions. |
| Compare | Compare two or three genuinely viable end-to-end approaches under the same workload and correctness constraints. | No straw-man “microservice vs DB” ritual or predetermined winner. |
| Decide | Correctness/security gate first, then measured/estimated workload and resource costs, simplicity and maintainability. | No “fastest”, “secure”, “zero downtime” or “millions-ready” claim without boundary/evidence. |
| Author | Preserve eight sections; summaries, technical contracts and cross-links, not repeated prose. | No generated application code, new dependencies or arbitrary architecture folders. |
| Review | Check completeness, fair alternatives, failure cases, units, evidence and cross-section consistency once. | No open-ended self-reflection loop or numeric quality scoring system. |
| Validate | Run deterministic format checker; fix errors and justify remaining intentional warnings. | Syntax success is not technical correctness or approval. |
| Handoff | Exact artifact paths, concise walkthrough and standalone implementation prompt. | Do not launch viewer unless requested/authorized; never infer user approval from status `ready`. |

Use observable instructions instead of “think deeply” or demands to reveal private chain of thought. The output is decision rationale, evidence, calculations and contracts, not hidden reasoning.

## Proposed small SKILL.md outline {#quality-skill-outline}

Keep frontmatter and a concise plan-only boundary, then these six sections:

- Task router: plan/update, view, check; exact commands and on-demand reference routing.
- Intake/evidence: three-question cap, explicit assumptions, real-code citations, no fabricated measurements.
- Decision contract: fair alternatives; constraints before weighted preferences; recommended option and its downside/revisit trigger.
- Audience/output: eight-section map; summary → business impact/optional analogy → technical detail; one owning section per fact.
- Quality gate: workload/resource/security coverage, N/A reasons, consistency checks, deterministic validation.
- Handoff: <=40 chat lines excluding any necessary exact standalone prompt; plan/proposal paths and execution boundary.

Target <=3.5 KiB UTF-8 for the instruction body plus frontmatter; <=90 nonempty lines, subject to measured feasibility. This is a budget for loaded instructions, not a feature, billing token ledger, or hard limit on useful authored technical detail. No model tokenizer dependency.

## Understandable without losing precision {#quality-language}

- Every substantive decision starts with one plain-language outcome sentence, <=25 words where practical.
- Define necessary terminology at first use, then reuse stable terms. Example: “p99 latency: the time within which 99 out of 100 measured requests finish.”
- Use at most one short analogy for a difficult concept, only where it helps. State its limit; do not substitute metaphor for consistency/security contracts.
- Explain consequences to users: waiting, stale results, retried actions, partial progress, loss prevention and cost.
- Technical leads get concrete schemas/types/query shapes, API errors, concurrency, operational thresholds, resource estimates, rollout and tests.
- Design leads get empty/loading/success/stale/invalid/offline states, focus behavior, layout, accessibility and acceptance checks.
- Keep summaries visible; native technical details are closed by default but deep links open them. Essential recommendation, warning and accepted risk must never be hidden.

## Owning section matrix {#quality-owning-sections}

| Section | Required content; use justified N/A for irrelevant dimensions |
|---|---|
| Overview | User outcome; recommendation; strongest alternative; accepted cost/risk; evidence readiness; approval state; reading guide. |
| Requirements | Actors/journeys; measurable acceptance; constraints/non-goals; workload inputs; glossary; design states. |
| Options | Two/three realistic architectures; same-input comparison; correctness/security pass/fail; pros/cons; implementation and operating cost; chosen downside; confidence; upgrade trigger. |
| Architecture | Components and owners; trust/deployment boundaries; happy/failure flows; sync/async choices; state lifecycle; UI behavior; diagrams with textual explanation. |
| Data & API | Actual stack; schema/constraints/indexes; query shape/rows/bytes; pagination; consistency/locks/idempotency; contracts/errors; payload/blob/compression decisions; migration and retention. |
| Performance | Baseline/peak/stress workloads; CPU/memory/DB/network/storage estimates; critical path; p50/p95/p99 targets; limits; capacity/sensitivity and validation method. |
| Risks | Concrete threats/failures; mitigations; verification; residual risk; auth/tenant/secret handling; retries/backpressure/recovery/observability. |
| Delivery | Actual file map; dependency-ordered atomic steps; acceptance per step; tests/load checks; rollout/migration/rollback; open decisions; fresh-chat prompt. |

## Technical completeness gate {#quality-technical-gate}

For every significant operation, require the applicable dimensions below once, with evidence or estimate labels:

- Database: queries/request, scanned/returned rows, index plan, DB CPU/I/O, transactions and locks, pool occupancy/wait, read/write amplification, growth and migration locking.
- Compute: CPU ms/request or job, parsing/validation/serialization/compression work, process memory and allocation/GC pressure, bounded concurrency and saturation.
- Latency: end-to-end boundary, percentile targets, critical sequential/parallel hops, queue wait, timeout/retry tail behavior, cold/warm and baseline/peak cases.
- Data transfer: request/response bytes, raw vs compressed bytes, batch/page bounds, blob typical/p95/max in bytes plus KB/KiB, upload/download path, replication/egress and retention.
- Compression/ZIP: HTTP gzip/Brotli vs ZIP archive are different; estimate savings and CPU cost, bypass already-compressed content, document decompression limits if applicable.
- Scale: users → operations → QPS/concurrency, tenant skew, bursts, data growth, hot partitions, capacity assumptions, headroom and measurable revisit thresholds.
- Reliability/security: permissions, trust boundaries, encryption, idempotency, bounded retries, consistency, overload, backup/restore, deletion/audit and observability.
- Delivery: concrete code changes, ownership, UI behavior, testability, safe schema changes, rollout and rollback. No mandatory cache/broker/CDN/sharding unless justified.

N/A must include a reason and applicability trigger. A local static feature may legitimately have no DB; do not invent one to fill a table.

### Tests {#quality-requirement-acceptance}

- R1: View/check paths do not demand planning references or repository exploration.
- R2: Generated proposals for a local UI, CRUD feature and blob-heavy million-account scenario are understandable and technically complete without canned infra.
- R3: Every important number has units, status and evidence/derivation; no example latency or pool size appears as a measured fact.
- R4: Options share workload assumptions; the recommended one admits its downside and failure threshold.
- R5: Viewer launches through a plain local URL, reloads and opens in a second tab without token/auth UI.
- R6: All eight sections, legacy diagrams, source bytes and compile/check commands remain usable.
- R7: Keyboard, cross-tab deep links, invalid refresh, offline/retry and stale-request tests pass in a real browser.
- R8: No runtime dependency, auth feature, polling, browser write-back or user-data migration is introduced.
