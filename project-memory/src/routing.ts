import { normalizeRelative, assertSafeRelativePath } from "./repository.ts";
import { type EntryPointCatalog, type VerificationCommand } from "./facts.ts";

export interface RouteQuery {
  task?: string;
  path?: string;
  limit?: number;
}

export interface RouteMatch {
  scope: string;
  reason: string;
  confidence: "direct" | "heuristic" | "unconfirmed";
  startPaths: string[];
  governingDocuments: string[];
  verificationCommands: VerificationCommand[];
  warnings: string[];
}

export interface RouteResult {
  query: RouteQuery;
  matches: RouteMatch[];
  fallback?: { command: string; explanation: string };
}

export function findRoute(catalog: EntryPointCatalog, query: RouteQuery): RouteResult {
  const limit = Math.max(1, Math.min(query.limit ?? 3, 10));
  const matches: RouteMatch[] = [];

  const scopeFacts = catalog.facts.filter((f) => f.kind === "scope");
  const rootCommands = catalog.commands.filter((c) => c.scope === ".");

  if (query.path) {
    let cleanPath = query.path.trim();
    try {
      cleanPath = assertSafeRelativePath(cleanPath);
    } catch {
      cleanPath = normalizeRelative(cleanPath);
    }

    // Find deepest matching scope
    let matchedScope = ".";
    let matchedScopeSummary = "";

    const sortedScopes = [...scopeFacts].sort((a, b) => b.scope.length - a.scope.length);
    for (const sf of sortedScopes) {
      if (cleanPath === sf.scope || cleanPath.startsWith(`${sf.scope}/`)) {
        matchedScope = sf.scope;
        matchedScopeSummary = sf.summary;
        break;
      }
    }

    const scopeCmds = catalog.commands.filter((c) => c.scope === matchedScope);
    const applicableCommands = scopeCmds.length > 0 ? scopeCmds : rootCommands;

    const governingDocs = [".memory/conventions.md"];
    if (matchedScope !== ".") {
      governingDocs.unshift(`.memory/${matchedScope}/agents.md`);
    }

    const warnings: string[] = [];
    if (applicableCommands.length === 0) {
      warnings.push("No verified test command recorded for this scope");
    }

    matches.push({
      scope: matchedScope,
      reason: matchedScope === "."
        ? `Path maps to root project (${cleanPath})`
        : `Path is inside scope '${matchedScope}' (${matchedScopeSummary || cleanPath})`,
      confidence: matchedScope === "." ? "heuristic" : "direct",
      startPaths: [cleanPath],
      governingDocuments: governingDocs,
      verificationCommands: applicableCommands,
      warnings,
    });

    return {
      query,
      matches,
      fallback: {
        command: `memory check --for-path ${cleanPath}`,
        explanation: "Check MUST/NEVER governance rules before editing this path",
      },
    };
  }

  if (query.task) {
    const rawTokens = query.task
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2);
    const tokens = new Set(rawTokens);

    // 1. Direct intent match in catalog.routes
    for (const route of catalog.routes) {
      const matchedIntent = route.intents.find((intent) => tokens.has(intent.toLowerCase()));
      if (matchedIntent) {
        const routeCmds = catalog.commands.filter((c) => route.verificationCommandIds.includes(c.id));
        matches.push({
          scope: route.scope,
          reason: `Exact intent token match for '${matchedIntent}'`,
          confidence: "direct",
          startPaths: route.startPaths,
          governingDocuments: route.instructionPaths,
          verificationCommands: routeCmds.length > 0 ? routeCmds : rootCommands,
          warnings: [],
        });
      }
    }

    // 2. Scope name / summary token match
    for (const sf of scopeFacts) {
      if (!matches.some((m) => m.scope === sf.scope)) {
        const scopeTokens = sf.scope.toLowerCase().split(/[/_-]/);
        const hit = scopeTokens.some((st) => tokens.has(st));
        if (hit) {
          const scopeCmds = catalog.commands.filter((c) => c.scope === sf.scope);
          matches.push({
            scope: sf.scope,
            reason: `Scope path matched keyword in query ('${sf.scope}')`,
            confidence: "heuristic",
            startPaths: [],
            governingDocuments: [`.memory/${sf.scope}/agents.md`, ".memory/conventions.md"],
            verificationCommands: scopeCmds.length > 0 ? scopeCmds : rootCommands,
            warnings: [],
          });
        }
      }
    }

    // 3. Fallback: If no matches or fewer than limit, add root general match
    if (matches.length === 0) {
      matches.push({
        scope: ".",
        reason: "No specific sub-scope matched; routing to project root",
        confidence: "unconfirmed",
        startPaths: catalog.facts.find((f) => f.id === "fact:purpose:root")?.evidence.map((e) => e.path) || [],
        governingDocuments: [".memory/conventions.md"],
        verificationCommands: rootCommands,
        warnings: ["Task keywords did not unambiguously match any known scope or route"],
      });
    }

    return {
      query,
      matches: matches.slice(0, limit),
      fallback: {
        command: `memory search ${query.task}`,
        explanation: "Search durable memory for relevant past decisions or architecture notes",
      },
    };
  }

  return {
    query,
    matches: [
      {
        scope: ".",
        reason: "Empty query; default route to root",
        confidence: "unconfirmed",
        startPaths: [],
        governingDocuments: [".memory/conventions.md"],
        verificationCommands: rootCommands,
        warnings: ["Provide --task or --for-path for targeted routing"],
      },
    ],
  };
}
