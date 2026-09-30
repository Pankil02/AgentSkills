import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  type FileChange,
  exists,
  readIfExists,
  withBundleLock,
} from "./bundle.ts";
import {
  AGENTS_END_MARKER,
  AGENTS_START_MARKER,
} from "./entrypoints.ts";
import { type EntryPointCatalog } from "./facts.ts";

export interface AgentsAuditFinding {
  severity: "error" | "warning" | "advisory";
  code: string;
  message: string;
  location?: { line: number; column: number };
  quote?: string;
  confidence: "high" | "medium" | "low";
}

export interface AgentsAuditReport {
  target: "AGENTS.md";
  filePresent: boolean;
  byteLength: number;
  hasMarkers: boolean;
  findings: AgentsAuditFinding[];
  recommendedEdits: AgentsReviewEdit[];
}

export interface AgentsReviewEdit {
  startByte: number;
  endByte: number;
  expectedText: string;
  replacementText: string;
  reason: string;
  evidenceFactIds: string[];
}

export interface AgentsReviewPlan {
  schemaVersion: 1;
  target: "AGENTS.md";
  baseSha256: string;
  edits: AgentsReviewEdit[];
}

function sha256(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

export async function auditAgentsInstructions(
  projectRoot: string,
  _catalog?: EntryPointCatalog
): Promise<AgentsAuditReport> {
  const root = resolve(projectRoot);
  const agentsPath = join(root, "AGENTS.md");
  const content = await readIfExists(agentsPath);

  if (content === undefined) {
    return {
      target: "AGENTS.md",
      filePresent: false,
      byteLength: 0,
      hasMarkers: false,
      findings: [
        {
          severity: "warning",
          code: "missing-agents-file",
          message: "AGENTS.md is absent; run `memory sync` or `memory init` to generate",
          confidence: "high",
        },
      ],
      recommendedEdits: [],
    };
  }

  const findings: AgentsAuditFinding[] = [];
  const recommendedEdits: AgentsReviewEdit[] = [];
  const byteLength = Buffer.byteLength(content, "utf8");

  // 1. Marker validation
  const startMatches = content.match(new RegExp(AGENTS_START_MARKER, "g")) || [];
  const endMatches = content.match(new RegExp(AGENTS_END_MARKER, "g")) || [];

  if (startMatches.length === 0 && endMatches.length === 0) {
    findings.push({
      severity: "warning",
      code: "missing-markers",
      message: "AGENTS.md exists but has no memory managed markers (<!-- memory:start -->)",
      confidence: "high",
    });
  } else if (startMatches.length !== 1 || endMatches.length !== 1) {
    findings.push({
      severity: "error",
      code: "malformed-markers",
      message: `AGENTS.md has malformed or duplicate markers: ${startMatches.length} start(s), ${endMatches.length} end(s)`,
      confidence: "high",
    });
  } else if (content.indexOf(AGENTS_START_MARKER) > content.indexOf(AGENTS_END_MARKER)) {
    findings.push({
      severity: "error",
      code: "reversed-markers",
      message: "AGENTS.md has reversed markers: memory:end appears before memory:start",
      confidence: "high",
    });
  }

  // 2. Check for broken local links in human sections
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(content)) !== null) {
    const rawTarget = match[2].trim();
    // Only check local filesystem paths, not URLs or anchors
    if (!rawTarget.startsWith("http://") && !rawTarget.startsWith("https://") && !rawTarget.startsWith("#") && !rawTarget.startsWith("mailto:")) {
      const cleanPath = rawTarget.split("#")[0].split("?")[0];
      if (cleanPath) {
        const fullTarget = resolve(root, cleanPath);
        const fileExists = await exists(fullTarget);
        if (!fileExists) {
          findings.push({
            severity: "warning",
            code: "broken-local-link",
            message: `Referenced local file does not exist: '${cleanPath}'`,
            quote: match[0],
            confidence: "high",
          });
        }
      }
    }
  }

  // 3. Human section size advice
  if (byteLength > 10_000) {
    findings.push({
      severity: "advisory",
      code: "large-instructions",
      message: `AGENTS.md is ${byteLength} bytes; consider trimming redundant rules to keep agent startup compact`,
      confidence: "medium",
    });
  }

  return {
    target: "AGENTS.md",
    filePresent: true,
    byteLength,
    hasMarkers: startMatches.length === 1 && endMatches.length === 1,
    findings,
    recommendedEdits,
  };
}

