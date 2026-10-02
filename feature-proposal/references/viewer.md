# Local Viewer Reference & Operations

This document covers running, navigating, and troubleshooting the dependency-free local browser viewer.

---

## 1. Starting the Viewer

Launch the viewer pointing to any valid proposal manifest:

```bash
node <skill-path>/scripts/proposal.mjs view --plan docs/proposals/YYYY-MM-DD-<slug>/proposal.md
```

Options:
- `--port <number>`: Explicit port. Defaults to `4317` (scans up to 9 consecutive ports if occupied). Use `--port 0` for an OS-assigned ephemeral port.
- `--plan <path>`: Required relative or absolute path to `proposal.md`.
- `--no-open`: Start the server without automatically launching the system default browser.

When started, the terminal displays the plain loopback URL:
```text
🚀 Proposal viewer active on:
http://127.0.0.1:4317/
Press Ctrl+C to stop the server.
```

---

## 2. Security & Localhost Boundaries

The viewer uses a lightweight local trust model designed for developer ergonomics without compromising system security:

- **Loopback Binding Only**: The HTTP server binds exclusively to IPv4 `127.0.0.1`. It never listens on wildcard `0.0.0.0` or external network interfaces.
- **Local Presentation Boundary**: The viewer is a read-only local presentation tool. Access is available directly via plain `http://127.0.0.1:<port>/` without capability tokens or authentication dialogs. Local processes on the same machine can read the running viewer; never expose the port through external tunnels, and never embed secrets or production credentials in feature proposals.
- **Host & Origin Validation**: The server validates the HTTP `Host` header against `127.0.0.1:<port>`. It rejects requests with foreign `Origin` headers or cross-site fetch metadata (`Sec-Fetch-Site: cross-site`) with `403 Forbidden`.
- **Filesystem Confinement**: The server reads strictly the canonical `proposal.md` and listed `sections/*.md` files within the proposal folder. All requests attempting directory traversal (`..`), symlinks, junctions, null bytes, or paths accessing `.env*`, `.git`, or `node_modules` are rejected.
- **Read-Only / No Write-Back**: The server exposes only read-only `GET` endpoints. Any non-GET HTTP method returns `405 Method Not Allowed`.

---

## 3. Navigation & Tab Architecture

The viewer provides 9 standard tabs conforming to the WAI-ARIA tabstrip specification:

1. **Overview**: Executive outcome, recommendation card, readiness, and key assumptions.
2. **Requirements**: Actors, user stories, measurable criteria, non-goals, and UI design states.
3. **Options**: Shared-workload architectural alternatives, comparison matrix, and revisit triggers.
4. **Architecture**: Component boundaries, request flow, and native SVG graph pipeline.
5. **Data & API**: Stack-specific endpoint contracts, schema/indexes, query costs, and migrations.
6. **Performance**: Labelled workload budgets, critical path latency, and SVG sequence diagram.
7. **Risks**: Enterprise failure matrix, security controls, verification tests, and residual risks.
8. **Delivery**: File map, dependency-ordered atomic steps, rollout/rollback plan, and handoff prompt.
9. **Source**: Raw markdown source documents with file switching and copy-to-clipboard.

### Keyboard Navigation
- **Left / Right Arrows**: Move focus across the tabstrip buttons.
- **Home / End**: Jump focus to the first or last tab button.
- **Enter / Space**: Activate and display the focused tab panel.
- **Tab**: Step focus into the active panel content.

### Deep Linking & Multiple Tabs
- URLs with `#anchor` or `#tab` immediately activate the relevant tab, expand target `<details>` accordions if the heading is collapsed, and smoothly scroll into view.
- The plain URL contract supports hard browser reloads (Cmd+R / F5) and running in multiple concurrent browser tabs without re-authenticating.

---

## 4. Authoring & Refresh Workflow

1. Keep the viewer running in a terminal tab.
2. Edit any section in `docs/proposals/...` using your normal code editor.
3. Click the **Refresh** button (`🔄`) in the viewer header (or press `R`).
4. The server validates the entire proposal bundle in a single flight:
   - If **valid**: The new snapshot is published, cached tab views are updated, and the active view re-renders seamlessly.
   - If **invalid**: The previous valid view is preserved, and an actionable diagnostic banner displays the exact file, line number, and error message.

---

## 5. Troubleshooting

- **Port in Use**: If port 4317 is occupied, the server automatically scans up to 9 subsequent ports (4318–4326). If an explicit `--port` was specified, the process exits with code `1`.
- **409 Stale Version**: The active browser session was pinned to an older snapshot that has been superseded. Click **Refresh** to synchronize with the latest version.
- **Connection Refused**: The viewer process was stopped in the terminal. Re-run the `view` command to restart.

---

## 6. Design Theme: Prism Garden

The viewer UI implements the **Prism Garden** design system:
- **Palette**: Warm paper (`#F4F1FF` / `#1D1A24`), parchment card surfaces (`#FFF9F2` / `#292431`), ink text (`#282631` / `#EEE8F2`), rule boundaries (`#C9C2D0` / `#4A4252`), and botanical accents (burnt clay `#C15F3C`, terracotta `#D77757`, sage `#28766F`, leaf `#4F7658`, lake `#51679F`, marigold `#9B6A22`, plum `#7A5B7E`, blush `#B65368`).
- **Typography**: Dual-font pairing with modern system sans for prose and tabular monospace (`Courier Prime`, `Iosevka Etoile`, `Menlo`, `monospace`) with `font-feature-settings: "tnum" 1` for tables, metrics, IDs, code, and diagram labels.
- **Aesthetic Directives**: Clean, high-density executive review web application. No simulated terminal chrome (no fake macOS window traffic lights, no CLI `$ cat` or `>` prompts, no terminal titlebars).
