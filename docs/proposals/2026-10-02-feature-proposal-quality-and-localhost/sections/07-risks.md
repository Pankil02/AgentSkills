# Risks

## Threat model {#quality-threat-model}

Treat proposal Markdown as untrusted passive input; treat loopback callers as local readers, not authenticated identities. A simple local viewer is not a safe place for credentials or a shared confidential workspace.

- Protect against malformed documents, script injection, unsafe links, oversized bundles, accidental path traversal/symlinks, hostile website origins, invalid saves and stale asynchronous rendering.
- Do not claim protection against malicious local software, other users with loopback access, browser extensions, compromised OS, or filesystem races performed by a privileged attacker.
- Token removal expands local API readability. This is an explicit accepted trade-off, not an accidental relaxation. No LAN host, wildcard bind, reverse proxy or tunnel configuration.
- Only viewer capability auth is removed. Production designs continue evaluating authentication, object authorization, tenancy, encryption, abuse controls and audit.
- Never load proposals containing secrets/credentials. Existing repository proposals must not be indexed or altered beyond a specifically requested bundle.

## Failure and safety matrix {#quality-failure-matrix}

| Risk | Concrete behavior | Mitigation | Verification / residual risk |
|---|---|---|---|
| Hostile website calls local API | Browser cross-origin or same-site different-port request. | Strict Host/Origin, reject cross-site/same-site API metadata, no CORS, self-only CSP. | Raw HTTP and browser cases; headers are not local authentication. |
| Local caller reads plan | Loopback accessible without token. | Explicit trust boundary; no secrets, no tunnels, process lifetime only. | Accepted residual risk; stop if confidentiality requirements change. |
| Proposal XSS | HTML, script URLs, inline attributes or malformed SVG labels. | Text DOM APIs, link allowlist, validated diagram attributes, restrictive CSP. | Malicious fixture; inert text; external links safe rel values. |
| Traversal/symlink | Listed path escapes root or symlink/junction redirects read. | Manifest grammar, ancestry checks, canonical relative containment, bounded descriptor reads. | POSIX/Windows fixtures and sibling-prefix regression; not adversarial local-user sandbox. |
| Invalid edit refresh | Missing file, bad JSON/fence, invalid UTF-8, bad anchor. | Catch load/compile error, keep last-good snapshot, file/line diagnostics, retry after correction. | Content remains unchanged; next valid refresh succeeds. |
| Mixed save | File changes during bundle read. | Bounded identity/mtime/size recheck, one whole-bundle retry. | Controlled save-race test; cannot guarantee semantic atomicity across separate editor saves. |
| Async tab/source race | Slow old request returns after selection/version changed. | Abort plus generation/version/selection guard. | Delay A, select B, resolve A; B stays visible. |
| Stale-version loop | Snapshot evicted while client fetches. | One metadata sync and one retry, then visible error. | Repeated 409 does not cause recursion or uncontrolled reads. |
| HTTP/file exception | Async handler rejects after missing asset/read failure. | Bounded catch/sanitized envelope; headers and last-good state consistent. | Missing assets/load errors do not crash server or hang response. |
| Keyboard conflict | Arrow fires focus and global selection simultaneously. | Manual WAI-ARIA tab handling; remove global unmodified shortcuts. | Arrow only changes focus; Enter activates once; form/details/browser keys unaffected. |
| Inaccessible layout | Missing panels, low contrast, oversized tables, hidden essentials. | Real panel IDs, visible focus, readable measure, native details, scoped overflow. | Screen reader, contrast, narrow/zoom checks; static landmarks alone insufficient. |
| Memory/CPU regression | Retained snapshots/DOM/observers/timers or expensive highlighter. | Two snapshots, single observer, request cleanup, plain code, bounded caches and SVG. | 100-cycle plateau and measured render; no idle poll/animation loop. |
| Invented technical guarantee | Template example presented as actual system evidence. | Explicit evidence status, same-input alternatives, semantic checklist, no canned latency/SQL. | Prompt scenario review; deterministic parser cannot establish truth. |
| Overengineering | Million accounts used to mandate cache/broker/sharding. | Convert accounts to operations/workload; reuse first; justified capacity trigger. | Simple-feature proposal does not invent infrastructure. |
| Over-pruning | Tiny prompt omits essential DB/security/failure detail. | Small entry point, on-demand complete rubric, N/A reasons and specialist matrix. | Technical leads can answer implementation questions from owning sections. |

