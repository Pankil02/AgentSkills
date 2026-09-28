---
name: software-design-patterns
description: Enforces SOLID and the right design pattern for each coding problem, without overengineering. Use when writing, refactoring, or reviewing code that has growing conditionals, tight coupling, complex object construction, interface mismatches, undo/history, event fan-out, lifecycle states, tree structures, or cross-cutting wrappers; or when choosing GoF (creational/structural/behavioral), DDD, architecture, or distributed/resilience patterns. Skip for trivial one-off edits.
version: 2.0.0
author: Pankil
license: MIT
tags:
  - design-patterns
  - solid
  - low-level-design
  - architecture
  - refactoring
---

# Software Design Patterns

Mandatory design guidance while coding. Pick the smallest design that resolves a **proven** force. Load one reference file only when you need a pattern's details.

## Rules (enforced on every non-trivial change)

1. **Inspect first.** Read the surrounding code, tests, and conventions. Match the language's idioms (function > class where the language favors it).
2. **SOLID is the baseline** for all new or modified code → [references/solid.md](references/solid.md).
3. **Name the force before the pattern.** Every pattern must map to a symptom in the router below. No symptom → no pattern.
4. **Baseline first.** Try a plain function, lookup table, enum + `switch` with exhaustiveness, composition, or a native framework feature. Stop if it suffices.
5. **Rule of two.** Add an interface/abstraction only with ≥2 real implementations, a test seam, or a stable external boundary.
6. **Composition over inheritance.** Inherit only for true is-a with LSP holding.
7. **Domain names, not pattern names.** `PricingRule`, not `PricingStrategyFactoryManager`. Mention the pattern in a comment/PR only if it aids understanding.
8. **Refactor incrementally.** Tests green → introduce one seam → migrate callers → delete old path.
9. **When reviewing,** flag both missing patterns (symptom present) and unearned ones (pattern without symptom).

## Router: symptom → pattern

| Symptom in code | Baseline | Pattern (escalate) | Ref |
|---|---|---|---|
| `if/switch` on type/mode picks an algorithm; new variant = edit old code | function map | **Strategy** | B |
| Behavior changes by lifecycle status; transitions scattered | enum + transition table | **State** | B |
| Undo/redo, snapshots, rollback of object state | copy of value | **Memento** (+ Command) | B |
| Many objects must react when one changes | callback | **Observer** | B |
| Actions must be queued, logged, retried, undone, or scheduled | closure | **Command** | B |
| Same algorithm skeleton, few steps differ | higher-order function | **Template Method** | B |
| Traverse a collection without exposing its internals | native iterator/generator | **Iterator** | B |
| Many peers talk to each other (N×N coupling) | direct calls | **Mediator** | B |
| Request passes through ordered handlers (auth, validate, log) | sequential calls | **Chain of Responsibility** | B |
| New operations over a stable, closed type hierarchy | pattern match on ADT | **Visitor** | B |
| Evaluate a small rule/grammar language | parser lib | **Interpreter** | B |
| Exactly one shared instance is a real invariant | DI singleton scope | **Singleton** | C |
| Constructor with many optional params / staged validation | options object | **Builder** | C |
| Caller must not know which concrete class to create | named constructor | **Factory (Method)** | C |
| Families of related objects must match (UI theme, cloud vendor) | config object | **Abstract Factory** | C |
| Creation is expensive; clone a configured exemplar | spread/copy | **Prototype** | C |
| Third-party/legacy interface doesn't fit ours | translation fn | **Adapter** | S |
| Add responsibilities (cache, log, retry) without subclass explosion | wrapper fn | **Decorator** | S |
| Control access: lazy load, auth, cache, remote, rate limit | explicit wrapper | **Proxy** | S |
| Part–whole tree; treat leaf and group uniformly | recursive data | **Composite** | S |
| Complex subsystem needs one simple entry point | module function | **Facade** | S |
| Huge numbers of similar objects exhaust memory | shared constants | **Flyweight** | S |
| Two dimensions vary independently (shape × renderer) | composition | **Bridge** | S |
| Domain logic tangled with DB/HTTP/framework | module boundary | Ports & Adapters, Repository | A |
| Consistency across services / reliable events | local transaction | Outbox, Saga, Idempotency | A |
| Remote calls fail or cascade | timeout | Retry+jitter, Circuit Breaker, Bulkhead | A |

Ref: **B** [behavioral.md](references/behavioral.md) · **C** [creational.md](references/creational.md) · **S** [structural.md](references/structural.md) · **A** [architecture.md](references/architecture.md)

Confusable pairs & worked refactor: [references/decisions.md](references/decisions.md)

## Red flags (reject or refactor)

- Interface with one implementation and no test/boundary need.
- Class named `*Manager`, `*Helper`, `*Util` doing unrelated jobs (SRP violation).
- Global mutable Singleton used as a service locator.
- Deep inheritance (>2 levels) or subclasses that throw `NotSupported` (LSP violation).
- Growing `switch` duplicated in multiple places (missing Strategy/State/polymorphism).
- High-level code `new`-ing concrete I/O clients (DIP violation).
- Microservices, CQRS, event sourcing, or buses without a demonstrated scale/team force.

## Output contract

- Small change: apply the design, state the pattern (or "no pattern") in one sentence.
- Design/review: **Force** → **Choice** (+ 1 rejected alternative, why) → **Migration steps** → **Tests**.
