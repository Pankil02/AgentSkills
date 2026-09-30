import assert from "node:assert/strict";
import test from "node:test";
import { findRoute } from "../src/routing.ts";
import { type EntryPointCatalog } from "../src/facts.ts";

const sampleCatalog: EntryPointCatalog = {
  schemaVersion: 1,
  generatorVersion: "2.1.0",
  architectureMode: "unconfirmed",
  projectShape: "workspace",
  facts: [
    { id: "fact:purpose:root", kind: "purpose", scope: ".", status: "observed", summary: "Mono repo", evidence: [], dependsOn: [] },
    { id: "fact:scope:apps/api", kind: "scope", scope: "apps/api", status: "observed", summary: "Backend API", evidence: [], dependsOn: [] },
    { id: "fact:scope:apps/web", kind: "scope", scope: "apps/web", status: "observed", summary: "Frontend Web", evidence: [], dependsOn: [] },
  ],
  commands: [
    { id: "cmd:root:test", scope: ".", cwd: ".", argv: ["npm", "test"], source: { path: "package.json", kind: "manifest", sha256: "1" }, availability: "discovered" },
    { id: "cmd:api:test", scope: "apps/api", cwd: "apps/api", argv: ["vitest", "run"], source: { path: "apps/api/package.json", kind: "manifest", sha256: "2" }, availability: "discovered" },
  ],
  routes: [
    { id: "route:api", intents: ["api", "server", "backend"], scope: "apps/api", startPaths: ["apps/api/src/server.ts"], instructionPaths: [".memory/apps/api/agents.md"], verificationCommandIds: ["cmd:api:test"], factIds: [], confidence: "direct" },
  ],
  inputFingerprint: "sha256:1",
  renderedHashes: {},
};

test("findRoute with path returns deepest matching scope and governing documents", () => {
  const res = findRoute(sampleCatalog, { path: "apps/api/src/routes/user.ts" });
  assert.equal(res.matches.length, 1);
  assert.equal(res.matches[0].scope, "apps/api");
  assert.equal(res.matches[0].confidence, "direct");
  assert.ok(res.matches[0].governingDocuments.includes(".memory/apps/api/agents.md"));
  assert.ok(res.matches[0].governingDocuments.includes(".memory/conventions.md"));
  assert.equal(res.matches[0].verificationCommands[0].argv.join(" "), "vitest run");
});

test("findRoute with prospective non-existent path maps correctly to scope", () => {
  const res = findRoute(sampleCatalog, { path: "apps/web/new-feature/page.tsx" });
  assert.equal(res.matches[0].scope, "apps/web");
  assert.ok(res.matches[0].governingDocuments.includes(".memory/apps/web/agents.md"));
});

test("findRoute with task query performs intent matching and keyword matching", () => {
  const res = findRoute(sampleCatalog, { task: "fix server crash in backend" });
  assert.ok(res.matches.length >= 1);
  assert.equal(res.matches[0].scope, "apps/api");
  assert.equal(res.matches[0].confidence, "direct");
  assert.ok(res.matches[0].startPaths.includes("apps/api/src/server.ts"));
});

test("findRoute with unrecognized task returns fallback without invented certainty", () => {
  const res = findRoute(sampleCatalog, { task: "quantum teleportation protocol" });
  assert.ok(res.matches.length >= 1);
  assert.equal(res.matches[0].confidence, "unconfirmed");
  assert.ok(res.fallback);
  assert.ok(res.fallback.command.includes("memory search"));
});
