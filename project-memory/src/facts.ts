import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import {
  type DeepScanPackage,
  type DeepScanResult,
  type RepositoryScan,
  assertSafeRelativePath,
  isExcludedPath,
} from "./repository.ts";

export type FactStatus = "observed" | "approved" | "inferred" | "unknown" | "stale" | "conflict";
export type EvidenceKind = "manifest" | "configuration" | "source" | "documentation" | "operator";
export type FactKind =
  | "purpose"
  | "scope"
  | "entrypoint"
  | "command"
  | "capability"
  | "instruction"
  | "flow"
  | "boundary"
  | "unknown";

export interface EvidenceRef {
  path: string;
  locator?: string;
  sha256: string;
  kind: EvidenceKind;
}

export interface NavigationFact {
  id: string;
  kind: FactKind;
  scope: string;
  status: FactStatus;
  summary: string;
  evidence: EvidenceRef[];
  dependsOn: string[];
  owningDocument?: string;
  approvedByEvent?: string;
}

export interface VerificationCommand {
  id: string;
  scope: string;
  cwd: string;
  argv: string[];
  source: EvidenceRef;
  availability: "discovered" | "verified" | "requires-environment" | "unknown";
  verificationEvidence?: string;
}

export interface TaskRoute {
  id: string;
  intents: string[];
  scope: string;
  startPaths: string[];
  instructionPaths: string[];
  verificationCommandIds: string[];
  factIds: string[];
  confidence: "direct" | "heuristic" | "unconfirmed";
}

export type ArchitectureMode = "unconfirmed" | "ddd" | "other";

export interface EntryPointCatalog {
  schemaVersion: 1;
  generatorVersion: string;
  architectureMode: ArchitectureMode;
  projectShape: "single-package" | "workspace" | "unknown";
  facts: NavigationFact[];
  commands: VerificationCommand[];
  routes: TaskRoute[];
  inputFingerprint: string;
  renderedHashes: Record<string, string>;
}

export const CURRENT_CATALOG_SCHEMA_VERSION = 1;
export const CURRENT_GENERATOR_VERSION = "2.1.0";
export const ENTRYPOINTS_META_FILE = ".meta/entrypoints.json";

