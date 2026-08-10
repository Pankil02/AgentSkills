import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { promisify } from "node:util";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import kiloModule, { ProjectMemoryKiloPlugin } from "../extensions/kilo.ts";
import projectMemory from "../extensions/memory.ts";
import { buildMemoryContext, initializeBundle } from "../src/bundle.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const execFileAsync = promisify(execFile);

async function runHookCommand(command: string, input: unknown, cwd: string): Promise<Record<string, unknown>> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("/bin/sh", ["-c", command], { cwd, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`Hook exited ${code}: ${stderr}`));
      try {
        resolvePromise(JSON.parse(stdout));
      } catch {
        reject(new Error(`Invalid hook JSON: ${stdout}\n${stderr}`));
      }
    });
    child.stdin.end(JSON.stringify(input));
  });
}

test("Pi extension registers exact tools, commands, and lifecycle hooks", () => {
  const tools: string[] = [];
  const commands: string[] = [];
  const events: string[] = [];
  const api = {
    registerTool(tool: { name: string }) { tools.push(tool.name); },
    registerCommand(name: string) { commands.push(name); },
    on(name: string) { events.push(name); },
  } as unknown as ExtensionAPI;
  projectMemory(api);
  assert.deepEqual(tools.sort(), ["memory_apply", "memory_ask"]);
  assert.deepEqual(commands.sort(), [
    "memory-ingest",
    "memory-init",
    "memory-reflect",
    "memory-sync",
  ]);
  assert(events.includes("before_agent_start"));
  assert(events.includes("tool_call"));
  assert(events.includes("agent_end"));
  assert(events.includes("session_start"));
});

test("memory_ask collects a bounded mixed question batch through Pi UI", async () => {
  let askTool: any;
  const api = {
    registerTool(tool: { name: string }) { if (tool.name === "memory_ask") askTool = tool; },
    registerCommand() {},
    on() {},
  } as unknown as ExtensionAPI;
  projectMemory(api);
  assert(askTool);
  const selections = ["Keep current — Preserve approved behavior"];
  const inputs = ["Blue", "x".repeat(30_000)];
  const result = await askTool.execute("call", {
    context: "Feature interview",
    questions: [
      { id: "feature-Q01", prompt: "Theme?" },
      {
        id: "feature-Q02",
        prompt: "Compatibility?",
        options: [{ value: "keep", label: "Keep current", description: "Preserve approved behavior" }],
      },
      { id: "feature-Q03", prompt: "Detailed notes?" },
    ],
  }, undefined, undefined, {
    hasUI: true,
    ui: {
      input: async () => inputs.shift(),
      select: async () => selections.shift(),
    },
  });
  assert.equal(result.details.cancelled, false);
  assert.deepEqual(result.details.answers.map((answer: { id: string; value: string }) => [answer.id, answer.value]), [
    ["feature-Q01", "Blue"],
    ["feature-Q02", "keep"],
    ["feature-Q03", "x".repeat(30_000)],
  ]);
  assert.match(result.content[0].text, /\[Output truncated\]$/);
  assert(result.content[0].text.length < 25_000);

  const cancelled = await askTool.execute("cancel", {
    questions: [{ id: "feature-Q04", prompt: "Cancel?" }],
  }, undefined, undefined, {
    hasUI: true,
    ui: { input: async () => undefined, select: async () => undefined },
  });
  assert.equal(cancelled.details.cancelled, true);
  assert.deepEqual(cancelled.details.answers, []);
});

test("memory_apply requires Pi UI confirmation", async (t) => {
  const project = await mkdtemp(join(tmpdir(), "project-memory-pi-"));
  t.after(() => rm(project, { recursive: true, force: true }));
  await initializeBundle(project);
  let applyTool: any;
  const api = {
    registerTool(tool: { name: string }) { if (tool.name === "memory_apply") applyTool = tool; },
    registerCommand() {},
    on() {},
  } as unknown as ExtensionAPI;
  projectMemory(api);
  const result = await applyTool.execute("apply", {
    action: "apply_plan",
    plan: {
      operations: [{ action: "update_frontmatter", path: "goal.md", values: { status: "interviewing" } }],
    },
  }, undefined, undefined, {
    cwd: project,
    hasUI: true,
    ui: { confirm: async () => true },
  });
  assert.equal(result.details.validation.ok, true);
});

