import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  checkPathGovernance,
  initializeBundle,
  matchesGlobPattern,
  searchMemory,
  tokenize,
  validateBundle,
} from "../src/bundle.ts";
import { runCli } from "../src/cli.ts";

async function temporaryProject(): Promise<string> {
  return mkdtemp(join(tmpdir(), "project-memory-okf-"));
}

test("matchesGlobPattern matches exact paths, directory prefixes, and globstar patterns", () => {
  assert.equal(matchesGlobPattern("src/auth/**", "src/auth/jwt.ts"), true);
  assert.equal(matchesGlobPattern("src/auth/**", "src/auth/providers/oauth.ts"), true);
  assert.equal(matchesGlobPattern("src/auth/**", "src/user/profile.ts"), false);
  assert.equal(matchesGlobPattern("src/auth", "src/auth/jwt.ts"), true);
  assert.equal(matchesGlobPattern("*.ts", "index.ts"), true);
  assert.equal(matchesGlobPattern("*.ts", "src/index.ts"), false);
  assert.equal(matchesGlobPattern("**/*.ts", "src/domains/auth.ts"), true);
  assert.equal(matchesGlobPattern("src/auth/jwt.ts", "src/auth/jwt.ts"), true);
});

test("tokenize cleans text, removes stopwords and short tokens", () => {
  const tokens = tokenize("The quick brown fox jumps over the lazy dog and verifies OAuth2 tokens!");
  assert.ok(!tokens.includes("the"));
  assert.ok(!tokens.includes("and"));
  assert.ok(tokens.includes("quick"));
  assert.ok(tokens.includes("oauth2"));
  assert.ok(tokens.includes("tokens"));
});

test("searchMemory indexes documents and returns ranked BM25 search results with snippets", async (t) => {
  const root = await temporaryProject();
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  await initializeBundle(root, ["apps/api"], { dryRun: false, projectName: "test-app", deep: false });

  // Add custom content with distinctive keywords to domain flow
  const domainFlowPath = join(root, ".memory", "architecture", "domain", "Flow.md");
  await writeFile(
    domainFlowPath,
    `---
type: Flow
layer: domain
title: Domain Bounded Contexts and Invariants
description: Domain entity models, aggregate boundaries, and transaction invariants
status: active
provenance: human_authored
tags:
  - domain-driven-design
  - aggregates
  - invariants
repo_paths:
  - packages/core/domain/**
---

# Domain Layer Architecture

## Ubiquitous Language
- AccountAggregate: Encapsulates user balances and audit trail.
- MultiCurrencyWallet: Handles fiat and crypto asset segregation.

## Invariants
- MUST: Account balance must never be negative.
- Constraint: MultiCurrencyWallet requires idempotency key on transfers.
`,
    "utf8"
  );

  // Search for "AccountAggregate"
  const results = await searchMemory(root, "AccountAggregate");
  assert.ok(results.length > 0);
  assert.equal(results[0].title, "Domain Bounded Contexts and Invariants");
  assert.ok(results[0].score > 0);
  assert.ok(results[0].snippet.includes("AccountAggregate"));

  // Search for tags
  const tagResults = await searchMemory(root, "domain-driven-design");
  assert.ok(tagResults.length > 0);
  assert.equal(tagResults[0].matchedField, "tags");

  // Empty query returns empty array
  assert.deepEqual(await searchMemory(root, "    "), []);
  assert.deepEqual(await searchMemory(root, "the a an"), []);
});

test("checkPathGovernance discovers governing Flow and scope files, constraints, and active holds", async (t) => {
  const root = await temporaryProject();
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  await initializeBundle(root, ["apps/api"], { dryRun: false, projectName: "test-app", deep: false });

  // Configure security Flow with code_refs and governance hold
  const secFlowPath = join(root, ".memory", "architecture", "security", "Flow.md");
  await writeFile(
    secFlowPath,
    `---
type: Flow
layer: security
title: Security and Authentication Policy
description: OAuth2 token exchange and session encryption rules
status: active
provenance: human_authored
code_refs:
  - src/auth/**
  - packages/auth/tokens.ts
governance: hold
governance_reason: "Security audit in progress - frozen until compliance review"
---

# Security Architecture

## Constraints
- MUST NOT: Never expose refresh tokens in client cookies.
- MUST: All API endpoints require bearer token authentication.
- Constraint: Rate limit token rotation to 5 requests per minute.
`,
    "utf8"
  );

  // Check matching file under src/auth/**
  const authGov = await checkPathGovernance(root, "src/auth/jwt.ts");
  assert.equal(authGov.targetPath, "src/auth/jwt.ts");
  assert.equal(authGov.governance, "hold");
  assert.equal(authGov.holds.length, 1);
  assert.equal(authGov.holds[0].reason, "Security audit in progress - frozen until compliance review");
  assert.ok(authGov.governingDocuments.some((d) => d.type === "Flow"));
  assert.ok(authGov.constraints.some((c) => c.includes("Never expose refresh tokens")));

  // Check file under tracked scope apps/api
  const apiGov = await checkPathGovernance(root, "apps/api/controllers/user.ts");
  assert.equal(apiGov.governance, "active");
  assert.ok(apiGov.governingDocuments.some((d) => d.type === "Agents"));

  // Check untracked path
  const untrackedGov = await checkPathGovernance(root, "scripts/random.py");
  assert.equal(untrackedGov.governance, "untracked");
  assert.deepEqual(untrackedGov.governingDocuments.map((d) => d.path), [".memory/conventions.md"], "only global conventions apply");
});

