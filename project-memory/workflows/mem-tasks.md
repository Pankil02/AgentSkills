# Manage & Refresh Task List

Generate, format, or update `.memory/tasks.md` using `/i-have-adhd` principles and `project-memory` core principles.

1. Activate the `project-memory` skill and `/i-have-adhd` output rules. Read `.memory/index.md`, `.memory/goal.md`, `.memory/progress.md`, and `.memory/tasks.md`.
2. Extract active requirements (`REQ-xxx`), acceptance criteria (`AC-xxx`), and next actions from `.memory/`.
3. Format `.memory/tasks.md` following ADHD & Project Memory core principles:
   - **Lead with single next action**: State exact file path or command + concrete time estimate at the top of the file under `## Single next action`.
   - **Restate state**: Format current state under `## Current state` as `Step X of Y done: <completed item>. Next: <concrete single action>`.
   - **Cap active tasks at 5**: Maximum 5 active items under `## Active tasks (Do Now)`. Place remaining tasks under `## Backlog (Do Later)`.
   - **Numbered single-bounded steps**: Number each active task; avoid compound "and then" instructions.
   - **Concrete time estimates**: Include specific effort estimates in brackets `[X min]` for every task.
   - **Completed tasks summary**: Maintain a high-density short summary section at the bottom (`## Completed tasks summary`) listing total completed count, milestone highlights, and verified evidence.
   - **High-density & token-efficient**: Concise telegraphic style, no fluff or conversational boilerplate.
4. Save the updated `.memory/tasks.md` using `memory_apply` (in Pi) or atomic write / JSON plan.
5. Report updated tasks to user leading with the single next action to execute.
