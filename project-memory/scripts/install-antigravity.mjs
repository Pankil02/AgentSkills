#!/usr/bin/env node

import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { linkOrCopy as baseLinkOrCopy } from "./install-utils.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const useSymlink = process.argv.includes("--link") || process.argv.includes("--symlink") || process.argv.includes("-l");
const targetArg = process.argv.slice(2).find((arg) => !arg.startsWith("-"));
const targetRoot = resolve(targetArg ?? process.cwd());
const agentsRoot = join(targetRoot, ".agents");
const pluginRoot = join(agentsRoot, "plugins", "project-memory");
const skillsRoot = join(agentsRoot, "skills", "project-memory");
const globalSkillsRoot = join(homedir(), ".gemini", "config", "skills", "project-memory");
const hooksPath = join(agentsRoot, "hooks.json");
const workflowFiles = ["mem-init.md", "mem-ingest.md", "mem-sync.md", "mem-log.md"];

const linkOrCopy = (source, target, isDir = false) => baseLinkOrCopy(source, target, isDir, useSymlink);

const force = process.argv.includes("--force") || process.argv.includes("-f") || useSymlink;
const hookNames = ["project-memory-context", "project-memory-write-guard", "project-memory-stale-reminder"];
const destinations = [
  pluginRoot,
  join(agentsRoot, "rules", "project-memory.md"),
  ...workflowFiles.map((file) => join(agentsRoot, "workflows", file)),
];

let existingHooks = {};
try {
  existingHooks = JSON.parse(await readFile(hooksPath, "utf8"));
  if (!existingHooks || Array.isArray(existingHooks) || typeof existingHooks !== "object") throw new Error("Antigravity hooks.json must contain an object");
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

if (!force) {
  for (const path of destinations) {
    try {
      await access(path);
      throw new Error(`Refusing to replace existing Antigravity file: ${path}`);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  for (const name of hookNames) {
    if (Object.hasOwn(existingHooks, name)) throw new Error(`Refusing to replace existing Antigravity hook: ${name}`);
  }
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
await mkdir(join(agentsRoot, "skills"), { recursive: true });
await mkdir(join(agentsRoot, "rules"), { recursive: true });
await mkdir(join(agentsRoot, "workflows"), { recursive: true });

await linkOrCopy(join(packageRoot, "plugin.json"), join(pluginRoot, "plugin.json"), false);
await linkOrCopy(join(packageRoot, "skills", "memory"), join(pluginRoot, "skills", "memory"), true);
const skillMode = await linkOrCopy(join(packageRoot, "skills", "memory"), skillsRoot, true);
await linkOrCopy(join(packageRoot, "scripts", "antigravity-hook.mjs"), installedScript, false);
await linkOrCopy(join(packageRoot, "rules", "memory.md"), join(agentsRoot, "rules", "project-memory.md"), false);

for (const file of workflowFiles) {
  await linkOrCopy(join(packageRoot, "workflows", file), join(agentsRoot, "workflows", file), false);
}

const isGlobal = process.argv.includes("--global") || process.argv.includes("-g");
if (isGlobal) {
  try {
    await mkdir(dirname(globalSkillsRoot), { recursive: true });
    const globalMode = await linkOrCopy(join(packageRoot, "skills", "memory"), globalSkillsRoot, true);
    process.stdout.write(`Installed global Project Memory skill (${globalMode}) at ${globalSkillsRoot}\n`);
  } catch {
    // Ignore error if global dir isn't accessible
  }
}

const temporaryHooksPath = `${hooksPath}.${process.pid}.tmp`;
await writeFile(temporaryHooksPath, `${JSON.stringify({ ...existingHooks, ...projectHooks }, null, 2)}\n`);
await rename(temporaryHooksPath, hooksPath);
process.stdout.write(`Installed Project Memory for Antigravity (${useSymlink ? "symlinked" : "copied"}) in ${agentsRoot}\n`);