test("validateBundle validates trust_tier, generated, verified, and code_refs metadata", async (t) => {
  const root = await temporaryProject();
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  await initializeBundle(root, [], { dryRun: false, projectName: "test-app", deep: false });

  const secFlowPath = join(root, ".memory", "architecture", "security", "Flow.md");

  // Write invalid trust_tier
  await writeFile(
    secFlowPath,
    `---
type: Flow
layer: security
title: Security
description: Security layer description long enough to pass check
status: active
provenance: human_authored
trust_tier: "untrusted_ai"
---
# Content
`,
    "utf8"
  );

  let validation = await validateBundle(root);
  assert.equal(validation.ok, false);
  assert.ok(validation.diagnostics.some((d) => d.code === "invalid-trust-tier"));

  // Write valid trust_tier with invalid generated metadata (missing at)
  await writeFile(
    secFlowPath,
    `---
type: Flow
layer: security
title: Security
description: Security layer description long enough to pass check
status: active
provenance: human_authored
trust_tier: "generated"
generated:
  by: "google-antigravity"
---
# Content
`,
    "utf8"
  );

  validation = await validateBundle(root);
  assert.equal(validation.ok, false);
  assert.ok(validation.diagnostics.some((d) => d.code === "invalid-generated-metadata"));

  // Write valid trust_tier with valid generated metadata
  await writeFile(
    secFlowPath,
    `---
type: Flow
layer: security
title: Security
description: Security layer description long enough to pass check
status: active
provenance: human_authored
trust_tier: "generated"
generated:
  by: "google-antigravity"
  at: "2026-09-15T16:00:00.000Z"
code_refs:
  - "src/security/**"
---
# Content
`,
    "utf8"
  );

  validation = await validateBundle(root);
  assert.ok(!validation.diagnostics.some((d) => d.code === "invalid-trust-tier"));
  assert.ok(!validation.diagnostics.some((d) => d.code === "invalid-generated-metadata"));
  assert.ok(!validation.diagnostics.some((d) => d.code === "invalid-code-refs"));
});

test("validateBundle detects orphaned documents and description drift", async (t) => {
  const root = await temporaryProject();
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  await initializeBundle(root, [], { dryRun: false, projectName: "test-app", deep: false });

  // Create an unreferenced document in .memory/
  const orphanPath = join(root, ".memory", "unlinked-notes.md");
  await writeFile(
    orphanPath,
    `---
type: Note
title: Orphaned Notes
description: TODO
---
# Content without any connection
`,
    "utf8"
  );

  // Normal validate emits orphan warning
  let validation = await validateBundle(root);
  assert.ok(validation.diagnostics.some((d) => d.code === "orphan-document" && d.severity === "warning"));

  // Strict validate elevates orphan to error
  validation = await validateBundle(root, { strict: true });
  assert.ok(validation.diagnostics.some((d) => d.code === "orphan-document" && d.severity === "error"));
  assert.equal(validation.ok, false);

  // Drift validation catches placeholder description
  validation = await validateBundle(root, { drift: true });
  assert.ok(validation.diagnostics.some((d) => d.code === "description-drift"));
});

test("CLI search and check commands return structured JSON and formatted output", async (t) => {
  const root = await temporaryProject();
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  await initializeBundle(root, ["apps/api"], { dryRun: false, projectName: "cli-test", deep: false });

  const outputs: string[] = [];
  const errors: string[] = [];
  const io = {
    stdout: (text: string) => outputs.push(text),
    stderr: (text: string) => errors.push(text),
  };

  // Test search command with --json
  outputs.length = 0;
  const searchExit = await runCli(["search", "architecture", "--root", root, "--json"], io);
  assert.equal(searchExit, 0);
  const searchJson = JSON.parse(outputs[0]);
  assert.ok(Array.isArray(searchJson));
  assert.ok(searchJson.length > 0);

  // Test check command with --for-path
  outputs.length = 0;
  const checkExit = await runCli(["check", "--for-path", "apps/api/index.ts", "--root", root, "--json"], io);
  assert.equal(checkExit, 0);
  const checkJson = JSON.parse(outputs[0]);
  assert.equal(checkJson.targetPath, "apps/api/index.ts");
  assert.equal(checkJson.governance, "active");

  // Test validate command with --drift
  outputs.length = 0;
  const valExit = await runCli(["validate", "--root", root, "--drift", "--json"], io);
  assert.equal(valExit, 0);
  const valJson = JSON.parse(outputs[0]);
  assert.equal(valJson.ok, true);
});
