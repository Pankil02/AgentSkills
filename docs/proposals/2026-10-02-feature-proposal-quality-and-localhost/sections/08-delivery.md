# Delivery

## File map {#quality-delivery-files}

| File | Action | Exact responsibility |
|---|---|---|
| `feature-proposal/SKILL.md` | Modify | Small router/workflow, evidence and audience/quality gates; remove token instructions; version. |
| `feature-proposal/references/planning.md` | Modify | Owning rubric: fair options, specialist completeness, workload calculations, evidence/N/A and examples. |
| `feature-proposal/references/format.md` | Modify | Preserve v1; headings/document boundaries, layered writing and plain formulas; no unsupported features. |
| `feature-proposal/references/viewer.md` | Modify | Plain URL, request/local trust boundary, real UI states/keys, refresh/errors and troubleshooting. |
| `feature-proposal/templates/proposal.md` | Modify | Neutral reading guide/status; preserve manifest schema/paths. |
| `feature-proposal/templates/sections/01-overview.md` | Modify | Outcome/recommendation/alternative/downside/readiness; no fake confidence. |
| `feature-proposal/templates/sections/02-requirements.md` | Modify | Actors, acceptance/UI states, workload input/evidence and glossary. |
| `feature-proposal/templates/sections/03-options.md` | Modify | Shared-input viable options, resource trade-offs, accepted downside and revisit trigger. |
| `feature-proposal/templates/sections/04-architecture.md` | Modify | Actual components/owners/trust/state flows; no canned gateway/service split. |
| `feature-proposal/templates/sections/05-data-api.md` | Modify | Stack-specific contract/query/schema slots, bytes/blobs, locking/migration and N/A. |
| `feature-proposal/templates/sections/06-performance.md` | Modify | Labelled workload/CPU/DB/memory/latency/transfer/compression budgets and method; no invented fixed timings. |
| `feature-proposal/templates/sections/07-risks.md` | Modify | Concrete failure/control/test/residual risk; no “Nil risk” canned assurances. |
| `feature-proposal/templates/sections/08-delivery.md` | Modify | Real file map, verifiable atomic steps, rollout/rollback and precise handoff. |
| `feature-proposal/scripts/format.mjs` | Modify | Pure derived navigation helper; preserve parsing/hash/export compatibility. |
| `feature-proposal/scripts/files.mjs` | Modify | Separator-aware canonical containment, ancestry/descriptor checks, bounded save-race retry. |
| `feature-proposal/scripts/server.mjs` | Modify | No capability; common headers/error boundary, canonical authority, safe refresh/diagnostics, cached allowlisted assets. |
| `feature-proposal/scripts/proposal.mjs` | Modify | Plain URL, strict port validation, idempotent process shutdown and accurate help. |
| `feature-proposal/templates/viewer/app.js` | Modify | No auth; bounded fetch/generations, navigation, statuses/observer cleanup and ARIA activation. |
| `feature-proposal/templates/viewer/index.html` | Modify | Real panels/skip link, Source last, honest metadata/status and minimal controls. |
| `feature-proposal/templates/viewer/render.js` | Modify | Plain safe code, document-aware headings/details, accessible copy/errors; delete highlighter/chrome. |
| `feature-proposal/templates/viewer/diagrams.js` | Modify | Compact SVG paths/labels/alternatives; preserve graph/sequence and accepted icon catalog. |
| `feature-proposal/templates/viewer/styles.css` | Modify | Readable hierarchy, scoped overflow, responsive/zoom/focus/contrast/reduced motion; remove dead chrome CSS. |
| `tests/feature-proposal.test.js` | Modify | Token-free HTTP + origin/errors/refresh/navigation/limits/source regressions; static checks not sole UI proof. |
| `tests/fixtures/feature-proposal/` | Modify or supplement | Add representative cross-tab details/supplement fixtures without changing real user proposals. |
| `tests/browser/feature-proposal/` | New | Small test-only native browser harness/server for executing DOM/async/keyboard regressions, no runtime dependency. |
| `feature-proposal/README.md`, `feature-proposal/AGENTS.md` | Modify | New contract, actual controls, audience quality, maintainer budgets and no token invariants. |
| Root `README.md`, `AGENTS.md`, `CHANGELOG.md`, `package.json`, tracked lockfile | Modify | Skill summaries/layout, breaking release/migration and synchronized package version. |
| `tests/cli.test.js` | Modify only if needed | Standalone copied skill/update-dry-run regression; isolate home/workspace. |
| `src/agents.js`, `src/updater.js` | No change planned | Layout/paths/exclusions unchanged; change together plus Update Engine test only if an actual layout change arises. |

