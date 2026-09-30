import { readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import {
  applyMemoryPlan,
  buildMemoryContext,
  bundlePath,
  checkPathGovernance,
  discoverTrackedScopes,
  generateMemoryMap,
  getMemoryStatus,
  initializeBundle,
  listDecisions,
  migrateBundle,
  parseMarkdown,
  readIfExists,
  readLogEntries,
  recordDecision,
  recordEvent,
  rotateLogs,
  refreshRegisteredSources,
  registerSource,
  registerTextSource,
  searchMemory,
  syncAgentsFile,
  syncIndexes,
  validateBundle,
  withBundleLock,
  MAX_AUTO_CONTEXT_BYTES,
  SEMANTIC_EVENT_TYPES,
  type DecisionSummary,
  type LogEntry,
  type MemoryPlan,
  type MemoryStatus,
  type PathGovernanceResult,
  type SearchResult,
} from "./bundle.ts";
import {
  changedRepositoryPaths,
  findProjectRoot,
  mapPathsToScopes,
  scanRepository,
} from "./repository.ts";
import { findRoute, type RouteResult } from "./routing.ts";
import { evaluateEntryPointQuality } from "./entrypoint-quality.ts";
import {
  auditAgentsInstructions,
  applyAgentsReviewPlan,
  type AgentsAuditReport,
  type AgentsReviewPlan,
} from "./agents-review.ts";
import {
  planEntryPointMaintenance,
  applyEntryPointMaintenance,
  readExistingCatalog,
} from "./maintenance.ts";

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

Read (cheap, targeted):
  status               Scopes, decision counts, recent activity, validation
  check <path>         Governing docs, holds, and MUST/NEVER rules for a code path
  decisions            List decisions (id, status, title) without opening files
  log                  Show recent log entries (--recent N, --type, --since, --query, --all)
  search <query>       BM25 search across .memory; returns ranked snippets
  context              Emit the exact context injected into agents
  map                  On-demand codebase treemap
  route                Targeted task and path routing (--task, --for-path, --limit)

Write (validated, atomic):
  log --add            Append a log entry (--type, --title, --summary, --files, --scope)
  decide               Record a decision (--title, --decision, --context, --rejected,
                       --consequences, --code-ref, --supersedes, --approval)
  record               Register a source and/or append a raw event (--event)
  apply                Apply a structured memory plan
  sync                 Refresh fingerprints/indexes, archive old log months
  init | scaffold      Create .memory or add tracked scopes (deep scan by default)
  migrate              Upgrade 0.1/0.2 bundles to 0.3 (archives goal/progress/tasks)
  validate             Validate format, links, budgets, drift (--entrypoints, --quality)
  agents-sync          Add or repair the managed AGENTS.md block (--check, --review)
  scan                 Inspect repository files and propose tracked scopes

Common options:
  --root <path>  --scope <path>  --json  --toon  --dry-run  --help
  --limit <n> / --recent <n>  --type <t> (repeatable)  --since YYYY-MM-DD  --query <text>
  --all (include archived log months)  --drift  --strict  --check  --fetch-remote
  --shallow  --budget <bytes>  --source <path|url>  --source-text[-file]  --plan[-file]  --event[-file]
  --task <intent>  --entrypoints  --quality  --review
`;

function parseArguments(argv: string[]): ParsedArguments {
  const { values: flags, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      root: { type: "string" },
      scope: { type: "string", multiple: true },
      "for-path": { type: "string" },
      task: { type: "string" },
      query: { type: "string" },
      limit: { type: "string" },
      drift: { type: "boolean" },
      strict: { type: "boolean" },
      entrypoints: { type: "boolean" },
      quality: { type: "boolean" },
      review: { type: "boolean" },
      "apply-review": { type: "string" },
      budget: { type: "string" },
      deep: { type: "boolean" },
      shallow: { type: "boolean" },
      add: { type: "boolean" },
      all: { type: "boolean" },
      recent: { type: "string" },
      type: { type: "string", multiple: true },
      since: { type: "string" },
      title: { type: "string" },
      summary: { type: "string" },
      files: { type: "string", multiple: true },
      decision: { type: "string" },
      context: { type: "string" },
      rejected: { type: "string", multiple: true },
      consequences: { type: "string" },
      "code-ref": { type: "string", multiple: true },
      supersedes: { type: "string" },
      approval: { type: "string" },
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
    if (isLogEntryList(value)) {
      return `log[date|scope|type|title]:\n${value.map((e) => `  ${e.date}|${e.scope}|${e.type}|${e.title}`).join("\n")}`;
    }
    if (isDecisionList(value)) {
      return `decisions[id|status|date|title]:\n${value.map((d) => `  ${d.id}|${d.status}|${d.date ?? "-"}|${d.title}`).join("\n")}`;
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
    const status = object as unknown as MemoryStatus;
    const sc = Object.entries(status.sourceCounts ?? {}).map(([k, v]) => `${k}:${v}`).join(" ") || "none";
    const val = status.validation;
    const lines = [
      `init:${status.initialized}|version:${status.version ?? "none"}|scopes:${status.scopes.length}`,
      `decisions:accepted:${status.decisions.accepted} superseded:${status.decisions.superseded}|sources:${sc}|val:ok:${val.ok}(err:${val.counts.errors},warn:${val.counts.warnings})`,
    ];
    if (status.recent.length) lines.push(formatToon(status.recent));
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

  if ("matches" in object && "query" in object) {
    const res = object as unknown as RouteResult;
    const lines = [`route[scope|confidence|reason]:`];
    for (const m of res.matches) {
      lines.push(`  ${m.scope}|${m.confidence}|${m.reason}`);
    }
    return lines.join("\n");
  }

  if ("target" in object && "recommendedEdits" in object && "findings" in object) {
    const res = object as unknown as AgentsAuditReport;
    const lines = [`audit:${res.target}|bytes:${res.byteLength}|markers:${res.hasMarkers}`];
    for (const f of res.findings) {
      lines.push(`  [${f.severity}] ${f.code}: ${f.message}`);
    }
    return lines.join("\n");
  }

  return Object.entries(object)
    .map(([k, v]) => (v && typeof v === "object" ? `${k}:${JSON.stringify(v)}` : `${k}:${v}`))
    .join(" | ");
}

function isLogEntryList(value: unknown[]): value is LogEntry[] {
  return typeof value[0] === "object" && value[0] !== null && "date" in value[0] && "archived" in value[0];
}

function isDecisionList(value: unknown[]): value is DecisionSummary[] {
  return typeof value[0] === "object" && value[0] !== null && "id" in value[0] && "status" in value[0] && "path" in value[0];
}

function summarizeLog(entries: LogEntry[]): string {
  return entries.map((e) => {
    const detail = e.body.split("\n").filter((l) => /^-\s+\*\*(Summary|Files|Decision|Why|Evidence):\*\*/.test(l)).map((l) => `    ${l.trim()}`);
    return [`- ${e.date} [${e.type}] ${e.title}${e.scope === "." ? "" : ` (${e.scope})`}${e.archived ? " (archived)" : ""}`, ...detail].join("\n");
  }).join("\n");
}

function summarize(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) {
    if (value.length === 0) return "No results found.";
    if (isLogEntryList(value)) return summarizeLog(value);
    if (isDecisionList(value)) return value.map((d) => `- ${d.id} [${d.status}] ${d.title} → ${d.path}`).join("\n");
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

  if ("matches" in object && "query" in object) {
    const res = object as unknown as RouteResult;
    const lines = [`Route for ${res.query.task ? `task "${res.query.task}"` : `path "${res.query.path}"`}:`];
    for (const m of res.matches) {
      lines.push(`- Scope: ${m.scope} [${m.confidence}] (${m.reason})`);
      if (m.startPaths.length > 0) lines.push(`  Start: ${m.startPaths.join(", ")}`);
      if (m.governingDocuments.length > 0) lines.push(`  Governing: ${m.governingDocuments.join(", ")}`);
      if (m.verificationCommands.length > 0) lines.push(`  Verify: ${m.verificationCommands.map(c => c.argv.join(" ")).join("; ")}`);
    }
    if (res.fallback) lines.push(`Fallback: ${res.fallback.command} (${res.fallback.explanation})`);
    return lines.join("\n");
  }

  if ("target" in object && "recommendedEdits" in object && "findings" in object) {
    const res = object as unknown as AgentsAuditReport;
    const lines = [`Audit for ${res.target} (${res.byteLength} bytes, markers: ${res.hasMarkers ? "valid" : "invalid"}):`];
    for (const f of res.findings) {
      lines.push(`- [${f.severity.toUpperCase()}] ${f.code}: ${f.message}`);
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
  if ("initialized" in object && "sourceCounts" in object) {
    const status = object as unknown as MemoryStatus;
    if (!status.initialized) return "Project Memory is not initialized. Run `memory init`.";
    const lines = [
      `Memory ${status.version ?? "?"} · ${status.scopes.length} scope(s) · decisions: ${status.decisions.accepted} accepted, ${status.decisions.superseded} superseded`,
      `Validation: ${status.validation.ok ? "ok" : "invalid"} (${status.validation.counts.errors} error(s), ${status.validation.counts.warnings} warning(s))`,
    ];
    if (status.recent.length) lines.push("Recent:", summarizeLog(status.recent));
    return lines.join("\n");
  }
  if ("decision" in object && "changes" in object) {
    const d = object.decision as DecisionSummary;
    return `Recorded ${d.id}: ${d.title} → ${d.path}`;
  }
  if ("path" in object && "action" in object && Object.keys(object).every((k) => ["path", "action", "beforeHash", "afterHash"].includes(k))) {
    return `${object.action}: ${object.path}`;
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

function operationRequiresApprovalForEvent(event: Record<string, unknown>): boolean {
  return SEMANTIC_EVENT_TYPES.has(String(event.type ?? "").toLowerCase());
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
        if (!dryRun) {
          const plan = await planEntryPointMaintenance(root, "init");
          const maintenanceChanges = await applyEntryPointMaintenance(root, plan);
          initialized.changes.push(...maintenanceChanges);
        }
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
          const rotated = await rotateLogs(root, { dryRun });
          const changes = [...rotated, ...await syncIndexes(root, scan, { dryRun })];
          const validation = await validateBundle(root);
          return { changedPaths: changed, affectedScopes: mapPathsToScopes(changed, knownScopes), sources, changes, validation };
        };
        const syncRes = dryRun ? await mutate() : await withBundleLock(root, mutate);
        const plan = await planEntryPointMaintenance(root, "sync");
        const maintenanceChanges = await applyEntryPointMaintenance(root, plan, { dryRun });
        syncRes.changes.push(...maintenanceChanges);
        result = syncRes;
        break;
      }
      case "status": {
        result = await getMemoryStatus(root);
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
      case "log": {
        const scope = flag(args, "scope");
        if (enabled(args, "add")) {
          const title = flag(args, "title") ?? args.positional.join(" ");
          if (!title.trim()) throw new Error("log --add requires --title <text>");
          const types = flags(args, "type");
          const event: Record<string, unknown> = {
            type: types[0] ?? "note",
            title,
            summary: flag(args, "summary"),
            files: flags(args, "files").length ? flags(args, "files") : undefined,
            approval: flag(args, "approval"),
          };
          if (operationRequiresApprovalForEvent(event) && !flag(args, "approval")?.trim()) {
            throw new Error(`Log type '${event.type}' changes project meaning; pass --approval "<user's approval>" after asking the user`);
          }
          const mutate = () => recordEvent(root, scope ?? ".", event, { dryRun });
          result = dryRun ? await mutate() : await withBundleLock(root, async () => {
            const change = await mutate();
            await syncIndexes(root);
            return change;
          });
          break;
        }
        const limitStr = flag(args, "recent") ?? flag(args, "limit");
        const limit = limitStr ? Number.parseInt(limitStr, 10) : 10;
        if (!Number.isFinite(limit) || limit < 0) throw new Error("--recent/--limit must be a non-negative integer");
        const since = flag(args, "since");
        if (since && !/^\d{4}-\d{2}-\d{2}$/.test(since)) throw new Error("--since must be YYYY-MM-DD");
        result = await readLogEntries(root, {
          scope,
          limit,
          types: flags(args, "type").length ? flags(args, "type") : undefined,
          since,
          query: flag(args, "query") ?? (args.positional.join(" ") || undefined),
          includeArchive: enabled(args, "all"),
        });
        break;
      }
      case "decisions": {
        const all = await listDecisions(root);
        const types = flags(args, "type");
        result = enabled(args, "all") ? all : all.filter((d) => types.length ? types.includes(d.status) : d.status === "accepted");
        break;
      }
      case "decide": {
        const title = flag(args, "title");
        const decision = flag(args, "decision");
        const approvalReason = flag(args, "approval");
        if (!title || !decision) throw new Error("decide requires --title and --decision");
        if (!approvalReason?.trim()) throw new Error("decide requires --approval \"<user's approval>\"; ask the user first");
        const mutate = () => recordDecision(root, {
          title,
          decision,
          context: flag(args, "context"),
          rejected: flags(args, "rejected"),
          consequences: flag(args, "consequences"),
          codeRefs: flags(args, "code-ref"),
          supersedes: flag(args, "supersedes"),
          approvalReason,
        }, { dryRun, scope: flag(args, "scope") });
        result = dryRun ? await mutate() : await withBundleLock(root, mutate);
        break;
      }
      case "check": {
        const targetPath = flag(args, "for-path") ?? args.positional[0];
        if (!targetPath) throw new Error("check requires --for-path <path> or positional path");
        result = await checkPathGovernance(root, targetPath);
        break;
      }
      case "route": {
        const catalog = (await readExistingCatalog(root)) ?? (await planEntryPointMaintenance(root, "sync")).catalog;
        const task = flag(args, "task");
        const path = flag(args, "for-path") ?? args.positional[0];
        const limitStr = flag(args, "limit");
        const limit = limitStr ? Number.parseInt(limitStr, 10) : undefined;
        result = findRoute(catalog, { task, path, limit });
        break;
      }
      case "validate": {
        const drift = enabled(args, "drift");
        const strict = enabled(args, "strict");
        const valRes = await validateBundle(root, { drift, strict });
        if (enabled(args, "entrypoints") || enabled(args, "quality")) {
          const catalog = await readExistingCatalog(root);
          if (!catalog) {
            valRes.ok = false;
            valRes.diagnostics.push({ severity: "error", code: "missing-catalog", path: ".memory/.meta/entrypoints.json", message: "Entrypoint catalog is missing; run memory sync" });
            result = valRes;
          } else {
            const agentsContent = await readIfExists(join(root, "AGENTS.md"));
            const indexContent = await readIfExists(join(bundlePath(root), "index.md"));
            const qualityReport = evaluateEntryPointQuality(catalog, { agentsContent, indexContent });
            result = {
              ...valRes,
              entrypoints: {
                catalogOk: true,
                quality: qualityReport,
              },
            };
            if (!qualityReport.passedSafetyGates || (strict && qualityReport.score < 90)) {
              valRes.ok = false;
            }
          }
        } else {
          result = valRes;
        }
        break;
      }
      case "agents-sync": {
        if (enabled(args, "review")) {
          const catalog = await readExistingCatalog(root);
          result = await auditAgentsInstructions(root, catalog);
          break;
        }
        const plan = await planEntryPointMaintenance(root, "agents-sync");
        const mutate = () => applyEntryPointMaintenance(root, plan, { dryRun });
        result = await mutate();
        break;
      }
      case "apply-review": {
        const planPath = flag(args, "apply-review") ?? flag(args, "plan-file") ?? args.positional[0];
        if (!planPath) throw new Error("apply-review requires plan file path");
        const raw = await readFile(resolve(planPath), "utf8");
        const plan = JSON.parse(raw) as AgentsReviewPlan;
        const approval = flag(args, "approval");
        if (!approval) throw new Error("apply-review requires --approval \"<user approval>\"");
        result = await applyAgentsReviewPlan(root, plan, { approval, dryRun });
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
