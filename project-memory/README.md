# Project Memory

Project Memory keeps durable project intent, decisions, sources, progress, evidence, and handoffs in a linked Markdown wiki at `.memory/`.

It is human-readable, Git-diffable, Obsidian-compatible, and portable between supported coding agents. The agent handles synthesis; the deterministic CLI handles safe writes, validation, locking, fingerprints, generated indexes, and append-only history.

## Requirements

- Node.js 20+
- Pi, Kilo Code, Google Antigravity, or the standalone CLI

## Quick start

```sh
# For a new project:
memory init

# For an existing mature codebase (deep codebase scan):
memory init --deep
memory status
memory validate
```

Then run `/memory-init` (or `/memory-ingest`) to conduct the interactive **Grill-Me style interview** (asks questions one-by-one with recommended defaults across 3–4 iterative rounds). Before later work, read `.memory/index.md`; after meaningful work, run `/memory-reflect` to update progress, evidence, history, and next actions.

## Install

### Pi

```sh
pi install ./project-memory
```

This installs the skill, Pi extension, `memory_ask` and `memory_apply` tools, and the master slash commands (`/memory-init`, `/memory-ingest`, `/memory-sync`, `/memory-reflect`).

### Kilo Code

Install the skill, runtime plugin, and master `/memory-*` commands into a Kilo project:

```sh
node /path/to/project-memory/scripts/install-kilo.mjs /path/to/project
```

From the Project Memory package directory, `npm run install:kilo -- /path/to/project` is the shorthand. The auto-discovered plugin injects the active index, goal, and progress before model calls and adds a one-shot maintenance reminder after repository edits. The installer uses only Node.js and fails rather than replacing an existing Project Memory skill, plugin, or command.

### Antigravity

Install the plugin, rule, workflows, and hooks into an Antigravity workspace:

```sh
node /path/to/project-memory/scripts/install-antigravity.mjs /path/to/project
```

From the Project Memory package directory, `npm run install:antigravity -- /path/to/project` is the shorthand. The installer preserves unrelated `.agents/hooks.json` entries, writes absolute shell-safe hook commands, and fails rather than replacing existing Project Memory files or hooks. The hooks inject active memory context, guard managed files, and add a maintenance reminder when repository state changes.

### CLI

Install or link the package, or run the bundled file directly:

```sh
npm link
memory --help
# Without linking:
node skills/memory/scripts/memory.mjs --help
```

## Commands

| Command | What it does | Typical use |
|---|---|---|
| `memory scan --json` | Finds repository files and possible feature scopes | Before initialization |
| `memory init [--scope path]` | Creates `.memory/` with deep codebase scan by default & treemap in `index.md` | Start project memory or onboard mid-project |
| `memory scaffold --scope path` | Adds an approved tracked scope | Add a feature area |
| `memory status [--scope path]` | Shows lifecycle, blockers, source state, and next action | Resume work |
| `memory record --source repo://path` | Registers an approved local source | Add requirements or evidence |
| `memory record --source https://...` | Fetches and fingerprints an approved public URL | Add an external source |
| `memory sync [--fetch-remote]` | Refreshes fingerprints, indexes, and `AGENTS.md` | After repository or source changes |
| `memory validate` | Checks paths, links, YAML, markers, scopes, and lifecycle | After memory updates or in CI |
| `memory apply --plan-file plan.json` | Applies validated, atomic structured changes | Agent or automation writes |
| `memory agents-sync` | Adds or repairs the managed `AGENTS.md` block | Restore agent instructions |

Use `--dry-run` to preview mutations. Use `memory sync --check` in CI; it exits `1` when synchronization or source integration is needed. The CLI never commits to Git.

## Agent workflows

Minimalistic command interface:

| Workflow | Usage | Description |
|---|---|---|
| **`/memory-init [scope]`** | `/memory-init`, `/memory-init --deep`, or `/memory-init <scope>` | Initialize `.memory/` bundle & conduct interactive **Grill-Me style interview** (one question at a time with recommended defaults across 3–4 rounds). |
| **`/memory-ingest [scope]`** | `/memory-ingest` or `/memory-ingest <scope>` | Deep codebase ingestion scan (packages, schemas, API routes, entry points) to populate `.memory/` as project brain. |
| **`/memory-sync [source]`** | `/memory-sync`, `/memory-sync <path\|url>`, or `--fetch-remote` | Refresh fingerprints, generated indexes, `AGENTS.md`, validate bundle, report status, or register/integrate an approved source. |
| **`/memory-reflect [scope]`** | `/memory-reflect`, `/memory-reflect <scope>`, or `complete` | Reflect on session work vs approved intent and update progress/evidence, or explicitly approve goal completion (`/memory-reflect complete`). |

