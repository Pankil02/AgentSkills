#!/usr/bin/env node

import { access, cp, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const targetRoot = resolve(process.argv[2] ?? process.cwd());
const agentsRoot = join(targetRoot, ".agents");
const pluginRoot = join(agentsRoot, "plugins", "project-memory");
const hooksPath = join(agentsRoot, "hooks.json");
const names = ["init", "sync", "reflect"];
const hookNames = ["project-memory-context", "project-memory-write-guard", "project-memory-stale-reminder"];
const destinations = [
  pluginRoot,
  join(agentsRoot, "rules", "project-memory.md"),
  ...names.map((name) => join(agentsRoot, "workflows", `memory-${name}.md`)),
];

for (const path of destinations) {
  try {
    await access(path);
    throw new Error(`Refusing to replace existing Antigravity file: ${path}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

let existingHooks = {};
try {
  existingHooks = JSON.parse(await readFile(hooksPath, "utf8"));
  if (!existingHooks || Array.isArray(existingHooks) || typeof existingHooks !== "object") throw new Error("Antigravity hooks.json must contain an object");
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
for (const name of hookNames) {
  if (Object.hasOwn(existingHooks, name)) throw new Error(`Refusing to replace existing Antigravity hook: ${name}`);
}

function shellQuote(value) {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

const installedScript = join(pluginRoot, "scripts", "antigravity-hook.mjs");
const command = (mode) => `${shellQuote(process.execPath)} ${shellQuote(installedScript)} ${mode}`;
const projectHooks = {
  "project-memory-context": {
    PreInvocation: [{ matcher: "*", hooks: [{ type: "command", command: command("pre-invocation"), timeout: 10 }] }],
  },
  "project-memory-write-guard": {
    PreToolUse: [{ matcher: "write_to_file|replace_file_content|multi_replace_file_content|run_command", hooks: [{ type: "command", command: command("pre-tool-use"), timeout: 10 }] }],
  },
  "project-memory-stale-reminder": {
    PostInvocation: [{ matcher: "*", hooks: [{ type: "command", command: command("post-invocation"), timeout: 10 }] }],
  },
};

await mkdir(join(pluginRoot, "scripts"), { recursive: true });
await mkdir(join(pluginRoot, "skills"), { recursive: true });
await mkdir(join(agentsRoot, "rules"), { recursive: true });
await mkdir(join(agentsRoot, "workflows"), { recursive: true });
await cp(join(packageRoot, "plugin.json"), join(pluginRoot, "plugin.json"), { errorOnExist: true, force: false });
await cp(join(packageRoot, "skills", "memory"), join(pluginRoot, "skills", "memory"), { recursive: true, errorOnExist: true, force: false });
await cp(join(packageRoot, "scripts", "antigravity-hook.mjs"), installedScript, { errorOnExist: true, force: false });
await cp(join(packageRoot, "rules", "memory.md"), join(agentsRoot, "rules", "project-memory.md"), { errorOnExist: true, force: false });
for (const name of names) {
  await cp(join(packageRoot, "workflows", `memory-${name}.md`), join(agentsRoot, "workflows", `memory-${name}.md`), { errorOnExist: true, force: false });
}

const temporaryHooksPath = `${hooksPath}.${process.pid}.tmp`;
await writeFile(temporaryHooksPath, `${JSON.stringify({ ...existingHooks, ...projectHooks }, null, 2)}\n`);
await rename(temporaryHooksPath, hooksPath);
process.stdout.write(`Installed Project Memory for Antigravity in ${agentsRoot}\n`);
