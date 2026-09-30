import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { populateFixture } from "./fixtures/entrypoints/setup-fixtures.ts";
import { deepScanRepository, scanRepository } from "../src/repository.ts";
import { syncAgentsFile } from "../src/bundle.ts";

test("Phase 1 regression: single-package vs workspace classification", async (t) => {
  const tmp = await mkdtemp(join(tmpdir(), "pm-test-shape-"));
  t.after(() => rm(tmp, { recursive: true, force: true }));

  const singleRoot = await populateFixture(tmp, "single-package");
  const singleScan = await scanRepository(singleRoot);
  const singleDeep = await deepScanRepository(singleRoot, singleScan);

  assert.equal(singleDeep.techStack.monorepo, undefined);
  assert.equal(singleDeep.architecture.packages.length, 0);

  const monoRoot = await populateFixture(tmp, "workspace-monorepo");
  const monoScan = await scanRepository(monoRoot);
  const monoDeep = await deepScanRepository(monoRoot, monoScan);

  assert.equal(monoDeep.techStack.monorepo, "Turborepo");
  assert.equal(monoDeep.architecture.packages.length, 3);
});

test("Phase 1 regression: nested example packages are not mistaken for workspace packages", async (t) => {
  const tmp = await mkdtemp(join(tmpdir(), "pm-test-nested-"));
  t.after(() => rm(tmp, { recursive: true, force: true }));

  const root = await populateFixture(tmp, "duplicate-roots-nested");
  const scan = await scanRepository(root);
  const deep = await deepScanRepository(root, scan);

  // Root does not declare workspaces; examples/nested-sample must not cause monorepo classification
  assert.equal(deep.techStack.monorepo, undefined);
});

test("Phase 1 regression: AGENTS.md managed block preserves prefix and suffix bytes", async (t) => {
  const tmp = await mkdtemp(join(tmpdir(), "pm-test-agents-"));
  t.after(() => rm(tmp, { recursive: true, force: true }));

  const prefix = "# Human Directives\n\n- Do not change this line under any circumstances.\n\n";
  const suffix = "\n\n# User Footer Notes\n\n- Keep this preserved exactly.\n";
  const initialContent = `${prefix}<!-- memory:start -->\nOld generated block\n<!-- memory:end -->${suffix}`;

  const agentsPath = join(tmp, "AGENTS.md");
  await writeFile(agentsPath, initialContent, "utf8");

  await syncAgentsFile(tmp);

  const readBack = await readFile(agentsPath, "utf8");
  assert.ok(readBack.startsWith(prefix));
  assert.ok(readBack.endsWith(suffix));
});

test("Phase 1 regression: malformed markers in AGENTS.md are rejected without mutation", async (t) => {
  const tmp = await mkdtemp(join(tmpdir(), "pm-test-malformed-"));
  t.after(() => rm(tmp, { recursive: true, force: true }));

  const malformedContent = `# Human Directives\n\n<!-- memory:start -->\nOnly start marker, missing end!`;
  const agentsPath = join(tmp, "AGENTS.md");
  await writeFile(agentsPath, malformedContent, "utf8");

  await assert.rejects(
    async () => syncAgentsFile(tmp),
    /markers/i
  );

  const content = await readFile(agentsPath, "utf8");
  assert.equal(content, malformedContent);
});

test("Phase 1 regression: dryRun performs zero filesystem mutations", async (t) => {
  const tmp = await mkdtemp(join(tmpdir(), "pm-test-dryrun-"));
  t.after(() => rm(tmp, { recursive: true, force: true }));

  const singleRoot = await populateFixture(tmp, "single-package");
  const change = await syncAgentsFile(singleRoot, { dryRun: true });

  assert.ok(change);
  // AGENTS.md must NOT exist on disk after dryRun on an empty repo
  const exists = await stat(join(singleRoot, "AGENTS.md")).then(() => true, () => false);
  assert.equal(exists, false);
});
