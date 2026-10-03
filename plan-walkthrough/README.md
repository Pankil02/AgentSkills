# Plan & Walkthrough

Makes an agent write a deep, phased implementation plan before any code is written. The agent saves the plan in the repo, replies with a short decision walkthrough, and gives you a prompt to implement **only phase 1** in a fresh chat. Each implementing chat returns completion context and a prompt for the next phase, keeping context windows bounded.

## Flow

1. **Investigate:** the agent reads the real code, hot paths, and conventions. It asks at most 3 questions, and only when the answer would change a decision.
2. **Decide:** for each decision it lists the options, the flaw in each rejected one, and why the chosen one wins. Priority order is correctness, then latency, then simplicity.
3. **Phase:** split work into dependency-ordered, independently verifiable phases sized for one chat each. Define scope, files, steps, commands, and acceptance criteria per phase.
4. **Save:** the plan goes to `docs/plans/YYYY-MM-DD-<slug>.md`. It covers goal, context, design, decisions, performance, file changes, all phases, tests, rollout, risks, and durable completion records.
5. **Reply:** a walkthrough of 40 lines or fewer, the plan path, and a copy-paste prompt authorizing only phase 1.
6. **Continue in fresh chats:** each implementing agent verifies its phase, updates the plan, and returns changes, contracts, test results, deviations/blockers, plus the next phase's prompt. Every prompt repeats the one-phase-only and handoff instructions; no previous chat history is required. A blocked phase gets a same-phase resume prompt. The final phase returns a final verification summary, not another prompt.

The agent does not edit source files in this mode. It writes only the plan file.

## Install

```bash
npx github:Pankil02/AgentSkills install plan-walkthrough --symlink
# or
npx skills@latest add Pankil02/AgentSkills --skill plan-walkthrough
```

## Verify

```bash
npm run validate
npm test
```

Try it manually: ask an agent to "plan adding rate limiting to the API."
- A file appears under `docs/plans/` with numbered phases, dependencies, scope boundaries, and per-phase verification/acceptance criteria.
- No source files change during planning.
- The reply has a decision walkthrough (for example, token bucket vs. fixed window) and a prompt authorizing only phase 1.
- Paste that prompt into a fresh chat: it implements only phase 1, records actual verification results in the plan, and returns completion context plus a phase 2 prompt carrying the same execution/handoff rules.
- Continue in fresh chats until finished. Blockers must stop advancement; the last phase must summarize verification without inventing another phase.

## Upgrade to 2.0.0

Breaking agent-contract change: implementation now runs one phase per chat instead of the full plan in one chat. No files are renamed and no project-data migration is required. Existing plans remain unchanged; re-plan them into phases before using this workflow.

## License

MIT
