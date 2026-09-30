import assert from "node:assert/strict";
import test from "node:test";
import {
  assembleContextFallback,
  projectEntryPoints,
  renderAgentsBlock,
  renderRootIndex,
  AGENTS_START_MARKER,
  AGENTS_END_MARKER,
} from "../src/entrypoints.ts";
import { type EntryPointCatalog, type NavigationFact } from "../src/facts.ts";

test("projectEntryPoints derives consistent orientation and scope models", () => {
  const catalog: EntryPointCatalog = {
    schemaVersion: 1,
    generatorVersion: "2.1.0",
    architectureMode: "unconfirmed",
    projectShape: "single-package",
    facts: [
      { id: "fact:purpose:root", kind: "purpose", scope: ".", status: "observed", summary: "A sample library", evidence: [], dependsOn: [] },
      { id: "fact:capability:shape", kind: "capability", scope: ".", status: "observed", summary: "Single package repository", evidence: [], dependsOn: [] },
    ],
    commands: [{ id: "cmd:1", scope: ".", cwd: ".", argv: ["npm", "test"], source: { path: "package.json", kind: "manifest", sha256: "1" }, availability: "discovered" }],
    routes: [{ id: "route:1", intents: ["test"], scope: ".", startPaths: ["src/index.ts"], instructionPaths: [".memory/conventions.md"], verificationCommandIds: ["cmd:1"], factIds: [], confidence: "direct" }],
    inputFingerprint: "sha256:abc",
    renderedHashes: {},
  };

  const projection = projectEntryPoints(catalog, "sample-repo");
  assert.equal(projection.projectName, "sample-repo");
  assert.ok(projection.orientation.includes("A sample library"));
  assert.ok(projection.orientation.includes("Single package repository"));

  const agentsBlock = renderAgentsBlock(projection);
  assert.ok(agentsBlock.startsWith(AGENTS_START_MARKER));
  assert.ok(agentsBlock.endsWith(AGENTS_END_MARKER));
  assert.ok(agentsBlock.includes("A sample library"));
  assert.ok(agentsBlock.includes("Single package repository"));
  assert.ok(agentsBlock.includes("memory check --for-path <file>"));

  const indexMd = renderRootIndex(projection);
  assert.ok(indexMd.includes("# sample-repo memory"));
  assert.ok(indexMd.includes("A sample library"));
  assert.ok(indexMd.includes("Single package repository"));
  assert.ok(indexMd.includes("[Conventions](./conventions.md)"));
});

test("renderAgentsBlock and renderRootIndex respect byte budgets without truncating mandatory rules", () => {
  // Create 100 scopes
  const facts: NavigationFact[] = [
    { id: "fact:purpose:root", kind: "purpose" as const, scope: ".", status: "observed" as const, summary: "Large project", evidence: [], dependsOn: [] },
    { id: "fact:capability:shape", kind: "capability" as const, scope: ".", status: "observed" as const, summary: "Workspace monorepo", evidence: [], dependsOn: [] },
  ];
  for (let i = 0; i < 100; i++) {
    facts.push({
      id: `fact:scope:packages/pkg-${i}`,
      kind: "scope" as const,
      scope: `packages/pkg-${i}`,
      status: "observed" as const,
      summary: `Package number ${i} with long description to test budget constraints`,
      evidence: [],
      dependsOn: [],
    });
  }

  const catalog: EntryPointCatalog = {
    schemaVersion: 1,
    generatorVersion: "2.1.0",
    architectureMode: "unconfirmed",
    projectShape: "workspace",
    facts,
    commands: [],
    routes: [],
    inputFingerprint: "sha256:xyz",
    renderedHashes: {},
  };

  const projection = projectEntryPoints(catalog, "large-mono");

  // Default budget 6000 bytes
  const agentsBlock = renderAgentsBlock(projection, 6000);
  const blockBytes = Buffer.byteLength(agentsBlock, "utf8");
  assert.ok(blockBytes <= 6000);
  assert.ok(agentsBlock.includes(AGENTS_START_MARKER));
  assert.ok(agentsBlock.includes(AGENTS_END_MARKER));
  assert.ok(agentsBlock.includes("memory check --for-path <file>"));
  assert.ok(agentsBlock.includes("… and 95 more: run `memory route --for-path <path>`"));

  const indexMd = renderRootIndex(projection, 6000);
  const indexBytes = Buffer.byteLength(indexMd, "utf8");
  assert.ok(indexBytes <= 6000);
  assert.ok(indexMd.includes("… and 95 more: `memory route --for-path <path>`"));
  assert.ok(indexMd.includes("[Conventions](./conventions.md)"));

  // Even with a very tight budget (e.g. 1500 bytes), mandatory rules remain intact
  const tightBlock = renderAgentsBlock(projection, 1500);
  assert.ok(Buffer.byteLength(tightBlock, "utf8") <= 1500);
  assert.ok(tightBlock.includes(AGENTS_START_MARKER));
  assert.ok(tightBlock.includes(AGENTS_END_MARKER));
  assert.ok(tightBlock.includes("memory check --for-path <file>"));
});

test("assembleContextFallback retains mandatory rules", () => {
  const projection = {
    projectName: "test-proj",
    architectureMode: "unconfirmed",
    projectShape: "single-package" as const,
    orientation: ["Test"],
    freshnessWarnings: [],
    topScopes: [],
    taskRoutes: [],
    commands: [],
    applicableMemoryRoutes: [],
  };

  const fallback = assembleContextFallback(projection, "Budget overflow");
  assert.ok(fallback.includes("Mandatory Operating Instructions"));
  assert.ok(fallback.includes("memory check --for-path <file>"));
  assert.ok(fallback.includes("Budget overflow"));
});
