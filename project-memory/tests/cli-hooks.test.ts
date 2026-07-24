import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import { runCli } from "../src/cli.ts";
import { initializeBundle } from "../src/bundle.ts";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const hookPath = join(packageRoot, "scripts", "antigravity-hook.mjs");
const execFileAsync = promisify(execFile);

async function temporaryProject(): Promise<string> {
  return mkdtemp(join(tmpdir(), "project-memory-cli-"));
}

async function runHook(mode: string, input: unknown, raw = false): Promise<Record<string, unknown>> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [hookPath, mode], { stdio: ["pipe", "pipe", "pipe"] });
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
    child.stdin.end(raw ? String(input) : JSON.stringify(input));
  });
}

test("CLI initializes, validates, reports status, and supports plan files", async (t) => {
  const root = await temporaryProject();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "index.ts"), "export const value = 1;\n");
  const output: string[] = [];
  const errors: string[] = [];
  const io = { stdout: (text: string) => output.push(text), stderr: (text: string) => errors.push(text) };

  assert.equal(await runCli(["init", "--root", root, "--json"], io), 0, errors.join("\n"));
  const initialized = JSON.parse(output.pop()!);
  assert.equal(initialized.bundle, join(root, ".memory"));
  assert.equal(await runCli(["validate", "--root", root, "--json"], io), 0, errors.join("\n"));
  assert.equal(JSON.parse(output.pop()!).ok, true);
  assert.equal(await runCli(["status", "--root", root, "--json"], io), 0, errors.join("\n"));
  assert.equal(JSON.parse(output.pop()!).initialized, true);
  assert.equal(await runCli(["sync", "--root", root, "--json"], io), 0, errors.join("\n"));
  output.pop();
  assert.equal(await runCli(["sync", "--check", "--root", root, "--json"], io), 0, errors.join("\n"));
  output.pop();
  await writeFile(join(root, "index.ts"), "export const value = 2;\n");
  assert.equal(await runCli(["sync", "--check", "--root", root, "--json"], io), 1, "--check should report generated drift");
  output.pop();

  const planPath = join(root, "plan.json");
  await writeFile(planPath, JSON.stringify({
    approved: true,
    approvalReason: "Explicit test approval",
    operations: [{ action: "update_frontmatter", path: "goal.md", values: { status: "interviewing" } }],
  }));
  assert.equal(await runCli(["apply", "--root", root, "--plan-file", planPath, "--json"], io), 0, errors.join("\n"));
  assert.equal(JSON.parse(output.pop()!).validation.ok, true);
});

test("CLI malformed plans fail with JSON-only errors", async (t) => {
  const root = await temporaryProject();
  t.after(() => rm(root, { recursive: true, force: true }));
  await initializeBundle(root);
  const output: string[] = [];
  const errors: string[] = [];
  const code = await runCli(["apply", "--root", root, "--plan", "{bad", "--json"], {
    stdout: (text) => output.push(text),
    stderr: (text) => errors.push(text),
  });
  assert.equal(code, 1);
  assert.equal(output.length, 0);
  assert.equal(typeof JSON.parse(errors[0]).error, "string");
});

test("Antigravity pre-tool hook denies direct memory writes and allows normal writes", async (t) => {
  const root = await temporaryProject();
  t.after(() => rm(root, { recursive: true, force: true }));
  const common = { workspacePaths: [root], artifactDirectoryPath: join(root, ".artifacts") };
  const denied = await runHook("pre-tool-use", {
    ...common,
    toolCall: { name: "write_to_file", args: { TargetFile: join(root, ".memory", "goal.md") } },
  });
  assert.equal(denied.decision, "deny");
  const allowed = await runHook("pre-tool-use", {
    ...common,
    toolCall: { name: "write_to_file", args: { TargetFile: join(root, "src", "file.ts") } },
  });
  assert.equal(allowed.decision, "allow");
  const deniedRootCommand = await runHook("pre-tool-use", {
    ...common,
    toolCall: { name: "run_command", args: { CommandLine: "rm -rf .memory" } },
  });
  assert.equal(deniedRootCommand.decision, "deny");
  for (const command of ["rm -rf .memory>/dev/null", "rm -rf {.memory,other}", "rm -rf .mem*", "rm -rf .mem\\ory", "rm -rf .memo*", "rm -rf .m{emory,isc}"]) {
    const deniedBypass = await runHook("pre-tool-use", { ...common, toolCall: { name: "run_command", args: { CommandLine: command } } });
    assert.equal(deniedBypass.decision, "deny", command);
  }
  await mkdir(join(root, ".memory"));
  await symlink(join(root, ".memory"), join(root, "memory-alias"));
  const deniedSymlinkChild = await runHook("pre-tool-use", {
    ...common,
    toolCall: { name: "write_to_file", args: { TargetFile: join(root, "memory-alias", "new", "file.md") } },
  });
  assert.equal(deniedSymlinkChild.decision, "deny");
  const allowedSimilarCommand = await runHook("pre-tool-use", {
    ...common,
    toolCall: { name: "run_command", args: { CommandLine: "rm -rf .memory-cache" } },
  });
  assert.equal(allowedSimilarCommand.decision, "allow");
  const malformed = await runHook("pre-tool-use", "{", true);
  assert.equal(malformed.decision, "deny");
});

