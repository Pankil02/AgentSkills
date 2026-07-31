#!/usr/bin/env node

import { cp, mkdir, rm, symlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const useSymlink = process.argv.includes("--link") || process.argv.includes("--symlink") || process.argv.includes("-l");
const targetArg = process.argv.slice(2).find((arg) => !arg.startsWith("-"));
const targetRoot = resolve(targetArg ?? process.cwd());
const kiloRoot = join(targetRoot, ".kilo");
const names = ["init", "ingest", "sync", "reflect"];

async function linkOrCopy(source, target, isDir = false) {
  await mkdir(dirname(target), { recursive: true });
  await rm(target, { recursive: true, force: true });
  if (useSymlink) {
    try {
      const symlinkType = isDir ? (process.platform === "win32" ? "junction" : "dir") : "file";
      await symlink(source, target, symlinkType);
      return "symlinked";
    } catch {
      // Fallback to copy if symlinking fails
    }
  }
  await cp(source, target, { recursive: isDir, force: true });
  return "copied";
}

await mkdir(join(kiloRoot, "skills"), { recursive: true });
await mkdir(join(kiloRoot, "command"), { recursive: true });
await mkdir(join(kiloRoot, "plugin"), { recursive: true });

await linkOrCopy(join(packageRoot, "skills", "memory"), join(kiloRoot, "skills", "project-memory"), true);
await linkOrCopy(join(packageRoot, "extensions", "kilo.ts"), join(kiloRoot, "plugin", "project-memory.ts"), false);

for (const name of names) {
  await linkOrCopy(join(packageRoot, "workflows", `memory-${name}.md`), join(kiloRoot, "command", `memory-${name}.md`), false);
}

process.stdout.write(`Installed Project Memory for Kilo Code (${useSymlink ? "symlinked" : "copied"}) in ${kiloRoot}\n`);

