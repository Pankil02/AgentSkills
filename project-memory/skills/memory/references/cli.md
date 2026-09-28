# CLI JSON contracts for format 0.3

Run commands with `--json` for machine-readable output. JSON is written to stdout on success. Errors are written to stderr as `{"error":"message"}` with exit code 1. Usage errors use exit code 2. `validate` uses exit code 1 when the bundle is structurally invalid.

Unknown output fields may be added in compatible releases. Consumers must ignore fields they do not understand.

## Common change

```json
{
  "path": ".memory/index.md",
  "action": "create | update | skip",
  "beforeHash": "sha256:...",
  "afterHash": "sha256:..."
}
```

Hashes are omitted when not applicable.

## `scan`

```json
{
  "projectRoot": "/absolute/project",
  "git": true,
  "head": "commit-or-omitted",
  "files": [{ "path": "src/a.ts", "size": 123, "mtimeMs": 0, "extension": ".ts" }],
  "candidates": [{ "path": "src/feature", "fileCount": 2, "confidence": "high | medium | low", "reasons": ["..."] }],
  "fingerprint": "sha256:..."
}
```

Candidates are evidence, not approved semantic scopes.

## `init` and `scaffold`

Performs deep codebase scanning by default (scaffolding tech stack and generating a token-efficient executive capsule in `.memory/index.md`). Accepts optional `--scope <path>` flags and `--shallow` flag for skeleton initialization without deep codebase scanning.

```json
{
  "root": "/absolute/project",
  "bundle": "/absolute/project/.memory",
  "scopes": [".", "src/feature"],
  "changes": ["Common change objects"],
  "candidates": ["Scope candidate objects"]
}
```

## `map`

Generates the complete codebase treemap with architectural annotations on demand without inflating the startup context.

