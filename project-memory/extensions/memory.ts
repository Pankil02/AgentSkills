import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { readFile, realpath } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import {
  applyMemoryPlan,
  buildMemoryContext,
  checkCompletionReadiness,
  discoverTrackedScopes,
  getMemoryStatus,
  initializeBundle,
  operationRequiresApproval,
  parseMarkdown,
  recordEvent,
  refreshRegisteredSources,
  registerSource,
  syncAgentsFile,
  syncIndexes,
  validateBundle,
  withBundleLock,
  type MemoryPlan,
} from "../src/bundle.ts";
import { assertSafeRelativePath, findProjectRoot, mapPathsToScopes, scanRepository } from "../src/repository.ts";

const ApplyAction = Type.Union([
  Type.Literal("init"),
  Type.Literal("scaffold"),
  Type.Literal("sync"),
  Type.Literal("record_source"),
  Type.Literal("record_event"),
  Type.Literal("apply_plan"),
  Type.Literal("complete"),
]);
const MAX_TOOL_TEXT = 24_000;

const QuestionOptionSchema = Type.Object({
  value: Type.String({ description: "Stable value returned for this choice" }),
  label: Type.String({ description: "Choice label shown to the user" }),
  description: Type.Optional(Type.String({ description: "Optional explanation" })),
});

const MemoryQuestionSchema = Type.Object({
  id: Type.String({ description: "Stable question ID, such as P-Q01" }),
  prompt: Type.String({ description: "Specific question to ask" }),
  options: Type.Optional(Type.Array(QuestionOptionSchema, { maxItems: 8 })),
  allowOther: Type.Optional(Type.Boolean({ description: "Allow a custom answer; defaults to true" })),
});

function textResult(text: string, details: unknown = {}) {
  const normalized = text.length > MAX_TOOL_TEXT ? `${text.slice(0, MAX_TOOL_TEXT)}\n\n[Output truncated]` : text;
  return { content: [{ type: "text" as const, text: normalized }], details };
}

function errorResult(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return textResult(`Project Memory error: ${message}`, { error: message });
}

function normalize(path: string): string {
  return path.split(sep).join("/");
}

