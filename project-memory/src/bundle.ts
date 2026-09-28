import { createHash, randomUUID } from "node:crypto";
import { cp, open, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import { Document, isMap, parseDocument } from "yaml";
import {
  assertSafeRelativePath,
  containsLikelySecret,
  deepScanRepository,
  discoverArchitectureLayers,
  fingerprintSource,
  generateTreemapContent,
  isExcludedPath,
  isPathInside,
  type ArchitectureEvidence,
  type ArchitectureLayer,
  type DeepScanResult,
  type RepositoryScan,
  ALL_ARCHITECTURE_LAYERS,
  CONDITIONAL_ARCHITECTURE_LAYERS,
  MANDATORY_ARCHITECTURE_LAYERS,
  repositoryHead,
  scanRepository,
} from "./repository.ts";

const MEMORY_DIRECTORY = ".memory";
const MEMORY_VERSION = "0.3";
const LEGACY_VERSIONS = new Set(["0.1", "0.2"]);
const RESERVED_FILES = new Set(["index.md", "log.md"]);

const MAX_ROOT_INDEX_BYTES = 6_000;
const WARN_ROOT_INDEX_BYTES = 4_000;
const MAX_SCOPE_INDEX_BYTES = 8_000;
export const MAX_AUTO_CONTEXT_BYTES = 6_000;
const WARN_DOCUMENT_BYTES = 16_000;
const WARN_LOG_BYTES = 24_000;
const MAX_GENERATED_LINE_BYTES = 240;
const INDEX_RECENT_LOG_ENTRIES = 3;
const INDEX_RECENT_DECISIONS = 5;

const SOURCE_STATUSES = new Set(["new", "integrated", "changed", "stale", "unavailable", "rejected"]);
export const DECISION_STATUSES = new Set(["accepted", "superseded", "deprecated"]);
/** Log entry types that change binding project meaning and therefore require explicit approval. */
export const SEMANTIC_EVENT_TYPES = new Set(["decision", "correction", "reversal", "scope", "preference", "contradiction-resolution"]);
const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/;
const ROOT_REQUIRED_FILES = ["index.md", "log.md"] as const;
const ROOT_RECOMMENDED_FILES = ["conventions.md", "decisions/index.md"] as const;
const SCOPE_CORE_FILES = ["agents.md", "log.md"] as const;
/** Files removed in format 0.3; archived by `memory migrate`. */
const LEGACY_FILES = new Set(["goal.md", "progress.md", "tasks.md"]);
const ARCHIVE_DIRECTORY = "archive";
const DECISIONS_DIRECTORY = "decisions";
const DECISION_FILE_PATTERN = /^D-(\d{3,})-[a-z0-9-]+\.md$/;
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

export type GovernanceStatus = "hold" | "active" | "deprecated" | "untracked";

export interface PathGovernanceResult {
  targetPath: string;
  governance: GovernanceStatus;
  holds: Array<{ path: string; reason?: string }>;
  governingDocuments: Array<{
    path: string;
    type: string;
    title?: string;
    codeRefs?: string[];
    governance?: string;
    governanceReason?: string;
  }>;
  constraints: string[];
}

export interface SearchResult {
  path: string;
  relPath: string;
  title: string;
  type: string;
  score: number;
  matchedField: "title" | "description" | "tags" | "body";
  snippet: string;
}

export interface ValidateOptions {
  drift?: boolean;
  strict?: boolean;
}

export interface LogEntry {
  scope: string;
  date: string;
  type: string;
  title: string;
  id?: string;
  body: string;
  archived: boolean;
}

export interface DecisionSummary {
  id: string;
  title: string;
  status: string;
  date?: string;
  path: string;
  description?: string;
}

export interface DecisionInput {
  title: string;
  decision: string;
  context?: string;
  rejected?: string[];
  consequences?: string;
  codeRefs?: string[];
  supersedes?: string;
  approvalReason: string;
}

export interface MemoryStatus {
  initialized: boolean;
  root: string;
  version?: string;
  scopes: string[];
  decisions: { accepted: number; superseded: number; deprecated: number };
  recent: LogEntry[];
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

function serializeMarkdown(data: Record<string, unknown>, body: string): string {
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

function validateGeneratedMarkers(content: string): string[] {
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

async function assertWritableBundleVersion(projectRoot: string, allowMissing = false, allowLegacyMigration = false): Promise<void> {
  const path = join(bundlePath(projectRoot), "index.md");
  const content = await readIfExists(path);
  if (content === undefined) {
    if (allowMissing) return;
    throw new Error("Project Memory is not initialized");
  }
  const parsed = parseMarkdown(content);
  if (!parsed.hasFrontmatter || parsed.errors.length > 0) throw new Error("Root index has invalid frontmatter; repair it before mutation");
  if (parsed.data.memory_version !== MEMORY_VERSION) {
    if (allowLegacyMigration && typeof parsed.data.memory_version === "string" && LEGACY_VERSIONS.has(parsed.data.memory_version)) return;
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

function detectedStack(deepScan?: DeepScanResult): string {
  const parts: string[] = [];
  if (deepScan?.techStack.languages.length) parts.push(deepScan.techStack.languages.join(", "));
  if (deepScan?.techStack.frameworks.length) parts.push(deepScan.techStack.frameworks.slice(0, 3).join(", "));
  if (deepScan?.techStack.testingTools.length) parts.push(deepScan.techStack.testingTools.slice(0, 2).join(", "));
  return parts.length > 0 ? parts.join("; ") : "Unconfirmed";
}

function detectedShape(deepScan?: DeepScanResult): string {
  if (deepScan?.architecture.packages.length) {
    const packages = deepScan.architecture.packages;
    return `Monorepo, ${packages.length} package(s): ${packages.slice(0, 3).map((p) => `\`${p.path}\``).join(", ")}${packages.length > 3 ? ", …" : ""}`;
  }
  if (deepScan?.architecture.entryPoints.length) {
    return `Entry points: ${deepScan.architecture.entryPoints.slice(0, 3).map((e) => `\`${e}\``).join(", ")}`;
  }
  return "Unconfirmed";
}

/**
 * Root router. The ONLY document injected automatically, so it must stay small and
 * route every need to exactly one file or command.
 */
function rootIndexTemplate(
  projectName: string,
  timestamp: string,
  head?: string,
  deepScan?: DeepScanResult,
  fingerprint?: string,
): string {
  return serializeMarkdown({
    memory_version: MEMORY_VERSION,
    architecture_mode: "ddd",
    architecture_index: "/architecture/",
    system_flow: "/architecture/system-design/Flow.md",
    project: projectName,
    title: `${projectName} memory`,
    description: "Router for project memory. Only file preloaded into agent context.",
    timestamp,
    repository_head: head ?? null,
    repository_fingerprint: fingerprint ?? null,
    last_scan_at: timestamp,
  }, `# ${projectName} memory

> Preloaded router. Open ONE linked file per need. Prefer \`memory search\` / \`memory log\` over reading whole files.

## Project
- Stack: ${detectedStack(deepScan)}
- Shape: ${detectedShape(deepScan)}

## Find
| Need | Open / run |
|---|---|
| Build/test commands, coding rules, pitfalls | [conventions.md](/conventions.md) |
| Why something is built this way | [decisions/](/decisions/) · \`memory decisions\` |
| Rules for a file before editing | \`memory check --for-path <file>\` |
| Domain language & invariants | [domain Flow](/architecture/domain/Flow.md) |
| System topology & entry points | [system Flow](/architecture/system-design/Flow.md) |
| Trust boundaries & auth | [security Flow](/architecture/security/Flow.md) |
| What changed recently | \`memory log --recent 10\` |
| Anything else | \`memory search <keywords>\` |
| Provenance of external facts | [sources/](/sources/) |
| Full code tree | \`memory map\` |

## Recent decisions
<!-- memory:generated:start decisions -->
- none
<!-- memory:generated:end decisions -->

## Recent activity
<!-- memory:generated:start recent -->
- none
<!-- memory:generated:end recent -->

## Scopes
<!-- memory:generated:start scopes -->
- Project root only.
<!-- memory:generated:end scopes -->`);
}

function conventionsTemplate(timestamp: string, deepScan?: DeepScanResult): string {
  const observed: string[] = [];
  if (deepScan?.techStack.packageManager) observed.push(`- Package manager: \`${deepScan.techStack.packageManager}\` (observed)`);
  if (deepScan?.techStack.buildSystem) observed.push(`- Build system: \`${deepScan.techStack.buildSystem}\` (observed)`);
  if (deepScan?.techStack.testingTools.length) observed.push(`- Test tools: ${deepScan.techStack.testingTools.join(", ")} (observed)`);
  return serializeMarkdown({
    type: "Conventions",
    title: "Conventions",
    description: "Build and test commands, binding coding rules, and known pitfalls.",
    scope: ".",
    timestamp,
  }, `# Conventions

> Project-wide rules. Lines starting \`MUST:\` / \`MUST NOT:\` / \`NEVER:\` are surfaced by \`memory check\` for every path.

## Commands
${observed.join("\n") || "- none recorded"}

## Rules
- none recorded

## Pitfalls
- none recorded
`);
}

function decisionsIndexTemplate(): string {
  return `# Decisions

> One file per durable decision (\`D-NNN-slug.md\`). Never rewrite: supersede with \`memory decide --supersedes D-NNN\`.

<!-- memory:generated:start decisions -->
| ID | Status | Date | Decision |
|---|---|---|---|
<!-- memory:generated:end decisions -->
`;
}

function architectureIndexTemplate(layers: ArchitectureLayer[], timestamp: string): string {
  const tableRows = layers.map((layer) => {
    return `| ${layer} | observed | - | - | [${layer}/Flow.md](./${layer}/Flow.md) |`;
  });

  return serializeMarkdown({
    type: "ArchitectureIndex",
    title: "Architecture index",
    description: "Architecture flow directory and domain boundary map.",
    timestamp,
    scope: ".",
  }, `# Architecture Index

## Overview
Dynamic architecture map and flow routes across bounded contexts.

## Flow map
<!-- memory:generated:start flows -->
| Layer | Status | Upstream | Downstream | Flow Document |
|---|---|---|---|---|
${tableRows.join("\n")}
<!-- memory:generated:end flows -->

## Canonical layers
- **system-design**: Top-level system structure, entry points, and high-level routing.
- **domain**: Ubiquitous language, bounded contexts, and business invariants.
- **security**: Trust boundaries, security controls, and authentication policy.
- **frontend**: Browser/client presentation, UI components, and client-side state.
- **gateway-edge**: API gateway, proxy, routing, and ingress middleware.
- **auth**: Identity verification, session management, and credential issuance.
- **backend**: Application use cases, API controllers, and service orchestration.
- **database**: Data models, schemas, persistence adapters, and migrations.
- **cloud-observability**: Infrastructure, deployment, metrics, logs, and tracing.
`);
}

function flowTemplate(
  layer: ArchitectureLayer,
  evidence?: ArchitectureEvidence,
  fingerprint?: string,
  timestamp?: string,
): string {
  const ts = timestamp ?? nowIso();
  const repoPaths = evidence?.paths && evidence.paths.length > 0 ? evidence.paths.slice(0, 10) : [];
  const upstream = evidence?.upstream ?? [];
  const downstream = evidence?.downstream ?? [];

  const layerMeta: Record<ArchitectureLayer, {
    title: string;
    description: string;
    responsibility: string;
    route: string;
    steps: Array<{ step: string; input: string; owner: string; output: string; failure: string }>;
    context: string;
    language: string;
    invariants: string;
    useCases: string;
    ports: string;
    dataClass: string;
    trustBoundaries: string;
    auth: string;
    persistence: string;
    failureBehavior: string;
    telemetry: string;
    recovery: string;
  }> = {
    "system-design": {
      title: "System design flow",
      description: "Top-level component topology, request lifecycle, and entry routing.",
      responsibility: "Orchestrates top-level system entry points and routes requests into subsystem boundaries.",
      route: "Client Request → Ingress / Gateway → Application Subsystems → Domain Core → Persistence / Infrastructure",
      steps: [
        { step: "1. Entry", input: "User / External Request", owner: "System Gateway", output: "Normalized Payload", failure: "400 Bad Request" },
        { step: "2. Routing", input: "Normalized Payload", owner: "Route Dispatcher", output: "Subsystem Invocation", failure: "404 Not Found" },
        { step: "3. Execution", input: "Subsystem Context", owner: "Domain / App Service", output: "Domain Result", failure: "500 Internal Error" },
        { step: "4. Response", input: "Domain Result", owner: "Response Formatter", output: "Serialized Response", failure: "Transport Error" },
      ],
      context: "System root boundary and subsystem registry.",
      language: "Entry points, Subsystems, Ingress, Router, Context Dispatcher.",
      invariants: "All external requests must enter through recognized gateway/entry points.",
      useCases: "Route request, dispatch commands, aggregate subsystem responses.",
      ports: "System entry point adapters, CLI routers, HTTP gateways.",
      dataClass: "Public perimeter payload; sanitized prior to internal dispatch.",
      trustBoundaries: "Public untrusted perimeter → authenticated subsystem runtime.",
      auth: "Perimeter validation and header extraction.",
      persistence: "Subsystem-delegated.",
      failureBehavior: "Fail-closed with sanitized error codes.",
      telemetry: "Ingress request counter, duration histogram, panic handler logs.",
      recovery: "Graceful process restart and health check probes.",
    },
    "domain": {
      title: "Domain flow",
      description: "Core DDD model, context boundaries, ubiquitous language, and business invariants.",
      responsibility: "Encapsulates business rules, invariants, and ubiquitous language isolated from infrastructure concerns.",
      route: "Application Command / Query → Domain Port → Domain Entity / Aggregate → Business Rule Evaluation → Domain Event / Result",
      steps: [
        { step: "1. Invariant Validation", input: "Command / Input Values", owner: "Domain Aggregate", output: "Validated Entities", failure: "Invariant Violation" },
        { step: "2. State Transition", input: "Validated Command", owner: "Domain Model", output: "Updated State", failure: "Business Rule Error" },
        { step: "3. Port Notification", input: "Domain Outcome", owner: "Domain Port", output: "Emitted Event / Result", failure: "Infrastructure Error" },
      ],
      context: "Core Business Domain (Single Bounded Context or Root Context).",
      language: "Aggregate, Entity, Value Object, Invariant, Domain Port, Domain Event.",
      invariants: "State transitions must maintain model invariants; no direct database mutations bypass domain logic.",
      useCases: "Execute business transaction, apply domain rules, evaluate policies.",
      ports: "Repository interface, Event Publisher port, Notification port.",
      dataClass: "Domain state; internal high-integrity data.",
      trustBoundaries: "Application service boundary → isolated domain model.",
      auth: "Domain permission verification and policy invariants.",
      persistence: "Decoupled domain repositories (implemented in infrastructure/database).",
      failureBehavior: "Domain exception / invariant rejection with explicit failure reason.",
      telemetry: "Domain event counters, business rule violation alerts.",
      recovery: "Transaction rollback and idempotent retry.",
    },
    "security": {
      title: "Security and trust flow",
      description: "Trust boundaries, authentication policies, permission verification, and data classification.",
      responsibility: "Enforces trust boundaries, cryptographic controls, authentication checks, and authorization policies across all routes.",
      route: "Untrusted Input → Trust Boundary Check → Identity Verification → Permission Evaluation → Sanitized Execution",
      steps: [
        { step: "1. Perimeter Check", input: "Raw Request / Payload", owner: "Security Guard", output: "Sanitized Input", failure: "403 Forbidden" },
        { step: "2. Identity Check", input: "Credentials / Token", owner: "Identity Provider", output: "Verified Subject", failure: "401 Unauthorized" },
        { step: "3. Authorization", input: "Subject & Permission Scope", owner: "Policy Engine", output: "Access Grant", failure: "403 Forbidden" },
      ],
      context: "Security & Trust Boundary Context.",
      language: "Principal, Token, Permission, Trust Boundary, Cipher, Policy Guard.",
      invariants: "Never execute unauthenticated or unauthorized operations across trust borders; secrets must never be exposed.",
      useCases: "Validate token, verify RBAC/ABAC permissions, enforce CSP/CORS, sanitize inputs.",
      ports: "Policy enforcement point (PEP), Secret manager port.",
      dataClass: "Confidential credentials, encryption keys, authorization tokens.",
      trustBoundaries: "Untrusted boundary → Perimeter guard → Authenticated domain.",
      auth: "Signature verification, token expiry check, revocation list check.",
      persistence: "Encrypted key storage or external IAM / secret manager.",
      failureBehavior: "Immediate reject (401/403) with generic error message.",
      telemetry: "Authentication failure rate, suspicious activity alerts, audit trail log.",
      recovery: "Session revocation, rate limiting, credential rotation.",
    },
    "frontend": {
      title: "Frontend flow",
      description: "Client presentation, user interaction, UI components, and state management.",
      responsibility: "Manages user interface rendering, client state transitions, and asynchronous communication with backend services.",
      route: "User Interaction → Component Event Handler → Client State Store → API Client → DOM Render",
      steps: [
        { step: "1. User Event", input: "DOM Interaction", owner: "UI Component", output: "Action Dispatch", failure: "Client Validation Error" },
        { step: "2. State Mutation", input: "Action", owner: "State Store", output: "Updated Reactive State", failure: "State Sync Failure" },
        { step: "3. Network Sync", input: "Server Request", owner: "API Client", output: "Async Response", failure: "Network / HTTP Error" },
      ],
      context: "Frontend Presentation & Client UI Context.",
      language: "Component, View, Client State, Action, Hook, Render Pipeline.",
      invariants: "UI states must remain deterministic and reflect valid underlying domain state.",
      useCases: "Render user views, capture form input, manage client-side navigation.",
      ports: "HTTP API client, Local storage adapter, WebSocket bridge.",
      dataClass: "User presentation data and client session cache.",
      trustBoundaries: "User browser environment → API gateway / edge.",
      auth: "Client bearer token storage and refresh loop.",
      persistence: "Browser cache, local storage, indexedDB.",
      failureBehavior: "Visual error toast / error boundary fallback.",
      telemetry: "Client web vitals (CWV), unhandled JS error tracking.",
      recovery: "Optimistic UI rollback and automated reconnection.",
    },
    "gateway-edge": {
      title: "Gateway and edge routing flow",
      description: "Reverse proxy, ingress termination, rate limiting, and edge request dispatch.",
      responsibility: "Terminates public network traffic, enforces ingress rate limits, and routes requests to appropriate downstream services.",
      route: "Inbound HTTP Traffic → Edge TLS / Firewall → Rate Limiter → Reverse Proxy → Upstream Target",
      steps: [
        { step: "1. Ingress Termination", input: "Public TCP/HTTP Request", owner: "Edge Server", output: "Decrypted Request", failure: "TLS Handshake Failure" },
        { step: "2. Rate Limiting", input: "Client IP / Token", owner: "Rate Limiter", output: "Traffic Clearance", failure: "429 Too Many Requests" },
        { step: "3. Upstream Dispatch", input: "Cleared Request", owner: "Proxy Router", output: "Upstream Forwarding", failure: "502 Bad Gateway" },
      ],
      context: "Gateway & Edge Routing Context.",
      language: "Ingress, Reverse Proxy, Upstream, Route Rule, Rate Limit, Edge Worker.",
      invariants: "Malformed or oversized payloads must be terminated before entering internal network.",
      useCases: "Terminate TLS, proxy upstream requests, enforce IP rate limits, route by path.",
      ports: "HTTP Reverse Proxy, DNS resolver, CDN edge cache.",
      dataClass: "Inbound raw HTTP stream.",
      trustBoundaries: "Public Internet → Private VPC / backend cluster.",
      auth: "Perimeter token inspection and API key verification.",
      persistence: "Transient connection cache and rate limit state (Redis/KV).",
      failureBehavior: "Standard HTTP gateway status codes (429, 502, 504).",
      telemetry: "Edge request rates, response latency percentiles, upstream error rates.",
      recovery: "Upstream health checking and failover to secondary endpoints.",
    },
    "auth": {
      title: "Authentication flow",
      description: "Identity verification, token issuance, session lifecycle, and credential validation.",
      responsibility: "Authenticates principal identities, manages session tokens, and validates cryptographic credentials.",
      route: "Credential Submission → Credential Validation → Subject Resolution → Session / Token Issuance → Authenticated Context",
      steps: [
        { step: "1. Credential Ingestion", input: "Login / Token Payload", owner: "Auth Controller", output: "Raw Credentials", failure: "400 Bad Request" },
        { step: "2. Identity Verification", input: "Credentials", owner: "Identity Validator", output: "Verified Principal", failure: "401 Invalid Credentials" },
        { step: "3. Token Issuance", input: "Verified Principal", owner: "Token Service", output: "Signed JWT / Session", failure: "Token Signing Error" },
      ],
      context: "Identity & Authentication Context.",
      language: "Principal, Subject, Session, Refresh Token, Credential, Password Hash.",
      invariants: "Passwords must be hashed using strong one-way algorithms; tokens must be cryptographically signed with short TTL.",
      useCases: "User login, session refresh, OAuth code exchange, logout revocation.",
      ports: "User credential repository, Hash provider, Token signer.",
      dataClass: "Confidential credentials, password hashes, session records.",
      trustBoundaries: "Public login endpoint → Identity verification boundary.",
      auth: "Multi-factor authentication (MFA) and cryptographic signature checks.",
      persistence: "User account table, Redis session store.",
      failureBehavior: "Exponential backoff on failed attempts; timing-safe comparisons.",
      telemetry: "Login success/failure metrics, brute-force attempt alerts.",
      recovery: "Account recovery workflow and emergency session invalidation.",
    },
    "backend": {
      title: "Backend application flow",
      description: "HTTP controllers, application use cases, service orchestration, and domain dispatch.",
      responsibility: "Receives transport requests, executes application use cases, coordinates transaction boundaries, and returns responses.",
      route: "HTTP Route Match → Controller / Handler → Application Use Case → Domain Execution → DTO Serialization",
      steps: [
        { step: "1. Request Handling", input: "HTTP Request", owner: "Route Handler", output: "Parsed DTO", failure: "400 Bad Request" },
        { step: "2. Use Case Execution", input: "Validated DTO", owner: "Application Service", output: "Domain Operation", failure: "Business Exception" },
        { step: "3. Output Mapping", input: "Domain Result", owner: "Presenter / Serializer", output: "HTTP Response DTO", failure: "500 Serialization Error" },
      ],
      context: "Application Orchestration Context.",
      language: "Controller, Route Handler, Application Service, Use Case, DTO, Presenter.",
      invariants: "Controllers must not contain business logic; dependencies must point inwards toward domain.",
      useCases: "Coordinate multi-aggregate transactions, dispatch domain commands, query read models.",
      ports: "HTTP Server router, Domain port callers, Transaction manager.",
      dataClass: "Application request/response DTOs.",
      trustBoundaries: "Transport layer → Application use case layer.",
      auth: "Route-level authorization middleware.",
      persistence: "Transaction coordinator delegating to repository interfaces.",
      failureBehavior: "Catch domain exceptions and map to standardized error envelopes.",
      telemetry: "Controller execution latency, HTTP status code distribution.",
      recovery: "Database transaction rollback and idempotent retry queues.",
    },
    "database": {
      title: "Database and persistence flow",
      description: "Entity relational mapping, query execution, migration management, and persistence adapters.",
      responsibility: "Executes ACID persistence transactions, manages database connections, and maps database records to domain entities.",
      route: "Domain Repository Invocation → Persistence Adapter → Query / ORM Layer → Database Engine → Hydrated Entity",
      steps: [
        { step: "1. Query Preparation", input: "Domain Entity / Query Criteria", owner: "Repository Adapter", output: "SQL / Query Statement", failure: "Query Build Error" },
        { step: "2. DB Execution", input: "Query Statement", owner: "DB Driver / Pool", output: "Raw Record Set", failure: "DB Connection / Constraint Error" },
        { step: "3. Entity Hydration", input: "Raw Record Set", owner: "Entity Mapper", output: "Hydrated Domain Model", failure: "Mapping Error" },
      ],
      context: "Persistence & Data Access Infrastructure Context.",
      language: "Schema, Migration, Repository Adapter, ORM, Connection Pool, Record.",
      invariants: "Database constraints enforce relational integrity; migrations are versioned and reversible.",
      useCases: "Persist aggregate state, execute relational queries, manage schema migrations.",
      ports: "Database driver connection pool, ORM mapper.",
      dataClass: "Persistent system of record data.",
      trustBoundaries: "Internal private network database connection.",
      auth: "Database credential pooling with minimum required privileges.",
      persistence: "Relational/Document database storage engine.",
      failureBehavior: "Transaction abort, pool reconnection on connection drop.",
      telemetry: "Query latency histograms, connection pool utilization, slow query logs.",
      recovery: "Automated transaction retry and read-replica failover.",
    },
    "cloud-observability": {
      title: "Cloud infrastructure and observability flow",
      description: "Telemetry instrumentation, distributed tracing, structured logging, deployment, and monitoring.",
      responsibility: "Collects runtime metrics, traces distributed operations, ships structured logs, and monitors service health.",
      route: "Runtime Event / Trace Span → Telemetry Exporter → Ingestion Pipeline → Storage / Dashboard → Alert Rule Evaluation",
      steps: [
        { step: "1. Telemetry Capture", input: "Runtime Operation / Metric", owner: "Instrumentation Hook", output: "OpenTelemetry Span / Metric", failure: "Dropped Event" },
        { step: "2. Log / Trace Export", input: "Structured Log Record", owner: "Telemetry Pipeline", output: "Batched Ingestion Payload", failure: "Export Timeout" },
        { step: "3. Alerting", input: "Aggregated Metrics", owner: "Monitoring Engine", output: "Alert Notification", failure: "Alert Delivery Failure" },
      ],
      context: "Cloud Infrastructure & Telemetry Context.",
      language: "Metric, Span, Trace, Structured Log, Prometheus, OpenTelemetry, Dashboard.",
      invariants: "Sensitive data / PII must be redacted from all telemetry streams before export.",
      useCases: "Export application traces, ship JSON logs, aggregate SLA/SLO metrics, trigger alert webhooks.",
      ports: "OTel collector exporter, Log appender transport, Metrics registry.",
      dataClass: "Operational metrics, sanitized trace context, application logs.",
      trustBoundaries: "Application runtime → Cloud monitoring / observability backend.",
      auth: "Telemetry collector API keys / IAM instance roles.",
      persistence: "Time-series database and log archival buckets.",
      failureBehavior: "Non-blocking asynchronous telemetry export (never block application critical path).",
      telemetry: "Self-monitoring metrics: export queue depth, drop counters.",
      recovery: "Local telemetry ring buffer on network partition.",
    },
  };

  const meta = layerMeta[layer] ?? {
    title: `${titleFromPath(layer)} flow`,
    description: `Architecture flow for ${layer}.`,
    responsibility: `Manages operations and boundaries for ${layer}.`,
    route: "Input → Processing → Domain → Output",
    steps: [{ step: "1. Process", input: "Input", owner: layer, output: "Output", failure: "Error" }],
    context: `${layer} context.`,
    language: `${layer} terms.`,
    invariants: `Invariants for ${layer}.`,
    useCases: `Use cases for ${layer}.`,
    ports: "Adapters.",
    dataClass: "Internal data.",
    trustBoundaries: "Subsystem boundary.",
    auth: "Authentication checks.",
    persistence: "Persistence mechanism.",
    failureBehavior: "Graceful error handling.",
    telemetry: "Logs and metrics.",
    recovery: "Recovery strategies.",
  };

  const stepsTable = [
    "| Step | Input | Owner | Output | Failure |",
    "|---|---|---|---|---|",
    ...meta.steps.map((s) => `| ${s.step} | ${s.input} | ${s.owner} | ${s.output} | ${s.failure} |`),
  ].join("\n");

  const anchorsContent = repoPaths.length > 0
    ? repoPaths.map((p) => `- [\`${p}\`](repo://${p})`).join("\n")
    : "- No direct code anchors detected.";

  let mermaidBlock = "";
  if (layer === "system-design") {
    mermaidBlock = `\n\`\`\`mermaid\ngraph LR\n  Client["Client / User"] --> Ingress["Ingress / Entry"]\n  Ingress --> App["App Subsystems"]\n  App --> Domain["Domain Core"]\n  Domain --> Storage["Persistence / Infrastructure"]\n\`\`\`\n`;
  }

  const body = `# ${meta.title}

## Responsibility
${meta.responsibility}

## Route
${meta.route}
${mermaidBlock}
## Steps
${stepsTable}

## Domain contract
- Context: ${meta.context}
- Language: ${meta.language}
- Invariants: ${meta.invariants}
- Application use cases: ${meta.useCases}
- Domain ports: ${meta.ports}

## Data & trust
- Data classification: ${meta.dataClass}
- Trust boundaries: ${meta.trustBoundaries}
- Authorization: ${meta.auth}
- Persistence: ${meta.persistence}

## Failure & observability
- Failure behavior: ${meta.failureBehavior}
- Logs/metrics/traces: ${meta.telemetry}
- Recovery: ${meta.recovery}

## Code anchors
<!-- memory:generated:start anchors -->
${anchorsContent}
<!-- memory:generated:end anchors -->

## Decisions & unknowns
- Confirmed initial baseline.`;

  return serializeMarkdown({
    type: "Flow",
    title: meta.title,
    description: meta.description,
    layer,
    scope: ".",
    status: "observed",
    repo_paths: repoPaths,
    upstream,
    downstream,
    provenance: "observed",
    repository_fingerprint: fingerprint ?? null,
    timestamp: ts,
  }, body);
}

function indexTemplate(title: string): string {
  return `# ${title}\n\n## Child directories\n\n<!-- memory:generated:start children -->\n<!-- memory:generated:end children -->\n\n## Documents\n\n<!-- memory:generated:start documents -->\n<!-- memory:generated:end documents -->\n\n## Source files\n\n<!-- memory:generated:start files -->\n<!-- memory:generated:end files -->\n\n## Tests\n\n<!-- memory:generated:start tests -->\n<!-- memory:generated:end tests -->\n`;
}

function logTemplate(scope: string, timestamp: Date): string {
  return `# ${titleFromPath(scope)} log\n\n> Append-only, newest first. Write via \`memory log --add\`; read via \`memory log --recent N\`.\n\n## ${today(timestamp)}\n\n### Init — \`evt-init\`\n- **Type:** init\n- **Summary:** Initialized \`${scope}\` memory.\n`;
}

function scopeDirectory(projectRoot: string, scope: string): string {
  return scope === "." ? bundlePath(projectRoot) : safeBundleFile(projectRoot, scope);
}

function relativeChangePath(projectRoot: string, absolute: string): string {
  return normalizeSlash(relative(projectRoot, absolute));
}

function scopeArchitectureSummary(scope: string, deepScan?: DeepScanResult): string {
  if (!deepScan) return `- Code root: \`${scope}/\``;
  const within = (items: string[]) => items.filter((item) => item.startsWith(`${scope}/`)).slice(0, 8);
  const fileCount = deepScan.scan.files.filter((f) => f.path.startsWith(`${scope}/`)).length;
  const lines = [`- Code root: \`${scope}/\` (${fileCount} files, observed)`];
  const groups: Array<[string, string[]]> = [
    ["Entry points", within(deepScan.architecture.entryPoints)],
    ["API routes", within(deepScan.architecture.apiRoutes)],
    ["Schemas", within(deepScan.architecture.databaseSchemas)],
  ];
  for (const [label, items] of groups) {
    if (items.length > 0) lines.push(`- ${label}: ${items.map((item) => `\`${item}\``).join(", ")}`);
  }
  return lines.join("\n");
}

/** Scope brief: what an agent needs before touching code under this scope, nothing more. */
function buildScopeAgentsContent(scope: string, timestamp: string, deepScan?: DeepScanResult): string {
  const title = titleFromPath(scope);
  return serializeMarkdown({
    type: "Agents",
    title: `${title} scope`,
    description: `Purpose, map, rules, and pitfalls for code under ${scope}.`,
    scope,
    code_refs: [`${scope}/**`],
    governance: "active",
    provenance: deepScan ? "observed" : "unresolved",
    timestamp,
  }, `# ${title} scope

## Purpose
- Unconfirmed.

## Map
${scopeArchitectureSummary(scope, deepScan)}

## Rules
- none recorded

## Pitfalls
- none recorded
`);
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
    await assertNoBundleParentSymlink(join(scopeDirectory(root, scope), "agents.md"));
  }
  const changes: FileChange[] = [];

  const initialScan = deepScan ? deepScan.scan : await scanRepository(root);
  const discovery = discoverArchitectureLayers(initialScan, deepScan);

  const rootFiles = new Map<string, string>([
    [join(memoryRoot, "index.md"), rootIndexTemplate(options.projectName ?? basename(root), timestamp, head, deepScan, initialScan.fingerprint)],
    [join(memoryRoot, "conventions.md"), conventionsTemplate(timestamp, deepScan)],
    [join(memoryRoot, "log.md"), logTemplate(".", date)],
    [join(memoryRoot, DECISIONS_DIRECTORY, "index.md"), decisionsIndexTemplate()],
    [join(memoryRoot, "sources", "index.md"), indexTemplate("Sources")],
    [join(memoryRoot, "architecture", "index.md"), architectureIndexTemplate(discovery.detectedLayers, timestamp)],
  ]);

  const layersToScaffold = [
    ...MANDATORY_ARCHITECTURE_LAYERS,
    ...CONDITIONAL_ARCHITECTURE_LAYERS.filter((layer) => discovery.layers.has(layer)),
  ];
  for (const layer of layersToScaffold) {
    const evidence = discovery.layers.get(layer);
    rootFiles.set(
      join(memoryRoot, "architecture", layer, "Flow.md"),
      flowTemplate(layer, evidence, initialScan.fingerprint, timestamp),
    );
  }

  for (const [path, content] of rootFiles) changes.push({ ...(await plannedWrite(path, content, dryRun, false)), path: relativeChangePath(root, path) });

  const tracked = [".", ...normalizedScopes];
  for (const scope of normalizedScopes) {
    const directory = scopeDirectory(root, scope);
    const files = new Map<string, string>([
      [join(directory, "agents.md"), buildScopeAgentsContent(scope, timestamp, deepScan)],
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

function sourceFileLines(scope: string, scan: RepositoryScan | undefined, tests: boolean): string[] {
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

  if (await readIfExists(join(memoryRoot, "index.md")) !== undefined &&
      await readIfExists(join(memoryRoot, "log.md")) !== undefined) {
    directories.add(".");
  }

  for (const file of walk.files) {
    const directory = dirname(file);
    if (directory === memoryRoot) continue;
    if (isReservedBundleDirectory(memoryRoot, directory)) continue;

    if (basename(file) === "agents.md" && await readIfExists(join(directory, "log.md")) !== undefined) {
      directories.add(scopeFromMemoryDirectory(memoryRoot, directory));
    }
  }
  return [...directories].sort((a, b) => a === "." ? -1 : b === "." ? 1 : a.localeCompare(b));
}

/** Bundle-owned directories that are never tracked code scopes. */
function isReservedBundleDirectory(memoryRoot: string, directory: string): boolean {
  return ["architecture", "sources", DECISIONS_DIRECTORY, ARCHIVE_DIRECTORY]
    .some((name) => isPathInside(join(memoryRoot, name), directory));
}

async function generateDocumentsList(
  files: string[],
  dir: string,
  pathPrefix: string,
  emptyMessage: string,
): Promise<string> {
  const directDocuments = files.filter((file) => dirname(file) === dir && !RESERVED_FILES.has(basename(file)));
  const documentLines = await Promise.all(directDocuments.sort().map(async (file) => {
    const metadata = await documentMetadata(file);
    return markdownEntry(metadata.title, `${pathPrefix}${basename(file)}`, metadata.description);
  }));
  return documentLines.join("\n") || emptyMessage;
}

function computeScopeFingerprint(scan: RepositoryScan | undefined, scope: string): string | undefined {
  if (!scan) return undefined;
  return hashText(
    scan.files
      .filter((file) => scope === "." || file.path.startsWith(`${scope}/`))
      .map((file) => `${file.path}:${file.size}:${file.mtimeMs}`)
      .join("\n"),
  );
}

function applySourceFingerprint(content: string, sourceFingerprint: string): string {
  const marker = `<!-- memory:source-fingerprint ${sourceFingerprint} -->`;
  const clean = content.replace(/<!-- memory:source-fingerprint [^>]+ -->\n?/, "");
  return `${clean.trimEnd()}\n\n${marker}\n`;
}

export async function syncIndexes(projectRoot: string, scan?: RepositoryScan, options: { dryRun?: boolean; now?: Date } = {}): Promise<FileChange[]> {
  const root = resolve(projectRoot);
  const memoryRoot = bundlePath(root);
  const archDir = join(memoryRoot, "architecture");
  const dryRun = options.dryRun ?? false;
  await assertWritableBundleVersion(root, true, true);
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

  const discovery = scan ? discoverArchitectureLayers(scan) : undefined;

  try {
    for (const directory of [...directories].sort()) {
      if (isArchivedBundlePath(`${normalizeSlash(relative(memoryRoot, directory))}/`)) continue;
      const scope = scopeFromMemoryDirectory(memoryRoot, directory);
      const isArchRoot = directory === archDir;
      const isArchLayer = dirname(directory) === archDir;

      if (isArchLayer) {
        const layer = basename(directory) as ArchitectureLayer;
        const flowPath = join(directory, "Flow.md");
        let flowContent = await readIfExists(flowPath);
        if (flowContent) {
          const parsedFlow = parseMarkdown(flowContent);
          const evidence = discovery?.layers.get(layer);
          const anchorLines = evidence && evidence.paths.length > 0
            ? evidence.paths.slice(0, 10).map((p) => `- [\`${p}\`](repo://${p})`).join("\n")
            : "- No direct code anchors detected.";

          if (flowContent.includes("<!-- memory:generated:start anchors -->")) {
            flowContent = replaceGeneratedRegion(flowContent, "anchors", anchorLines);
          }

          const flowValues: Record<string, unknown> = {};
          if (scan && scan.fingerprint !== parsedFlow.data.repository_fingerprint) {
            flowValues.repository_fingerprint = scan.fingerprint;
            flowValues.timestamp = nowIso(options.now);
          }

          if (evidence) {
            if (evidence.upstream && (!Array.isArray(parsedFlow.data.upstream) || parsedFlow.data.upstream.length === 0)) {
              flowValues.upstream = evidence.upstream;
            }
            if (evidence.downstream && (!Array.isArray(parsedFlow.data.downstream) || parsedFlow.data.downstream.length === 0)) {
              flowValues.downstream = evidence.downstream;
            }
            if (CONDITIONAL_ARCHITECTURE_LAYERS.includes(layer) && !discovery?.detectedLayers.includes(layer)) {
              if (parsedFlow.data.status !== "stale") flowValues.status = "stale";
            } else if (discovery?.detectedLayers.includes(layer)) {
              const nextStatus = parsedFlow.data.status === "confirmed" ? "confirmed" : "observed";
              if (parsedFlow.data.status !== nextStatus) flowValues.status = nextStatus;
            }
          }

          if (Object.keys(flowValues).length > 0) {
            flowContent = updateMarkdownFrontmatter(flowContent, flowValues);
          }
          const change = await plannedWrite(flowPath, flowContent, dryRun, true);
          changes.push({ ...change, path: relativeChangePath(root, flowPath) });
        }
        continue;
      }

      const indexPath = join(directory, "index.md");
      let content = await readIfExists(indexPath);
      if (!content) {
        if (directory === memoryRoot) {
          content = rootIndexTemplate(basename(root), nowIso(options.now), fallbackHead, undefined, scan?.fingerprint);
        } else if (isArchRoot) {
          content = architectureIndexTemplate(discovery?.detectedLayers ?? [...MANDATORY_ARCHITECTURE_LAYERS], nowIso(options.now));
        } else if (directory === join(memoryRoot, "sources")) {
          content = indexTemplate("Sources");
        } else if (directory === join(memoryRoot, DECISIONS_DIRECTORY)) {
          content = decisionsIndexTemplate();
        } else if (isReservedBundleDirectory(memoryRoot, directory)) {
          continue;
        } else {
          const agentsPath = join(directory, "agents.md");
          let agentsContent = await readIfExists(agentsPath);
          const sourceFingerprint = computeScopeFingerprint(scan, scope);
          if (agentsContent && sourceFingerprint) {
            agentsContent = applySourceFingerprint(agentsContent, sourceFingerprint);
            const change = await plannedWrite(agentsPath, agentsContent, dryRun, true);
            changes.push({ ...change, path: relativeChangePath(root, agentsPath) });
          }
          continue;
        }
      }

      if (directory === memoryRoot) {
        const rootParsed = parseMarkdown(content);
        if (!rootParsed.hasFrontmatter || rootParsed.errors.length > 0) throw new Error("Root index.md must contain valid frontmatter");

        const decisions = await listDecisions(root);
        const recentDecisions = decisions.filter((d) => d.status === "accepted").slice(-INDEX_RECENT_DECISIONS).reverse();
        if (content.includes("<!-- memory:generated:start decisions -->")) {
          const lines = recentDecisions.map((d) => truncateLine(`- [${d.id}](/${DECISIONS_DIRECTORY}/${basename(d.path)}) ${d.title}`));
          content = replaceGeneratedRegion(content, "decisions", lines.join("\n") || "- none");
        }

        if (content.includes("<!-- memory:generated:start recent -->")) {
          const recent = (await readLogEntries(root, { limit: INDEX_RECENT_LOG_ENTRIES, excludeTypes: ["init"] }))
            .map((entry) => truncateLine(`- ${entry.date} ${entry.type}: ${entry.title}${entry.scope === "." ? "" : ` (${entry.scope})`}`));
          content = replaceGeneratedRegion(content, "recent", recent.join("\n") || "- none");
        }

        if (content.includes("<!-- memory:generated:start scopes -->")) {
          const scoped = scopes.filter((s) => s !== ".");
          const visible = scoped.slice(0, 5);
          const lines: string[] = [];
          for (const trackedScope of visible) {
            const metadata = await documentMetadata(join(scopeDirectory(root, trackedScope), "agents.md"));
            lines.push(truncateLine(`- [${trackedScope}](/${trackedScope}/agents.md)${metadata.description ? ` — ${metadata.description}` : ""}`));
          }
          if (scoped.length > visible.length) lines.push(`- … ${scoped.length - visible.length} more: \`memory status\``);
          content = replaceGeneratedRegion(content, "scopes", lines.join("\n") || "- Project root only.");
        }

        const rootUpdates: Record<string, unknown> = {};
        if (rootParsed.data.memory_version !== MEMORY_VERSION) rootUpdates.memory_version = MEMORY_VERSION;
        if (rootParsed.data.architecture_mode !== "ddd") rootUpdates.architecture_mode = "ddd";
        if (rootParsed.data.architecture_index !== "/architecture/") rootUpdates.architecture_index = "/architecture/";
        if (rootParsed.data.system_flow !== "/architecture/system-design/Flow.md") rootUpdates.system_flow = "/architecture/system-design/Flow.md";
        if (scan && ((scan.head ?? null) !== rootParsed.data.repository_head || scan.fingerprint !== rootParsed.data.repository_fingerprint)) {
          rootUpdates.repository_head = scan.head ?? null;
          rootUpdates.repository_fingerprint = scan.fingerprint;
          rootUpdates.last_scan_at = nowIso(options.now);
          rootUpdates.timestamp = nowIso(options.now);
        }
        if (Object.keys(rootUpdates).length > 0) {
          content = updateMarkdownFrontmatter(content, rootUpdates);
        }
      } else if (directory === join(memoryRoot, DECISIONS_DIRECTORY)) {
        if (content.includes("<!-- memory:generated:start decisions -->")) {
          const rows = (await listDecisions(root)).map((d) =>
            `| [${d.id}](./${basename(d.path)}) | ${d.status} | ${d.date ?? "-"} | ${d.title.replace(/\|/g, "/")} |`);
          content = replaceGeneratedRegion(content, "decisions", `| ID | Status | Date | Decision |\n|---|---|---|---|${rows.length ? `\n${rows.join("\n")}` : ""}`);
        }
      } else if (isArchRoot) {
        const archLayers = ALL_ARCHITECTURE_LAYERS.filter((l) =>
          walk.files.some((f) => f === join(archDir, l, "Flow.md"))
        );
        const flowRows: string[] = [];
        for (const l of archLayers) {
          const flowFile = join(archDir, l, "Flow.md");
          const flowDoc = await readIfExists(flowFile);
          if (flowDoc) {
            const parsedFlow = parseMarkdown(flowDoc);
            const status = typeof parsedFlow.data.status === "string" ? parsedFlow.data.status : "observed";
            const up = Array.isArray(parsedFlow.data.upstream) && parsedFlow.data.upstream.length > 0
              ? parsedFlow.data.upstream.join(", ")
              : "none";
            const down = Array.isArray(parsedFlow.data.downstream) && parsedFlow.data.downstream.length > 0
              ? parsedFlow.data.downstream.join(", ")
              : "none";
            flowRows.push(`| ${l} | ${status} | ${up} | ${down} | [${l}/Flow.md](./${l}/Flow.md) |`);
          }
        }
        if (content.includes("<!-- memory:generated:start flows -->")) {
          content = replaceGeneratedRegion(
            content,
            "flows",
            flowRows.length > 0
              ? `| Layer | Status | Upstream | Downstream | Flow Document |\n|---|---|---|---|---|\n${flowRows.join("\n")}`
              : "| Layer | Status | Upstream | Downstream | Flow Document |\n|---|---|---|---|---|",
          );
        }
      } else {
        if (content.includes("<!-- memory:generated:start children -->")) {
          const childLines = directChildren(directory, directories).map((child) => {
            const label = basename(child);
            return markdownEntry(titleFromPath(label), `./${label}/`);
          });
          content = replaceGeneratedRegion(content, "children", childLines.join("\n") || "- No child directories.");
        }

        if (content.includes("<!-- memory:generated:start documents -->")) {
          content = replaceGeneratedRegion(
            content,
            "documents",
            await generateDocumentsList(walk.files, directory, "./", "- No documents."),
          );
        }

        if (content.includes("<!-- memory:generated:start files -->")) {
          const fileLines = sourceFileLines(scope, scan, false);
          content = replaceGeneratedRegion(content, "files", fileLines.join("\n") || "- No direct source files.");
        }

        if (content.includes("<!-- memory:generated:start tests -->")) {
          const testLines = sourceFileLines(scope, scan, true);
          content = replaceGeneratedRegion(content, "tests", testLines.join("\n") || "- No direct tests.");
        }
      }

      const sourceFingerprint = computeScopeFingerprint(scan, scope);
      if (sourceFingerprint && directory !== memoryRoot && !isArchRoot && !isArchLayer) {
        content = applySourceFingerprint(content, sourceFingerprint);
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

/** Canonical log entry types. Unknown types are accepted but normalized to lowercase kebab-case. */
export const LOG_ENTRY_TYPES = ["change", "decision", "finding", "fix", "correction", "note", "source", "migration", "init"] as const;

function normalizeEventType(value: unknown): string {
  const raw = typeof value === "string" && value.trim() ? value : "note";
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "note";
}

function formatEvent(event: Record<string, unknown>, now = new Date()): string {
  assertSafeEvent(event);
  const type = normalizeEventType(event.type ?? event.category);
  const title = typeof event.title === "string" && event.title.trim() ? event.title.trim() : typeof event.summary === "string" ? event.summary.trim().slice(0, 80) : titleFromPath(type);
  const id = typeof event.id === "string" ? event.id : `evt-${now.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)}-${randomUUID().slice(0, 6)}`;
  const lines = [`### ${title.replace(/\n/g, " ")} — \`${id}\``, `- **Type:** ${type}`];
  for (const [key, value] of Object.entries(event)) {
    if (["title", "type", "category", "id"].includes(key) || value === undefined || value === null || value === "") continue;
    const label = key.replace(/[_-]+/g, " ").replace(/^./, (character) => character.toUpperCase());
    const rendered = Array.isArray(value) ? value.map(yamlScalar).join(", ") : yamlScalar(value);
    lines.push(`- **${label}:** ${rendered}`);
  }
  return lines.join("\n");
}

function prependLogEntry(content: string, date: string, entry: string): string {
  const dateHeading = `## ${date}`;
  const headingIndex = content.search(new RegExp(`^## ${date}\\s*$`, "m"));
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
  const next = prependLogEntry(content, today(options.now), formatEvent(event, options.now));
  const change = await plannedWrite(path, next, options.dryRun ?? false, true);
  return { ...change, path: relativeChangePath(projectRoot, path) };
}

function extractSection(content: string, heading: string): string {
  const pattern = new RegExp(`^#{2,3}\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "im");
  const match = pattern.exec(content);
  if (!match) return "";
  const rest = content.slice(match.index + match[0].length).replace(/^\s+/, "");
  const next = rest.search(/^#{2,3}\s+/m);
  return (next >= 0 ? rest.slice(0, next) : rest).trim();
}

function truncateLine(line: string, max = MAX_GENERATED_LINE_BYTES): string {
  if (Buffer.byteLength(line, "utf8") <= max) return line;
  let out = line;
  while (Buffer.byteLength(`${out}…`, "utf8") > max) out = out.slice(0, -1);
  return `${out}…`;
}

/** Parse a log document into entries (newest first as written). Tolerates legacy entry formats. */
export function parseLogEntries(content: string, scope: string, archived = false): LogEntry[] {
  const entries: LogEntry[] = [];
  let date = "";
  let current: LogEntry | undefined;
  const flush = () => {
    if (current) {
      current.body = current.body.trim();
      entries.push(current);
      current = undefined;
    }
  };
  for (const line of content.split(/\r?\n/)) {
    const dateMatch = /^##\s+(\d{4}-\d{2}-\d{2})\s*$/.exec(line);
    if (dateMatch) {
      flush();
      date = dateMatch[1];
      continue;
    }
    const entryMatch = /^###\s+(.+?)(?:\s+[—–-]\s+`([^`]+)`)?\s*$/.exec(line);
    if (entryMatch && date) {
      flush();
      current = { scope, date, type: "", title: entryMatch[1].trim(), id: entryMatch[2], body: "", archived };
      continue;
    }
    if (!current) continue;
    const typeMatch = /^-\s+\*\*Type:\*\*\s*(.+)$/.exec(line);
    if (typeMatch && !current.type) current.type = normalizeEventType(typeMatch[1]);
    else current.body += `${line}\n`;
  }
  flush();
  for (const entry of entries) {
    if (!entry.type) {
      const legacy = /^([A-Za-z-]+)(?::|\s|$)/.exec(entry.title)?.[1] ?? "note";
      entry.type = normalizeEventType(legacy);
    }
  }
  return entries;
}

export interface ReadLogOptions {
  scope?: string;
  limit?: number;
  types?: string[];
  excludeTypes?: string[];
  since?: string;
  query?: string;
  includeArchive?: boolean;
}

/**
 * Read log entries across scopes without loading whole files into agent context.
 * Returns newest first, filtered and bounded.
 */
export async function readLogEntries(projectRoot: string, options: ReadLogOptions = {}): Promise<LogEntry[]> {
  const root = resolve(projectRoot);
  const memoryRoot = bundlePath(root);
  const scopes = options.scope ? [assertSafeRelativePath(options.scope)] : await discoverTrackedScopes(root);
  const types = options.types?.map(normalizeEventType);
  const excluded = new Set(options.excludeTypes?.map(normalizeEventType) ?? []);
  const needle = options.query?.toLowerCase().trim();
  const all: LogEntry[] = [];
  for (const scope of scopes) {
    const content = await readIfExists(join(scopeDirectory(root, scope), "log.md"));
    if (content) all.push(...parseLogEntries(content, scope));
    if (options.includeArchive) {
      const archiveDir = scope === "." ? join(memoryRoot, "log") : join(scopeDirectory(root, scope), "log");
      const walk = await walkMemory(archiveDir);
      for (const file of walk.files.sort().reverse()) all.push(...parseLogEntries(await readFile(file, "utf8"), scope, true));
    }
  }
  const filtered = all.filter((entry) =>
    (!types || types.includes(entry.type)) &&
    !excluded.has(entry.type) &&
    (!options.since || entry.date >= options.since) &&
    (!needle || `${entry.title}\n${entry.body}`.toLowerCase().includes(needle)));
  // Stable: newer date first; within a date keep file order (already newest first).
  const order = new Map(filtered.map((entry, index) => [entry, index]));
  filtered.sort((a, b) => (a.date === b.date ? order.get(a)! - order.get(b)! : b.date.localeCompare(a.date)));
  return typeof options.limit === "number" ? filtered.slice(0, Math.max(0, options.limit)) : filtered;
}

/**
 * Move log day-sections older than the current month into `log/YYYY-MM.md`.
 * Keeps hot logs small; archives stay searchable via `memory log --all` and `memory search`.
 */
export async function rotateLogs(projectRoot: string, options: { dryRun?: boolean; now?: Date } = {}): Promise<FileChange[]> {
  const root = resolve(projectRoot);
  const dryRun = options.dryRun ?? false;
  const currentMonth = today(options.now).slice(0, 7);
  const changes: FileChange[] = [];
  for (const scope of await discoverTrackedScopes(root)) {
    const directory = scopeDirectory(root, scope);
    const logPath = join(directory, "log.md");
    const content = await readIfExists(logPath);
    if (!content) continue;
    const firstDate = content.search(/^## \d{4}-\d{2}-\d{2}\s*$/m);
    if (firstDate < 0) continue;
    const header = content.slice(0, firstDate);
    const sections = content.slice(firstDate).split(/^(?=## \d{4}-\d{2}-\d{2}\s*$)/m);
    const keep: string[] = [];
    const byMonth = new Map<string, string[]>();
    for (const section of sections) {
      const month = /^## (\d{4}-\d{2})/.exec(section)?.[1];
      if (!month || month >= currentMonth) keep.push(section);
      else byMonth.set(month, [...(byMonth.get(month) ?? []), section]);
    }
    if (byMonth.size === 0) continue;
    for (const [month, monthSections] of byMonth) {
      const archivePath = join(directory, "log", `${month}.md`);
      await assertNoBundleParentSymlink(archivePath);
      const existing = await readIfExists(archivePath);
      const archiveHeader = `# ${titleFromPath(scope)} log ${month}\n\n> Archived by \`memory sync\`. Read via \`memory log --all\`.\n\n`;
      const body = monthSections.map((s) => s.trimEnd()).join("\n\n");
      const next = existing ? `${existing.trimEnd()}\n\n${body}\n` : `${archiveHeader}${body}\n`;
      changes.push({ ...(await plannedWrite(archivePath, next, dryRun, true)), path: relativeChangePath(root, archivePath) });
    }
    const hot = `${header.trimEnd()}\n\n${keep.map((s) => s.trimEnd()).join("\n\n")}${keep.length ? "\n" : ""}`;
    changes.push({ ...(await plannedWrite(logPath, hot, dryRun, true)), path: relativeChangePath(root, logPath) });
  }
  return changes;
}

function slugForDecision(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "decision";
}

export async function listDecisions(projectRoot: string): Promise<DecisionSummary[]> {
  const dir = join(bundlePath(resolve(projectRoot)), DECISIONS_DIRECTORY);
  let names: string[];
  try {
    names = (await readdir(dir)).filter((name) => DECISION_FILE_PATTERN.test(name)).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const summaries: DecisionSummary[] = [];
  for (const name of names) {
    const path = join(dir, name);
    const parsed = parseMarkdown(await readFile(path, "utf8"));
    const id = typeof parsed.data.id === "string" ? parsed.data.id : name.slice(0, name.indexOf("-", 2));
    summaries.push({
      id,
      title: typeof parsed.data.title === "string" ? parsed.data.title : name,
      status: typeof parsed.data.status === "string" ? parsed.data.status : "accepted",
      date: typeof parsed.data.date === "string" ? parsed.data.date : undefined,
      description: typeof parsed.data.description === "string" ? parsed.data.description : undefined,
      path: relativeChangePath(resolve(projectRoot), path),
    });
  }
  return summaries;
}

/**
 * Record a durable decision as its own small file and a matching log entry.
 * Always semantic: callers must supply the user's approval reason.
 */
export async function recordDecision(
  projectRoot: string,
  input: DecisionInput,
  options: { dryRun?: boolean; now?: Date; scope?: string } = {},
): Promise<{ decision: DecisionSummary; changes: FileChange[] }> {
  const root = resolve(projectRoot);
  await assertWritableBundleVersion(root);
  await assertValidForMutation(root);
  if (!input.title?.trim()) throw new Error("Decision requires a title");
  if (!input.decision?.trim()) throw new Error("Decision requires the decision text");
  if (!input.approvalReason?.trim()) throw new Error("Decisions require explicit user approval (approvalReason)");
  const payload = JSON.stringify(input);
  if (containsLikelySecret(payload)) throw new Error("Refusing to write likely secret material to Project Memory");

  const dryRun = options.dryRun ?? false;
  const date = today(options.now);
  const existing = await listDecisions(root);
  const nextNumber = existing.reduce((max, d) => Math.max(max, Number(/D-(\d+)/.exec(d.id)?.[1] ?? 0)), 0) + 1;
  const id = `D-${String(nextNumber).padStart(3, "0")}`;
  const fileName = `${id}-${slugForDecision(input.title)}.md`;
  const decisionsDir = join(bundlePath(root), DECISIONS_DIRECTORY);
  const path = join(decisionsDir, fileName);
  await assertNoBundleParentSymlink(path);

  const superseded = input.supersedes ? existing.find((d) => d.id === input.supersedes) : undefined;
  if (input.supersedes && !superseded) throw new Error(`Unknown decision to supersede: ${input.supersedes}`);
  if (superseded && superseded.status !== "accepted") throw new Error(`${superseded.id} is already ${superseded.status}`);

  const rejected = (input.rejected ?? []).filter((r) => r.trim());
  const body = [
    `# ${id}: ${input.title.trim()}`,
    "",
    "## Decision",
    input.decision.trim(),
    "",
    "## Context",
    input.context?.trim() || "- none recorded",
    "",
    "## Rejected",
    rejected.length ? rejected.map((r) => `- ${r.trim()}`).join("\n") : "- none recorded",
    "",
    "## Consequences",
    input.consequences?.trim() || "- none recorded",
    "",
  ].join("\n");

  const frontmatter: Record<string, unknown> = {
    type: "Decision",
    id,
    title: input.title.trim(),
    description: input.decision.trim().split("\n")[0].slice(0, 160),
    status: "accepted",
    date,
    approval: input.approvalReason.trim(),
    timestamp: nowIso(options.now),
  };
  if (input.codeRefs?.length) frontmatter.code_refs = input.codeRefs;
  if (superseded) frontmatter.supersedes = superseded.id;

  const snapshot = dryRun ? undefined : await captureBundle(root);
  const changes: FileChange[] = [];
  try {
    await mkdir(decisionsDir, { recursive: true });
    if (await readIfExists(join(decisionsDir, "index.md")) === undefined) {
      changes.push({ ...(await plannedWrite(join(decisionsDir, "index.md"), decisionsIndexTemplate(), dryRun, false)), path: relativeChangePath(root, join(decisionsDir, "index.md")) });
    }
    changes.push({ ...(await plannedWrite(path, serializeMarkdown(frontmatter, body), dryRun, false)), path: relativeChangePath(root, path) });
    if (superseded) {
      const oldPath = resolve(root, superseded.path);
      const oldContent = await readFile(oldPath, "utf8");
      changes.push({ ...(await plannedWrite(oldPath, updateMarkdownFrontmatter(oldContent, { status: "superseded", superseded_by: id }), dryRun, true)), path: superseded.path });
    }
    if (!dryRun) {
      changes.push(await recordEvent(root, options.scope ?? ".", {
        type: "decision",
        title: `${id} ${input.title.trim()}`,
        decision: `[${id}](/${DECISIONS_DIRECTORY}/${fileName})`,
        supersedes: superseded?.id,
        approval: input.approvalReason.trim(),
      }, { now: options.now }));
      changes.push(...await syncIndexes(root, undefined, { now: options.now }));
    }
  } catch (error) {
    if (snapshot) await restoreBundle(root, snapshot);
    throw error;
  }
  return {
    decision: { id, title: input.title.trim(), status: "accepted", date, path: relativeChangePath(root, path), description: String(frontmatter.description) },
    changes,
  };
}

export async function getMemoryStatus(projectRoot: string): Promise<MemoryStatus> {
  const root = resolve(projectRoot);
  const empty = { accepted: 0, superseded: 0, deprecated: 0 };
  const rootIndex = await readIfExists(join(bundlePath(root), "index.md"));
  if (!rootIndex) {
    const validation = await validateBundle(root);
    return { initialized: false, root, scopes: [], decisions: empty, recent: [], sourceCounts: {}, validation };
  }
  const rootParsed = parseMarkdown(rootIndex);
  const decisions = { ...empty };
  for (const d of await listDecisions(root)) {
    if (d.status in decisions) decisions[d.status as keyof typeof decisions]++;
  }

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
    version: typeof rootParsed.data.memory_version === "string" ? rootParsed.data.memory_version : undefined,
    scopes: await discoverTrackedScopes(root),
    decisions,
    recent: await readLogEntries(root, { limit: 5 }),
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

export interface BuildMemoryContextOptions {
  scope?: string;
  budget?: number;
  toon?: boolean;
}

/** Shared preamble for every adapter. Keep in sync with scripts/antigravity-hook.mjs. */
export const MEMORY_CONTEXT_PREAMBLE = `[PROJECT MEMORY] Router below. Load on demand only; never read .memory/ in bulk.
- Before editing a file: \`memory check --for-path <file>\` → open only the docs it lists. governance: hold → stop, ask user.
- Before proposing a design: \`memory decisions\` → open only the relevant D-NNN file. Do not contradict accepted decisions silently.
- Recent context: \`memory log --recent 10\` (filter: --type decision|fix|finding).
- Anything else: \`memory search <keywords>\` → open the top hit only.
- Changing decisions, conventions, scope rules, or architecture: present 2-3 options, mark one (Recommended), wait for explicit approval.
- After meaningful work: \`memory log --add\` one concise entry (change|fix|finding|decision|correction).`;

/** Shared end-of-work reminder for every adapter. Keep in sync with scripts/antigravity-hook.mjs. */
export const MAINTENANCE_REMINDER = "[PROJECT MEMORY] Repository changed. Before handoff, log one concise entry per meaningful change (`memory log --add --type change|fix|finding`). If a durable choice was made, ask the user (2-3 options, one Recommended) before `memory decide`. Update only the one owning doc if a rule, pitfall, or architecture fact changed.";

function formatMemoryContext(indexContent: string): string {
  return `${MEMORY_CONTEXT_PREAMBLE}\n\nINDEX\n${indexContent}`;
}

function formatMemoryBudgetError(path: string, byteLength: number, budget: number): string {
  return `[PROJECT MEMORY ERROR]\n${path} exceeds the byte budget (${byteLength} > ${budget} bytes).\nAutomatic context injection was suppressed to prevent token budget blowup and partial truncation.\nRun \`memory compact --dry-run\` or reduce index size to restore automatic injection.`;
}

export async function buildMemoryContext(
  projectRoot: string,
  options?: BuildMemoryContextOptions,
): Promise<string> {
  const root = resolve(projectRoot);
  const memoryRoot = bundlePath(root);
  const rootIndexPath = join(memoryRoot, "index.md");
  const rootIndex = await readIfExists(rootIndexPath);
  if (!rootIndex) {
    throw new Error("Project Memory root index.md not found");
  }

  const budget = options?.budget ?? MAX_AUTO_CONTEXT_BYTES;
  const indexBytes = Buffer.byteLength(rootIndex, "utf8");

  if (indexBytes > budget) {
    return formatMemoryBudgetError(".memory/index.md", indexBytes, budget);
  }

  let fullContent = rootIndex;
  if (options?.scope && options.scope !== ".") {
    const safeScope = assertSafeRelativePath(options.scope);
    const scopeIndexPath = join(memoryRoot, ...safeScope.split("/"), "index.md");
    const scopeIndex = await readIfExists(scopeIndexPath);
    if (scopeIndex) {
      const scopeBytes = Buffer.byteLength(scopeIndex, "utf8");
      if (indexBytes + scopeBytes > budget) {
        return formatMemoryBudgetError(`.memory/${safeScope}/index.md (combined with root index)`, indexBytes + scopeBytes, budget);
      }
      fullContent = `${rootIndex}\n\n<!-- scope:${safeScope} -->\n${scopeIndex}`;
    }
  }

  if (options?.toon) {
    const parsed = parseMarkdown(rootIndex);
    const toonObj = {
      project: parsed.data.project ?? parsed.data.title ?? "Project",
      memory_version: parsed.data.memory_version ?? null,
      index_bytes: indexBytes,
      budget,
      index: fullContent,
    };
    return JSON.stringify(toonObj, null, 2);
  }

  return formatMemoryContext(fullContent);
}

const STOP_WORDS = new Set([
  "a", "about", "above", "after", "again", "against", "all", "am", "an", "and",
  "any", "are", "aren't", "as", "at", "be", "because", "been", "before", "being",
  "below", "between", "both", "but", "by", "can't", "cannot", "could", "couldn't",
  "did", "didn't", "do", "does", "doesn't", "doing", "don't", "down", "during",
  "each", "few", "for", "from", "further", "had", "hadn't", "has", "hasn't",
  "have", "haven't", "having", "he", "he'd", "he'll", "he's", "her", "here",
  "here's", "hers", "herself", "him", "himself", "his", "how", "how's", "i",
  "i'd", "i'll", "i'm", "i've", "if", "in", "into", "is", "isn't", "it", "it's",
  "its", "itself", "let's", "me", "more", "most", "mustn't", "my", "myself",
  "no", "nor", "not", "of", "off", "on", "once", "only", "or", "other", "ought",
  "our", "ours", "ourselves", "out", "over", "own", "same", "shan't", "she",
  "she'd", "she'll", "she's", "should", "shouldn't", "so", "some", "such",
  "than", "that", "that's", "the", "their", "theirs", "them", "themselves",
  "then", "there", "there's", "these", "they", "they'd", "they'll", "they're",
  "they've", "this", "those", "through", "to", "too", "under", "until", "up",
  "very", "was", "wasn't", "we", "we'd", "we'll", "we're", "we've", "were",
  "weren't", "what", "what's", "when", "when's", "where", "where's", "which",
  "while", "who", "who's", "whom", "why", "why's", "with", "won't", "would",
  "wouldn't", "you", "you'd", "you'll", "you're", "you've", "your", "yours",
  "yourself", "yourselves",
]);

export function tokenize(text: string): string[] {
  if (!text) return [];
  const words = text.toLowerCase().match(/[a-z0-9_-]+/g) ?? [];
  return words.filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

export async function validateBundle(projectRoot: string, options?: ValidateOptions): Promise<ValidationResult> {
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
  const rootIndex = await readIfExists(rootIndexPath);
  if (!rootIndex) diagnostics.push({ severity: "error", code: "missing-root-index", path: ".memory/index.md", message: "Root index.md is required" });
  else {
    const parsed = parseMarkdown(rootIndex);
    if (!parsed.hasFrontmatter || parsed.errors.length > 0) diagnostics.push({ severity: "error", code: "root-frontmatter", path: ".memory/index.md", message: parsed.errors.join("; ") || "Root index requires frontmatter" });
    else {
      if (parsed.data.memory_version !== MEMORY_VERSION) diagnostics.push({ severity: "error", code: "version", path: ".memory/index.md", message: `Expected memory_version ${MEMORY_VERSION}` });
      if (parsed.data.architecture_mode !== "ddd") diagnostics.push({ severity: "error", code: "architecture-mode", path: ".memory/index.md", message: "Root index requires architecture_mode: ddd" });
      if (typeof parsed.data.architecture_index !== "string") diagnostics.push({ severity: "error", code: "architecture-index", path: ".memory/index.md", message: "Root index requires architecture_index" });
      if (typeof parsed.data.system_flow !== "string") diagnostics.push({ severity: "error", code: "system-flow", path: ".memory/index.md", message: "Root index requires system_flow" });
    }
  }

  // Validate architecture index and mandatory flows
  const archDir = join(memoryRoot, "architecture");
  const archIndexPath = join(archDir, "index.md");
  if (!(await exists(archIndexPath))) {
    diagnostics.push({ severity: "error", code: "missing-architecture-index", path: ".memory/architecture/index.md", message: "Architecture index (/architecture/index.md) is required" });
  }

  for (const layer of MANDATORY_ARCHITECTURE_LAYERS) {
    const flowPath = join(archDir, layer, "Flow.md");
    if (!(await exists(flowPath))) {
      diagnostics.push({ severity: "error", code: "missing-mandatory-flow", path: `.memory/architecture/${layer}/Flow.md`, message: `Mandatory architecture flow ${layer}/Flow.md is required` });
    }
  }

  // Check architecture directory layer folders for exact Flow.md naming
  if (await exists(archDir)) {
    try {
      const archEntries = await readdir(archDir, { withFileTypes: true });
      for (const entry of archEntries) {
        if (entry.isDirectory()) {
          const layerDirPath = join(archDir, entry.name);
          const layerFiles = await readdir(layerDirPath);
          if (!layerFiles.includes("Flow.md")) {
            diagnostics.push({ severity: "error", code: "invalid-flow-file", path: `.memory/architecture/${entry.name}`, message: `Architecture layer directory '${entry.name}' must contain exact Flow.md` });
          }
        }
      }
    } catch {
      // Readdir error handled by walk
    }
  }

  let currentScan: RepositoryScan | undefined;
  try {
    currentScan = await scanRepository(root);
  } catch {
    // Optional scan for warning checks
  }

  const fileGraph = new Map<string, Set<string>>();
  const scopeDirectories = new Set<string>();
  let sourceCount = 0;
  for (const path of walk.files) {
    const rel = normalizeSlash(relative(root, path));
    const name = basename(path);
    // Archived history is preserved verbatim and never validated as live memory.
    if (isArchivedBundlePath(normalizeSlash(relative(memoryRoot, path)))) continue;
    const content = await readFile(path, "utf8");
    const byteLength = Buffer.byteLength(content, "utf8");

    for (const markerError of validateGeneratedMarkers(content)) diagnostics.push({ severity: "error", code: "markers", path: rel, message: markerError });

    const generatedMatches = content.matchAll(/<!--\s*memory:generated:start[^\n]*\n([\s\S]*?)<!--\s*memory:generated:end/g);
    for (const match of generatedMatches) {
      for (const line of match[1].split("\n")) {
        if (Buffer.byteLength(line, "utf8") > MAX_GENERATED_LINE_BYTES) {
          diagnostics.push({ severity: "warning", code: "budget-generated-line", path: rel, message: `Generated line exceeds ${MAX_GENERATED_LINE_BYTES} bytes (${Buffer.byteLength(line, "utf8")} bytes)` });
          break;
        }
      }
    }

    const parsed = parseMarkdown(content);
    const reserved = RESERVED_FILES.has(name);
    const rootIndexFile = path === rootIndexPath;

    if (rootIndexFile) {
      if (byteLength > MAX_ROOT_INDEX_BYTES) {
        diagnostics.push({ severity: "error", code: "budget-root-index", path: rel, message: `Root index exceeds ${MAX_ROOT_INDEX_BYTES} bytes budget (${byteLength} bytes)` });
      } else if (byteLength > WARN_ROOT_INDEX_BYTES) {
        diagnostics.push({ severity: "warning", code: "budget-root-index", path: rel, message: `Root index exceeds ${WARN_ROOT_INDEX_BYTES} bytes target (${byteLength} bytes)` });
      }
    } else if (name === "index.md") {
      if (byteLength > MAX_SCOPE_INDEX_BYTES) {
        diagnostics.push({ severity: "error", code: "budget-scope-index", path: rel, message: `Scope index exceeds ${MAX_SCOPE_INDEX_BYTES} bytes budget (${byteLength} bytes)` });
      }
    }

    if (!reserved && !rootIndexFile) {
      if (!parsed.hasFrontmatter || parsed.errors.length > 0) diagnostics.push({ severity: "error", code: "frontmatter", path: rel, message: parsed.errors.join("; ") || "Document requires YAML frontmatter" });
      else if (typeof parsed.data.type !== "string" || !parsed.data.type.trim()) diagnostics.push({ severity: "error", code: "type", path: rel, message: "Document frontmatter requires a non-empty type" });
    }

    // Trust tier and provenance validation
    if (parsed.data.trust_tier !== undefined) {
      const tier = parsed.data.trust_tier;
      if (typeof tier !== "string" || !["generated", "verified", "human_authored"].includes(tier)) {
        diagnostics.push({ severity: "error", code: "invalid-trust-tier", path: rel, message: `Invalid trust_tier: '${String(tier)}'. Must be 'generated', 'verified', or 'human_authored'` });
      }
    }
    if (parsed.data.generated !== undefined) {
      const gen = parsed.data.generated as Record<string, unknown>;
      if (!gen || typeof gen !== "object" || typeof gen.by !== "string" || !gen.by.trim() || typeof gen.at !== "string" || !gen.at.trim() || Number.isNaN(Date.parse(gen.at))) {
        diagnostics.push({ severity: "error", code: "invalid-generated-metadata", path: rel, message: "Generated metadata requires non-empty 'by' and valid ISO date 'at'" });
      }
    }
    if (parsed.data.verified !== undefined) {
      const ver = parsed.data.verified as Record<string, unknown>;
      if (!ver || typeof ver !== "object" || typeof ver.by !== "string" || !ver.by.trim() || typeof ver.at !== "string" || !ver.at.trim() || Number.isNaN(Date.parse(ver.at))) {
        diagnostics.push({ severity: "error", code: "invalid-verified-metadata", path: rel, message: "Verified metadata requires non-empty 'by' and valid ISO date 'at'" });
      }
    }
    if (parsed.data.code_refs !== undefined) {
      if (!Array.isArray(parsed.data.code_refs) || parsed.data.code_refs.some((r) => typeof r !== "string" || !r.trim())) {
        diagnostics.push({ severity: "error", code: "invalid-code-refs", path: rel, message: "code_refs must be an array of non-empty string glob patterns" });
      }
    }
    if (parsed.data.governance !== undefined) {
      if (typeof parsed.data.governance !== "string" || !["hold", "active", "deprecated"].includes(parsed.data.governance)) {
        diagnostics.push({ severity: "error", code: "invalid-governance", path: rel, message: `Invalid governance value: '${String(parsed.data.governance)}'. Must be 'hold', 'active', or 'deprecated'` });
      }
    }

    // Description drift validation
    if (options?.drift && typeof parsed.data.description === "string") {
      const desc = parsed.data.description.trim();
      if (desc.length < 10) {
        diagnostics.push({ severity: "warning", code: "description-drift", path: rel, message: "Description is too short (< 10 characters)" });
      } else if (/^(TODO|TBD|Placeholder|Draft|None)$/i.test(desc)) {
        diagnostics.push({ severity: "warning", code: "description-drift", path: rel, message: "Description contains a generic placeholder" });
      } else if (parsed.body.length > 100) {
        const descTokens = tokenize(desc);
        const bodyTokens = new Set(tokenize(parsed.body));
        const matchedTokens = descTokens.filter((t) => bodyTokens.has(t));
        if (descTokens.length >= 3 && matchedTokens.length === 0) {
          diagnostics.push({ severity: "warning", code: "description-drift", path: rel, message: "Description drifted: no matching keywords found in document content" });
        }
      }
    }

    // Flow.md validation
    if (name === "Flow.md" && (rel.startsWith(".memory/architecture/") || rel.startsWith("architecture/"))) {
      if (byteLength > WARN_DOCUMENT_BYTES) {
        diagnostics.push({ severity: "warning", code: "budget-document-size", path: rel, message: `Flow.md exceeds ${WARN_DOCUMENT_BYTES} bytes recommended limit (${byteLength} bytes)` });
      }
      if (parsed.data.type !== "Flow") {
        diagnostics.push({ severity: "error", code: "flow-type", path: rel, message: "Flow document requires type: Flow" });
      }
      const layer = parsed.data.layer;
      const parentDirName = basename(dirname(path));
      if (typeof layer !== "string" || !ALL_ARCHITECTURE_LAYERS.includes(layer as ArchitectureLayer)) {
        diagnostics.push({ severity: "error", code: "flow-layer", path: rel, message: `Invalid architecture layer: ${String(layer)}` });
      } else if (layer !== parentDirName) {
        diagnostics.push({ severity: "error", code: "flow-layer-mismatch", path: rel, message: `Flow layer '${layer}' does not match directory '${parentDirName}'` });
      }
      if (typeof parsed.data.scope !== "string") {
        diagnostics.push({ severity: "error", code: "flow-scope", path: rel, message: "Flow requires scope" });
      }
      if (typeof parsed.data.status !== "string") {
        diagnostics.push({ severity: "error", code: "flow-status", path: rel, message: "Flow requires status" });
      }
      if (typeof parsed.data.provenance !== "string") {
        diagnostics.push({ severity: "error", code: "flow-provenance", path: rel, message: "Flow requires provenance" });
      }

      // Check warnings
      if (Array.isArray(parsed.data.upstream)) {
        for (const up of parsed.data.upstream) {
          if (typeof up === "string" && !ALL_ARCHITECTURE_LAYERS.includes(up as ArchitectureLayer)) {
            diagnostics.push({ severity: "warning", code: "unknown-flow-layer", path: rel, message: `Unknown upstream layer: ${up}` });
          }
        }
      }
      if (Array.isArray(parsed.data.downstream)) {
        for (const down of parsed.data.downstream) {
          if (typeof down === "string" && !ALL_ARCHITECTURE_LAYERS.includes(down as ArchitectureLayer)) {
            diagnostics.push({ severity: "warning", code: "unknown-flow-layer", path: rel, message: `Unknown downstream layer: ${down}` });
          }
        }
      }

      if (layer === "domain") {
        if (/- Context:\s*$/m.test(content) || /- Invariants:\s*$/m.test(content)) {
          diagnostics.push({ severity: "warning", code: "empty-domain-contract", path: rel, message: "Domain Flow requires non-empty context and invariants in Domain contract" });
        }
      }

      if (Array.isArray(parsed.data.repo_paths)) {
        for (const repoPath of parsed.data.repo_paths) {
          if (typeof repoPath === "string") {
            const targetPath = resolve(root, repoPath);
            if (!(await exists(targetPath))) {
              diagnostics.push({ severity: "warning", code: "stale-repo-path", path: rel, message: `Repository path no longer exists: ${repoPath}` });
            }
          }
        }
      }

      if (currentScan && typeof parsed.data.repository_fingerprint === "string" && parsed.data.repository_fingerprint !== currentScan.fingerprint) {
        diagnostics.push({ severity: "warning", code: "stale-flow-fingerprint", path: rel, message: "Flow fingerprint is stale; run memory sync to refresh" });
      }
    }

    const isSubfolder = dirname(path) !== memoryRoot;
    if (LEGACY_FILES.has(name)) {
      diagnostics.push({ severity: "error", code: "legacy-file", path: rel, message: `${name} was removed in format ${MEMORY_VERSION}; run \`memory migrate\` to archive it` });
    }

    if (name === "agents.md" && isSubfolder && !isReservedBundleDirectory(memoryRoot, dirname(path))) {
      if (byteLength > WARN_DOCUMENT_BYTES) {
        diagnostics.push({ severity: "warning", code: "budget-document-size", path: rel, message: `agents.md exceeds ${WARN_DOCUMENT_BYTES} bytes recommended limit (${byteLength} bytes)` });
      }
      scopeDirectories.add(dirname(path));
      const expectedScope = scopeFromMemoryDirectory(memoryRoot, dirname(path));
      if (parsed.data.scope !== expectedScope) diagnostics.push({ severity: "error", code: "scope-mismatch", path: rel, message: `Agents scope must be '${expectedScope}'` });
      for (const field of ["title", "description"]) {
        if (typeof parsed.data[field] !== "string") diagnostics.push({ severity: "error", code: "managed-field", path: rel, message: `Agents requires '${field}'` });
      }
    }

    if (name === "log.md" && byteLength > WARN_LOG_BYTES) {
      diagnostics.push({ severity: "warning", code: "budget-log-size", path: rel, message: `log.md exceeds ${WARN_LOG_BYTES} bytes; run \`memory sync\` to archive older months` });
    }

    if (parsed.data.type === "Decision") {
      if (!DECISION_FILE_PATTERN.test(name) || dirname(path) !== join(memoryRoot, DECISIONS_DIRECTORY)) {
        diagnostics.push({ severity: "error", code: "decision-path", path: rel, message: "Decision documents must live at decisions/D-NNN-slug.md" });
      }
      if (typeof parsed.data.id !== "string" || !name.startsWith(`${parsed.data.id}-`)) {
        diagnostics.push({ severity: "error", code: "decision-id", path: rel, message: "Decision 'id' must match its D-NNN filename prefix" });
      }
      if (typeof parsed.data.status !== "string" || !DECISION_STATUSES.has(parsed.data.status)) {
        diagnostics.push({ severity: "error", code: "decision-status", path: rel, message: `Invalid decision status: ${String(parsed.data.status)} (accepted | superseded | deprecated)` });
      }
      if (parsed.data.status === "superseded" && typeof parsed.data.superseded_by !== "string") {
        diagnostics.push({ severity: "warning", code: "decision-superseded-by", path: rel, message: "Superseded decision should name superseded_by" });
      }
    }

    if (parsed.data.type === "Source") {
      sourceCount++;
      if (typeof parsed.data.resource !== "string" || typeof parsed.data.source_hash !== "string") diagnostics.push({ severity: "error", code: "source-fields", path: rel, message: "Source requires resource and source_hash" });
      if (typeof parsed.data.integration_status !== "string" || !SOURCE_STATUSES.has(parsed.data.integration_status)) diagnostics.push({ severity: "error", code: "source-status", path: rel, message: `Invalid source integration_status: ${String(parsed.data.integration_status)}` });
      if (parsed.data.integration_status === "changed" || parsed.data.integration_status === "stale") diagnostics.push({ severity: options?.strict ? "error" : "warning", code: "stale-source", path: rel, message: `Source needs integration (${parsed.data.integration_status})` });
      if (parsed.data.integration_status === "integrated") {
        if (typeof parsed.data.integrated_at !== "string") diagnostics.push({ severity: "warning", code: "integration-time", path: rel, message: "Integrated source should record integrated_at" });
        if (!Array.isArray(parsed.data.affected_documents) || parsed.data.affected_documents.length === 0) diagnostics.push({ severity: "warning", code: "source-impact", path: rel, message: "Integrated source should list affected_documents" });
      }
    }

    const docLinks = new Set<string>();
    const links = content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g);
    for (const link of links) {
      const target = resolveMemoryLink(memoryRoot, path, link[1].trim());
      if (!target) continue;
      if (target === "__escape__") diagnostics.push({ severity: "error", code: "link-escape", path: rel, message: `Link escapes bundle: ${link[1]}` });
      else if (!(await exists(target)) && !(await exists(join(target, "index.md"))) && !(await exists(join(target, "agents.md")))) diagnostics.push({ severity: options?.strict ? "error" : "warning", code: "broken-link", path: rel, message: `Broken link: ${link[1]}` });
      else docLinks.add(target);
    }
    fileGraph.set(path, docLinks);
  }

  // Reachability & Orphan detection
  const reachable = new Set<string>();
  const queue: string[] = [];
  if (await exists(rootIndexPath)) {
    reachable.add(rootIndexPath);
    queue.push(rootIndexPath);
  }
  if (await exists(archIndexPath)) {
    reachable.add(archIndexPath);
    queue.push(archIndexPath);
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const targets = fileGraph.get(current);
    if (targets) {
      for (const t of targets) {
        let resolved = t;
        if (await exists(join(t, "index.md"))) resolved = join(t, "index.md");
        else if (await exists(join(t, "agents.md"))) resolved = join(t, "agents.md");

        if (!reachable.has(resolved)) {
          reachable.add(resolved);
          queue.push(resolved);
        }
      }
    }
  }

  for (const filePath of walk.files) {
    const fileName = basename(filePath);
    const relToBundle = normalizeSlash(relative(memoryRoot, filePath));
    if (
      fileName === "log.md" ||
      relToBundle.startsWith(`${ARCHIVE_DIRECTORY}/`) ||
      /(?:^|\/)log\/\d{4}-\d{2}\.md$/.test(relToBundle) ||
      isPathInside(join(memoryRoot, "sources"), filePath) ||
      (dirname(filePath) === memoryRoot && (ROOT_REQUIRED_FILES as readonly string[]).includes(fileName))
    ) {
      continue;
    }
    if (!reachable.has(filePath)) {
      const relDoc = normalizeSlash(relative(root, filePath));
      diagnostics.push({
        severity: options?.strict ? "error" : "warning",
        code: "orphan-document",
        path: relDoc,
        message: `Document is orphaned: not linked or reachable from root index.md (${relDoc})`,
      });
    }
  }

  for (const file of ROOT_REQUIRED_FILES) {
    if (!(await exists(join(memoryRoot, file)))) diagnostics.push({ severity: "error", code: "incomplete-scope", path: ".memory", message: `Root memory is missing ${file}` });
  }
  for (const file of ROOT_RECOMMENDED_FILES) {
    if (!(await exists(join(memoryRoot, file)))) diagnostics.push({ severity: "warning", code: "missing-recommended", path: ".memory", message: `Root memory is missing ${file}; run \`memory migrate\`` });
  }
  for (const directory of scopeDirectories) {
    for (const file of SCOPE_CORE_FILES) {
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
Project memory lives in \`.memory/\`. \`.memory/index.md\` is the router; open only the one file or command it points to for the current need.
- Before editing a file: \`memory check --for-path <file>\`. If governance is \`hold\`, stop and ask.
- Before proposing a design: \`memory decisions\`; never contradict an accepted decision without asking.
- Changing decisions, conventions, scope rules, or architecture: offer 2-3 options, mark one (Recommended), wait for explicit approval.
- After meaningful work: \`memory log --add\` one concise entry. Never rewrite history.
- Write memory only through \`memory_apply\` or the \`memory\` CLI.
${AGENTS_END}`;

export interface MigrateResult {
  root: string;
  version: string;
  changes: FileChange[];
  archived: string[];
  validation: ValidationResult;
}

/** True for bundle paths holding historical content (never governed, indexed, or validated as live docs). */
function isArchivedBundlePath(relToBundle: string): boolean {
  return relToBundle.startsWith(`${ARCHIVE_DIRECTORY}/`) || /(?:^|\/)log\/\d{4}-\d{2}\.md$/.test(relToBundle);
}

const LEGACY_AGENTS_SECTIONS = ["Goal & Requirements", "Current State & Progress", "Tasks & Action Items"];

function hasLegacyAgentsSections(content: string): boolean {
  return LEGACY_AGENTS_SECTIONS.some((heading) => new RegExp(`^##\\s+${heading.replace(/[&]/g, "\\&")}\\s*$`, "m").test(content));
}

/** Rebuild a 0.2 scope agents.md (goal/progress/tasks) into the 0.3 brief, keeping its architecture summary. */
function rebuildLegacyAgents(scope: string, content: string, timestamp: string): string {
  const parsed = parseMarkdown(content);
  const summary = extractSection(content, "Scope Architecture & Summary").replace(/^###\s+/gm, "- ").trim();
  const rebuilt = parseMarkdown(buildScopeAgentsContent(scope, timestamp));
  const body = rebuilt.body.replace(/## Map\n[\s\S]*?\n\n## Rules/, `## Map\n${summary || `- Code root: \`${scope}/\``}\n\n## Rules`);
  const data: Record<string, unknown> = { ...rebuilt.data };
  for (const key of ["code_refs", "governance", "governance_reason", "tags", "uid"]) {
    if (parsed.data[key] !== undefined) data[key] = parsed.data[key];
  }
  return serializeMarkdown(data, body);
}

/**
 * Upgrade 0.1/0.2 bundles to 0.3. Idempotent and dry-run capable.
 * Legacy goal/progress/tasks files and rebuilt documents are moved verbatim into
 * `.memory/archive/legacy/` — nothing is deleted.
 */
export async function migrateBundle(
  projectRoot: string,
  options: { dryRun?: boolean; now?: Date } = {},
): Promise<MigrateResult> {
  const root = resolve(projectRoot);
  const memoryRoot = bundlePath(root);
  const dryRun = options.dryRun ?? false;
  const date = options.now ?? new Date();
  const timestamp = nowIso(date);

  const rootIndexPath = join(memoryRoot, "index.md");
  const rootIndexContent = await readIfExists(rootIndexPath);
  if (!rootIndexContent) throw new Error(`Project Memory is not initialized at ${memoryRoot}`);
  const initialParsed = parseMarkdown(rootIndexContent);
  if (!initialParsed.hasFrontmatter || initialParsed.errors.length > 0) {
    throw new Error("Root index has invalid frontmatter; repair it before migration");
  }
  const version = initialParsed.data.memory_version;
  if (typeof version !== "string" || (version !== MEMORY_VERSION && !LEGACY_VERSIONS.has(version))) {
    throw new Error(`Unsupported memory_version for migration: ${String(version)}`);
  }

  const walk = await walkMemory(memoryRoot);
  if (walk.diagnostics.some((d) => d.code === "symlink")) throw new Error("Refusing to migrate a bundle containing symbolic links");

  const legacyArchiveRoot = join(memoryRoot, ARCHIVE_DIRECTORY, "legacy");
  const toArchive: string[] = [];
  const rebuiltAgents = new Map<string, string>();
  for (const file of walk.files) {
    const relToBundle = normalizeSlash(relative(memoryRoot, file));
    if (isArchivedBundlePath(relToBundle)) continue;
    const dir = dirname(file);
    const name = basename(file);
    if (LEGACY_FILES.has(name)) toArchive.push(file);
    else if (name === "index.md" && dir !== memoryRoot && !isReservedBundleDirectory(memoryRoot, dir)) toArchive.push(file);
    else if (name === "agents.md" && dir !== memoryRoot && !isReservedBundleDirectory(memoryRoot, dir)) {
      const content = await readFile(file, "utf8");
      if (hasLegacyAgentsSections(content)) {
        toArchive.push(file);
        rebuiltAgents.set(file, rebuildLegacyAgents(scopeFromMemoryDirectory(memoryRoot, dir), content, timestamp));
      }
    }
  }
  const rootIsLegacy = version !== MEMORY_VERSION;
  if (rootIsLegacy) toArchive.push(rootIndexPath);

  const needsConventions = await readIfExists(join(memoryRoot, "conventions.md")) === undefined;
  const needsDecisions = await readIfExists(join(memoryRoot, DECISIONS_DIRECTORY, "index.md")) === undefined;
  if (!rootIsLegacy && toArchive.length === 0 && !needsConventions && !needsDecisions) {
    return { root, version: MEMORY_VERSION, changes: [], archived: [], validation: await validateBundle(root) };
  }

  const snapshot = dryRun ? undefined : await captureBundle(root);
  const changes: FileChange[] = [];
  const archived: string[] = [];
  try {
    const scan = await scanRepository(root);
    const deepScan = await deepScanRepository(root, scan);
    const discovery = discoverArchitectureLayers(scan, deepScan);

    // 1. Archive legacy documents verbatim (never overwrite an existing archive copy).
    for (const file of toArchive) {
      const relToBundle = normalizeSlash(relative(memoryRoot, file));
      const target = join(legacyArchiveRoot, ...relToBundle.split("/"));
      await assertNoBundleParentSymlink(target);
      const content = await readFile(file, "utf8");
      const existingArchive = await readIfExists(target);
      if (existingArchive !== undefined && existingArchive !== content) {
        throw new Error(`Archive already contains a different ${relative(root, target)}; resolve manually before migrating`);
      }
      changes.push({ ...(await plannedWrite(target, content, dryRun, false)), path: relativeChangePath(root, target) });
      archived.push(relativeChangePath(root, file));
      if (file === rootIndexPath || rebuiltAgents.has(file)) continue;
      if (!dryRun) await rm(file, { force: true });
      changes.push({ path: relativeChangePath(root, file), action: "update" });
    }

    // 2. Rebuild scope briefs; ensure every legacy scope still has agents.md + log.md.
    for (const [file, content] of rebuiltAgents) {
      changes.push({ ...(await plannedWrite(file, content, dryRun, true)), path: relativeChangePath(root, file) });
    }
    const legacyScopeDirs = new Set(toArchive.map(dirname).filter((dir) => dir !== memoryRoot && !isReservedBundleDirectory(memoryRoot, dir)));
    for (const dir of legacyScopeDirs) {
      const hadScopeDocs = toArchive.some((f) => dirname(f) === dir && LEGACY_FILES.has(basename(f)));
      if (!hadScopeDocs) continue;
      const scope = scopeFromMemoryDirectory(memoryRoot, dir);
      const agentsPath = join(dir, "agents.md");
      if (await readIfExists(agentsPath) === undefined) {
        changes.push({ ...(await plannedWrite(agentsPath, buildScopeAgentsContent(scope, timestamp, deepScan), dryRun, false)), path: relativeChangePath(root, agentsPath) });
      }
      const logPath = join(dir, "log.md");
      if (await readIfExists(logPath) === undefined) {
        changes.push({ ...(await plannedWrite(logPath, logTemplate(scope, date), dryRun, false)), path: relativeChangePath(root, logPath) });
      }
    }

    // 3. Architecture lenses (0.1 bundles may lack them).
    const archDir = join(memoryRoot, "architecture");
    const archIndexPath = join(archDir, "index.md");
    if (await readIfExists(archIndexPath) === undefined) {
      changes.push({ ...(await plannedWrite(archIndexPath, architectureIndexTemplate(discovery.detectedLayers, timestamp), dryRun, false)), path: relativeChangePath(root, archIndexPath) });
    }
    for (const layer of [...new Set([...MANDATORY_ARCHITECTURE_LAYERS, ...discovery.detectedLayers])]) {
      const flowPath = join(archDir, layer, "Flow.md");
      if (await readIfExists(flowPath) === undefined) {
        changes.push({ ...(await plannedWrite(flowPath, flowTemplate(layer, discovery.layers.get(layer), scan.fingerprint, timestamp), dryRun, false)), path: relativeChangePath(root, flowPath) });
      }
    }

    // 4. New 0.3 root documents.
    if (needsConventions) {
      const path = join(memoryRoot, "conventions.md");
      changes.push({ ...(await plannedWrite(path, conventionsTemplate(timestamp, deepScan), dryRun, false)), path: relativeChangePath(root, path) });
    }
    if (needsDecisions) {
      const path = join(memoryRoot, DECISIONS_DIRECTORY, "index.md");
      changes.push({ ...(await plannedWrite(path, decisionsIndexTemplate(), dryRun, false)), path: relativeChangePath(root, path) });
    }
    if (await readIfExists(join(memoryRoot, "log.md")) === undefined) {
      const path = join(memoryRoot, "log.md");
      changes.push({ ...(await plannedWrite(path, logTemplate(".", date), dryRun, false)), path: relativeChangePath(root, path) });
    }
    if (await readIfExists(join(memoryRoot, "sources", "index.md")) === undefined) {
      const path = join(memoryRoot, "sources", "index.md");
      changes.push({ ...(await plannedWrite(path, indexTemplate("Sources"), dryRun, false)), path: relativeChangePath(root, path) });
    }

    // 5. Replace the root router (old copy archived above).
    if (rootIsLegacy) {
      const projectName = typeof initialParsed.data.project === "string" ? initialParsed.data.project : basename(root);
      const nextIndex = rootIndexTemplate(projectName, timestamp, scan.head, deepScan, scan.fingerprint);
      changes.push({ ...(await plannedWrite(rootIndexPath, nextIndex, dryRun, true)), path: relativeChangePath(root, rootIndexPath) });
    }

    if (dryRun) {
      return {
        root,
        version: MEMORY_VERSION,
        changes,
        archived,
        validation: { ok: true, diagnostics: [], counts: { documents: 0, scopes: 0, sources: 0, errors: 0, warnings: 0 } },
      };
    }

    // 6. Record, re-index, and verify.
    changes.push(await recordEvent(root, ".", {
      type: "migration",
      title: `Migrated memory ${version} → ${MEMORY_VERSION}`,
      summary: "Removed goal/progress/tasks tracking; added conventions.md and decisions/.",
      archived: archived.length ? `${archived.length} file(s) → .memory/${ARCHIVE_DIRECTORY}/legacy/` : "none",
    }, { now: date }));
    // AGENTS.md is repository content: write it before the final scan so fingerprints are current.
    changes.push(await syncAgentsFile(root));
    changes.push(...await syncIndexes(root, await scanRepository(root), { now: date }));
    const validation = await validateBundle(root);
    if (!validation.ok) {
      throw new Error(`Migration produced invalid bundle: ${validation.diagnostics.filter((d) => d.severity === "error").map((d) => `${d.path ?? "bundle"}: ${d.message}`).join("; ")}`);
    }
    return { root, version: MEMORY_VERSION, changes, archived, validation };
  } catch (error) {
    if (snapshot) await restoreBundle(root, snapshot);
    throw error;
  }
}

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

/**
 * Semantic = changes binding project meaning (decisions, conventions, scope rules, architecture).
 * Generated regions, source integration status, and non-semantic log entries are safe to automate.
 */
export function operationRequiresApproval(operation: MemoryOperation): boolean {
  if (operation.semantic) return true;
  if (operation.action === "append_log") {
    return SEMANTIC_EVENT_TYPES.has(normalizeEventType(operation.event?.type ?? operation.event?.category));
  }
  if (operation.action === "write_document" || operation.action === "update_frontmatter") {
    const path = operation.path?.replace(/\\/g, "/").replace(/^\.\//, "") ?? "";
    if (path.startsWith("sources/")) return operation.action === "write_document";
    return true;
  }
  return false;
}

export async function applyMemoryPlan(projectRoot: string, plan: MemoryPlan, options: { dryRun?: boolean; scan?: RepositoryScan } = {}): Promise<ApplyResult> {
  if (!plan || !Array.isArray(plan.operations) || plan.operations.length === 0) throw new Error("Memory plan requires at least one operation");
  const supportedActions = new Set(["write_document", "update_frontmatter", "replace_generated", "append_log", "sync_indexes"]);
  for (const operation of plan.operations) {
    if (!operation || !supportedActions.has(operation.action)) throw new Error(`Unsupported memory operation: ${String(operation?.action)}`);
  }
  if (options.dryRun) {
    const stagingRoot = await mkdtemp(join(tmpdir(), "project-memory-dry-run-"));
    try {
      await cp(bundlePath(projectRoot), bundlePath(stagingRoot), { recursive: true, verbatimSymlinks: true });
      return await applyMemoryPlan(stagingRoot, plan, { dryRun: false, scan: options.scan });
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
    if (isArchivedBundlePath(normalizeSlash(relative(bundlePath(projectRoot), target)))) throw new Error("Archived memory is read-only");
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

      if (LEGACY_FILES.has(basename(target))) throw new Error(`${basename(target)} is not part of format ${MEMORY_VERSION}`);
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

export async function generateMemoryMap(projectRoot: string): Promise<string> {
  const root = resolve(projectRoot);
  const scan = await scanRepository(root);
  const deepScan = await deepScanRepository(root, scan);
  return generateTreemapContent(scan, deepScan);
}

export function matchesGlobPattern(pattern: string, targetPath: string): boolean {
  const normPattern = normalizeSlash(pattern).replace(/^\.?\//, "");
  const normTarget = normalizeSlash(targetPath).replace(/^\.?\//, "");

  if (normPattern === normTarget) return true;

  if (normTarget.startsWith(normPattern.endsWith("/") ? normPattern : `${normPattern}/`)) {
    return true;
  }

  const escaped = normPattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "___GLOBSTAR___")
    .replace(/\*/g, "[^/]*")
    .replace(/___GLOBSTAR___/g, ".*");

  return new RegExp(`^${escaped}$`).test(normTarget);
}

export async function checkPathGovernance(
  projectRoot: string,
  targetPath: string
): Promise<PathGovernanceResult> {
  const root = resolve(projectRoot);
  const memoryRoot = bundlePath(root);
  const relTarget = normalizeSlash(relative(root, resolve(root, targetPath))).replace(/^\.?\//, "");

  const walk = await walkMemory(memoryRoot);
  const governingDocuments: PathGovernanceResult["governingDocuments"] = [];
  const holds: PathGovernanceResult["holds"] = [];
  const constraints: string[] = [];

  for (const filePath of walk.files) {
    const relFile = normalizeSlash(relative(root, filePath));
    if (isArchivedBundlePath(normalizeSlash(relative(memoryRoot, filePath)))) continue;
    const content = await readFile(filePath, "utf8");
    const parsed = parseMarkdown(content);
    const data = parsed.data;
    if (data.type === "Decision" && data.status !== "accepted") continue;

    // Project-wide conventions govern every path.
    let isGoverning = filePath === join(memoryRoot, "conventions.md");
    const codeRefs = Array.isArray(data.code_refs)
      ? data.code_refs.filter((r): r is string => typeof r === "string")
      : [];

    for (const ref of codeRefs) {
      if (matchesGlobPattern(ref, relTarget)) {
        isGoverning = true;
        break;
      }
    }

    if (!isGoverning && Array.isArray(data.repo_paths)) {
      for (const repoPath of data.repo_paths) {
        if (typeof repoPath === "string" && matchesGlobPattern(repoPath, relTarget)) {
          isGoverning = true;
          break;
        }
      }
    }

    if (!isGoverning && basename(filePath) === "agents.md" && dirname(filePath) !== memoryRoot && !isReservedBundleDirectory(memoryRoot, dirname(filePath))) {
      const scope = scopeFromMemoryDirectory(memoryRoot, dirname(filePath));
      if (relTarget === scope || relTarget.startsWith(`${scope}/`)) {
        isGoverning = true;
      }
    }

    if (isGoverning) {
      const docType = typeof data.type === "string" ? data.type : (basename(filePath) === "agents.md" ? "Agents" : "Document");
      const title = typeof data.title === "string" ? data.title : basename(filePath);
      const governance = typeof data.governance === "string" ? (data.governance as GovernanceStatus) : undefined;
      const governanceReason = typeof data.governance_reason === "string" ? data.governance_reason : undefined;

      governingDocuments.push({
        path: relFile,
        type: docType,
        title,
        codeRefs: codeRefs.length > 0 ? codeRefs : undefined,
        governance,
        governanceReason,
      });

      if (governance === "hold") {
        holds.push({ path: relFile, reason: governanceReason });
      }

      const constraintLines = content.split("\n").filter((line) => {
        const trimmed = line.trim();
        return (
          /^-?\s*(MUST|MUST NOT|NEVER|INVARIANT|Constraint):/i.test(trimmed) ||
          /^- \*\*Invariant\*\*/i.test(trimmed) ||
          /^- \*\*Constraint\*\*/i.test(trimmed)
        );
      });
      for (const line of constraintLines) {
        const clean = line.replace(/^[-*]\s+/, "").trim();
        if (!constraints.includes(clean)) constraints.push(clean);
      }
    }
  }

  // Global conventions apply everywhere but do not make a path "tracked".
  const conventionsRel = normalizeSlash(relative(root, join(memoryRoot, "conventions.md")));
  const specific = governingDocuments.filter((d) => d.path !== conventionsRel);
  let overallGovernance: GovernanceStatus = "untracked";
  if (holds.length > 0) {
    overallGovernance = "hold";
  } else if (specific.length > 0) {
    overallGovernance = specific.every((d) => d.governance === "deprecated") ? "deprecated" : "active";
  }

  return {
    targetPath: relTarget,
    governance: overallGovernance,
    holds,
    governingDocuments,
    constraints,
  };
}

export async function searchMemory(
  projectRoot: string,
  query: string,
  options?: { limit?: number; scope?: string }
): Promise<SearchResult[]> {
  const root = resolve(projectRoot);
  const memoryRoot = bundlePath(root);
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  const walk = await walkMemory(memoryRoot);
  const limit = options?.limit ?? 10;
  const targetScopeDir = options?.scope ? scopeDirectory(root, options.scope) : undefined;

  interface DocIndex {
    path: string;
    relPath: string;
    title: string;
    type: string;
    description: string;
    tags: string[];
    content: string;
    body: string;
    tokenCounts: Map<string, number>;
    dl: number;
  }

  const docIndices: DocIndex[] = [];

  for (const filePath of walk.files) {
    if (targetScopeDir && !isPathInside(targetScopeDir, filePath)) continue;
    const content = await readFile(filePath, "utf8");
    const parsed = parseMarkdown(content);
    const data = parsed.data;

    const title = typeof data.title === "string" ? data.title : basename(filePath);
    const type = typeof data.type === "string" ? data.type : "Document";
    const description = typeof data.description === "string" ? data.description : "";
    const tags = Array.isArray(data.tags) ? data.tags.filter((t): t is string => typeof t === "string") : [];

    const titleTokens = tokenize(title);
    const descTokens = tokenize(description);
    const tagsTokens = tags.flatMap((t) => tokenize(t));
    const bodyTokens = tokenize(parsed.body);

    const tokenCounts = new Map<string, number>();
    for (const t of titleTokens) tokenCounts.set(t, (tokenCounts.get(t) ?? 0) + 3.0);
    for (const t of descTokens) tokenCounts.set(t, (tokenCounts.get(t) ?? 0) + 2.0);
    for (const t of tagsTokens) tokenCounts.set(t, (tokenCounts.get(t) ?? 0) + 2.0);
    for (const t of bodyTokens) tokenCounts.set(t, (tokenCounts.get(t) ?? 0) + 1.0);

    const dl = titleTokens.length + descTokens.length + tagsTokens.length + bodyTokens.length;
    docIndices.push({
      path: filePath,
      relPath: normalizeSlash(relative(root, filePath)),
      title,
      type,
      description,
      tags,
      content,
      body: parsed.body,
      tokenCounts,
      dl,
    });
  }

  if (docIndices.length === 0) return [];

  const N = docIndices.length;
  const avgdl = docIndices.reduce((acc, d) => acc + d.dl, 0) / N;
  const k1 = 1.2;
  const b = 0.75;

  const idf = new Map<string, number>();
  for (const q of queryTokens) {
    const df = docIndices.filter((d) => (d.tokenCounts.get(q) ?? 0) > 0).length;
    idf.set(q, Math.log(1 + (N - df + 0.5) / (df + 0.5)));
  }

  const results: SearchResult[] = [];

  for (const doc of docIndices) {
    let score = 0;
    let primaryMatchToken: string | undefined;

    for (const q of queryTokens) {
      const tf = doc.tokenCounts.get(q) ?? 0;
      if (tf > 0) {
        if (!primaryMatchToken) primaryMatchToken = q;
        const qIdf = idf.get(q) ?? 0;
        const termScore = qIdf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (doc.dl / (avgdl || 1)))));
        score += termScore;
      }
    }

    if (score > 0) {
      let matchedField: SearchResult["matchedField"] = "body";
      if (primaryMatchToken && tokenize(doc.title).includes(primaryMatchToken)) {
        matchedField = "title";
      } else if (primaryMatchToken && tokenize(doc.description).includes(primaryMatchToken)) {
        matchedField = "description";
      } else if (primaryMatchToken && doc.tags.some((tag) => tokenize(tag).includes(primaryMatchToken!))) {
        matchedField = "tags";
      }

      let snippet = "";
      if (primaryMatchToken) {
        const regex = new RegExp(`\\b(${primaryMatchToken})\\b`, "i");
        const match = doc.content.match(regex);
        if (match && match.index !== undefined) {
          const start = Math.max(0, match.index - 75);
          const end = Math.min(doc.content.length, match.index + 125);
          const raw = doc.content.slice(start, end).replace(/\r?\n/g, " ").trim();
          snippet = `${start > 0 ? "... " : ""}${raw}${end < doc.content.length ? " ..." : ""}`;
        }
      }
      if (!snippet) {
        snippet = doc.description || doc.body.slice(0, 150).replace(/\r?\n/g, " ").trim();
      }

      results.push({
        path: doc.path,
        relPath: doc.relPath,
        title: doc.title,
        type: doc.type,
        score,
        matchedField,
        snippet,
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

