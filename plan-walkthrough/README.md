# Plan & Walkthrough

Makes an agent write a deep implementation plan before any code is written. The agent saves the plan in the repo, replies with a short walkthrough of the decisions, and gives you a prompt to paste into a fresh chat that will carry out the plan.

## Flow

1. **Investigate:** the agent reads the real code, hot paths, and conventions. It asks at most 3 questions, and only when the answer would change a decision.
2. **Decide:** for each decision it lists the options, the flaw in each rejected one, and why the chosen one wins. Priority order is correctness, then latency, then simplicity.
3. **Save:** the plan goes to `docs/plans/YYYY-MM-DD-<slug>.md`. It covers goal, context, design, decision table, performance budget, file changes, step list, tests, rollout, and risks.
4. **Reply:** a walkthrough of 40 lines or fewer (design, decisions and alternatives, code structure, files, latency and risks), the plan path, and a copy-paste handoff prompt.

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

Try it manually: ask an agent to "plan adding rate limiting to the API." Check for three things:
- A file appears under `docs/plans/`.
- No source files change.
- The reply has a decision walkthrough (for example, token bucket vs. fixed window) and a handoff prompt in a code block.

## License

MIT
