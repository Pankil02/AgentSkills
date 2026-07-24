import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import {
  applyMemoryPlan,
  discoverTrackedScopes,
  getMemoryStatus,
  initializeBundle,
  parseMarkdown,
  recordEvent,
  refreshRegisteredSources,
  registerSource,
  registerTextSource,
  syncAgentsFile,
  syncIndexes,
  validateBundle,
  withBundleLock,
  type MemoryPlan,
} from "./bundle.ts";
import {
  changedRepositoryPaths,
  findProjectRoot,
  mapPathsToScopes,
  scanRepository,
} from "./repository.ts";

interface ParsedArguments {
  command?: string;
  positional: string[];
  flags: Record<string, string | string[] | boolean | undefined>;
}

interface CliIO {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

const HELP = `Project Memory CLI

Usage:
  memory <command> [options]

Commands:
  scan                 Inspect repository files and propose tracked scopes
  init                 Create .memory and optional tracked scopes
  scaffold             Add one or more tracked scopes
  sync                 Detect changed sources and refresh generated indexes
  status               Show goal, source freshness, blockers, and next action
  record               Register a source and/or append a history event
  validate             Validate format, links, lifecycle, and freshness
  agents-sync          Add or repair the managed AGENTS.md block
  apply                Apply a structured memory plan

Common options:
  --root <path>         Project root (default: current directory/Git root)
  --scope <path>        Tracked scope; repeat for multiple scopes
  --source <path|url>   Approved source; repeat for multiple sources
  --source-text <text>  Approved brief or conversation text (not stored raw)
  --source-text-file <path> Read approved text from a file
  --source-name <name>  Stable name for a text source
  --source-kind <kind>  conversation, brief, or input
  --event <json>        History event object
  --event-file <path>   Read a history event JSON object from a file
  --plan <json>         Structured memory plan for apply
  --plan-file <path>    Read a structured memory plan from a file
  --dry-run             Show changes without writing
  --check               Check whether sync would change files
  --fetch-remote        Refresh URL sources during sync
  --json                Emit JSON
  --help                Show this help
`;

function parseArguments(argv: string[]): ParsedArguments {
  const { values: flags, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      root: { type: "string" },
      scope: { type: "string", multiple: true },
      source: { type: "string", multiple: true },
      "source-text": { type: "string" },
      "source-text-file": { type: "string" },
      "source-name": { type: "string" },
      "source-kind": { type: "string" },
      event: { type: "string" },
      "event-file": { type: "string" },
      plan: { type: "string" },
      "plan-file": { type: "string" },
      "dry-run": { type: "boolean" },
      check: { type: "boolean" },
      "fetch-remote": { type: "boolean" },
      json: { type: "boolean" },
      help: { type: "boolean" },
    },
  });
  return { command: positionals[0], positional: positionals.slice(1), flags };
}

function flag(args: ParsedArguments, name: string): string | undefined {
  const value = args.flags[name];
  return Array.isArray(value) ? value.at(-1) : typeof value === "string" ? value : undefined;
}

function flags(args: ParsedArguments, name: string): string[] {
  const value = args.flags[name];
  return Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
}

function enabled(args: ParsedArguments, name: string): boolean {
  return args.flags[name] === true;
}

function summarize(value: unknown): string {
  if (!value || typeof value !== "object") return String(value);
  const object = value as Record<string, unknown>;
  if ("diagnostics" in object && "counts" in object) {
    const counts = object.counts as Record<string, number>;
    const diagnostics = object.diagnostics as Array<{ severity: string; path?: string; message: string }>;
    const lines = [`${object.ok ? "valid" : "invalid"}: ${counts.errors ?? 0} error(s), ${counts.warnings ?? 0} warning(s)`];
    for (const item of diagnostics.slice(0, 30)) lines.push(`- ${item.severity}: ${item.path ?? "bundle"}: ${item.message}`);
    if (diagnostics.length > 30) lines.push(`- ${diagnostics.length - 30} more diagnostic(s)`);
    return lines.join("\n");
  }
  if ("candidates" in object && "files" in object) {
    const candidates = object.candidates as Array<{ path: string; fileCount: number; confidence: string }>;
    return [
      `Scanned ${(object.files as unknown[]).length} file(s) in ${object.projectRoot}`,
      `Repository fingerprint: ${object.fingerprint}`,
      "Candidate scopes:",
      ...candidates.map((candidate) => `- ${candidate.path} (${candidate.confidence}, ${candidate.fileCount} files)`),
    ].join("\n");
  }
  if ("changes" in object && Array.isArray(object.changes)) {
    const changes = object.changes as Array<{ action: string; path: string }>;
    return changes.length === 0 ? "No changes." : changes.map((change) => `- ${change.action}: ${change.path}`).join("\n");
  }
  return JSON.stringify(value, null, 2);
}

async function rootFor(args: ParsedArguments): Promise<string> {
  return findProjectRoot(resolve(flag(args, "root") ?? process.cwd()));
}

async function storedRepositoryHead(root: string): Promise<string | undefined> {
  try {
    const parsed = parseMarkdown(await readFile(resolve(root, ".memory", "index.md"), "utf8"));
    return typeof parsed.data.repository_head === "string" ? parsed.data.repository_head : undefined;
  } catch {
    return undefined;
  }
}

