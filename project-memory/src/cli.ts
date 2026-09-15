import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import {
  applyMemoryPlan,
  buildMemoryContext,
  checkPathGovernance,
  discoverTrackedScopes,
  generateMemoryMap,
  getMemoryStatus,
  initializeBundle,
  migrateBundle,
  parseMarkdown,
  recordEvent,
  refreshRegisteredSources,
  registerSource,
  registerTextSource,
  searchMemory,
  syncAgentsFile,
  syncIndexes,
  validateBundle,
  withBundleLock,
  MAX_AUTO_CONTEXT_BYTES,
  type MemoryPlan,
  type PathGovernanceResult,
  type SearchResult,
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
  init                 Create .memory and optional tracked scopes (deep scan by default)
  scaffold             Add one or more tracked scopes
  migrate              Safely upgrade legacy Project Memory bundles to 0.2
  sync                 Detect changed sources and refresh generated indexes
  status               Show goal, source freshness, blockers, and next action
  search               Lexical BM25 search across all .memory documents
  check                Inspect governance holds, constraints, and scope for a code path
  context              Emit the exact context agents should receive
  map                  Generate on-demand codebase treemap & architecture layout
  record               Register a source and/or append a history event
  validate             Validate format, links, lifecycle, and freshness
  agents-sync          Add or repair the managed AGENTS.md block
  apply                Apply a structured memory plan

Common options:
  --root <path>         Project root (default: current directory/Git root)
  --scope <path>        Tracked scope; repeat for multiple scopes
  --for-path <path>     Target repository file path for check command
  --query <text>        Search query keywords (optional; positional query supported)
  --limit <number>      Maximum search results to return (default: 10)
  --drift               Check description and semantic drift during validate
  --strict              Elevate broken links and orphans to errors during validate
  --budget <bytes>      Byte budget for context command (default: 6000)
  --deep                Perform deep codebase ingestion scan during init (default)
  --shallow             Perform skeleton init without deep codebase scan
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
  --toon                Emit compact Token-Oriented Object Notation (TOON) for AI agents
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
      "for-path": { type: "string" },
      query: { type: "string" },
      limit: { type: "string" },
      drift: { type: "boolean" },
      strict: { type: "boolean" },
      budget: { type: "string" },
      deep: { type: "boolean" },
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
      toon: { type: "boolean" },
      json: { type: "boolean" },
      help: { type: "boolean" },
    },
  });
  return { command: positionals[0], positional: positionals.slice(1), flags };
}

const flag = (args: ParsedArguments, name: string) => typeof args.flags[name] === "string" ? args.flags[name] as string : Array.isArray(args.flags[name]) ? (args.flags[name] as string[]).at(-1) : undefined;
const flags = (args: ParsedArguments, name: string) => Array.isArray(args.flags[name]) ? args.flags[name] as string[] : typeof args.flags[name] === "string" ? [args.flags[name] as string] : [];
const enabled = (args: ParsedArguments, name: string) => args.flags[name] === true;

