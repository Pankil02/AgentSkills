import { isAbsolute, relative, resolve, sep } from "node:path";
import { isPathInside } from "../src/repository.ts";
import { buildMemoryContext } from "../src/bundle.ts";

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

async function memoryContext(root: string): Promise<string | undefined> {
  try {
    return await buildMemoryContext(root);
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
      if (!isPathInside(root, absolute)) return;
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
      output.system.push(context + reminder);
      if (paths.length > 0) changedPaths.clear();
    },
  };
}

export default {
  id: "project-memory",
  server: ProjectMemoryKiloPlugin,
};