function hashText(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

async function safeFileHash(root: string, relPath: string): Promise<string> {
  try {
    const content = await readFile(resolve(root, relPath));
    return createHash("sha256").update(content).digest("hex");
  } catch {
    return "0000000000000000000000000000000000000000000000000000000000000000";
  }
}

export function validateCatalog(data: unknown): { ok: boolean; errors: string[]; catalog?: EntryPointCatalog } {
  const errors: string[] = [];
  if (!data || typeof data !== "object") {
    return { ok: false, errors: ["Catalog must be a non-null object"] };
  }
  const obj = data as Record<string, unknown>;
  if (obj.schemaVersion !== CURRENT_CATALOG_SCHEMA_VERSION) {
    errors.push(`Expected schemaVersion ${CURRENT_CATALOG_SCHEMA_VERSION}, received ${String(obj.schemaVersion)}`);
  }
  if (typeof obj.generatorVersion !== "string" || !obj.generatorVersion.trim()) {
    errors.push("Missing or invalid generatorVersion");
  }
  if (!["unconfirmed", "ddd", "other"].includes(obj.architectureMode as string)) {
    errors.push(`Invalid architectureMode: ${String(obj.architectureMode)}`);
  }
  if (!Array.isArray(obj.facts)) {
    errors.push("facts must be an array");
  }
  if (!Array.isArray(obj.commands)) {
    errors.push("commands must be an array");
  }
  if (!Array.isArray(obj.routes)) {
    errors.push("routes must be an array");
  }
  if (typeof obj.inputFingerprint !== "string") {
    errors.push("Missing or invalid inputFingerprint");
  }
  if (!obj.renderedHashes || typeof obj.renderedHashes !== "object") {
    errors.push("Missing or invalid renderedHashes");
  }

  // Validate facts and cycle-check dependsOn
  if (Array.isArray(obj.facts)) {
    const factIds = new Set<string>();
    const graph = new Map<string, string[]>();

    for (let i = 0; i < obj.facts.length; i++) {
      const fact = obj.facts[i] as NavigationFact;
      if (!fact || typeof fact !== "object") {
        errors.push(`Fact at index ${i} is not an object`);
        continue;
      }
      if (!fact.id || typeof fact.id !== "string") {
        errors.push(`Fact at index ${i} missing id`);
      } else {
        if (factIds.has(fact.id)) {
          errors.push(`Duplicate fact id: ${fact.id}`);
        }
        factIds.add(fact.id);
        graph.set(fact.id, Array.isArray(fact.dependsOn) ? fact.dependsOn : []);
      }
      if (!fact.kind || typeof fact.kind !== "string") {
        errors.push(`Fact ${fact.id ?? i} missing kind`);
      }
      if (!["observed", "approved", "inferred", "unknown", "stale", "conflict"].includes(fact.status)) {
        errors.push(`Fact ${fact.id ?? i} has invalid status: ${String(fact.status)}`);
      }
      if (!Array.isArray(fact.evidence)) {
        errors.push(`Fact ${fact.id ?? i} evidence must be an array`);
      }
    }

    // Cycle detection using DFS
    const visited = new Set<string>();
    const recStack = new Set<string>();

    function hasCycle(id: string): boolean {
      visited.add(id);
      recStack.add(id);
      const deps = graph.get(id) || [];
      for (const dep of deps) {
        if (!visited.has(dep)) {
          if (hasCycle(dep)) return true;
        } else if (recStack.has(dep)) {
          return true;
        }
      }
      recStack.delete(id);
      return false;
    }

    for (const id of graph.keys()) {
      if (!visited.has(id)) {
        if (hasCycle(id)) {
          errors.push(`Circular dependency detected involving fact: ${id}`);
          break;
        }
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, errors: [], catalog: data as EntryPointCatalog };
}

export function serializeCatalog(catalog: EntryPointCatalog): string {
  const sorted: EntryPointCatalog = {
    schemaVersion: catalog.schemaVersion,
    generatorVersion: catalog.generatorVersion,
    architectureMode: catalog.architectureMode,
    projectShape: catalog.projectShape,
    inputFingerprint: catalog.inputFingerprint,
    renderedHashes: Object.fromEntries(
      Object.entries(catalog.renderedHashes).sort(([a], [b]) => a.localeCompare(b))
    ),
    facts: [...catalog.facts].sort((a, b) => a.id.localeCompare(b.id)),
    commands: [...catalog.commands].sort((a, b) => a.id.localeCompare(b.id)),
    routes: [...catalog.routes].sort((a, b) => a.id.localeCompare(b.id)),
  };
  return JSON.stringify(sorted, null, 2) + "\n";
}

export function deduplicatePackages(packages: DeepScanPackage[]): DeepScanPackage[] {
  const seenPaths = new Set<string>();
  const result: DeepScanPackage[] = [];

  for (const pkg of packages) {
    const normPath = assertSafeRelativePath(pkg.path);
    if (isExcludedPath(normPath)) continue;
    // Don't treat documentation or example dirs as distinct monorepo workspace packages
    if (normPath.startsWith("examples/") || normPath.startsWith("docs/")) continue;
    if (seenPaths.has(normPath)) continue;
    seenPaths.add(normPath);
    result.push({
      path: normPath,
      name: pkg.name || basename(normPath),
      description: pkg.description,
    });
  }

  return result.sort((a, b) => a.path.localeCompare(b.path));
}

export function determineProjectShape(
  packages: DeepScanPackage[],
  monorepoTool?: string,
  rootHasWorkspaces?: boolean
): "single-package" | "workspace" | "unknown" {
  if (monorepoTool || (rootHasWorkspaces && packages.length > 0)) {
    return "workspace";
  }
  if (packages.length > 1) {
    return "workspace";
  }
  if (packages.length <= 1) {
    return "single-package";
  }
  return "unknown";
}

export async function buildEntryPointCatalog(
  projectRoot: string,
  scan: RepositoryScan,
  deepScan?: DeepScanResult,
  options: {
    existingCatalog?: EntryPointCatalog;
    architectureMode?: ArchitectureMode;
    approvedPurposes?: Record<string, string>;
  } = {}
): Promise<EntryPointCatalog> {
  const facts: NavigationFact[] = [];
  const commands: VerificationCommand[] = [];
  const routes: TaskRoute[] = [];

  const existingFactsById = new Map<string, NavigationFact>();
  if (options.existingCatalog?.facts) {
    for (const f of options.existingCatalog.facts) {
      existingFactsById.set(f.id, f);
    }
  }

  const filePaths = new Set(scan.files.map((f) => f.path));

  // Determine packages & workspace shape
  const rawPackages = deepScan?.architecture.packages ?? [];
  const cleanPackages = deduplicatePackages(rawPackages);

  // Check if root has workspaces
  let rootHasWorkspaces = false;
  if (filePaths.has("package.json")) {
    try {
      const raw = await readFile(resolve(projectRoot, "package.json"), "utf8");
      const parsed = JSON.parse(raw);
      if (parsed.workspaces) rootHasWorkspaces = true;
    } catch {
      // Ignore
    }
  }
  if (filePaths.has("Cargo.toml")) {
    try {
      const raw = await readFile(resolve(projectRoot, "Cargo.toml"), "utf8");
      if (/\[workspace\]/m.test(raw)) rootHasWorkspaces = true;
    } catch {
      // Ignore
    }
  }

  const shape = determineProjectShape(cleanPackages, deepScan?.techStack.monorepo, rootHasWorkspaces);

  // 1. Root purpose fact
  const rootPurposeId = "fact:purpose:root";
  const existingRootPurpose = existingFactsById.get(rootPurposeId);
  const approvedPurpose = options.approvedPurposes?.["."];

  if (approvedPurpose) {
    facts.push({
      id: rootPurposeId,
      kind: "purpose",
      scope: ".",
      status: "approved",
      summary: approvedPurpose,
      evidence: [{ path: "README.md", kind: "documentation", sha256: await safeFileHash(projectRoot, "README.md") }],
      dependsOn: [],
    });
  } else if (existingRootPurpose && existingRootPurpose.status === "approved") {
    // Retain approved status; recheck evidence
    const freshEvidence: EvidenceRef[] = [];
    let isStale = false;
    for (const ev of existingRootPurpose.evidence) {
      const currentHash = await safeFileHash(projectRoot, ev.path);
      freshEvidence.push({ ...ev, sha256: currentHash });
      if (currentHash !== ev.sha256) isStale = true;
    }
    facts.push({
      ...existingRootPurpose,
      status: isStale ? "stale" : "approved",
      evidence: freshEvidence,
    });
  } else {
    // Unconfirmed factual fallback
    const langs = deepScan?.techStack.languages ?? [];
    const mainLang = langs[0] ?? "unknown language";
    const desc = `${mainLang} project; product purpose unconfirmed`;
    facts.push({
      id: rootPurposeId,
      kind: "purpose",
      scope: ".",
      status: "unknown",
      summary: desc,
      evidence: filePaths.has("package.json")
        ? [{ path: "package.json", kind: "manifest", sha256: await safeFileHash(projectRoot, "package.json") }]
        : filePaths.has("README.md")
        ? [{ path: "README.md", kind: "documentation", sha256: await safeFileHash(projectRoot, "README.md") }]
        : [],
      dependsOn: [],
    });
  }

  // 2. Shape / Capability facts
  const shapeFactId = "fact:capability:shape";
  const shapeSummary =
    shape === "workspace"
      ? `Workspace monorepo with ${cleanPackages.length} package(s): ${cleanPackages.map((p) => p.path).join(", ")}`
      : shape === "single-package"
      ? "Single package repository"
      : "Generic repository; package structure unconfirmed";

  facts.push({
    id: shapeFactId,
    kind: "capability",
    scope: ".",
    status: "observed",
    summary: shapeSummary,
    evidence: filePaths.has("package.json")
      ? [{ path: "package.json", kind: "manifest", sha256: await safeFileHash(projectRoot, "package.json") }]
      : [],
    dependsOn: [],
  });

  // 3. Scopes & Verification Commands
  const scopesToProcess = shape === "workspace" ? cleanPackages.map((p) => p.path) : [];

  // Always check root for commands
  if (filePaths.has("package.json")) {
    try {
      const raw = await readFile(resolve(projectRoot, "package.json"), "utf8");
      const pkg = JSON.parse(raw);
      if (pkg.scripts?.test) {
        const cmdId = "cmd:root:test";
        const manifestHash = hashText(raw);
        commands.push({
          id: cmdId,
          scope: ".",
          cwd: ".",
          argv: ["npm", "test"],
          source: { path: "package.json", kind: "manifest", sha256: manifestHash },
          availability: "discovered",
        });
        facts.push({
          id: "fact:command:root:test",
          kind: "command",
          scope: ".",
          status: "observed",
          summary: `Root test script: npm test ("${pkg.scripts.test}")`,
          evidence: [{ path: "package.json", kind: "manifest", sha256: manifestHash }],
          dependsOn: [],
        });
      }
    } catch {
      // Ignore
    }
  } else if (filePaths.has("pyproject.toml")) {
    const cmdId = "cmd:root:pytest";
    const pyHash = await safeFileHash(projectRoot, "pyproject.toml");
    commands.push({
      id: cmdId,
      scope: ".",
      cwd: ".",
      argv: ["pytest"],
      source: { path: "pyproject.toml", kind: "configuration", sha256: pyHash },
      availability: "discovered",
    });
    facts.push({
      id: "fact:command:root:pytest",
      kind: "command",
      scope: ".",
      status: "observed",
      summary: "Python test runner: pytest",
      evidence: [{ path: "pyproject.toml", kind: "configuration", sha256: pyHash }],
      dependsOn: [],
    });
  } else if (filePaths.has("go.mod")) {
    const cmdId = "cmd:root:gotest";
    const goHash = await safeFileHash(projectRoot, "go.mod");
    commands.push({
      id: cmdId,
      scope: ".",
      cwd: ".",
      argv: ["go", "test", "./..."],
      source: { path: "go.mod", kind: "manifest", sha256: goHash },
      availability: "discovered",
    });
    facts.push({
      id: "fact:command:root:gotest",
      kind: "command",
      scope: ".",
      status: "observed",
      summary: "Go test runner: go test ./...",
      evidence: [{ path: "go.mod", kind: "manifest", sha256: goHash }],
      dependsOn: [],
    });
  } else if (filePaths.has("Cargo.toml")) {
    const cmdId = "cmd:root:cargotest";
    const cargoHash = await safeFileHash(projectRoot, "Cargo.toml");
    commands.push({
      id: cmdId,
      scope: ".",
      cwd: ".",
      argv: ["cargo", "test"],
      source: { path: "Cargo.toml", kind: "manifest", sha256: cargoHash },
      availability: "discovered",
    });
    facts.push({
      id: "fact:command:root:cargotest",
      kind: "command",
      scope: ".",
      status: "observed",
      summary: "Cargo test runner: cargo test",
      evidence: [{ path: "Cargo.toml", kind: "manifest", sha256: cargoHash }],
      dependsOn: [],
    });
  } else if (filePaths.has("Makefile")) {
    try {
      const makeText = await readFile(resolve(projectRoot, "Makefile"), "utf8");
      if (/^test\s*:/m.test(makeText)) {
        const cmdId = "cmd:root:make-test";
        const makeHash = hashText(makeText);
        commands.push({
          id: cmdId,
          scope: ".",
          cwd: ".",
          argv: ["make", "test"],
          source: { path: "Makefile", kind: "configuration", sha256: makeHash },
          availability: "discovered",
        });
        facts.push({
          id: "fact:command:root:make-test",
          kind: "command",
          scope: ".",
          status: "observed",
          summary: "Make test recipe: make test",
          evidence: [{ path: "Makefile", kind: "configuration", sha256: makeHash }],
          dependsOn: [],
        });
      }
    } catch {
      // Ignore
    }
  }

  // Process sub-scopes for workspace
  for (const scope of scopesToProcess) {
    const scopePkgJson = join(scope, "package.json");
    const scopeCargoToml = join(scope, "Cargo.toml");
    const scopePyproject = join(scope, "pyproject.toml");
    let scopeName = basename(scope);
    let scopeDesc: string | undefined;
    let manifestPath: string | undefined;

    if (filePaths.has(scopePkgJson)) {
      manifestPath = scopePkgJson;
      try {
        const raw = await readFile(resolve(projectRoot, scopePkgJson), "utf8");
        const parsed = JSON.parse(raw);
        if (parsed.name) scopeName = parsed.name;
        if (parsed.description) scopeDesc = parsed.description;

        if (parsed.scripts?.test) {
          const cmdId = `cmd:${scope}:test`;
          const pkgHash = hashText(raw);
          commands.push({
            id: cmdId,
            scope,
            cwd: scope,
            argv: ["npm", "test"],
            source: { path: scopePkgJson, kind: "manifest", sha256: pkgHash },
            availability: "discovered",
          });
        }
      } catch {
        // Ignore
      }
    } else if (filePaths.has(scopeCargoToml)) {
      manifestPath = scopeCargoToml;
      try {
        const raw = await readFile(resolve(projectRoot, scopeCargoToml), "utf8");
        const match = /^name\s*=\s*"([^"]+)"/m.exec(raw);
        if (match) scopeName = match[1];
        const cmdId = `cmd:${scope}:test`;
        const cargoHash = await safeFileHash(projectRoot, scopeCargoToml);
        commands.push({
          id: cmdId,
          scope,
          cwd: scope,
          argv: ["cargo", "test"],
          source: { path: scopeCargoToml, kind: "manifest", sha256: cargoHash },
          availability: "discovered",
        });
      } catch {
        // Ignore
      }
    } else if (filePaths.has(scopePyproject)) {
      manifestPath = scopePyproject;
      try {
        const raw = await readFile(resolve(projectRoot, scopePyproject), "utf8");
        const match = /^name\s*=\s*"([^"]+)"/m.exec(raw);
        if (match) scopeName = match[1];
        const cmdId = `cmd:${scope}:test`;
        const pyHash = await safeFileHash(projectRoot, scopePyproject);
        commands.push({
          id: cmdId,
          scope,
          cwd: scope,
          argv: ["pytest"],
          source: { path: scopePyproject, kind: "configuration", sha256: pyHash },
          availability: "discovered",
        });
      } catch {
        // Ignore
      }
    }

    const scopeFactId = `fact:scope:${scope}`;
    facts.push({
      id: scopeFactId,
      kind: "scope",
      scope,
      status: "observed",
      summary: scopeDesc ? `${scopeName}: ${scopeDesc}` : `${scopeName} (${scope})`,
      evidence: manifestPath
        ? [{ path: manifestPath, kind: "manifest", sha256: await safeFileHash(projectRoot, manifestPath) }]
        : [],
      dependsOn: [],
    });
  }

  // 4. Default task routes
  const rootTestCmd = commands.find((c) => c.scope === ".");
  routes.push({
    id: "route:root:general",
    intents: ["general", "overview", "setup"],
    scope: ".",
    startPaths: filePaths.has("README.md") ? ["README.md"] : [],
    instructionPaths: [".memory/conventions.md"],
    verificationCommandIds: rootTestCmd ? [rootTestCmd.id] : [],
    factIds: [rootPurposeId, shapeFactId],
    confidence: "direct",
  });

  for (const scope of scopesToProcess) {
    const scopeCmd = commands.find((c) => c.scope === scope) || rootTestCmd;
    // Find entry points inside this scope
    const scopeEntryPoints = (deepScan?.architecture.entryPoints || []).filter((e) => e.startsWith(`${scope}/`));
    const pkg = cleanPackages.find((p) => p.path === scope);
    const scopeIntents = [basename(scope), scope];
    if (pkg?.name) {
      scopeIntents.push(pkg.name);
      for (const part of pkg.name.split(/[^a-zA-Z0-9]/)) {
        if (part.length > 2) scopeIntents.push(part.toLowerCase());
      }
    }
    routes.push({
      id: `route:scope:${scope}`,
      intents: [...new Set(scopeIntents)],
      scope,
      startPaths: scopeEntryPoints.slice(0, 2),
      instructionPaths: [`.memory/${scope}/agents.md`, ".memory/conventions.md"],
      verificationCommandIds: scopeCmd ? [scopeCmd.id] : [],
      factIds: [`fact:scope:${scope}`],
      confidence: "direct",
    });
  }

  const catalog: EntryPointCatalog = {
    schemaVersion: CURRENT_CATALOG_SCHEMA_VERSION,
    generatorVersion: CURRENT_GENERATOR_VERSION,
    architectureMode: options.architectureMode ?? options.existingCatalog?.architectureMode ?? "unconfirmed",
    projectShape: shape,
    facts,
    commands,
    routes,
    inputFingerprint: scan.fingerprint,
    renderedHashes: options.existingCatalog?.renderedHashes ?? {},
  };

  return catalog;
}