function shellMayTouchMemory(command: string): boolean {
  const normalized = command.replace(/\\(?=[a-z0-9_.-])/gi, "");
  return /\.memory(?=$|[\\/\s"'`;&|>{},)])|\.m[a-z]*(?:[*?{]|\[)|\.\*/i.test(normalized);
}

async function canonicalTarget(path: string): Promise<string> {
  let current = path;
  const suffix: string[] = [];
  while (true) {
    try {
      return resolve(await realpath(current), ...suffix);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") return path;
      const parent = dirname(current);
      if (parent === current) return path;
      suffix.unshift(basename(current));
      current = parent;
    }
  }
}

async function mutate<T>(root: string, callback: () => Promise<T>): Promise<T> {
  const queuePath = resolve(root, ".memory", ".mutation-queue");
  return withFileMutationQueue(queuePath, () => withBundleLock(root, callback));
}

function show(ctx: ExtensionContext, message: string, level: "info" | "warning" | "error" = "info"): void {
  if (ctx.hasUI) ctx.ui.notify(message, level);
  else process.stderr.write(`${message}\n`);
}

function parseScopes(input: string): string[] {
  return input.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean);
}

function summarizeValidation(validation: Awaited<ReturnType<typeof validateBundle>>): string {
  const lines = [validation.ok
    ? `Project Memory is valid (${validation.counts.documents} documents, ${validation.counts.scopes} scopes).`
    : `Project Memory has ${validation.counts.errors} error(s) and ${validation.counts.warnings} warning(s).`];
  for (const item of validation.diagnostics.slice(0, 12)) lines.push(`${item.severity}: ${item.path ?? "bundle"}: ${item.message}`);
  if (validation.diagnostics.length > 12) lines.push(`${validation.diagnostics.length - 12} more diagnostic(s).`);
  return lines.join("\n");
}

function summarizePlan(plan: MemoryPlan): string {
  return plan.operations.slice(0, 12).map((operation, index) => {
    const target = operation.path ?? operation.scope ?? "bundle indexes";
    const before = operation.expectedHash ? `expected ${operation.expectedHash}` : `current ${target}`;
    let after: string = operation.action;
    if (operation.action === "update_frontmatter") after = `set ${JSON.stringify(operation.values ?? {}).slice(0, 400)}`;
    else if (operation.action === "write_document") {
      const parsed = operation.content ? parseMarkdown(operation.content) : undefined;
      after = `write ${String(parsed?.data.title ?? operation.content?.match(/^#\s+(.+)$/m)?.[1] ?? "document").slice(0, 160)}`;
    } else if (operation.action === "append_log") after = `append ${String(operation.event?.title ?? operation.event?.summary ?? "history event").slice(0, 160)}`;
    else if (operation.action === "replace_generated") after = `replace generated region ${operation.region ?? "unknown"}`;
    return `${index + 1}. Before: ${before}\n   After: ${after}`;
  }).concat(plan.operations.length > 12 ? [`… ${plan.operations.length - 12} more operation(s)`] : []).join("\n");
}

async function requireSemanticApproval(
  ctx: ExtensionContext,
  title: string,
  summary: string,
  reason?: string,
): Promise<{ approved: boolean; reason?: string }> {
  if (ctx.hasUI) {
    const approved = await ctx.ui.confirm(title, `${summary}\n\nThis changes approved project meaning or lifecycle state.`);
    return { approved, reason: approved ? reason?.trim() || `Confirmed in ${title} dialog` : undefined };
  }
  return { approved: false };
}

export default function projectMemory(pi: ExtensionAPI): void {
  let dirtyRepositoryPaths = new Set<string>();
  let cachedScopes = ["."];
  const scopeCompletions = (prefix: string) => {
    const items = cachedScopes
      .filter((scope) => scope.startsWith(prefix))
      .map((scope) => ({ value: scope, label: scope === "." ? "Project" : scope }));
    return items.length > 0 ? items : null;
  };

  pi.registerTool({
    name: "memory_ask",
    label: "Project Memory Questions",
    description: "Ask the user one to five focused Project Memory interview, clarification, correction, or approval questions. Supports choices and open text. Use when intent is missing or ambiguous instead of guessing.",
    promptSnippet: "Ask focused Project Memory interview or approval questions",
    promptGuidelines: [
      "Use memory_ask for focused batches of no more than five Project Memory questions when intent, constraints, corrections, or approval are missing.",
      "Give memory_ask questions stable project or scope IDs and do not treat cancellation, silence, unknown, or skip as approval.",
    ],
    parameters: Type.Object({
      context: Type.Optional(Type.String({ description: "Short reason these questions are needed" })),
      questions: Type.Array(MemoryQuestionSchema, { minItems: 1, maxItems: 5 }),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      if (signal?.aborted) return textResult("Cancelled.", { answers: [], cancelled: true });
      if (!ctx.hasUI) {
        return textResult("Interactive Project Memory questions are unavailable in this mode. Ask the questions in the normal response and wait for the user.", { answers: [], cancelled: true });
      }
      const answers: Array<{ id: string; value: string; label: string; wasCustom: boolean }> = [];
      try {
        for (const question of params.questions) {
          if (signal?.aborted) return textResult("Cancelled.", { answers, cancelled: true });
          const options = question.options ?? [];
          if (options.length === 0) {
            const value = await ctx.ui.input(question.prompt, params.context ?? "Type an answer, unknown, or skip");
            if (value === undefined) return textResult("Question batch cancelled.", { answers, cancelled: true });
            answers.push({ id: question.id, value: value.trim() || "unknown", label: value.trim() || "unknown", wasCustom: true });
            continue;
          }
          const customLabel = "Type a different answer";
          const labels = options.map((option) => option.description ? `${option.label} — ${option.description}` : option.label);
          if (question.allowOther !== false) labels.push(customLabel);
          const selected = await ctx.ui.select(question.prompt, labels);
          if (selected === undefined) return textResult("Question batch cancelled.", { answers, cancelled: true });
          if (selected === customLabel) {
            const value = await ctx.ui.input(question.prompt, "Type an answer, unknown, or skip");
            if (value === undefined) return textResult("Question batch cancelled.", { answers, cancelled: true });
            answers.push({ id: question.id, value: value.trim() || "unknown", label: value.trim() || "unknown", wasCustom: true });
          } else {
            const index = labels.indexOf(selected);
            const option = options[index];
            answers.push({ id: question.id, value: option.value, label: option.label, wasCustom: false });
          }
        }
        return textResult(JSON.stringify({ answers, cancelled: false }, null, 2), { answers, cancelled: false });
      } catch (error) {
        return errorResult(error);
      }
    },
  });

  pi.registerTool({
    name: "memory_apply",
    label: "Update Project Memory",
    description: "Apply validated, atomic Project Memory updates. Use this instead of directly editing .memory. Goal meaning, intent, must-not rules, scope, contradiction resolution, and completion require explicit user approval.",
    promptSnippet: "Safely initialize, sync, record, or update the persistent .memory wiki",
    promptGuidelines: [
      "Use memory_apply rather than built-in write/edit for every .memory mutation.",
      "Before memory_apply changes goal meaning, scope, constraints, preferences, contradiction resolution, or completion, obtain explicit user approval and provide the approval reason.",
      "Use memory_apply record_source for approved sources, then integrate their claims into existing topic/entity pages with citations; do not stop at source registration.",
      "Preserve history with append_log operations and never rewrite log.md.",
    ],
    parameters: Type.Object({
      action: ApplyAction,
      scopes: Type.Optional(Type.Array(Type.String())),
      scope: Type.Optional(Type.String()),
      source: Type.Optional(Type.String()),
      event: Type.Optional(Type.Record(Type.String(), Type.Any())),
      plan: Type.Optional(Type.Any()),
      approvalReason: Type.Optional(Type.String()),
      evidence: Type.Optional(Type.String()),
      dryRun: Type.Optional(Type.Boolean()),
    }),
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      if (signal?.aborted) return textResult("Cancelled.");
      try {
        const root = await findProjectRoot(ctx.cwd);
        const dryRun = params.dryRun ?? false;
        onUpdate?.(textResult(`Preparing Project Memory ${params.action}…`));

        if (params.action === "init" || params.action === "scaffold") {
          const scopes = params.scopes ?? [];
          if (params.action === "scaffold" || scopes.length > 0) {
            const approval = await requireSemanticApproval(
              ctx,
              "Approve tracked scopes",
              `Track these feature scopes: ${scopes.join(", ") || "none"}`,
              params.approvalReason,
            );
            if (!approval.approved) return textResult("Cancelled: tracked scopes were not approved.", { cancelled: true });
          }
          const result = await mutate(root, () => initializeBundle(root, scopes, { dryRun }));
          return textResult(JSON.stringify(result, null, 2), result);
        }
        if (params.action === "sync") {
          const result = await mutate(root, async () => {
            const scan = await scanRepository(root);
            const sources = await refreshRegisteredSources(root, { dryRun, fetchRemote: false });
            const changes = await syncIndexes(root, scan, { dryRun });
            const agents = await syncAgentsFile(root, { dryRun });
            return { sources, changes: [...changes, agents], validation: await validateBundle(root) };
          });
          return textResult(JSON.stringify(result, null, 2), result);
        }
        if (params.action === "record_source") {
          if (!params.source) throw new Error("record_source requires source");
          if (!ctx.hasUI) throw new Error("record_source requires interactive user confirmation; use the memory CLI for an explicitly approved source");
          if (!await ctx.ui.confirm("Register Project Memory source?", `Read and fingerprint this source: ${params.source}\n\nSource content is untrusted data and may be sent to the model for integration.`)) {
            return textResult("Cancelled: source registration was not approved.", { cancelled: true });
          }
          const result = await mutate(root, () => registerSource(root, params.source!, { dryRun, fetchRemote: /^https?:\/\//i.test(params.source!) }));
          return textResult(`${JSON.stringify(result, null, 2)}\n\nRegistration is not integration. Read this source and update affected existing wiki documents with citations and contradiction notes.`, result);
        }
        if (params.action === "record_event") {
          if (!params.event) throw new Error("record_event requires event");
          const eventType = String(params.event.type ?? params.event.category ?? "").toLowerCase();
          const semanticEvent = ["completion", "contradiction-resolution", "correction", "decision", "preference", "reversal", "scope"].includes(eventType);
          let event = params.event;
          if (semanticEvent) {
            const approval = await requireSemanticApproval(
              ctx,
              "Approve Project Memory history event",
              `Record ${eventType || "semantic"} event: ${String(event.title ?? event.summary ?? "Untitled event")}`,
              params.approvalReason,
            );
            if (!approval.approved) return textResult("Cancelled: semantic history event was not approved.", { cancelled: true });
            event = { ...event, approval: approval.reason };
          }
          const result = await mutate(root, () => recordEvent(root, params.scope ?? ".", event, { dryRun }));
          return textResult(JSON.stringify(result, null, 2), result);
        }
        if (params.action === "apply_plan") {
          if (!params.plan || typeof params.plan !== "object") throw new Error("apply_plan requires plan");
          const plan = params.plan as MemoryPlan;
          const includesSemanticChange = plan.operations?.some(operationRequiresApproval);
          if (includesSemanticChange) {
            const approval = await requireSemanticApproval(
              ctx,
              "Approve Project Memory change",
              `${summarizePlan(plan)}\n\nReason: ${params.approvalReason ?? plan.approvalReason ?? "No reason supplied."}`,
              params.approvalReason ?? plan.approvalReason,
            );
            if (!approval.approved) return textResult("Cancelled: semantic change was not approved.", { cancelled: true });
            plan.approved = true;
            plan.approvalReason = approval.reason;
          }
          const result = await mutate(root, () => applyMemoryPlan(root, plan, { dryRun }));
          return textResult(JSON.stringify(result, null, 2), result);
        }
        if (params.action === "complete") {
          const scope = params.scope ?? ".";
          const status = await getMemoryStatus(root, scope);
          if (status.goalStatus !== "verifying") throw new Error(`Completion requires goal status 'verifying'; current status is '${status.goalStatus ?? "unknown"}'`);
          const readiness = await checkCompletionReadiness(root, scope);
          if (!readiness.ready) throw new Error(`Completion evidence is incomplete: ${readiness.missing.join("; ")}`);
          if (!params.evidence?.trim()) throw new Error("Completion requires an evidence summary");
          const approval = await requireSemanticApproval(ctx, "Complete goal", `Scope: ${scope}\nEvidence: ${params.evidence}`, params.approvalReason);
          if (!approval.approved) return textResult("Cancelled: completion was not approved.", { cancelled: true });
          const goalPath = scope === "." ? "goal.md" : `${scope}/goal.md`;
          const plan: MemoryPlan = {
            approved: true,
            approvalReason: approval.reason,
            operations: [
              { action: "update_frontmatter", path: goalPath, values: { status: "complete" }, semantic: true },
              { action: "append_log", scope, event: { type: "completion", title: "Goal completed", evidence: params.evidence, approval: approval.reason } },
              { action: "sync_indexes" },
            ],
          };
          const result = await mutate(root, async () => {
            const currentReadiness = await checkCompletionReadiness(root, scope);
            if (!currentReadiness.ready) throw new Error(`Completion evidence changed: ${currentReadiness.missing.join("; ")}`);
            return applyMemoryPlan(root, plan, { dryRun });
          });
          return textResult(JSON.stringify(result, null, 2), result);
        }
        throw new Error(`Unsupported action: ${params.action}`);
      } catch (error) {
        return errorResult(error);
      }
    },
  });

  pi.registerCommand("memory-init", {
    description: "Initialize Project Memory (--deep for deep codebase scan) and conduct project or feature interview",
    getArgumentCompletions: scopeCompletions,
    handler: async (args, ctx) => {
      try {
        const root = await findProjectRoot(ctx.cwd);
        const parts = parseScopes(args);
        const deep = parts.includes("--deep");
        const scopeParts = parts.filter((p) => p !== "--deep");
        const status = await getMemoryStatus(root).catch(() => ({ initialized: false }));
        if (!status.initialized) {
          const scan = await scanRepository(root);
          let scopes = scopeParts;
          if (scopes.length === 0 && ctx.hasUI && !deep) {
            const suggestions = scan.candidates.filter((candidate) => candidate.confidence !== "low").map((candidate) => candidate.path).join(", ");
            const input = await ctx.ui.input("Tracked scopes (comma separated; blank for project only)", suggestions);
            if (input === undefined) return;
            scopes = parseScopes(input);
          }
          const confirmed = !ctx.hasUI || await ctx.ui.confirm("Initialize Project Memory?", `Create .memory${deep ? " with deep codebase scan" : ""}. No existing memory document will be overwritten.`);
          if (!confirmed) return;
          const result = await mutate(root, () => initializeBundle(root, scopes, { deep }));
          cachedScopes = result.scopes;
          show(ctx, `Project Memory initialized (${deep ? "deep scan" : "standard"}). ${result.changes.filter((change) => change.action !== "skip").length} file(s) changed.`);
          if (!ctx.hasUI || await ctx.ui.confirm("Start project interview?", "Start an interactive Grill-Me style interview (one question at a time with recommendations across 3–4 rounds).")) {
            pi.sendUserMessage(`[Project Memory project interview]\nConduct an interactive Grill-Me style interview (3–4 rounds minimum) to establish the root project goal. Rules:\n1. Ask questions ONE AT A TIME using interactive tools (memory_ask or ask_question).\n2. For every question, inspect the repository first and provide a recommended option prefixed with '(Recommended)'.\n3. Walk down each branch of the design tree sequentially.\n4. Round 1 MUST ask: (a) Is this a new feature or add-on feature? (b) Create a new folder or use an existing folder? (c) What design patterns and architecture to use?\n5. Round 2 (5–10 clarifying follow-ups based on Round 1 answers) and Round 3+ (refinements) until intent is crystal clear.\n6. Record confirmed answers incrementally with memory_apply. Before moving to ready, present the final synthesis and obtain explicit approval.`);
          }
        } else {
          const scope = scopeParts[0] || ".";
          pi.sendUserMessage(`[Project Memory ${scope === "." ? "project" : "feature"} interview]\nRead .memory/index.md and ${scope === "." ? ".memory/goal.md" : `.memory/${scope}/goal.md`}. Conduct an interactive Grill-Me style interview (3–4 rounds minimum). Rules:\n1. Ask questions ONE AT A TIME using interactive tools (memory_ask or ask_question).\n2. For every question, inspect the repository first and provide a recommended option prefixed with '(Recommended)'.\n3. Walk down each branch of the design tree sequentially.\n4. Round 1 MUST ask: (a) Is this a new feature or add-on feature? (b) Create a new folder or use an existing folder? (c) What design patterns and architecture to use?\n5. Round 2 (5–10 clarifying follow-ups) and Round 3+ (refinements) until intent is crystal clear.\n6. Record confirmed answers incrementally with memory_apply. Present a final synthesis and request explicit approval before moving to ready.`);
        }
      } catch (error) {
        show(ctx, (error as Error).message, "error");
      }
    },
  });

  pi.registerCommand("memory-ingest", {
    description: "Deep codebase scan & ingestion to initialize or update .memory as project brain",
    getArgumentCompletions: scopeCompletions,
    handler: async (args, ctx) => {
      try {
        const root = await findProjectRoot(ctx.cwd);
        const scopes = parseScopes(args);
        const result = await mutate(root, () => initializeBundle(root, scopes, { deep: true }));
        cachedScopes = result.scopes;
        show(ctx, `Project Memory deep codebase scan completed. ${result.changes.filter((c) => c.action !== "skip").length} file(s) updated/created.`);
        pi.sendUserMessage(`[Project Memory deep ingestion]\nDeep codebase scan completed. Read .memory/goal.md and .memory/index.md to review auto-detected architecture, tech stack, domain models, database schemas, and API routes. Perform initial project onboarding interview if goal is still in draft state.`);
      } catch (error) {
        show(ctx, (error as Error).message, "error");
      }
    },
  });

  pi.registerCommand("memory-sync", {
    description: "Synchronize memory, validate, show status, or register/integrate a source (pass path/URL or --fetch-remote)",
    handler: async (args, ctx) => {
      try {
        const root = await findProjectRoot(ctx.cwd);
        const trimmed = args.trim();
        if (trimmed && trimmed !== "--fetch-remote" && !trimmed.startsWith("-")) {
          const record = await mutate(root, () => registerSource(root, trimmed, { fetchRemote: /^https?:\/\//i.test(trimmed) }));
          show(ctx, `Registered ${record.resource} as ${record.path}.`);
          pi.sendUserMessage(`[Project Memory source integration]\nI approved this source: ${record.resource}. Its record is ${record.path}. Read the source and existing relevant Project Memory pages. Extract supported claims and provenance, integrate them into existing topic/entity pages, add cross-links and citations, retain contradictions and uncertainty, update the source record's affected documents and integration status, and append history. Do not stop after registration or create a duplicate summary page. Ask before changing project intent or resolving contradictions.`);
          return;
        }

        const fetchRemote = trimmed === "--fetch-remote";
        if (fetchRemote && ctx.hasUI && !await ctx.ui.confirm("Refresh approved URL sources?", "This performs network requests to URLs already registered in Project Memory.")) return;

        const result = await mutate(root, async () => {
          const scan = await scanRepository(root);
          const sources = await refreshRegisteredSources(root, { fetchRemote });
          const changes = await syncIndexes(root, scan);
          const agents = await syncAgentsFile(root);
          const validation = await validateBundle(root);
          const status = await getMemoryStatus(root);
          return { sources, changes: [...changes, agents], validation, status };
        });

        const changedSources = result.sources.filter((source) => source.needsIntegration);
        const statusSummary = summarizeValidation(result.validation);
        show(ctx, `Project Memory synchronized.\nStatus: ${result.status.goalStatus ?? "initialized"} | Scopes: ${result.validation.counts.scopes} | ${changedSources.length} source(s) need attention.\n${statusSummary}`, result.validation.ok ? "info" : "warning");

        if (changedSources.length > 0) {
          pi.sendUserMessage(`[Project Memory source integration]\nThe following registered sources need integration or attention: ${changedSources.map((source) => `${source.path} (${source.resource})`).join(", ")}. Read each approved source, its source record, and affected existing topic/entity pages. Integrate claims into the wiki with citations and provenance, preserve contradictions, update affected documents and progress, and append history. Do not merely index or summarize the source. Ask before changing semantic intent or resolving contradictions.`);
        }
      } catch (error) {
        show(ctx, (error as Error).message, "error");
      }
    },
  });

  pi.registerCommand("memory-reflect", {
    description: "Reflect on session work against approved goals, or approve goal completion (pass 'complete' or scope)",
    getArgumentCompletions: scopeCompletions,
    handler: async (args, ctx) => {
      try {
        const parts = parseScopes(args);
        const isComplete = parts.includes("complete") || parts.includes("--complete");
        const scopeParts = parts.filter((p) => p !== "complete" && p !== "--complete");
        const scope = scopeParts[0] || ".";

        if (isComplete) {
          const root = await findProjectRoot(ctx.cwd);
          const status = await getMemoryStatus(root, scope);
          if (status.goalStatus !== "verifying") {
            show(ctx, `Goal must be in verifying state before completion; current state: ${status.goalStatus ?? "unknown"}.`, "warning");
            return;
          }
          const readiness = await checkCompletionReadiness(root, scope);
          if (!readiness.ready) {
            show(ctx, `Completion evidence is incomplete:\n- ${readiness.missing.join("\n- ")}`, "warning");
            return;
          }
          const confirmed = !ctx.hasUI || await ctx.ui.confirm("Approve completion?", `Scope: ${scope}\nVerified criteria: ${readiness.verified.join(", ")}\nThis marks the approved goal complete. History and evidence remain preserved.`);
          if (!confirmed) return;
          const goalPath = scope === "." ? "goal.md" : `${scope}/goal.md`;
          const plan: MemoryPlan = {
            approved: true,
            approvalReason: "Explicitly approved through memory-reflect complete",
            operations: [
              { action: "update_frontmatter", path: goalPath, values: { status: "complete" }, semantic: true },
              { action: "append_log", scope, event: { type: "completion", title: "Goal completed", evidence: "Acceptance evidence reviewed in progress.md", approval: "Explicit completion confirmation" } },
              { action: "sync_indexes" },
            ],
          };
          await mutate(root, async () => {
            const currentReadiness = await checkCompletionReadiness(root, scope);
            if (!currentReadiness.ready) throw new Error(`Completion evidence changed: ${currentReadiness.missing.join("; ")}`);
            return applyMemoryPlan(root, plan);
          });
          show(ctx, `Completed ${scope}.`);
          return;
        }

        pi.sendUserMessage(`[Project Memory reflection${scope !== "." ? ` for ${scope}` : ""}]\nRead approved goals, current progress, relevant decisions, sources, and acceptance criteria from the linked wiki. Compare them with the work and repository evidence from this session. Identify alignment, drift, contradictions, unverified claims, stale source effects, and the single next action for every active unblocked scope. Ask before resolving semantic uncertainty. Then use memory_apply to update progress, evidence, existing topic/entity pages, and append-only history.`);
      } catch (error) {
        show(ctx, (error as Error).message, "error");
      }
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    try {
      const root = await findProjectRoot(ctx.cwd);
      const status = await getMemoryStatus(root);
      if (status.initialized) cachedScopes = await discoverTrackedScopes(root);
      if (ctx.hasUI && status.initialized) {
        const label = `${status.goalStatus ?? "unknown"}${status.validation.ok ? "" : ` · ${status.validation.counts.errors} error(s)`}`;
        ctx.ui.setStatus("project-memory", ctx.ui.theme.fg(status.validation.ok ? "accent" : "warning", `memory: ${label}`));
      }
    } catch {
      // Project Memory is optional until initialized.
    }
  });

  pi.on("before_agent_start", async (_event, ctx) => {
    try {
      const root = await findProjectRoot(ctx.cwd);
      const content = await buildMemoryContext(root);
      return { message: { customType: "project-memory-context", content, display: false } };
    } catch {
      return;
    }
  });

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName === "write" || event.toolName === "edit") {
      const rawPath = typeof event.input.path === "string" ? event.input.path.replace(/^@/, "") : "";
      if (!rawPath) return;
      const absolute = resolve(ctx.cwd, rawPath);
      const root = await findProjectRoot(ctx.cwd);
      const memoryRoot = resolve(root, ".memory");
      const guardedAbsolute = await canonicalTarget(absolute);
      const canonicalMemoryRoot = await canonicalTarget(memoryRoot);
      const relativeToMemory = relative(canonicalMemoryRoot, guardedAbsolute);
      if (relativeToMemory === "" || (!relativeToMemory.startsWith(`..${sep}`) && relativeToMemory !== "..")) {
        return { block: true, reason: "Direct .memory edits are blocked. Use memory_apply so approval, markers, validation, locking, and append-only history are preserved." };
      }
      if (guardedAbsolute === resolve(root, "AGENTS.md")) {
        const current = await readFile(guardedAbsolute, "utf8").catch(() => "");
        const start = current.indexOf("<!-- memory:start -->");
        const endMarker = "<!-- memory:end -->";
        const end = current.indexOf(endMarker);
        if (start >= 0 && end >= start) {
          if (event.toolName === "write") return { block: true, reason: "AGENTS.md contains a managed Project Memory block. Use a targeted edit outside <!-- memory:start --> and <!-- memory:end -->." };
          const input = event.input as Record<string, unknown>;
          const edits = Array.isArray(input.edits) ? input.edits as Array<{ oldText?: unknown }> : [];
          const oldTexts = edits.length > 0
            ? edits.map((edit) => typeof edit.oldText === "string" ? edit.oldText : "")
            : [typeof input.oldText === "string" ? input.oldText : ""];
          const managedEnd = end + endMarker.length;
          if (oldTexts.some((oldText) => {
            const editStart = oldText ? current.indexOf(oldText) : -1;
            return editStart < 0 || (editStart < managedEnd && editStart + oldText.length > start);
          })) {
            return { block: true, reason: "This edit may overlap the managed Project Memory block in AGENTS.md." };
          }
        }
      }
      dirtyRepositoryPaths.add(normalize(relative(root, guardedAbsolute)));
    }
    if (event.toolName === "bash" && typeof event.input.command === "string") {
      if (shellMayTouchMemory(event.input.command)) {
        return { block: true, reason: "Shell access to .memory is blocked because shell syntax cannot be proven read-only. Use the read tool for documents and memory_apply for mutations." };
      }
      dirtyRepositoryPaths.add(".");
    }
  });

  pi.on("agent_end", async (_event, ctx) => {
    if (dirtyRepositoryPaths.size === 0) return;
    try {
      const root = await findProjectRoot(ctx.cwd);
      const scopes = await discoverTrackedScopes(root);
      const affected = mapPathsToScopes([...dirtyRepositoryPaths], scopes);
      dirtyRepositoryPaths = new Set<string>();
      pi.sendMessage({
        customType: "project-memory-stale-reminder",
        content: `[PROJECT MEMORY MAINTENANCE]\nRepository files changed in these tracked scopes: ${Object.entries(affected).map(([scope, paths]) => `${scope}: ${paths.join(", ")}`).join("; ")}. On the next relevant turn, verify approved intent and update progress, evidence, source/topic pages, history, and exactly one next action per active unblocked scope using memory_apply. Do not infer semantic changes without approval.`,
        display: false,
      }, { deliverAs: "nextTurn" });
    } catch {
      dirtyRepositoryPaths = new Set<string>();
    }
  });
}
