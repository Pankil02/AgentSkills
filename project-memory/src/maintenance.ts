import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import {
  type Diagnostic,
  type FileChange,
  bundlePath,
  parseMarkdown,
  readIfExists,
  serializeMarkdown,
  withBundleLock,
} from "./bundle.ts";
import {
  type EntryPointCatalog,
  ENTRYPOINTS_META_FILE,
  buildEntryPointCatalog,
  serializeCatalog,
  validateCatalog,
} from "./facts.ts";
import {
  AGENTS_END_MARKER,
  AGENTS_START_MARKER,
  projectEntryPoints,
  renderAgentsBlock,
  renderRootIndex,
} from "./entrypoints.ts";
import {
  type RepositoryFile,
  type RepositoryScan,
  deepScanRepository,
  scanRepository,
} from "./repository.ts";

export type MaintenanceMode = "init" | "sync" | "agents-sync";

export interface MaintenancePlan {
  mode: MaintenanceMode;
  baseInputFingerprint: string;
  documentBaseHashes: Record<string, string>;
  changedFactIds: string[];
  staleFactIds: string[];
  semanticReviewRequired: string[];
  fileChanges: FileChange[];
  catalog: EntryPointCatalog;
  renderedOutputs: Record<string, string>;
  diagnostics: Diagnostic[];
}

function sha256(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

async function captureRecoverySnapshot(projectRoot: string): Promise<Map<string, string | null>> {
  const snapshot = new Map<string, string | null>();
  const root = resolve(projectRoot);
  const memRoot = bundlePath(root);

  // 1. Root AGENTS.md
  const agentsPath = join(root, "AGENTS.md");
  const agentsContent = await readIfExists(agentsPath);
  snapshot.set(agentsPath, agentsContent ?? null);

  // 2. All files in .memory
  async function walk(dir: string) {
    let entries;
    try {
      entries = await (await import("node:fs/promises")).readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === ".lock" || entry.name.endsWith(".tmp")) continue;
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        snapshot.set(fullPath, await readFile(fullPath, "utf8"));
      }
    }
  }

  await walk(memRoot);
  return snapshot;
}

async function restoreRecoverySnapshot(snapshot: Map<string, string | null>): Promise<void> {
  for (const [filePath, content] of snapshot.entries()) {
    if (content === null) {
      try {
        await rm(filePath, { force: true });
      } catch {
        // Ignore
      }
    } else {
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, content, "utf8");
    }
  }
}

export async function readExistingCatalog(projectRoot: string): Promise<EntryPointCatalog | undefined> {
  const metaPath = join(bundlePath(projectRoot), ENTRYPOINTS_META_FILE);
  const content = await readIfExists(metaPath);
  if (!content) return undefined;
  try {
    const parsed = JSON.parse(content);
    const valid = validateCatalog(parsed);
    return valid.ok ? valid.catalog : undefined;
  } catch {
    return undefined;
  }
}