export function formatToon(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) {
    if (value.length === 0) return "results:none";
    if (value[0] && typeof value[0] === "object" && "score" in value[0] && "snippet" in value[0]) {
      const items = value as SearchResult[];
      const lines = items.map((item) => `  ${item.score.toFixed(2)}|${item.relPath}|${item.title}|${item.snippet.replace(/\n/g, " ")}`);
      return `search_results[score|path|title|snippet]:\n${lines.join("\n")}`;
    }
  }
  if (typeof value !== "object") return String(value);

  const object = value as Record<string, unknown>;

  if ("targetPath" in object && "governance" in object && "governingDocuments" in object) {
    const res = object as unknown as PathGovernanceResult;
    const lines = [
      `path:${res.targetPath}|governance:${res.governance}|holds:${res.holds.length}|docs:${res.governingDocuments.length}`,
    ];
    if (res.holds.length > 0) {
      lines.push("holds[path|reason]:");
      for (const h of res.holds) lines.push(`  ${h.path}|${h.reason ?? "none"}`);
    }
    if (res.governingDocuments.length > 0) {
      lines.push("docs[path|type|governance]:");
      for (const d of res.governingDocuments) lines.push(`  ${d.path}|${d.type}|${d.governance ?? "active"}`);
    }
    if (res.constraints.length > 0) {
      lines.push("constraints:");
      for (const c of res.constraints) lines.push(`  - ${c}`);
    }
    return lines.join("\n");
  }

  if ("diagnostics" in object && "counts" in object) {
    const counts = object.counts as Record<string, number>;
    const diagnostics = (object.diagnostics ?? []) as Array<{ severity: string; path?: string; message: string }>;
    const head = `ok:${object.ok}|docs:${counts.documents ?? 0}|scopes:${counts.scopes ?? 0}|sources:${counts.sources ?? 0}|errors:${counts.errors ?? 0}|warnings:${counts.warnings ?? 0}`;
    if (diagnostics.length === 0) return `${head}\ndiagnostics:none`;
    const diagLines = diagnostics.slice(0, 30).map((d) => `  ${d.severity}|${d.path ?? "bundle"}|${d.message}`);
    return `${head}\ndiagnostics[severity|path|message]:\n${diagLines.join("\n")}`;
  }

  if ("candidates" in object && "files" in object) {
    const filesCount = Array.isArray(object.files) ? object.files.length : 0;
    const candidates = (object.candidates ?? []) as Array<{ path: string; fileCount: number; confidence: string }>;
    const head = `root:${object.projectRoot}|git:${object.git}|files:${filesCount}|fingerprint:${object.fingerprint}`;
    if (candidates.length === 0) return `${head}\ncandidates:none`;
    const rows = candidates.map((c) => `  ${c.path}|${c.confidence}|${c.fileCount}`);
    return `${head}\ncandidates[path|confidence|files]:\n${rows.join("\n")}`;
  }

  if ("initialized" in object && "sourceCounts" in object) {
    const sc = (object.sourceCounts ?? {}) as Record<string, number>;
    const countsStr = Object.entries(sc).map(([k, v]) => `${k}:${v}`).join(" ");
    const val = object.validation as { ok: boolean; counts?: { errors: number; warnings: number } };
    const valStr = val ? `ok:${val.ok}(err:${val.counts?.errors ?? 0},warn:${val.counts?.warnings ?? 0})` : "none";
    const lines = [
      `init:${object.initialized}|root:${object.root}${object.activeScope ? `|scope:${object.activeScope}` : ""}`,
      `goal:${object.goalStatus ?? "none"}${object.nextAction ? `|next:${object.nextAction}` : ""}`,
      `sources:${countsStr}|val:${valStr}`,
    ];
    if (object.blockers) lines.push(`blockers:${object.blockers}`);
    return lines.join("\n");
  }

  if ("changes" in object && Array.isArray(object.changes)) {
    const changes = object.changes as Array<{ action: string; path: string }>;
    if (changes.length === 0) return "changes:none";
    return `changes[action|path]:\n${changes.map((c) => `  ${c.action}|${c.path}`).join("\n")}`;
  }

  if ("treemap" in object) {
    const head = `root:${object.root ?? object.projectRoot}|files:${object.files ?? object.filesCount ?? 0}`;
    return `${head}\n${object.treemap}`;
  }

  return Object.entries(object)
    .map(([k, v]) => (v && typeof v === "object" ? `${k}:${JSON.stringify(v)}` : `${k}:${v}`))
    .join(" | ");
}

