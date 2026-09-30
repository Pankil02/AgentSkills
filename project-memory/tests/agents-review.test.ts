import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  applyAgentsReviewPlan,
  auditAgentsInstructions,
  type AgentsReviewPlan,
} from "../src/agents-review.ts";

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

test("auditAgentsInstructions detects malformed markers and broken local links", async (t) => {
  const tmp = await mkdtemp(join(tmpdir(), "pm-test-audit-"));
  t.after(() => rm(tmp, { recursive: true, force: true }));

  const content = `# Project Directives

- Check the [missing file](does/not/exist.md) before starting.
<!-- memory:start -->
Managed block
<!-- memory:start -->
Duplicate marker!
`;
  await writeFile(join(tmp, "AGENTS.md"), content, "utf8");

  const report = await auditAgentsInstructions(tmp);
  assert.equal(report.filePresent, true);
  assert.ok(report.findings.some((f) => f.code === "malformed-markers"));
  assert.ok(report.findings.some((f) => f.code === "broken-local-link"));
});

test("applyAgentsReviewPlan applies exact byte edits with approval", async (t) => {
  const tmp = await mkdtemp(join(tmpdir(), "pm-test-apply-review-"));
  t.after(() => rm(tmp, { recursive: true, force: true }));

  const originalHuman = "# Old Directives\n\n- Rule 1: Always check tests.\n\n";
  const managed = "<!-- memory:start -->\nManaged block\n<!-- memory:end -->\n";
  const fullContent = originalHuman + managed;
  const agentsPath = join(tmp, "AGENTS.md");
  await writeFile(agentsPath, fullContent, "utf8");

  const baseSha = sha256(fullContent);

  // Edit "# Old Directives" -> "# Modern Directives"
  const startByte = 0;
  const expectedText = "# Old Directives";
  const endByte = Buffer.byteLength(expectedText, "utf8");

  const plan: AgentsReviewPlan = {
    schemaVersion: 1,
    target: "AGENTS.md",
    baseSha256: baseSha,
    edits: [
      {
        startByte,
        endByte,
        expectedText,
        replacementText: "# Modern Directives",
        reason: "Update heading to modern directives",
        evidenceFactIds: [],
      },
    ],
  };

  // Fails without approval
  await assert.rejects(
    async () => applyAgentsReviewPlan(tmp, plan, { approval: "" }),
    /approval is required/
  );

  // Succeeds with approval
  const change = await applyAgentsReviewPlan(tmp, plan, { approval: "user approved heading update" });
  assert.equal(change.action, "update");

  const updated = await readFile(agentsPath, "utf8");
  assert.ok(updated.startsWith("# Modern Directives"));
  assert.ok(updated.includes(managed));
});

test("applyAgentsReviewPlan rejects stale base hash or attempts to edit managed block", async (t) => {
  const tmp = await mkdtemp(join(tmpdir(), "pm-test-reject-review-"));
  t.after(() => rm(tmp, { recursive: true, force: true }));

  const human = "# Human rules\n\n";
  const managed = "<!-- memory:start -->\nManaged block\n<!-- memory:end -->\n";
  const full = human + managed;
  const agentsPath = join(tmp, "AGENTS.md");
  await writeFile(agentsPath, full, "utf8");

  // 1. Stale base hash
  const stalePlan: AgentsReviewPlan = {
    schemaVersion: 1,
    target: "AGENTS.md",
    baseSha256: "0000000000000000000000000000000000000000000000000000000000000000",
    edits: [],
  };
  await assert.rejects(
    async () => applyAgentsReviewPlan(tmp, stalePlan, { approval: "yes" }),
    /Stale review plan/
  );

  // 2. Attempt to edit managed block
  const startByte = Buffer.byteLength(human, "utf8");
  const editManagedPlan: AgentsReviewPlan = {
    schemaVersion: 1,
    target: "AGENTS.md",
    baseSha256: sha256(full),
    edits: [
      {
        startByte,
        endByte: startByte + 10,
        expectedText: "<!-- memor",
        replacementText: "<!-- hacked",
        reason: "try to overwrite managed block",
        evidenceFactIds: [],
      },
    ],
  };
  await assert.rejects(
    async () => applyAgentsReviewPlan(tmp, editManagedPlan, { approval: "yes" }),
    /cannot modify the managed memory block/
  );
});
