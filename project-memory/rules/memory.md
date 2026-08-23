# Project Memory rule

When `.memory/index.md` exists in a workspace:

1. **Read Index & Route Architecture**: Read `.memory/index.md` (< 4 KB router), route through System Flow (`.memory/architecture/system-design/Flow.md`) → relevant layer `Flow.md` → matching scope's `goal.md` and `progress.md`. Keep `index.md`, relevant `Flow.md`, and `AGENTS.md` updated.
2. **Mandatory DDD Task Gate**: Before implementing features or tasks, declare and enforce domain bounded context, ubiquitous language terms, and business invariants in domain logic.
3. **Strict Requirements**: Treat approved wants, must-not rules, non-goals, and acceptance criteria as binding requirements.
4. **Ask, Don't Guess**: Clarify ambiguous, stale, or contradictory intent with user. Never guess.
5. **Lead with Next Action**: Put single concrete next action (exact file path or command) first in status updates, `progress.md`, and `tasks.md`.
6. **ADHD Work Shaping**: Cap active tasks at 5, number single-bounded actions, include effort estimates `[X min]`, and format status as `Step X of Y done: <item>. Next: <action>`.
7. **Approval Boundary**: Obtain explicit user approval before mutating goals, scope, constraints, criteria, or lifecycle state. Silence is not approval.
8. **Source Provenance**: Register approved sources (`memory record`). Integrate claims with citations and contradiction notes (`references/maintenance.md`).
9. **Append-Only History**: Log semantic updates with evidence using deterministic CLI. Never rewrite `log.md`.
10. **Ultra-Compact Files**: Keep all `.memory/` documents minimal, telegraphic, high-density, and token-efficient.
11. **Safety & Validation**: Run `memory validate` after updates. Exclude secrets, `.env`, and build assets. No auto Git commits.
