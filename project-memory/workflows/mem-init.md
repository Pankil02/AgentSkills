# Initialize Project Memory

Create `.memory/` from a codebase scan, then fill it with observed facts only.

1. Load the `project-memory` skill.
2. Run `memory scan --json`. Show the candidate scopes and ask which to track (2-3 options, one marked (Recommended)).
3. Run `memory init --scope <path>` for each approved scope (or `memory init` for the project root only).
4. Read `.memory/index.md`, then `.memory/conventions.md`. From manifests, CI config, and READMEs, fill in:
   - Commands: exact build, test, and lint commands.
   - Rules: only rules the code or docs actually enforce (`MUST:` / `NEVER:` prefixes).
   - Pitfalls: known traps.
5. For each tracked scope, open only its `agents.md` and fill in Purpose (1 line) and Map.
6. Ask the user about anything you could not confirm: max 5 questions, 2-3 options each, one (Recommended).
7. Write through `memory apply` (rules need `approved: true` and the user's approval reason). Log one summary with `memory log --add --type note --title "Initialized memory"`.
8. Run `memory validate`.

Do not invent goals, tasks, or requirements.
