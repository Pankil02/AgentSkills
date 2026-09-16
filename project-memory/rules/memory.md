# Project Memory rule

When `.memory/index.md` exists in a workspace:

1. **Selective On-Demand Retrieval**: Read `.memory/index.md` (< 4 KB master router). **NEVER load or read all `.memory/` files in bulk.** Read ONLY the single file needed for your immediate task:
   - Next task: Read `.memory/tasks.md` (or scope `agents.md`). Cap active tasks ≤ 5.
   - Code editing: Run `memory check --for-path <file>` first. Read ONLY the returned governing document. If on hold, STOP.
   - Domain invariants: Read `.memory/architecture/domain/Flow.md` (mandatory DDD gate).
   - Verification evidence: Read `.memory/progress.md`.
   - Keyword retrieval: Run `memory search <keywords>` for ranked BM25 snippets without loading entire documents.
2. **Mandatory DDD Task Gate**: Before implementing features, enforce domain bounded contexts, ubiquitous language, and business invariants in domain logic.
3. **Strict Requirements**: Treat approved wants, must-not rules, non-goals, and acceptance criteria as binding requirements.
4. **Ask, Don't Guess**: Clarify ambiguous, stale, or contradictory intent with user. Never guess.
5. **Lead with Next Action**: Put single concrete next action (exact file path or command) first in status updates, `progress.md`, `tasks.md`, and scope `agents.md`.
6. **ADHD Work Shaping**: Cap active tasks at 5, number single-bounded actions, include effort estimates `[X min]`, and format status as `Step X of Y done: <item>. Next: <action>`.
7. **Approval Boundary**: Obtain explicit user approval before mutating goals, scope, constraints, criteria, or lifecycle state. Silence is not approval.
8. **Source Provenance**: Register approved sources (`memory record`). Integrate claims with citations and contradiction notes (`references/maintenance.md`).
9. **Append-Only History**: Log semantic updates with evidence using deterministic CLI. Never rewrite `log.md`.
10. **Ultra-Compact Files**: Keep all `.memory/` documents minimal, telegraphic, high-density, and token-efficient.
11. **Safety & Validation**: Run `memory validate` after updates. Exclude secrets, `.env`, and build assets. No auto Git commits.
