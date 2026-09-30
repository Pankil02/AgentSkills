import {
  type EntryPointCatalog,
  type NavigationFact,
  type TaskRoute,
  type VerificationCommand,
} from "./facts.ts";

export const DEFAULT_INDEX_BUDGET_BYTES = 6000;
export const TARGET_INDEX_BUDGET_BYTES = 4000;
export const DEFAULT_AGENTS_BLOCK_BUDGET_BYTES = 6000;
export const TARGET_AGENTS_BLOCK_BUDGET_BYTES = 4000;

export const AGENTS_START_MARKER = "<!-- memory:start -->";
export const AGENTS_END_MARKER = "<!-- memory:end -->";

export interface EntryPointProjection {
  projectName: string;
  architectureMode: string;
  projectShape: "single-package" | "workspace" | "unknown";
  orientation: string[];
  freshnessWarnings: string[];
  topScopes: NavigationFact[];
  taskRoutes: TaskRoute[];
  commands: VerificationCommand[];
  applicableMemoryRoutes: { label: string; target: string; need: string }[];
}

export function projectEntryPoints(
  catalog: EntryPointCatalog,
  projectName = "project"
): EntryPointProjection {
  const orientation: string[] = [];
  const freshnessWarnings: string[] = [];

  const purposeFact = catalog.facts.find((f) => f.kind === "purpose" && f.scope === ".");
  if (purposeFact) {
    orientation.push(purposeFact.summary);
    if (purposeFact.status === "stale") {
      freshnessWarnings.push("Project purpose evidence changed; review with `memory sync`");
    }
  }

  const shapeFact = catalog.facts.find((f) => f.kind === "capability" && f.id === "fact:capability:shape");
  if (shapeFact) {
    orientation.push(shapeFact.summary);
  }

  const staleCount = catalog.facts.filter((f) => f.status === "stale").length;
  if (staleCount > 0) {
    freshnessWarnings.push(`${staleCount} fact(s) have stale evidence; run \`memory sync\` to refresh`);
  }

  const topScopes = catalog.facts.filter((f) => f.kind === "scope");

  const applicableMemoryRoutes: { label: string; target: string; need: string }[] = [
    { need: "Choose scope and starting point", label: '`memory route --task "<intent>"`', target: "" },
    { need: "Rules before editing", label: "`memory check --for-path <path>`", target: "" },
    { need: "Commands and verification", label: "[Conventions](./conventions.md)", target: "./conventions.md" },
    { need: "Why / accepted choices", label: "[Decisions](./decisions/index.md) · `memory decisions`", target: "./decisions/index.md" },
    { need: "Structure", label: "`memory map`", target: "" },
    { need: "Recent changes", label: "`memory log --recent 10`", target: "" },
    { need: "Search / uncertainty", label: "`memory search <keywords>`", target: "" },
    { need: "External source records", label: "[Sources](./sources/index.md)", target: "./sources/index.md" },
  ];

  if (catalog.architectureMode === "ddd") {
    applicableMemoryRoutes.push({
      need: "Domain invariants",
      label: "[Domain Flow](./architecture/domain/Flow.md)",
      target: "./architecture/domain/Flow.md",
    });
  }

  return {
    projectName,
    architectureMode: catalog.architectureMode,
    projectShape: catalog.projectShape,
    orientation,
    freshnessWarnings,
    topScopes,
    taskRoutes: catalog.routes,
    commands: catalog.commands,
    applicableMemoryRoutes,
  };
}

export function renderAgentsBlock(
  projection: EntryPointProjection,
  budgetBytes: number = DEFAULT_AGENTS_BLOCK_BUDGET_BYTES
): string {
  const mandatoryRules = [
    "- Before editing a file: `memory check --for-path <file>`. If governance is `hold`, stop and ask.",
    "- Before proposing a design: `memory decisions`; never contradict an accepted decision without asking.",
    "- Changing decisions, conventions, scope rules, or architecture: offer 2-3 options, mark one (Recommended), wait for explicit approval.",
    "- After meaningful work: `memory log --add` one concise entry. Never rewrite history.",
    "- Write memory only through `memory_apply` or the `memory` CLI.",
  ];

  const orientationLines = projection.orientation.map((line) => `- ${line}`);
  if (projection.freshnessWarnings.length > 0) {
    orientationLines.push(`- Freshness: ${projection.freshnessWarnings.join("; ")}`);
  } else {
    orientationLines.push("- Freshness: current (verified by scan)");
  }

  // Base mandatory content
  let body = [
    "Project memory lives in `.memory/`. `.memory/index.md` is the router; open only the one file or command it points to for the current need.",
    "",
    "### Orientation",
    ...orientationLines,
    "",
    "### Workflow & Governance",
    ...mandatoryRules,
  ];

  // Optional: Task routing section
  const optionalTaskLines: string[] = [];
  if (projection.taskRoutes.length > 0) {
    optionalTaskLines.push("", "### Task Routing");
    for (const route of projection.taskRoutes.slice(0, 3)) {
      const startPath = route.startPaths[0] ? `\`${route.startPaths[0]}\`` : `\`${route.scope}\``;
      const verifyCmd = projection.commands.find((c) => route.verificationCommandIds.includes(c.id));
      const verifyStr = verifyCmd ? `verify: \`${verifyCmd.argv.join(" ")}\`` : "no verified command recorded";
      optionalTaskLines.push(`- ${route.intents.join("/")} -> ${startPath} (${verifyStr})`);
    }
  }

  // Optional: Scopes section
  const optionalScopeLines: string[] = [];
  if (projection.topScopes.length > 0) {
    optionalScopeLines.push("", "### Scopes");
    const visibleScopes = projection.topScopes.slice(0, 5);
    for (const scope of visibleScopes) {
      optionalScopeLines.push(`- \`${scope.scope}\` — ${scope.summary}`);
    }
    if (projection.topScopes.length > 5) {
      optionalScopeLines.push(`- … and ${projection.topScopes.length - 5} more: run \`memory route --for-path <path>\``);
    }
  }

  // Assemble full candidate and test budget
  let fullCandidate = [AGENTS_START_MARKER, ...body, ...optionalTaskLines, ...optionalScopeLines, AGENTS_END_MARKER].join("\n");
  if (Buffer.byteLength(fullCandidate, "utf8") <= budgetBytes) {
    return fullCandidate;
  }

  // If over budget, drop scopes first
  fullCandidate = [AGENTS_START_MARKER, ...body, ...optionalTaskLines, AGENTS_END_MARKER].join("\n");
  if (Buffer.byteLength(fullCandidate, "utf8") <= budgetBytes) {
    return fullCandidate;
  }

  // If still over budget, drop task lines
  fullCandidate = [AGENTS_START_MARKER, ...body, AGENTS_END_MARKER].join("\n");
  if (Buffer.byteLength(fullCandidate, "utf8") <= budgetBytes) {
    return fullCandidate;
  }

  // Mandatory rules must NEVER be truncated
  return [AGENTS_START_MARKER, ...body.slice(0, 7), ...mandatoryRules, AGENTS_END_MARKER].join("\n");
}

