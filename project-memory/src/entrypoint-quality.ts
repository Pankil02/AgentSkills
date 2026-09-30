import { type EntryPointCatalog } from "./facts.ts";
import { AGENTS_END_MARKER, AGENTS_START_MARKER } from "./entrypoints.ts";

export interface CategoryScore {
  score: number;
  max: number;
  details: string[];
}

export interface QualityReport {
  score: number;
  max: 100;
  categories: {
    orientation: CategoryScore;
    scopeOwnership: CategoryScore;
    taskRouting: CategoryScore;
    verificationRouting: CategoryScore;
    freshnessProvenance: CategoryScore;
    contextEconomy: CategoryScore;
    semanticClarity: CategoryScore;
  };
  passedSafetyGates: boolean;
  safetyViolations: string[];
}

export function evaluateEntryPointQuality(
  catalog: EntryPointCatalog,
  options: {
    agentsContent?: string;
    indexContent?: string;
  } = {}
): QualityReport {
  const safetyViolations: string[] = [];

  // Check safety violations
  if (options.agentsContent) {
    const startCount = (options.agentsContent.match(new RegExp(AGENTS_START_MARKER, "g")) || []).length;
    const endCount = (options.agentsContent.match(new RegExp(AGENTS_END_MARKER, "g")) || []).length;
    if (startCount !== endCount) {
      safetyViolations.push(`AGENTS.md marker mismatch: ${startCount} starts vs ${endCount} ends`);
    }
  }

  // 1. Orientation (10 pts)
  const orientation: CategoryScore = { score: 0, max: 10, details: [] };
  const purposeFact = catalog.facts.find((f) => f.kind === "purpose" && f.scope === ".");
  const shapeFact = catalog.facts.find((f) => f.kind === "capability" && f.id === "fact:capability:shape");

  if (purposeFact && purposeFact.summary.trim().length > 0) {
    orientation.score += 5;
    orientation.details.push(`Purpose recorded (${purposeFact.status}): ${purposeFact.summary}`);
  } else {
    orientation.details.push("Missing project purpose fact");
  }

  if (shapeFact && ["single-package", "workspace", "unknown"].includes(catalog.projectShape)) {
    orientation.score += 5;
    orientation.details.push(`Valid shape classified: ${catalog.projectShape}`);
  } else {
    orientation.details.push("Invalid or missing shape classification");
  }

  // 2. Scope ownership & entry points (20 pts)
  const scopeOwnership: CategoryScore = { score: 0, max: 20, details: [] };
  const scopeFacts = catalog.facts.filter((f) => f.kind === "scope");
  if (catalog.projectShape === "workspace") {
    if (scopeFacts.length > 0) {
      scopeOwnership.score += 20;
      scopeOwnership.details.push(`${scopeFacts.length} workspace scope(s) identified with evidence`);
    } else {
      scopeOwnership.details.push("Workspace classified but 0 scopes recorded");
    }
  } else {
    // Single package or generic
    scopeOwnership.score += 20;
    scopeOwnership.details.push("Single package / non-workspace scopes validly empty");
  }

  // 3. Task routing (25 pts)
  const taskRouting: CategoryScore = { score: 0, max: 25, details: [] };
  if (catalog.routes.length > 0) {
    taskRouting.score += 15;
    taskRouting.details.push(`${catalog.routes.length} task route(s) defined`);

    const hasGoverningDocs = catalog.routes.every((r) => r.instructionPaths.length > 0);
    if (hasGoverningDocs) {
      taskRouting.score += 10;
      taskRouting.details.push("All routes include governing instruction documents");
    } else {
      taskRouting.details.push("Some routes lack governing instruction paths");
    }
  } else {
    taskRouting.details.push("No task routes defined in catalog");
  }

  // 4. Verification routing (15 pts)
  const verificationRouting: CategoryScore = { score: 0, max: 15, details: [] };
  if (catalog.commands.length > 0) {
    const validCommands = catalog.commands.every(
      (c) => Array.isArray(c.argv) && c.argv.length > 0 && typeof c.cwd === "string"
    );
    if (validCommands) {
      verificationRouting.score += 15;
      verificationRouting.details.push(`${catalog.commands.length} structured verification command(s) with valid argv & cwd`);
    } else {
      verificationRouting.details.push("Some verification commands have invalid structure");
    }
  } else {
    // No verification commands found; legitimate explicit unavailable state per §16.1
    verificationRouting.score += 15;
    verificationRouting.details.push("No discovered verification scripts (explicit unavailable state; valid for non-code repos)");
  }

  // 5. Freshness & provenance (15 pts)
  const freshnessProvenance: CategoryScore = { score: 0, max: 15, details: [] };
  const hasEvidence = catalog.facts.every((f) => Array.isArray(f.evidence));
  const hasValidStatus = catalog.facts.every((f) =>
    ["observed", "approved", "inferred", "unknown", "stale", "conflict"].includes(f.status)
  );

  if (hasEvidence && hasValidStatus) {
    freshnessProvenance.score += 15;
    freshnessProvenance.details.push("All facts have validated evidence arrays and legitimate statuses");
  } else {
    freshnessProvenance.details.push("Some facts have missing evidence or invalid status");
  }

  // 6. Context economy & fallback (10 pts)
  const contextEconomy: CategoryScore = { score: 0, max: 10, details: [] };
  let economyScore = 10;
  if (options.agentsContent) {
    const bytes = Buffer.byteLength(options.agentsContent, "utf8");
    if (bytes > 6000) {
      economyScore -= 5;
      contextEconomy.details.push(`AGENTS.md exceeds 6000 bytes hard budget (${bytes} bytes)`);
    } else {
      contextEconomy.details.push(`AGENTS.md fits within budget (${bytes} bytes)`);
    }
  }
  if (options.indexContent) {
    const bytes = Buffer.byteLength(options.indexContent, "utf8");
    if (bytes > 6000) {
      economyScore -= 5;
      contextEconomy.details.push(`.memory/index.md exceeds 6000 bytes hard budget (${bytes} bytes)`);
    } else {
      contextEconomy.details.push(`.memory/index.md fits within budget (${bytes} bytes)`);
    }
  }
  contextEconomy.score = Math.max(0, economyScore);

  // 7. Semantic clarity (5 pts)
  const semanticClarity: CategoryScore = { score: 0, max: 5, details: [] };
  if (["unconfirmed", "ddd", "other"].includes(catalog.architectureMode)) {
    semanticClarity.score += 5;
    semanticClarity.details.push(`Architecture mode clearly specified (${catalog.architectureMode})`);
  } else {
    semanticClarity.details.push("Invalid architecture mode specified");
  }

  const totalScore =
    orientation.score +
    scopeOwnership.score +
    taskRouting.score +
    verificationRouting.score +
    freshnessProvenance.score +
    contextEconomy.score +
    semanticClarity.score;

  return {
    score: totalScore,
    max: 100,
    categories: {
      orientation,
      scopeOwnership,
      taskRouting,
      verificationRouting,
      freshnessProvenance,
      contextEconomy,
      semanticClarity,
    },
    passedSafetyGates: safetyViolations.length === 0,
    safetyViolations,
  };
}
