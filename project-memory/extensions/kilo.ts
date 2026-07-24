import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

const MAX_CONTEXT = 18_000;
const EXCLUDED_DIRECTORIES = new Set([
  ".git",
  ".memory",
  ".next",
  ".nuxt",
  ".turbo",
  ".cache",
  "node_modules",
  "vendor",
  "dist",
  "build",
  "coverage",
  "target",
  "out",
]);

interface KiloPluginInput {
  directory: string;
  worktree: string;
}

interface KiloEvent {
  type: string;
  properties?: { file?: string };
}

function inside(parent: string, candidate: string): boolean {
  const path = relative(resolve(parent), resolve(candidate));
  return (
    path === "" ||
    (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path))
  );
}

function excerpt(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const marker = "\n\n[...middle truncated...]\n\n";
  const head = Math.ceil((limit - marker.length) * 0.6);
  return (
    text.slice(0, head) + marker + text.slice(-(limit - marker.length - head))
  );
}

async function safeRead(path: string, memoryRoot: string): Promise<string> {
  const canonical = await realpath(path);
  if (!inside(memoryRoot, canonical))
    throw new Error("Memory path escaped the bundle");
  const info = await lstat(canonical);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 512 * 1024)
    throw new Error("Unsafe memory document");
  return readFile(canonical, "utf8");
}

function activeScope(index: string): string {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(index)?.[1] ?? "";
  const match = /^active_scope:\s*(?:["']([^"']+)["']|([^\s#]+))\s*$/m.exec(
    frontmatter,
  );
  const scope = (match?.[1] ?? match?.[2] ?? ".").trim();
  if (scope === ".") return scope;
  if (
    !/^[a-zA-Z0-9._/-]+$/.test(scope) ||
    scope.startsWith("/") ||
    scope.split("/").includes("..")
  )
    return ".";
  return scope;
}

async function memoryContext(root: string): Promise<string | undefined> {
  try {
    const memoryRoot = await realpath(resolve(root, ".memory"));
    const index = await safeRead(resolve(memoryRoot, "index.md"), memoryRoot);
    const scope = activeScope(index);
    const scopeRoot = scope === "." ? memoryRoot : resolve(memoryRoot, scope);
    if (!inside(memoryRoot, scopeRoot)) return undefined;
    const [goal, progress] = await Promise.all([
      safeRead(resolve(scopeRoot, "goal.md"), memoryRoot),
      safeRead(resolve(scopeRoot, "progress.md"), memoryRoot),
    ]);
    return `[PROJECT MEMORY]\nPersistent project truth is in .memory. Keep all .memory/ documents ultra-short, compact, concise, and token-efficient. Read the linked wiki before broad repository exploration. Ask rather than guess. Semantic intent, contradiction resolution, and completion require explicit user approval. Use the project-memory skill and memory CLI for validated updates.\n\nACTIVE INDEX\n${excerpt(index, 4_800)}\n\nACTIVE GOAL (${scope})\n${excerpt(goal, 5_600)}\n\nACTIVE PROGRESS\n${excerpt(progress, 5_600)}`;
  } catch {
    return undefined;
  }
}

export async function ProjectMemoryKiloPlugin({
  directory,
  worktree,
}: KiloPluginInput) {
  const root = resolve(worktree && worktree !== "/" ? worktree : directory);
  const changedPaths = new Set<string>();

  return {
    event: async ({ event }: { event: KiloEvent }) => {
      if (event.type !== "file.edited" && event.type !== "file.watcher.updated")
        return;
      const file = event.properties?.file;
      if (!file) return;
      const absolute = isAbsolute(file) ? resolve(file) : resolve(root, file);
      if (!inside(root, absolute)) return;
      const path = relative(root, absolute).split(sep).join("/");
      if (
        !path ||
        path.split("/").some((part) => EXCLUDED_DIRECTORIES.has(part))
      )
        return;
      if (changedPaths.size < 100) changedPaths.add(path);
    },

    "experimental.chat.system.transform": async (
      _input: unknown,
      output: { system: string[] },
    ) => {
      const context = await memoryContext(root);
      if (!context) return;
      const paths = [...changedPaths];
      const reminder =
        paths.length === 0
          ? ""
          : `\n\n[PROJECT MEMORY MAINTENANCE]\nRepository files changed: ${paths.slice(0, 20).join(", ")}${paths.length > 20 ? `, and ${paths.length - 20} more` : ""}. Before handoff, compare the affected work with approved goals and update progress, evidence, append-only history, relevant source/topic pages, and exactly one next action per active unblocked scope. Ask before changing semantic intent.`;
      output.system.push((context + reminder).slice(0, MAX_CONTEXT));
      if (paths.length > 0) changedPaths.clear();
    },
  };
}

export default {
  id: "project-memory",
  server: ProjectMemoryKiloPlugin,
};