test("memory_apply requires interactive approval before source registration", async () => {
  let applyTool: any;
  const api = {
    registerTool(tool: { name: string }) { if (tool.name === "memory_apply") applyTool = tool; },
    registerCommand() {},
    on() {},
  } as unknown as ExtensionAPI;
  projectMemory(api);
  const result = await applyTool.execute("record", {
    action: "record_source",
    source: "https://example.com/spec",
  }, undefined, undefined, {
    cwd: process.cwd(),
    hasUI: true,
    ui: { confirm: async () => false },
  });
  assert.equal(result.details.cancelled, true);
});

test("Pi blocks shell access to the .memory root", async (t) => {
  const project = await mkdtemp(join(tmpdir(), "project-memory-pi-guard-"));
  t.after(() => rm(project, { recursive: true, force: true }));
  let toolCallHandler: any;
  const api = {
    registerTool() {},
    registerCommand() {},
    on(name: string, handler: unknown) { if (name === "tool_call") toolCallHandler = handler; },
  } as unknown as ExtensionAPI;
  projectMemory(api);
  const result = await toolCallHandler({ toolName: "bash", input: { command: "rm -rf .memory" } }, { cwd: project });
  assert.equal(result.block, true);
  for (const command of ["rm -rf .memory>/dev/null", "rm -rf {.memory,other}", "rm -rf .mem*", "rm -rf .mem\\ory", "rm -rf .memo*", "rm -rf .m{emory,isc}"]) {
    const blocked = await toolCallHandler({ toolName: "bash", input: { command } }, { cwd: project });
    assert.equal(blocked.block, true, command);
  }
  await mkdir(join(project, ".memory"));
  await symlink(join(project, ".memory"), join(project, "memory-alias"));
  const symlinked = await toolCallHandler({ toolName: "write", input: { path: "memory-alias/new/file.md" } }, { cwd: project });
  assert.equal(symlinked.block, true);
});

test("headless Pi cannot self-approve semantic plans", async () => {
  let applyTool: any;
  const api = {
    registerTool(tool: { name: string }) { if (tool.name === "memory_apply") applyTool = tool; },
    registerCommand() {},
    on() {},
  } as unknown as ExtensionAPI;
  projectMemory(api);
  const result = await applyTool.execute("apply", {
    action: "apply_plan",
    approvalReason: "Model supplied",
    plan: { operations: [{ action: "write_document", path: "architecture.md", content: "---\ntype: Architecture\n---\n# Changed\n" }] },
  }, undefined, undefined, { cwd: process.cwd(), hasUI: false });
  assert.equal(result.details.cancelled, true);
});

