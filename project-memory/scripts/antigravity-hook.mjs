#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { lstat, mkdir, readFile, readdir, realpath, rename, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const MAX_CONTEXT = 18_000;
const STATE_FILE = "project-memory-hook-state.json";
const GIT_TIMEOUT = 2_500;
const FINGERPRINT_DEADLINE = 2_500;
const MAX_FINGERPRINT_FILES = 20_000;
const EXCLUDED_DIRECTORIES = new Set([
  ".git", ".memory", ".idea", ".vscode", ".next", ".nuxt", ".turbo", ".cache",
  "node_modules", "bower_components", "vendor", "dist", "build", "coverage", "target",
  "out", "tmp", "temp", "__pycache__",
]);

async function readInput() {
  let text = "";
  for await (const chunk of process.stdin) text += chunk;
  return text.trim() ? JSON.parse(text) : {};
}

function output(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function inside(parent, candidate) {
  const rel = relative(resolve(parent), resolve(candidate));
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function git(root, args) {
  return execFileAsync("git", ["-C", root, ...args], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    timeout: GIT_TIMEOUT,
  });
}

async function findMemoryRoot(workspaces) {
  for (const workspace of workspaces ?? []) {
    const root = resolve(workspace);
    const candidates = [root];
    try {
      const projectRoot = resolve((await git(root, ["rev-parse", "--show-toplevel"])).stdout.trim());
      if (projectRoot !== root) candidates.push(projectRoot);
    } catch {
      // Non-Git workspaces remain valid Project Memory roots.
    }
    for (const candidate of candidates) {
      if (await exists(join(candidate, ".memory", "index.md"))) return realpath(candidate);
    }
  }
  return undefined;
}

async function safeRead(path, root) {
  const absolute = resolve(path);
  if (!inside(root, absolute)) throw new Error("Path escaped memory root");
  const canonical = await realpath(absolute);
  if (!inside(root, canonical)) throw new Error("Symbolic link escaped memory root");
  const info = await lstat(canonical);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 512 * 1024) throw new Error("Unsafe memory document");
  return readFile(canonical, "utf8");
}

function activeScope(index) {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(index)?.[1] ?? "";
  const match = /^active_scope:\s*(?:["']([^"']+)["']|([^\s#]+))\s*$/m.exec(frontmatter);
  const scope = (match?.[1] ?? match?.[2] ?? ".").trim();
  if (scope === ".") return scope;
  if (!/^[a-zA-Z0-9._/-]+$/.test(scope) || scope.startsWith("/") || scope.split("/").includes("..")) return ".";
  return scope;
}

function excerpt(text, limit) {
  if (text.length <= limit) return text;
  const marker = "\n\n[...middle truncated...]\n\n";
  const head = Math.ceil((limit - marker.length) * 0.6);
  return text.slice(0, head) + marker + text.slice(-(limit - marker.length - head));
}

async function canonicalTarget(path) {
  let current = path;
  const suffix = [];
  while (true) {
    try {
      return resolve(await realpath(current), ...suffix);
    } catch (error) {
      if (error?.code !== "ENOENT") return path;
      const parent = dirname(current);
      if (parent === current) return path;
      suffix.unshift(current.slice(parent.length + 1));
      current = parent;
    }
  }
}

async function repositoryFingerprint(root, excludedPath) {
  const excluded = excludedPath && inside(root, excludedPath) ? resolve(excludedPath) : undefined;
  let isGit = false;
  try {
    isGit = (await git(root, ["rev-parse", "--is-inside-work-tree"])).stdout.trim() === "true";
  } catch {
    // Use a bounded metadata walk only for non-Git workspaces.
  }
  if (isGit) {
    const [head, statusText] = await Promise.all([
      git(root, ["rev-parse", "--verify", "HEAD"]).catch(() => ({ stdout: "UNBORN\n" })),
      git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]),
    ]);
    const statusEntries = statusText.stdout.split("\0").filter(Boolean).filter((entry) => {
      const changedPath = entry.slice(3).split(" -> ").at(-1)?.trim();
      if (changedPath === ".memory" || changedPath?.startsWith(".memory/")) return false;
      if (!excluded) return true;
      return !changedPath || !inside(excluded, resolve(root, changedPath));
    });
    const hash = createHash("sha256").update(head.stdout).update("\0");
    for (const entry of statusEntries) {
      hash.update(entry).update("\0");
      const changedPath = entry.slice(3).split(" -> ").at(-1)?.trim();
      if (!changedPath) continue;
      try {
        const path = resolve(root, changedPath);
        const info = await stat(path, { bigint: true });
        hash.update(`${info.size}:${info.mtimeNs}\0`);
      } catch {
        // Deletions are represented by the status entry itself.
      }
    }
    return hash.digest("hex");
  }

  const hash = createHash("sha256");
  const deadline = Date.now() + FINGERPRINT_DEADLINE;
  let fileCount = 0;
  async function walk(current) {
    if (Date.now() > deadline) throw new Error("Repository fingerprint timed out");
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (EXCLUDED_DIRECTORIES.has(entry.name) || entry.isSymbolicLink()) continue;
      const path = join(current, entry.name);
      if (excluded && inside(excluded, path)) continue;
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) {
        fileCount += 1;
        if (fileCount > MAX_FINGERPRINT_FILES || Date.now() > deadline) throw new Error("Repository fingerprint exceeded its limit");
        const info = await stat(path, { bigint: true });
        hash.update(relative(root, path)).update(`:${info.size}:${info.mtimeNs}\n`);
      }
    }
  }
  await walk(root);
  return hash.digest("hex");
}