export async function planEntryPointMaintenance(
  projectRoot: string,
  mode: MaintenanceMode,
  options: { scan?: RepositoryScan; now?: Date } = {}
): Promise<MaintenancePlan> {
  const root = resolve(projectRoot);
  const scan = options.scan ?? (await scanRepository(root));
  const deepScan = await deepScanRepository(root, scan);
  const existingCatalog = await readExistingCatalog(root);

  const documentBaseHashes: Record<string, string> = {};
  const renderedOutputs: Record<string, string> = {};
  const fileChanges: FileChange[] = [];
  const diagnostics: Diagnostic[] = [];

  // Read current AGENTS.md
  const agentsPath = join(root, "AGENTS.md");
  const agentsContent = (await readIfExists(agentsPath)) ?? "";
  documentBaseHashes["AGENTS.md"] = sha256(agentsContent);

  // Read current .memory/index.md
  const indexPath = join(bundlePath(root), "index.md");
  const indexContent = (await readIfExists(indexPath)) ?? "";
  documentBaseHashes[".memory/index.md"] = sha256(indexContent);

  // Read current catalog meta
  const metaPath = join(bundlePath(root), ENTRYPOINTS_META_FILE);
  const metaContent = (await readIfExists(metaPath)) ?? "";
  documentBaseHashes[`.memory/${ENTRYPOINTS_META_FILE}`] = sha256(metaContent);

  // Build new catalog
  const catalog = await buildEntryPointCatalog(root, scan, deepScan, {
    existingCatalog,
  });

  const projectName = basename(root);
  const projection = projectEntryPoints(catalog, projectName);

  // 1. Render root AGENTS.md managed block
  const newAgentsBlock = renderAgentsBlock(projection);
  let updatedAgentsContent = agentsContent;

  if (!agentsContent.trim()) {
    // Absent or empty AGENTS.md
    updatedAgentsContent = `# ${projectName}\n\n${newAgentsBlock}\n`;
  } else {
    // Check for malformed or duplicate markers
    const startCount = (agentsContent.match(new RegExp(AGENTS_START_MARKER, "g")) || []).length;
    const endCount = (agentsContent.match(new RegExp(AGENTS_END_MARKER, "g")) || []).length;
    if (startCount !== endCount || startCount > 1) {
      diagnostics.push({
        severity: "error",
        code: "malformed-markers",
        path: "AGENTS.md",
        message: `AGENTS.md contains invalid markers (starts: ${startCount}, ends: ${endCount})`,
      });
    } else if (startCount === 1) {
      const startIndex = agentsContent.indexOf(AGENTS_START_MARKER);
      const endIndex = agentsContent.indexOf(AGENTS_END_MARKER) + AGENTS_END_MARKER.length;
      const prefix = agentsContent.slice(0, startIndex);
      const suffix = agentsContent.slice(endIndex);
      updatedAgentsContent = `${prefix}${newAgentsBlock}${suffix}`;
    } else {
      // Append managed block to existing file
      updatedAgentsContent = `${agentsContent.trimEnd()}\n\n${newAgentsBlock}\n`;
    }
  }

  renderedOutputs["AGENTS.md"] = updatedAgentsContent;
  if (sha256(updatedAgentsContent) !== documentBaseHashes["AGENTS.md"]) {
    fileChanges.push({
      path: "AGENTS.md",
      action: agentsContent ? "update" : "create",
      bytes: Buffer.byteLength(updatedAgentsContent, "utf8"),
    });
  }

function extractGeneratedRegion(content: string, name: string): string | undefined {
  const startMarker = `<!-- memory:generated:start ${name} -->`;
  const endMarker = `<!-- memory:generated:end ${name} -->`;
  const start = content.indexOf(startMarker);
  const end = content.indexOf(endMarker);
  if (start < 0 || end < 0 || start > end) return undefined;
  return content.slice(start + startMarker.length, end).trim();
}

  // 2. Render .memory/index.md
  // Preserve frontmatter and manual sections from existing index if present
  let newIndexContent = "";
  if (indexContent) {
    const parsed = parseMarkdown(indexContent);
    const existingDecisions = extractGeneratedRegion(indexContent, "decisions");
    const existingRecent = extractGeneratedRegion(indexContent, "recent");
    // Replace orientation and route sections or regenerate body
    const body = renderRootIndex(projection, undefined, {
      recentDecisionsMarkdown: existingDecisions,
      recentActivityMarkdown: existingRecent,
    });
    // Ensure frontmatter is preserved
    const frontmatterObj = {
      ...parsed.data,
      project_name: projectName,
      architecture_mode: catalog.architectureMode,
    };
    newIndexContent = serializeMarkdown(frontmatterObj, body);
  } else {
    const rawBody = renderRootIndex(projection);
    newIndexContent = serializeMarkdown(
      {
        memory_version: "0.3",
        project_name: projectName,
        architecture_mode: catalog.architectureMode,
      },
      rawBody
    );
  }

  renderedOutputs[".memory/index.md"] = newIndexContent;
  if (sha256(newIndexContent) !== documentBaseHashes[".memory/index.md"]) {
    fileChanges.push({
      path: ".memory/index.md",
      action: indexContent ? "update" : "create",
      bytes: Buffer.byteLength(newIndexContent, "utf8"),
    });
  }

  // 3. Serialize catalog to .memory/.meta/entrypoints.json
  const unmanagedStarts = updatedAgentsContent.indexOf(AGENTS_START_MARKER);
  const unmanagedEnds = updatedAgentsContent.indexOf(AGENTS_END_MARKER);
  let plannedUnmanaged = updatedAgentsContent;
  if (unmanagedStarts !== -1 && unmanagedEnds !== -1 && unmanagedEnds >= unmanagedStarts) {
    plannedUnmanaged = updatedAgentsContent.slice(0, unmanagedStarts) + updatedAgentsContent.slice(unmanagedEnds + AGENTS_END_MARKER.length);
  }
  const plannedUnmanagedTrimmed = plannedUnmanaged.trim();
  const fpParts = scan.files
    .filter((f: RepositoryFile) => f.path !== "AGENTS.md")
    .map((file: RepositoryFile) => `${file.path}:${file.size}:${Math.floor(file.mtimeMs)}`);
  if (plannedUnmanagedTrimmed.length > 0) {
    const unmanagedHash = sha256(plannedUnmanagedTrimmed);
    fpParts.push(`AGENTS.md:unmanaged:${unmanagedHash}`);
  }
  fpParts.sort();
  catalog.inputFingerprint = `sha256:${sha256(fpParts.join("\n"))}`;

  catalog.renderedHashes = {
    "AGENTS.md": sha256(updatedAgentsContent),
    ".memory/index.md": sha256(newIndexContent),
  };
  const serializedCatalog = serializeCatalog(catalog);
  renderedOutputs[`.memory/${ENTRYPOINTS_META_FILE}`] = serializedCatalog;
  if (sha256(serializedCatalog) !== documentBaseHashes[`.memory/${ENTRYPOINTS_META_FILE}`]) {
    fileChanges.push({
      path: `.memory/${ENTRYPOINTS_META_FILE}`,
      action: metaContent ? "update" : "create",
      bytes: Buffer.byteLength(serializedCatalog, "utf8"),
    });
  }

  const staleFactIds = catalog.facts.filter((f) => f.status === "stale").map((f) => f.id);
  const semanticReviewRequired = catalog.facts.filter((f) => f.status === "unknown" && f.kind === "purpose").map((f) => f.id);

  return {
    mode,
    baseInputFingerprint: scan.fingerprint,
    documentBaseHashes,
    changedFactIds: [],
    staleFactIds,
    semanticReviewRequired,
    fileChanges,
    catalog,
    renderedOutputs,
    diagnostics,
  };
}