### Grill-Me Style Interview Protocol
- **One Question at a Time**: Resolves design tree branches sequentially using interactive UI selection tools.
- **Recommended Defaults**: Inspects codebase context first and prefixes recommendations with `(Recommended)`.
- **Mandatory Topics**:
  1. *Feature Type*: New standalone feature vs add-on feature.
  2. *Directory Scope*: Dedicated new folder vs existing directory.
  3. *Design Patterns*: Architectural pattern selection (consults `software-design-patterns` skill).
- **Incremental Sync**: Saves confirmed answers into `.memory/goal.md` and syncs rules to `AGENTS.md`.

## Memory layout

```text
.memory/
├── index.md
├── goal.md
├── progress.md
├── log.md
├── sources/
└── <tracked scope>/
    ├── index.md
    ├── goal.md
    ├── progress.md
    └── log.md
```

### Root directory (`.memory/`)

- **`index.md`**
  - **What it does:** Serves as the progressive-disclosure map for the entire project memory. Contains root metadata (`memory_version`), top-level document links, and auto-generated index regions bounded by markers (`<!-- memory:generated:start children -->`).
  - **Why it exists:** Provides agents and humans a fast, lightweight entry point to discover tracked scopes, top-level documents, and sources without needing to load the entire wiki into LLM context at once.
- **`goal.md`**
  - **What it does:** Documents the current user-approved project intent, including core objectives, success metrics, architecture principles, structured requirements (`REQ-xxx`), and unresolved project interview questions (`P-Qxx`).
  - **Why it exists:** Acts as the single source of truth for overall project intent and scope boundary. Prevents goal drift, unauthorized feature creep, and unverified assumptions across sessions.
- **`progress.md`**
  - **What it does:** Tracks operational lifecycle state (`not_started`, `in_progress`, `blocked`, `complete`), acceptance criteria verification rows (`AC-xxx` mapped to `repo://` evidence paths), known blockers, and exactly *one next action*.
  - **Why it exists:** Captures real-time operational status and verified evidence. Allows any coding agent or developer to immediately resume work without guessing what was tested or what step to take next.
- **`log.md`**
  - **What it does:** Stores an append-only audit trail of project history ordered by date (newest first). Records key events such as decisions, reversals, requirement updates, source integrations, work items, and completion approvals.
  - **Why it exists:** Preserves historical rationale and context over time. Ensures prior decisions, rejected alternatives, and course corrections are never silently lost or rewritten.
- **`sources/`**
  - **What it does:** Directory storing individual source records (e.g., `sources/<id>.md`) for approved repository files (`repo://...`) or external URLs (`https://...`). Stores source fingerprints, content hashes, extracted claims, affected documents, and integration status (`new`, `integrated`, `changed`, `stale`, `unavailable`, `rejected`).
  - **Why it exists:** Isolates external and codebase reference data from agent instructions. Ensures evidence and external inputs are fingerprinted, traceable, and audited for changes or staleness without storing raw prompts.

### Tracked scopes (`.memory/<tracked scope>/`)

Tracked scopes represent distinct feature areas or subsystems (e.g., `.memory/auth/` or `.memory/api/v1/`). Subdirectories mirror the root layout structure:

- **`index.md`**
  - **What it does:** Navigation map for the specific tracked scope, linking child documents, sub-components, and nested sub-scopes.
  - **Why it exists:** Enables targeted reading and progressive navigation when working inside a focused subsystem.
- **`goal.md`**
  - **What it does:** Stores feature-specific approved intent, localized requirements (`REQ-xxx`), scoped acceptance criteria (`AC-xxx`), and open scope questions (`<scope>-Qxx`).
  - **Why it exists:** Keeps subsystem goals isolated and detailed without cluttering the global project goal document.
- **`progress.md`**
  - **What it does:** Maintains scope-specific operational lifecycle, feature verification table, local blockers, and the single next action for this feature area.
  - **Why it exists:** Allows independent feature tracking and evidence collection across distinct modules or team workstreams.
- **`log.md`**
  - **What it does:** Append-only history of decisions, updates, work items, and verification events specific to this feature scope.
  - **Why it exists:** Keeps feature-level decision logs clean, readable, and co-located with the scope code and goals.


## Safety

- Semantic and lifecycle changes require explicit approval.
- Headless Pi semantic writes fail closed; use an explicitly approved CLI plan instead.
- Completion requires existing `repo://` evidence files.
- External fetches reject credentials, redirects to private hosts, and local/private network addresses.
- Writes reject traversal and symlink escapes and use locking, atomic replacement, validation, and rollback.
- Source identity and fingerprint fields are immutable outside source registration and refresh.
- Secret-like files and content are excluded.
- Source content is untrusted data, never agent instruction.

## Development

```sh
npm install
npm run check
npm pack --dry-run
```

The TypeScript source is in `src/`; the built standalone CLI is `skills/memory/scripts/memory.mjs`. License: MIT.