test("Antigravity plugin manifest, hooks, rule, skill, and importable workflows exist", async () => {
  const plugin = JSON.parse(await readFile(join(root, "plugin.json"), "utf8"));
  assert.equal(plugin.name, "project-memory");
  const hooks = JSON.parse(await readFile(join(root, "hooks.json"), "utf8"));
  assert(hooks["project-memory-context"].PreInvocation);
  assert(hooks["project-memory-write-guard"].PreToolUse);
  assert(hooks["project-memory-stale-reminder"].PostInvocation);
  for (const group of Object.values(hooks) as Array<Record<string, Array<{ hooks?: unknown[] }>>>) {
    for (const handlers of Object.values(group)) {
      assert(handlers.every((handler) => Array.isArray(handler.hooks)), "Antigravity commands must be nested in handler hooks arrays");
    }
  }
  const skill = await readFile(join(root, "skills", "memory", "SKILL.md"), "utf8");
  assert.match(skill, /^---\nname: project-memory\ndescription:/);
  assert.match(await readFile(join(root, "rules", "memory.md"), "utf8"), /Project Memory rule/);
  for (const name of ["init", "sync", "reflect"]) {
    assert.match(await readFile(join(root, "workflows", `memory-${name}.md`), "utf8"), /^# /);
  }
});

test("Kilo plugin injects active memory and a one-shot edit reminder", async (t) => {
  const project = await mkdtemp(join(tmpdir(), "project-memory-kilo-plugin-"));
  t.after(() => rm(project, { recursive: true, force: true }));
  await initializeBundle(project);
  assert.equal(kiloModule.id, "project-memory");
  assert.equal(kiloModule.server, ProjectMemoryKiloPlugin);
  const hooks = await ProjectMemoryKiloPlugin({ directory: project, worktree: project });
  const transform = hooks["experimental.chat.system.transform"];
  const first = { system: [] as string[] };
  await transform({}, first);
  assert.equal(first.system.length, 1);
  assert.match(first.system[0], /ACTIVE INDEX/);
  assert.doesNotMatch(first.system[0], /ACTIVE GOAL/);
  assert.doesNotMatch(first.system[0], /ACTIVE PROGRESS/);
  assert(Buffer.byteLength(first.system[0], "utf8") <= 6_000);

  await hooks.event({ event: { type: "file.edited", properties: { file: join(project, "src", "feature.ts") } } });
  const reminded = { system: [] as string[] };
  await transform({}, reminded);
  assert.match(reminded.system[0], /PROJECT MEMORY MAINTENANCE/);
  assert.match(reminded.system[0], /src\/feature\.ts/);
  const consumed = { system: [] as string[] };
  await transform({}, consumed);
  assert.doesNotMatch(consumed.system[0], /PROJECT MEMORY MAINTENANCE/);

  await hooks.event({ event: { type: "file.watcher.updated", properties: { file: join(project, ".memory", "progress.md") } } });
  const ignored = { system: [] as string[] };
  await transform({}, ignored);
  assert.doesNotMatch(ignored.system[0], /PROJECT MEMORY MAINTENANCE/);
});

test("Kilo installer copies the skill, plugin, and commands without overwriting them", async (t) => {
  const project = await mkdtemp(join(tmpdir(), "project-memory-kilo-"));
  t.after(() => rm(project, { recursive: true, force: true }));
  const installer = join(root, "scripts", "install-kilo.mjs");
  await execFileAsync(process.execPath, [installer, project]);

  const skill = await readFile(join(project, ".kilo", "skills", "project-memory", "SKILL.md"), "utf8");
  assert.match(skill, /^---\nname: project-memory\ndescription:/);
  const plugin = await readFile(join(project, ".kilo", "plugin", "project-memory.ts"), "utf8");
  assert.match(plugin, /id: "project-memory"/);
  assert.match(plugin, /experimental\.chat\.system\.transform/);
  for (const name of ["init", "sync", "reflect"]) {
    assert.match(await readFile(join(project, ".kilo", "command", `memory-${name}.md`), "utf8"), /^# /);
  }
  await assert.rejects(execFileAsync(process.execPath, [installer, project]));
});

test("Antigravity installer preserves hooks and installs runnable absolute commands", async (t) => {
  const project = await mkdtemp(join(tmpdir(), "project memory-antigravity-"));
  const unrelated = await mkdtemp(join(tmpdir(), "project-memory-unrelated-"));
  t.after(() => Promise.all([
    rm(project, { recursive: true, force: true }),
    rm(unrelated, { recursive: true, force: true }),
  ]));
  await initializeBundle(project);
  await mkdir(join(project, ".agents"), { recursive: true });
  await writeFile(join(project, ".agents", "hooks.json"), JSON.stringify({ existing: { Stop: [] } }));
  const installer = join(root, "scripts", "install-antigravity.mjs");
  await execFileAsync(process.execPath, [installer, project]);

  const hooks = JSON.parse(await readFile(join(project, ".agents", "hooks.json"), "utf8"));
  assert.deepEqual(hooks.existing, { Stop: [] });
  const command = hooks["project-memory-context"].PreInvocation[0].hooks[0].command;
  assert.match(command, /antigravity-hook\.mjs/);
  const result = await runHookCommand(command, {
    workspacePaths: [project],
    artifactDirectoryPath: join(project, ".artifacts"),
    invocationNum: 0,
  }, unrelated);
  assert.match((result.injectSteps as Array<{ ephemeralMessage: string }>)[0].ephemeralMessage, /PROJECT MEMORY/);
  assert.match(await readFile(join(project, ".agents", "rules", "project-memory.md"), "utf8"), /Project Memory rule/);
  assert.match(await readFile(join(project, ".agents", "plugins", "project-memory", "skills", "memory", "SKILL.md"), "utf8"), /name: project-memory/);
  await assert.rejects(execFileAsync(process.execPath, [installer, project]));
});

test("package metadata exposes the exact package, CLI, Pi extension, and skill", async () => {
  const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  assert.equal(packageJson.name, "project-memory");
  assert.equal(packageJson.bin.memory, "./skills/memory/scripts/memory.mjs");
  assert.deepEqual(packageJson.pi.extensions, ["./extensions/memory.ts"]);
  assert.deepEqual(packageJson.pi.skills, ["./skills/memory"]);
  assert.equal(packageJson.engines.node, ">=20");
});

test("All adapters (Pi, Kilo, Antigravity, buildMemoryContext) emit byte-identical bounded context regardless of oversized goal and progress", async (t) => {
  const project = await mkdtemp(join(tmpdir(), "project-memory-parity-"));
  t.after(() => rm(project, { recursive: true, force: true }));
  await initializeBundle(project);

  // Inflate goal, progress, and log with large content
  await writeFile(join(project, ".memory", "goal.md"), `---
type: Goal
title: Huge Goal
description: Oversized goal description
status: active
timestamp: 2026-01-01T00:00:00Z
scope: .
---
# Goal
${"Long goal content that should not be auto-injected\\n".repeat(1000)}
`);

  await writeFile(join(project, ".memory", "progress.md"), `---
type: Progress
title: Huge Progress
description: Oversized progress description
timestamp: 2026-01-01T00:00:00Z
scope: .
---
# Progress
${"Long progress content that should not be auto-injected\\n".repeat(1000)}
`);

  await writeFile(join(project, ".memory", "log.md"), `# Log\n${"Long log entry\n".repeat(2000)}`);

  // 1. Shared buildMemoryContext()
  const baseContext = await buildMemoryContext(project);
  assert.match(baseContext, /\[PROJECT MEMORY\]/);
  assert.match(baseContext, /ACTIVE INDEX/);
  assert.doesNotMatch(baseContext, /Long goal content/);
  assert.doesNotMatch(baseContext, /Long progress content/);
  assert(Buffer.byteLength(baseContext, "utf8") <= 6_000);

  // 2. Pi before_agent_start hook
  let beforeAgentStartHandler: any;
  const piApi = {
    registerTool() {},
    registerCommand() {},
    on(name: string, handler: unknown) {
      if (name === "before_agent_start") beforeAgentStartHandler = handler;
    },
  } as unknown as ExtensionAPI;
  projectMemory(piApi);
  const piResult = await beforeAgentStartHandler(undefined, { cwd: project });
  const piContent = piResult?.message?.content;
  assert.equal(piContent, baseContext);

  // 3. Kilo experimental.chat.system.transform
  const kiloHooks = await ProjectMemoryKiloPlugin({ directory: project, worktree: project });
  const kiloOutput = { system: [] as string[] };
  await kiloHooks["experimental.chat.system.transform"]({}, kiloOutput);
  assert.equal(kiloOutput.system[0], baseContext);

  // 4. Antigravity pre-invocation hook
  const installer = join(root, "scripts", "install-antigravity.mjs");
  await execFileAsync(process.execPath, [installer, project]);
  const hooks = JSON.parse(await readFile(join(project, ".agents", "hooks.json"), "utf8"));
  const command = hooks["project-memory-context"].PreInvocation[0].hooks[0].command;
  const antigravityResult = await runHookCommand(command, {
    workspacePaths: [project],
    artifactDirectoryPath: join(project, ".artifacts"),
    invocationNum: 0,
  }, project);
  const antigravityMessage = (antigravityResult.injectSteps as Array<{ ephemeralMessage: string }>)[0].ephemeralMessage;
  assert.equal(antigravityMessage, baseContext);
});

test("All adapters suppress injection and emit structured error message when root index exceeds 6,000 bytes", async (t) => {
  const project = await mkdtemp(join(tmpdir(), "project-memory-budget-error-"));
  t.after(() => rm(project, { recursive: true, force: true }));
  await initializeBundle(project);

  const hugeIndex = `# Oversized Index\n${"x".repeat(7_000)}`;
  await writeFile(join(project, ".memory", "index.md"), hugeIndex);

  const context = await buildMemoryContext(project);
  assert.match(context, /\[PROJECT MEMORY ERROR\]/);
  assert.match(context, /\.memory\/index\.md exceeds the byte budget/);
  assert.match(context, /memory compact --dry-run/);
});
