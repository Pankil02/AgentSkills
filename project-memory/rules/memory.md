# Project Memory rule

When `.memory/index.md` exists in a workspace:

1. **Read Index First**: Read `.memory/index.md` before broad repo exploration or memory edits. Keep `.memory/index.md` and root `AGENTS.md` updated.
2. **Strict Requirements**: Treat approved wants, must-not rules, non-goals, and acceptance criteria as binding requirements.
3. **Ask, Don't Guess**: Clarify ambiguous, stale, or contradictory intent with user. Never guess.
4. **Lead with Next Action**: Put single concrete next action (exact file path or command) first in status updates, `progress.md`, and `tasks.md`.
5. **ADHD Work Shaping**: Cap active tasks at 5, number single-bounded actions, include effort estimates `[X min]`, and format status as `Step X of Y done: <item>. Next: <action>`.
6. **Approval Boundary**: Obtain explicit user approval before mutating goals, scope, constraints, criteria, or lifecycle state. Silence is not approval.
7. **Source Provenance**: Register approved sources (`memory record`). Integrate claims with citations and contradiction notes (`references/maintenance.md`).
8. **Append-Only History**: Log semantic updates with evidence using deterministic CLI. Never rewrite `log.md`.
9. **Ultra-Compact Files**: Keep all `.memory/` documents minimal, telegraphic, high-density, and token-efficient.
10. **Safety & Validation**: Run `memory validate` after updates. Exclude secrets, `.env`, and build assets. No auto Git commits.
