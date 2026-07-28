# CLI JSON contracts for format 0.1

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

Accepts optional `--scope <path>` flags and `--deep` flag for comprehensive deep codebase scanning during init.

```json
{
  "root": "/absolute/project",
  "bundle": "/absolute/project/.memory",
  "scopes": [".", "src/feature"],
  "changes": ["Common change objects"],
  "candidates": ["Scope candidate objects"]
}
```

## `status`

```json
{
  "initialized": true,
  "root": "/absolute/project",
  "activeScope": ".",
  "goalStatus": "active",
  "nextAction": "Markdown section text",
  "blockers": "Markdown section text",
  "sourceCounts": { "integrated": 2, "changed": 1 },
  "validation": "Validation result"
}
```

Optional fields are omitted when the bundle or scope does not provide them.

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

When `--fetch-remote` is absent, URL sources retain their current fingerprint and are not fetched.

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

Goal writes and non-operational document writes are classified as semantic by the core even when `semantic` is omitted. Progress updates, valid source-record updates, and generated index updates may remain objective. Plans cannot create source records or alter their identity and fingerprint fields. Completion uses `update_frontmatter` and requires an existing repository evidence file with `repo://path`.

Output:

```json
{
  "changes": ["Common change objects"],
  "validation": "Validation result; omitted for dry-run"
}
```

Dry-run commands have the same shape but do not mutate files. Planned changes still include before/after hashes where available.