async function statePath(input) {
  const directory = input.artifactDirectoryPath ? resolve(input.artifactDirectoryPath) : undefined;
  if (!directory) return undefined;
  await mkdir(directory, { recursive: true });
  return join(directory, STATE_FILE);
}

async function writeState(input, value) {
  const path = await statePath(input);
  if (!path) return;
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(value), { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
}

async function readState(input) {
  const path = await statePath(input);
  if (!path) return undefined;
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return undefined;
  }
}

async function preInvocation(input) {
  const root = await findMemoryRoot(input.workspacePaths);
  if (!root) return { injectSteps: [] };
  const memoryRoot = join(root, ".memory");
  const index = await safeRead(join(memoryRoot, "index.md"), memoryRoot);
  const scope = activeScope(index);
  const scopeRoot = scope === "." ? memoryRoot : resolve(memoryRoot, scope);
  if (!inside(memoryRoot, scopeRoot)) throw new Error("Active scope escaped memory bundle");
  const [goal, progress] = await Promise.all([
    safeRead(join(scopeRoot, "goal.md"), memoryRoot),
    safeRead(join(scopeRoot, "progress.md"), memoryRoot),
  ]);
  const message = `[PROJECT MEMORY]\nPersistent project truth is in .memory. Keep all .memory/ documents ultra-short, compact, concise, and token-efficient. Read the wiki before broad repository exploration. Ask rather than guess. Semantic intent, contradiction resolution, and completion require explicit user approval. Use the memory CLI for generated regions and append-only history. New sources must be integrated into existing topic/entity pages with citations, not merely indexed.\n\nACTIVE INDEX\n${excerpt(index, 4_800)}\n\nACTIVE GOAL (${scope})\n${excerpt(goal, 5_600)}\n\nACTIVE PROGRESS\n${excerpt(progress, 5_600)}`;
  try {
    const artifactPath = input.artifactDirectoryPath ? await canonicalTarget(resolve(input.artifactDirectoryPath)) : undefined;
    const excluded = artifactPath && inside(root, artifactPath) ? artifactPath : undefined;
    const fingerprint = await repositoryFingerprint(root, excluded);
    await writeState(input, { root, fingerprint, invocationNum: input.invocationNum ?? 0 });
  } catch (error) {
    process.stderr.write(`Project Memory fingerprint unavailable: ${error.message}\n`);
  }
  return { injectSteps: [{ ephemeralMessage: message.slice(0, MAX_CONTEXT) }] };
}

function toolTarget(toolCall, workspace) {
  const args = toolCall?.args ?? {};
  const raw = args.TargetFile ?? args.AbsolutePath;
  if (typeof raw !== "string") return undefined;
  return isAbsolute(raw) ? resolve(raw) : resolve(workspace, raw);
}

