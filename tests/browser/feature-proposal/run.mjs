#!/usr/bin/env node
// @ts-check
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { startBrowserHarness } from './server.mjs';

const options = {
  port: { type: /** @type {const} */ ('string'), short: 'p', default: '4319' },
  plan: { type: /** @type {const} */ ('string') },
  check: { type: /** @type {const} */ ('boolean'), default: false },
  timeout: { type: /** @type {const} */ ('string'), default: '15000' }
};

const { values } = parseArgs({
  options,
  strict: false
});

const port = parseInt(values.port || '4319', 10);
const planPath = values.plan ? resolve(process.cwd(), values.plan) : undefined;
const isCheck = values.check || false;
const timeoutMs = parseInt(values.timeout || '15000', 10);

console.log('Starting Feature Proposal Browser Regression Harness...');

const harness = await startBrowserHarness({
  port,
  planPath
});

const harnessUrl = `${harness.origin}/harness.html`;

console.log('==============================================================');
console.log('Feature Proposal Browser Regression Harness Active');
console.log(`URL: ${harnessUrl}`);
console.log('Serving real viewer assets against deterministic mock API');
console.log('==============================================================');

if (isCheck) {
  console.log(`Waiting up to ${timeoutMs}ms for browser test results at ${harness.origin}/api/test/results...`);
  const startTime = Date.now();
  let completed = false;

  while (Date.now() - startTime < timeoutMs) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const res = await fetch(`${harness.origin}/api/test/results`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.summary) {
          console.log('\n--- Harness Regression Results ---');
          console.log(`Total Scaffolding Checks: ${data.summary.total}`);
          console.log(`Reproduced P1 Bugs:       ${data.summary.reproduced}`);
          console.log(`Resolved Checks:          ${data.summary.resolved}`);
          console.log(`Errors:                   ${data.summary.errors}`);
          console.log('----------------------------------\n');
          for (const r of data.results) {
            console.log(`[${r.id}] ${r.priority} ${r.target}: ${r.status}`);
            console.log(`   Observed: ${r.observed}`);
          }
          if (data.benchmarks) {
            console.log('\n--- Live Browser Performance & Stability Benchmarks ---');
            console.log(`Reference Hardware: ${data.benchmarks.hardware?.platform || 'Unknown'} (${data.benchmarks.hardware?.hardwareConcurrency || 'N/A'} cores)`);
            console.log(`User Agent:         ${data.benchmarks.hardware?.userAgent || 'Unknown'}`);
            console.log(`First Usable View:  p50=${data.benchmarks.firstUsableView?.p50}ms, p95=${data.benchmarks.firstUsableView?.p95}ms, max=${data.benchmarks.firstUsableView?.max}ms (target < 500ms)`);
            console.log(`Small Tab Switch:   p50=${data.benchmarks.tabTransitions?.p50}ms, p95=${data.benchmarks.tabTransitions?.p95}ms, p99=${data.benchmarks.tabTransitions?.p99}ms (target < 100ms)`);
            console.log(`Near-Limit Doc:     ${data.benchmarks.nearLimitDocument?.renderTimeMs}ms, ${data.benchmarks.nearLimitDocument?.longTasksCount} long tasks >50ms (target < 1000ms)`);
            console.log(`100-Cycle Plateau:  ${data.benchmarks.stabilityPlateau?.pass ? 'VERIFIED' : 'FAILED'} across ${data.benchmarks.stabilityPlateau?.cycles} cycles`);
            console.log(`Idle CPU / Net:     ${data.benchmarks.idleState?.pass ? 'VERIFIED' : 'FAILED'} (zero recurring work)`);
            console.log('--------------------------------------------------------\n');
          }
          completed = true;
          break;
        }
      }
    } catch {
      // Continue polling
    }
  }

  await harness.close();
  if (!completed) {
    console.error('Timed out waiting for browser harness results.');
    process.exit(1);
  }
  process.exit(0);
}

// Keep alive for manual or subagent interaction
const shutdown = async () => {
  console.log('\nStopping browser harness...');
  await harness.close();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
