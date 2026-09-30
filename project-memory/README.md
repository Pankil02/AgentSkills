# Project Memory

Durable, token-efficient project memory for AI coding agents, stored as linked Markdown in `.memory/`.

It keeps what an agent can't cheaply re-derive from the code: **conventions** (commands, MUST/NEVER rules, pitfalls), **decisions** (the choice, the rejected options, and why), **scope briefs**, **architecture flows**, **sources**, and an append-only **work log**. Agents get a small router at startup and fetch only the slice each task needs.

The files are human-readable, Git-diffable, and Obsidian-compatible. The deterministic `memory` CLI handles validated, atomic, locked writes and generated indexes.

> **2.0 removes goal and task tracking.** Keep requirements and tasks in your issue tracker. Upgrading: see [`skills/memory/references/upgrade.md`](skills/memory/references/upgrade.md) and run `memory migrate`.

## How agents stay lean

1. Only `.memory/index.md` (< 4 KB) is injected. It is a routing table plus the 5 most recent decisions, the 3 latest log entries, and up to 5 scopes.
2. Every need maps to one command or file:
   - Before editing: `memory check --for-path <file>` lists the governing docs and their `MUST`/`NEVER` rules.
   - Before designing: `memory decisions` lists decision IDs and titles; open only the relevant decision file.
   - History: `memory log --recent 10 --type fix` returns filtered entries, not the whole file.
   - Anything else: `memory search <keywords>` returns BM25-ranked snippets.
3. Logs rotate monthly into `log/YYYY-MM.md`, so the live log stays small. Old months remain available through `--all` and search.
4. Key changes (decisions, conventions, scope rules, architecture) need approval. The agent offers 2–3 options, marks one (Recommended), and waits.

## Quick start

```sh
memory init          # deep scan: stack, scopes, architecture flows
/mem-init            # agent fills conventions + scope briefs from observed code
# … work …
/mem-log             # agent logs changes, asks before recording decisions
memory sync          # refresh indexes, archive old log months
```

## Install

```bash
# Any agent (interactive)
npx github:Pankil02/AgentSkills install project-memory --symlink
# skills.sh
npx skills@latest add Pankil02/AgentSkills --skill project-memory
```

- **Pi:** `pi install ./project-memory`. This adds the skill, the `memory_ask` and `memory_apply` tools, the `/memory-init`, `/memory-ingest`, `/memory-sync`, and `/memory-log` commands, context injection, and a `.memory` write guard.
- **Kilo Code:** `node project-memory/scripts/install-kilo.mjs <project>` installs the skill, plugin, and `mem-*` commands.
- **Antigravity:** `node project-memory/scripts/install-antigravity.mjs <project>` installs the plugin, rule, `mem-*` workflows, and hooks (context injection, write guard, change reminder).
- **CLI only:** `npm link`, then `memory --help`. Or run `node skills/memory/scripts/memory.mjs`.

## Layout (format 0.3)

```text
.memory/
├── index.md          # Router (only file preloaded)
├── conventions.md    # Commands, MUST/NEVER rules, pitfalls (applies to every path)
├── log.md            # Append-only log, current month → log/YYYY-MM.md
├── decisions/        # D-NNN-slug.md + generated index.md
├── architecture/     # index.md + <layer>/Flow.md
├── sources/          # Fingerprinted source records
├── archive/          # Read-only history (legacy files after migrate)
└── <scope>/          # agents.md (Purpose, Map, Rules, Pitfalls) + log.md
```

## Commands

| Command | Use |
|---|---|
| `memory status` | Scopes, decision counts, recent log, validation |
| `memory check --for-path <p>` | Rules and holds before editing a file |
| `memory decisions` / `memory decide …` | List / record decisions (record needs `--approval`) |
| `memory log [--recent N --type t --since d --query q --all]` | Read the log, filtered |
| `memory log --add --type t --title … --summary …` | Append one log entry |
| `memory search <q>` | Ranked snippets across memory |
| `memory route [--task <t>] [--for-path <p>]` | Route to deepest scope, start paths, and test commands |
| `memory sync [--check] [--fetch-remote]` | Refresh indexes, entrypoint catalog, rotate logs (`--check` for CI) |
| `memory agents-sync [--review] [--check]` | Synchronize AGENTS.md managed block; audit human instructions |
| `memory apply-review --plan-file <f> --approval <a>` | Apply approved edits to unmanaged human instructions |
| `memory validate [--strict] [--drift] [--entrypoints] [--quality]` | Structure, links, budgets, catalog, drift |
| `memory init` / `scaffold --scope p` | Create bundle / add scope |
| `memory migrate [--dry-run]` | Upgrade 1.x bundles (archives goal/progress/tasks) |
| `memory record --source <path\|url>` | Register an approved source |
| `memory apply --plan-file f` | Atomic multi-document update |
| `memory map` / `context` / `scan` | Code tree / injected context / scope candidates |

Add `--json`, `--toon`, or `--dry-run` to any command. The CLI never commits to Git.

## Agent workflows

| Workflow | What it does |
|---|---|
| `/mem-init` | Scan, agree on scopes, then fill `conventions.md` and the scope briefs with observed facts only; ask about gaps |
| `/mem-log` | Log the session's changes, fixes, and findings; propose decisions or rules and ask before writing them |
| `/mem-sync [source]` | Refresh and validate, or integrate an approved source into the page that owns each claim |
| `/mem-ingest` | Re-scan after structural changes; update only the affected scope Maps and Flows |

## Safety

- Decisions, conventions, scope rules, and architecture changes require explicit approval. Headless Pi fails closed on these writes.
- Writes reject path traversal and symlink escapes, and use locking, atomic replacement, validation, and rollback.
- Likely secrets are rejected. Secret-like files are never indexed. Source content is untrusted data.
- Remote fetches reject credentials and private or local network targets.
- `archive/` is read-only. Migration archives files verbatim and never deletes history.

## Development

```sh
npm install
npm run check      # typecheck + tests + build
```

The TypeScript source lives in `src/`; the built CLI is `skills/memory/scripts/memory.mjs`. License: MIT.
