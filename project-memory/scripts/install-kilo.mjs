#!/usr/bin/env node

import { access, cp, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const targetRoot = resolve(process.argv[2] ?? process.cwd());
const kiloRoot = join(targetRoot, ".kilo");
const names = ["init", "sync", "reflect"];
const destinations = [
  join(kiloRoot, "skills", "project-memory"),
  join(kiloRoot, "plugin", "project-memory.ts"),
  ...names.map((name) => join(kiloRoot, "command", `memory-${name}.md`)),
];

for (const path of destinations) {
  try {
    await access(path);
    throw new Error(`Refusing to replace existing Kilo file: ${path}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

await mkdir(join(kiloRoot, "skills"), { recursive: true });
await mkdir(join(kiloRoot, "command"), { recursive: true });
await mkdir(join(kiloRoot, "plugin"), { recursive: true });
await cp(join(packageRoot, "skills", "memory"), join(kiloRoot, "skills", "project-memory"), {
  recursive: true,
  errorOnExist: true,
  force: false,
});
await cp(join(packageRoot, "extensions", "kilo.ts"), join(kiloRoot, "plugin", "project-memory.ts"), {
  errorOnExist: true,
  force: false,
});

for (const name of names) {
  await cp(
    join(packageRoot, "workflows", `memory-${name}.md`),
    join(kiloRoot, "command", `memory-${name}.md`),
    { errorOnExist: true, force: false },
  );
}

process.stdout.write(`Installed Project Memory for Kilo Code in ${kiloRoot}\n`);
