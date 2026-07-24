# Project Memory Format 0.1

## Bundle

A bundle is a UTF-8 Markdown wiki rooted at `.memory/`. The root and every tracked scope contain:

- `index.md` — progressive-disclosure map;
- `goal.md` — current approved intent;
- `progress.md` — current state, evidence, and one next action;
- `log.md` — append-only history, newest date first.

Intermediate grouping directories require only `index.md`. Additional documents are created when useful. `.memory/sources/` stores one source record per approved raw source.

## Token Efficiency

Every file, line, and piece of text in `.memory/` MUST be ultra-short, compact, concise, and token-efficient.
- Avoid multi-paragraph descriptions, filler, repetitive headers, and template text.
- Use dense, telegraphic bullet points and minimal table formatting.
- When mutating, updating, appending, or deleting content, strictly retain only necessary semantic information.
- Short and compact files save context tokens and keep LLM context pristine.

## Documents

Every non-reserved Markdown document starts with YAML frontmatter. `type` is required. Managed documents also use `title`, `description`, `timestamp`, `scope`, and type-specific fields. Unknown fields and unknown types must be preserved.

```yaml
---
type: Architecture
title: Event architecture
description: Event routing and persistence boundaries.
resource: repo://apps/api/src/domains/events
tags: [events, api]
timestamp: 2026-05-28T14:30:00Z
provenance: observed
---
```

The root `index.md` is the only index allowed to have frontmatter and declares `memory_version: "0.1"`.

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
<!-- memory:generated:start children -->
...
<!-- memory:generated:end children -->
```

Only valid generated regions may be replaced. Preserve all prose outside them.

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
