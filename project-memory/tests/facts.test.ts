import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildEntryPointCatalog,
  invalidateStaleFacts,
  serializeCatalog,
  validateCatalog,
  type EntryPointCatalog,
} from "../src/facts.ts";
import { scanRepository, deepScanRepository } from "../src/repository.ts";
import { populateFixture } from "./fixtures/entrypoints/setup-fixtures.ts";

test("validateCatalog accepts valid catalog and detects invalid properties", () => {
  const validCatalog: EntryPointCatalog = {
    schemaVersion: 1,
    generatorVersion: "2.1.0",
    architectureMode: "unconfirmed",
    projectShape: "single-package",
    facts: [
      {
        id: "fact:purpose:root",
        kind: "purpose",
        scope: ".",
        status: "observed",
        summary: "Test purpose",
        evidence: [{ path: "README.md", kind: "documentation", sha256: "abc", locator: undefined }],
        dependsOn: [],
      },
    ],
    commands: [],
    routes: [],
    inputFingerprint: "sha256:123",
    renderedHashes: {},
  };

  const res = validateCatalog(validCatalog);
  assert.equal(res.ok, true);
  assert.equal(res.errors.length, 0);

  const invalidVersion = { ...validCatalog, schemaVersion: 99 };
  assert.equal(validateCatalog(invalidVersion).ok, false);

  const invalidStatus = {
    ...validCatalog,
    facts: [{ ...validCatalog.facts[0], status: "invalid_status" }],
  };
  assert.equal(validateCatalog(invalidStatus).ok, false);
});

test("validateCatalog detects circular dependencies in facts", () => {
  const circularCatalog: EntryPointCatalog = {
    schemaVersion: 1,
    generatorVersion: "2.1.0",
    architectureMode: "unconfirmed",
    projectShape: "single-package",
    facts: [
      {
        id: "fact:a",
        kind: "purpose",
        scope: ".",
        status: "observed",
        summary: "A",
        evidence: [],
        dependsOn: ["fact:b"],
      },
      {
        id: "fact:b",
        kind: "capability",
        scope: ".",
        status: "observed",
        summary: "B",
        evidence: [],
        dependsOn: ["fact:a"],
      },
    ],
    commands: [],
    routes: [],
    inputFingerprint: "sha256:123",
    renderedHashes: {},
  };

  const res = validateCatalog(circularCatalog);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes("Circular dependency")));
});

test("serializeCatalog sorts keys, facts, commands, and routes deterministically", () => {
  const cat: EntryPointCatalog = {
    schemaVersion: 1,
    generatorVersion: "2.1.0",
    architectureMode: "unconfirmed",
    projectShape: "single-package",
    facts: [
      { id: "fact:z", kind: "purpose", scope: ".", status: "observed", summary: "Z", evidence: [], dependsOn: [] },
      { id: "fact:a", kind: "purpose", scope: ".", status: "observed", summary: "A", evidence: [], dependsOn: [] },
    ],
    commands: [
      { id: "cmd:z", scope: ".", cwd: ".", argv: ["z"], source: { path: "p", kind: "manifest", sha256: "1" }, availability: "discovered" },
      { id: "cmd:a", scope: ".", cwd: ".", argv: ["a"], source: { path: "p", kind: "manifest", sha256: "1" }, availability: "discovered" },
    ],
    routes: [],
    inputFingerprint: "fp",
    renderedHashes: { b: "2", a: "1" },
  };

  const serialized1 = serializeCatalog(cat);
  // reverse order and serialize again
  const catReversed: EntryPointCatalog = {
    ...cat,
    facts: [cat.facts[1], cat.facts[0]],
    commands: [cat.commands[1], cat.commands[0]],
    renderedHashes: { a: "1", b: "2" },
  };
  const serialized2 = serializeCatalog(catReversed);

  assert.equal(serialized1, serialized2);
  const parsed = JSON.parse(serialized1);
  assert.equal(parsed.facts[0].id, "fact:a");
  assert.equal(parsed.commands[0].id, "cmd:a");
});

