import { createHash, randomUUID } from "node:crypto";
import { cp, open, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
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
const MEMORY_VERSION = "0.2";
const RESERVED_FILES = new Set(["index.md", "log.md"]);

const MAX_ROOT_INDEX_BYTES = 6_000;
const WARN_ROOT_INDEX_BYTES = 4_000;
const MAX_SCOPE_INDEX_BYTES = 8_000;
export const MAX_AUTO_CONTEXT_BYTES = 6_000;
const WARN_DOCUMENT_BYTES = 16_000;
const MAX_ACTIVE_TASKS = 5;
const MAX_GENERATED_LINE_BYTES = 240;

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
const ROOT_CORE_FILES = ["index.md", "goal.md", "progress.md", "tasks.md", "log.md"] as const;
const SCOPE_CORE_FILES = ["agents.md", "log.md"] as const;
const ROOT_ONLY_FILES = new Set(["goal.md", "progress.md", "tasks.md"]);
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
    if (allowLegacyMigration && parsed.data.memory_version === "0.1") return;
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

function rootIndexTemplate(
  projectName: string,
  timestamp: string,
  head?: string,
  deepScan?: DeepScanResult,
  fingerprint?: string,
  detectedLayers: ArchitectureLayer[] = ["system-design", "domain", "security"],
): string {
  const stackParts: string[] = [];
  if (deepScan?.techStack.languages.length) stackParts.push(deepScan.techStack.languages.join(", "));
  if (deepScan?.techStack.frameworks.length) stackParts.push(deepScan.techStack.frameworks.slice(0, 3).join(", "));
  if (deepScan?.techStack.testingTools.length) stackParts.push(deepScan.techStack.testingTools.slice(0, 2).join(", "));
  const stack = stackParts.length > 0 ? stackParts.join("; ") : "Node.js, TypeScript / JavaScript";

  let shape = "CLI in `bin/`; runtime in `src/`; skills at repository root.";
  if (deepScan?.architecture.packages.length) {
    shape = `Monorepo with ${deepScan.architecture.packages.length} package(s): ${deepScan.architecture.packages.slice(0, 3).map((p) => `\`${p.path}\``).join(", ")}${deepScan.architecture.packages.length > 3 ? "..." : ""}`;
  } else if (deepScan?.architecture.entryPoints.length) {
    shape = `Entry points: ${deepScan.architecture.entryPoints.slice(0, 3).map((e) => `\`${e}\``).join(", ")}`;
  }

  const routeOrder: ArchitectureLayer[] = ["frontend", "gateway-edge", "auth", "backend", "domain", "database"];
  const activeRoute = routeOrder
    .filter((l) => detectedLayers.includes(l))
    .map((l) => titleFromPath(l))
    .join(" → ") || "Domain";

  return serializeMarkdown({
    memory_version: MEMORY_VERSION,
    architecture_mode: "ddd",
    architecture_index: "/architecture/",
    system_flow: "/architecture/system-design/Flow.md",
    project: projectName,
    summary: `${projectName} project memory root.`,
    active_scope: ".",
    active_objective: "OBJ-001",
    status: "draft",
    title: `${projectName} Project Memory`,
    description: "Executive memory capsule.",
    timestamp,
    repository_head: head ?? null,
    repository_fingerprint: fingerprint ?? null,
    last_scan_at: timestamp,
  }, `# Project Memory

## Project
- Purpose: ${projectName} project.
- Stack: ${stack}
- Shape: ${shape}
- DDD: mandatory; context: [Domain flow](/architecture/domain/Flow.md)
- Head/fingerprint: ${head ?? "none"} / ${fingerprint ?? "none"}

## Now
<!-- memory:generated:start active -->
- Objective: [OBJ-001](/goal.md) Project goal.
- Active scope: [Project](/goal.md)
- State: draft
- Next action: Complete interview.
- Blocker: none
<!-- memory:generated:end active -->

## Architecture
- Start: [System flow](/architecture/system-design/Flow.md)
- Domain: [Context map](/architecture/domain/Flow.md)
- Security: [Trust flow](/architecture/security/Flow.md)
- Route: ${activeRoute}
- Full map: [Architecture index](/architecture/)

## Find
| Need | Read |
|---|---|
| Approved intent | goal.md |
| Current work/evidence | progress.md |
| Next actions | tasks.md |
| Code/data route | architecture/.../Flow.md |
| Decisions/history | log.md |
| Provenance | sources/ |
| Full repository tree | \`memory map\` |

## Active scopes
<!-- memory:generated:start scopes -->
- [Project](/goal.md) — active
<!-- memory:generated:end scopes -->`);
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

