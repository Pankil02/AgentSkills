import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  applyMemoryPlan,
  checkPathGovernance,
  generateMemoryMap,
  initializeBundle,
  listDecisions,
  migrateBundle,
  parseMarkdown,
  readLogEntries,
  readUnmanagedAgentsContent,
  recordDecision,
  recordEvent,
  rotateLogs,
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
  for (const file of ["index.md", "conventions.md", "log.md", "decisions/index.md"]) {
    assert.equal(typeof await readFile(join(root, ".memory", file), "utf8"), "string");
  }
  for (const removed of ["goal.md", "progress.md", "tasks.md"]) {
    assert.equal(await readIfExists(join(root, ".memory", removed)), undefined, `${removed} must not be created`);
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
  const newer = updateMarkdownFrontmatter(await readFile(indexPath, "utf8"), { memory_version: "0.9" });
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
  assert.match(await readFile(join(root, ".memory", "index.md"), "utf8"), /memory_version: "0.3"/);
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

test("semantic plans require approval; non-semantic generated updates do not", async (t) => {
  const root = await temporaryProject();
  t.after(() => rm(root, { recursive: true, force: true }));
  await initializeBundle(root);

  await assert.rejects(() => applyMemoryPlan(root, {
    operations: [{ action: "update_frontmatter", path: "conventions.md", values: { description: "Changed conventions summary." } }],
  }), /explicit user approval/);
  await assert.rejects(() => applyMemoryPlan(root, {
    operations: [{ action: "append_log", scope: ".", event: { type: "decision", title: "Sneaky decision" } }],
  }), /explicit user approval/);
  await assert.rejects(() => applyMemoryPlan(root, {
    operations: [{ action: "unsupported" } as never],
  }), /Unsupported memory operation/);
  await assert.rejects(() => applyMemoryPlan(root, {
    approved: true,
    approvalReason: "Attempted forged source",
    operations: [{ action: "write_document", path: "sources/forged.md", content: "---\ntype: Source\nresource: repo://secret\nsource_hash: sha256:fake\n---\n# Forged\n" }],
  }), /Create source records/);
  await assert.rejects(() => applyMemoryPlan(root, {
    approved: true,
    approvalReason: "Recreate legacy file",
    operations: [{ action: "write_document", path: "goal.md", content: "---\ntype: Goal\ntitle: x\n---\n# Goal\n" }],
  }), /not part of format/);

  // Non-semantic log entries apply without approval.
  const result = await applyMemoryPlan(root, {
    operations: [{ action: "append_log", scope: ".", event: { type: "fix", title: "Fixed flaky test", summary: "Race in setup." } }],
  });
  assert.equal(result.validation?.ok, true, JSON.stringify(result.validation?.diagnostics));

  // Approved conventions update; dry-run leaves the bundle untouched; failures roll back.
  const conventionsPath = join(root, ".memory", "conventions.md");
  const before = await readFile(conventionsPath, "utf8");
  const updated = before.replace("## Rules\n- none recorded", "## Rules\n- MUST: Run `npm test` before commit.");
  const plan: MemoryPlan = { approved: true, approvalReason: "User chose option A", operations: [{ action: "write_document", path: "conventions.md", content: updated }] };
  const preview = await applyMemoryPlan(root, plan, { dryRun: true });
  assert.equal(preview.validation?.ok, true);
  assert.equal(await readFile(conventionsPath, "utf8"), before, "dry-run must not mutate the real bundle");
  await applyMemoryPlan(root, plan);
  assert.match(await readFile(conventionsPath, "utf8"), /MUST: Run `npm test`/);

  const afterApply = await readFile(conventionsPath, "utf8");
  await assert.rejects(() => applyMemoryPlan(root, {
    approved: true,
    approvalReason: "Break the bundle",
    operations: [
      { action: "write_document", path: "conventions.md", content: afterApply.replace("MUST:", "MUST NOT:") },
      { action: "write_document", path: "decisions/D-001-bad.md", content: "---\ntype: Decision\nid: D-999\nstatus: nope\n---\n# Bad\n" },
    ],
  }), /produced invalid bundle/);
  assert.equal(await readFile(conventionsPath, "utf8"), afterApply, "failed plans must roll back all writes");
});

test("decisions are numbered files, supersession is tracked, and index lists them", async (t) => {
  const root = await temporaryProject();
  t.after(() => rm(root, { recursive: true, force: true }));
  await initializeBundle(root);
  const now = new Date("2026-03-01T00:00:00Z");

  await assert.rejects(() => recordDecision(root, { title: "x", decision: "y", approvalReason: "" }), /explicit user approval/);

  const first = await recordDecision(root, {
    title: "Use Postgres",
    decision: "Primary store is Postgres 16.",
    rejected: ["SQLite: no concurrent writers"],
    codeRefs: ["src/db/**"],
    approvalReason: "User picked option A",
  }, { now });
  assert.equal(first.decision.id, "D-001");
  assert.match(first.decision.path, /\.memory\/decisions\/D-001-use-postgres\.md$/);

  const second = await recordDecision(root, {
    title: "Use Postgres 17",
    decision: "Upgrade to Postgres 17.",
    supersedes: "D-001",
    approvalReason: "User approved upgrade",
  }, { now });
  assert.equal(second.decision.id, "D-002");

  const decisions = await listDecisions(root);
  assert.deepEqual(decisions.map((d) => [d.id, d.status]), [["D-001", "superseded"], ["D-002", "accepted"]]);
  await assert.rejects(() => recordDecision(root, { title: "Again", decision: "z", supersedes: "D-001", approvalReason: "ok" }), /already superseded/);

  const rootIndex = await readFile(join(root, ".memory", "index.md"), "utf8");
  assert.match(rootIndex, /\[D-002\]\(\/decisions\/D-002-use-postgres-17\.md\)/);
  assert.doesNotMatch(rootIndex, /\[D-001\]/, "superseded decisions stay out of the router");
  const decisionsIndex = await readFile(join(root, ".memory", "decisions", "index.md"), "utf8");
  assert.match(decisionsIndex, /\| \[D-001\]\(\.\/D-001-use-postgres\.md\) \| superseded \|/);

  const governance = await checkPathGovernance(root, "src/db/pool.ts");
  assert(!governance.governingDocuments.some((d) => d.path.includes("D-001")), "superseded decisions must not govern");

  const log = await readLogEntries(root, { types: ["decision"] });
  assert.equal(log.length, 2);
  assert.equal((await validateBundle(root)).ok, true);
});

test("log entries are filterable and old months rotate into archives", async (t) => {
  const root = await temporaryProject();
  t.after(() => rm(root, { recursive: true, force: true }));
  await initializeBundle(root, [], { now: new Date("2026-01-10T00:00:00Z") });
  await recordEvent(root, ".", { type: "fix", title: "Fixed login race", summary: "Mutex around refresh." }, { now: new Date("2026-01-15T00:00:00Z") });
  await recordEvent(root, ".", { type: "finding", title: "Cache is per-process" }, { now: new Date("2026-02-02T00:00:00Z") });
  await recordEvent(root, ".", { type: "change", title: "Added export endpoint" }, { now: new Date("2026-03-05T00:00:00Z") });

  const recent = await readLogEntries(root, { limit: 2 });
  assert.deepEqual(recent.map((e) => e.title), ["Added export endpoint", "Cache is per-process"]);
  assert.deepEqual((await readLogEntries(root, { types: ["fix"] })).map((e) => e.title), ["Fixed login race"]);
  assert.deepEqual((await readLogEntries(root, { since: "2026-02-01" })).length, 2);
  assert.deepEqual((await readLogEntries(root, { query: "mutex" })).map((e) => e.type), ["fix"]);

  const preview = await rotateLogs(root, { dryRun: true, now: new Date("2026-03-20T00:00:00Z") });
  assert(preview.some((c) => c.path.endsWith("log/2026-01.md")));
  assert.equal(await readIfExists(join(root, ".memory", "log", "2026-01.md")), undefined, "dry-run must not write archives");

  await rotateLogs(root, { now: new Date("2026-03-20T00:00:00Z") });
  const hot = await readFile(join(root, ".memory", "log.md"), "utf8");
  assert.match(hot, /## 2026-03-05/);
  assert.doesNotMatch(hot, /## 2026-01-15|## 2026-02-02/);
  assert.match(await readFile(join(root, ".memory", "log", "2026-01.md"), "utf8"), /Fixed login race/);
  assert.match(await readFile(join(root, ".memory", "log", "2026-02.md"), "utf8"), /Cache is per-process/);

  assert.equal((await readLogEntries(root, {})).length, 1);
  const withArchive = await readLogEntries(root, { includeArchive: true, excludeTypes: ["init"] });
  assert.deepEqual(withArchive.map((e) => e.title), ["Added export endpoint", "Cache is per-process", "Fixed login race"]);
  assert(withArchive.slice(1).every((e) => e.archived));

  // Rotation is idempotent.
  const again = await rotateLogs(root, { now: new Date("2026-03-20T00:00:00Z") });
  assert.equal(again.length, 0);
  const validation = await validateBundle(root, { strict: true });
  assert.equal(validation.ok, true, JSON.stringify(validation.diagnostics));
});

test("conventions govern every path and scope briefs govern their subtree", async (t) => {
  const root = await temporaryProject(true);
  t.after(() => rm(root, { recursive: true, force: true }));
  const scope = "apps/api/src/domains/user";
  await initializeBundle(root, [scope]);
  const conventionsPath = join(root, ".memory", "conventions.md");
  const conventions = (await readFile(conventionsPath, "utf8")).replace("## Rules\n- none recorded", "## Rules\n- NEVER: Log raw request bodies.");
  await applyMemoryPlan(root, { approved: true, approvalReason: "test", operations: [{ action: "write_document", path: "conventions.md", content: conventions }] });

  const result = await checkPathGovernance(root, `${scope}/profile.ts`);
  assert(result.governingDocuments.some((d) => d.path === ".memory/conventions.md"));
  assert(result.governingDocuments.some((d) => d.path === `.memory/${scope}/agents.md`));
  assert(result.constraints.includes("NEVER: Log raw request bodies."));
  const unrelated = await checkPathGovernance(root, "README.md");
  assert(!unrelated.governingDocuments.some((d) => d.path.endsWith("agents.md")));
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
    approved: true,
    approvalReason: "Attempt secret frontmatter",
    operations: [{ action: "update_frontmatter", path: "conventions.md", values: { note: "password=supersecretvalue123" } }],
  }), /likely secret material/);
  await assert.rejects(() => applyMemoryPlan(root, {
    operations: [{ action: "replace_generated", path: "index.md", region: "recent", content: "access_token=supersecretvalue123" }],
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

test("initialization preserves existing AGENTS.md content and appends the managed block", async (t) => {
  const root = await temporaryProject();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "AGENTS.md"), "# Original Guidelines\n\n- Always test before commit.\n");

  await initializeBundle(root);
  const agents = await readFile(join(root, "AGENTS.md"), "utf8");
  assert.match(agents, /Always test before commit/);
  assert.match(agents, /<!-- memory:start -->[\s\S]*memory check --for-path[\s\S]*<!-- memory:end -->/);

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

test("deep init scaffolds scopes with observed facts and no goal/task tracking", async (t) => {
  const root = await temporaryProject(true);
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "package.json"), JSON.stringify({
    name: "deep-app",
    packageManager: "npm@10.0.0",
    dependencies: { react: "^18.0.0", next: "^14.0.0" },
  }));

  const init = await initializeBundle(root, [], { deep: true });
  assert(init.scopes.includes("apps/api/src/domains/user"));
  assert(init.scopes.includes("apps/web/app/dashboard"));

  const rootIndex = await readFile(join(root, ".memory", "index.md"), "utf8");
  assert.match(rootIndex, /Stack: .*TypeScript/);
  assert.match(rootIndex, /Next\.js/);
  const conventions = await readFile(join(root, ".memory", "conventions.md"), "utf8");
  assert.match(conventions, /Package manager: `npm` \(observed\)/);

  const scopeAgents = await readFile(join(root, ".memory", "apps", "api", "src", "domains", "user", "agents.md"), "utf8");
  assert.match(scopeAgents, /## Purpose/);
  assert.match(scopeAgents, /## Map\n- Code root: `apps\/api\/src\/domains\/user\/` \(\d+ files, observed\)/);
  assert.match(scopeAgents, /code_refs:\n\s+- apps\/api\/src\/domains\/user\/\*\*/);
  assert.doesNotMatch(scopeAgents, /Acceptance criteria|Active tasks|Next action|status:/i);

  const validation = await validateBundle(root);
  assert.equal(validation.ok, true, JSON.stringify(validation.diagnostics));
});

test("root index is a compact router and provides treemap on demand", async (t) => {
  const root = await temporaryProject(true);
  t.after(() => rm(root, { recursive: true, force: true }));
  await initializeBundle(root);
  const rootIndex = await readFile(join(root, ".memory", "index.md"), "utf8");
  for (const heading of ["## Project", "## Find", "## Recent decisions", "## Recent activity", "## Scopes"]) {
    assert.match(rootIndex, new RegExp(heading));
  }
  assert.doesNotMatch(rootIndex, /goal\.md|tasks\.md|progress\.md|## Now|Next action/);
  assert.ok(Buffer.byteLength(rootIndex, "utf8") < 3_000, `router too large: ${Buffer.byteLength(rootIndex, "utf8")}`);

  const treemap = await generateMemoryMap(root);
  assert.match(treemap, /profile\.ts # API route handler/);
  assert.match(treemap, /docs\/ # Documentation/);
});

test("validation enforces byte budgets and rejects legacy tracking files", async (t) => {
  const root = await temporaryProject(false);
  t.after(() => rm(root, { recursive: true, force: true }));
  await initializeBundle(root, ["src/feature"]);

  const originalIndex = await readFile(join(root, ".memory", "index.md"), "utf8");
  await writeFile(join(root, ".memory", "index.md"), `${originalIndex}\n<!-- pad -->\n${"x".repeat(3_000)}`);
  let validation = await validateBundle(root);
  assert.equal(validation.ok, true, JSON.stringify(validation.diagnostics));
  assert(validation.diagnostics.some((d) => d.code === "budget-root-index" && d.severity === "warning"));

  await writeFile(join(root, ".memory", "index.md"), `${originalIndex}\n<!-- pad -->\n${"x".repeat(5_500)}`);
  validation = await validateBundle(root);
  assert.equal(validation.ok, false);
  assert(validation.diagnostics.some((d) => d.code === "budget-root-index" && d.severity === "error"));
  await writeFile(join(root, ".memory", "index.md"), originalIndex);

  await writeFile(join(root, ".memory", "src", "feature", "index.md"), `# Feature\n<!-- pad -->\n${"x".repeat(8_500)}`);
  validation = await validateBundle(root);
  assert(validation.diagnostics.some((d) => d.code === "budget-scope-index" && d.severity === "error"));
  await rm(join(root, ".memory", "src", "feature", "index.md"), { force: true });

  const agentsPath = join(root, ".memory", "src", "feature", "agents.md");
  const agents = await readFile(agentsPath, "utf8");
  await writeFile(agentsPath, `${agents}\n## Extra\n${"y".repeat(17_000)}`);
  validation = await validateBundle(root);
  assert(validation.diagnostics.some((d) => d.code === "budget-document-size" && d.severity === "warning"));
  await writeFile(agentsPath, agents);

  for (const legacy of ["tasks.md", "src/feature/goal.md"]) {
    await writeFile(join(root, ".memory", legacy), "---\ntype: Tasks\n---\n# Legacy\n");
    validation = await validateBundle(root);
    assert.equal(validation.ok, false);
    assert(validation.diagnostics.some((d) => d.code === "legacy-file"), legacy);
    await rm(join(root, ".memory", legacy));
  }

  await writeFile(join(root, ".memory", "decisions", "D-001-x.md"), "---\ntype: Decision\nid: D-002\ntitle: x\nstatus: maybe\n---\n# x\n");
  validation = await validateBundle(root);
  assert(validation.diagnostics.some((d) => d.code === "decision-id"));
  assert(validation.diagnostics.some((d) => d.code === "decision-status"));
});

test("large repository with 100 tracked scopes produces bounded root index and <= 5 visible scopes", async (t) => {
  const root = await temporaryProject(false);
  t.after(() => rm(root, { recursive: true, force: true }));
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
  assert.ok(byteLength <= 4_000, `Root index exceeds 4000 bytes: ${byteLength} bytes`);

  const scopesSection = rootIndex.split("<!-- memory:generated:start scopes -->")[1]?.split("<!-- memory:generated:end scopes -->")[0] ?? "";
  const scopeItemLines = scopesSection.trim().split("\n").filter((l) => l.trim().startsWith("- ["));
  assert.equal(scopeItemLines.length, 5);
  assert.match(scopesSection, /- … 95 more: `memory status`/);

  const validation = await validateBundle(root);
  assert.equal(validation.ok, true, JSON.stringify(validation.diagnostics));
});

test("initialization scaffolds architecture lenses with mandatory flows and Flow.md contracts", async (t) => {
  const root = await temporaryProject(true);
  t.after(() => rm(root, { recursive: true, force: true }));
  await initializeBundle(root);

  const archIndex = await readFile(join(root, ".memory", "architecture", "index.md"), "utf8");
  assert.match(archIndex, /type: ArchitectureIndex/);
  assert.match(archIndex, /## Flow map/);
  for (const layer of ["system-design", "domain", "security"]) {
    const flowContent = await readFile(join(root, ".memory", "architecture", layer, "Flow.md"), "utf8");
    assert.match(flowContent, new RegExp(`layer: ${layer}`));
    assert.match(flowContent, /type: Flow/);
    assert.match(flowContent, /## Domain contract/);
    assert.match(flowContent, /## Code anchors/);
  }
  const validation = await validateBundle(root);
  assert.equal(validation.ok, true, JSON.stringify(validation.diagnostics));
});

test("validation rejects non-Flow.md files and invalid layer assignments", async (t) => {
  const root = await temporaryProject(false);
  t.after(() => rm(root, { recursive: true, force: true }));
  await initializeBundle(root);
  const domainDir = join(root, ".memory", "architecture", "domain");
  await rename(join(domainDir, "Flow.md"), join(domainDir, "flow.md"));
  let validation = await validateBundle(root);
  assert.equal(validation.ok, false);
  assert(validation.diagnostics.some((d) => d.code === "missing-mandatory-flow" || d.code === "invalid-flow-file"));
  await rename(join(domainDir, "flow.md"), join(domainDir, "Flow.md"));

  const domainFlow = await readFile(join(domainDir, "Flow.md"), "utf8");
  await writeFile(join(domainDir, "Flow.md"), domainFlow.replace("layer: domain", "layer: frontend"));
  validation = await validateBundle(root);
  assert.equal(validation.ok, false);
  assert(validation.diagnostics.some((d) => d.code === "flow-layer-mismatch"));
});

async function snapshotTree(dir: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  async function walk(current: string): Promise<void> {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) await walk(path);
      else out.set(relative(dir, path), await readFile(path, "utf8"));
    }
  }
  await walk(dir);
  return out;
}

test("migration upgrades a 0.1 bundle to 0.3 and archives goal/progress/tasks verbatim", async (t) => {
  const root = await temporaryProject(false);
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, ".memory", "sources"), { recursive: true });
  const legacyIndex = `---\nmemory_version: "0.1"\nproject: Legacy\nactive_scope: .\nstatus: draft\ntitle: Legacy\n---\n# Project Memory\n\n- [Goal](/goal.md)\n`;
  const legacyGoal = `---\ntype: Goal\ntitle: Legacy goal\nscope: .\nstatus: draft\n---\n# Goal\n\nShip v1.\n`;
  await writeFile(join(root, ".memory", "index.md"), legacyIndex);
  await writeFile(join(root, ".memory", "goal.md"), legacyGoal);
  await writeFile(join(root, ".memory", "progress.md"), `---\ntype: Progress\nscope: .\n---\n# Progress\n`);
  await writeFile(join(root, ".memory", "tasks.md"), `---\ntype: Tasks\nscope: .\n---\n# Tasks\n`);
  await writeFile(join(root, ".memory", "log.md"), `# Log\n\n## 2026-01-01\n\n### Creation\n- **Update:** Legacy entry.\n`);
  await writeFile(join(root, ".memory", "sources", "index.md"), `# Sources\n`);

  assert.equal((await validateBundle(root)).ok, false);

  const beforeDryRun = await snapshotTree(join(root, ".memory"));
  const preview = await migrateBundle(root, { dryRun: true });
  assert(preview.archived.includes(".memory/goal.md"));
  assert.deepEqual(await snapshotTree(join(root, ".memory")), beforeDryRun, "dry-run must not write");

  const result = await migrateBundle(root);
  assert.equal(result.version, "0.3");
  assert.equal(result.validation.ok, true, JSON.stringify(result.validation.diagnostics));

  for (const removed of ["goal.md", "progress.md", "tasks.md"]) {
    assert.equal(await readIfExists(join(root, ".memory", removed)), undefined);
  }
  assert.equal(await readFile(join(root, ".memory", "archive", "legacy", "goal.md"), "utf8"), legacyGoal, "archive must be byte-identical");
  assert.equal(await readFile(join(root, ".memory", "archive", "legacy", "index.md"), "utf8"), legacyIndex);
  assert.match(await readFile(join(root, ".memory", "index.md"), "utf8"), /memory_version: "0.3"/);
  assert.equal(typeof await readFile(join(root, ".memory", "conventions.md"), "utf8"), "string");
  assert.equal(typeof await readFile(join(root, ".memory", "decisions", "index.md"), "utf8"), "string");
  const log = await readFile(join(root, ".memory", "log.md"), "utf8");
  assert.match(log, /Migrated memory 0\.1 → 0\.3/);
  assert.match(log, /Legacy entry\./, "existing history must be kept");

  const again = await migrateBundle(root);
  assert.equal(again.changes.length, 0, "migration must be idempotent");
  await assert.rejects(() => applyMemoryPlan(root, {
    approved: true,
    approvalReason: "tamper",
    operations: [{ action: "update_frontmatter", path: "archive/legacy/goal.md", values: { status: "x" } }],
  }), /read-only/);
});

test("migration rebuilds 0.2 scope agents.md into a brief and archives the original", async (t) => {
  const root = await temporaryProject(true);
  t.after(() => rm(root, { recursive: true, force: true }));
  const scope = "apps/api/src/domains/user";
  await initializeBundle(root, [scope]);
  const memory = join(root, ".memory");
  const scopeDir = join(memory, scope);

  // Recreate a 0.2 layout on top of the fresh bundle.
  await writeFile(join(memory, "index.md"), updateMarkdownFrontmatter(await readFile(join(memory, "index.md"), "utf8"), { memory_version: "0.2" }));
  await writeFile(join(memory, "tasks.md"), `---\ntype: Tasks\nscope: .\n---\n# Tasks\n\n## Active tasks (Do Now)\n1. [ ] Something\n`);
  const legacyAgents = `---\ntype: Agents\ntitle: User agents\ndescription: Combined agent instructions.\nscope: ${scope}\nstatus: active\ngovernance: hold\ngovernance_reason: Frozen for audit\n---\n# User Agents\n\n## Scope Architecture & Summary\n\nProfile service.\n\n## Goal & Requirements\n\n### Acceptance criteria\n- AC-001: Save works.\n\n## Tasks & Action Items\n\n### Active tasks (Do Now)\n1. [ ] Avatar upload\n`;
  await writeFile(join(scopeDir, "agents.md"), legacyAgents);
  await writeFile(join(scopeDir, "goal.md"), `---\ntype: Goal\nscope: ${scope}\nstatus: draft\n---\n# Goal\n`);

  const result = await migrateBundle(root);
  assert.equal(result.validation.ok, true, JSON.stringify(result.validation.diagnostics));

  assert.equal(await readFile(join(memory, "archive", "legacy", scope, "agents.md"), "utf8"), legacyAgents);
  assert.equal(typeof await readFile(join(memory, "archive", "legacy", scope, "goal.md"), "utf8"), "string");
  assert.equal(typeof await readFile(join(memory, "archive", "legacy", "tasks.md"), "utf8"), "string");
  assert.equal(await readIfExists(join(scopeDir, "goal.md")), undefined);
  assert.equal(await readIfExists(join(memory, "tasks.md")), undefined);

  const rebuilt = await readFile(join(scopeDir, "agents.md"), "utf8");
  assert.match(rebuilt, /## Map\nProfile service\./);
  assert.doesNotMatch(rebuilt, /Acceptance criteria|Active tasks/);
  const parsed = parseMarkdown(rebuilt);
  assert.equal(parsed.data.governance, "hold", "governance must survive migration");
  assert.equal(parsed.data.governance_reason, "Frozen for audit");

  // Archive is excluded from governance and search noise.
  const governance = await checkPathGovernance(root, `${scope}/profile.ts`);
  assert.equal(governance.governance, "hold");
  assert(governance.governingDocuments.every((d) => !d.path.includes("/archive/")));
});
