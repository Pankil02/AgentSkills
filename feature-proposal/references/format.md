# Format & Authoring Reference

This document specifies the authoritative Markdown bundle format, manifest metadata schema (v1), restricted Markdown subset, diagram specifications, and diagnostic codes.

---

## 1. Directory Structure

A proposal bundle lives in an isolated folder under `docs/proposals/`:

```text
docs/proposals/YYYY-MM-DD-<slug>/
├── proposal.md                 # Root manifest & reading guide
└── sections/                   # Core sections and optional supplements
    ├── 01-overview.md
    ├── 02-requirements.md
    ├── 03-options.md
    ├── 04-architecture.md
    ├── 05-data-api.md
    ├── 06-performance.md
    ├── 07-risks.md
    └── 08-delivery.md
```

---

## 2. Manifest Schema (`proposal.md`)

The manifest contains a single ````proposal-meta```` JSON fence defining the proposal metadata and document index:

````markdown
# Feature Proposal Title

Brief subtitle or plain-language outcome statement.

```proposal-meta
{
  "schemaVersion": 1,
  "id": "my-feature-slug",
  "title": "My Feature Title",
  "status": "draft",
  "created": "2026-10-01",
  "updated": "2026-10-01",
  "owner": "Team / Engineer Name",
  "summary": "Short 1-2 sentence executive summary of the recommendation.",
  "documents": [
    { "id": "overview", "tab": "overview", "title": "📋 Overview", "path": "sections/01-overview.md" },
    { "id": "requirements", "tab": "requirements", "title": "🎯 Requirements", "path": "sections/02-requirements.md" },
    { "id": "options", "tab": "options", "title": "⚖️ Options", "path": "sections/03-options.md" },
    { "id": "architecture", "tab": "architecture", "title": "🏛️ Architecture", "path": "sections/04-architecture.md" },
    { "id": "data-api", "tab": "data-api", "title": "🗄️ Data & API", "path": "sections/05-data-api.md" },
    { "id": "performance", "tab": "performance", "title": "⚡ Performance", "path": "sections/06-performance.md" },
    { "id": "risks", "tab": "risks", "title": "🛡️ Risks", "path": "sections/07-risks.md" },
    { "id": "delivery", "tab": "delivery", "title": "🚀 Delivery", "path": "sections/08-delivery.md" }
  ]
}
```

Reading guide and introduction.
````

### Metadata Rules
- `schemaVersion`: Integer `1`.
- `id`: Lowercase slug matching `^[a-z][a-z0-9-]{1,63}$` (cannot be `manifest`).
- `status`: One of `"draft"`, `"needs-input"`, `"ready"`, `"approved"`, `"superseded"`.
- `created` & `updated`: Valid calendar dates formatted `YYYY-MM-DD`. `updated >= created`.
- `owner`: Author, engineering lead, or owning team.
- `summary`: Concise executive summary (1–2 sentences).
- `documents`: 8 to 23 entries. Must map all 8 core tabs (`overview`, `requirements`, `options`, `architecture`, `data-api`, `performance`, `risks`, `delivery`). Additional entries may be appended as supplements mapped to existing tabs.
- `path`: Relative path under `sections/<name>.md`. No directory traversal (`..`), nested directories, or backslashes.

---

## 3. Section Boundaries & Size Limits

To preserve readability, token efficiency, and fast local rendering:
- **Manifest File (`proposal.md`)**: <=60 total lines.
- **Core Section Files**: <=140 non-empty lines per file.
- **Per-File Size Limit**: <=128 KiB (131,072 bytes) per individual file.
- **Aggregate Bundle Limit**: <=1 MiB (1,048,576 bytes) total and maximum 24 listed documents.
- **Graph Diagrams**: Maximum 12 nodes, 18 edges.
- **Sequence Diagrams**: Maximum 6 participants, 14 messages.
- **Tables**: Maximum 10 columns, 100 body rows.

---

## 4. Restricted Markdown Subset

The parser enforces a deterministic, secure subset of Markdown:

| Markdown Construct | Supported Syntax | Operational Behavior |
|---|---|---|
| **Headings** | `# H1` through `#### H4` | Trailing anchor support: `## Title {#anchor-id}`. Unique across bundle. |
| **Paragraphs** | Text separated by blank lines | Escaped and wrapped safely in `<p>`. |
| **Lists** | `- bullet` or `1. numbered` | Flat lists. Supports task checkboxes `[ ]` and `[x]`. |
| **Tables** | GFM pipe tables | Max 10 columns, 100 rows. Pipes inside cell text must be escaped (`\|`). |
| **Code Blocks** | ```` ```lang ```` code ```` ``` ```` | Preserved literal text; no dynamic runtime evaluation. |
| **Blockquotes** | `> quote text` | Semantic callout block. |
| **Inline Elements** | `**bold**`, `` `code` ``, `[text](url)` | Internal anchors (`#anchor`) or secure `https://` URLs only. |
| **Diagram Fences** | ```` ```diagram-json ```` | Validated JSON for graph or sequence diagrams. |

### Semantic Conventions
- **Collapsible Details**: Headings starting with `### Technical details {#slug}` and `### Tests {#slug}` are automatically rendered as native collapsible `<details>` elements in the local viewer.
- **Raw HTML**: HTML tags within Markdown are escaped and rendered as inert literal text, raising a `RAW_HTML_WARNING` diagnostic.
- **Anchor Resolution**: Internal links use `#tab-id`, `#doc-id`, or explicit `#{#anchor-id}`. Broken internal links raise an `UNKNOWN_ANCHOR` error.

