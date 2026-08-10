# Software Design Patterns 🏛️⚡

A pragmatic, zero-overengineering decision framework and architecture guide for AI coding agents and software engineers.

---

## 🎯 Overview

`software-design-patterns` guides AI agents (and engineers) through selecting, applying, and reviewing software design patterns without introducing accidental complexity.

### Core Philosophy: **"No Pattern by Default"**
1. Patterns solve **demonstrated architectural forces**, not theoretical design goals.
2. Direct functions, plain modules, standard library types, or native framework features always beat named abstractions.
3. Every level of indirection must earn its right to exist through measurable separation of concerns or proven variance axes.

---

## 🚀 Installation

### Via Universal Interactive CLI:
```bash
npx github:Pankil02/AgentSkills install software-design-patterns --symlink
```

### Via `skills.sh` (Vercel):
```bash
npx skills@latest add Pankil02/AgentSkills --skill software-design-patterns
```

---

## 🧠 The Problem-to-Option Decision Map

| Observed Force | Start With (Baseline) | Escalate Only When |
| :--- | :--- | :--- |
| **Construction varies** | Named constructor / DI | **Factory Method**, **Abstract Factory**, **Builder**, **Object Pool** |
| **Algorithm varies** | Function / lookup table | **Strategy** (swappable algorithms), **Policy** (named decisions) |
| **Lifecycle state behavior** | Enum + transition function | **State** (complex state-specific transitions and operations) |
| **Interface mismatch** | Translation function | **Adapter**, **Anti-Corruption Layer (ACL)** |
| **Add optional behavior** | Explicit composition | **Decorator** (transparent, orderable wrappers) |
| **Complex subsystem** | Plain module / use-case fn | **Facade** (simplified stable entry boundary) |
| **Persistence in domain** | Direct CRUD / SQL | **Repository**, **Data Mapper**, **Unit of Work** |
| **Cross-boundary consistency**| Local ACID transaction | **Transactional Outbox**, **Saga** (compensating actions) |
| **Remote failure cascading** | Timeout / deadline | **Exponential Backoff Retry**, **Circuit Breaker**, **Bulkhead** |
| **System architecture** | Cohesive modules | **Modular Monolith** (escalate to Microservices only for organizational boundaries) |

---

## 🛠️ Operating Workflow for AI Agents

1. **Inspect First**: Read code, tests, contracts, configuration, and conventions before suggesting architectural changes.
2. **Frame in Forces**: Identify invariants, stable vs volatile behavior, coupling seams, and operational constraints.
3. **Establish Baseline**: Check if standard library or direct functions suffice. If yes, stop immediately.
4. **Compare Candidates**: Compare 2–3 options (including no-pattern). Reject unearned indirection.
5. **Incremental Seams**: Build 1 seam, migrate callers in small verifiable steps, and preserve existing tests.

---

## 📄 License

Licensed under the [MIT License](../LICENSE).
