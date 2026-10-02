# AGENTS.md — Maintenance & Operational Contract for `feature-proposal`

> **Audience**: AI agents modifying, maintaining, or operating within the `feature-proposal` skill package.

---

## 1. Skill Invariants & Boundaries

- **Single Skill Package**: Contains both the planning guidance and the standalone local presentation tool.
- **Zero Third-Party Runtime Dependencies**: All runtime scripts (`scripts/*.mjs`) and viewer templates (`templates/viewer/*`) must execute purely with native Node.js (>=18.0.0) standard modules (`node:fs`, `node:path`, `node:http`, `node:crypto`, `node:util`) and vanilla HTML5/CSS3/ES modules. Never add npm dependencies to this skill.
- **Authoritative Markdown**: The files under `docs/proposals/` on disk are the single source of truth. Derived JSON ASTs are produced on demand in memory or via explicit export; never treat JSON as a parallel or editable source of truth.
- **No Browser Write-Back**: The local HTTP viewer is read-only. Editing occurs exclusively via filesystem text editing tools; users or agents refresh the browser view via the explicit `Refresh` action.
- **No Autonomous Feature Implementation**: This skill proposes and plans architecture. It must never implement the application features it designs.

---

## 2. Directory Layout & Module Responsibilities

```text
feature-proposal/
├── AGENTS.md                # Maintenance contract & architectural invariants (THIS FILE)
├── SKILL.md                 # Agent instructions, triggers, frontmatter v2.0.0
├── README.md                # User-facing guide, commands, and installation instructions
├── references/              # Deep guidance docs loaded on-demand
│   ├── planning.md          # Intake rubric, option evaluation, enterprise checklist
│   ├── format.md            # Manifest schema, restricted Markdown, diagram JSON specs
│   └── viewer.md            # Viewer architecture, security model, and troubleshooting
├── scripts/                 # Standalone native Node.js runtime (ESM .mjs)
│   ├── proposal.mjs         # CLI router (parseArgs), exit code handling, process lifecycle
│   ├── files.mjs            # Manifest-first safe filesystem loading & atomic JSON export
│   ├── format.mjs           # Pure restricted Markdown parser, diagram validator, AST builder
│   └── server.mjs           # Protected loopback HTTP server, token-free, snapshots
└── templates/               # Reusable authoring & presentation assets
    ├── proposal.md          # Manifest template with marked placeholders
    ├── sections/            # Core section templates (01 through 08)
    └── viewer/              # Reusable browser viewer (index.html, styles.css, app.js, render.js, diagrams.js)
```

---

## 3. Security & Safety Invariants

- **Token-Free Localhost Presentation**: The viewer is a read-only presentation endpoint accessible directly via plain `http://127.0.0.1:<port>/`. No capability tokens, cookies, or Authorization headers are generated, passed, or stored.
- **Zero Secret Exposure**: Because local processes can read the loopback viewer, never expose the port through external tunnels, and never embed secrets or production credentials in feature proposals.
- **Origin & Host Enforcement**: Strictly validate `Host` against `127.0.0.1:<port>`. Reject requests with non-matching `Origin` headers or cross-site fetch metadata (`Sec-Fetch-Site`).
- **Filesystem Confinement**: Read exclusively the canonical `proposal.md` and listed `sections/*.md` files within the proposal directory. Reject symlinks, junctions, directory traversals (`..`), null bytes, and any paths outside the proposal root.
- **Never Touch Protected Files**: Never index, read, or export `.env*`, `.git`, credentials, secrets, or `node_modules`.

---

## 4. Derived JSON & Validation Contracts

- Format `schemaVersion` is integer `1`.
- Parser must be purely deterministic and non-destructive to source bytes.
- Total document limits: maximum 24 listed documents, <=128 KiB per file, <=1 MiB aggregate bundle.
- Diagram limits: graph diagrams <=12 nodes, <=18 edges; sequence diagrams <=6 participants, <=14 messages.
- Tables: maximum 10 columns, 100 body rows.
- HTML elements in Markdown are rendered as inert text; never use `innerHTML` or dynamic code evaluation.

---

## 5. Design System & Theme Contract (`Prism Garden`)

The browser viewer UI adheres to the following design system:

- **Theme & Palette**: Based on the user's local WezTerm configuration (`Prism Garden` / warm paper-cut):
  - **Light Mode (Default)**: Warm paper lilac (`#F4F1FF`), parchment card surface (`#FFF9F2`), elevated panels (`#E5DFEB`), deep ink (`#282631`), rule borders (`#C9C2D0`), burnt clay (`#C15F3C`), terracotta (`#D77757`), sage (`#28766F`), leaf (`#4F7658`), lake (`#51679F`), marigold (`#9B6A22`), plum (`#7A5B7E`), blush (`#B65368`).
  - **Dark Mode**: Deep aubergine paper (`#1D1A24`), dark parchment cards (`#292431`), light ink (`#EEE8F2`), rule borders (`#4A4252`), bright accents (`#D77757`, `#70C2B8`, `#8DB394`, `#91A7DF`, `#D3A55B`, `#B895BC`, `#DC7890`).
- **Typography**: Dual-font pairing with modern system sans for prose and tabular monospace (`Courier Prime`, `Iosevka Etoile`, `Menlo`, `Monaco`, `monospace`) with `font-feature-settings: "tnum" 1` for tables, metrics, IDs, code, and diagram labels.
- **Aesthetic Directives**: Clean, high-density executive review web application. Never add simulated terminal chrome (no fake macOS window traffic lights, no CLI `$ cat` or `>` prompts, no terminal titlebars).
- **Landmark Invariants**: `index.html` must retain all 9 tab landmarks (`overview`, `requirements`, `options`, `architecture`, `data-api`, `performance`, `risks`, `delivery`, `source`) and button IDs (`tab-overview` through `tab-source`).

