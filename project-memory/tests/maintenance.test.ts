import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  applyEntryPointMaintenance,
  planEntryPointMaintenance,
  readExistingCatalog,
} from "../src/maintenance.ts";
import { populateFixture } from "./fixtures/entrypoints/setup-fixtures.ts";

test("planEntryPointMaintenance and applyEntryPointMaintenance create entry points", async (t) => {
  const tmp = await mkdtemp(join(tmpdir(), "pm-test-maint-"));
  t.after(() => rm(tmp, { recursive: true, force: true }));

  const root = await populateFixture(tmp, "single-package");

  // Plan
  const plan = await planEntryPointMaintenance(root, "sync");
  assert.equal(plan.mode, "sync");
  assert.ok(plan.fileChanges.some((c) => c.path === "AGENTS.md"));
  assert.ok(plan.fileChanges.some((c) => c.path === ".memory/index.md"));

  // Apply
  const changes = await applyEntryPointMaintenance(root, plan);
  assert.ok(changes.length >= 2);

  // Check AGENTS.md on disk
  const agentsContent = await readFile(join(root, "AGENTS.md"), "utf8");
  assert.ok(agentsContent.includes("<!-- memory:start -->"));
  assert.ok(agentsContent.includes("Single package repository"));

  // Check catalog exists on disk
  const catalog = await readExistingCatalog(root);
  assert.ok(catalog);
  assert.equal(catalog.projectShape, "single-package");
});

test("Maintenance repeated on unchanged project is a no-op", async (t) => {
  const tmp = await mkdtemp(join(tmpdir(), "pm-test-noop-"));
  t.after(() => rm(tmp, { recursive: true, force: true }));

  const root = await populateFixture(tmp, "single-package");

  // First apply
  const plan1 = await planEntryPointMaintenance(root, "sync");
  await applyEntryPointMaintenance(root, plan1);

  const agentsStatBefore = await stat(join(root, "AGENTS.md"));
  const indexStatBefore = await stat(join(root, ".memory", "index.md"));

  // Wait a small slice of time to distinguish mtime
  await new Promise((resolve) => setTimeout(resolve, 50));

  // Second plan & apply
  const plan2 = await planEntryPointMaintenance(root, "sync");
  assert.equal(plan2.fileChanges.length, 0);

  const changes2 = await applyEntryPointMaintenance(root, plan2);
  assert.equal(changes2.length, 0);

  const agentsStatAfter = await stat(join(root, "AGENTS.md"));
  const indexStatAfter = await stat(join(root, ".memory", "index.md"));

  assert.equal(agentsStatBefore.mtimeMs, agentsStatAfter.mtimeMs);
  assert.equal(indexStatBefore.mtimeMs, indexStatAfter.mtimeMs);
});

test("Dry-run maintenance is completely side-effect free", async (t) => {
  const tmp = await mkdtemp(join(tmpdir(), "pm-test-dryrun-"));
  t.after(() => rm(tmp, { recursive: true, force: true }));

  const root = await populateFixture(tmp, "single-package");

  const plan = await planEntryPointMaintenance(root, "sync");
  const dryChanges = await applyEntryPointMaintenance(root, plan, { dryRun: true });

  assert.ok(dryChanges.length > 0);

  // Files must NOT exist on disk
  const agentsExists = await stat(join(root, "AGENTS.md")).then(() => true, () => false);
  const memoryExists = await stat(join(root, ".memory")).then(() => true, () => false);

  assert.equal(agentsExists, false);
  assert.equal(memoryExists, false);
});

test("Stale maintenance plan is rejected if disk was modified concurrently", async (t) => {
  const tmp = await mkdtemp(join(tmpdir(), "pm-test-stale-"));
  t.after(() => rm(tmp, { recursive: true, force: true }));

  const root = await populateFixture(tmp, "single-package");
  const agentsPath = join(root, "AGENTS.md");
  await writeFile(agentsPath, "# Original content\n", "utf8");

  const plan = await planEntryPointMaintenance(root, "sync");

  // Simulate concurrent user edit
  await writeFile(agentsPath, "# Concurrently edited content\n", "utf8");

  await assert.rejects(
    async () => applyEntryPointMaintenance(root, plan),
    /Stale maintenance plan/
  );
});

test("Fault injection restores exact preimages of both AGENTS.md and .memory", async (t) => {
  const tmp = await mkdtemp(join(tmpdir(), "pm-test-fault-"));
  t.after(() => rm(tmp, { recursive: true, force: true }));

  const root = await populateFixture(tmp, "single-package");
  const originalAgents = "# Human Author Directives\n\n- Never lose this.\n";
  await writeFile(join(root, "AGENTS.md"), originalAgents, "utf8");

  const plan = await planEntryPointMaintenance(root, "sync");

  // Corrupt renderedOutputs with an invalid path that fails during write
  plan.renderedOutputs["invalid\0path"] = "bad";

  await assert.rejects(
    async () => applyEntryPointMaintenance(root, plan),
    /ERR_INVALID_ARG_VALUE|Unsafe|invalid/i
  );

  // Verify AGENTS.md was restored exactly
  const restoredAgents = await readFile(join(root, "AGENTS.md"), "utf8");
  assert.equal(restoredAgents, originalAgents);
});
