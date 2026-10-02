# Data & API

## Token-free local contract {#quality-http-contract}

The local viewer is a read-only presentation endpoint; anyone allowed to call this machine's loopback can read it while it runs. Production application authentication remains mandatory where applicable.

- CLI: `view --plan PATH_TO_PROPOSAL [--port 0..65535] [--no-open]`; print `http://127.0.0.1:PORT/` with actual port and no token/query credentials.
- Preserve default fallback ports 4317–4326, explicit port single attempt, ephemeral port 0 and Ctrl+C/SIGTERM shutdown.
- Parse ports as whole decimal integers, not `parseInt` prefixes: reject `4317junk`, fractions, negatives, whitespace-only, out-of-range and non-finite values. Validate programmatic `startViewer` inputs too.
- `startViewer({planPath, port?, assetRoot?})` returns `{origin, version, port, close()}`; remove `token` and cryptographic bearer comparison from server. Keep SHA-256 document hashing in compiler.
- Remove browser token extraction/form/module state/Authorization headers and CLI fragment construction. No replacement cookie/storage/session/secret.
- Canonical authority is `127.0.0.1:PORT`; reject foreign Host, wrong ports and foreign Origin. Use only canonical authority in this implementation; `localhost` alias is deliberately not a second allowed origin.
- Fetch metadata: reject `cross-site` and `same-site` requests for API; allow `same-origin`, `none` and absent metadata for local CLI/tests. Treat metadata as browser defense, not caller authentication.
- Keep no CORS allow-origin response; CSP with self-only scripts/styles/connect, no frames/forms/objects, nosniff, no-referrer and API `no-store`.
- Apply common security headers to error responses too. GET only: other methods 405 with Allow GET. No upload, write-back, file browser or generic filesystem route.
- Static files are only shell and four listed assets. No path-based arbitrary reads; never serve the project root.

## HTTP response shapes {#quality-http-envelopes}

Keep schemaVersion `1`, existing valid responses and selected-tab/source routes. Navigation is additive derived viewer metadata, not new author input.

```text
GET /api/proposal
  {schemaVersion:1, valid:true, version, metadata, documents, tabs,
   diagnostics, navigation:{anchors, documents}}
GET /api/proposal?refresh=1
  valid: true -> publish fully checked version
  valid: false -> retain last valid version; include diagnostics
GET /api/tabs/<tab-id>?version=<hash>
  {schemaVersion:1, version, tab:{id,title,documents:[{id,blocks}]}}
GET /api/source/<doc-id>?version=<hash>
  exact UTF-8 Markdown source, text/plain
Error
  {schemaVersion:1,error:{code,message},diagnostics?}
```

- `navigation.anchors`: bounded map of heading ID to `{tabId,documentId}` derived from parsed headings. Include document ownership separately; do not add duplicate editable anchor fields.
- `navigation.documents`: document ID to owning tab, with manifest mapping to Source. Existing duplicate/unknown-anchor validation remains authoritative.
- Implement `buildNavigationIndex(compiled)` as a pure helper for viewer metadata, using existing parsed blocks; leave existing compile export layout intact unless an additive export field is explicitly documented/tested.
- Diagnostic shape: existing `{severity,code,documentId,line?,message}`; map documentId to safe manifest path for UI. File-load errors can omit line, but must identify the listed document/path when known; no invented line numbers or leaked absolute home paths.
- Refresh semantic invalidity returns 200 `valid:false` with last-good metadata/version and detailed diagnostics; top-level read/compile exceptions are translated into this recoverable refresh result, not unhandled promise rejections.
- Unknown route/tab/doc → 404; stale/unknown snapshot → 409; authority/metadata failure → 403; method failure → 405; unexpected server failure → sanitized 500.
- Browser validates response status and shape before setting version or accessing tabs; raw source errors never become displayed/cached source bytes.

## Snapshot lifecycle {#quality-snapshots}

```diagram-json
{
  "schemaVersion": 1,
  "type": "sequence",
  "id": "quality-refresh-flow",
  "title": "Refresh without losing the last good plan",
  "summary": "Invalid disk edits stay visible as diagnostics while previous content remains available.",
  "participants": [
    { "id": "reader", "label": "Browser" },
    { "id": "local", "label": "Local server" },
    { "id": "disk", "label": "File loader/compiler" }
  ],
  "messages": [
    { "id": "qr1", "from": "reader", "to": "local", "label": "GET refresh=1", "kind": "request" },
    { "id": "qr2", "from": "local", "to": "disk", "label": "Bounded read and validation", "kind": "request" },
    { "id": "qr3", "from": "disk", "to": "local", "label": "Valid snapshot or diagnostics", "kind": "response" },
    { "id": "qr4", "from": "local", "to": "reader", "label": "Publish or retain last-good", "kind": "response" }
  ]
}
```

- Keep at most current and previous snapshot; active refresh single-flight, unchanged hash does not create another version.
- Version covers exact source bytes as today, not derived navigation/UI state. Requests for retained previous version remain consistent; evicted versions receive 409.
- Publish only after whole-bundle validation; no mixed new/old metadata. On invalid input, maintain the existing content/cache and render persistent diagnostics.
- Avoid recursive stale recovery: synchronize metadata once and retry selected resource once; then show recoverable stale error.
- Store caches per version, clear obsolete client entries on version commit, keep fetched content bounded to listed docs/eight tabs. Avoid retaining multiple rendered DOM trees.

### Technical details {#quality-filesystem}

- Preserve 128 KiB/file, 1 MiB aggregate and 24 total docs including manifest; bounded tables/diagram limits; fatal UTF-8 and exact source fidelity.
- Replace raw prefix containment with `path.relative`/separator-aware containment. Same-root or true descendant checks only; a sibling directory sharing the root prefix is not contained.
- Reject symlinks/junctions in proposal file paths and listed section ancestry. Do not accidentally reject the installed skill's legitimate package symlink; proposal safety and installation layout are separate.
- Preserve manifest-listed `sections/NAME.md` grammar, no nested traversal/backslashes/null bytes. Do not enumerate arbitrary files or read `.env*`, `.git`, credentials or `node_modules`.
- Record file identity/size/mtime around each read, recheck loaded files before publication, and retry whole bundle at most once when a save races reading. Read via verified file descriptors where supported to reduce check/open races.
- Node >=18 cross-platform file-safety limits must be documented: this is protection against invalid/symlink proposal inputs and ordinary saves, not a sandbox against a malicious local user racing filesystem operations.
- Startup invalid bundle fails clearly before listening; invalid refresh stays last-good. CLI export remains atomic, separate and explicit; correct separator-aware forbidden-directory checks there as well.
- Do not broaden export/file read capability while fixing containment. No migration of existing user content; legacy v1 bundle bytes remain untouched.

## Auth-removal scope checklist {#quality-auth-removal}

Change only viewer capability contract: server crypto token imports/helper/generation/return/API gate; CLI target URL; browser token state/form/headers/hash logic; viewer docs and HTTP tests.

Do not remove compiler hash crypto, application authorization/API examples when actually justified, tenant isolation, token-bucket rate-limit guidance for production features, or authentication icons/aliases accepted by diagrams. “No token system” is not a ban on discussing production security or measuring instruction size.
