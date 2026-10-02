# Options

## Decision 1: Planning architecture {#quality-planning-options}

One layered, evidence-first Markdown proposal is recommended: it keeps everyone aligned without duplicating facts or starving engineers of detail.

| Option | Benefit | Downside / failure | Verdict |
|---|---|---|---|
| A: Small workflow + on-demand rubric + eight-section layered proposal | Least recurring instruction load; shared facts; existing format/viewer reuse. | Requires disciplined ownership and semantic review; parser cannot judge design correctness. | Recommended. |
| B: Large mandatory all-purpose system-design prompt/template | Broad checklist always visible. | Wastes context for view/check/simple features; canned architectures and repeated instructions increase bias. | Reject for recurring overhead. |
| C: Separate executive and technical proposals | Tailored reading lengths. | Duplicate assumptions/options drift; doubles edits and review; hides agreement problems. | Reject; summaries and native details achieve layering in one source. |

Revisit A only if real user studies show role-specific workflows cannot be served by the common summary/detail structure. Do not add persona UI before that evidence.

## Decision 2: Viewer access {#quality-access-options}

A plain loopback URL is recommended because this is a local reading tool, not a multi-user service.

| Option | Security/access boundary | Cost / downside | Verdict |
|---|---|---|---|
| A: No token; strict loopback/authority/origin/fetch checks; read-only allowlists | Blocks network binding and browser cross-origin access; local callers remain trusted by deployment choice. | Any local process/user can read the proposal while server runs. Must not contain secrets. | Recommended; explicitly requested. |
| B: Keep capability token and repair reload/session UX | Protects API access from unauthenticated local callers and some requests lacking browser metadata. | Secret lifecycle, copied-link handling and onboarding remain; contradicts requested simplicity. | Reject for this scope, not because tokens are inherently bad. |
| C: Standalone HTML embedding the entire proposal | No server/port lifecycle. | Duplicates snapshot bytes, weaker update/source workflow, file-origin differences, generated export data to manage. | Reject as default; not a necessary additional export feature. |

Do not describe A as security-equivalent to B. If sensitive proposals, shared hosts, LAN access or tunnels become requirements, stop and design an authenticated tool separately.

## Decision 3: Viewer runtime {#quality-runtime-options}

| Option | Benefit | Downside | Verdict |
|---|---|---|---|
| A: Native Node server + existing parser + vanilla modules | No installs/builds/framework; bounded small surface; current tests reusable. | Requires explicit DOM-state and HTTP correctness work. | Recommended. |
| B: React/Vue app + bundler/Markdown package | Familiar component/test ecosystem. | Package/install/build/security overhead without demonstrated need. | Reject. |
| C: Server-render every selected tab | Less browser rendering logic. | Safe HTML renderer/escaping duplication and API/source refactor; more disruption. | Reject for existing schema/runtime. |

Keep functions/maps/composition. Extract a helper only for a repeated operation, boundary or explicit test seam; no generic controller/plugin/event framework.

## Decision 4: Navigation and async state {#quality-navigation-options}

| Option | Benefit | Downside | Verdict |
|---|---|---|---|
| A: Derived navigation ownership + small request-generation state | Correct cross-tab heading links and back/forward; bounded and deterministic. | Additive navigation metadata requires fixtures/tests. | Recommended. |
| B: Fetch all eight tabs at startup to discover anchors | No compiler navigation addition. | More transfer/AST/DOM work and full-bundle startup; conflicts with lazy viewing. | Reject. |
| C: Ban cross-tab heading links | Simplest browser behavior. | Compiler currently validates them; loses important document cross-references and breaks proposals. | Reject. |

Use a derived navigation index in viewer metadata, not a second authored registry. Keep exported schema v1 compatibility; add API navigation data without requiring new manifest fields.

## Decision 5: Rendering and visuals {#quality-rendering-options}

| Option | Benefit | Downside | Verdict |
|---|---|---|---|
| A: Native details, plain safe code, compact bounded SVG, existing palette | Readable, accessible, fewer allocations and fewer bytes. | Less decorative syntax coloring; icon simplification needs visual review. | Recommended. |
| B: Retain regex syntax highlighting, terminal chrome, heavy badges | Familiar decorative presentation. | High rendering complexity, rule contradiction, copy/visual noise; no proven comprehension advantage. | Reject unnecessary features. |
| C: Remove diagrams/source/theme entirely | Smallest raw payload. | Loses engineering comprehension, source fidelity and low-light accessibility. | Reject over-pruning. |

Keep graph/sequence bounds and public icon names/aliases; reduce path detail rather than rejecting old icon inputs. Diagram Copy SVG may stay if its implementation remains small; do not add image/video exports, animation players or editors.

## Decision 6: Transfer and compression {#quality-compression-options}

| Option | Benefit | Downside | Verdict |
|---|---|---|---|
| A: Trim assets; cache allowlisted assets in process; lazy tabs; identity transfer | Least server complexity; no per-request compression CPU; appropriate loopback scope. | Raw first-load bytes higher than gzip. | Recommended initial design. |
| B: Native cached gzip for allowlisted assets | Lower transfer bytes with Node standard library. | Accept-Encoding/Vary/ETag variants and memory add complexity; localhost link usually not bottleneck. | Only if measurements show transfer budget failure after trim. |
| C: Runtime gzip/Brotli every response or ZIP the proposal | Potential WAN savings. | Per-request CPU, latency and decompression concerns; ZIP not HTTP streaming compression. | Reject for local viewer. |

Feature proposals still evaluate compression for the production workload. Choosing identity for this local tool must not erase network/blob analysis in generated plans.

### Technical details {#quality-option-evaluation}

For future generated proposals, record these columns for each viable option: components and owners; correctness/security gates; normal/peak/stress behavior; queries/rows/DB time; CPU ms/request; memory; p95/p99 and evidence status; raw/wire/blob bytes; storage/egress; failure/consistency model; implementation/operating cost; downside; revisit trigger.

Split wide matrices into smaller shared-row tables instead of exceeding ten columns. Prefer constraint pass/fail and evidence-led rationale over invented weighted scores. If numbers are unknown, list the measurement that decides the choice and mark readiness accordingly.
