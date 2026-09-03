import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  applyMemoryPlan,
  checkCompletionReadiness,
  generateMemoryMap,
  initializeBundle,
  migrateBundle,
  parseMarkdown,
  readUnmanagedAgentsContent,
  refreshRegisteredSources,
  registerSource,
  registerTextSource,
  replaceGeneratedRegion,
  syncAgentsFile,
  syncIndexes,
  updateMarkdownFrontmatter,
  validateBundle,
  withBundleLock,
  type MemoryPlan,
} from "../src/bundle.ts";
import { assertSafeRelativePath, scanRepository } from "../src/repository.ts";

const fixtureRoot = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures", "knotspot");

async function temporaryProject(fixture = false): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "project-memory-test-"));
  if (fixture) await cp(fixtureRoot, root, { recursive: true });
  return root;
}

async function readIfExists(path: string): Promise<string | undefined> {
  return readFile(path, "utf8").catch(() => undefined);
}

async function markdownSnapshot(root: string): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  async function walk(current: string): Promise<void> {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && (entry.name.endsWith(".md") || entry.name === "AGENTS.md")) {
        result.set(relative(root, path), await readFile(path, "utf8"));
      }
    }
  }
  await walk(root);
  return result;
}

test("frontmatter updates preserve unknown fields and body", () => {
  const original = `---\ntype: Custom\ntitle: Existing\nunknown_key: keep-me # keep-comment\nnested:\n  value: 3\n---\n# Body\n\nManual text.\n`;
  const updated = updateMarkdownFrontmatter(original, { title: "Changed", timestamp: "2026-01-01T00:00:00Z" });
  const parsed = parseMarkdown(updated);
  assert.equal(parsed.data.title, "Changed");
  assert.equal(parsed.data.unknown_key, "keep-me");
  assert.deepEqual(parsed.data.nested, { value: 3 });
  assert.match(updated, /# keep-comment/);
  assert.match(updated, /Manual text\./);
});

test("unsafe YAML tags and aliases are rejected", () => {
  assert(parseMarkdown("---\nx: !!js/function function(){}\n---\n").errors.length > 0);
  assert(parseMarkdown("---\nx: !custom value\n---\n").errors.length > 0);
  assert(parseMarkdown("---\nx: &value [1]\ny: *value\n---\n").errors.length > 0);
});

test("path validation rejects traversal and absolute paths", () => {
  assert.equal(assertSafeRelativePath("src/domain"), "src/domain");
  assert.equal(assertSafeRelativePath("."), ".");
  assert.throws(() => assertSafeRelativePath("../outside"), /Unsafe/);
  assert.throws(() => assertSafeRelativePath("%2e%2e/outside"), /Unsafe/);
  assert.throws(() => assertSafeRelativePath("%252e%252e/outside"), /Unsafe/);
  assert.throws(() => assertSafeRelativePath("a//b"), /Unsafe/);
  assert.throws(() => assertSafeRelativePath("/absolute"), /Unsafe/);
});

test("initialization creates tracked scopes with agents.md and log.md only and is byte-stable", async (t) => {
  const root = await temporaryProject(true);
  t.after(() => rm(root, { recursive: true, force: true }));
  const scopes = ["apps/api/src/domains/user", "apps/api/src/events", "apps/web/app/dashboard"];
  const first = await initializeBundle(root, scopes, { now: new Date("2026-01-01T00:00:00Z") });
  assert.deepEqual(first.scopes, [".", ...scopes].sort((a, b) => a === "." ? -1 : b === "." ? 1 : a.localeCompare(b)));

  // Root has all root core files
  for (const file of ["index.md", "goal.md", "progress.md", "tasks.md", "log.md"]) {
    assert.equal(typeof await readFile(join(root, ".memory", file), "utf8"), "string");
  }

  // Each subfolder has ONLY agents.md and log.md
  for (const scope of scopes) {
    assert.equal(typeof await readFile(join(root, ".memory", scope, "agents.md"), "utf8"), "string");
    assert.equal(typeof await readFile(join(root, ".memory", scope, "log.md"), "utf8"), "string");
    for (const forbidden of ["goal.md", "progress.md", "tasks.md", "index.md"]) {
      assert.equal(await readIfExists(join(root, ".memory", scope, forbidden)), undefined);
    }
  }

  // Intermediate prefixes do NOT have index.md
  assert.equal(await readIfExists(join(root, ".memory", "apps", "api", "src", "domains", "index.md")), undefined);

  const validation = await validateBundle(root);
  assert.equal(validation.ok, true, JSON.stringify(validation.diagnostics));

  const before = await markdownSnapshot(root);
  await initializeBundle(root, scopes, { now: new Date("2030-01-01T00:00:00Z") });
  const after = await markdownSnapshot(root);
  assert.deepEqual(after, before);
});

test("repository sync generates source, test, and fingerprint regions", async (t) => {
  const root = await temporaryProject(true);
  t.after(() => rm(root, { recursive: true, force: true }));
  const scope = "apps/api/src/domains/user";
  await initializeBundle(root, [scope]);
  const scan = await scanRepository(root);
  await syncIndexes(root, scan);
  const agents = await readFile(join(root, ".memory", scope, "agents.md"), "utf8");
  assert.match(agents, /memory:source-fingerprint sha256:/);
  const rootIndex = parseMarkdown(await readFile(join(root, ".memory", "index.md"), "utf8"));
  assert.equal(rootIndex.data.repository_fingerprint, scan.fingerprint);
});

test("source records preserve prior fingerprints and source history", async (t) => {
  const root = await temporaryProject(true);
  t.after(() => rm(root, { recursive: true, force: true }));
  await initializeBundle(root);
  const first = await registerSource(root, "repo://docs/requirements.md");
  const sourcePath = join(root, first.path);
  const initial = parseMarkdown(await readFile(sourcePath, "utf8"));
  assert.equal(initial.data.integration_status, "new");
  assert.deepEqual(initial.data.affected_documents, []);
  const firstHash = initial.data.source_hash;

  await writeFile(join(root, "docs", "requirements.md"), "# Requirements\n\nAudit trails and export are required.\n");
  const second = await registerSource(root, "repo://docs/requirements.md");
  assert.equal(second.path, first.path);
  assert.equal(second.status, "changed");
  const changed = parseMarkdown(await readFile(sourcePath, "utf8"));
  assert.equal(changed.data.integration_status, "changed");
  assert.notEqual(changed.data.source_hash, firstHash);
  assert.equal((changed.data.previous_hashes as Array<{ hash: string }>)[0].hash, firstHash);
  const log = await readFile(join(root, ".memory", "log.md"), "utf8");
  assert.match(log, /Source registered/);
  assert.match(log, /Source fingerprint changed/);
  const pending = await refreshRegisteredSources(root);
  assert.equal(pending[0].changed, false);
  assert.equal(pending[0].needsIntegration, true, "changed sources must remain pending until integrated");
});

test("approved conversation and brief inputs are fingerprinted without storing raw text", async (t) => {
  const root = await temporaryProject();
  t.after(() => rm(root, { recursive: true, force: true }));
  await initializeBundle(root);
  const raw = "The user explicitly requires export and forbids silent deletion.";
  const record = await registerTextSource(root, "initial interview", raw, "conversation");
  assert.match(record.resource, /^conversation:\/\//);
  const stored = await readFile(join(root, record.path), "utf8");
  assert.doesNotMatch(stored, /forbids silent deletion/);
  const refreshed = await refreshRegisteredSources(root);
  assert.equal(refreshed[0].changed, false);
  assert.equal(refreshed[0].status, "new");
});

test("removed sources become unavailable once without repeated mutation", async (t) => {
  const root = await temporaryProject(true);
  t.after(() => rm(root, { recursive: true, force: true }));
  await initializeBundle(root);
  const source = await registerSource(root, "repo://docs/requirements.md");
  await rm(join(root, "docs", "requirements.md"));
  const first = await refreshRegisteredSources(root);
  assert.equal(first[0].status, "unavailable");
  assert.equal(first[0].changed, true);
  const before = await readFile(join(root, source.path), "utf8");
  const second = await refreshRegisteredSources(root);
  const after = await readFile(join(root, source.path), "utf8");
  assert.equal(second[0].changed, false);
  assert.equal(after, before);
});

test("newer format versions are readable as diagnostics but blocked from mutation", async (t) => {
  const root = await temporaryProject();
  t.after(() => rm(root, { recursive: true, force: true }));
  await initializeBundle(root);
  const indexPath = join(root, ".memory", "index.md");
  const newer = updateMarkdownFrontmatter(await readFile(indexPath, "utf8"), { memory_version: "0.3" });
  await writeFile(indexPath, newer);
  const validation = await validateBundle(root);
  assert.equal(validation.ok, false);
  assert(validation.diagnostics.some((item) => item.code === "version"));
  await assert.rejects(() => syncIndexes(root), /Unsupported writable memory_version/);
  assert.equal(await readFile(indexPath, "utf8"), newer);
});

test("partial bundles rebuild missing indexes without changing valid documents", async (t) => {
  const root = await temporaryProject();
  t.after(() => rm(root, { recursive: true, force: true }));
  await initializeBundle(root, ["src/feature"]);
  const customPath = join(root, ".memory", "src", "feature", "architecture.md");
  const custom = "---\ntype: Architecture\ntitle: Architecture\ndescription: Preserved document.\ntimestamp: 2026-01-01T00:00:00Z\nunknown: keep\n---\n# Architecture\n\nManual truth.\n";
  await writeFile(customPath, custom);
  await rm(join(root, ".memory", "index.md"), { force: true });
  await rm(join(root, ".memory", "src", "index.md"), { force: true });
  await syncIndexes(root);
  assert.equal(await readFile(customPath, "utf8"), custom);
  assert.match(await readFile(join(root, ".memory", "index.md"), "utf8"), /memory_version: "0.2"/);
  assert.equal((await validateBundle(root)).ok, true);
});

test("generated replacement preserves manual content and rejects malformed markers", () => {
  const content = `# Index\n\nManual before.\n\n<!-- memory:generated:start docs -->\nold\n<!-- memory:generated:end docs -->\n\nManual after.\n`;
  const updated = replaceGeneratedRegion(content, "docs", "new");
  assert.match(updated, /Manual before\./);
  assert.match(updated, /Manual after\./);
  assert.doesNotMatch(updated, /\nold\n/);
  assert.match(updated, /\nnew\n/);
  assert.throws(() => replaceGeneratedRegion(`${content}\n<!-- memory:generated:start docs -->`, "docs", "x"), /exactly one/);
  const nested = "<!-- memory:generated:start a -->\n<!-- memory:generated:start b -->\n<!-- memory:generated:end b -->\n<!-- memory:generated:end a -->";
  assert.throws(() => replaceGeneratedRegion(nested, "a", "x"), /overlap or nest/);
});

test("completion readiness requires stable criteria and linked verified evidence", async (t) => {
  const root = await temporaryProject();
  t.after(() => rm(root, { recursive: true, force: true }));
  await initializeBundle(root);
  const goalPath = join(root, ".memory", "goal.md");
  const progressPath = join(root, ".memory", "progress.md");
  let goal = await readFile(goalPath, "utf8");
  goal = goal.replace("Use stable IDs in the `AC-NNN` form. Each criterion must be independently verifiable.", "- AC-001: Export succeeds.\n- AC-002: Deletion is audited.");
  await writeFile(goalPath, goal);
  let readiness = await checkCompletionReadiness(root);
  assert.equal(readiness.ready, false);
  assert(readiness.missing.some((item) => item.includes("AC-001")));

  await mkdir(join(root, "artifacts"));
  await writeFile(join(root, "artifacts", "export.txt"), "passed\n");
  await writeFile(join(root, "artifacts", "audit.txt"), "passed\n");
  let progress = await readFile(progressPath, "utf8");
  progress = progress.replace("|---|---|---|", "|---|---|---|\n| AC-001 | verified | [test output](repo://artifacts/export.txt#L1) |\n| AC-002 | passed | repo://artifacts/audit.txt?run=latest | ");
  await writeFile(progressPath, progress);
  readiness = await checkCompletionReadiness(root);
  assert.equal(readiness.ready, true, readiness.missing.join("; "));
  assert.deepEqual(readiness.verified, ["AC-001", "AC-002"]);
});

test("semantic plans require approval and enforce lifecycle transitions", async (t) => {
  const root = await temporaryProject();
  t.after(() => rm(root, { recursive: true, force: true }));
  await initializeBundle(root);

  const unapproved: MemoryPlan = { operations: [{ action: "update_frontmatter", path: "goal.md", values: { status: "interviewing" } }] };
  await assert.rejects(() => applyMemoryPlan(root, unapproved), /explicit user approval/);
  await assert.rejects(() => applyMemoryPlan(root, {
    operations: [{ action: "write_document", path: "architecture.md", content: "---\ntype: Architecture\ntitle: Architecture\n---\n# Architecture\n\nNew project meaning.\n" }],
  }), /explicit user approval/);
  await assert.rejects(() => applyMemoryPlan(root, {
    operations: [{ action: "unsupported" } as never],
  }), /Unsupported memory operation/);
  await assert.rejects(() => applyMemoryPlan(root, {
    approved: true,
    approvalReason: "Attempted forged source",
    operations: [{ action: "write_document", path: "sources/forged.md", content: "---\ntype: Source\nresource: repo://secret\nsource_hash: sha256:fake\n---\n# Forged\n" }],
  }), /Create source records/);

  const activeProgress = (await readFile(join(root, ".memory", "progress.md"), "utf8") )
    .replace("**Action:** Complete the interview.", "**Action:** Implement the approved export path.")
    .replace("**Requirement:** Unresolved.", "**Requirement:** AC-001.")
    .replace("**Likely files:** Unknown.", "**Likely files:** `src/export.ts`.")
    .replace("**Verification:** User approval.", "**Verification:** `npm test -- export`.")
    .replace("**Approval:** pending", "**Approval:** approved by user");
  const activate: MemoryPlan = {
    approved: true,
    approvalReason: "User approved the goal and activation",
    operations: [
      { action: "update_frontmatter", path: "goal.md", values: { status: "interviewing" } },
      { action: "update_frontmatter", path: "goal.md", values: { status: "awaiting-approval" } },
      { action: "update_frontmatter", path: "goal.md", values: { status: "ready", provenance: "user-confirmed" } },
      { action: "write_document", path: "progress.md", content: activeProgress },
      { action: "update_frontmatter", path: "goal.md", values: { status: "active" } },
      { action: "append_log", scope: ".", event: { type: "decision", title: "Goal activated", approval: "explicit" } },
    ],
  };
  const beforeDryRun = await readFile(join(root, ".memory", "goal.md"), "utf8");
  const preview = await applyMemoryPlan(root, activate, { dryRun: true });
  assert.equal(preview.validation?.ok, true, JSON.stringify(preview.validation?.diagnostics));
  assert.ok(preview.changes.some((change) => change.action === "update"));
  assert.equal(await readFile(join(root, ".memory", "goal.md"), "utf8"), beforeDryRun, "dry-run must not mutate the real bundle");
  const result = await applyMemoryPlan(root, activate);
  assert.equal(result.validation?.ok, true, JSON.stringify(result.validation?.diagnostics));
  assert.equal(parseMarkdown(await readFile(join(root, ".memory", "goal.md"), "utf8")).data.status, "active");

  const progressPath = join(root, ".memory", "progress.md");
  const progressBefore = await readFile(progressPath, "utf8");
  const invalidProgress = progressBefore.replace("## Next action", "## Removed next action");
  await assert.rejects(() => applyMemoryPlan(root, {
    operations: [{ action: "write_document", path: "progress.md", content: invalidProgress }],
  }), /produced invalid bundle/);
  assert.equal(await readFile(progressPath, "utf8"), progressBefore, "failed plans must roll back all writes");

  await applyMemoryPlan(root, {
    approved: true,
    approvalReason: "Begin verification",
    operations: [{ action: "update_frontmatter", path: "goal.md", values: { status: "verifying" } }],
  });
  const invalid: MemoryPlan = {
    approved: true,
    approvalReason: "Attempted completion",
    operations: [{ action: "update_frontmatter", path: "goal.md", values: { status: "complete" } }],
  };
  await assert.rejects(() => applyMemoryPlan(root, invalid), /Completion evidence is incomplete/);
});

test("completion plans preserve criteria and support dry-run evidence from the real repository", async (t) => {
  const root = await temporaryProject();
  t.after(() => rm(root, { recursive: true, force: true }));
  await initializeBundle(root);
  await writeFile(join(root, "evidence.txt"), "passed\n");
  const goalPath = join(root, ".memory", "goal.md");
  const progressPath = join(root, ".memory", "progress.md");
  const goal = (await readFile(goalPath, "utf8")).replace("Use stable IDs in the `AC-NNN` form. Each criterion must be independently verifiable.", "- AC-001: Verified behavior.");
  const progress = (await readFile(progressPath, "utf8")).replace("|---|---|---|", "|---|---|---|\n| AC-001 | verified | repo://evidence.txt |");
  await applyMemoryPlan(root, {
    approved: true,
    approvalReason: "Approve test goal",
    operations: [
      { action: "write_document", path: "goal.md", content: goal },
      { action: "write_document", path: "progress.md", content: progress },
      { action: "update_frontmatter", path: "goal.md", values: { status: "interviewing" } },
      { action: "update_frontmatter", path: "goal.md", values: { status: "awaiting-approval" } },
      { action: "update_frontmatter", path: "goal.md", values: { status: "ready" } },
      { action: "update_frontmatter", path: "goal.md", values: { status: "active" } },
      { action: "update_frontmatter", path: "goal.md", values: { status: "verifying" } },
    ],
  });
  const preview = await applyMemoryPlan(root, {
    approved: true,
    approvalReason: "Approve completion preview",
    operations: [{ action: "update_frontmatter", path: "goal.md", values: { status: "complete" } }],
  }, { dryRun: true });
  assert.equal(preview.validation?.ok, true);
  const replacement = (await readFile(goalPath, "utf8")).replace("status: verifying", "status: complete").replace("AC-001", "AC-002");
  await assert.rejects(() => applyMemoryPlan(root, {
    approved: true,
    approvalReason: "Attempt criteria replacement",
    operations: [{ action: "write_document", path: "goal.md", content: replacement }],
  }), /Complete goals with update_frontmatter/);
});

test("structured plans cannot forge or leak through source records", async (t) => {
  const root = await temporaryProject(true);
  t.after(() => rm(root, { recursive: true, force: true }));
  await initializeBundle(root);
  const source = await registerSource(root, "repo://docs/requirements.md");
  await assert.rejects(() => applyMemoryPlan(root, {
    operations: [{ action: "update_frontmatter", path: source.path.replace(/^\.memory\//, ""), values: { type: "Architecture" } }],
  }), /'type' is immutable/);
  const content = `${await readFile(join(root, source.path), "utf8")}\npassword=supersecretvalue123\n`;
  await assert.rejects(() => applyMemoryPlan(root, {
    approved: true,
    approvalReason: "Attempt secret write",
    operations: [{ action: "write_document", path: source.path.replace(/^\.memory\//, ""), content }],
  }), /likely secret material/);
  await assert.rejects(() => applyMemoryPlan(root, {
    operations: [{ action: "update_frontmatter", path: "progress.md", values: { note: "password=supersecretvalue123" } }],
  }), /likely secret material/);
  await assert.rejects(() => applyMemoryPlan(root, {
    operations: [{ action: "replace_generated", path: "index.md", region: "focus", content: "access_token=supersecretvalue123" }],
  }), /likely secret material/);
});

test("rejected secret-like source identifiers leave no partial record", async (t) => {
  const root = await temporaryProject(true);
  t.after(() => rm(root, { recursive: true, force: true }));
  await initializeBundle(root);
  await writeFile(join(root, "docs", "password=supersecretvalue123.md"), "# Benign content\n");
  const sources = join(root, ".memory", "sources");
  const before = await readdir(sources);
  await assert.rejects(() => registerSource(root, "repo://docs/password=supersecretvalue123.md"), /secret material/);
  assert.deepEqual(await readdir(sources), before);
});

test("bundle locks reject concurrent mutation and recover stale locks", async (t) => {
  const root = await temporaryProject();
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, ".memory"));
  let release!: () => void;
  let started!: () => void;
  const startedPromise = new Promise<void>((resolveStarted) => { started = resolveStarted; });
  const hold = new Promise<void>((resolveHold) => { release = resolveHold; });
  const first = withBundleLock(root, async () => {
    started();
    await hold;
  });
  await startedPromise;
  await assert.rejects(() => withBundleLock(root, async () => undefined), /update is in progress/);
  release();
  await first;

  const lockPath = join(root, ".memory", ".lock");
  await writeFile(lockPath, "stale");
  const old = new Date(Date.now() - 10 * 60_000);
  await utimes(lockPath, old, old);
  assert.equal(await withBundleLock(root, async () => "recovered"), "recovered");
});

test("AGENTS synchronization preserves user content and rejects duplicate markers", async (t) => {
  const root = await temporaryProject();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "AGENTS.md"), "# User instructions\n\nKeep this.\n");
  await syncAgentsFile(root);
  const first = await readFile(join(root, "AGENTS.md"), "utf8");
  assert.match(first, /Keep this\./);
  assert.equal(first.split("<!-- memory:start -->").length - 1, 1);
  await syncAgentsFile(root);
  assert.equal(await readFile(join(root, "AGENTS.md"), "utf8"), first);
  await writeFile(join(root, "AGENTS.md"), `${first}\n<!-- memory:start -->\nbad\n<!-- memory:end -->\n`);
  await assert.rejects(() => syncAgentsFile(root), /malformed or duplicate/);
});

test("initialization ingests existing AGENTS.md content into goal.md and creates AGENTS.md if missing", async (t) => {
  const root = await temporaryProject();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "AGENTS.md"), "# Original Guidelines\n\n- Always test before commit.\n");
  
  await initializeBundle(root);
  const goalContent = await readFile(join(root, ".memory", "goal.md"), "utf8");
  assert.match(goalContent, /Context from AGENTS\.md/);
  assert.match(goalContent, /Always test before commit/);

  const unmanaged = await readUnmanagedAgentsContent(root);
  assert.equal(unmanaged, "# Original Guidelines\n\n- Always test before commit.");

  await syncAgentsFile(root, { userContent: "# Updated Guidelines\n\n- Updated rule." });
  const updatedAgents = await readFile(join(root, "AGENTS.md"), "utf8");
  assert.match(updatedAgents, /Updated Guidelines/);
  assert.match(updatedAgents, /<!-- memory:start -->/);
});

test("initialization refuses tracked scope paths that traverse a symbolic link", async (t) => {
  const root = await temporaryProject();
  t.after(() => rm(root, { recursive: true, force: true }));
  const outside = join(root, "outside");
  await mkdir(outside);
  await mkdir(join(root, ".memory"));
  try {
    await symlink(outside, join(root, ".memory", "feature"));
  } catch {
    t.skip("Symbolic links are unavailable on this platform");
    return;
  }
  await assert.rejects(() => initializeBundle(root, ["feature"]), /symbolic-link directory/);
  await assert.rejects(() => readFile(join(root, ".memory", "index.md"), "utf8"), /ENOENT/);
});

test("validation rejects symbolic links inside the bundle", async (t) => {
  const root = await temporaryProject();
  t.after(() => rm(root, { recursive: true, force: true }));
  await initializeBundle(root);
  const outside = join(root, "outside.md");
  await writeFile(outside, "outside\n");
  try {
    await symlink(outside, join(root, ".memory", "linked.md"));
  } catch {
    t.skip("Symbolic links are unavailable on this platform");
    return;
  }
  const validation = await validateBundle(root);
  assert.equal(validation.ok, false);
  assert(validation.diagnostics.some((diagnostic) => diagnostic.code === "symlink"));
});

test("initializeBundle with deep scan auto-scaffolds candidate scopes and populates goal architecture", async (t) => {
  const root = await temporaryProject(true);
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "package.json"), JSON.stringify({
    name: "deep-app",
    dependencies: { react: "^18.0.0", next: "^14.0.0" },
  }));
  await writeFile(join(root, ".env.example"), "DATABASE_URL=postgresql://localhost:5432/db\n");

  const init = await initializeBundle(root, [], { deep: true });
  assert(init.scopes.includes("apps/api/src/domains/user"));
  assert(init.scopes.includes("apps/web/app/dashboard"));

  const rootGoal = await readFile(join(root, ".memory", "goal.md"), "utf8");
  assert.match(rootGoal, /Auto-Detected Architecture & Tech Stack/);
  assert.match(rootGoal, /TypeScript/);
  assert.match(rootGoal, /Next\.js/);
  assert.match(rootGoal, /DATABASE_URL/);

  const scopeAgents = await readFile(join(root, ".memory", "apps", "api", "src", "domains", "user", "agents.md"), "utf8");
  assert.match(scopeAgents, /Auto-scaffolded scope for `apps\/api\/src\/domains\/user`/);
  assert.equal(await readIfExists(join(root, ".memory", "apps", "api", "src", "domains", "user", "goal.md")), undefined);
  assert.equal(await readIfExists(join(root, ".memory", "apps", "api", "src", "domains", "user", "progress.md")), undefined);
  assert.equal(await readIfExists(join(root, ".memory", "apps", "api", "src", "domains", "user", "tasks.md")), undefined);

  const validation = await validateBundle(root);
  assert.equal(validation.ok, true, JSON.stringify(validation.diagnostics));
});