export async function applyEntryPointMaintenance(
  projectRoot: string,
  plan: MaintenancePlan,
  options: { dryRun?: boolean } = {}
): Promise<FileChange[]> {
  const root = resolve(projectRoot);

  if (plan.diagnostics.some((d) => d.severity === "error")) {
    const errMsgs = plan.diagnostics
      .filter((d) => d.severity === "error")
      .map((d) => `${d.path ?? "entrypoints"}: ${d.message}`)
      .join("; ");
    throw new Error(`Cannot apply maintenance with errors: ${errMsgs}`);
  }

  if (options.dryRun) {
    return plan.fileChanges;
  }

  return await withBundleLock(root, async () => {
    // 1. Verify preconditions: recheck documentBaseHashes
    for (const [relPath, expectedHash] of Object.entries(plan.documentBaseHashes)) {
      const fullPath = relPath === "AGENTS.md" ? join(root, "AGENTS.md") : join(root, relPath);
      const currentContent = (await readIfExists(fullPath)) ?? "";
      const currentHash = sha256(currentContent);
      if (currentHash !== expectedHash) {
        throw new Error(`Stale maintenance plan: ${relPath} was modified on disk concurrently`);
      }
    }

    // 2. Capture recovery snapshot of .memory and AGENTS.md
    const snapshot = await captureRecoverySnapshot(root);

    try {
      const appliedChanges: FileChange[] = [];

      for (const [relPath, content] of Object.entries(plan.renderedOutputs)) {
        const fullPath = relPath === "AGENTS.md" ? join(root, "AGENTS.md") : join(root, relPath);
        const existingContent = (await readIfExists(fullPath)) ?? "";

        // If content is identical, do not touch the file (no-op)
        if (existingContent === content) {
          continue;
        }

        await mkdir(dirname(fullPath), { recursive: true });
        // Safe write via temporary file
        const tmpPath = `${fullPath}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        await writeFile(tmpPath, content, "utf8");
        await (await import("node:fs/promises")).rename(tmpPath, fullPath);

        appliedChanges.push({
          path: relPath,
          action: existingContent ? "update" : "create",
          bytes: Buffer.byteLength(content, "utf8"),
        });
      }

      return appliedChanges;
    } catch (err) {
      // Restore preimages on any failure
      await restoreRecoverySnapshot(snapshot);
      throw err;
    }
  });
}