```json
{
  "projectRoot": "/absolute/project",
  "fingerprint": "sha256:...",
  "filesCount": 42,
  "treemap": "```\n.\n├── src/ # Source code root\n...\n```"
}
```

## `check`

Inspects code-to-memory path governance, active subsystem holds, and constraints for a target file. Agents use this to discover the single governing document to read before editing code.

```json
{
  "targetPath": "src/auth/token.ts",
  "governance": "active | hold | deprecated | untracked",
  "holds": [{ "path": ".memory/architecture/auth/Flow.md", "reason": "Optional hold reason" }],
  "governingDocuments": [
    {
      "path": ".memory/architecture/auth/Flow.md",
      "type": "Flow",
      "title": "Auth Flow",
      "governance": "active"
    }
  ],
  "constraints": ["MUST NOT log raw tokens"]
}
```

## `search`

In-memory BM25 lexical search across all `.memory/` documents. Returns ranked document snippets so agents can answer specific queries without loading entire files.

```json
[
  {
    "path": "/absolute/project/.memory/architecture/domain/Flow.md",
    "relPath": ".memory/architecture/domain/Flow.md",
    "title": "Domain Flow",
    "type": "Flow",
    "score": 4.12,
    "matchedField": "body",
    "snippet": "...business invariants require strict validation..."
  }
]
```

## `context`

Emits the exact token-optimized context injected into AI agents at session startup (< 6,000 bytes). Flags: `--scope <path>`, `--budget <bytes>`, `--toon`.

```json
{
  "context": "[PROJECT MEMORY] Router below. Load on demand only; …",
  "scope": ".",
  "budget": 6000
}
```

## `status`

```json
{
  "initialized": true,
  "root": "/absolute/project",
  "version": "0.3",
  "scopes": [".", "apps/api"],
  "decisions": { "accepted": 3, "superseded": 1, "deprecated": 0 },
  "recent": ["Log entry objects (max 5)"],
  "sourceCounts": { "integrated": 2, "changed": 1 },
  "validation": "Validation result"
}
```

## `log`

Read (default): `--recent N` (default 10), `--type <t>` (repeatable), `--since YYYY-MM-DD`, `--query <text>`, `--scope <path>`, `--all` (include `log/YYYY-MM.md` archives).

```json
[{ "scope": ".", "date": "2026-09-27", "type": "fix", "title": "Fixed race", "id": "evt-…", "body": "- **Summary:** …", "archived": false }]
```

Write: `--add --type <t> --title <text> [--summary <text>] [--files <path>…] [--scope <path>] [--approval <reason>]`. Semantic types (`decision`, `correction`, `reversal`, `scope`, `preference`, `contradiction-resolution`) require `--approval`. Returns one common change.

## `decisions`

Lists `accepted` decisions; `--all` or `--type superseded` for others.

```json
[{ "id": "D-001", "title": "Use Zod", "status": "accepted", "date": "2026-09-27", "path": ".memory/decisions/D-001-use-zod.md", "description": "…" }]
```

## `decide`

Required: `--title`, `--decision`, `--approval`. Optional: `--context`, `--rejected "<option>: <flaw>"` (repeatable), `--consequences`, `--code-ref <glob>` (repeatable), `--supersedes D-NNN`, `--scope`.

```json
{ "decision": { "id": "D-002", "title": "…", "status": "accepted", "path": ".memory/decisions/D-002-….md" }, "changes": ["Common change objects"] }
```

Superseding marks the old decision `superseded` with `superseded_by`. A decision log entry is appended and indexes are refreshed.

## `record`

```json
{
  "sources": [{
    "path": ".memory/sources/source-abcd1234.md",
    "resource": "repo://docs/source.md",
    "hash": "sha256:...",
    "status": "new | integrated | changed | stale | unavailable | rejected",
    "changed": true,
    "needsIntegration": true,
    "affectedDocuments": ["/topic.md"],
    "contentPreview": "optional bounded text"
  }],
  "history": "Optional common change"
}
```

`changed` means the observed fingerprint changed during this operation. `needsIntegration` remains true across later sync runs while a source is `new`, `changed`, or `stale`, so interrupted integration resumes correctly. A preview is bounded and is not durable source storage. Source registration does not imply integration.

## `sync`

```json
{
  "changedPaths": ["src/a.ts"],
  "affectedScopes": { "src/feature": ["src/a.ts"] },
  "sources": ["Source result objects"],
  "changes": ["Common change objects"],
  "validation": "Validation result"
}
```

`sync` also moves log day-sections older than the current month into `log/YYYY-MM.md` (appears in `changes`). When `--fetch-remote` is absent, URL sources retain their current fingerprint and are not fetched.

## `validate`

```json
{
  "ok": true,
  "diagnostics": [{
    "severity": "error | warning",
    "code": "stable-machine-code",
    "message": "human-readable explanation",
    "path": ".memory/optional-path.md"
  }],
  "counts": { "documents": 4, "scopes": 1, "sources": 0, "errors": 0, "warnings": 0 }
}
```

## `agents-sync`

Returns one common change object.

## `apply`

Input is passed through `--plan <json>` or `--plan-file <path>`:

```json
{
  "approved": false,
  "approvalReason": "Required for semantic operations",
  "operations": [
    {
      "action": "write_document | update_frontmatter | replace_generated | append_log | sync_indexes",
      "path": "bundle-relative path when required",
      "content": "when required",
      "region": "when required",
      "values": {},
      "scope": ".",
      "event": {},
      "semantic": false,
      "expectedHash": "optional sha256:..."
    }
  ]
}
```

`write_document` and `update_frontmatter` are semantic (need `approved: true` + `approvalReason`) except for source-record frontmatter updates. `append_log` is semantic only for semantic event types. `replace_generated` and `sync_indexes` are never semantic. Plans cannot create source records, alter their identity fields, write `index.md`/`log.md` directly, recreate `goal.md`/`progress.md`/`tasks.md`, or modify `archive/`. Every plan is validated and rolled back atomically on failure.

Output:

```json
{
  "changes": ["Common change objects"],
  "validation": "Validation result; omitted for dry-run"
}
```

## `migrate`

Upgrades 0.1/0.2 bundles to 0.3. Idempotent, rolls back on error.

```json
{
  "root": "/absolute/project",
  "version": "0.3",
  "archived": [".memory/goal.md", ".memory/tasks.md"],
  "changes": ["Common change objects"],
  "validation": "Validation result object"
}
```

Dry-run commands have the same shape but do not mutate files. Planned changes still include before/after hashes where available.
