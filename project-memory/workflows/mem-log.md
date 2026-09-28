# Log Session Work

Record what this session changed, fixed, found, or decided. Future agents read these entries instead of re-deriving history.

1. Load the `project-memory` skill.
2. Review this session's changes (`git diff --stat` if available). To avoid duplicates, read only `memory log --recent 5`.
3. For each meaningful change, run:
   `memory log --add --type <change|fix|finding|note> --title "<≤10 words>" --summary "<what + why, 1 line>" --files <path>`
4. A durable choice was made (library, pattern, boundary, data shape, trade-off)?
   - Ask the user: 2-3 options, each with a one-line trade-off, the recommended one first and marked (Recommended).
   - After approval: `memory decide --title … --decision … --rejected "<option>: <flaw>" --approval "<user's words>"`.
5. A rule or pitfall was learned? Propose the exact one-line addition to `conventions.md` or the scope's `agents.md`, and ask before writing.
6. Skip trivial edits. Never log secrets or raw prompts.
