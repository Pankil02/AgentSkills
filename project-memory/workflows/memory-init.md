# Initialize Project Memory

Create the persistent `.memory/` wiki and conduct project or feature goal interviews.

1. Activate the `project-memory` skill and read its initialization and interview rules.
2. If `.memory/` is not initialized:
   - Run `memory scan --json`. If `memory` is unavailable, run the skill's `scripts/memory.mjs` with Node 20 or newer.
   - Show proposed tracked scopes and ask the user which feature scopes to track.
   - Run `memory init` with approved `--scope` parameters. `AGENTS.md` is created or ingested automatically.
3. Conduct the interactive **Grill-Me style** (one question at a time, interactive UI, recommended defaults) multi-round (3–4 stage minimum) interview:
   - **Grill-Me Rules:** Ask questions ONE AT A TIME using interactive UI selection tools (`memory_ask` or `ask_question`). Provide a recommended option prefixed with `(Recommended)`. Walk down each branch of the design tree sequentially.
   - **Mandatory Round 1 Questions:**
     1. Is this a **new standalone feature** or an **add-on feature** to an existing system?
     2. Should a **new folder/scope directory** be created for this, or use an **existing folder**?
     3. What specific **design patterns** (e.g. Repository, Factory, Strategy, MVC, CQRS, Clean Architecture) and repository structure should be used before implementing?
   - **Round 2 & 3+:** Ask 5–10 follow-up clarifying questions based on answers, followed by final refinement questions until 100% crystal clear. Save answers incrementally with `memory_apply`.
4. Run `memory validate` and ensure all documents remain ultra-short, compact, and token-efficient.
