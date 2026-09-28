# Project Memory Format 0.3

A bundle is a UTF-8 Markdown wiki at `.memory/`. Every file has one job. Agents read the router, then one owning file per need.

## Files

| Path | `type` | Owns | Written by |
|---|---|---|---|
| `index.md` | (root frontmatter) | Routing table, generated decisions/recent/scopes | `memory sync` (generated regions) |
| `conventions.md` | `Conventions` | Commands, project-wide `MUST`/`NEVER` rules, pitfalls | approved plan |
| `log.md` | reserved | Current month of work log | `memory log --add`, `memory decide` |
| `log/YYYY-MM.md` | reserved | Archived months | `memory sync` |
| `decisions/index.md` | reserved | Generated decision table | `memory sync` |
| `decisions/D-NNN-slug.md` | `Decision` | One durable decision | `memory decide` |
| `architecture/index.md` | `ArchitectureIndex` | Layer map | `memory sync` |
| `architecture/<layer>/Flow.md` | `Flow` | Layer contract, anchors | approved plan / `sync` anchors |
| `sources/*.md` | `Source` | Fingerprint + integration status of a source | `memory record` |
| `<scope>/agents.md` | `Agents` | Purpose, Map, Rules, Pitfalls for a code subtree | approved plan |
| `<scope>/log.md` | reserved | Scope work log | `memory log --add --scope` |
| `archive/**` | any | Read-only history | `memory migrate` |

The following files are **removed in 0.3**: `goal.md`, `progress.md`, `tasks.md`. Outside `archive/` they are a validation error; `memory migrate` archives them.

## Budgets

- Root `index.md`: warning above 4,000 bytes, error above 6,000. Adapters inject only this file.
- Other documents: warning above 16,000 bytes; `log.md` warning above 24,000 bytes (run `memory sync`).
- Generated lines: max 240 bytes. The router shows at most 5 decisions, 3 log entries, and 5 scopes.

## Frontmatter

Non-reserved documents need YAML frontmatter with `type`. Unknown fields are preserved.

Common optional fields:

```yaml
code_refs: ["src/auth/**"]     # paths this doc governs (memory check)
governance: active             # active | hold | deprecated
governance_reason: "…"         # required context when hold
trust_tier: generated          # generated | verified | human_authored
provenance: observed           # observed | user-confirmed | inferred | unresolved
```

### Decision

```yaml
type: Decision
id: D-004                      # must match filename prefix
title: Use Postgres
description: Primary store is Postgres 16.
status: accepted               # accepted | superseded | deprecated
date: 2026-09-27
approval: "User chose option A"
supersedes: D-001              # optional
superseded_by: D-007           # set automatically when superseded
code_refs: ["src/db/**"]       # optional; makes it show in memory check
```

Body: `## Decision`, `## Context`, `## Rejected` (`- option: flaw`), `## Consequences`. Only `accepted` decisions govern paths or appear in the router.

### Agents (scope brief)

```yaml
type: Agents
title: Api scope
description: Purpose, map, rules, and pitfalls for code under apps/api.
scope: apps/api                # must equal its directory
code_refs: ["apps/api/**"]
governance: active
```

Body: `## Purpose` (one line), `## Map` (entry points, routes, schemas), `## Rules` (`MUST:` / `NEVER:` lines), `## Pitfalls`.

## Log entries

Newest first, grouped under `## YYYY-MM-DD` headings:

```md
### Fixed token refresh race — `evt-20260927101500-a1b2c3`
- **Type:** fix
- **Summary:** Mutex around refresh; parallel requests reused stale token.
- **Files:** src/auth/refresh.ts
```

The canonical types are `change`, `fix`, `finding`, `note`, `decision`, `correction`, `source`, `migration`, and `init`. The types `decision`, `correction`, `reversal`, `scope`, `preference`, and `contradiction-resolution` are semantic and need approval. Corrections are new entries; history is never rewritten.

## Links and IDs

Bundle-absolute links start with `/`. `repo://path` points into the repository. A broken link is a warning (an error with `--strict`). An orphan document (not reachable from `index.md` or `architecture/index.md`) is a warning. Logs, sources, and archives are exempt from orphan checks.

## Generated regions

```md
<!-- memory:generated:start decisions -->
…
<!-- memory:generated:end decisions -->
```

Only content inside the markers is replaced; prose outside them is preserved. Malformed or duplicate markers are errors.

## Conformance

**Errors:** unsupported `memory_version`; unsafe paths or symlinks; malformed YAML; missing `type`; legacy files outside the archive; a scope missing `agents.md`/`log.md`; a scope mismatch; an invalid decision id or status; malformed markers; a missing mandatory flow; a root index over budget.

**Warnings:** broken links, orphans, stale fingerprints, stale sources, documents over budget, missing `conventions.md` or `decisions/`.