test("Antigravity hooks inject bounded context and a non-looping stale reminder", async (t) => {
  const root = await temporaryProject();
  t.after(() => rm(root, { recursive: true, force: true }));
  await initializeBundle(root);
  await writeFile(join(root, "source.ts"), "export const before = 1;\n");
  const artifactDirectoryPath = join(root, ".artifacts");
  const input = { workspacePaths: [root], artifactDirectoryPath, invocationNum: 0 };
  const agentsWrite = await runHook("pre-tool-use", {
    ...input,
    toolCall: { name: "write_to_file", args: { TargetFile: join(root, "AGENTS.md"), CodeContent: "replace" } },
  });
  assert.equal(agentsWrite.decision, "deny");
  const pre = await runHook("pre-invocation", input);
  const steps = pre.injectSteps as Array<{ ephemeralMessage: string }>;
  assert.equal(steps.length, 1);
  assert.match(steps[0].ephemeralMessage, /PROJECT MEMORY/);
  assert(steps[0].ephemeralMessage.length <= 18_000);

  await writeFile(join(root, "source.ts"), "export const after = 2;\n");
  const post = await runHook("post-invocation", input);
  const postSteps = post.injectSteps as Array<{ ephemeralMessage: string }>;
  assert.equal(postSteps.length, 1);
  assert.match(postSteps[0].ephemeralMessage, /Repository state changed/);
  assert.equal(post.terminationBehavior, "");

  const unchanged = await runHook("post-invocation", { ...input, invocationNum: 1 });
  assert.deepEqual(unchanged.injectSteps, []);
});

test("Antigravity finds memory from a nested Git workspace", async (t) => {
  const root = await temporaryProject();
  t.after(() => rm(root, { recursive: true, force: true }));
  await initializeBundle(root);
  const nested = join(root, "packages", "app");
  await mkdir(nested, { recursive: true });
  await execFileAsync("git", ["init"], { cwd: root });
  const result = await runHook("pre-invocation", {
    workspacePaths: [nested],
    artifactDirectoryPath: join(root, ".artifacts"),
    invocationNum: 0,
  });
  assert.match((result.injectSteps as Array<{ ephemeralMessage: string }>)[0].ephemeralMessage, /PROJECT MEMORY/);
});

test("Antigravity context keeps the beginning and actionable tail", async (t) => {
  const root = await temporaryProject();
  t.after(() => rm(root, { recursive: true, force: true }));
  await initializeBundle(root);
  await writeFile(join(root, ".memory", "goal.md"), `GOAL START\n${"g".repeat(9_000)}\nGOAL END`);
  await writeFile(join(root, ".memory", "progress.md"), `PROGRESS START\n${"p".repeat(9_000)}\nNEXT ACTION: verify tail`);
  const result = await runHook("pre-invocation", {
    workspacePaths: [root],
    artifactDirectoryPath: join(root, ".artifacts"),
    invocationNum: 0,
  });
  const message = (result.injectSteps as Array<{ ephemeralMessage: string }>)[0].ephemeralMessage;
  assert.match(message, /GOAL START/);
  assert.match(message, /GOAL END/);
  assert.match(message, /PROGRESS START/);
  assert.match(message, /NEXT ACTION: verify tail/);
  assert.match(message, /middle truncated/);
  assert(message.length <= 18_000);
});

test("Antigravity notices repeated edits to an already dirty Git file", async (t) => {
  const root = await temporaryProject();
  t.after(() => rm(root, { recursive: true, force: true }));
  await initializeBundle(root);
  const source = join(root, "source.ts");
  await writeFile(source, "export const value = 0;\n");
  await execFileAsync("git", ["init"], { cwd: root });
  await execFileAsync("git", ["add", "."], { cwd: root });
  await execFileAsync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "initial"], { cwd: root });
  const input = { workspacePaths: [root], artifactDirectoryPath: join(root, ".artifacts"), invocationNum: 0 };
  await runHook("pre-invocation", input);
  await writeFile(source, "export const value = 1;\n");
  assert.equal(((await runHook("post-invocation", input)).injectSteps as unknown[]).length, 1);
  await runHook("pre-invocation", { ...input, invocationNum: 1 });
  await writeFile(source, "export const value = 2;\n");
  assert.equal(((await runHook("post-invocation", { ...input, invocationNum: 1 })).injectSteps as unknown[]).length, 1);
});

test("built CLI is a standalone executable after build output exists", async () => {
  const built = join(packageRoot, "skills", "memory", "scripts", "memory.mjs");
  const firstLine = (await readFile(built, "utf8")).split("\n", 1)[0];
  assert.equal(firstLine, "#!/usr/bin/env node");
});