---

## 5. Diagram Specifications (`diagram-json`)

### Graph Diagram
```json
{
  "schemaVersion": 1,
  "type": "graph",
  "id": "my-graph-id",
  "title": "Request Processing Pipeline",
  "summary": "Synchronous validation and single-transaction persistence.",
  "nodes": [
    { "id": "client", "label": "Client", "detail": "User browser", "lane": 0, "order": 0, "role": "actor", "icon": "browser" },
    { "id": "gateway", "label": "API Gateway", "detail": "Auth & Rate Limit", "lane": 1, "order": 0, "role": "service", "icon": "api-gateway" },
    { "id": "db", "label": "Database", "detail": "Atomic Transaction", "lane": 2, "order": 0, "role": "store", "icon": "database" }
  ],
  "edges": [
    { "id": "e1", "from": "client", "to": "gateway", "label": "HTTPS POST", "kind": "sync" },
    { "id": "e2", "from": "gateway", "to": "db", "label": "INSERT order", "kind": "sync" }
  ]
}
```
- **Bounds**: <=12 nodes, <=18 edges.
- **Node Lanes & Orders (Optional)**: `lane` (0–4) and `order` (0–3). When omitted, automatic topological layout positions nodes.
- **Roles**: `"actor"`, `"service"` (default), `"store"`, `"queue"`, `"external"`, `"state"`.
- **System Design Icons (Optional)**: Supports vector SVGs: `"cdn"`, `"database"`, `"redis"`, `"browser"`, `"server"`, `"app-server"`, `"load-balancer"`, `"api-gateway"`, `"queue"`, `"external"`, `"storage"`, `"auth"`, `"worker"`, `"search"`, `"metrics"`, `"notification"`, `"container"`, `"state"`, `"user"`, `"network"`. Auto-inferred if omitted.
- **Edge Kinds**: `"sync"` (default), `"async"`, `"data"`, `"failure"`.
- **Edge Routes**: `"forward"` (default), `"top"`, `"bottom"`.

### Sequence Diagram
```json
{
  "schemaVersion": 1,
  "type": "sequence",
  "id": "my-sequence-id",
  "title": "Order Placement Sequence",
  "summary": "Client submits order through gateway to database.",
  "participants": [
    { "id": "client", "label": "Client", "icon": "browser" },
    { "id": "gateway", "label": "Gateway", "icon": "api-gateway" },
    { "id": "db", "label": "Database", "icon": "database" }
  ],
  "messages": [
    { "id": "m1", "from": "client", "to": "gateway", "label": "POST /orders", "kind": "request" },
    { "id": "m2", "from": "gateway", "to": "db", "label": "INSERT order", "kind": "request" },
    { "id": "m3", "from": "db", "to": "gateway", "label": "201 Created", "kind": "response" },
    { "id": "m4", "from": "gateway", "to": "client", "label": "Order Confirmation", "kind": "response" }
  ]
}
```
- **Bounds**: <=6 participants, <=14 messages.
- **Participant Icons (Optional)**: Same icon catalog as graph nodes, auto-inferred if omitted.
- **Message Kinds**: `"request"`, `"response"`, `"async"`, `"failure"`.

---

## 6. Diagnostic Codes

The validation engine emits structured diagnostic objects:

| Diagnostic Code | Severity | Description |
|---|---|---|
| `INVALID_METADATA` | error | Malformed `proposal-meta` JSON block, missing keys, or invalid date values |
| `INVALID_PATH` | error | Document path traversal (`..`), backslashes, or unlisted file location |
| `MISSING_CORE_TAB` | error | Manifest missing one of the 8 mandatory core tab mappings |
| `DUPLICATE_ID` | error | Duplicate document ID, heading anchor ID, node ID, or edge ID |
| `UNKNOWN_ANCHOR` | error | Internal link targets a non-existent tab, document, or anchor |
| `UNCLOSED_FENCE` | error | Code block or diagram JSON fence not properly closed |
| `MALFORMED_TABLE` | error | Inconsistent column counts or unescaped pipe characters |
| `DIAGRAM_LIMIT` | error | Exceeded maximum nodes (12), edges (18), participants (6), or messages (14) |
| `OVERSIZE` | error | Single file exceeds 128 KiB or aggregate bundle exceeds 1 MiB |
| `RAW_HTML_WARNING` | warning | Raw HTML detected in Markdown; rendered as escaped literal text |