No packaged files need deletion; remove unnecessary implementations inside existing paths. Do not edit installed symlink separately or rewrite unrelated app/test changes.

## Ordered execution phases {#quality-delivery-phases}

- Phase 0 — Baseline: read repo/scoped contracts and this bundle; capture dirty status/diff without stash/reset; reconfirm versions, exact functions and tests. Run existing fixture/tests and asset byte count. Done when findings/baseline are reproducible and unrelated edits are identified.
- Phase 1 — Regression scaffolding: add tests for each cited P1 bug alongside the matching fixes in subsequent phases; test harness loads real viewer assets against bounded fixture API responses. Establish explicit metadata/tab/source failure/delay cases, not snapshots of implementation strings. Done when baseline still passes and failing cases are reproducible in isolation.
- Phase 2 — Prompt first: rewrite SKILL/router, planning/format docs and eight templates. Remove canned confidence/timings/SQL/folders and duplicate requirements; add workload/resource/evidence/N/A/analogy ownership. Validate a newly authored representative sample; do not rewrite legacy proposals. Done when technical/nontechnical rubric and entry-size target pass.
- Phase 3 — Token-free vertical slice: change server/CLI/browser token lifecycle/tests/viewer docs together so tool remains usable. Remove auth only; validate ports and preserve request/file safeguards. Done when plain URL, reload, second tab, API GET without headers and hostile-origin/method tests pass; no token property/form/header/URL remains.
- Phase 4 — Robust reads and refresh: structured diagnostics for read/compile errors; last-good snapshot, single-flight refresh, two-version retention, error headers; separator-aware containment and bounded save-race detection. Cache allowlisted assets at startup. Done when invalid→fix→valid refresh, missing-file/UTF-8/symlink/traversal and snapshot eviction cases pass without process crash.
- Phase 5 — Navigation/state: pure ownership index, bounded fetch helper, independent tab/source abort/generation guards, real panel semantics, declared/cleaned observer, URL/deep link/history and manual tabstrip keyboard behavior. Done when slow A cannot overwrite B, cross-tab details open/focus correctly, and no duplicate event/observer survives cycles.
- Phase 6 — UI simplification: remove highlighter/traffic-light/token-related/dead CSS, decorative heading inference and misleading live badges; Source last, readable summaries/details, responsive containers and contrast/focus. Simplify icons while preserving keys/aliases. Done when size target and real browser narrow/zoom/theme/copy/diagram checks pass.
- Phase 7 — Prompt evaluation and load verification: run small local UI, CRUD, blob-heavy million-account and unknown-input scenarios; compare outputs against section 2 and quantitative rubric. Execute fixture/near-limit browser timings and 100-cycle stability check; record hardware, sizes, percentiles and errors. Done when no unsupported guarantees, omitted specialist contracts or idle work remains.
- Phase 8 — Release/integration: versions, docs/changelog/migration, standalone-copy smoke and isolated updater/installer cases, complete repository gate. Done when all actually executed results and any residual blocker are reported; never run a real destructive user update.

Commit boundaries, if requested, should be passing vertical slices; do not commit deliberately failing tests. Ask before materially changing schema, runtime dependencies, local trust boundary or retained features.

## Automated and browser cases {#quality-delivery-tests}

### Tests {#quality-delivery-test-detail}

- Parser/navigation: global anchor uniqueness, unknown links, cross-tab H3 anchor, supplement ownership, manifest source mapping; legacy compile/source/hash behavior unchanged.
- HTTP: no-auth proposal/tab/source 200; no token return; wrong Host/port, hostile Origin, same-site/cross-site metadata 403; absent metadata local CLI allowed; API no-store, CSP/nosniff/referrer headers on success/errors; GET-only 405 and unknown 404.
- Refresh: bad metadata/fence/anchor/UTF-8/missing doc/oversize → valid:false + last-good version + actionable diagnostics; corrected refresh publishes; unchanged hash no extra snapshot; concurrent refresh single-flight; current/previous/evicted version consistency.
- Files: file and sections symlink/junction rejection; traversal/null/backslash paths; sibling-prefix containment; safe export forbidden-directory boundaries; one bounded save-race retry; exact CRLF/Unicode source preserved.
- CLI: port 0/max valid, malformed/fraction/trailing junk/out-of-range invalid; no-open plain URL; explicit busy-port failure/default scan; repeat shutdown idempotent with sockets closed; copied skill runs outside repo without node_modules.
- Browser lifecycle: first load outline does not throw; retry/offline error visible; failed HTTP source not cached; stale synchronization bounded; overlapping tab/source/version requests latest-only; all timers/observers/listeners cleaned.
- Browser UX: manual tabstrip arrow/Home/End focus vs Enter/Space activation; all real ARIA targets; skip/focus flow; anchors across tabs/supplements, open details and back/forward/reload; technical H4 remains in details; critical warning stays visible.
- Browser safety/layout: malicious Markdown inert, links validated, text/code copying exact, clipboard rejection nonblocking, empty/loading/invalid/last-good states, 320/768/1440 px, 200% zoom, both themes, contrast and reduced-motion.
- Performance: raw per-asset/entry bytes; no external resources/polling/auth; initial selected-tab-only; 30 reload/switch timings; near-limit blocks/diagrams; 100 cycles plateau. Do not equate gzip estimate or source bytes with live transfer/RSS.
- Prompt review: output for local no-DB UI marks DB/blob N/A; CRUD uses actual stack and bounded queries; million-account case derives workload and compares real alternatives; blob case reports KB/KiB/compression/egress; unknown blocking case uses needs-input. Semantic results require human/agent review, not invented deterministic quality scores.