export function renderRootIndex(
  projection: EntryPointProjection,
  budgetBytes: number = DEFAULT_INDEX_BUDGET_BYTES,
  extraOptions: {
    frontmatterExtra?: Record<string, unknown>;
    recentDecisionsMarkdown?: string;
    recentActivityMarkdown?: string;
  } = {}
): string {
  const orientationLines = projection.orientation.map((o) => `- ${o}`);
  if (projection.freshnessWarnings.length > 0) {
    orientationLines.push(`- Freshness: ${projection.freshnessWarnings.join("; ")}`);
  } else {
    orientationLines.push("- Freshness: current (verified by scan)");
  }

  const routeTableLines = [
    "| Need | Open / run |",
    "|---|---|",
    ...projection.applicableMemoryRoutes.map((r) => `| ${r.need} | ${r.label} |`),
  ];

  const mandatoryBody = [
    `# ${projection.projectName} memory`,
    "",
    "> Links are relative to this file. Read only the route needed for the task.",
    "",
    "## Orientation",
    ...orientationLines,
    "",
    "## Route",
    ...routeTableLines,
  ];

  // Optional: Scopes
  const optionalScopeLines: string[] = [];
  if (projection.topScopes.length > 0) {
    optionalScopeLines.push("", "## Scopes");
    const visibleScopes = projection.topScopes.slice(0, 5);
    for (const scope of visibleScopes) {
      optionalScopeLines.push(`- [${scope.scope}](./${scope.scope}/agents.md) — ${scope.summary}`);
    }
    if (projection.topScopes.length > 5) {
      optionalScopeLines.push(`- … and ${projection.topScopes.length - 5} more: \`memory route --for-path <path>\``);
    }
  }

  // Optional: Recent decisions
  const decisionsBody = extraOptions.recentDecisionsMarkdown?.trim() || "- none";
  const optionalDecisionsLines: string[] = [
    "",
    "## Recent decisions",
    "<!-- memory:generated:start decisions -->",
    decisionsBody,
    "<!-- memory:generated:end decisions -->",
  ];

  // Optional: Recent activity
  const activityBody = extraOptions.recentActivityMarkdown?.trim() || "- none";
  const optionalActivityLines: string[] = [
    "",
    "## Recent activity",
    "<!-- memory:generated:start recent -->",
    activityBody,
    "<!-- memory:generated:end recent -->",
  ];

  // Test full body with frontmatter
  const buildOutput = (includeScopes: boolean, includeExtras: boolean) => {
    const parts = [...mandatoryBody];
    if (includeScopes && optionalScopeLines.length > 0) parts.push(...optionalScopeLines);
    if (includeExtras) {
      parts.push(...optionalDecisionsLines);
      parts.push(...optionalActivityLines);
    }
    return parts.join("\n") + "\n";
  };

  let candidate = buildOutput(true, true);
  if (Buffer.byteLength(candidate, "utf8") <= budgetBytes) {
    return candidate;
  }

  // Drop extras first
  candidate = buildOutput(true, false);
  if (Buffer.byteLength(candidate, "utf8") <= budgetBytes) {
    return candidate;
  }

  // Drop scopes if still over budget
  candidate = buildOutput(false, false);
  return candidate;
}

export function assembleContextFallback(
  projection: EntryPointProjection,
  errorMessage: string
): string {
  return [
    `# ${projection.projectName} Context Fallback`,
    `> Warning: Full entry point exceeds budget or encountered error: ${errorMessage}`,
    "",
    "## Mandatory Operating Instructions",
    "- Before editing a file: `memory check --for-path <file>`. If governance is `hold`, stop and ask.",
    "- Before proposing a design: `memory decisions`; never contradict an accepted decision without asking.",
    "- Changing decisions, conventions, scope rules, or architecture: offer 2-3 options, mark one (Recommended), wait for explicit approval.",
    "- Run `memory status` or `memory route` for targeted path guidance.",
  ].join("\n");
}