## Prompt-specific risks {#quality-prompt-risks}

- Arbitrary <=140 nonempty-line section targets can suppress essential contracts. Retain as a soft authoring target, not a technical-quality gate; use existing optional supplements only for real depth and avoid duplicate summaries.
- Current performance template LaTeX is not a supported math renderer. Use plain-language formulas or plain code text, not a new math dependency.
- “Nil residual risk”, “pool easily handles” and “zero downtime” example text encourages unjustified confidence. Replace with concrete residual risk and migration/load validation requirements.
- Avoid prescribing PostgreSQL, JWT, repositories, gateways, microservices, feature flags or brokers when the actual stack/requirements do not justify them.
- Do not run generated proposal snippets as implementation or migration steps during planning. Author them as passive proposed contracts.
- Fair alternatives are not a contest with a predetermined winner. If a chosen option loses under stated peak/correctness limits, change the recommendation or mark needs-input.
- Unknown blocking workload/security constraints prevent “approved” status. `ready` means ready for review/implementation planning, not user sign-off.

### Technical details {#quality-compatibility}

- Keep manifest schemaVersion 1, eight core tabs and paths, optional supplements, graph/sequence limits and accepted icon keys/aliases. Do not require a migration of saved user proposals.
- New navigation data is derived API metadata only; compile source fidelity/hash remains unchanged. Test old fixture and previous valid user-style bundles without editing them.
- Remove `startViewer().token`, token URL and bearer gate as a documented breaking contract. Local GET now succeeds without Authorization; retaining an ignored Authorization header should not be required or used as an access boundary.
- Canonical 127.0.0.1 authority may reject old manually substituted localhost links. Migration says use newly printed URL; this is intentional origin simplification.
- Source/tab IDs and anchors remain stable; UI can reorder Source last. Existing copied heading links become functional.
- Reference file paths do not change. No removed packaged files unless release notes explicitly map them; prefer deleting code blocks, not asset paths.
- `compile --out` remains explicit atomic export with protected destination checks; user data is never reformatted as part of update.
- Test actual Node >=18 compatibility and Windows filesystem behavior; current audit only exercised Bun/native Node 26 on macOS.

## Approval and rollout gates {#quality-approval-gates}

- User explicitly approved token-free local use and direct audit. The execution handoff authorizes this skill/tool refactor, not arbitrary app features.
- Preserve Prism Garden palette unless measured accessibility requires adjustments; no unrelated rebrand.
- If implementing budgets requires a new runtime dependency, schema v2, network exposure, auth replacement, removed diagrams/source, or rewrite of existing proposals: stop and request a revised decision.
- If a browser environment is unavailable, record the missing browser gate as a blocker/residual risk; do not substitute static test success for executed accessibility/race checks.
- Existing unrelated modified/untracked files are owner work. No stash/reset/clean/delete, broad regeneration, lockfile overhaul or auto-update/install against the user's real global scope.

## Scope deliberately removed or excluded {#quality-scope-pruning}

Remove viewer token forms/secrets/headers, fake traffic-light chrome, regex syntax highlighter and per-token line DOM, duplicate decorative heading icons, misleading “Live” badges, unused server locals, unsupported Zen/download claims and unmodified global hotkeys.

Do not add analytics, hosted sharing, authentication replacement, roles, accounts, persona modes, task tracking, billing/token accounting, editing, polling/WebSockets, frameworks, remote fonts, export video/image suites, mandatory architecture services or custom diagram-language expansion. Keep source/copy, diagrams/text alternative, themes, explicit refresh, stable navigation and complete engineering reasoning.