Browser harness remains test-only: standard-library fixture server, real production assets, deterministic controllable API delays/failures and browser DOM assertions. Use an available browser automation tool or open harness and record assertions manually. Do not add a mandatory runtime dependency, change production allowlists for testing, or assert browser tests ran merely because the harness file exists.

## Exact verification commands {#quality-delivery-commands}

Run from repository root after implementation:

```bash
bun test tests/feature-proposal.test.js
node feature-proposal/scripts/proposal.mjs check --plan tests/fixtures/feature-proposal/proposal.md --json
node feature-proposal/scripts/proposal.mjs check --plan docs/proposals/2026-10-02-feature-proposal-quality-and-localhost/proposal.md --json
node feature-proposal/scripts/proposal.mjs view --plan tests/fixtures/feature-proposal/proposal.md --port 4317 --no-open
# Open http://127.0.0.1:4317/; reload and open a second tab; then Ctrl+C.
node tests/browser/feature-proposal/run.mjs
# Open harness URL; execute/report actual browser assertions, then Ctrl+C.
npm run validate && npm test && node bin/cli.js update --dry-run
npm run doctor
```

Use an actual Node >=18 executable for native compatibility tests: `NATIVE_NODE --test tests/feature-proposal.test.js` where NATIVE_NODE is its executable path; on this machine `/opt/homebrew/bin/node` is native, while PATH `node` is Bun. CI should run a supported Node 18+ version on macOS/Ubuntu/Windows; no incidental runtime engine raise.

Use `node bin/cli.js install feature-proposal --target universal --scope project --copy --dry-run --json` first; real copy/update tests must use isolated temporary home/workspace and existing test helpers. Capture command exit/result without copying full logs into handoff. Verify standalone package assets and no runtime package imports.

## Release, migration and rollback {#quality-release}

- Reconfirm live versions. If still skill 1.4.0/package 2.6.0: release skill 2.0.0 and package 3.0.0 because viewer token/API and enforced agent rules change. Do not bump versions when merely writing this plan.
- Add new top changelog release dated actual release day; distinguish token/API/agent-rule breaking changes from unchanged schema/user data. Sync root/skill docs, AGENTS layout/summary and tracked package-lock version without broad dependency churn. Do not regenerate unrelated untracked `bun.lock` blindly.
- Migration: preview `npx github:Pankil02/AgentSkills update --dry-run`, then `npx github:Pankil02/AgentSkills update`; restart viewer, use printed plain 127.0.0.1 URL, remove Authorization/token handling from custom integrations. `startViewer().token` no longer exists. No reference renames or proposal edits required.
- Existing schema v1 user bundles need no migration; no UPGRADE/data migration command necessary unless implementation actually changes user data, which is outside this plan.
- Symlink installs follow updated checkout; copy installs use atomic updater/backups. Verify updater dry-run and copied standalone skill, not real global apply.
- Rollback shipped skill with updater backup/previous release; restore previous CLI integration if needed. Stop/restart viewer. Never delete/regenerate user proposals or undo unrelated owner work.

## Fresh-chat implementation contract {#quality-handoff}

Implement this bundle via the companion `docs/plans/2026-10-02-feature-proposal-quality-and-localhost.md`. Read all sections, verify live evidence, follow phases, and report code changes, actual tests/browser measurements, instruction/asset sizes, breaking migration and residual risks. Prioritize prompt correctness before UI decoration; remove only local capability auth; preserve production security and zero-runtime-dependency boundaries. Ask before scope deviations.
