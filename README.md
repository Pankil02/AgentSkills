# AgentSkills 🧠⚡

A curated collection of specialized skills and extensions for AI coding agents (including Google Antigravity, Pi, Kilo Code, and Gemini). 

These skills empower AI agents with structured decision-making, durable project memory, and architectural design capabilities.

---

## 🛠️ Included Skills

| Skill | Description | Key Features |
| :--- | :--- | :--- |
| [**`project-memory`**](./project-memory) | Persistent linked Markdown project wiki for tracking project state, goals, decisions, and history. | • Ultra token-efficient wiki structure in `.memory/`<br>• CLI tools & native extensions for Pi/Antigravity/Kilo<br>• Structured goals, decisions, progress, & audit trails |
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

## 🚀 Installation & Usage

Copy or link the desired skill directory (`project-memory` or `software-design-patterns`) into your agent's skills directory:

- **Google Antigravity**: `~/.gemini/config/skills/`
- **Pi Agent**: `~/.pi/skills/`
- **Kilo Code / Custom Agents**: Configure path to skill directory.

---

## 📄 License

This repository and its skills are open-source and licensed under the [MIT License](LICENSE).
