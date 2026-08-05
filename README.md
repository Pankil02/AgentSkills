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

> 💡 **Auto-Update Tip**: Pass `--symlink` (or `-s`) to create symbolic links. Any future `git pull` in this repo will automatically update your installed skills!

#### Install All Skills to Google Antigravity / Gemini (with Auto-Updates):
```bash
npx github:Pankil02/AgentSkills all --target antigravity --symlink
```

#### Install `project-memory` to Pi Agent:
```bash
npx github:Pankil02/AgentSkills project-memory --target pi --symlink
```

#### Install `software-design-patterns` to Claude Code:
```bash
npx github:Pankil02/AgentSkills software-design-patterns --target claude --symlink
```

#### Install to Current Project Workspace (`./.agents/skills`):
```bash
npx github:Pankil02/AgentSkills all --local --symlink
```

#### Install to a Custom Directory Path:
```bash
npx github:Pankil02/AgentSkills all --path /path/to/custom/skills --symlink
```

---

## 🛠️ Included Skills

| Skill | Description | Key Features |
| :--- | :--- | :--- |
| [**`project-memory`**](./project-memory) | Persistent Markdown project wiki for AI agents (`.memory/`). A polished, next-gen evolution of Google OKF & LLM Wiki architectures. | • Polished, superior evolution of Google OKF & LLM Wiki<br>• Automatic codebase deep-scan & ingestion on `memory init`<br>• Short, token-efficient codebase treemap with 1-line notes in `index.md`<br>• Ultra token-efficient wiki structure in `.memory/`<br>• CLI tools & native extensions for Pi/Antigravity/Kilo<br>• Structured goals, decisions, progress, & audit trails |
| [**`software-design-patterns`**](./software-design-patterns) | Pragmatic framework for selecting, applying, and reviewing software design patterns without overengineering. | • Problem-to-option decision mapping<br>• Zero-overengineering principle (no-pattern baseline)<br>• Language & framework agnostic guidance |

---

## 📁 Skill Details

### 1. `project-memory`
`project-memory` is a polished, enterprise-grade evolution of **Google OKF (Open Knowledge Format)** and **LLM Wiki** concepts. It creates a durable, human-readable, and machine-parsable project wiki in `.memory/`, offering superior token efficiency, atomic write operations, and zero context drift across sessions.

- **Supported Agents**: Google Antigravity, Pi Coding Agent, Kilo Code, Gemini, Claude Code
- **Key Concepts**:
  - `index.md`: Central discovery map for project memory, including an automatic token-efficient codebase treemap.
  - `goal.md`: Approved requirements, auto-ingested tech stack, non-goals, and current intent.
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