test("initializeBundle creates executive root index capsule and provides treemap on demand", async (t) => {
  const root = await temporaryProject(true);
  t.after(() => rm(root, { recursive: true, force: true }));
  await initializeBundle(root);
  const rootIndex = await readFile(join(root, ".memory", "index.md"), "utf8");
  assert.match(rootIndex, /## Project/);
  assert.match(rootIndex, /## Now/);
  assert.match(rootIndex, /## Architecture/);
  assert.match(rootIndex, /## Find/);
  assert.match(rootIndex, /## Active scopes/);
  assert.doesNotMatch(rootIndex, /## Codebase structure/);

  const treemap = await generateMemoryMap(root);
  assert.match(treemap, /profile\.ts # API route handler/);
  assert.match(treemap, /docs\/ # Documentation/);
});

test("validation enforces hard byte budgets on root index and scope index", async (t) => {
  const root = await temporaryProject(false);
  t.after(() => rm(root, { recursive: true, force: true }));
  await initializeBundle(root, ["src/feature"]);

  // 1. Root index warnings (> 4000) and errors (> 6000)
  const originalIndex = await readFile(join(root, ".memory", "index.md"), "utf8");
  await writeFile(join(root, ".memory", "index.md"), `${originalIndex}\n<!-- pad -->\n${"x".repeat(3_000)}`);
  let validation = await validateBundle(root);
  assert.equal(validation.ok, true, JSON.stringify(validation.diagnostics));
  assert(validation.diagnostics.some((d) => d.code === "budget-root-index" && d.severity === "warning"));

  await writeFile(join(root, ".memory", "index.md"), `${originalIndex}\n<!-- pad -->\n${"x".repeat(5_500)}`);
  validation = await validateBundle(root);
  assert.equal(validation.ok, false);
  assert(validation.diagnostics.some((d) => d.code === "budget-root-index" && d.severity === "error"));

  // Restore root index
  await writeFile(join(root, ".memory", "index.md"), originalIndex);

  // 2. Scope index error (> 8000)
  await writeFile(join(root, ".memory", "src", "feature", "index.md"), `# Feature\n<!-- pad -->\n${"x".repeat(8_500)}`);
  validation = await validateBundle(root);
  assert.equal(validation.ok, false);
  assert(validation.diagnostics.some((d) => d.code === "budget-scope-index" && d.severity === "error"));

  // 3. Subfolder cannot contain goal.md, progress.md, or tasks.md
  await rm(join(root, ".memory", "src", "feature", "index.md"), { force: true });
  await writeFile(join(root, ".memory", "src", "feature", "goal.md"), "# Sub Goal");
  validation = await validateBundle(root);
  assert.equal(validation.ok, false);
  assert(validation.diagnostics.some((d) => d.code === "root-only-file" && d.severity === "error"));
});

test("validation enforces active tasks limit and document size warnings", async (t) => {
  const root = await temporaryProject(false);
  t.after(() => rm(root, { recursive: true, force: true }));
  await initializeBundle(root);

  // 1. Document size warning (> 16,000 bytes)
  const originalGoal = await readFile(join(root, ".memory", "goal.md"), "utf8");
  await writeFile(join(root, ".memory", "goal.md"), `${originalGoal}\n### Extra\n${"y".repeat(17_000)}`);
  let validation = await validateBundle(root);
  assert.equal(validation.ok, true);
  assert(validation.diagnostics.some((d) => d.code === "budget-document-size" && d.severity === "warning"));
  await writeFile(join(root, ".memory", "goal.md"), originalGoal);

  // 2. Active tasks limit (> 5 tasks error)
  const originalTasks = await readFile(join(root, ".memory", "tasks.md"), "utf8");
  const tooManyTasks = originalTasks.replace("## Active tasks (Do Now)", `## Active tasks (Do Now)\n\n1. [ ] Task 1\n2. [ ] Task 2\n3. [ ] Task 3\n4. [ ] Task 4\n5. [ ] Task 5\n6. [ ] Task 6`);
  await writeFile(join(root, ".memory", "tasks.md"), tooManyTasks);
  validation = await validateBundle(root);
  assert.equal(validation.ok, false);
  assert(validation.diagnostics.some((d) => d.code === "budget-active-tasks" && d.severity === "error"));
});

test("large repository with 100 tracked scopes produces bounded root index <= 6,000 bytes and <= 5 visible scopes", async (t) => {
  const root = await temporaryProject(false);
  t.after(() => rm(root, { recursive: true, force: true }));

  // Create 100 scopes with dummy source files
  const scopes: string[] = [];
  for (let i = 0; i < 100; i++) {
    const scopePath = `packages/pkg-${i.toString().padStart(3, "0")}`;
    scopes.push(scopePath);
    await mkdir(join(root, scopePath), { recursive: true });
    await writeFile(join(root, scopePath, "index.ts"), `export const pkg${i} = ${i};\n`);
  }

  await initializeBundle(root, scopes, { deep: false });
  await syncIndexes(root);

  const rootIndex = await readFile(join(root, ".memory", "index.md"), "utf8");
  const byteLength = Buffer.byteLength(rootIndex, "utf8");

  // Verify byte budget: must be well under 6,000 bytes (and under 4,000 bytes target)
  assert.ok(byteLength <= 6_000, `Root index exceeds 6000 bytes: ${byteLength} bytes`);
  assert.ok(byteLength <= 4_000, `Root index exceeds 4000 bytes warning threshold: ${byteLength} bytes`);

  // Verify scopes section contains at most 5 entries plus summary line
  const scopesSection = rootIndex.split("<!-- memory:generated:start scopes -->")[1]?.split("<!-- memory:generated:end scopes -->")[0] ?? "";
  const scopeItemLines = scopesSection.trim().split("\n").filter((l) => l.trim().startsWith("- ["));
  assert.equal(scopeItemLines.length, 5, `Expected exactly 5 visible scope items, found ${scopeItemLines.length}`);
  assert.match(scopesSection, /- \.\.\. \(96 more tracked scope\(s\)\)/);

  const validation = await validateBundle(root);
  assert.equal(validation.ok, true, JSON.stringify(validation.diagnostics));

  // Verify memory map generates on demand without inflating startup context
  const treemap = await generateMemoryMap(root);
  assert.match(treemap, /pkg-000/);
  assert.match(treemap, /pkg-099/);
});

test("0.2 initialization scaffolds architecture lenses with mandatory flows and Flow.md contracts", async (t) => {
  const root = await temporaryProject(true);
  t.after(() => rm(root, { recursive: true, force: true }));
  await initializeBundle(root);

  const archIndex = await readFile(join(root, ".memory", "architecture", "index.md"), "utf8");
  assert.match(archIndex, /type: ArchitectureIndex/);
  assert.match(archIndex, /## Flow map/);

  // Mandatory flows must exist
  for (const layer of ["system-design", "domain", "security"]) {
    const flowPath = join(root, ".memory", "architecture", layer, "Flow.md");
    const flowContent = await readFile(flowPath, "utf8");
    assert.match(flowContent, new RegExp(`layer: ${layer}`));
    assert.match(flowContent, /type: Flow/);
    assert.match(flowContent, /## Responsibility/);
    assert.match(flowContent, /## Route/);
    assert.match(flowContent, /## Steps/);
    assert.match(flowContent, /## Domain contract/);
    assert.match(flowContent, /## Code anchors/);
  }

  const validation = await validateBundle(root);
  assert.equal(validation.ok, true, JSON.stringify(validation.diagnostics));
});

test("0.2 validation rejects non-Flow.md files and invalid layer assignments", async (t) => {
  const root = await temporaryProject(false);
  t.after(() => rm(root, { recursive: true, force: true }));
  await initializeBundle(root);

  // 1. Wrong casing flow.md instead of Flow.md
  await rename(
    join(root, ".memory", "architecture", "domain", "Flow.md"),
    join(root, ".memory", "architecture", "domain", "flow.md"),
  );
  let validation = await validateBundle(root);
  assert.equal(validation.ok, false);
  assert(validation.diagnostics.some((d) => d.code === "missing-mandatory-flow" || d.code === "invalid-flow-file"));

  // Restore Flow.md
  await rename(
    join(root, ".memory", "architecture", "domain", "flow.md"),
    join(root, ".memory", "architecture", "domain", "Flow.md"),
  );

  // 2. Layer mismatch between frontmatter and directory
  const domainFlow = await readFile(join(root, ".memory", "architecture", "domain", "Flow.md"), "utf8");
  await writeFile(
    join(root, ".memory", "architecture", "domain", "Flow.md"),
    domainFlow.replace("layer: domain", "layer: frontend"),
  );
  validation = await validateBundle(root);
  assert.equal(validation.ok, false);
  assert(validation.diagnostics.some((d) => d.code === "flow-layer-mismatch"));
});

test("0.2 safe migration upgrades 0.1 legacy bundle to 0.2 with architecture lenses", async (t) => {
  const root = await temporaryProject(false);
  t.after(() => rm(root, { recursive: true, force: true }));

  // Create a minimal 0.1 legacy bundle
  await mkdir(join(root, ".memory", "sources"), { recursive: true });
  await writeFile(join(root, ".memory", "index.md"), `---
memory_version: "0.1"
project: Legacy
summary: Legacy project
active_scope: .
active_objective: OBJ-001
status: draft
title: Legacy Project Memory
description: Executive memory capsule.
timestamp: 2026-01-01T00:00:00Z
repository_head: null
repository_fingerprint: null
last_scan_at: null
---
# Project Memory

## Project
- Purpose: Legacy

## Active
<!-- memory:generated:start active -->
- Objective: [OBJ-001](/goal.md)
<!-- memory:generated:end active -->

## Map
- [Goal](/goal.md)
- [Progress](/progress.md)
- [Tasks](/tasks.md)
- [History](/log.md)
- [Sources](/sources/)

## Scopes
<!-- memory:generated:start scopes -->
- [Project](/goal.md) — active
<!-- memory:generated:end scopes -->
`);

  await writeFile(join(root, ".memory", "goal.md"), `---
type: Goal
title: Legacy goal
description: Goal
timestamp: 2026-01-01T00:00:00Z
scope: .
status: draft
provenance: observed
uid: 00000000-0000-0000-0000-000000000001
---
# Goal
`);

  await writeFile(join(root, ".memory", "progress.md"), `---
type: Progress
title: Legacy progress
description: Progress
timestamp: 2026-01-01T00:00:00Z
scope: .
---
# Progress
`);

  await writeFile(join(root, ".memory", "tasks.md"), `---
type: Tasks
title: Legacy tasks
description: Tasks
timestamp: 2026-01-01T00:00:00Z
scope: .
---
# Tasks
`);

  await writeFile(join(root, ".memory", "log.md"), `# Log\n`);
  await writeFile(join(root, ".memory", "sources", "index.md"), `# Sources\n`);

  // Pre-migration validation fails on 0.1
  let validation = await validateBundle(root);
  assert.equal(validation.ok, false);
  assert(validation.diagnostics.some((d) => d.code === "version"));

  // Run migration
  const result = await migrateBundle(root);
  assert.equal(result.version, "0.2");
  assert.equal(result.validation.ok, true);

  // Check 0.2 root index
  const migratedIndex = await readFile(join(root, ".memory", "index.md"), "utf8");
  assert.match(migratedIndex, /memory_version: "0.2"/);
  assert.match(migratedIndex, /architecture_mode:\s*"?ddd"?/);
  assert.match(migratedIndex, /## Architecture/);

  // Check architecture files
  assert.equal(typeof await readFile(join(root, ".memory", "architecture", "index.md"), "utf8"), "string");
  for (const layer of ["system-design", "domain", "security"]) {
    assert.equal(typeof await readFile(join(root, ".memory", "architecture", layer, "Flow.md"), "utf8"), "string");
  }

  // Post-migration validation succeeds
  validation = await validateBundle(root);
  assert.equal(validation.ok, true, JSON.stringify(validation.diagnostics));
});

test("0.2 migration shifts legacy subfolder goal, progress, tasks into agents.md and logs event", async (t) => {
  const root = await temporaryProject(true);
  t.after(() => rm(root, { recursive: true, force: true }));

  const scope = "apps/api/src/domains/user";
  await initializeBundle(root, [scope]);

  // Simulate legacy bundle: remove agents.md, put goal.md, progress.md, tasks.md, index.md in subfolder
  const scopeDir = join(root, ".memory", scope);
  await rm(join(scopeDir, "agents.md"), { force: true });

  await writeFile(join(scopeDir, "goal.md"), `---
type: Goal
title: User Domain Goal
description: User domain goal description.
timestamp: 2026-01-01T00:00:00Z
scope: ${scope}
status: active
provenance: observed
uid: 00000000-0000-0000-0000-000000000010
---
# User Domain Goal

## Motivation
Migrated user domain motivation.

## Requirements
- REQ-001: Support user profile edits.

## Acceptance criteria
- AC-001: Verified user profile save works.
`);

  await writeFile(join(scopeDir, "progress.md"), `---
type: Progress
title: User Domain Progress
description: Progress for user domain.
timestamp: 2026-01-01T00:00:00Z
scope: ${scope}
---
# User Domain Progress

## Current state
Profile editing in progress.

## Blockers & drift
none

## Acceptance evidence
| Criterion | Status | Evidence |
|---|---|---|
| AC-001 | verified | repo://apps/api/src/domains/user/profile.test.ts |

## Next action
- **Action:** Add profile avatar upload
- **File / Command:** Edit apps/api/src/domains/user/profile.ts
- **Time estimate:** [20 min]
- **Requirement:** REQ-001
- **Likely files:** \`apps/api/src/domains/user/profile.ts\`
- **Verification:** bun test
- **Approval:** approved
`);

  await writeFile(join(scopeDir, "tasks.md"), `---
type: Tasks
title: User Domain Tasks
description: Tasks for user domain.
timestamp: 2026-01-01T00:00:00Z
scope: ${scope}
---
# Tasks

## Single next action
- **Action:** Add profile avatar upload
- **File / Command:** Edit apps/api/src/domains/user/profile.ts
- **Time estimate:** [20 min]
- **Requirement:** REQ-001
- **Likely files:** \`apps/api/src/domains/user/profile.ts\`
- **Verification:** bun test
- **Approval:** approved

## Active tasks (Do Now)
1. [ ] **Avatar upload** \`[20 min]\` (REQ-001) — Implement avatar endpoint
`);

  await writeFile(join(scopeDir, "index.md"), `# User Domain Index\n`);

  // Validation must fail before migration due to root-only files in subfolder
  let validation = await validateBundle(root);
  assert.equal(validation.ok, false);
  assert(validation.diagnostics.some((d) => d.code === "root-only-file"));

  // Run migration
  const result = await migrateBundle(root);
  assert.equal(result.validation.ok, true, JSON.stringify(result.validation.diagnostics));

  // Legacy files must be removed
  assert.equal(await readIfExists(join(scopeDir, "goal.md")), undefined);
  assert.equal(await readIfExists(join(scopeDir, "progress.md")), undefined);
  assert.equal(await readIfExists(join(scopeDir, "tasks.md")), undefined);
  assert.equal(await readIfExists(join(scopeDir, "index.md")), undefined);

  // agents.md must contain all shifted data
  const agentsContent = await readFile(join(scopeDir, "agents.md"), "utf8");
  assert.match(agentsContent, /Migrated user domain motivation/);
  assert.match(agentsContent, /REQ-001: Support user profile edits/);
  assert.match(agentsContent, /AC-001: Verified user profile save works/);
  assert.match(agentsContent, /Profile editing in progress/);
  assert.match(agentsContent, /repo:\/\/apps\/api\/src\/domains\/user\/profile\.test\.ts/);
  assert.match(agentsContent, /Add profile avatar upload/);
  assert.match(agentsContent, /Avatar upload/);

  // log.md must contain migration entry
  const logContent = await readFile(join(scopeDir, "log.md"), "utf8");
  assert.match(logContent, /Migration: Scope Restructure/);
  assert.match(logContent, /Migrated legacy subfolder files/);

  // Validation must pass cleanly
  validation = await validateBundle(root);
  assert.equal(validation.ok, true, JSON.stringify(validation.diagnostics));
});