function mutatesMemoryCommand(command) {
  if (typeof command !== "string") return false;
  const normalized = command.replace(/\\(?=[a-z0-9_.-])/gi, "");
  if (!/\.memory(?=$|[\\/\s"'`;&|>{},)])|\.m[a-z]*(?:[*?{]|\[)|\.\*/i.test(normalized)) return false;
  // Shell syntax is too broad to prove read-only safely. Agents can use view_file for reads
  // and the memory CLI for every managed mutation.
  return true;
}

async function preToolUse(input) {
  const toolCall = input.toolCall ?? {};
  const workspace = resolve(input.workspacePaths?.[0] ?? process.cwd());
  const target = toolTarget(toolCall, workspace);
  const resolvedTarget = target ? await canonicalTarget(target) : undefined;
  const roots = [];
  for (const candidate of input.workspacePaths ?? []) {
    const root = await findMemoryRoot([candidate]);
    if (root && !roots.includes(root)) roots.push(root);
  }
  const root = resolvedTarget ? roots.find((candidate) => inside(candidate, resolvedTarget)) ?? roots[0] : roots[0];

  if (target) {
    const guardRoot = root ?? workspace;
    const memoryRoot = resolve(guardRoot, ".memory");
    const canonicalMemoryRoot = await canonicalTarget(memoryRoot);
    const normalizedTarget = resolvedTarget ?? target;
    if (inside(memoryRoot, normalizedTarget) || inside(canonicalMemoryRoot, resolvedTarget)) {
      return {
        decision: "deny",
        reason: "Direct .memory writes are blocked. Use the Project Memory skill and memory CLI so validation, generated markers, approval gates, locking, and append-only history are preserved.",
      };
    }
    if (resolve(normalizedTarget) === resolve(guardRoot, "AGENTS.md") && ["write_to_file", "replace_file_content", "multi_replace_file_content"].includes(toolCall.name)) {
      const current = await readFile(normalizedTarget, "utf8").catch(() => "");
      const startMarker = "<!-- memory:start -->";
      const endMarker = "<!-- memory:end -->";
      const start = current.indexOf(startMarker);
      const end = current.indexOf(endMarker);
      if (start >= 0 || end >= 0) {
        if (start < 0 || end < start || current.indexOf(startMarker, start + startMarker.length) >= 0 || current.indexOf(endMarker, end + endMarker.length) >= 0) {
          return { decision: "deny", reason: "AGENTS.md has malformed or duplicate Project Memory markers. Repair explicitly before other edits." };
        }
        if (toolCall.name === "write_to_file") return { decision: "deny", reason: "Whole-file AGENTS.md writes are blocked while the managed Project Memory block exists. Use a targeted edit outside the markers." };
        const targets = toolCall.name === "replace_file_content"
          ? [toolCall.args?.TargetContent]
          : (toolCall.args?.ReplacementChunks ?? []).map((chunk) => chunk?.TargetContent);
        const managedEnd = end + endMarker.length;
        if (targets.length === 0 || targets.some((text) => {
          if (typeof text !== "string" || !text) return true;
          const editStart = current.indexOf(text);
          return editStart < 0 || (editStart < managedEnd && editStart + text.length > start);
        })) {
          return { decision: "deny", reason: "The proposed AGENTS.md edit may overlap the managed Project Memory block." };
        }
      }
    }
  }

  if (toolCall.name === "run_command" && mutatesMemoryCommand(toolCall.args?.CommandLine)) {
    return { decision: "deny", reason: "Shell mutation of .memory is blocked. Use the memory CLI." };
  }
  return { decision: "allow" };
}

async function postInvocation(input) {
  const previous = await readState(input);
  const root = previous?.root && await exists(join(previous.root, ".memory", "index.md"))
    ? previous.root
    : await findMemoryRoot(input.workspacePaths);
  if (!root) return { injectSteps: [], terminationBehavior: "" };
  const artifactPath = input.artifactDirectoryPath ? await canonicalTarget(resolve(input.artifactDirectoryPath)) : undefined;
  const excluded = artifactPath && inside(root, artifactPath) ? artifactPath : undefined;
  let fingerprint;
  try {
    fingerprint = await repositoryFingerprint(root, excluded);
    await writeState(input, { root, fingerprint, invocationNum: input.invocationNum ?? 0 });
  } catch (error) {
    process.stderr.write(`Project Memory fingerprint unavailable: ${error.message}\n`);
    return { injectSteps: [], terminationBehavior: "" };
  }
  if (!previous?.fingerprint || previous.fingerprint === fingerprint) return { injectSteps: [], terminationBehavior: "" };
  return {
    injectSteps: [{
      ephemeralMessage: "[PROJECT MEMORY MAINTENANCE] Repository state changed during this invocation. Before handoff, compare the affected work with approved goals and update progress, evidence, append-only history, source/topic pages, and exactly one next action per active unblocked scope. Ask before changing semantic intent.",
    }],
    terminationBehavior: "",
  };
}

async function main() {
  const mode = process.argv[2];
  const input = await readInput();
  if (mode === "pre-invocation") output(await preInvocation(input));
  else if (mode === "pre-tool-use") output(await preToolUse(input));
  else if (mode === "post-invocation") output(await postInvocation(input));
  else output({});
}

main().catch((error) => {
  const mode = process.argv[2];
  process.stderr.write(`Project Memory hook failed: ${error.message}\n`);
  if (mode === "pre-tool-use") output({ decision: "deny", reason: `Project Memory guard could not validate the operation: ${error.message}` });
  else output({ injectSteps: [], terminationBehavior: "" });
});
