# Project Memory Format 0.2

## Bundle

A bundle is a UTF-8 Markdown wiki rooted at `.memory/`.

### Root Structure (`.memory/`)
The root contains:
- `index.md` — progressive-disclosure executive router;
- `goal.md` — current approved project intent (strictly root only);
- `progress.md` — current project state, evidence, and next action (strictly root only);
- `tasks.md` — bounded ADHD task breakdown (strictly root only);
- `log.md` — append-only history, newest date first;
- `architecture/` — dynamic architecture lenses and Flow contracts:
  - `index.md` — complete architecture map & flow routing table;
  - `system-design/Flow.md` — mandatory top-level system entry point and high-level routing;
  - `domain/Flow.md` — mandatory DDD model, bounded contexts, ubiquitous language, and business invariants;
  - `security/Flow.md` — mandatory trust boundaries, permissions, and security policies;
  - Conditional layers when detected: `frontend/Flow.md`, `gateway-edge/Flow.md`, `auth/Flow.md`, `backend/Flow.md`, `database/Flow.md`, `cloud-observability/Flow.md`;
- `sources/` — stores one source record per approved raw source (`index.md` + source records).

### Tracked Subfolder Scopes (`.memory/<scope>/`)
Each tracked scope subfolder contains **ONLY and ONLY**:
- `agents.md` — unified document combining:
  1. Scope architecture summary & entry points
  2. Goal intent & requirements (with stable `AC-NNN` acceptance criteria)
  3. Current state, drift/blockers, and acceptance evidence table
  4. ADHD task breakdown (single next action, active tasks ≤ 5, backlog)
- `log.md` — append-only history for the scope.

Subfolders do NOT contain `goal.md`, `progress.md`, `tasks.md`, or `index.md`. Intermediate grouping directories do not contain redundant files.

## Token Efficiency & Hard Budgets

Every file, line, and piece of text in `.memory/` MUST be ultra-short, compact, concise, and token-efficient.
- **Root `index.md`**: hard budget of 6,000 UTF-8 bytes (warning above 4,000 bytes).
- **Scope `index.md`**: hard budget of 8,000 UTF-8 bytes.
- **Active tasks**: maximum 5 items in `tasks.md`.
- **Auto-injected context**: only `.memory/index.md` is automatically loaded (≤ 6,000 bytes).
- **Generated lines**: maximum 240 UTF-8 bytes per generated line.
- Avoid multi-paragraph descriptions, filler, repetitive headers, and template text.
- Short and compact files turn memory overhead from O(repository size) into O(1) startup + O(active scope).

## Documents

Every non-reserved Markdown document starts with YAML frontmatter. `type` is required. Managed documents also use `title`, `description`, `timestamp`, `scope`, and type-specific fields. Unknown fields and unknown types must be preserved.

```yaml
---
type: Flow
title: System design flow
description: Top-level system architecture and component routing.
layer: system-design
scope: .
status: observed
repo_paths: [package.json, tsconfig.json]
upstream: []
downstream: [frontend, backend]
provenance: observed
repository_fingerprint: sha256:...
timestamp: 2026-05-28T14:30:00Z
---
```

The root `index.md` is an executive memory capsule and the only index with frontmatter (`memory_version: "0.2"`, `architecture_mode: "ddd"`, `architecture_index: "/architecture/"`, `system_flow: "/architecture/system-design/Flow.md"`). It contains `## Project` (1-line facts), `## Now` (active objective, scope, state, next action, blocker), `## Architecture` (direct links to mandatory flows & index), `## Find` (quick lookup table), and `## Active scopes` (bounded list of up to 5 scopes). Codebase treemaps are generated on demand via `memory map` rather than inflated in the root index.

## Identity, requirement IDs, and links

A document ID is its bundle-relative path without `.md`. Optional `uid` values remain stable if a document moves. Requirements use stable `REQ-001`, `REQ-002`, ... IDs within a goal. Acceptance criteria use `AC-001`, `AC-002`, ... and map to evidence rows in `progress.md`. Project interview questions use `P-Q01`, `P-Q02`, ...; feature questions use a stable scope prefix followed by `-Q01`, `-Q02`, .... IDs are never silently reused after a reversal.

Bundle-absolute links begin with `/`; relative links use normal Markdown paths. `repo://path` identifies a repository resource. HTTP(S) links identify external sources. Broken document links are warnings, not structural errors.

## Provenance

Claims are classified as:

- `observed` — supported directly by a source or command;
- `user-confirmed` — explicitly approved by the user;
- `inferred` — an agent interpretation awaiting confirmation;
- `unresolved` — unknown, skipped, or contradictory.

Never promote `inferred` to `user-confirmed` without explicit approval.

## Indexes

Indexes group child directories and documents with standard Markdown links and one-line descriptions. Generated content is bounded by named markers:

```md
<!-- memory:generated:start active -->
...
<!-- memory:generated:end active -->

<!-- memory:generated:start scopes -->
...
<!-- memory:generated:end scopes -->
```

Only valid generated regions may be replaced. Preserve all prose outside them. Root `index.md` caps visible scopes to 5 entries. Full repository layouts are disclosed progressively via `memory map`.

## Logs

Logs use ISO `YYYY-MM-DD` headings, newest first. Entries may be Observation, Question, Confirmation, Creation, Update, Decision, Reversal, Work, Verification, Blocker, Deprecation, or Completion. Corrections are new entries; prior history is not rewritten. Never record secret values or full raw prompts.

## Source records

A source document has `type: Source`, canonical `resource`, current `source_hash`, `previous_hashes`, `registered_at`, `checked_at`, optional `integrated_at`, `affected_documents`, and `integration_status`. Its body summarizes the source, extracted claims, affected documents, contradictions, and citations. Source status is one of `new`, `integrated`, `changed`, `stale`, `unavailable`, or `rejected`. Fingerprint changes preserve the prior hash and append history rather than silently replacing source history.

## Conformance

Errors:

- missing/unsupported root `memory_version`;
- unsafe paths or symlink escapes;
- malformed YAML in a managed document;
- missing `type` in a non-reserved document;
- incomplete tracked scope;
- malformed generated markers;
- invalid managed lifecycle state.

Warnings:

- broken links;
- stale source fingerprints;
- unknown types/fields;
- unresolved questions;
- absent optional documents.

Consumers read best-effort when warnings exist. Producers block unsafe mutation when errors exist.