export function invalidateStaleFacts(
  catalog: EntryPointCatalog,
  changedFilePaths: Set<string>
): { catalog: EntryPointCatalog; staleFactIds: string[] } {
  const staleFactIds = new Set<string>();
  const factById = new Map<string, NavigationFact>();

  for (const fact of catalog.facts) {
    factById.set(fact.id, fact);
    // Check if any evidence is directly modified
    const isDirectlyStale = fact.evidence.some((ev) => changedFilePaths.has(ev.path));
    if (isDirectlyStale) {
      staleFactIds.add(fact.id);
    }
  }

  // Propagate staleness through dependsOn
  let added = true;
  while (added) {
    added = false;
    for (const fact of catalog.facts) {
      if (!staleFactIds.has(fact.id)) {
        if (fact.dependsOn.some((depId) => staleFactIds.has(depId))) {
          staleFactIds.add(fact.id);
          added = true;
        }
      }
    }
  }

  const updatedFacts = catalog.facts.map((fact) => {
    if (staleFactIds.has(fact.id) && fact.status !== "stale") {
      return { ...fact, status: "stale" as FactStatus };
    }
    return fact;
  });

  return {
    catalog: {
      ...catalog,
      facts: updatedFacts,
    },
    staleFactIds: [...staleFactIds],
  };
}
