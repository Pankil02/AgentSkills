# Reflect Project Memory

Compare implementation reality with approved intent, preserve a usable handoff, or mark a goal complete.

1. Activate the `project-memory` skill. Read `.memory/index.md` and matching goals/progress.
2. If `complete` is passed (e.g. `/memory-reflect complete` or `/memory-reflect <scope> complete`):
   - Verify goal status is `verifying` and all acceptance criteria have linked verification evidence.
   - Request explicit user approval, update `goal.md` frontmatter `status: complete`, append history log event, and sync indexes.
3. Standard reflection (`/memory-reflect [scope]`):
   - Inspect session repository changes and verification evidence.
   - Compare work against approved goals, wants, must-not rules, decisions, and acceptance criteria.
   - Update progress, acceptance evidence, and history. Keep documents ultra-short and token-efficient.
   - Ensure every active unblocked scope has exactly one next action.