export async function runCli(argv: string[], io: CliIO = {
  stdout: (text) => process.stdout.write(`${text}\n`),
  stderr: (text) => process.stderr.write(`${text}\n`),
}): Promise<number> {
  let args: ParsedArguments;
  try {
    args = parseArguments(argv);
  } catch (error) {
    const message = (error as Error).message;
    io.stderr(argv.includes("--json") ? JSON.stringify({ error: message }) : message);
    return 2;
  }

  if (enabled(args, "help") || !args.command || args.command === "help") {
    io.stdout(HELP.trimEnd());
    return 0;
  }

  const json = enabled(args, "json");
  const dryRun = enabled(args, "dry-run") || enabled(args, "check");
  try {
    const root = await rootFor(args);
    let result: unknown;

    switch (args.command) {
      case "scan": {
        result = await scanRepository(root);
        break;
      }
      case "init":
      case "scaffold": {
        const requested = [...flags(args, "scope"), ...args.positional].filter(Boolean);
        const scan = await scanRepository(root);
        const mutate = () => initializeBundle(root, requested, { dryRun, projectName: basename(root) });
        const initialized = dryRun ? await mutate() : await withBundleLock(root, mutate);
        result = { ...initialized, candidates: scan.candidates };
        break;
      }
      case "sync": {
        const scan = await scanRepository(root);
        const since = await storedRepositoryHead(root);
        const changed = await changedRepositoryPaths(root, since);
        const scopes = flags(args, "scope");
        const knownScopes = scopes.length > 0 ? scopes : await discoverTrackedScopes(root);
        const mutate = async () => {
          const sources = await refreshRegisteredSources(root, { dryRun, fetchRemote: enabled(args, "fetch-remote") });
          const changes = await syncIndexes(root, scan, { dryRun });
          const agents = await syncAgentsFile(root, { dryRun });
          const validation = await validateBundle(root);
          return { changedPaths: changed, affectedScopes: mapPathsToScopes(changed, knownScopes), sources, changes: [...changes, agents], validation };
        };
        result = dryRun ? await mutate() : await withBundleLock(root, mutate);
        break;
      }
      case "status": {
        result = await getMemoryStatus(root, flag(args, "scope") ?? args.positional[0]);
        break;
      }
      case "record": {
        const sourceInputs = [...flags(args, "source")];
        if (args.positional.length > 0 && sourceInputs.length === 0 && !flag(args, "event")) sourceInputs.push(args.positional[0]);
        const scope = flag(args, "scope") ?? ".";
        const sourceTextFile = flag(args, "source-text-file");
        const sourceText = flag(args, "source-text") ?? (sourceTextFile ? await readFile(resolve(sourceTextFile), "utf8") : undefined);
        const sourceName = flag(args, "source-name") ?? (sourceTextFile ? basename(sourceTextFile) : "approved-input");
        const sourceKindValue = flag(args, "source-kind") ?? "input";
        if (!["conversation", "brief", "input"].includes(sourceKindValue)) throw new Error("--source-kind must be conversation, brief, or input");
        const sourceKind = sourceKindValue as "conversation" | "brief" | "input";
        const eventFile = flag(args, "event-file");
        const eventText = flag(args, "event") ?? (eventFile ? await readFile(resolve(eventFile), "utf8") : undefined);
        const event = eventText ? JSON.parse(eventText) as Record<string, unknown> : undefined;
        if (sourceInputs.length === 0 && !sourceText && !event) throw new Error("record requires --source, --source-text, --source-text-file, or --event");
        const mutate = async () => {
          const sources = [];
          for (const source of sourceInputs) sources.push(await registerSource(root, source, { dryRun, fetchRemote: /^https?:\/\//i.test(source) }));
          if (sourceText) sources.push(await registerTextSource(root, sourceName, sourceText, sourceKind, { dryRun }));
          const history = event ? await recordEvent(root, scope, event, { dryRun }) : undefined;
          return { sources, history };
        };
        result = dryRun ? await mutate() : await withBundleLock(root, mutate);
        break;
      }
      case "validate": {
        result = await validateBundle(root);
        break;
      }
      case "agents-sync": {
        const mutate = () => syncAgentsFile(root, { dryRun });
        result = dryRun ? await mutate() : await withBundleLock(root, mutate);
        break;
      }
      case "apply": {
        const planFile = flag(args, "plan-file");
        const planText = flag(args, "plan") ?? (planFile ? await readFile(resolve(planFile), "utf8") : undefined);
        if (!planText) throw new Error("apply requires --plan <json> or --plan-file <path>");
        const plan = JSON.parse(planText) as MemoryPlan;
        const mutate = () => applyMemoryPlan(root, plan, { dryRun });
        result = dryRun ? await mutate() : await withBundleLock(root, mutate);
        break;
      }
      default:
        io.stderr(`Unknown command: ${args.command}\n\n${HELP}`);
        return 2;
    }

    io.stdout(json ? JSON.stringify(result, null, 2) : summarize(result));
    if (args.command === "validate" && !(result as { ok: boolean }).ok) return 1;
    if (args.command === "sync" && enabled(args, "check")) {
      const syncResult = result as { changes?: Array<{ action: string }>; sources?: Array<{ changed: boolean; needsIntegration?: boolean }> };
      if (syncResult.changes?.some((change) => change.action !== "skip") || syncResult.sources?.some((source) => source.changed || source.needsIntegration)) return 1;
    }
    return 0;
  } catch (error) {
    io.stderr(json ? JSON.stringify({ error: (error as Error).message }) : `Error: ${(error as Error).message}`);
    return 1;
  }
}

const isMain = process.argv[1] && (
  ["memory", "memory.mjs"].includes(basename(process.argv[1]))
  || import.meta.url === pathToFileURL(resolve(process.argv[1])).href
);
if (isMain) process.exitCode = await runCli(process.argv.slice(2));
