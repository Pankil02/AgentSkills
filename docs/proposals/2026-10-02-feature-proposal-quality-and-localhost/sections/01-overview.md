# Overview

## Recommendation {#quality-summary}

Use one evidence-first proposal for the whole team; keep deep engineering detail available and make the local viewer open directly without tokens.

- Priority 1: fix prompt quality, biased examples and unsupported technical claims.
- Priority 2: fix real runtime, refresh, request-race, navigation and accessibility defects.
- Priority 3: remove local viewer tokens; keep browser-origin and filesystem safety.
- Priority 4: reduce UI/rendering overhead without removing useful diagrams, source or technical depth.
- Analogy: the proposal is a building blueprint with a clear front-page explanation. Everyone sees the same building; engineers can inspect foundations, wiring and measurements without another document disagreeing.
- Analogy limit: software has retries, concurrent writes and data-security boundaries that a building illustration does not explain; these require exact contracts.

## Who must understand it {#quality-audiences}

| Reader | Question the proposal must answer | Authoritative section |
|---|---|---|
| Product manager | What changes, for whom, why now, success metric and delivery risk? | Overview; Requirements; Delivery |
| Nontechnical teammate | What happens in normal/failure cases and what trade-off do we accept? | Plain-language summaries in every section |
| Software lead | Request flow, module contracts, state transitions, dependencies, tests and failure behavior? | Architecture; Data & API; Delivery |
| Database engineer | Query shapes, indexes, rows/bytes, locking, growth, replication and migrations? | Data & API; Performance |
| Design engineer | States, information hierarchy, focus, accessibility, responsive behavior and UI acceptance? | Requirements; Architecture; Delivery |
| Infrastructure/security lead | Trust boundaries, isolation, capacity, saturation, recovery, observability and abuse controls? | Architecture; Performance; Risks |

Do not create separate, conflicting “manager” and “engineer” plans. Use a short explanation followed by exact technical details in the same owning section.

## Verified findings {#quality-current-findings}

All `feature-proposal/` paths below refer to current source, not the installed symlink.

| Priority | Evidence | Impact and planned correction |
|---|---|---|
| P1 | `templates/viewer/app.js:528-541` | `outlineObserver` declaration is inside a block comment; first outline update can throw. Add a real module declaration and browser regression. |
| P1 | `scripts/server.mjs:148`, `:272`; `app.js:293-349` | Invalid refresh drops detailed diagnostics; browser ignores `valid:false`. Preserve snapshot and show actionable file/line errors. |
| P1 | `app.js:398-526` | Tab/source fetch results are not guarded against changed selection/version. Use cancellation and generation checks. |
| P1 | `index.html:45-76`, `:106`; `app.js:398-438` | Eight tab buttons point to nonexistent panels; shared panel lacks tabpanel semantics. Create stable panel targets or synchronized single-panel semantics. |
| P1 | `app.js:161-191`, `:194-242` | Tabstrip arrow handler bubbles to global arrow handler and changes selection unexpectedly. Scope keyboard handling and remove unmodified global hotkeys. |
| P1 | `scripts/format.mjs:1564-1614`; `app.js:626-652` | Compiler accepts cross-document heading anchors but browser only searches active DOM. Add derived anchor ownership and cross-tab resolution. |
| P1 | `templates/sections/06-performance.md:8-11`, `:17-21`, `:49-51` | Fixed latency/memory examples and pool-size inference look authoritative without workload evidence. Replace with labelled estimates and validation method. |
| P1 | `templates/sections/05-data-api.md:19-45`; `08-delivery.md:7-29` | PostgreSQL schema, layered folders and zero-downtime migration seeded regardless of repository. Require actual stack and justified boundaries. |
| P2 | `app.js:46-68`; `references/viewer.md:28-35` | Docs describe fragment scrubbing and reload loss, but code does not scrub. Remove token lifecycle entirely instead of maintaining it. |
| P2 | `AGENTS.md:71`; `render.js:241-254` | Maintenance contract forbids fake terminal chrome; renderer builds traffic-light dots. Remove chrome and regex highlighter. |
| P2 | `styles.css:1-1305`; `index.html:22`; `references/viewer.md:50`, `:86` | No media/reduced-motion rules found; animated/live labels and unsupported download/Zen claims distract or mislead. Simplify and verify responsive UX. |
| P2 | `scripts/files.mjs:54-56`, `:130-148` | Containment uses raw string prefix; save-race verification checks only manifest. Harden path boundaries and bounded file-change detection. |

These are source-grounded findings; no browser screenshots, user interviews or runtime accessibility/performance results were collected. Visual severity requires the specified browser checks.

## Assumptions & boundaries {#quality-assumptions}

| ID | Assumption | Confidence and validation |
|---|---|---|
| ASM-01 | Plan only now; implementation happens in a fresh chat. | High: explicit user request. |
| ASM-02 | Token removal is for this localhost viewer, not proposed production applications. | High: user describes local-only port use. |
| ASM-03 | Current eight-section schema and diagrams remain compatible. | Design choice: keeps user proposals intact. |
| ASM-04 | No mandatory mobile-specific viewer, but ordinary narrow screens and zoom must work. | Assumption: verify at 320/768/1440 CSS px and 200% zoom. |
| ASM-05 | Millions of registered users are a future proposal scenario, not viewer traffic. | Explicit distinction: derive feature QPS from workload, not account count. |

### Technical details {#quality-baseline}

- Current skill `1.4.0`, root package `2.6.0`; `.agents/skills/feature-proposal` links to `../../feature-proposal`.
- Runtime baseline: 36 tests pass under Bun and native Node 26; existing fixture validates without diagnostics. Node 18 compatibility is claimed but not yet exercised in this audit.
- Current five viewer assets: 137,511 bytes / 134.29 KiB raw; concatenated gzip 31,795 bytes is an offline comparison only.
- Prompt entry point: 4,390 bytes. References total 18,426 bytes; they need not all enter model context for each task.
- Existing dirty worktree and prior proposals are not implementation scratch space. No `.memory/` directory found.
- Earlier capability requirement in `docs/plans/2026-10-01-feature-planning-proposal.md:67` is historical; this user request supersedes it for the new release. Leave the historical plan intact.