function tasksTemplate(scope: string, timestamp: string): string {
  const title = titleFromPath(scope);
  return serializeMarkdown({
    type: "Tasks",
    title: `${title} tasks`,
    description: `Task breakdown for ${scope === "." ? "project" : scope} formatted with ADHD and project-memory principles.`,
    timestamp,
    scope,
    uid: randomUUID(),
  }, `# Tasks

## Single next action

- **Action:** Define project requirements & task list.
- **File / Command:** Edit \`.memory/tasks.md\` or run \`/memory-init\`.
- **Time estimate:** [5 min]

## Current state

Step 0 of 0 done: Pending task breakdown. Next: Define initial tasks.

## Active tasks (Do Now)

> [!NOTE]
> Maximum 5 active items. Numbered single-bounded steps only.

1. [ ] **Define project requirements** \`[15 min]\` (REQ-001) — Specify main features in \`goal.md\`
2. [ ] **Scaffold feature scopes** \`[10 min]\` (REQ-002) — Set up tracked scopes in \`.memory/\`

## Backlog (Do Later)

- [ ] **Acceptance criteria verification** \`[30 min]\` (AC-001) — Map test evidence paths

## Completed tasks summary

- **Total completed:** 0
- **Summary:** No tasks completed yet.
`);
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

function buildScopeAgentsContent(scope: string, timestamp: string, deepScan?: DeepScanResult): string {
  const title = titleFromPath(scope);
  let archSummary = "";

  if (deepScan) {
    const scopeFiles = deepScan.scan.files.filter((f) => f.path.startsWith(`${scope}/`));
    const entryPoints = deepScan.architecture.entryPoints.filter((e) => e.startsWith(`${scope}/`));
    const apiRoutes = deepScan.architecture.apiRoutes.filter((r) => r.startsWith(`${scope}/`));
    const schemas = deepScan.architecture.databaseSchemas.filter((s) => s.startsWith(`${scope}/`));

    archSummary = `Auto-scaffolded scope for \`${scope}\` (${scopeFiles.length} files).\n\n`;
    if (entryPoints.length > 0) {
      archSummary += `### Entry Points\n\n`;
      for (const ep of entryPoints) archSummary += `- \`${ep}\`\n`;
      archSummary += `\n`;
    }
    if (apiRoutes.length > 0) {
      archSummary += `### API Routes\n\n`;
      for (const route of apiRoutes) archSummary += `- \`${route}\`\n`;
      archSummary += `\n`;
    }
    if (schemas.length > 0) {
      archSummary += `### Schemas & Models\n\n`;
      for (const schema of schemas) archSummary += `- \`${schema}\`\n`;
      archSummary += `\n`;
    }
  } else {
    archSummary = `Tracked scope for \`${scope}\`.\n\n`;
  }

  const body = `# ${title} Agents\n\n> Combined instructions, architecture summary, goal requirements, progress, and tasks for \`${scope}\`.\n\n## Scope Architecture & Summary\n\n${archSummary.trimEnd()}\n\n## Goal & Requirements\n\n### Motivation\nPending interview.\n\n### User & outcome\n\n### Success measures\n\n### Scope & non-goals\n\n### Confirmed wants\n\n### Must-not rules\n\n### Requirements\n\n### Acceptance criteria\nUse stable IDs in the \`AC-NNN\` form. Each criterion must be independently verifiable.\n\n### Constraints & dependencies\n\n## Current State & Progress\n\n### Current state\nNot started.\n\n### Blockers & drift\nnone\n\n### Acceptance evidence\n| Criterion | Status | Evidence |\n|---|---|---|\n\n## Tasks & Action Items\n\n### Single next action\n- **Action:** Define scope requirements & task breakdown.\n- **File / Command:** Edit \`.memory/${scope}/agents.md\`.\n- **Time estimate:** [5 min]\n- **Requirement:** Unresolved\n- **Likely files:** \`${scope}/\`\n- **Verification:** User approval\n- **Approval:** pending\n\n### Active tasks (Do Now)\n> [!NOTE]\n> Maximum 5 active items. Numbered single-bounded steps only.\n\n1. [ ] **Define scope requirements** \`[10 min]\` (REQ-001) — Specify main features for \`${scope}\`\n2. [ ] **Verify scope boundaries** \`[10 min]\` (REQ-002) — Confirm inputs, outputs, and dependencies\n\n### Backlog (Do Later)\n- [ ] **Acceptance criteria verification** \`[20 min]\` (AC-001) — Map test evidence paths\n\n### Completed tasks summary\n- **Total completed:** 0\n- **Summary:** No tasks completed yet.\n`;

  return serializeMarkdown({
    type: "Agents",
    title: `${title} agents`,
    description: `Combined agent instructions, goal, progress, and tasks for ${scope}.`,
    timestamp,
    scope,
    status: "draft",
    provenance: deepScan ? "observed" : "unresolved",
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
    await assertNoBundleParentSymlink(join(scopeDirectory(root, scope), "agents.md"));
  }
  const unmanagedAgents = await readUnmanagedAgentsContent(root);
  const changes: FileChange[] = [];

  const initialScan = deepScan ? deepScan.scan : await scanRepository(root);
  const discovery = discoverArchitectureLayers(initialScan, deepScan);

  const rootGoalContent = deepScan
    ? buildDeepGoalContent(".", timestamp, unmanagedAgents, deepScan)
    : goalTemplate(".", timestamp, unmanagedAgents);

  const rootFiles = new Map<string, string>([
    [join(memoryRoot, "index.md"), rootIndexTemplate(options.projectName ?? basename(root), timestamp, head, deepScan, initialScan.fingerprint, discovery.detectedLayers)],
    [join(memoryRoot, "goal.md"), rootGoalContent],
    [join(memoryRoot, "progress.md"), progressTemplate(".", timestamp)],
    [join(memoryRoot, "tasks.md"), tasksTemplate(".", timestamp)],
    [join(memoryRoot, "log.md"), logTemplate(".", date)],
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
    const scopeAgentsContent = buildScopeAgentsContent(scope, timestamp, deepScan);
    const files = new Map<string, string>([
      [join(directory, "agents.md"), scopeAgentsContent],
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

  if (await readIfExists(join(memoryRoot, "goal.md")) !== undefined &&
      await readIfExists(join(memoryRoot, "progress.md")) !== undefined &&
      await readIfExists(join(memoryRoot, "log.md")) !== undefined) {
    directories.add(".");
  }

  for (const file of walk.files) {
    const directory = dirname(file);
    if (directory === memoryRoot) continue;
    if (isPathInside(join(memoryRoot, "architecture"), directory) || isPathInside(join(memoryRoot, "sources"), directory)) continue;

    const base = basename(file);
    if (base === "agents.md") {
      if (await readIfExists(join(directory, "log.md")) !== undefined) {
        directories.add(scopeFromMemoryDirectory(memoryRoot, directory));
      }
    } else if (base === "goal.md") {
      if (await readIfExists(join(directory, "progress.md")) !== undefined && await readIfExists(join(directory, "log.md")) !== undefined) {
        directories.add(scopeFromMemoryDirectory(memoryRoot, directory));
      }
    }
  }
  return [...directories].sort((a, b) => a === "." ? -1 : b === "." ? 1 : a.localeCompare(b));
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
          content = rootIndexTemplate(basename(root), nowIso(options.now), fallbackHead, undefined, scan?.fingerprint, discovery?.detectedLayers);
        } else if (isArchRoot) {
          content = architectureIndexTemplate(discovery?.detectedLayers ?? [...MANDATORY_ARCHITECTURE_LAYERS], nowIso(options.now));
        } else if (directory === join(memoryRoot, "sources")) {
          content = indexTemplate("Sources");
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
        const activeScope = typeof rootParsed.data.active_scope === "string" ? rootParsed.data.active_scope : ".";

        let nextClean = "Not set.";
        let blockerClean = "none";
        let goalStatus = typeof rootParsed.data.status === "string" ? rootParsed.data.status : "draft";
        let objectiveId = typeof rootParsed.data.active_objective === "string" ? rootParsed.data.active_objective : "OBJ-001";
        let objectiveTitle = "";

        if (activeScope === ".") {
          const progressPath = join(memoryRoot, "progress.md");
          const progress = await readIfExists(progressPath);
          const next = progress ? extractSection(progress, "Next action").trim() : "No active next action.";
          nextClean = next ? next.replace(/\n+/g, " ") : "Not set.";
          const blockers = progress ? extractSection(progress, "Blockers & drift").trim() : "";
          blockerClean = blockers && !/^(?:none|n\/a|not blocked)\.?$/i.test(blockers) ? blockers.replace(/\n+/g, " ") : "none";

          const goalPath = join(memoryRoot, "goal.md");
          const goalContent = await readIfExists(goalPath);
          const goalParsed = goalContent ? parseMarkdown(goalContent) : undefined;
          if (goalParsed?.data.status) goalStatus = String(goalParsed.data.status);

          if (goalContent) {
            const objMatch = /^##\s+([A-Z0-9_-]+)(?:\s+[—–-]\s+(.+))?$/m.exec(goalContent);
            if (objMatch) {
              objectiveId = objMatch[1];
              objectiveTitle = objMatch[2] ? ` ${objMatch[2].trim()}` : "";
            } else if (goalParsed?.data.title && typeof goalParsed.data.title === "string" && !goalParsed.data.title.toLowerCase().endsWith("goal")) {
              objectiveTitle = ` ${goalParsed.data.title}`;
            }
          }
        } else {
          const agentsPath = join(scopeDirectory(root, activeScope), "agents.md");
          const agentsContent = await readIfExists(agentsPath);
          if (agentsContent) {
            const agentsParsed = parseMarkdown(agentsContent);
            if (agentsParsed.data.status) goalStatus = String(agentsParsed.data.status);
            const next = extractSection(agentsContent, "Single next action") || extractSection(agentsContent, "Single Next Action") || extractSection(agentsContent, "Next action");
            nextClean = next ? next.replace(/\n+/g, " ") : "Not set.";
            const blockers = extractSection(agentsContent, "Blockers & drift") || extractSection(agentsContent, "Blockers & Drift");
            blockerClean = blockers && !/^(?:none|n\/a|not blocked)\.?$/i.test(blockers) ? blockers.replace(/\n+/g, " ") : "none";
            if (agentsParsed.data.title && typeof agentsParsed.data.title === "string") {
              objectiveTitle = ` ${agentsParsed.data.title}`;
            }
          }
        }
        const goalLink = activeScope === "." ? "/goal.md" : `/${activeScope}/agents.md`;
        const scopeLink = activeScope === "." ? "/goal.md" : `/${activeScope}/agents.md`;
        const scopeLabel = activeScope === "." ? "Project" : activeScope;

        const activeText = `- Objective: [${objectiveId}](${goalLink})${objectiveTitle}\n- Active scope: [${scopeLabel}](${scopeLink})\n- State: ${goalStatus}\n- Next action: ${nextClean}\n- Blocker: ${blockerClean}`;

        if (content.includes("<!-- memory:generated:start active -->")) {
          content = replaceGeneratedRegion(content, "active", activeText);
        } else if (content.includes("<!-- memory:generated:start focus -->")) {
          content = replaceGeneratedRegion(content, "focus", activeText);
        }

        const sortedScopes = [...scopes];
        const activeIdx = sortedScopes.indexOf(activeScope);
        if (activeIdx > -1) {
          sortedScopes.splice(activeIdx, 1);
          sortedScopes.unshift(activeScope);
        }
        const visibleScopes = sortedScopes.slice(0, 5);
        const remainingCount = sortedScopes.length - visibleScopes.length;

        const scopeLines: string[] = [];
        for (const trackedScope of visibleScopes) {
          const docPath = trackedScope === "."
            ? join(memoryRoot, "goal.md")
            : join(scopeDirectory(root, trackedScope), "agents.md");
          const metadata = await documentMetadata(docPath);
          const target = trackedScope === "." ? "/goal.md" : `/${trackedScope}/agents.md`;
          const label = trackedScope === "." ? "Project" : trackedScope;
          const status = metadata.status ? `(${metadata.status})` : "";
          const isActive = trackedScope === activeScope ? " — active" : "";
          const desc = metadata.description && !metadata.description.startsWith("Goal for ") && !metadata.description.startsWith("Combined agent") ? ` — ${metadata.description}` : "";
          scopeLines.push(`- [${label}](${target})${status ? ` ${status}` : ""}${isActive}${desc}`.replace(/\s+/g, " ").trim());
        }
        if (remainingCount > 0) {
          scopeLines.push(`- ... (${remainingCount} more tracked scope(s))`);
        }
        if (content.includes("<!-- memory:generated:start scopes -->")) {
          content = replaceGeneratedRegion(content, "scopes", scopeLines.join("\n") || "- No tracked scopes.");
        }

        if (content.includes("<!-- memory:generated:start treemap -->")) {
          content = replaceGeneratedRegion(content, "treemap", "");
        }

        if (content.includes("<!-- memory:generated:start documents -->")) {
          content = replaceGeneratedRegion(
            content,
            "documents",
            await generateDocumentsList(walk.files, memoryRoot, "/", "- No root documents."),
          );
        }

        if (content.includes("<!-- memory:generated:start sources -->")) {
          content = replaceGeneratedRegion(
            content,
            "sources",
            await generateDocumentsList(walk.files, join(memoryRoot, "sources"), "/sources/", "- No sources registered."),
          );
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
  const pattern = new RegExp(`^#{2,3}\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "im");
  const match = pattern.exec(content);
  if (!match) return "";
  const rest = content.slice(match.index + match[0].length).replace(/^\s+/, "");
  const next = rest.search(/^#{2,3}\s+/m);
  return (next >= 0 ? rest.slice(0, next) : rest).trim();
}

async function readScopeDocuments(directory: string, isRoot: boolean): Promise<{ goal?: string; progress?: string; agents?: string }> {
  if (isRoot) {
    const [goal, progress] = await Promise.all([
      readIfExists(join(directory, "goal.md")),
      readIfExists(join(directory, "progress.md")),
    ]);
    return { goal, progress };
  }
  const agents = await readIfExists(join(directory, "agents.md"));
  if (agents) {
    return { goal: agents, progress: agents, agents };
  }
  const [goal, progress] = await Promise.all([
    readIfExists(join(directory, "goal.md")),
    readIfExists(join(directory, "progress.md")),
  ]);
  return { goal, progress };
}

export async function checkCompletionReadiness(projectRoot: string, scope = ".", evidenceRoot = projectRoot): Promise<CompletionReadiness> {
  const root = resolve(projectRoot);
  const canonicalEvidenceRoot = await realpath(evidenceRoot);
  const safeScope = assertSafeRelativePath(scope);
  const directory = scopeDirectory(root, safeScope);

  const docs = await readScopeDocuments(directory, safeScope === ".");
  if (!docs.goal || !docs.progress) {
    return {
      ready: false,
      criteria: [],
      verified: [],
      missing: [safeScope === "." ? "Tracked scope is missing goal.md or progress.md" : "Tracked scope is missing agents.md"],
    };
  }
  const goal = docs.goal;
  const progress = docs.progress;

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

  let goalStatus: string | undefined;
  let nextAction: string | undefined;
  let blockers: string | undefined;

  const docs = await readScopeDocuments(directory, activeScope === ".");
  if (docs.agents) {
    const parsed = parseMarkdown(docs.agents);
    goalStatus = typeof parsed.data.status === "string" ? parsed.data.status : undefined;
    nextAction = extractSection(docs.agents, "Single next action") || extractSection(docs.agents, "Single Next Action") || extractSection(docs.agents, "Next action") || undefined;
    blockers = extractSection(docs.agents, "Blockers & drift") || extractSection(docs.agents, "Blockers & Drift") || extractSection(docs.agents, "Blockers and drift") || undefined;
  } else {
    goalStatus = docs.goal ? parseMarkdown(docs.goal).data.status as string : undefined;
    nextAction = docs.progress ? extractSection(docs.progress, "Next action") : undefined;
    blockers = docs.progress ? (extractSection(docs.progress, "Blockers & drift") || extractSection(docs.progress, "Blockers and drift")) : undefined;
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
    activeScope,
    goalStatus: typeof goalStatus === "string" ? goalStatus : undefined,
    nextAction,
    blockers,
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

function formatMemoryContext(indexContent: string): string {
  return `[PROJECT MEMORY]\nPersistent project truth is in .memory. Keep all .memory/ documents ultra-short, compact, concise, and token-efficient.\nRead this index first. Route through System Flow → relevant layer Flow → scope goal/progress. Apply the DDD gate before implementation.\nAsk rather than guess; semantic changes require explicit approval. Use memory_ask for clarification, memory_apply or memory CLI for validated updates. Detailed memory (goals, progress, tasks, logs, sources, architecture flows) is loaded on demand.\n\nACTIVE INDEX\n${indexContent}`;
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
      active_scope: parsed.data.active_scope ?? ".",
      active_objective: parsed.data.active_objective ?? parsed.data.status ?? "in_progress",
      index_bytes: indexBytes,
      budget,
      index: fullContent,
    };
    return JSON.stringify(toonObj, null, 2);
  }

  return formatMemoryContext(fullContent);
}

function validateGoalLikeFrontmatter(
  parsed: ParsedMarkdown,
  rel: string,
  docType: "Goal" | "Agents",
  expectedScope: string,
  diagnostics: Diagnostic[],
): void {
  const status = parsed.data.status;
  if (typeof status !== "string" || !GOAL_STATUSES.has(status)) {
    diagnostics.push({ severity: "error", code: "goal-status", path: rel, message: `Invalid goal status: ${String(status)}` });
  }
  for (const field of ["title", "description", "timestamp", "scope"]) {
    if (typeof parsed.data[field] !== "string") {
      diagnostics.push({ severity: "error", code: "managed-field", path: rel, message: `${docType} requires '${field}'` });
    }
  }
  if (parsed.data.scope !== expectedScope) {
    diagnostics.push({ severity: "error", code: "scope-mismatch", path: rel, message: `${docType} scope must be '${expectedScope}'` });
  }
}

function isMissingRequiredNextActionField(nextAction: string): boolean {
  const requiredNextActionFields = ["Action", "Requirement", "Likely files", "Verification", "Approval"];
  return requiredNextActionFields.some((field) => {
    const value = new RegExp(`\\*\\*${field}:\\*\\*\\s*([^\\n]+)`, "i").exec(nextAction)?.[1].trim();
    return !value || /^(?:unknown|unresolved|none|pending|n\/a)\.?$/i.test(value);
  });
}

function checkActiveTasksBudget(content: string, rel: string, diagnostics: Diagnostic[]): void {
  const activeSection = extractAnySection(content, "Active tasks (Do Now)") || extractAnySection(content, "Active tasks");
  if (activeSection) {
    const taskLines = activeSection.split("\n").filter((l) => /^\s*(?:\d+\.|\*|-)\s*\[[ xX ]?\]/i.test(l) || /^\s*\d+\.\s+\*\*/.test(l));
    if (taskLines.length > MAX_ACTIVE_TASKS) {
      diagnostics.push({ severity: "error", code: "budget-active-tasks", path: rel, message: `Active tasks exceeds limit of ${MAX_ACTIVE_TASKS} items (${taskLines.length} tasks found)` });
    }
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
      if (parsed.data.architecture_mode !== "ddd") diagnostics.push({ severity: "error", code: "architecture-mode", path: ".memory/index.md", message: "Root index requires architecture_mode: ddd" });
      if (typeof parsed.data.architecture_index !== "string") diagnostics.push({ severity: "error", code: "architecture-index", path: ".memory/index.md", message: "Root index requires architecture_index" });
      if (typeof parsed.data.system_flow !== "string") diagnostics.push({ severity: "error", code: "system-flow", path: ".memory/index.md", message: "Root index requires system_flow" });
      declaredActiveScope = typeof parsed.data.active_scope === "string" ? parsed.data.active_scope : undefined;
      if (!declaredActiveScope) diagnostics.push({ severity: "error", code: "active-scope", path: ".memory/index.md", message: "Root index requires active_scope" });
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

  const scopeDirectories = new Set<string>();
  let sourceCount = 0;
  for (const path of walk.files) {
    const rel = normalizeSlash(relative(root, path));
    const name = basename(path);
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
    if (isSubfolder && ROOT_ONLY_FILES.has(name)) {
      diagnostics.push({ severity: "error", code: "root-only-file", path: rel, message: `${name} is only allowed in root .memory/, not in subfolders` });
    }

    if (name === "goal.md") {
      if (byteLength > WARN_DOCUMENT_BYTES) {
        diagnostics.push({ severity: "warning", code: "budget-document-size", path: rel, message: `goal.md exceeds ${WARN_DOCUMENT_BYTES} bytes recommended limit (${byteLength} bytes)` });
      }
      if (!isSubfolder) scopeDirectories.add(dirname(path));
      validateGoalLikeFrontmatter(parsed, rel, "Goal", scopeFromMemoryDirectory(memoryRoot, dirname(path)), diagnostics);
      if (parsed.data.status === "active") {
        const progress = await readIfExists(join(dirname(path), "progress.md"));
        const headingCount = progress?.match(/^##\s+Next action\s*$/gim)?.length ?? 0;
        const nextAction = progress ? extractSection(progress, "Next action") : "";
        if (headingCount !== 1 || !nextAction || isMissingRequiredNextActionField(nextAction)) {
          diagnostics.push({ severity: "error", code: "next-action", path: rel, message: "Active goals require exactly one approved, evidence-linked Next action with Action, Requirement, Likely files, Verification, and Approval" });
        }
      }
    }

    if (name === "agents.md" && isSubfolder) {
      if (byteLength > WARN_DOCUMENT_BYTES) {
        diagnostics.push({ severity: "warning", code: "budget-document-size", path: rel, message: `agents.md exceeds ${WARN_DOCUMENT_BYTES} bytes recommended limit (${byteLength} bytes)` });
      }
      scopeDirectories.add(dirname(path));
      validateGoalLikeFrontmatter(parsed, rel, "Agents", scopeFromMemoryDirectory(memoryRoot, dirname(path)), diagnostics);
      if (parsed.data.status === "active") {
        const nextAction = extractAnySection(content, "Single next action") || extractAnySection(content, "Single Next Action") || extractAnySection(content, "Next action");
        if (!nextAction || isMissingRequiredNextActionField(nextAction)) {
          diagnostics.push({ severity: "error", code: "next-action", path: rel, message: "Active agents scope requires an approved, evidence-linked Single next action with Action, Requirement, Likely files, Verification, and Approval" });
        }
      }
      checkActiveTasksBudget(content, rel, diagnostics);
    }

    if (parsed.data.type === "Progress" || name === "progress.md") {
      if (byteLength > WARN_DOCUMENT_BYTES) {
        diagnostics.push({ severity: "warning", code: "budget-document-size", path: rel, message: `progress.md exceeds ${WARN_DOCUMENT_BYTES} bytes recommended limit (${byteLength} bytes)` });
      }
    }

    if (name === "tasks.md" || parsed.data.type === "Tasks") {
      checkActiveTasksBudget(content, rel, diagnostics);
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
      else if (!(await exists(target)) && !(await exists(join(target, "index.md"))) && !(await exists(join(target, "agents.md")))) diagnostics.push({ severity: "warning", code: "broken-link", path: rel, message: `Broken link: ${link[1]}` });
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
    if (directory === memoryRoot) {
      for (const file of ROOT_CORE_FILES) {
        if (!(await exists(join(directory, file)))) diagnostics.push({ severity: "error", code: "incomplete-scope", path: normalizeSlash(relative(root, directory)), message: `Root memory is missing ${file}` });
      }
    } else {
      for (const file of SCOPE_CORE_FILES) {
        if (!(await exists(join(directory, file)))) diagnostics.push({ severity: "error", code: "incomplete-scope", path: normalizeSlash(relative(root, directory)), message: `Tracked scope is missing ${file}` });
      }
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
Before any work in \`.memory/\`, check and read \`.memory/index.md\`, then route through System Flow (\`.memory/architecture/system-design/Flow.md\`) → relevant layer Flow → matching scope's goal and progress.
Apply the mandatory DDD gate before implementation: declare bounded context, ubiquitous language, and business invariants in domain logic.
Always keep \`index.md\`, relevant \`Flow.md\`, and \`AGENTS.md\` updated when project requirements, architecture, or scope change.
Treat user-confirmed wants, must-not rules, and acceptance criteria as requirements.
Ask instead of guessing when intent is missing, inferred, stale, or contradictory.
When a source changes, integrate it into the existing wiki instead of merely indexing it.
After meaningful work, record evidence, update progress and one next action, and append \`log.md\` using concise entries.
Use \`memory_apply\` when available, otherwise the \`memory\` CLI, for generated regions; do not rewrite history.
${AGENTS_END}`;

export interface MigrateResult {
  root: string;
  version: "0.2";
  changes: FileChange[];
  validation: ValidationResult;
}

const extractAnySection = extractSection;

function migrateLegacyScopeToAgents(
  scope: string,
  timestamp: string,
  goalContent?: string,
  progressContent?: string,
  tasksContent?: string,
  existingAgents?: string,
): string {
  if (existingAgents) return existingAgents;

  const title = titleFromPath(scope);
  const goalParsed = goalContent ? parseMarkdown(goalContent) : undefined;

  const status = typeof goalParsed?.data.status === "string" ? goalParsed.data.status : "draft";
  const provenance = typeof goalParsed?.data.provenance === "string" ? goalParsed.data.provenance : "observed";

  const motivation = goalContent ? (extractAnySection(goalContent, "Motivation") || "") : "";
  const reqs = goalContent ? (extractAnySection(goalContent, "Requirements") || "") : "";
  const ac = goalContent ? (extractAnySection(goalContent, "Acceptance criteria") || "") : "";
  const nonGoals = goalContent ? (extractAnySection(goalContent, "Scope & non-goals") || extractAnySection(goalContent, "Scope and non-goals") || "") : "";
  const constraints = goalContent ? (extractAnySection(goalContent, "Constraints & dependencies") || extractAnySection(goalContent, "Constraints and dependencies") || "") : "";
  const archSummary = goalContent ? (extractAnySection(goalContent, "Scope Architecture") || extractAnySection(goalContent, "Auto-Detected Architecture") || "") : "";

  const currentState = progressContent ? (extractAnySection(progressContent, "Current state") || "") : "";
  const blockers = progressContent ? (extractAnySection(progressContent, "Blockers & drift") || extractAnySection(progressContent, "Blockers and drift") || "") : "";
  const evidence = progressContent ? (extractAnySection(progressContent, "Acceptance evidence") || "") : "";

  const nextAction = (progressContent ? extractAnySection(progressContent, "Next action") : "") || (tasksContent ? extractAnySection(tasksContent, "Single next action") : "");
  const activeTasks = tasksContent ? (extractAnySection(tasksContent, "Active tasks (Do Now)") || extractAnySection(tasksContent, "Active tasks") || "") : "";
  const backlog = tasksContent ? (extractAnySection(tasksContent, "Backlog (Do Later)") || extractAnySection(tasksContent, "Backlog") || "") : "";
  const completedTasks = tasksContent ? (extractAnySection(tasksContent, "Completed tasks summary") || extractAnySection(tasksContent, "Completed tasks") || "") : "";

  let body = `# ${title} Agents\n\n> Combined instructions, architecture summary, goal requirements, progress, and tasks for \`${scope}\`.\n\n`;

  body += `## Scope Architecture & Summary\n\n${archSummary || `Auto-migrated scope for \`${scope}\`.`}\n\n`;

  body += `## Goal & Requirements\n\n`;
  if (motivation) body += `### Motivation\n\n${motivation}\n\n`;
  if (nonGoals) body += `### Scope & non-goals\n\n${nonGoals}\n\n`;
  if (reqs) body += `### Requirements\n\n${reqs}\n\n`;
  body += `### Acceptance criteria\n\n${ac || "Use stable IDs in the `AC-NNN` form. Each criterion must be independently verifiable."}\n\n`;
  if (constraints) body += `### Constraints & dependencies\n\n${constraints}\n\n`;

  body += `## Current State & Progress\n\n`;
  body += `### Current state\n\n${currentState || "Active development."}\n\n`;
  body += `### Blockers & drift\n\n${blockers || "none"}\n\n`;
  body += `### Acceptance evidence\n\n${evidence || "| Criterion | Status | Evidence |\n|---|---|---|"}\n\n`;

  body += `## Tasks & Action Items\n\n`;
  if (nextAction) {
    body += `### Single next action\n\n${nextAction.includes("- **Action:**") ? nextAction : `- **Action:** ${nextAction}\n- **File / Command:** Edit \`.memory/${scope}/agents.md\`\n- **Time estimate:** [15 min]\n- **Requirement:** Migrated\n- **Likely files:** \`${scope}/\`\n- **Verification:** User review\n- **Approval:** approved`}\n\n`;
  } else {
    body += `### Single next action\n\n- **Action:** Continue scope execution.\n- **File / Command:** Edit \`.memory/${scope}/agents.md\`\n- **Time estimate:** [15 min]\n- **Requirement:** Migrated\n- **Likely files:** \`${scope}/\`\n- **Verification:** User review\n- **Approval:** approved\n\n`;
  }

  if (activeTasks) {
    body += `### Active tasks (Do Now)\n> [!NOTE]\n> Maximum 5 active items. Numbered single-bounded steps only.\n\n${activeTasks}\n\n`;
  } else {
    body += `### Active tasks (Do Now)\n> [!NOTE]\n> Maximum 5 active items. Numbered single-bounded steps only.\n\n1. [ ] **Scope review** \`[15 min]\` (REQ-001) — Review migrated scope items\n\n`;
  }

  if (backlog) body += `### Backlog (Do Later)\n\n${backlog}\n\n`;
  if (completedTasks) body += `### Completed tasks summary\n\n${completedTasks}\n`;

  return serializeMarkdown({
    type: "Agents",
    title: `${title} agents`,
    description: `Combined agent instructions, goal, progress, and tasks for ${scope}.`,
    timestamp,
    scope,
    status,
    provenance,
    uid: randomUUID(),
  }, body);
}

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

  const walk = await walkMemory(memoryRoot);
  const legacySubfolderFiles = walk.files.filter((file) => {
    const dir = dirname(file);
    if (dir === memoryRoot || isPathInside(join(memoryRoot, "architecture"), dir) || isPathInside(join(memoryRoot, "sources"), dir)) return false;
    const base = basename(file);
    return ROOT_ONLY_FILES.has(base) || base === "index.md";
  });

  const is02 = initialParsed.data.memory_version === "0.2";
  if (is02 && legacySubfolderFiles.length === 0) {
    const val = await validateBundle(root);
    return { root, version: "0.2", changes: [], validation: val };
  }

  // Snapshot bundle for atomic rollback
  const snapshot = dryRun ? undefined : await captureBundle(root);
  const changes: FileChange[] = [];

  try {
    const scan = await scanRepository(root);
    const deepScan = await deepScanRepository(root, scan);
    const discovery = discoverArchitectureLayers(scan, deepScan);

    // 1. Create architecture index if missing
    const archDir = join(memoryRoot, "architecture");
    const archIndexPath = join(archDir, "index.md");
    if (await readIfExists(archIndexPath) === undefined) {
      const archIndexContent = architectureIndexTemplate(discovery.detectedLayers, timestamp);
      const change = await plannedWrite(archIndexPath, archIndexContent, dryRun, false);
      changes.push({ ...change, path: relativeChangePath(root, archIndexPath) });
    }

    // 2. Create layer flows if missing
    for (const layer of discovery.detectedLayers) {
      const flowPath = join(archDir, layer, "Flow.md");
      if (await readIfExists(flowPath) === undefined) {
        const evidence = discovery.layers.get(layer);
        const content = flowTemplate(layer, evidence, scan.fingerprint, timestamp);
        const change = await plannedWrite(flowPath, content, dryRun, false);
        changes.push({ ...change, path: relativeChangePath(root, flowPath) });
      }
    }

    // 3. Detect and migrate legacy subfolder files (goal.md, progress.md, tasks.md, index.md)
    const subfolderDirs = new Set<string>();
    for (const file of walk.files) {
      const dir = dirname(file);
      if (dir === memoryRoot || isPathInside(join(memoryRoot, "architecture"), dir) || isPathInside(join(memoryRoot, "sources"), dir)) continue;
      subfolderDirs.add(dir);
    }

    for (const subDir of subfolderDirs) {
      const scope = scopeFromMemoryDirectory(memoryRoot, subDir);
      const legacyGoal = join(subDir, "goal.md");
      const legacyProgress = join(subDir, "progress.md");
      const legacyTasks = join(subDir, "tasks.md");
      const legacyIndex = join(subDir, "index.md");
      const agentsPath = join(subDir, "agents.md");
      const logPath = join(subDir, "log.md");

      const [goalContent, progressContent, tasksContent, existingAgents, existingLog] = await Promise.all([
        readIfExists(legacyGoal),
        readIfExists(legacyProgress),
        readIfExists(legacyTasks),
        readIfExists(agentsPath),
        readIfExists(logPath),
      ]);

      const hasLegacy = goalContent !== undefined || progressContent !== undefined || tasksContent !== undefined || (await readIfExists(legacyIndex)) !== undefined;

      if (hasLegacy || (existingAgents === undefined && existingLog !== undefined)) {
        const agentsContent = migrateLegacyScopeToAgents(
          scope,
          timestamp,
          goalContent,
          progressContent,
          tasksContent,
          existingAgents,
        );
        const agentsChange = await plannedWrite(agentsPath, agentsContent, dryRun, Boolean(existingAgents));
        changes.push({ ...agentsChange, path: relativeChangePath(root, agentsPath) });

        let logContent = existingLog ?? logTemplate(scope, date);
        logContent = prependLogEntry(
          logContent,
          today(date),
          `### Migration: Scope Restructure\n- **Update:** Migrated legacy subfolder files (goal.md, progress.md, tasks.md) into unified \`agents.md\`.\n- **Evidence:** Automated \`memory migrate\` data shift.\n`,
        );
        const logChange = await plannedWrite(logPath, logContent, dryRun, Boolean(existingLog));
        changes.push({ ...logChange, path: relativeChangePath(root, logPath) });

        for (const legacyFile of [legacyGoal, legacyProgress, legacyTasks, legacyIndex]) {
          if (await readIfExists(legacyFile) !== undefined) {
            if (!dryRun) await rm(legacyFile, { force: true });
            changes.push({ path: relativeChangePath(root, legacyFile), action: "update" });
          }
        }
      }

      // Remove redundant intermediate directory index.md
      for (const prefix of allDirectoryPrefixes(scope)) {
        if (prefix === scope) continue;
        const prefixIndex = join(safeBundleFile(root, prefix), "index.md");
        if (await readIfExists(prefixIndex) !== undefined) {
          if (!dryRun) await rm(prefixIndex, { force: true });
          changes.push({ path: relativeChangePath(root, prefixIndex), action: "update" });
        }
      }
    }

    // 4. Update root index.md frontmatter and body
    let updatedRootIndex = rootIndexContent;
    updatedRootIndex = updateMarkdownFrontmatter(updatedRootIndex, {
      memory_version: "0.2",
      architecture_mode: "ddd",
      architecture_index: "/architecture/",
      system_flow: "/architecture/system-design/Flow.md",
      repository_head: scan.head ?? null,
      repository_fingerprint: scan.fingerprint,
      last_scan_at: timestamp,
      timestamp,
    });

    const routeOrder: ArchitectureLayer[] = ["frontend", "gateway-edge", "auth", "backend", "domain", "database"];
    const activeRoute = routeOrder
      .filter((l) => discovery.detectedLayers.includes(l))
      .map((l) => titleFromPath(l))
      .join(" → ") || "Domain";

    if (!updatedRootIndex.includes("## Architecture")) {
      const archSection = `\n## Architecture\n- Start: [System flow](/architecture/system-design/Flow.md)\n- Domain: [Context map](/architecture/domain/Flow.md)\n- Security: [Trust flow](/architecture/security/Flow.md)\n- Route: ${activeRoute}\n- Full map: [Architecture index](/architecture/)\n`;
      if (updatedRootIndex.includes("## Find")) {
        updatedRootIndex = updatedRootIndex.replace("## Find", `${archSection}\n## Find`);
      } else if (updatedRootIndex.includes("## Map")) {
        updatedRootIndex = updatedRootIndex.replace("## Map", `${archSection}\n## Find\n| Need | Read |\n|---|---|\n| Approved intent | goal.md |\n| Current work/evidence | progress.md |\n| Next actions | tasks.md |\n| Code/data route | architecture/.../Flow.md |\n| Decisions/history | log.md |\n| Provenance | sources/ |\n| Full repository tree | \`memory map\` |\n`);
      } else if (updatedRootIndex.includes("## Scopes")) {
        updatedRootIndex = updatedRootIndex.replace("## Scopes", `${archSection}\n## Scopes`);
      } else {
        updatedRootIndex += archSection;
      }
    }

    const rootChange = await plannedWrite(rootIndexPath, updatedRootIndex, dryRun, true);
    changes.push({ ...rootChange, path: relativeChangePath(root, rootIndexPath) });

    // 5. Run syncIndexes
    const syncChanges = await syncIndexes(root, scan, { dryRun, now: date });
    changes.push(...syncChanges);

    // 6. Sync AGENTS.md
    const agentsChange = await syncAgentsFile(root, { dryRun });
    changes.push(agentsChange);

    // 7. Validate bundle
    const validation = dryRun
      ? { ok: true, diagnostics: [], counts: { documents: 0, scopes: 0, sources: 0, errors: 0, warnings: 0 } }
      : await validateBundle(root);

    if (!validation.ok) {
      throw new Error(`Migration produced invalid bundle: ${validation.diagnostics.filter((d) => d.severity === "error").map((d) => `${d.path ?? "bundle"}: ${d.message}`).join("; ")}`);
    }

    return {
      root,
      version: "0.2",
      changes,
      validation,
    };
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

export function operationRequiresApproval(operation: MemoryOperation): boolean {
  if (operation.semantic || (operation.path ? (basename(operation.path) === "goal.md" || basename(operation.path) === "agents.md") : false)) return true;
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

async function validateGoalStatusTransition(
  projectRoot: string,
  target: string,
  previousStatus: unknown,
  nextStatus: unknown,
  evidenceRoot?: string,
): Promise<void> {
  if (typeof previousStatus === "string" && typeof nextStatus === "string") {
    if (previousStatus !== nextStatus && !GOAL_TRANSITIONS[previousStatus]?.has(nextStatus)) {
      throw new Error(`Invalid goal lifecycle transition: ${previousStatus} -> ${nextStatus}`);
    }
    if (nextStatus === "complete" && previousStatus !== "complete") {
      const scope = scopeFromMemoryDirectory(bundlePath(projectRoot), dirname(target));
      const readiness = await checkCompletionReadiness(projectRoot, scope, evidenceRoot);
      if (!readiness.ready) throw new Error(`Completion evidence is incomplete: ${readiness.missing.join("; ")}`);
    }
  }
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

      const isGoalDoc = basename(target) === "goal.md" || basename(target) === "agents.md";
      if (isGoalDoc && parsed.data.status === "complete") throw new Error("Complete goals with update_frontmatter so approved criteria cannot be replaced");
      if (isGoalDoc && existing && typeof parsed.data.status === "string") {
        await validateGoalStatusTransition(projectRoot, target, parseMarkdown(existing).data.status, parsed.data.status, options.evidenceRoot);
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
      const isGoalDoc = basename(target) === "goal.md" || basename(target) === "agents.md";
      if (isGoalDoc && typeof operation.values.status === "string") {
        await validateGoalStatusTransition(projectRoot, target, existingParsed.data.status, operation.values.status, options.evidenceRoot);
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

