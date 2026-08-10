# AgentSkills 🧠⚡

[![CI/CD Pipeline](https://github.com/Pankil02/AgentSkills/actions/workflows/ci.yml/badge.svg)](https://github.com/Pankil02/AgentSkills/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Skills.sh Compatible](https://img.shields.io/badge/skills.sh-compatible-00D9FF.svg)](https://skills.sh)
[![Agents Guide](https://img.shields.io/badge/AGENTS.md-Architecture%20Guide-purple.svg)](./AGENTS.md)

Enterprise-grade CLI and curated skills ecosystem for AI coding agents (**Google Antigravity**, **Claude Code**, **Cursor**, **Pi**, **Codex**, **OpenCode**, **Gemini CLI**, **Zed**, and **Warp**).

> 🤖 **Working as an AI Agent in this repository?** Read [**`AGENTS.md`**](./AGENTS.md) for master architecture specifications, path resolution rules, and development guidelines.

---

## ⚡ Quick Start

### 🎮 Option 1: Universal Interactive Wizard (Recommended)
Run the interactive terminal wizard to visually configure scopes, agents, and skills with symlink/copy options:

```bash
# Using npx (from GitHub directly)
npx github:Pankil02/AgentSkills

# Or using bunx
bunx github:Pankil02/AgentSkills
```

---

### 🌐 Option 2: Install via `skills.sh` (Vercel Labs Ecosystem)
This repository is 100% compliant with the `skills.sh` standard. You can install directly via Vercel's `skills` CLI:

```bash
npx skills@latest add Pankil02/AgentSkills
```

To install a specific individual skill:
```bash
npx skills@latest add Pankil02/AgentSkills --skill project-memory
```

---

## 🚀 Direct Headless & CI/CD Commands

Pass flags to automate installations in scripts or CI/CD pipelines without prompts:

| Goal | Command |
| :--- | :--- |
| **All Skills to Google Antigravity & Gemini** | `npx github:Pankil02/AgentSkills install all --target antigravity --symlink -y` |
| **Install `project-memory` to Pi Agent** | `npx github:Pankil02/AgentSkills install project-memory --target pi --symlink -y` |
| **Install to Claude Code** | `npx github:Pankil02/AgentSkills install all --target claude --symlink -y` |
| **Install to Current Workspace (`.agents/skills`)** | `npx github:Pankil02/AgentSkills install --scope project --symlink -y` |
| **Dry-Run (Simulate JSON output)** | `npx github:Pankil02/AgentSkills install all --target antigravity --dry-run --json` |
| **Run Diagnostic Health Check** | `npx github:Pankil02/AgentSkills doctor` |
| **Validate All `SKILL.md` Schemas** | `npx github:Pankil02/AgentSkills validate` |

---

## 🛠️ CLI Reference

```
Usage: agent-skills [command] [options]

Commands:
  install, add [skills...]   Install skills (interactive if no flags provided)
  list, ls                 List all available skills in this repository
  doctor, check            Run system diagnostics & verify agent environments
  validate                 Validate all SKILL.md files against schema
  uninstall, remove        Remove skills from target agent directory
  help                     Show help documentation

Options:
  --scope <project|global> Installation scope (default: project)
  --target <agent>         Target agent (universal, antigravity, claude, cursor, pi, codex, warp, zed, all)
  -s, --symlink            Use symbolic links (auto-updates with git pull)
  --copy                   Copy files instead of symlinking
  -y, --yes                Non-interactive auto-confirm (for CI/CD)
  --dry-run                Simulate installation without writing to disk
  --json                   Output results in machine-readable JSON format
  --backup                 Create timestamped backup if skill already exists
```

---

## 📦 Included Skills

| Skill | Description | Supported Agents |
| :--- | :--- | :--- |
| [**`project-memory`**](./project-memory) | Persistent Markdown project wiki for AI agents (`.memory/`). A polished, token-efficient evolution of Google OKF & LLM Wiki architectures. | Antigravity, Claude Code, Cursor, Pi, Codex, Gemini |
| [**`software-design-patterns`**](./software-design-patterns) | Pragmatic decision-tree framework for selecting, applying, and reviewing software design patterns without overengineering. | All AI Coding Agents |

---

## 🤖 Supported Agent Platforms & Paths

| Agent | Global Directory | Project Workspace Directory |
| :--- | :--- | :--- |
| **Universal (Industry Standard)** | `~/.agents/skills` | `.agents/skills` |
| **Google Antigravity / Gemini** | `~/.gemini/config/skills` | `.agents/skills` |
| **Claude Code** | `~/.claude/skills` | `.claude/skills` |
| **Cursor** | `~/.cursor/skills` | `.cursor/skills` |
| **Pi Coding Agent** | `~/.pi/skills` | `.pi/skills` |
| **Codex / OpenCode** | `~/.codex/skills` | `.agents/skills` |
| **Zed Editor** | `~/.config/zed/skills` | `.zed/skills` |
| **Warp Terminal** | `~/.warp/skills` | `.agents/skills` |

---

## 🧪 Development & Quality Assurance

```bash
# Install dependencies
npm install

# Run test suite
npm test

# Run diagnostics
npm run doctor

# Validate SKILL.md schemas
npm run validate
```

---

## 📄 License

This repository is open-source and licensed under the [MIT License](LICENSE).
