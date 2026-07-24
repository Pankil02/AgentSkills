# AgentSkills 🧠⚡

A curated collection of specialized skills and extensions for AI coding agents (including **Google Antigravity**, **Pi**, **Claude Code**, **Kilo Code**, and **Gemini**).

---

## ⚡ Direct 1-Command Installation (`npx` / `bunx` / `pnpm`)

Anyone can directly install skills from this public repo into their agent's skills directory with a single terminal command:

### 🎮 Interactive Mode
Run the interactive installer to choose skills and target platform:
```bash
npx github:Pankil02/AgentSkills
```
*or with bun:*
```bash
bunx github:Pankil02/AgentSkills
```

---

### 🚀 Direct 1-Liner Quick Commands

#### Install All Skills to Google Antigravity / Gemini:
```bash
npx github:Pankil02/AgentSkills all --target antigravity
```

#### Install `project-memory` to Pi Agent:
```bash
npx github:Pankil02/AgentSkills project-memory --target pi
```

#### Install `software-design-patterns` to Claude Code:
```bash
npx github:Pankil02/AgentSkills software-design-patterns --target claude
```

#### Install to Current Project Workspace (`./.agents/skills`):
```bash
npx github:Pankil02/AgentSkills all --local
```

#### Install to a Custom Directory Path:
```bash
npx github:Pankil02/AgentSkills all --path /path/to/custom/skills
```

---

## 🛠️ Included Skills

| Skill | Description | Key Features |
| :--- | :--- | :--- |
| [**`project-memory`**](./project-memory) | Persistent Markdown project wiki for AI agents (`.memory/`). | • Ultra token-efficient wiki structure in `.memory/`<br>• CLI tools & native extensions for Pi/Antigravity/Kilo<br>• Structured goals, decisions, progress, & audit trails |
| [**`software-design-patterns`**](./software-design-patterns) | Pragmatic framework for selecting, applying, and reviewing software design patterns without overengineering. | • Problem-to-option decision mapping<br>• Zero-overengineering principle (no-pattern baseline)<br>• Language & framework agnostic guidance |

---

## 📁 Skill Details

### 1. `project-memory`
`project-memory` creates a durable, human-readable, and machine-parsable project wiki in `.memory/`. It prevents agents from losing context across sessions and ensures token-efficient persistence of project goals, progress, decisions, and history.

- **Supported Agents**: Google Antigravity, Pi Coding Agent, Kilo Code, Gemini, Claude Code
- **Key Concepts**:
  - `index.md`: Central discovery map for project memory.
  - `goal.md`: Approved requirements, non-goals, and current intent.
  - `progress.md`: Phase status, completed steps, and remaining tasks.
  - `log.md`: Append-only history of decisions, corrections, and milestones.

---

### 2. `software-design-patterns`
`software-design-patterns` provides explicit instructions for AI agents when evaluating software architecture, refactoring legacy code, or choosing design patterns (GoF, Domain-Driven, Concurrency, Distributed).

- **Core Workflow**:
  1. Inspect existing repository conventions and constraints.
  2. Frame problems in terms of forces (coupling, cohesion, volatility).
  3. Establish a no-pattern / minimal baseline before introducing abstractions.
  4. Compare candidates and choose the minimum sufficient pattern.
  5. Apply incremental changes with verification.

---

## 📄 License

This repository and its skills are open-source and licensed under the [MIT License](LICENSE).
