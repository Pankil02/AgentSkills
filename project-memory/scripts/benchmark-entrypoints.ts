import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FIXTURE_DEFINITIONS, populateFixture } from "../tests/fixtures/entrypoints/setup-fixtures.ts";
import { evaluateEntryPointQuality } from "../src/entrypoint-quality.ts";
import { planEntryPointMaintenance } from "../src/maintenance.ts";
import { findRoute } from "../src/routing.ts";

interface Probe {
  fixture: string;
  query: { task?: string; path?: string };
  expectedScope: string;
  expectedFile?: string;
  expectedCmdPart?: string;
}

const PROBES: Probe[] = [
  // 1. single-package (5 probes)
  { fixture: "single-package", query: { task: "run tests" }, expectedScope: ".", expectedCmdPart: "test" },
  { fixture: "single-package", query: { task: "build project" }, expectedScope: ".", expectedCmdPart: "build" },
  { fixture: "single-package", query: { path: "src/index.ts" }, expectedScope: "." },
  { fixture: "single-package", query: { path: "tests/index.test.ts" }, expectedScope: "." },
  { fixture: "single-package", query: { task: "add greeting helper" }, expectedScope: "." },

  // 2. workspace-monorepo (12 cross-boundary probes)
  { fixture: "workspace-monorepo", query: { task: "api server" }, expectedScope: "apps/api" },
  { fixture: "workspace-monorepo", query: { path: "apps/api/src/server.ts" }, expectedScope: "apps/api" },
  { fixture: "workspace-monorepo", query: { task: "web frontend ui" }, expectedScope: "apps/web" },
  { fixture: "workspace-monorepo", query: { path: "apps/web/src/app/page.tsx" }, expectedScope: "apps/web" },
  { fixture: "workspace-monorepo", query: { task: "shared utilities constants" }, expectedScope: "packages/shared" },
  { fixture: "workspace-monorepo", query: { path: "packages/shared/src/index.ts" }, expectedScope: "packages/shared" },
  { fixture: "workspace-monorepo", query: { task: "test api service" }, expectedScope: "apps/api", expectedCmdPart: "vitest" },
  { fixture: "workspace-monorepo", query: { task: "test web application" }, expectedScope: "apps/web", expectedCmdPart: "playwright" },
  { fixture: "workspace-monorepo", query: { task: "test shared package" }, expectedScope: "packages/shared", expectedCmdPart: "vitest" },
  { fixture: "workspace-monorepo", query: { path: "apps/api/package.json" }, expectedScope: "apps/api" },
  { fixture: "workspace-monorepo", query: { path: "apps/web/package.json" }, expectedScope: "apps/web" },
  { fixture: "workspace-monorepo", query: { path: "packages/shared/package.json" }, expectedScope: "packages/shared" },

  // 3. duplicate-roots-nested (5 probes)
  { fixture: "duplicate-roots-nested", query: { task: "run main tests" }, expectedScope: ".", expectedCmdPart: "vitest" },
  { fixture: "duplicate-roots-nested", query: { path: "src/index.ts" }, expectedScope: "." },
  { fixture: "duplicate-roots-nested", query: { path: "examples/nested-sample/demo.ts" }, expectedScope: "." },
  { fixture: "duplicate-roots-nested", query: { task: "update library entry" }, expectedScope: "." },
  { fixture: "duplicate-roots-nested", query: { task: "inspect demo sample" }, expectedScope: "." },

  // 4. python-package (5 probes)
  { fixture: "python-package", query: { task: "process data logic" }, expectedScope: "." },
  { fixture: "python-package", query: { path: "src/processor/core.py" }, expectedScope: "." },
  { fixture: "python-package", query: { task: "run pytest" }, expectedScope: ".", expectedCmdPart: "pytest" },
  { fixture: "python-package", query: { path: "tests/test_core.py" }, expectedScope: "." },
  { fixture: "python-package", query: { task: "update dependencies" }, expectedScope: "." },

  // 5. go-module (5 probes)
  { fixture: "go-module", query: { task: "auth verify" }, expectedScope: "." },
  { fixture: "go-module", query: { path: "cmd/server/main.go" }, expectedScope: "." },
  { fixture: "go-module", query: { path: "pkg/auth/auth_test.go" }, expectedScope: "." },
  { fixture: "go-module", query: { task: "run go tests" }, expectedScope: ".", expectedCmdPart: "test" },
  { fixture: "go-module", query: { task: "server entrypoint" }, expectedScope: "." },

  // 6. rust-workspace (5 probes)
  { fixture: "rust-workspace", query: { task: "cli executable binary" }, expectedScope: "crates/cli" },
  { fixture: "rust-workspace", query: { path: "crates/cli/src/main.rs" }, expectedScope: "crates/cli" },
  { fixture: "rust-workspace", query: { task: "core library logic" }, expectedScope: "crates/core" },
  { fixture: "rust-workspace", query: { path: "crates/core/src/lib.rs" }, expectedScope: "crates/core" },
  { fixture: "rust-workspace", query: { task: "run cargo test" }, expectedScope: "." },

  // 7. mixed-language (5 probes)
  { fixture: "mixed-language", query: { task: "backend python api" }, expectedScope: "backend" },
  { fixture: "mixed-language", query: { path: "backend/app.py" }, expectedScope: "backend" },
  { fixture: "mixed-language", query: { task: "frontend javascript ui" }, expectedScope: "frontend" },
  { fixture: "mixed-language", query: { path: "frontend/src/main.js" }, expectedScope: "frontend" },
  { fixture: "mixed-language", query: { task: "make test build" }, expectedScope: "." },

  // 8. docs-only (5 probes)
  { fixture: "docs-only", query: { task: "read guide" }, expectedScope: "." },
  { fixture: "docs-only", query: { path: "docs/index.md" }, expectedScope: "." },
  { fixture: "docs-only", query: { path: "mkdocs.yml" }, expectedScope: "." },
  { fixture: "docs-only", query: { task: "knowledge base index" }, expectedScope: "." },
  { fixture: "docs-only", query: { task: "documentation navigation" }, expectedScope: "." },

  // 9. empty-repo (5 probes)
  { fixture: "empty-repo", query: { task: "read readme" }, expectedScope: "." },
  { fixture: "empty-repo", query: { path: "README.md" }, expectedScope: "." },
  { fixture: "empty-repo", query: { task: "initialize repository" }, expectedScope: "." },
  { fixture: "empty-repo", query: { task: "add first file" }, expectedScope: "." },
  { fixture: "empty-repo", query: { task: "check repo structure" }, expectedScope: "." },

  // 10. unsupported-language (5 probes)
  { fixture: "unsupported-language", query: { task: "zig main function" }, expectedScope: "." },
  { fixture: "unsupported-language", query: { path: "src/main.zig" }, expectedScope: "." },
  { fixture: "unsupported-language", query: { path: "src/math.zig" }, expectedScope: "." },
  { fixture: "unsupported-language", query: { task: "math add implementation" }, expectedScope: "." },
  { fixture: "unsupported-language", query: { task: "build zig" }, expectedScope: "." },
];

