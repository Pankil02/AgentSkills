# Architecture

## System boundaries {#quality-system-boundaries}

The tool reads a proposal like a book viewer: Markdown is the book; the local server is a bounded reader; the browser cannot rewrite it.

```diagram-json
{
  "schemaVersion": 1,
  "type": "graph",
  "id": "quality-tool-flow",
  "title": "Local read-only proposal flow",
  "summary": "Explicitly listed Markdown is validated once, published as bounded snapshots and read by selected tabs.",
  "nodes": [
    { "id": "author", "label": "Author or agent", "detail": "Writes proposal Markdown", "role": "actor" },
    { "id": "bundle", "label": "Markdown bundle", "detail": "Manifest and listed sections", "role": "store" },
    { "id": "compiler", "label": "Loader and compiler", "detail": "Validate, hash, index navigation", "role": "service" },
    { "id": "server", "label": "Loopback server", "detail": "GET-only, two snapshots", "role": "service" },
    { "id": "browser", "label": "Local browser", "detail": "Metadata and selected tab", "role": "actor" }
  ],
  "edges": [
    { "id": "q1", "from": "author", "to": "bundle", "label": "Explicit file edit", "kind": "data" },
    { "id": "q2", "from": "bundle", "to": "compiler", "label": "Bounded read", "kind": "data" },
    { "id": "q3", "from": "compiler", "to": "server", "label": "Validated snapshot", "kind": "sync" },
    { "id": "q4", "from": "server", "to": "browser", "label": "Local HTTP GET", "kind": "sync" }
  ]
}
```

- Prompt owns intake/reasoning/output rules; reference docs own deep guidance; templates own section shapes.
- `files.mjs` owns bounded safe file bytes; `format.mjs` owns deterministic parsing/validation and derived navigation; `server.mjs` owns HTTP/snapshots; `proposal.mjs` owns CLI lifecycle.
- `app.js` owns selection, requests and status; `render.js` owns safe DOM blocks; `diagrams.js` owns bounded SVG and accessible alternatives; CSS owns presentation.
- No package changes solely for UI libraries, no browser write-back, background polling, database or auth session.

## Information architecture and reader journey {#quality-reader-journey}

- Open plain local URL → Overview and recommendation visible → inspect alternatives → open relevant technical details → review delivery.
- Move Source to the last tab. Keep all existing IDs/tab names for proposal links; source stays a utility, not the first presentation task.
- Show title, proposal status, updated date, owner and last successful refresh. Use “Refresh from disk”, not “Live Sync” or “LIVE SPEC”.
- Add one small reading guide in Overview: outcome first, alternatives second, specialist sections next. Do not add separate dashboards or role filters.
- Keep a short “On this page” outline, wrap or scroll locally at narrow widths. Use headings and link state, not decorative pills.
- Main prose max readable measure about 70–80 characters; technical tables/code/diagrams may use wider bounded containers.
- Use the existing Prism Garden light/dark palette. Remove hard mandates banning readable emphasis or demanding perfectly boxy geometry; accessibility and hierarchy determine weights/borders.
- Use system fonts only; local fallback font names are acceptable but never load external resources.

## Required UI states {#quality-ui-states}

| State | Visible behavior | Focus/interaction |
|---|---|---|
| Initial loading | Clear loading text, no token form. | Focus remains where user placed it; main region busy. |
| Valid content | Summary/recommendation and active tab. | Selected tab owns real labelled panel. |
| Empty section | “No content in this section” with source path. | No blank broken panel. |
| Refreshing | Disable/coalesce Refresh; keep last valid content. | Status announces refresh; no focus reset. |
| Invalid disk edit | Persistent diagnostic banner, exact section/line, last valid version shown. | Link to affected Source document; errors not hidden in toast. |
| Server offline/timeout | Keep content and show retry instruction. | Retry button available; timers cleaned. |
| Stale snapshot | One bounded metadata synchronization then retry; preserve selection. | No recursive refresh loop or unexpected tab change. |
| Copy failure | Inline status and selectable text remain. | No blocking alert dialog. |

## Navigation and accessibility {#quality-navigation-ux}

- Add skip-to-main link; maintain header/main/footer landmarks. Use semantic nav for outline.
- Keep all nine tab buttons. Give each a stable real `role=tabpanel` target; lazy-render only active section and clear inactive rendered trees to keep DOM bounded. Source retains `panel-source`.
- Apply `aria-selected`, roving tabindex, panel `aria-labelledby` and `hidden` consistently. Arrow/Home/End only move tabstrip focus; Enter/Space activate manually. Do not also fire global arrows.
- Remove unmodified global character/arrow shortcuts. Native browser/assistive shortcuts must not be intercepted; retain title hints only for implemented shortcuts.
- Technical details closed by default; essential warnings outside details. H4 content stays inside the relevant H3 technical accordion until same/higher-level heading or document boundary.
- Preserve heading IDs, native details and actual heading hierarchy; use app-title semantics without multiple competing page-level H1s where feasible.
- On navigation to a heading: resolve owning tab, load it, expand ancestor details, focus target with temporary tabindex, scroll respecting reduced-motion preference.
- Use stable URL fragments: `#overview` for tab, `#performance-latency` for heading, `#manifest`/document ID for source/document. Back/forward/deep reload work without authentication.
- Handle supplements via document-to-tab ownership; `#manifest` selects Source manifest. A known heading link never silently fails because another tab is active.
- Contrast target WCAG 2.2 AA: normal text 4.5:1, large text/UI indicators as applicable 3:1; visible focus and non-color verdict/status labels. Test contrast combinations rather than assume palette compliance.
- No horizontal page overflow at 320 px; tables/code/diagrams may scroll inside named containers. Use comfortable button hit areas, responsive wrapping and 200% zoom checks.

### Technical details {#quality-client-state}

Use a small explicit state object: current version, active tab, active source document, metadata/navigation, per-channel request generations, AbortControllers and bounded caches.

- `fetchResource(url, {signal, timeoutMs, responseKind})`: validate `res.ok` and envelope shape; decode JSON/text as appropriate; clear timer in `finally`; return structured transport/API error. No auth header.
- `loadProposal(refresh)`: coalesce refresh, preserve previous state on invalid/error, only commit validated envelope; snapshot version change invalidates relevant caches.
- `activateTab(id)`: reject unknown IDs; cancel previous tab request; capture generation/version/selection; commit only if all still match.
- `loadSourceDocument(id)`: equivalent independent source-request guard; do not cache HTTP error text as Markdown.
- Build URL navigation from compiler-derived metadata; avoid fetching all tab blocks for link discovery. Unknown incoming hash shows fallback notice and Overview, not network recursion.
- Declare `outlineObserver` outside comments, disconnect on tab teardown/refresh; one observer, no background interval.
- Safe rendering remains `createElement`, `createElementNS`, `textContent` and validated attributes. No raw HTML execution, dynamic script compilation or node insertion from source strings.
- Preserve document boundaries in rendering rather than blindly flattening supplements into one accordion/card stream.

## Visual simplification {#quality-visual-simplification}

Replace regex syntax highlighter and fake terminal header/dots with safe `pre > code`, a language label and optional Copy. Preserve exact text; no line-number DOM per token. Remove duplicate heading emoji inference and oversized status badges; use semantic heading/emphasis and modest icons.

Keep graph/sequence, bounds, labels, ownership and accessible table alternative. Simplify overly detailed icon paths while retaining exported names/aliases accepted by existing diagrams. Keep textual edge explanations; icons must not be the only meaning. No automatic animations, export suite or diagram editor. Respect reduced-motion for any remaining scroll/loading affordance.
