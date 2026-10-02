# Feature Proposal: Prompt Quality, Inclusive System Design & Token-Free Localhost

Status: completed · All 8 phases implemented and verified · Created: 2026-10-02

## Goal & non-goals

Make `feature-proposal/` a small, evidence-first planning skill that produces technically complete, understandable proposals and a reliable, accessible, token-free local viewer. Optimize prompt quality before cosmetic changes. Recommend the smallest system that meets explicit correctness, security, workload and latency requirements; never promise universal superiority or million-user capacity without evidence.

This file is the execution entry point. The detailed specification is the authoritative eight-section bundle below; read all eight before implementation. No source, configuration, dependencies, existing proposals or previous plans were changed when authoring this plan.

## Detailed plan

Bundle: `docs/proposals/2026-10-02-feature-proposal-quality-and-localhost/proposal.md`

| Section | Authoritative specification |
|---|---|
| 1 | `sections/01-overview.md` — outcomes, audience, priorities, assumptions and current findings |
| 2 | `sections/02-requirements.md` — prompt contract, technical completeness, acceptance and non-goals |
| 3 | `sections/03-options.md` — alternatives, recommendations, costs and revisit conditions |
| 4 | `sections/04-architecture.md` — viewer UX, navigation, rendering and module boundaries |
| 5 | `sections/05-data-api.md` — token-free HTTP, snapshots, diagnostics and file safety |
| 6 | `sections/06-performance.md` — quantitative system-design rubric and skill/viewer budgets |
| 7 | `sections/07-risks.md` — threat model, failure matrix, compatibility and residual risks |
| 8 | `sections/08-delivery.md` — exact file map, ordered execution, tests, release and rollback |

## Context & verified baseline

- Source skill is `feature-proposal/SKILL.md`, version `1.4.0`; installed `.agents/skills/feature-proposal` is a symlink to it. Root package version is `2.6.0`.
- Main defects: commented-out `outlineObserver` declaration (`templates/viewer/app.js:528`); missing invalid-refresh diagnostics handling (`app.js:293`); asynchronous tab/source races (`app.js:398`, `:502`); conflicting global/tabstrip arrow-key handlers (`app.js:125`, `:194`); broken cross-tab heading navigation (`app.js:626`); missing ARIA panel targets (`index.html:45`, `:106`). All paths are under `feature-proposal/` unless stated otherwise.
- Token implementation and reload/fragment docs conflict (`app.js:60`, `references/viewer.md:28`); removing tokens is explicitly requested by the user and supersedes the previous plan's capability requirement (`docs/plans/2026-10-01-feature-planning-proposal.md:67`). Retain loopback, request-authority and filesystem boundaries.
- Performance/data/delivery templates seed unsupported claims (`templates/sections/06-performance.md:8`, `:49`; `05-data-api.md:45`; `08-delivery.md:28`). Replace these with evidence-labelled, workload-specific slots, not more canned architecture.
- Existing maintenance contract forbids simulated terminal chrome, but renderer creates it (`AGENTS.md:71`; `templates/viewer/render.js:241`). Preserve the existing Prism Garden palette while replacing unnecessary presentation machinery.
- Baseline `bun test tests/feature-proposal.test.js`: **36 pass, 0 fail**. Native `/opt/homebrew/bin/node --test tests/feature-proposal.test.js`: **36 pass, 0 fail**. No browser execution/performance measurement was performed.
- Environment trap: `node` on PATH resolves to Bun (`/Users/pankil/.bun/bin/node`). Its `node --test` invocation fails with “Cannot use describe outside of the test runner.” This is not a skill defect. Use Bun as specified by package scripts or an actual Node executable for native compatibility checks.
- Existing fixture passes `check --json` with zero diagnostics. Viewer assets total **137,511 bytes / 134.29 KiB uncompressed**. Concatenated gzip size is **31,795 bytes**, an offline estimate, not actual HTTP transfer. Source skill instructions are **4,390 bytes**.
- Worktree was already dirty on `main` at `a28a80d`; preserve unrelated work. The audit's attempted subagent workflow failed before inspection because the host lacked `@earendil-works/pi-agent-core/node`. User authorized direct inspection. Do not repair Pi as part of this task.

## Design & critical decisions

