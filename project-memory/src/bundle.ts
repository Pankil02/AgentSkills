import { createHash, randomUUID } from "node:crypto";
import { cp, open, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import { Document, isMap, parseDocument } from "yaml";
import {
  assertSafeRelativePath,
  containsLikelySecret,
  deepScanRepository,
  fingerprintSource,
  generateTreemapContent,
  isExcludedPath,
  isPathInside,
  type DeepScanResult,
  type RepositoryScan,
  repositoryHead,
  scanRepository,
} from "./repository.ts";

export const MEMORY_DIRECTORY = ".memory";
export const MEMORY_VERSION = "0.1";
export const RESERVED_FILES = new Set(["index.md", "log.md"]);

const GOAL_STATUSES = new Set([
  "draft",
  "interviewing",
  "awaiting-approval",
  "ready",
  "active",
  "blocked",
  "verifying",
  "complete",
  "archived",
]);
const SOURCE_STATUSES = new Set(["new", "integrated", "changed", "stale", "unavailable", "rejected"]);
const GOAL_TRANSITIONS: Record<string, Set<string>> = {
  draft: new Set(["interviewing", "archived"]),
  interviewing: new Set(["draft", "awaiting-approval", "archived"]),
  "awaiting-approval": new Set(["interviewing", "ready", "archived"]),
  ready: new Set(["active", "archived"]),
  active: new Set(["blocked", "verifying", "archived"]),
  blocked: new Set(["active", "archived"]),
  verifying: new Set(["active", "blocked", "complete"]),
  complete: new Set(["active", "archived"]),
  archived: new Set(["draft"]),
};
const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/;
const CORE_FILES = ["index.md", "goal.md", "progress.md", "log.md"] as const;
const MAX_CONTEXT_PREVIEW = 20_000;

export type Severity = "error" | "warning";

export interface Diagnostic {
  severity: Severity;
  code: string;
  message: string;
  path?: string;
}

export interface ParsedMarkdown {
  data: Record<string, unknown>;
  body: string;
  document?: Document.Parsed;
  hasFrontmatter: boolean;
  errors: string[];
}

export interface FileChange {
  path: string;
  action: "create" | "update" | "skip";
  beforeHash?: string;
  afterHash?: string;
}

export interface InitResult {
  root: string;
  bundle: string;
  scopes: string[];
  changes: FileChange[];
}

export interface SourceRecordResult {
  path: string;
  resource: string;
  hash: string;
  status: "new" | "integrated" | "changed" | "stale" | "unavailable" | "rejected";
  changed: boolean;
  needsIntegration: boolean;
  affectedDocuments?: string[];
  contentPreview?: string;
}

export interface ValidationResult {
  ok: boolean;
  diagnostics: Diagnostic[];
  counts: {
    documents: number;
    scopes: number;
    sources: number;
    errors: number;
    warnings: number;
  };
}

export interface CompletionReadiness {
  ready: boolean;
  criteria: string[];
  verified: string[];
  missing: string[];
}

export interface MemoryStatus {
  initialized: boolean;
  root: string;
  activeScope?: string;
  goalStatus?: string;
  nextAction?: string;
  blockers?: string;
  sourceCounts: Record<string, number>;
  validation: ValidationResult;
}

export interface MemoryOperation {
  action: "write_document" | "update_frontmatter" | "replace_generated" | "append_log" | "sync_indexes";
  path?: string;
  content?: string;
  region?: string;
  values?: Record<string, unknown>;
  scope?: string;
  event?: Record<string, unknown>;
  semantic?: boolean;
  expectedHash?: string;
}

export interface MemoryPlan {
  approved?: boolean;
  approvalReason?: string;
  operations: MemoryOperation[];
}

export interface ApplyResult {
  changes: FileChange[];
  validation?: ValidationResult;
}

function normalizeSlash(path: string): string {
  return path.split(sep).join("/");
}

function nowIso(now = new Date()): string {
  return now.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function today(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function hashText(content: string): string {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

function titleFromPath(path: string): string {
  if (!path || path === ".") return "Project";
  return basename(path)
    .replace(/[-_.]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function yamlScalar(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

export function parseMarkdown(content: string): ParsedMarkdown {
  const match = FRONTMATTER_PATTERN.exec(content);
  if (!match) return { data: {}, body: content, hasFrontmatter: false, errors: [] };
  const document = parseDocument(match[1], { customTags: [] });
  const errors = [
    ...document.errors.map((error) => error.message),
    ...document.warnings.filter((warning) => /unresolved tag/i.test(warning.message)).map((warning) => warning.message),
  ];
  let value: unknown = {};
  if (errors.length === 0) {
    try {
      value = document.toJS({ maxAliasCount: 0 });
    } catch (error) {
      errors.push((error as Error).message);
    }
  }
  const data = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  if (errors.length === 0 && value !== null && (typeof value !== "object" || Array.isArray(value))) errors.push("Frontmatter must be a YAML mapping");
  return { data, body: match[2], document, hasFrontmatter: true, errors };
}

export function serializeMarkdown(data: Record<string, unknown>, body: string): string {
  const document = new Document(data);
  const yaml = document.toString({ lineWidth: 0 }).trimEnd();
  return `---\n${yaml}\n---\n${body.replace(/^\n+/, "").replace(/\s*$/, "")}\n`;
}

export function updateMarkdownFrontmatter(content: string, values: Record<string, unknown>): string {
  const parsed = parseMarkdown(content);
  if (!parsed.hasFrontmatter || parsed.errors.length > 0 || !parsed.document) {
    if (parsed.errors.length > 0) throw new Error(`Invalid YAML frontmatter: ${parsed.errors.join("; ")}`);
    return serializeMarkdown(values, parsed.body);
  }
  if (!isMap(parsed.document.contents)) throw new Error("Frontmatter must be a YAML mapping");
  for (const [key, value] of Object.entries(values)) parsed.document.set(key, value);
  const yaml = parsed.document.toString({ lineWidth: 0 }).trimEnd();
  return `---\n${yaml}\n---\n${parsed.body.replace(/^\n+/, "").replace(/\s*$/, "")}\n`;
}

export function validateGeneratedMarkers(content: string): string[] {
  const diagnostics: string[] = [];
  const regions = new Map<string, { starts: number; ends: number; start: number; end: number }>();
  const markerPattern = /<!--\s*memory:generated:(start|end)\s+([a-z0-9_-]+)\s*-->/gi;
  let activeRegion: string | undefined;
  for (const match of content.matchAll(markerPattern)) {
    const [, kind, name] = match;
    const region = regions.get(name) ?? { starts: 0, ends: 0, start: -1, end: -1 };
    if (kind.toLowerCase() === "start") {
      region.starts++;
      if (region.start < 0) region.start = match.index;
      if (activeRegion) diagnostics.push(`Generated regions may not overlap or nest ('${activeRegion}' and '${name}')`);
      activeRegion = name;
    } else if (activeRegion !== name) {
      region.ends++;
      if (region.end < 0) region.end = match.index;
      diagnostics.push(`Generated region end '${name}' does not match active region '${activeRegion ?? "none"}'`);
      activeRegion = undefined;
    } else {
      region.ends++;
      if (region.end < 0) region.end = match.index;
      activeRegion = undefined;
    }
    regions.set(name, region);
  }
  if (activeRegion) diagnostics.push(`Generated region '${activeRegion}' is not closed`);
  for (const [name, region] of regions) {
    if (region.starts !== 1 || region.ends !== 1) {
      diagnostics.push(`Generated region '${name}' must contain exactly one start and one end marker`);
      continue;
    }
    if (region.start > region.end) diagnostics.push(`Generated region '${name}' has reversed markers`);
  }
  return diagnostics;
}

export function replaceGeneratedRegion(content: string, name: string, generated: string): string {
  if (!/^[a-z0-9_-]+$/.test(name)) throw new Error(`Invalid generated region name: ${name}`);
  const errors = validateGeneratedMarkers(content);
  if (errors.length > 0) throw new Error(errors.join("; "));
  const startMarker = `<!-- memory:generated:start ${name} -->`;
  const endMarker = `<!-- memory:generated:end ${name} -->`;
  const start = content.indexOf(startMarker);
  const end = content.indexOf(endMarker);
  if (start < 0 || end < 0 || start > end) throw new Error(`Generated region not found: ${name}`);
  const normalized = generated.trim();
  const replacement = normalized ? `${startMarker}\n${normalized}\n${endMarker}` : `${startMarker}\n${endMarker}`;
  return `${content.slice(0, start)}${replacement}${content.slice(end + endMarker.length)}`;
}

function bundlePath(projectRoot: string): string {
  return resolve(projectRoot, MEMORY_DIRECTORY);
}

function safeBundleFile(projectRoot: string, relativePath: string): string {
  const safe = assertSafeRelativePath(relativePath);
  const root = bundlePath(projectRoot);
  const target = safe === "." ? root : resolve(root, safe);
  if (!isPathInside(root, target)) throw new Error(`Path escapes ${MEMORY_DIRECTORY}: ${relativePath}`);
  return target;
}

async function assertNotSymlink(path: string): Promise<void> {
  try {
    if ((await lstat(path)).isSymbolicLink()) throw new Error(`Refusing to write through symbolic link: ${path}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

async function assertNoBundleParentSymlink(path: string): Promise<void> {
  let memoryAncestor: string | undefined;
  let probe = dirname(path);
  while (dirname(probe) !== probe) {
    if (basename(probe) === MEMORY_DIRECTORY) {
      memoryAncestor = probe;
      break;
    }
    probe = dirname(probe);
  }
  if (!memoryAncestor) return;
  let current = dirname(path);
  while (isPathInside(memoryAncestor, current)) {
    try {
      if ((await lstat(current)).isSymbolicLink()) throw new Error(`Refusing to write through symbolic-link directory: ${current}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (current === memoryAncestor) break;
    current = dirname(current);
  }
}

async function atomicWrite(path: string, content: string): Promise<void> {
  await assertNoBundleParentSymlink(path);
  await mkdir(dirname(path), { recursive: true });
  await assertNotSymlink(path);
  let mode = 0o644;
  try {
    mode = (await stat(path)).mode & 0o777;
  } catch {
    // New documents use portable owner-writable Markdown permissions.
  }
  const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`);
  await writeFile(temporary, content, { encoding: "utf8", mode });
  await rename(temporary, path);
}

async function readIfExists(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function assertWritableBundleVersion(projectRoot: string, allowMissing = false): Promise<void> {
  const path = join(bundlePath(projectRoot), "index.md");
  const content = await readIfExists(path);
  if (content === undefined) {
    if (allowMissing) return;
    throw new Error("Project Memory is not initialized");
  }
  const parsed = parseMarkdown(content);
  if (!parsed.hasFrontmatter || parsed.errors.length > 0) throw new Error("Root index has invalid frontmatter; repair it before mutation");
  if (parsed.data.memory_version !== MEMORY_VERSION) {
    throw new Error(`Unsupported writable memory_version: ${String(parsed.data.memory_version)} (expected ${MEMORY_VERSION})`);
  }
}

async function assertValidForMutation(projectRoot: string): Promise<void> {
  const validation = await validateBundle(projectRoot);
  if (!validation.ok) {
    throw new Error(`Refusing to mutate an invalid bundle: ${validation.diagnostics.filter((item) => item.severity === "error").map((item) => `${item.path ?? "bundle"}: ${item.message}`).join("; ")}`);
  }
}

async function plannedWrite(path: string, content: string, dryRun: boolean, overwrite = true): Promise<FileChange> {
  const before = await readIfExists(path);
  if (before !== undefined && !overwrite) return { path, action: "skip", beforeHash: hashText(before), afterHash: hashText(before) };
  if (before === content) return { path, action: "skip", beforeHash: hashText(before), afterHash: hashText(content) };
  if (!dryRun) await atomicWrite(path, content);
  return {
    path,
    action: before === undefined ? "create" : "update",
    beforeHash: before === undefined ? undefined : hashText(before),
    afterHash: hashText(content),
  };
}

function rootIndexTemplate(projectName: string, timestamp: string, head?: string): string {
  return serializeMarkdown({
    memory_version: MEMORY_VERSION,
    title: `${projectName} Project Memory`,
    description: "Project memory root.",
    timestamp,
    repository_head: head ?? null,
    repository_fingerprint: null,
    last_scan_at: null,
    active_scope: ".",
  }, `# Project Memory

## Current focus

<!-- memory:generated:start focus -->
<!-- memory:generated:end focus -->

## Tracked scopes

<!-- memory:generated:start scopes -->
<!-- memory:generated:end scopes -->

## Codebase structure

<!-- memory:generated:start treemap -->
<!-- memory:generated:end treemap -->

## Documents

<!-- memory:generated:start documents -->
<!-- memory:generated:end documents -->

## Sources

<!-- memory:generated:start sources -->
<!-- memory:generated:end sources -->`);
}

function indexTemplate(title: string): string {
  return `# ${title}\n\n## Child directories\n\n<!-- memory:generated:start children -->\n<!-- memory:generated:end children -->\n\n## Documents\n\n<!-- memory:generated:start documents -->\n<!-- memory:generated:end documents -->\n\n## Source files\n\n<!-- memory:generated:start files -->\n<!-- memory:generated:end files -->\n\n## Tests\n\n<!-- memory:generated:start tests -->\n<!-- memory:generated:end tests -->\n`;
}

function goalTemplate(scope: string, timestamp: string, initialContext?: string): string {
  const title = titleFromPath(scope);
  let body = `# Goal\n\n## Motivation\n\nPending interview.\n\n## User & outcome\n\n## Success measures\n\n## Scope & non-goals\n\n## Confirmed wants\n\n## Must-not rules\n\n## Requirements\n\n## Acceptance criteria\n\nUse stable IDs in the \`AC-NNN\` form. Each criterion must be independently verifiable.\n\n## Constraints & dependencies\n`;
  if (initialContext) {
    body += `\n### Context from AGENTS.md\n\n${initialContext}\n`;
  }
  body += `\n## Decisions & reversals\n\n## Questions & unresolved\n\n## Interview coverage\n\n- **Decisions:** 0 / ${scope === "." ? "10–20" : "10–15"}\n- **State:** pending\n\n## Citations`;
  return serializeMarkdown({
    type: "Goal",
    title: `${title} goal`,
    description: `Goal for ${scope === "." ? "project" : scope}.`,
    timestamp,
    scope,
    status: "draft",
    provenance: initialContext ? "observed" : "unresolved",
    uid: randomUUID(),
  }, body);
}

function progressTemplate(scope: string, timestamp: string): string {
  const title = titleFromPath(scope);
  return serializeMarkdown({
    type: "Progress",
    title: `${title} progress`,
    description: `Progress for ${scope === "." ? "project" : scope}.`,
    timestamp,
    scope,
    goal: "./goal.md",
    uid: randomUUID(),
  }, `# Progress

## Current state

Not started.

## Completed work

## Current work

## Blockers & drift

## Acceptance evidence

| Criterion | Status | Evidence |
|---|---|---|

## Latest verification

## Next action

- **Action:** Complete interview.
- **Reason:** Intent pending approval.
- **Requirement:** Unresolved.
- **Likely files:** Unknown.
- **Verification:** User approval.
- **Approval:** pending

## Handoff

Continue interview.`);
}

function logTemplate(scope: string, timestamp: Date): string {
  return `# ${titleFromPath(scope)} History\n\n## ${today(timestamp)}\n\n### Initialization\n- **Update:** Initialized \`${scope}\` memory.\n- **Evidence:** System init.\n`;
}

function allDirectoryPrefixes(scope: string): string[] {
  if (scope === ".") return [];
  const parts = scope.split("/");
  return parts.map((_, index) => parts.slice(0, index + 1).join("/"));
}

function scopeDirectory(projectRoot: string, scope: string): string {
  return scope === "." ? bundlePath(projectRoot) : safeBundleFile(projectRoot, scope);
}

function relativeChangePath(projectRoot: string, absolute: string): string {
  return normalizeSlash(relative(projectRoot, absolute));
}

function buildDeepGoalContent(scope: string, timestamp: string, initialContext: string | undefined, deepScan: DeepScanResult): string {
  const title = titleFromPath(scope);
  const tech = deepScan.techStack;
  const arch = deepScan.architecture;
  const env = deepScan.environment;

  let body = `# Goal\n\n## Auto-Detected Architecture & Tech Stack\n\n`;

  if (tech.languages.length > 0) body += `- **Languages:** ${tech.languages.join(", ")}\n`;
  if (tech.frameworks.length > 0) body += `- **Frameworks & Libraries:** ${tech.frameworks.join(", ")}\n`;
  if (tech.monorepo) body += `- **Monorepo Structure:** ${tech.monorepo}\n`;
  if (tech.packageManager) body += `- **Package Manager:** ${tech.packageManager}\n`;
  if (tech.buildSystem) body += `- **Build System:** ${tech.buildSystem}\n`;
  if (tech.testingTools.length > 0) body += `- **Testing Stack:** ${tech.testingTools.join(", ")}\n`;

  if (arch.packages.length > 0) {
    body += `\n### Monorepo Packages & Features\n\n`;
    for (const pkg of arch.packages) {
      body += `- **\`${pkg.path}\`**: ${pkg.name || titleFromPath(pkg.path)}${pkg.description ? ` — ${pkg.description}` : ""}\n`;
    }
  }

  if (arch.entryPoints.length > 0) {
    body += `\n### Primary Entry Points\n\n`;
    for (const ep of arch.entryPoints.slice(0, 10)) body += `- \`${ep}\`\n`;
  }

  if (arch.databaseSchemas.length > 0) {
    body += `\n### Database Schemas & Models\n\n`;
    for (const schema of arch.databaseSchemas.slice(0, 10)) body += `- \`${schema}\`\n`;
  }

  if (arch.apiRoutes.length > 0) {
    body += `\n### Discovered API Surface\n\n`;
    for (const route of arch.apiRoutes.slice(0, 15)) body += `- \`${route}\`\n`;
  }

  if (env.envVariables.length > 0) {
    body += `\n### Required Environment Variables\n\n`;
    for (const varName of env.envVariables.slice(0, 20)) body += `- \`${varName}\`\n`;
  }

  if (env.configFiles.length > 0 || env.infrastructure.length > 0) {
    body += `\n### Tooling & Infrastructure Configurations\n\n`;
    for (const config of [...env.configFiles, ...env.infrastructure].slice(0, 15)) body += `- \`${config}\`\n`;
  }

  body += `\n## Motivation\n\nDeep codebase ingestion scan performed during project initialization.\n\n## User & outcome\n\n## Success measures\n\n## Scope & non-goals\n\n## Confirmed wants\n\n## Must-not rules\n\n## Requirements\n\n## Acceptance criteria\n\nUse stable IDs in the \`AC-NNN\` form. Each criterion must be independently verifiable.\n\n## Constraints & dependencies\n`;

  if (initialContext) {
    body += `\n### Context from AGENTS.md\n\n${initialContext}\n`;
  }

  body += `\n## Decisions & reversals\n\n## Questions & unresolved\n\n## Interview coverage\n\n- **Decisions:** 0 / 10–20\n- **State:** pending\n\n## Citations`;

  return serializeMarkdown({
    type: "Goal",
    title: `${title} goal`,
    description: `Goal for project.`,
    timestamp,
    scope: ".",
    status: "draft",
    provenance: "observed",
    uid: randomUUID(),
  }, body);
}

function buildScopeDeepGoalContent(scope: string, timestamp: string, deepScan: DeepScanResult): string {
  const title = titleFromPath(scope);
  const scopeFiles = deepScan.scan.files.filter((f) => f.path.startsWith(`${scope}/`));
  const entryPoints = deepScan.architecture.entryPoints.filter((e) => e.startsWith(`${scope}/`));
  const apiRoutes = deepScan.architecture.apiRoutes.filter((r) => r.startsWith(`${scope}/`));
  const schemas = deepScan.architecture.databaseSchemas.filter((s) => s.startsWith(`${scope}/`));

  let body = `# Goal\n\n## Scope Summary\n\nAuto-scaffolded scope for \`${scope}\` (${scopeFiles.length} files).\n\n`;

  if (entryPoints.length > 0) {
    body += `### Entry Points\n\n`;
    for (const ep of entryPoints) body += `- \`${ep}\`\n`;
    body += `\n`;
  }

  if (apiRoutes.length > 0) {
    body += `### API Routes\n\n`;
    for (const route of apiRoutes) body += `- \`${route}\`\n`;
    body += `\n`;
  }

  if (schemas.length > 0) {
    body += `### Schemas & Models\n\n`;
    for (const schema of schemas) body += `- \`${schema}\`\n`;
    body += `\n`;
  }

  body += `## Motivation\n\nPending interview.\n\n## User & outcome\n\n## Success measures\n\n## Scope & non-goals\n\n## Confirmed wants\n\n## Must-not rules\n\n## Requirements\n\n## Acceptance criteria\n\nUse stable IDs in the \`AC-NNN\` form. Each criterion must be independently verifiable.\n\n## Constraints & dependencies\n\n## Decisions & reversals\n\n## Questions & unresolved\n\n## Interview coverage\n\n- **Decisions:** 0 / 10–15\n- **State:** pending\n\n## Citations`;

  return serializeMarkdown({
    type: "Goal",
    title: `${title} goal`,
    description: `Goal for ${scope}.`,
    timestamp,
    scope,
    status: "draft",
    provenance: "observed",
    uid: randomUUID(),
  }, body);
}

export async function initializeBundle(
  projectRoot: string,
  scopes: string[] = [],
  options: { dryRun?: boolean; now?: Date; projectName?: string; deep?: boolean } = {},
): Promise<InitResult> {
  const root = resolve(projectRoot);
  const memoryRoot = bundlePath(root);
  const dryRun = options.dryRun ?? false;
  const date = options.now ?? new Date();
  const timestamp = nowIso(date);
  const head = await repositoryHead(root);
  await assertWritableBundleVersion(root, true);
  if (await readIfExists(join(bundlePath(root), "index.md")) !== undefined) await assertValidForMutation(root);

  const isDeep = options.deep ?? true;
  const deepScan = isDeep ? await deepScanRepository(root) : undefined;
  let normalizedScopes = [...new Set(scopes.map(assertSafeRelativePath).filter((scope) => scope !== "." && !isExcludedPath(scope)))].sort();

  if (isDeep && deepScan && scopes.length === 0) {
    const autoCandidates = deepScan.scan.candidates
      .filter((candidate) => candidate.confidence === "high" || candidate.confidence === "medium")
      .map((candidate) => candidate.path);
    const packageScopes = deepScan.architecture.packages.map((pkg) => pkg.path);
    const discovered = [...new Set([...autoCandidates, ...packageScopes])]
      .map(assertSafeRelativePath)
      .filter((scope) => scope !== "." && !isExcludedPath(scope))
      .sort();
    normalizedScopes = [...new Set([...normalizedScopes, ...discovered])].sort();
  }

  for (const scope of normalizedScopes) {
    await assertNoBundleParentSymlink(join(scopeDirectory(root, scope), "index.md"));
  }
  const unmanagedAgents = await readUnmanagedAgentsContent(root);
  const changes: FileChange[] = [];

  const rootGoalContent = deepScan
    ? buildDeepGoalContent(".", timestamp, unmanagedAgents, deepScan)
    : goalTemplate(".", timestamp, unmanagedAgents);

  const rootFiles = new Map<string, string>([
    [join(memoryRoot, "index.md"), rootIndexTemplate(options.projectName ?? basename(root), timestamp, head)],
    [join(memoryRoot, "goal.md"), rootGoalContent],
    [join(memoryRoot, "progress.md"), progressTemplate(".", timestamp)],
    [join(memoryRoot, "log.md"), logTemplate(".", date)],
    [join(memoryRoot, "sources", "index.md"), indexTemplate("Sources")],
  ]);
  for (const [path, content] of rootFiles) changes.push({ ...(await plannedWrite(path, content, dryRun, false)), path: relativeChangePath(root, path) });

  const tracked = [".", ...normalizedScopes];
  for (const scope of normalizedScopes) {
    for (const directory of allDirectoryPrefixes(scope)) {
      const path = join(safeBundleFile(root, directory), "index.md");
      changes.push({ ...(await plannedWrite(path, indexTemplate(titleFromPath(directory)), dryRun, false)), path: relativeChangePath(root, path) });
    }
    const directory = scopeDirectory(root, scope);
    const scopeGoalContent = deepScan
      ? buildScopeDeepGoalContent(scope, timestamp, deepScan)
      : goalTemplate(scope, timestamp);
    const files = new Map<string, string>([
      [join(directory, "goal.md"), scopeGoalContent],
      [join(directory, "progress.md"), progressTemplate(scope, timestamp)],
      [join(directory, "log.md"), logTemplate(scope, date)],
    ]);
    for (const [path, content] of files) changes.push({ ...(await plannedWrite(path, content, dryRun, false)), path: relativeChangePath(root, path) });
  }

  if (!dryRun) {
    const agentsChange = await syncAgentsFile(root);
    const freshScan = await scanRepository(root);
    changes.push(...(await syncIndexes(root, freshScan, { dryRun, now: date })).map((change) => ({ ...change, path: relativeChangePath(root, resolve(root, change.path)) })));
    changes.push({ ...agentsChange, path: "AGENTS.md" });
  }

  return { root, bundle: memoryRoot, scopes: tracked, changes };
}

async function walkMemory(root: string, current = root, files: string[] = [], diagnostics: Diagnostic[] = []): Promise<{ files: string[]; diagnostics: Diagnostic[] }> {
  let entries;
  try {
    entries = await readdir(current, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { files, diagnostics };
    throw error;
  }
  for (const entry of entries) {
    if (entry.name === ".lock" || entry.name.endsWith(".tmp")) continue;
    const absolute = join(current, entry.name);
    if (entry.isSymbolicLink()) {
      diagnostics.push({ severity: "error", code: "symlink", path: normalizeSlash(relative(root, absolute)), message: "Symbolic links are not allowed inside the bundle" });
      continue;
    }
    if (entry.isDirectory()) await walkMemory(root, absolute, files, diagnostics);
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(absolute);
  }
  return { files, diagnostics };
}

async function documentMetadata(path: string): Promise<{ title: string; description: string; type?: string; status?: string }> {
  const content = await readIfExists(path);
  if (!content) return { title: titleFromPath(basename(path, extname(path))), description: "" };
  const parsed = parseMarkdown(content);
  const fallback = titleFromPath(basename(path, extname(path)));
  return {
    title: typeof parsed.data.title === "string" ? parsed.data.title : fallback,
    description: typeof parsed.data.description === "string" ? parsed.data.description : "",
    type: typeof parsed.data.type === "string" ? parsed.data.type : undefined,
    status: typeof parsed.data.status === "string" ? parsed.data.status : undefined,
  };
}

function markdownEntry(label: string, target: string, description = ""): string {
  return `- [${label}](${target})${description ? ` — ${description}` : ""}`;
}

function directChildren(directory: string, allDirectories: Set<string>): string[] {
  return [...allDirectories]
    .filter((candidate) => dirname(candidate) === directory && candidate !== directory)
    .sort();
}

function scopeFromMemoryDirectory(memoryRoot: string, directory: string): string {
  const rel = normalizeSlash(relative(memoryRoot, directory));
  return rel || ".";
}

function isTestFile(path: string): boolean {
  return /(?:^|\/)(?:test|tests|__tests__)(?:\/|$)|\.(?:test|spec)\.[^.]+$/i.test(path);
}

function sourceFileLines(projectRoot: string, indexPath: string, scope: string, scan: RepositoryScan | undefined, tests: boolean): string[] {
  if (!scan || scope === "." || scope === "sources" || scope.startsWith("sources/")) return [];
  const direct = scan.files.filter((file) => normalizeSlash(dirname(file.path)) === scope && isTestFile(file.path) === tests);
  return direct.map((file) => {
    return markdownEntry(basename(file.path), `repo://${file.path}`, `${file.extension || "file"}, ${file.size} bytes`);
  });
}

export async function discoverTrackedScopes(projectRoot: string): Promise<string[]> {
  const memoryRoot = bundlePath(projectRoot);
  const walk = await walkMemory(memoryRoot);
  const directories = new Set<string>();
  for (const file of walk.files) {
    if (basename(file) !== "goal.md") continue;
    const directory = dirname(file);
    if (await readIfExists(join(directory, "progress.md")) !== undefined && await readIfExists(join(directory, "log.md")) !== undefined) {
      directories.add(scopeFromMemoryDirectory(memoryRoot, directory));
    }
  }
  return [...directories].sort((a, b) => a === "." ? -1 : b === "." ? 1 : a.localeCompare(b));
}

export async function syncIndexes(projectRoot: string, scan?: RepositoryScan, options: { dryRun?: boolean; now?: Date } = {}): Promise<FileChange[]> {
  const root = resolve(projectRoot);
  const memoryRoot = bundlePath(root);
  const dryRun = options.dryRun ?? false;
  await assertWritableBundleVersion(root, true);
  const walk = await walkMemory(memoryRoot);
  if (walk.files.length === 0) throw new Error(`Project Memory is not initialized at ${memoryRoot}`);

  const directories = new Set<string>([memoryRoot]);
  for (const file of walk.files) {
    let current = dirname(file);
    while (isPathInside(memoryRoot, current)) {
      directories.add(current);
      if (current === memoryRoot) break;
      current = dirname(current);
    }
  }
  const scopes = await discoverTrackedScopes(root);
  const changes: FileChange[] = [];
  const fallbackHead = scan?.head ?? await repositoryHead(root);
  const snapshot = dryRun ? undefined : await captureBundle(root);

  try {
    for (const directory of [...directories].sort()) {
    const scope = scopeFromMemoryDirectory(memoryRoot, directory);
    const indexPath = join(directory, "index.md");
    let content = await readIfExists(indexPath);
    if (!content) content = directory === memoryRoot
      ? rootIndexTemplate(basename(root), nowIso(options.now), fallbackHead)
      : indexTemplate(titleFromPath(scope));

    if (directory === memoryRoot) {
      const rootParsed = parseMarkdown(content);
      if (!rootParsed.hasFrontmatter || rootParsed.errors.length > 0) throw new Error("Root index.md must contain valid frontmatter");
      const activeScope = typeof rootParsed.data.active_scope === "string" ? rootParsed.data.active_scope : ".";
      const progressPath = join(scopeDirectory(root, activeScope), "progress.md");
      const progress = await readIfExists(progressPath);
      const next = progress ? extractSection(progress, "Next action").trim() : "No active next action.";
      content = replaceGeneratedRegion(content, "focus", `- **Active scope:** \`${activeScope}\`\n- **Next action:** ${next ? next.replace(/\n+/g, " ") : "Not set."}`);

      const scopeLines: string[] = [];
      for (const trackedScope of scopes) {
        const goalPath = join(scopeDirectory(root, trackedScope), "goal.md");
        const metadata = await documentMetadata(goalPath);
        const target = trackedScope === "." ? "/goal.md" : `/${trackedScope}/goal.md`;
        scopeLines.push(markdownEntry(trackedScope === "." ? "Project" : trackedScope, target, `${metadata.status ?? "unknown"} — ${metadata.description}`));
      }
      content = replaceGeneratedRegion(content, "scopes", scopeLines.join("\n") || "- No tracked scopes.");

      const repoScan = scan ?? await scanRepository(root);
      const deepScan = await deepScanRepository(root, repoScan);
      const treemapContent = generateTreemapContent(repoScan, deepScan);

      if (!content.includes("<!-- memory:generated:start treemap -->")) {
        if (content.includes("## Documents")) {
          content = content.replace("## Documents", "## Codebase structure\n\n<!-- memory:generated:start treemap -->\n<!-- memory:generated:end treemap -->\n\n## Documents");
        } else {
          content += "\n\n## Codebase structure\n\n<!-- memory:generated:start treemap -->\n<!-- memory:generated:end treemap -->\n";
        }
      }
      content = replaceGeneratedRegion(content, "treemap", treemapContent);

      const directDocuments = walk.files.filter((file) => dirname(file) === memoryRoot && !RESERVED_FILES.has(basename(file)));
      const documentLines = await Promise.all(directDocuments.sort().map(async (file) => {
        const metadata = await documentMetadata(file);
        return markdownEntry(metadata.title, `/${basename(file)}`, metadata.description);
      }));
      content = replaceGeneratedRegion(content, "documents", documentLines.join("\n") || "- No root documents.");

      const sourceFiles = walk.files.filter((file) => dirname(file) === join(memoryRoot, "sources") && basename(file) !== "index.md");
      const sourceLines = await Promise.all(sourceFiles.sort().map(async (file) => {
        const metadata = await documentMetadata(file);
        return markdownEntry(metadata.title, `/sources/${basename(file)}`, metadata.description);
      }));
      content = replaceGeneratedRegion(content, "sources", sourceLines.join("\n") || "- No sources registered.");

      if (scan && ((scan.head ?? null) !== rootParsed.data.repository_head || scan.fingerprint !== rootParsed.data.repository_fingerprint)) {
        content = updateMarkdownFrontmatter(content, {
          repository_head: scan.head ?? null,
          repository_fingerprint: scan.fingerprint,
          last_scan_at: nowIso(options.now),
          timestamp: nowIso(options.now),
        });
      }
    } else {
      const childLines = directChildren(directory, directories).map((child) => {
        const label = basename(child);
        return markdownEntry(titleFromPath(label), `./${label}/`);
      });
      content = replaceGeneratedRegion(content, "children", childLines.join("\n") || "- No child directories.");

      const directDocuments = walk.files.filter((file) => dirname(file) === directory && !RESERVED_FILES.has(basename(file)));
      const documentLines = await Promise.all(directDocuments.sort().map(async (file) => {
        const metadata = await documentMetadata(file);
        return markdownEntry(metadata.title, `./${basename(file)}`, metadata.description);
      }));
      content = replaceGeneratedRegion(content, "documents", documentLines.join("\n") || "- No documents.");
      const fileLines = sourceFileLines(root, indexPath, scope, scan, false);
      content = replaceGeneratedRegion(content, "files", fileLines.join("\n") || "- No direct source files.");
      const testLines = sourceFileLines(root, indexPath, scope, scan, true);
      content = replaceGeneratedRegion(content, "tests", testLines.join("\n") || "- No direct tests.");
    }

    const sourceFingerprint = scan
      ? hashText(scan.files.filter((file) => scope === "." || file.path.startsWith(`${scope}/`)).map((file) => `${file.path}:${file.size}:${file.mtimeMs}`).join("\n"))
      : undefined;
    if (sourceFingerprint && directory !== memoryRoot) {
      const marker = `<!-- memory:source-fingerprint ${sourceFingerprint} -->`;
      content = content.replace(/<!-- memory:source-fingerprint [^>]+ -->\n?/, "");
      content = `${content.trimEnd()}\n\n${marker}\n`;
    }

    const change = await plannedWrite(indexPath, content, dryRun, true);
      changes.push({ ...change, path: relativeChangePath(root, indexPath) });
    }
    return changes;
  } catch (error) {
    if (snapshot) await restoreBundle(root, snapshot);
    throw error;
  }
}

function slugify(value: string): string {
  const base = value.toLowerCase().replace(/^https?:\/\//, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return (base || "source").slice(0, 70);
}

async function findSourceByResource(projectRoot: string, resource: string): Promise<{ path: string; content: string } | undefined> {
  const sourcesRoot = safeBundleFile(projectRoot, "sources");
  const walk = await walkMemory(sourcesRoot);
  for (const path of walk.files) {
    if (basename(path) === "index.md") continue;
    const content = await readFile(path, "utf8");
    const parsed = parseMarkdown(content);
    if (parsed.data.resource === resource) return { path, content };
  }
  return undefined;
}

function sourceTemplate(title: string, resource: string, hash: string, timestamp: string): string {
  return serializeMarkdown({
    type: "Source",
    title,
    description: `Source record for ${resource}.`,
    resource,
    timestamp,
    registered_at: timestamp,
    checked_at: timestamp,
    integrated_at: null,
    source_hash: hash,
    previous_hashes: [],
    integration_status: "new",
    affected_documents: [],
    uid: randomUUID(),
  }, `# Source summary

Pending integration.

## Extracted claims

## Affected documents

## Contradictions and questions

## Citations

- [Raw source](${resource})`);
}

async function updateSourceRecord(
  root: string,
  existing: { path: string; content: string },
  resource: string,
  hash: string,
  contentPreview: string | undefined,
  eventTitle: string,
  dryRun = false,
): Promise<SourceRecordResult> {
  const parsed = parseMarkdown(existing.content);
  const timestamp = nowIso();
  const previousHash = parsed.data.source_hash;
  const changed = previousHash !== hash;
  const status: SourceRecordResult["status"] = changed ? "changed" : parsed.data.integration_status === "integrated" ? "integrated" : "new";
  const previousHashes = Array.isArray(parsed.data.previous_hashes) ? [...parsed.data.previous_hashes] : [];
  if (changed && typeof previousHash === "string" && !previousHashes.some((entry) => typeof entry === "object" && entry !== null && (entry as Record<string, unknown>).hash === previousHash)) {
    previousHashes.push({ hash: previousHash, observed_at: parsed.data.checked_at ?? parsed.data.timestamp ?? timestamp });
  }
  const next = updateMarkdownFrontmatter(existing.content, {
    timestamp: changed ? timestamp : parsed.data.timestamp,
    checked_at: timestamp,
    source_hash: hash,
    previous_hashes: previousHashes,
    integration_status: status,
    integrated_at: changed ? null : parsed.data.integrated_at,
  });
  const path = normalizeSlash(relative(root, existing.path));
  const event = { type: "source-change", title: eventTitle, resource, previous_hash: previousHash, source_hash: hash, source_record: path };
  if (changed) assertSafeEvent(event);
  if (!dryRun && next !== existing.content) await atomicWrite(existing.path, next);
  if (!dryRun && changed) await recordEvent(root, ".", event);
  if (!dryRun) await syncIndexes(root);
  return {
    path,
    resource,
    hash,
    status,
    changed,
    needsIntegration: status === "new" || status === "changed",
    affectedDocuments: Array.isArray(parsed.data.affected_documents) ? parsed.data.affected_documents.filter((item): item is string => typeof item === "string") : [],
    contentPreview: contentPreview?.slice(0, MAX_CONTEXT_PREVIEW),
  };
}

export async function registerSource(projectRoot: string, input: string, options: { dryRun?: boolean; fetchRemote?: boolean } = {}): Promise<SourceRecordResult> {
  const root = resolve(projectRoot);
  await assertWritableBundleVersion(root);
  await assertValidForMutation(root);
  const fingerprint = await fingerprintSource(root, input, options.fetchRemote ?? /^https?:\/\//i.test(input));
  const existing = await findSourceByResource(root, fingerprint.resource);
  const timestamp = nowIso();

  if (existing) {
    return updateSourceRecord(root, existing, fingerprint.resource, fingerprint.hash, fingerprint.content, "Source fingerprint changed", options.dryRun);
  }

  const sourceName = fingerprint.resource.startsWith("repo://")
    ? basename(fingerprint.resource.slice("repo://".length))
    : new URL(fingerprint.resource).hostname + new URL(fingerprint.resource).pathname;
  const suffix = fingerprint.hash.slice("sha256:".length, "sha256:".length + 8);
  const path = safeBundleFile(root, `sources/${slugify(sourceName)}-${suffix}.md`);
  const content = sourceTemplate(titleFromPath(sourceName), fingerprint.resource, fingerprint.hash, timestamp);
  const registrationEvent = {
    type: "source-registration",
    title: "Source registered",
    resource: fingerprint.resource,
    source_hash: fingerprint.hash,
    source_record: normalizeSlash(relative(root, path)),
  };
  assertSafeEvent(registrationEvent);
  if (!options.dryRun) {
    await atomicWrite(path, content);
    await recordEvent(root, ".", registrationEvent);
    await syncIndexes(root);
  }
  return {
    path: normalizeSlash(relative(root, path)),
    resource: fingerprint.resource,
    hash: fingerprint.hash,
    status: "new",
    changed: true,
    needsIntegration: true,
    affectedDocuments: [],
    contentPreview: fingerprint.content?.slice(0, MAX_CONTEXT_PREVIEW),
  };
}

export async function registerTextSource(
  projectRoot: string,
  name: string,
  text: string,
  kind: "conversation" | "brief" | "input" = "input",
  options: { dryRun?: boolean } = {},
): Promise<SourceRecordResult> {
  const root = resolve(projectRoot);
  if (!name.trim() || !text.trim()) throw new Error("Text sources require a non-empty name and content");
  if (containsLikelySecret(text)) throw new Error("Text source contains likely secret material");
  if (Buffer.byteLength(text, "utf8") > 2 * 1024 * 1024) throw new Error("Text source exceeds 2097152 bytes");
  await assertWritableBundleVersion(root);
  await assertValidForMutation(root);
  const resource = `${kind}://${slugify(name)}`;
  const hash = `sha256:${createHash("sha256").update(text).digest("hex")}`;
  const timestamp = nowIso();
  const existing = await findSourceByResource(root, resource);
  if (existing) {
    return updateSourceRecord(root, existing, resource, hash, text, "Text source changed", options.dryRun);
  }
  const suffix = hash.slice("sha256:".length, "sha256:".length + 8);
  const path = safeBundleFile(root, `sources/${kind}-${slugify(name)}-${suffix}.md`);
  if (!options.dryRun) {
    await atomicWrite(path, sourceTemplate(titleFromPath(name), resource, hash, timestamp));
    await recordEvent(root, ".", { type: "source-registration", title: "Text source registered", resource, source_hash: hash, source_record: normalizeSlash(relative(root, path)) });
    await syncIndexes(root);
  }
  return {
    path: normalizeSlash(relative(root, path)),
    resource,
    hash,
    status: "new",
    changed: true,
    needsIntegration: true,
    affectedDocuments: [],
    contentPreview: text.slice(0, MAX_CONTEXT_PREVIEW),
  };
}

export async function refreshRegisteredSources(projectRoot: string, options: { dryRun?: boolean; fetchRemote?: boolean } = {}): Promise<SourceRecordResult[]> {
  const root = resolve(projectRoot);
  await assertWritableBundleVersion(root);
  await assertValidForMutation(root);
  const sourcesRoot = safeBundleFile(root, "sources");
  const walk = await walkMemory(sourcesRoot);
  const results: SourceRecordResult[] = [];
  for (const path of walk.files.sort()) {
    if (basename(path) === "index.md") continue;
    const content = await readFile(path, "utf8");
    const parsed = parseMarkdown(content);
    if (parsed.data.type !== "Source" || typeof parsed.data.resource !== "string") continue;
    const resource = parsed.data.resource;
    const affectedDocuments = Array.isArray(parsed.data.affected_documents)
      ? parsed.data.affected_documents.filter((item): item is string => typeof item === "string")
      : [];
    const previousStatus = typeof parsed.data.integration_status === "string" && SOURCE_STATUSES.has(parsed.data.integration_status)
      ? parsed.data.integration_status as SourceRecordResult["status"]
      : "new";
    const nonFileResource = /^[a-z][a-z0-9+.-]*:/i.test(resource) && !/^(?:https?|repo):/i.test(resource);
    if (nonFileResource || (/^https?:\/\//i.test(resource) && !options.fetchRemote)) {
      results.push({
        path: normalizeSlash(relative(root, path)),
        resource,
        hash: typeof parsed.data.source_hash === "string" ? parsed.data.source_hash : "unknown",
        status: previousStatus,
        changed: false,
        needsIntegration: previousStatus === "new" || previousStatus === "changed" || previousStatus === "stale",
        affectedDocuments,
      });
      continue;
    }
    try {
      const fingerprint = await fingerprintSource(root, resource, options.fetchRemote ?? false);
      const previousHash = parsed.data.source_hash;
      const changed = previousHash !== fingerprint.hash;
      const status: SourceRecordResult["status"] = changed ? "changed" : previousStatus === "unavailable" ? "new" : previousStatus;
      const previousHashes = Array.isArray(parsed.data.previous_hashes) ? [...parsed.data.previous_hashes] : [];
      if (changed && typeof previousHash === "string" && !previousHashes.some((entry) => typeof entry === "object" && entry !== null && (entry as Record<string, unknown>).hash === previousHash)) {
        previousHashes.push({ hash: previousHash, observed_at: parsed.data.checked_at ?? parsed.data.timestamp ?? nowIso() });
      }
      const next = changed || previousStatus === "unavailable"
        ? updateMarkdownFrontmatter(content, {
          timestamp: nowIso(),
          checked_at: nowIso(),
          source_hash: fingerprint.hash,
          previous_hashes: previousHashes,
          integration_status: status,
          integrated_at: changed ? null : parsed.data.integrated_at,
          last_error: null,
        })
        : content;
      if (!options.dryRun && next !== content) await atomicWrite(path, next);
      if (!options.dryRun && changed) {
        await recordEvent(root, ".", {
          type: "source-change",
          title: "Source fingerprint changed",
          resource,
          previous_hash: previousHash,
          source_hash: fingerprint.hash,
          affected_documents: affectedDocuments,
        });
      }
      results.push({
        path: normalizeSlash(relative(root, path)),
        resource,
        hash: fingerprint.hash,
        status,
        changed,
        needsIntegration: status === "new" || status === "changed" || status === "stale",
        affectedDocuments,
        contentPreview: changed ? fingerprint.content?.slice(0, MAX_CONTEXT_PREVIEW) : undefined,
      });
    } catch (error) {
      const changed = previousStatus !== "unavailable";
      const next = changed
        ? updateMarkdownFrontmatter(content, { timestamp: nowIso(), checked_at: nowIso(), integration_status: "unavailable", last_error: (error as Error).message })
        : content;
      if (!options.dryRun && next !== content) await atomicWrite(path, next);
      if (!options.dryRun && changed) {
        await recordEvent(root, ".", { type: "source-unavailable", title: "Source unavailable", resource, affected_documents: affectedDocuments });
      }
      results.push({
        path: normalizeSlash(relative(root, path)),
        resource,
        hash: typeof parsed.data.source_hash === "string" ? parsed.data.source_hash : "unknown",
        status: "unavailable",
        changed,
        needsIntegration: true,
        affectedDocuments,
      });
    }
  }
  if (!options.dryRun && results.some((result) => result.changed)) await syncIndexes(root);
  return results;
}

function assertSafeEvent(event: Record<string, unknown>): void {
  if (containsLikelySecret(JSON.stringify(event))) throw new Error("Refusing to record likely secret material in history");
  for (const [key, value] of Object.entries(event)) {
    if (/(?:password|passwd|secret|credential|access[_-]?token|private[_-]?key)/i.test(key) && value !== undefined && value !== null && value !== "[redacted]") {
      throw new Error(`Refusing to record secret-like event field: ${key}`);
    }
  }
}

function formatEvent(event: Record<string, unknown>): string {
  assertSafeEvent(event);
  const title = typeof event.title === "string" ? event.title : typeof event.type === "string" ? event.type : "Update";
  const id = typeof event.id === "string" ? event.id : `evt-${new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)}-${randomUUID().slice(0, 6)}`;
  const lines = [`### ${title} — \`${id}\``];
  for (const [key, value] of Object.entries(event)) {
    if (key === "title" || key === "type" || key === "id" || value === undefined || value === null) continue;
    const label = key.replace(/[_-]+/g, " ").replace(/^./, (character) => character.toUpperCase());
    const rendered = Array.isArray(value) ? value.map(yamlScalar).join(", ") : yamlScalar(value);
    lines.push(`- **${label}:** ${rendered}`);
  }
  return lines.join("\n");
}

function prependLogEntry(content: string, date: string, entry: string): string {
  const dateHeading = `## ${date}`;
  const headingIndex = content.indexOf(dateHeading);
  if (headingIndex >= 0) {
    const insertion = headingIndex + dateHeading.length;
    return `${content.slice(0, insertion)}\n\n${entry}\n${content.slice(insertion).replace(/^\n+/, "\n")}`;
  }
  const firstDate = content.search(/^## \d{4}-\d{2}-\d{2}\s*$/m);
  if (firstDate >= 0) return `${content.slice(0, firstDate)}${dateHeading}\n\n${entry}\n\n${content.slice(firstDate)}`;
  return `${content.trimEnd()}\n\n${dateHeading}\n\n${entry}\n`;
}

export async function recordEvent(projectRoot: string, scope: string, event: Record<string, unknown>, options: { dryRun?: boolean; now?: Date } = {}): Promise<FileChange> {
  await assertWritableBundleVersion(projectRoot);
  await assertValidForMutation(projectRoot);
  const safeScope = assertSafeRelativePath(scope || ".");
  const path = join(scopeDirectory(projectRoot, safeScope), "log.md");
  const content = await readIfExists(path);
  if (!content) throw new Error(`Tracked scope does not contain log.md: ${scope}`);
  const next = prependLogEntry(content, today(options.now), formatEvent(event));
  const change = await plannedWrite(path, next, options.dryRun ?? false, true);
  return { ...change, path: relativeChangePath(projectRoot, path) };
}

function extractSection(content: string, heading: string): string {
  const pattern = new RegExp(`^##\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "im");
  const match = pattern.exec(content);
  if (!match) return "";
  const rest = content.slice(match.index + match[0].length).replace(/^\s+/, "");
  const next = rest.search(/^##\s+/m);
  return (next >= 0 ? rest.slice(0, next) : rest).trim();
}

export async function checkCompletionReadiness(projectRoot: string, scope = ".", evidenceRoot = projectRoot): Promise<CompletionReadiness> {
  const root = resolve(projectRoot);
  const canonicalEvidenceRoot = await realpath(evidenceRoot);
  const safeScope = assertSafeRelativePath(scope);
  const directory = scopeDirectory(root, safeScope);
  const [goal, progress] = await Promise.all([
    readIfExists(join(directory, "goal.md")),
    readIfExists(join(directory, "progress.md")),
  ]);
  if (!goal || !progress) return { ready: false, criteria: [], verified: [], missing: ["Tracked scope is missing goal.md or progress.md"] };
  const criteria = [...new Set(extractSection(goal, "Acceptance criteria").match(/\bAC-\d{3}\b/g) ?? [])].sort();
  const evidenceSection = extractSection(progress, "Acceptance evidence");
  const verified: string[] = [];
  const missing: string[] = [];
  if (criteria.length === 0) missing.push("Goal has no stable acceptance criterion IDs (expected AC-001, AC-002, ...)");
  for (const criterion of criteria) {
    const row = evidenceSection.split("\n").find((line) => line.includes(`| ${criterion} |`) || line.includes(`|${criterion}|`));
    if (!row) {
      missing.push(`${criterion} has no evidence row`);
      continue;
    }
    const cells = row.split("|").map((cell) => cell.trim()).filter(Boolean);
    const status = cells[1] ?? "";
    const evidence = cells.slice(2).join(" | ");
    if (!/^(?:verified|passed|complete|done)$/i.test(status)) missing.push(`${criterion} status is not verified`);
    else {
      const references = [...evidence.matchAll(/repo:\/\/([^\s)`\]]+)/g)].flatMap((match) => {
        try {
          return [decodeURIComponent(match[1].split(/[?#]/, 1)[0])];
        } catch {
          return [];
        }
      });
      let linkedEvidence = false;
      for (const reference of references) {
        try {
          const path = resolve(canonicalEvidenceRoot, assertSafeRelativePath(reference));
          const canonical = await realpath(path);
          const info = await lstat(path);
          if (isPathInside(canonicalEvidenceRoot, canonical) && !isExcludedPath(reference) && info.isFile() && !info.isSymbolicLink()) linkedEvidence = true;
        } catch {
          // Missing or unsafe evidence does not satisfy completion.
        }
      }
      if (!linkedEvidence) missing.push(`${criterion} has no existing repo:// evidence file`);
      else verified.push(criterion);
    }
  }
  return { ready: missing.length === 0, criteria, verified, missing };
}

export async function getMemoryStatus(projectRoot: string, scope?: string): Promise<MemoryStatus> {
  const root = resolve(projectRoot);
  const rootIndex = await readIfExists(join(bundlePath(root), "index.md"));
  if (!rootIndex) {
    const validation = await validateBundle(root);
    return { initialized: false, root, sourceCounts: {}, validation };
  }
  const rootParsed = parseMarkdown(rootIndex);
  const activeScope = scope ? assertSafeRelativePath(scope) : typeof rootParsed.data.active_scope === "string" ? rootParsed.data.active_scope : ".";
  const directory = scopeDirectory(root, activeScope);
  const goal = await readIfExists(join(directory, "goal.md"));
  const progress = await readIfExists(join(directory, "progress.md"));
  const goalStatus = goal ? parseMarkdown(goal).data.status : undefined;
  const sourceCounts: Record<string, number> = {};
  const sourceWalk = await walkMemory(join(bundlePath(root), "sources"));
  for (const path of sourceWalk.files) {
    if (basename(path) === "index.md") continue;
    const parsed = parseMarkdown(await readFile(path, "utf8"));
    const status = typeof parsed.data.integration_status === "string" ? parsed.data.integration_status : "unknown";
    sourceCounts[status] = (sourceCounts[status] ?? 0) + 1;
  }
  return {
    initialized: true,
    root,
    activeScope,
    goalStatus: typeof goalStatus === "string" ? goalStatus : undefined,
    nextAction: progress ? extractSection(progress, "Next action") : undefined,
    blockers: progress ? extractSection(progress, "Blockers and drift") : undefined,
    sourceCounts,
    validation: await validateBundle(root),
  };
}

function resolveMemoryLink(memoryRoot: string, from: string, target: string): string | undefined {
  const raw = target.split("#")[0].split("?")[0];
  if (!raw || /^[a-z][a-z0-9+.-]*:/i.test(raw)) return undefined;
  let clean: string;
  try {
    clean = decodeURIComponent(raw);
  } catch {
    return "__escape__";
  }
  const absolute = clean.startsWith("/") ? resolve(memoryRoot, clean.slice(1)) : resolve(dirname(from), clean);
  if (!isPathInside(memoryRoot, absolute)) return "__escape__";
  return absolute;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function validateBundle(projectRoot: string): Promise<ValidationResult> {
  const root = resolve(projectRoot);
  const memoryRoot = bundlePath(root);
  const diagnostics: Diagnostic[] = [];
  const walk = await walkMemory(memoryRoot);
  diagnostics.push(...walk.diagnostics);
  if (walk.files.length === 0) {
    diagnostics.push({ severity: "error", code: "not-initialized", path: MEMORY_DIRECTORY, message: "Project Memory is not initialized" });
    return { ok: false, diagnostics, counts: { documents: 0, scopes: 0, sources: 0, errors: 1, warnings: 0 } };
  }

  const rootIndexPath = join(memoryRoot, "index.md");
  let declaredActiveScope: string | undefined;
  const rootIndex = await readIfExists(rootIndexPath);
  if (!rootIndex) diagnostics.push({ severity: "error", code: "missing-root-index", path: ".memory/index.md", message: "Root index.md is required" });
  else {
    const parsed = parseMarkdown(rootIndex);
    if (!parsed.hasFrontmatter || parsed.errors.length > 0) diagnostics.push({ severity: "error", code: "root-frontmatter", path: ".memory/index.md", message: parsed.errors.join("; ") || "Root index requires frontmatter" });
    else {
      if (parsed.data.memory_version !== MEMORY_VERSION) diagnostics.push({ severity: "error", code: "version", path: ".memory/index.md", message: `Expected memory_version ${MEMORY_VERSION}` });
      declaredActiveScope = typeof parsed.data.active_scope === "string" ? parsed.data.active_scope : undefined;
      if (!declaredActiveScope) diagnostics.push({ severity: "error", code: "active-scope", path: ".memory/index.md", message: "Root index requires active_scope" });
    }
  }

  const scopeDirectories = new Set<string>();
  let sourceCount = 0;
  for (const path of walk.files) {
    const rel = normalizeSlash(relative(root, path));
    const name = basename(path);
    const content = await readFile(path, "utf8");
    for (const markerError of validateGeneratedMarkers(content)) diagnostics.push({ severity: "error", code: "markers", path: rel, message: markerError });

    const parsed = parseMarkdown(content);
    const reserved = RESERVED_FILES.has(name);
    const rootIndexFile = path === rootIndexPath;
    if (!reserved && !rootIndexFile) {
      if (!parsed.hasFrontmatter || parsed.errors.length > 0) diagnostics.push({ severity: "error", code: "frontmatter", path: rel, message: parsed.errors.join("; ") || "Document requires YAML frontmatter" });
      else if (typeof parsed.data.type !== "string" || !parsed.data.type.trim()) diagnostics.push({ severity: "error", code: "type", path: rel, message: "Document frontmatter requires a non-empty type" });
    }

    if (name === "goal.md") {
      scopeDirectories.add(dirname(path));
      const status = parsed.data.status;
      if (typeof status !== "string" || !GOAL_STATUSES.has(status)) diagnostics.push({ severity: "error", code: "goal-status", path: rel, message: `Invalid goal status: ${String(status)}` });
      for (const field of ["title", "description", "timestamp", "scope"]) {
        if (typeof parsed.data[field] !== "string") diagnostics.push({ severity: "error", code: "managed-field", path: rel, message: `Goal requires '${field}'` });
      }
      const expectedScope = scopeFromMemoryDirectory(memoryRoot, dirname(path));
      if (parsed.data.scope !== expectedScope) diagnostics.push({ severity: "error", code: "scope-mismatch", path: rel, message: `Goal scope must be '${expectedScope}'` });
      if (status === "active") {
        const progress = await readIfExists(join(dirname(path), "progress.md"));
        const headingCount = progress?.match(/^##\s+Next action\s*$/gim)?.length ?? 0;
        const nextAction = progress ? extractSection(progress, "Next action") : "";
        const requiredNextActionFields = ["Action", "Requirement", "Likely files", "Verification", "Approval"];
        const missingNextActionField = requiredNextActionFields.some((field) => {
          const value = new RegExp(`\\*\\*${field}:\\*\\*\\s*([^\\n]+)`, "i").exec(nextAction)?.[1].trim();
          return !value || /^(?:unknown|unresolved|none|pending|n\/a)\.?$/i.test(value);
        });
        if (headingCount !== 1 || !nextAction || missingNextActionField) {
          diagnostics.push({ severity: "error", code: "next-action", path: rel, message: "Active goals require exactly one approved, evidence-linked Next action with Action, Requirement, Likely files, Verification, and Approval" });
        }
      }
    }

    if (parsed.data.type === "Progress") {
      for (const field of ["title", "description", "timestamp", "scope"]) {
        if (typeof parsed.data[field] !== "string") diagnostics.push({ severity: "error", code: "managed-field", path: rel, message: `Progress requires '${field}'` });
      }
      const expectedScope = scopeFromMemoryDirectory(memoryRoot, dirname(path));
      if (parsed.data.scope !== expectedScope) diagnostics.push({ severity: "error", code: "scope-mismatch", path: rel, message: `Progress scope must be '${expectedScope}'` });
    }
    if (parsed.data.type === "Source") {
      sourceCount++;
      if (typeof parsed.data.resource !== "string" || typeof parsed.data.source_hash !== "string") diagnostics.push({ severity: "error", code: "source-fields", path: rel, message: "Source requires resource and source_hash" });
      if (typeof parsed.data.integration_status !== "string" || !SOURCE_STATUSES.has(parsed.data.integration_status)) diagnostics.push({ severity: "error", code: "source-status", path: rel, message: `Invalid source integration_status: ${String(parsed.data.integration_status)}` });
      if (parsed.data.integration_status === "changed" || parsed.data.integration_status === "stale") diagnostics.push({ severity: "warning", code: "stale-source", path: rel, message: `Source needs integration (${parsed.data.integration_status})` });
      if (parsed.data.integration_status === "integrated") {
        if (typeof parsed.data.integrated_at !== "string") diagnostics.push({ severity: "warning", code: "integration-time", path: rel, message: "Integrated source should record integrated_at" });
        if (!Array.isArray(parsed.data.affected_documents) || parsed.data.affected_documents.length === 0) diagnostics.push({ severity: "warning", code: "source-impact", path: rel, message: "Integrated source should list affected_documents" });
      }
    }

    const links = content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g);
    for (const link of links) {
      const target = resolveMemoryLink(memoryRoot, path, link[1].trim());
      if (!target) continue;
      if (target === "__escape__") diagnostics.push({ severity: "error", code: "link-escape", path: rel, message: `Link escapes bundle: ${link[1]}` });
      else if (!(await exists(target)) && !(await exists(join(target, "index.md")))) diagnostics.push({ severity: "warning", code: "broken-link", path: rel, message: `Broken link: ${link[1]}` });
    }
  }

  if (declaredActiveScope) {
    let safeActiveScope: string | undefined;
    try {
      safeActiveScope = assertSafeRelativePath(declaredActiveScope);
    } catch {
      diagnostics.push({ severity: "error", code: "active-scope", path: ".memory/index.md", message: `Unsafe active_scope: ${declaredActiveScope}` });
    }
    if (safeActiveScope) {
      const activeDirectory = scopeDirectory(root, safeActiveScope);
      if (!scopeDirectories.has(activeDirectory)) diagnostics.push({ severity: "error", code: "active-scope", path: ".memory/index.md", message: `active_scope is not tracked: ${declaredActiveScope}` });
    }
  }

  for (const directory of scopeDirectories) {
    for (const file of CORE_FILES) {
      if (!(await exists(join(directory, file)))) diagnostics.push({ severity: "error", code: "incomplete-scope", path: normalizeSlash(relative(root, directory)), message: `Tracked scope is missing ${file}` });
    }
  }

  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === "error").length;
  const warnings = diagnostics.length - errors;
  return {
    ok: errors === 0,
    diagnostics,
    counts: { documents: walk.files.length, scopes: scopeDirectories.size, sources: sourceCount, errors, warnings },
  };
}

const AGENTS_START = "<!-- memory:start -->";
const AGENTS_END = "<!-- memory:end -->";
const AGENTS_BLOCK = `${AGENTS_START}
Project memory lives in \`.memory/\`. Keep all documents ultra-short, compact, concise, and token-efficient.
Before work, read \`.memory/index.md\`, then the matching scope's goal and progress.
Treat user-confirmed wants, must-not rules, and acceptance criteria as requirements.
Ask instead of guessing when intent is missing, inferred, stale, or contradictory.
When a source changes, integrate it into the existing wiki instead of merely indexing it.
After meaningful work, record evidence, update progress and one next action, and append \`log.md\` using concise entries.
Use \`memory_apply\` when available, otherwise the \`memory\` CLI, for generated regions; do not rewrite history.
${AGENTS_END}`;

export async function readUnmanagedAgentsContent(projectRoot: string): Promise<string | undefined> {
  const path = resolve(projectRoot, "AGENTS.md");
  const content = await readIfExists(path);
  if (!content) return undefined;
  let unmanaged = content;
  const starts = unmanaged.indexOf(AGENTS_START);
  const ends = unmanaged.indexOf(AGENTS_END);
  if (starts !== -1 && ends !== -1 && ends > starts) {
    unmanaged = unmanaged.slice(0, starts) + unmanaged.slice(ends + AGENTS_END.length);
  }
  unmanaged = unmanaged.trim();
  return unmanaged.length > 0 ? unmanaged : undefined;
}

export async function syncAgentsFile(projectRoot: string, options: { dryRun?: boolean; userContent?: string } = {}): Promise<FileChange> {
  const path = resolve(projectRoot, "AGENTS.md");
  await assertNotSymlink(path);
  const before = await readIfExists(path);
  let next: string;
  if (before === undefined) {
    const user = options.userContent?.trim();
    next = user ? `${user}\n\n${AGENTS_BLOCK}\n` : `${AGENTS_BLOCK}\n`;
  } else {
    const starts = before.split(AGENTS_START).length - 1;
    const ends = before.split(AGENTS_END).length - 1;
    let prefix = "";
    let suffix = "";
    if (starts === 0 && ends === 0) {
      prefix = before.trimEnd() ? `${before.trimEnd()}\n\n` : "";
    } else if (starts !== 1 || ends !== 1 || before.indexOf(AGENTS_START) > before.indexOf(AGENTS_END)) {
      throw new Error("AGENTS.md contains malformed or duplicate Project Memory markers");
    } else {
      prefix = before.slice(0, before.indexOf(AGENTS_START));
      suffix = before.slice(before.indexOf(AGENTS_END) + AGENTS_END.length);
    }
    if (options.userContent !== undefined) {
      prefix = options.userContent.trim() ? `${options.userContent.trim()}\n\n` : "";
    }
    next = `${prefix}${AGENTS_BLOCK}${suffix}`;
  }
  const change = await plannedWrite(path, next, options.dryRun ?? false, true);
  return { ...change, path: "AGENTS.md" };
}

async function assertExpectedHash(path: string, expected?: string): Promise<void> {
  if (!expected) return;
  const content = await readIfExists(path);
  const actual = content === undefined ? undefined : hashText(content);
  if (actual !== expected) throw new Error(`Document changed since the plan was created: ${path}`);
}

async function captureBundle(projectRoot: string): Promise<Map<string, string>> {
  const root = bundlePath(projectRoot);
  const walk = await walkMemory(root);
  const snapshot = new Map<string, string>();
  for (const path of walk.files) snapshot.set(path, await readFile(path, "utf8"));
  return snapshot;
}

async function restoreBundle(projectRoot: string, snapshot: Map<string, string>): Promise<void> {
  const root = bundlePath(projectRoot);
  const current = await walkMemory(root);
  for (const path of current.files) {
    if (!snapshot.has(path)) await rm(path, { force: true });
  }
  for (const [path, content] of snapshot) await atomicWrite(path, content);
}

export function operationRequiresApproval(operation: MemoryOperation): boolean {
  if (operation.semantic || (operation.path ? basename(operation.path) === "goal.md" : false)) return true;
  if (["write_document", "update_frontmatter"].includes(operation.action)) {
    const path = operation.path?.replace(/\\/g, "/").replace(/^\.\//, "") ?? "";
    if (path === "progress.md" || path.endsWith("/progress.md")) return false;
    if (path.startsWith("sources/")) return operation.action === "write_document";
    return true;
  }
  if (operation.action !== "append_log") return false;
  const eventType = String(operation.event?.type ?? operation.event?.category ?? "").toLowerCase();
  return ["completion", "contradiction-resolution", "correction", "decision", "preference", "reversal", "scope"].includes(eventType);
}

export async function applyMemoryPlan(projectRoot: string, plan: MemoryPlan, options: { dryRun?: boolean; scan?: RepositoryScan; evidenceRoot?: string } = {}): Promise<ApplyResult> {
  if (!plan || !Array.isArray(plan.operations) || plan.operations.length === 0) throw new Error("Memory plan requires at least one operation");
  const supportedActions = new Set(["write_document", "update_frontmatter", "replace_generated", "append_log", "sync_indexes"]);
  for (const operation of plan.operations) {
    if (!operation || !supportedActions.has(operation.action)) throw new Error(`Unsupported memory operation: ${String(operation?.action)}`);
  }
  if (options.dryRun) {
    const stagingRoot = await mkdtemp(join(tmpdir(), "project-memory-dry-run-"));
    try {
      await cp(bundlePath(projectRoot), bundlePath(stagingRoot), { recursive: true, verbatimSymlinks: true });
      return await applyMemoryPlan(stagingRoot, plan, { dryRun: false, scan: options.scan, evidenceRoot: options.evidenceRoot ?? projectRoot });
    } finally {
      await rm(stagingRoot, { recursive: true, force: true });
    }
  }
  const beforeValidation = await validateBundle(projectRoot);
  if (!beforeValidation.ok) {
    throw new Error(`Refusing to mutate an invalid bundle: ${beforeValidation.diagnostics.filter((item) => item.severity === "error").map((item) => `${item.path ?? "bundle"}: ${item.message}`).join("; ")}`);
  }
  const changes: FileChange[] = [];
  const semanticMutation = plan.operations.some(operationRequiresApproval);
  if (semanticMutation && !plan.approved) throw new Error("Semantic memory changes require explicit user approval");
  if (semanticMutation && !plan.approvalReason?.trim()) throw new Error("Approved semantic changes require an approval reason");
  const snapshot = options.dryRun ? undefined : await captureBundle(projectRoot);
  try {
    for (const operation of plan.operations) {
    if (operation.action === "sync_indexes") {
      changes.push(...await syncIndexes(projectRoot, options.scan, { dryRun: options.dryRun }));
      continue;
    }
    if (operation.action === "append_log") {
      if (!operation.event) throw new Error("append_log requires event");
      changes.push(await recordEvent(projectRoot, operation.scope ?? ".", operation.event, { dryRun: options.dryRun }));
      continue;
    }
    if (!operation.path) throw new Error(`${operation.action} requires path`);
    const target = safeBundleFile(projectRoot, operation.path);
    await assertExpectedHash(target, operation.expectedHash);
    const existing = await readIfExists(target);

    if (operation.action === "write_document") {
      if (basename(target) === "index.md") throw new Error("Write index content through generated regions or sync_indexes");
      if (basename(target) === "log.md") throw new Error("History is append-only; use append_log");
      if (typeof operation.content !== "string") throw new Error("write_document requires content");
      if (containsLikelySecret(operation.content)) throw new Error("Refusing to write likely secret material to Project Memory");
      const parsed = parseMarkdown(operation.content);
      if (!RESERVED_FILES.has(basename(target)) && (!parsed.hasFrontmatter || parsed.errors.length > 0 || typeof parsed.data.type !== "string")) throw new Error("Non-reserved documents require valid frontmatter with type");
      if (normalizeSlash(relative(bundlePath(projectRoot), target)).startsWith("sources/")) {
        if (!existing) throw new Error("Create source records with record_source or memory record");
        const previous = parseMarkdown(existing);
        if (previous.data.type !== "Source" || parsed.data.type !== "Source") throw new Error("Source record type cannot be changed");
        for (const field of ["resource", "source_hash", "registered_at", "uid"]) {
          if (parsed.data[field] !== previous.data[field]) throw new Error(`Source record '${field}' is immutable`);
        }
      }
      if (basename(target) === "goal.md" && parsed.data.status === "complete") throw new Error("Complete goals with update_frontmatter so approved criteria cannot be replaced");
      if (basename(target) === "goal.md" && existing && typeof parsed.data.status === "string") {
        const previousStatus = parseMarkdown(existing).data.status;
        if (typeof previousStatus === "string" && previousStatus !== parsed.data.status && !GOAL_TRANSITIONS[previousStatus]?.has(parsed.data.status)) {
          throw new Error(`Invalid goal lifecycle transition: ${previousStatus} -> ${parsed.data.status}`);
        }
        if (parsed.data.status === "complete" && previousStatus !== "complete") {
          const scope = scopeFromMemoryDirectory(bundlePath(projectRoot), dirname(target));
          const readiness = await checkCompletionReadiness(projectRoot, scope, options.evidenceRoot);
          if (!readiness.ready) throw new Error(`Completion evidence is incomplete: ${readiness.missing.join("; ")}`);
        }
      }
      const change = await plannedWrite(target, operation.content.endsWith("\n") ? operation.content : `${operation.content}\n`, options.dryRun ?? false, true);
      changes.push({ ...change, path: relativeChangePath(projectRoot, target) });
    } else if (operation.action === "update_frontmatter") {
      if (!existing) throw new Error(`Document not found: ${operation.path}`);
      if (!operation.values) throw new Error("update_frontmatter requires values");
      if (containsLikelySecret(JSON.stringify(operation.values))) throw new Error("Refusing to write likely secret material to Project Memory");
      const existingParsed = parseMarkdown(existing);
      if (existingParsed.data.type === "Source") {
        for (const field of ["type", "resource", "source_hash", "registered_at", "uid"]) {
          if (field in operation.values && operation.values[field] !== existingParsed.data[field]) throw new Error(`Source record '${field}' is immutable`);
        }
      }
      if (basename(target) === "goal.md" && typeof operation.values.status === "string") {
        const previousStatus = existingParsed.data.status;
        if (typeof previousStatus === "string" && previousStatus !== operation.values.status && !GOAL_TRANSITIONS[previousStatus]?.has(operation.values.status)) {
          throw new Error(`Invalid goal lifecycle transition: ${previousStatus} -> ${operation.values.status}`);
        }
        if (operation.values.status === "complete" && previousStatus !== "complete") {
          const scope = scopeFromMemoryDirectory(bundlePath(projectRoot), dirname(target));
          const readiness = await checkCompletionReadiness(projectRoot, scope, options.evidenceRoot);
          if (!readiness.ready) throw new Error(`Completion evidence is incomplete: ${readiness.missing.join("; ")}`);
        }
      }
      const managedValues: Record<string, unknown> = { ...operation.values, timestamp: nowIso() };
      if (existingParsed.data.type === "Source" && operation.values.integration_status === "integrated" && managedValues.integrated_at === undefined) {
        managedValues.integrated_at = nowIso();
      }
      const next = updateMarkdownFrontmatter(existing, managedValues);
      const change = await plannedWrite(target, next, options.dryRun ?? false, true);
      changes.push({ ...change, path: relativeChangePath(projectRoot, target) });
    } else if (operation.action === "replace_generated") {
      if (!existing) throw new Error(`Document not found: ${operation.path}`);
      if (!operation.region || operation.content === undefined) throw new Error("replace_generated requires region and content");
      if (containsLikelySecret(operation.content)) throw new Error("Refusing to write likely secret material to Project Memory");
      const next = replaceGeneratedRegion(existing, operation.region, operation.content);
      const change = await plannedWrite(target, next, options.dryRun ?? false, true);
      changes.push({ ...change, path: relativeChangePath(projectRoot, target) });
    }
  }

    const validation = options.dryRun ? undefined : await validateBundle(projectRoot);
    if (validation && !validation.ok) throw new Error(`Memory plan produced invalid bundle: ${validation.diagnostics.filter((item) => item.severity === "error").map((item) => `${item.path ?? "bundle"}: ${item.message}`).join("; ")}`);
    return { changes, validation };
  } catch (error) {
    if (snapshot) await restoreBundle(projectRoot, snapshot);
    throw error;
  }
}

export async function withBundleLock<T>(projectRoot: string, callback: () => Promise<T>): Promise<T> {
  const root = bundlePath(projectRoot);
  await mkdir(root, { recursive: true });
  const lockPath = join(root, ".lock");
  let handle;
  try {
    handle = await open(lockPath, "wx", 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const info = await stat(lockPath);
    if (Date.now() - info.mtimeMs <= 5 * 60_000) throw new Error("Another Project Memory update is in progress");
    await rm(lockPath, { force: true });
    handle = await open(lockPath, "wx", 0o600);
  }
  try {
    await handle.writeFile(JSON.stringify({ pid: process.pid, started: nowIso() }));
    return await callback();
  } finally {
    await handle.close();
    await rm(lockPath, { force: true });
  }
}