test("buildEntryPointCatalog accurately extracts facts and commands from fixtures", async (t) => {
  const tmp = await mkdtemp(join(tmpdir(), "pm-test-facts-"));
  t.after(() => rm(tmp, { recursive: true, force: true }));

  // 1. Single package
  const singleRoot = await populateFixture(tmp, "single-package");
  const singleScan = await scanRepository(singleRoot);
  const singleDeep = await deepScanRepository(singleRoot, singleScan);
  const singleCatalog = await buildEntryPointCatalog(singleRoot, singleScan, singleDeep);

  assert.equal(singleCatalog.projectShape, "single-package");
  assert.ok(singleCatalog.commands.some((c) => c.id === "cmd:root:test" && c.argv.join(" ") === "npm test"));
  assert.ok(singleCatalog.facts.some((f) => f.id === "fact:purpose:root"));

  // 2. Workspace monorepo
  const monoRoot = await populateFixture(tmp, "workspace-monorepo");
  const monoScan = await scanRepository(monoRoot);
  const monoDeep = await deepScanRepository(monoRoot, monoScan);
  const monoCatalog = await buildEntryPointCatalog(monoRoot, monoScan, monoDeep);

  assert.equal(monoCatalog.projectShape, "workspace");
  assert.equal(monoCatalog.facts.filter((f) => f.kind === "scope").length, 3);
  assert.ok(monoCatalog.commands.some((c) => c.scope === "apps/api"));

  // 3. Python package
  const pyRoot = await populateFixture(tmp, "python-package");
  const pyScan = await scanRepository(pyRoot);
  const pyDeep = await deepScanRepository(pyRoot, pyScan);
  const pyCatalog = await buildEntryPointCatalog(pyRoot, pyScan, pyDeep);

  assert.ok(pyCatalog.commands.some((c) => c.id === "cmd:root:pytest" && c.argv[0] === "pytest"));

  // 4. Go module
  const goRoot = await populateFixture(tmp, "go-module");
  const goScan = await scanRepository(goRoot);
  const goDeep = await deepScanRepository(goRoot, goScan);
  const goCatalog = await buildEntryPointCatalog(goRoot, goScan, goDeep);

  assert.ok(goCatalog.commands.some((c) => c.id === "cmd:root:gotest" && c.argv[0] === "go"));
});

test("invalidateStaleFacts propagates staleness to dependent facts", () => {
  const catalog: EntryPointCatalog = {
    schemaVersion: 1,
    generatorVersion: "2.1.0",
    architectureMode: "unconfirmed",
    projectShape: "single-package",
    facts: [
      {
        id: "fact:source:pkg",
        kind: "capability",
        scope: ".",
        status: "observed",
        summary: "Package file",
        evidence: [{ path: "package.json", kind: "manifest", sha256: "abc" }],
        dependsOn: [],
      },
      {
        id: "fact:derived:cmd",
        kind: "command",
        scope: ".",
        status: "observed",
        summary: "Derived test command",
        evidence: [],
        dependsOn: ["fact:source:pkg"],
      },
      {
        id: "fact:independent",
        kind: "purpose",
        scope: ".",
        status: "approved",
        summary: "Approved purpose",
        evidence: [{ path: "README.md", kind: "documentation", sha256: "def" }],
        dependsOn: [],
      },
    ],
    commands: [],
    routes: [],
    inputFingerprint: "sha256:1",
    renderedHashes: {},
  };

  const changed = new Set(["package.json"]);
  const { catalog: updated, staleFactIds } = invalidateStaleFacts(catalog, changed);

  assert.ok(staleFactIds.includes("fact:source:pkg"));
  assert.ok(staleFactIds.includes("fact:derived:cmd"));
  assert.ok(!staleFactIds.includes("fact:independent"));

  const pkgFact = updated.facts.find((f) => f.id === "fact:source:pkg");
  const cmdFact = updated.facts.find((f) => f.id === "fact:derived:cmd");
  const indepFact = updated.facts.find((f) => f.id === "fact:independent");

  assert.equal(pkgFact?.status, "stale");
  assert.equal(cmdFact?.status, "stale");
  assert.equal(indepFact?.status, "approved");
});
