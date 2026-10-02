# feature-proposal

> Enterprise-grade, evidence-based feature planning skill with a lightweight, dependency-free local browser viewer.

---

## 🌟 What This Skill Does

When designing a feature, AI agents often jump straight to code or produce sprawling, unreadable documents that fail to consider real production constraints.

`feature-proposal` structures the planning process into:
1. **Intake & Understanding**: Sharp questions (≤3) to clarify actors, goals, scale, latency, and data invariants; unknowns tracked as labeled assumptions (`ASM-01`).
2. **Evidence-First Architecture**: Investigates existing code with exact `path:line` citations to recommend low-overhead, simple solutions over speculative complexity.
3. **Structured Proposal Bundle**: Outputs a concise manifest (`proposal.md`) and 8 focused sections (`sections/*.md`) under `docs/proposals/` following a quantitative system design rubric.
4. **Interactive Local Viewer**: A zero-dependency, token-free localhost-only browser viewer with 9 visual tabs (📋 Overview, 🎯 Requirements, ⚖️ Options, 🏛️ Architecture, 🗄️ Data & API, ⚡ Performance, 🛡️ Risks, 🚀 Delivery, 💻 Source) and native SVG diagrams with collapse/expand arrow indicators.

---

## 🚀 Quickstart & Commands

The skill provides three runtime commands:

```bash
# 1. Validate a proposal bundle
node <skill-path>/scripts/proposal.mjs check --plan docs/proposals/YYYY-MM-DD-<slug>/proposal.md

# Output machine-readable diagnostics
node <skill-path>/scripts/proposal.mjs check --plan docs/proposals/YYYY-MM-DD-<slug>/proposal.md --json

# 2. Compile to derived JSON AST (stdout)
node <skill-path>/scripts/proposal.mjs compile --plan docs/proposals/YYYY-MM-DD-<slug>/proposal.md

# Compile to a file atomically
node <skill-path>/scripts/proposal.mjs compile --plan docs/proposals/YYYY-MM-DD-<slug>/proposal.md --out /tmp/proposal.json

# 3. View the proposal in your browser
node <skill-path>/scripts/proposal.mjs view --plan docs/proposals/YYYY-MM-DD-<slug>/proposal.md
```

The `view` command starts a loopback HTTP server on `127.0.0.1` (default port 4317 or next available) and prints a direct loopback URL:
```text
http://127.0.0.1:4317/
```
Open this URL in any modern browser. Press `Ctrl+C` in your terminal to shut down the server.

---

## 📐 Architecture & Security Highlights

- **Authoritative Markdown**: Your Markdown files on disk are the single source of truth. JSON is derived purely on-the-fly.
- **Zero Runtime Dependencies**: No npm packages, bundlers, external CDNs, or frameworks. Runs natively on Node.js >=18.
- **Strict Security Boundaries & Token-Free Presentation**:
  - Binds strictly to `127.0.0.1` (no LAN/external network exposure).
  - Token-free localhost design for seamless multi-tab viewing and bookmarking without auth friction.
  - Strict Host authority (`127.0.0.1:<port>`) and Origin / fetch-metadata (`Sec-Fetch-Site`) checks prevent cross-site websocket/fetch hijacking.
  - Read-only GET routes only (`405 Method Not Allowed` on mutations); strict filesystem traversal boundaries rejecting symlinks, null bytes, and traversal paths.
  - Safe text-based DOM rendering; no `innerHTML` or dynamic script execution.
- **Native SVG Diagrams with System Design Icons**: Built-in, accessible graph and sequence diagrams rendered purely through zero-dependency vector SVG templates. Includes 20+ authentic system architecture icons (CDN, Database/SQL, Redis/Cache, Compute, Load Balancer, Gateway, Queue, Storage, Auth, etc.) with automatic keyword inference and collision-free orthogonal routing.
- **Manual Refresh**: Edit your Markdown files in your editor, then click **Refresh** in the browser to reload without continuous background polling. Single-flight coordination preserves last-good snapshot on error.

---

## 📦 Installation

Install across your preferred agent environment using the `AgentSkills` CLI:

```bash
# Universal (.agents/skills)
npx github:Pankil02/AgentSkills install feature-proposal

# Antigravity / Gemini
npx github:Pankil02/AgentSkills install feature-proposal --target antigravity

# Claude Code
npx github:Pankil02/AgentSkills install feature-proposal --target claude

# Cursor
npx github:Pankil02/AgentSkills install feature-proposal --target cursor
```

Or install with symlinks for local development:
```bash
npx github:Pankil02/AgentSkills install feature-proposal --symlink
```