async function runBenchmark() {
  console.log("================================================================================");
  console.log("  AgentSkills project-memory Entry-Point Quality & Routing Benchmark");
  console.log("================================================================================\n");

  const tmpBase = await mkdtemp(join(tmpdir(), "pm-benchmark-"));

  const fixtureNames = Object.keys(FIXTURE_DEFINITIONS);
  const results: Array<{
    name: string;
    shape: string;
    qualityScore: number;
    safetyViolations: number;
    agentsBytes: number;
    indexBytes: number;
    top1Count: number;
    top3Count: number;
    totalProbes: number;
    avgLatencyMs: number;
  }> = [];

  let totalTop1 = 0;
  let totalTop3 = 0;
  let totalProbesCount = 0;
  let allLatencies: number[] = [];
  let totalSafetyViolations = 0;
  let totalQualityScore = 0;

  try {
    for (const fixtureName of fixtureNames) {
      const fixtureRoot = await populateFixture(tmpBase, fixtureName);

      // Measure maintenance plan latency
      const planStart = performance.now();
      const plan = await planEntryPointMaintenance(fixtureRoot, "sync");
      const _planDuration = performance.now() - planStart;

      const agentsOutput = plan.renderedOutputs["AGENTS.md"] || "";
      const indexOutput = plan.renderedOutputs[".memory/index.md"] || "";

      // Quality evaluation
      const quality = evaluateEntryPointQuality(plan.catalog, {
        agentsContent: agentsOutput,
        indexContent: indexOutput,
      });

      const agentsBytes = Buffer.byteLength(agentsOutput, "utf8");
      const indexBytes = Buffer.byteLength(indexOutput, "utf8");

      // Filter probes for this fixture
      const fixtureProbes = PROBES.filter((p) => p.fixture === fixtureName);
      let top1 = 0;
      let top3 = 0;
      const fixtureLatencies: number[] = [];

      for (const probe of fixtureProbes) {
        const routeStart = performance.now();
        const route = findRoute(plan.catalog, probe.query);
        const routeDuration = performance.now() - routeStart;
        fixtureLatencies.push(routeDuration);
        allLatencies.push(routeDuration);

        const topScope = route.matches[0]?.scope;
        const inTop3 = route.matches.slice(0, 3).some((s) => s.scope === probe.expectedScope);

        if (topScope === probe.expectedScope) {
          top1++;
        }
        if (inTop3) {
          top3++;
        }
      }

      totalTop1 += top1;
      totalTop3 += top3;
      totalProbesCount += fixtureProbes.length;
      totalSafetyViolations += quality.safetyViolations.length;
      totalQualityScore += quality.score;

      const avgLatency = fixtureLatencies.length
        ? fixtureLatencies.reduce((a, b) => a + b, 0) / fixtureLatencies.length
        : 0;

      results.push({
        name: fixtureName,
        shape: plan.catalog.projectShape,
        qualityScore: quality.score,
        safetyViolations: quality.safetyViolations.length,
        agentsBytes,
        indexBytes,
        top1Count: top1,
        top3Count: top3,
        totalProbes: fixtureProbes.length,
        avgLatencyMs: avgLatency,
      });
    }
  } finally {
    await rm(tmpBase, { recursive: true, force: true });
  }

  // Print Results Table
  console.log(
    "| Fixture Family            | Shape          | Quality | Safety | AGENTS.md | .memory | Top-1 Recall | Top-3 Recall | Route Latency |"
  );
  console.log(
    "|:--------------------------|:---------------|:-------:|:------:|:---------:|:-------:|:------------:|:------------:|:-------------:|"
  );

  for (const r of results) {
    const top1Rate = `${r.top1Count}/${r.totalProbes} (${Math.round((r.top1Count / r.totalProbes) * 100)}%)`;
    const top3Rate = `${r.top3Count}/${r.totalProbes} (${Math.round((r.top3Count / r.totalProbes) * 100)}%)`;
    const safetyStr = r.safetyViolations === 0 ? "PASS" : `FAIL(${r.safetyViolations})`;
    console.log(
      `| ${r.name.padEnd(25)} | ${r.shape.padEnd(14)} | ${String(r.qualityScore).padStart(5)}/100 | ${safetyStr.padEnd(6)} | ${String(r.agentsBytes).padStart(7)} B | ${String(r.indexBytes).padStart(5)} B | ${top1Rate.padStart(12)} | ${top3Rate.padStart(12)} | ${r.avgLatencyMs.toFixed(2).padStart(11)} ms |`
    );
  }

  const avgQuality = totalQualityScore / results.length;
  const overallTop1Rate = (totalTop1 / totalProbesCount) * 100;
  const overallTop3Rate = (totalTop3 / totalProbesCount) * 100;
  const p95Latency = allLatencies.sort((a, b) => a - b)[Math.floor(allLatencies.length * 0.95)] || 0;

  console.log("\n================================================================================");
  console.log("  Benchmark Summary & Compliance Gates");
  console.log("================================================================================");
  console.log(`Total Test Fixtures evaluated:    ${results.length}`);
  console.log(`Total Probes evaluated:           ${totalProbesCount}`);
  console.log(`Average Fixture Quality Score:    ${avgQuality.toFixed(1)} / 100  (Target: >= 99.0)`);
  console.log(`Top-1 Scope Routing Accuracy:     ${overallTop1Rate.toFixed(1)}%     (Target: >= 95.0%)`);
  console.log(`Top-3 Scope Routing Accuracy:     ${overallTop3Rate.toFixed(1)}%    (Target: 100.0%)`);
  console.log(`P95 Route Lookup Latency:         ${p95Latency.toFixed(3)} ms      (Target: < 100 ms)`);
  console.log(`Safety Violations:                ${totalSafetyViolations}             (Target: 0)`);
  console.log("================================================================================\n");

  const qualityPassed = avgQuality >= 99.0;
  const safetyPassed = totalSafetyViolations === 0;
  const routingPassed = overallTop1Rate >= 95.0 && overallTop3Rate === 100.0;

  if (qualityPassed && safetyPassed && routingPassed) {
    console.log(" [SUCCESS] All entry-point quality, routing, and safety benchmarks PASSED.\n");
    process.exit(0);
  } else {
    console.error(" [FAILURE] Benchmark targets were not fully met.");
    process.exit(1);
  }
}

runBenchmark().catch((err) => {
  console.error("Benchmark failed with error:", err);
  process.exit(1);
});