```text
Small SKILL.md -> on-demand planning/format/viewer reference -> authoritative Markdown bundle
                                                             |
                         bounded file loader -> parser/compiler -> two snapshots
                                                             |
                         loopback GET-only server -> metadata + selected tab/source
                                                             |
                         accessible vanilla viewer -> native details + bounded SVG
```

- Keep schema version `1`, eight section filenames, existing tabs, standalone commands and native Node/vanilla browser runtime. No React, bundler, database, service, LLM API, external font, account, token or polling.
- Distinguish the proposal's production system from the presentation tool: future application auth/tenant security stays; only this local viewer's capability auth disappears.
- Replace generic examples with workload/evidence requirements, readable summaries, fair alternatives and complete owner-specific technical contracts. Do not reduce useful proposal detail just to shrink the prompt.
- Keep progressive disclosure through native `details`; summaries stand alone and deep links open technical content. No persona-mode UI or duplicate executive/technical proposals.
- Use an optional, derived navigation index, latest-request-wins rendering and one bounded fetch helper. Avoid a controller framework or a second editable JSON source.
- Trim fake terminal chrome, regex syntax-highlighting machinery, speculative badges and misleading live/presentation claims. Keep diagrams, source, copying, explicit refresh, accessible navigation and light/dark themes.
- Zero-token access is a local presentation choice, not a security equivalent to capability authentication. Local processes/users can read the running viewer; do not load secrets or expose it through tunnels.

## Implementation sequence

Follow the detailed, independently verifiable phases in section 8:
1. Capture baseline and regression cases; preserve unrelated changes.
2. Rewrite prompt/reference/template contract and validate a representative proposal.
3. Remove viewer capability tokens across server, CLI, browser, tests and docs together.
4. Make refresh/error/snapshot/file-loading boundaries reliable.
5. Repair navigation, asynchronous state and accessibility semantics.
6. Simplify visual treatment, code rendering, diagram payload and responsive layouts.
7. Verify prompt behavior against multiple workload/audience scenarios and run real-browser checks.
8. Perform versioned release/documentation/installer verification without changing user data.

Do not silently implement a different schema, remove graph/sequence compatibility, weaken local browser boundaries, or edit legacy user proposals. If an evidence-backed constraint makes the specified budgets infeasible, show the measured cause and smallest alternative before widening scope.

## Verification & release

Exact commands, regression cases and release gate are in section 8. Required repository gate: `npm run validate && npm test && node bin/cli.js update --dry-run`. Use an isolated temporary home/project for destructive installer/update integration cases. Capture actual browser outcomes separately; static tests passing is not browser proof.

Planning verification completed: this proposal bundle passes `check --json` with zero errors and zero warnings; `npm run validate` passes all four skill schemas. Baseline feature-proposal tests pass 36/36 under Bun and native Node. Full repository tests, updater dry-run and real-browser checks are implementation gates, not claimed planning results.

Recommended release when current versions remain unchanged: skill `2.0.0`, package `3.0.0`, dated changelog entry with explicit breaking token/API/agent-rule changes and exact migration commands. Re-check versions at execution time. Proposal data remains schema v1 and unchanged; no data migration command is required. Keep all reference and section paths. Roll back shipped skill assets using updater backups; never delete or regenerate user proposals.

## Fresh-chat execution prompt

```text
Implement docs/plans/2026-10-02-feature-proposal-quality-and-localhost.md.
First read its detailed proposal bundle at docs/proposals/2026-10-02-feature-proposal-quality-and-localhost/proposal.md and all eight listed sections, plus repository and feature-proposal/AGENTS.md instructions. This is authorization to implement the skill/tool improvements, not any application feature described in a proposal.
Preserve existing unrelated work. Prioritize evidence-first, token-efficient prompt engineering and complete technical/plain-language system-design proposals. Then remove ONLY the local viewer capability token/auth; retain production feature auth guidance, loopback/Host/Origin/fetch-metadata/CSP/file safeguards. Fix the cited runtime, refresh, race, deep-link and ARIA defects; simplify presentation without adding runtime dependencies, frameworks, accounts, polling or speculative features.
Follow section 8's phases, file map, tests, browser checks, release and migration requirements. Keep proposal schema v1, existing documents/diagrams and commands compatible except the explicit token contract removal. Do not rewrite user proposals or prior plans. Reconfirm assumptions and versions against live files; do not treat illustrative resource estimates as measured performance. Report touched files, actual test/browser results, size measurements, migration commands and residual risks. Ask before material scope deviations; do not claim a browser check you did not execute.
```
