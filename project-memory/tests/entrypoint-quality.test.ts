import assert from "node:assert/strict";
import test from "node:test";
import { evaluateEntryPointQuality } from "../src/entrypoint-quality.ts";
import { type EntryPointCatalog } from "../src/facts.ts";

test("evaluateEntryPointQuality produces valid score across all rubric categories", () => {
  const catalog: EntryPointCatalog = {
    schemaVersion: 1,
    generatorVersion: "2.1.0",
    architectureMode: "unconfirmed",
    projectShape: "single-package",
    facts: [
      { id: "fact:purpose:root", kind: "purpose", scope: ".", status: "observed", summary: "Valid project", evidence: [{ path: "README.md", kind: "documentation", sha256: "abc" }], dependsOn: [] },
      { id: "fact:capability:shape", kind: "capability", scope: ".", status: "observed", summary: "Single package repository", evidence: [], dependsOn: [] },
    ],
    commands: [
      { id: "cmd:root:test", scope: ".", cwd: ".", argv: ["npm", "test"], source: { path: "package.json", kind: "manifest", sha256: "abc" }, availability: "discovered" },
    ],
    routes: [
      { id: "route:root:general", intents: ["general"], scope: ".", startPaths: ["src/index.ts"], instructionPaths: [".memory/conventions.md"], verificationCommandIds: ["cmd:root:test"], factIds: [], confidence: "direct" },
    ],
    inputFingerprint: "sha256:123",
    renderedHashes: {},
  };

  const report = evaluateEntryPointQuality(catalog, {
    agentsContent: "<!-- memory:start -->\nValid content\n<!-- memory:end -->",
    indexContent: "# Title\n\nContent\n",
  });

  assert.equal(report.max, 100);
  assert.ok(report.score >= 90);
  assert.equal(report.passedSafetyGates, true);
  assert.equal(report.safetyViolations.length, 0);
  assert.equal(report.categories.orientation.score, 10);
  assert.equal(report.categories.scopeOwnership.score, 20);
  assert.equal(report.categories.taskRouting.score, 25);
  assert.equal(report.categories.verificationRouting.score, 15);
  assert.equal(report.categories.freshnessProvenance.score, 15);
  assert.equal(report.categories.contextEconomy.score, 10);
  assert.equal(report.categories.semanticClarity.score, 5);
});

test("evaluateEntryPointQuality fails safety gate on malformed AGENTS markers", () => {
  const catalog: EntryPointCatalog = {
    schemaVersion: 1,
    generatorVersion: "2.1.0",
    architectureMode: "unconfirmed",
    projectShape: "single-package",
    facts: [],
    commands: [],
    routes: [],
    inputFingerprint: "sha256:1",
    renderedHashes: {},
  };

  const report = evaluateEntryPointQuality(catalog, {
    agentsContent: "<!-- memory:start -->\nMissing end marker!",
  });

  assert.equal(report.passedSafetyGates, false);
  assert.ok(report.safetyViolations.some((v) => v.includes("marker mismatch")));
});