export async function applyAgentsReviewPlan(
  projectRoot: string,
  plan: AgentsReviewPlan,
  options: { approval: string; dryRun?: boolean }
): Promise<FileChange> {
  if (plan.target !== "AGENTS.md") {
    throw new Error(`Invalid plan target: ${String(plan.target)}`);
  }
  if (!options.approval || !options.approval.trim()) {
    throw new Error("Explicit user approval is required to apply review edits to human instructions");
  }

  const root = resolve(projectRoot);
  const agentsPath = join(root, "AGENTS.md");

  return await withBundleLock(root, async () => {
    const content = (await readIfExists(agentsPath)) ?? "";
    const currentSha = sha256(content);

    if (currentSha !== plan.baseSha256) {
      throw new Error(`Stale review plan: AGENTS.md has changed on disk (expected ${plan.baseSha256}, got ${currentSha})`);
    }

    const contentBuffer = Buffer.from(content, "utf8");

    // Validate edits: sorted, non-overlapping, expected text matches
    const sortedEdits = [...plan.edits].sort((a, b) => a.startByte - b.startByte);

    let lastEnd = 0;
    const startMarkerPos = content.indexOf(AGENTS_START_MARKER);
    const endMarkerPos = content.indexOf(AGENTS_END_MARKER);
    const managedRangeStart = startMarkerPos !== -1 ? Buffer.byteLength(content.slice(0, startMarkerPos), "utf8") : -1;
    const managedRangeEnd = endMarkerPos !== -1 ? Buffer.byteLength(content.slice(0, endMarkerPos + AGENTS_END_MARKER.length), "utf8") : -1;

    for (const edit of sortedEdits) {
      if (edit.startByte < lastEnd) {
        throw new Error(`Overlapping edit range: [${edit.startByte}, ${edit.endByte}] overlaps previous end ${lastEnd}`);
      }
      if (edit.endByte > contentBuffer.length) {
        throw new Error(`Edit range out of bounds: endByte ${edit.endByte} exceeds file length ${contentBuffer.length}`);
      }

      // Check expectedText matches buffer slice
      const actualSlice = contentBuffer.subarray(edit.startByte, edit.endByte).toString("utf8");
      if (actualSlice !== edit.expectedText) {
        throw new Error(`Expected text mismatch at [${edit.startByte}, ${edit.endByte}]: expected '${edit.expectedText}', found '${actualSlice}'`);
      }

      // Prohibit editing within the generated managed block
      if (managedRangeStart !== -1 && managedRangeEnd !== -1) {
        if (
          (edit.startByte >= managedRangeStart && edit.startByte < managedRangeEnd) ||
          (edit.endByte > managedRangeStart && edit.endByte <= managedRangeEnd)
        ) {
          throw new Error("Review plan cannot modify the managed memory block; use memory sync instead");
        }
      }

      lastEnd = edit.endByte;
    }

    // Apply edits backwards to preserve byte offsets
    let newBuffer = contentBuffer;
    const reverseEdits = [...sortedEdits].sort((a, b) => b.startByte - a.startByte);

    for (const edit of reverseEdits) {
      const before = newBuffer.subarray(0, edit.startByte);
      const after = newBuffer.subarray(edit.endByte);
      const replacementBuffer = Buffer.from(edit.replacementText, "utf8");
      newBuffer = Buffer.concat([before, replacementBuffer, after]);
    }

    const updatedText = newBuffer.toString("utf8");

    if (options.dryRun) {
      return {
        path: "AGENTS.md",
        action: "update",
        bytes: Buffer.byteLength(updatedText, "utf8"),
      };
    }

    await writeFile(agentsPath, updatedText, "utf8");

    return {
      path: "AGENTS.md",
      action: "update",
      bytes: Buffer.byteLength(updatedText, "utf8"),
    };
  });
}