function summarize(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) {
    if (value.length === 0) return "No results found.";
    if (value[0] && typeof value[0] === "object" && "score" in value[0] && "snippet" in value[0]) {
      const items = value as SearchResult[];
      const lines = [`Found ${items.length} matching document(s):`];
      for (const item of items) {
        lines.push(`- [${item.score.toFixed(2)}] ${item.relPath} (${item.title}) [${item.matchedField}]`);
        lines.push(`  Snippet: ${item.snippet.replace(/\s+/g, " ").trim()}`);
      }
      return lines.join("\n");
    }
  }
  if (typeof value !== "object") return String(value);
  const object = value as Record<string, unknown>;

  if ("targetPath" in object && "governance" in object && "governingDocuments" in object) {
    const res = object as unknown as PathGovernanceResult;
    const lines = [
      `Path: ${res.targetPath}`,
      `Governance: ${res.governance.toUpperCase()}`,
    ];
    if (res.holds.length > 0) {
      lines.push(`⚠️ ACTIVE HOLDS (${res.holds.length}):`);
      for (const h of res.holds) lines.push(`- ${h.path}: ${h.reason ?? "Subsystem frozen by governance"}`);
    }
    if (res.governingDocuments.length > 0) {
      lines.push(`Governing Documents (${res.governingDocuments.length}):`);
      for (const doc of res.governingDocuments) {
        lines.push(`- ${doc.path} (${doc.type}) [${doc.governance ?? "active"}]`);
      }
    }
    if (res.constraints.length > 0) {
      lines.push(`Constraints & Invariants (${res.constraints.length}):`);
      for (const c of res.constraints) lines.push(`- ${c}`);
    }
    return lines.join("\n");
  }

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
        const shallow = enabled(args, "shallow");
        const deep = !shallow;
        const scan = await scanRepository(root);
        const mutate = () => initializeBundle(root, requested, { dryRun, projectName: basename(root), deep });
        const initialized = dryRun ? await mutate() : await withBundleLock(root, mutate);
        result = { ...initialized, candidates: scan.candidates };
        break;
      }
      case "migrate": {
        const mutate = () => migrateBundle(root, { dryRun });
        result = dryRun ? await mutate() : await withBundleLock(root, mutate);
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
      case "context": {
        const scope = flag(args, "scope") ?? args.positional[0];
        const budgetStr = flag(args, "budget");
        const budget = budgetStr ? parseInt(budgetStr, 10) : undefined;
        const toon = enabled(args, "toon");
        const context = await buildMemoryContext(root, { scope, budget, toon });
        if (context.startsWith("[PROJECT MEMORY ERROR]")) {
          io.stderr(json ? JSON.stringify({ error: context }) : context);
          return 1;
        }
        if (json) {
          result = { context, scope: scope ?? ".", budget: budget ?? MAX_AUTO_CONTEXT_BYTES };
        } else {
          io.stdout(context);
          return 0;
        }
        break;
      }
      case "map": {
        const treemap = await generateMemoryMap(root);
        if (json) {
          const scan = await scanRepository(root);
          result = {
            projectRoot: root,
            fingerprint: scan.fingerprint,
            filesCount: scan.files.length,
            treemap,
          };
        } else if (enabled(args, "toon")) {
          const scan = await scanRepository(root);
          result = {
            root,
            files: scan.files.length,
            treemap,
          };
        } else {
          io.stdout(treemap);
          return 0;
        }
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
      case "search": {
        const query = [flag(args, "query"), ...args.positional].filter(Boolean).join(" ");
        if (!query.trim()) throw new Error("search requires a query string");
        const limitStr = flag(args, "limit");
        const limit = limitStr ? parseInt(limitStr, 10) : 10;
        const scope = flag(args, "scope");
        result = await searchMemory(root, query, { limit, scope });
        break;
      }
      case "check": {
        const targetPath = flag(args, "for-path") ?? args.positional[0];
        if (!targetPath) throw new Error("check requires --for-path <path> or positional path");
        result = await checkPathGovernance(root, targetPath);
        break;
      }
      case "validate": {
        const drift = enabled(args, "drift");
        const strict = enabled(args, "strict");
        result = await validateBundle(root, { drift, strict });
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

    const toon = enabled(args, "toon");
    io.stdout(json ? JSON.stringify(result, null, 2) : toon ? formatToon(result) : summarize(result));
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
