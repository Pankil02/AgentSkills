---
name: software-design-patterns
description: Selects, applies, refactors, and reviews software design patterns and architectures without overengineering. Use when designing boundaries or extensibility, untangling coupling or conditionals, choosing GoF/domain/data/concurrency/distributed patterns, comparing architectural styles, or reviewing pattern use, reliability, testability, and migration risk. Adapts guidance to the repository's language, framework, conventions, scale, deployment model, and operational constraints.
version: 1.1.0
author: Pankil
license: MIT
tags:
  - architecture
  - design-patterns
  - refactoring
  - anti-overengineering
  - best-practices
---

# Software Design Pattern Decisions

Patterns solve demonstrated forces, not design goals. Prefer minimal code preserving behavior. Direct functions, modules, stdlib types, or native framework features beat named patterns.

## Operating workflow

1. **Inspect first.** Read code, tests, contracts, config, boundaries, and conventions. Infer from evidence; don't ask unless blocked.
2. **Frame in forces.** Map invariants, stable vs varying behavior, change frequency, coupling/seams, ownership, latency/throughput, concurrency, failure modes, idioms, and operational constraints.
3. **Baseline (no pattern).** Check if direct code, function/module, stdlib, composition, or simple DI suffices. If yes, stop.
4. **Shortlist & compare.** Compare 2–3 options (including no-pattern). Reject unearned indirection.
5. **Minimum sufficient form.** State job in 1 sentence (boundary, owner, lifecycle). Use idiomatic names; avoid generic `Manager`/`Factory`/`Strategy` wrappers.
6. **Incremental change.** Keep public behavior. Add tests, build 1 seam, migrate callers in small steps, keep rollback options, and edit repo code directly.
7. **Verify.** Test happy/edge/failure paths (plus timeouts, cancellation, retries, backpressure, duplicates for async/distributed). Check telemetry and rollout.

## Problem-to-option map

| Observed force | Start with | Escalate only when |
|---|---|---|
| Construction varies | named constructor/factory/DI | **Factory Method** (creator seam), **Abstract Factory** (product families), **Builder** (staged/validated assembly), **Prototype** (cloning exemplars), **Object Pool** (scarce resources) |
| Algorithm/rule varies | function / lookup table | **Strategy** (swappable algorithms), **Policy** (named decisions), **Template Method** (stable inheritance skeleton) |
| Lifecycle state behavior | enum + transition fn | **State** (complex state-specific transitions/ops) |
| Interface mismatch | translation function | **Adapter** (interface bridge), **Anti-Corruption Layer** (isolate domain model from external domain) |
| Add optional behavior | explicit composition | **Decorator** (transparent, orderable wrappers) |
| Hard-to-use subsystem | use-case fn/module | **Facade** (simplified stable entry boundary) |
| Access/remoting/cache | explicit wrapper | **Proxy** (same interface contract; never mask remote I/O as local) |
| Part-whole hierarchy | recursive data / ADT | **Composite** (uniform operations on leaves & groups) |
| 2 independent variance axes | composition | **Bridge** (both axes vary independently) |
| Staged request flow | direct sequence | **Chain of Responsibility** (handlers route/stop), **Pipeline** (sequential stage transformations) |
| Decouple request/action | callback | **Command** (queue/undo/history), **Mediator** (peer coordination), async broker (cross-process) |
| Multi-dependent reactions | callbacks | **Observer** (in-process events), **Publish–Subscribe** (broker-decoupled spatial/temporal fan-out) |
| Persistence in domain | direct CRUD | **Repository** (aggregate queries), **Data Mapper** (object/record isolation), **Unit of Work** (transaction boundary) |
| Preserve domain invariants | validated values / fns | **Value Objects** & **Aggregate Root** (identity/lifecycle/transactional bounds) |
| Cross-boundary consistency | local transaction | **Outbox** (reliable pub), **Saga** (multi-service workflow + compensations/idempotency); avoid 2PC unless forced |
| Asymmetric read/write | single service/model | **CQRS** (demonstrated read/write scale, schema, or security divergence) |
| Remote failure cascading | timeout / deadline | **Retry** (jittered/bounded), **Circuit Breaker** (stop dead calls), **Bulkhead** (isolate pool capacity) |
| Concurrency coordination | ownership + immutability | Bounded queue, actor, lock/semaphore, optimistic/pessimistic lock, leader election |
| Unclear architecture | cohesive modules | Layered/ports boundaries; default **Modular Monolith** over microservices unless team/deployment boundaries force it |

## Decision gates

- **No pattern:** Default. Use when 1 implementation exists, no change axis proven, local logic clearer, or framework handles lifecycle.
- **Interfaces:** Use for real substitution, stable boundaries, or test isolation—never 1 per class. Prefer functions, protocols, traits, or ADTs.
- **Inheritance:** Requires strict LSP substitutability. Prefer composition for optional behavior.
- **Singleton:** Process scope != cluster scope. Prefer injected lifetime; use Singleton only when cardinality is a domain invariant.
- **Microservices:** Require independent scaling/deployment, team boundaries, data isolation, and operational maturity. Code size alone is invalid proof.
- **Events:** Use for domain facts and fan-out, not hiding call graphs. Define schemas, delivery, ordering, idempotency, and tracing first.
- **CQRS / Event Sourcing:** Independent choices. Neither is default; both add model complexity, lag, migration, and operational work.
- **Resilience:** Start with deadlines, bounded resources, and idempotency. Unbudgeted retries amplify outages.

## Implementation rules

- Direct dependencies toward stable domain logic. Isolate I/O, framework, clock, and external clients behind narrow boundaries.
- Preserve full semantic contracts (error handling, ordering, transactions, auth, cancellation, nullability, timing, serialization).
- Define state/resource ownership. Bound queues, caches, pools, retries, and subscriptions; define cleanup/shutdown.
- Prefer immutable values and pure logic. Avoid unnecessary object copying or paradigm forcing.
- Reuse framework features before building custom containers, buses, iterators, middleware, or pools.
- Name by domain intent. Pattern names belong in ADRs; use pattern role names in code only when clarifying domain responsibility.
- Require abstractions to have an active caller, a credible 2nd implementation, and lower test/change cost. Otherwise delete.

## Response contract

For non-trivial design/review:
1. **Forces & assumptions:** Evidence, invariants, constraints, change axes.
2. **Decision:** Chosen pattern or "no pattern", scope, rationale.
3. **Alternatives rejected:** 1–2 options and why they fail or add cost.
4. **Implementation & migration:** Dependency direction, ownership, steps, compatibility.
5. **Verification & ops:** Tests, failure modes, telemetry, rollout/rollback.

For small changes, summarize in 2–3 sentences.

## Progressive reference loading

Read catalog before implementing:

- GoF & object patterns: [references/object-patterns.md](references/object-patterns.md)
- Architecture patterns: [references/architecture-patterns.md](references/architecture-patterns.md)
- DDD & data boundaries: [references/domain-data-patterns.md](references/domain-data-patterns.md)
- Distributed & concurrency: [references/distributed-concurrency.md](references/distributed-concurrency.md)
- Pattern comparisons: [references/comparisons.md](references/comparisons.md)
- Review & refactoring playbook: [references/review-playbook.md](references/review-playbook.md)
- Worked examples: [examples/README.md](examples/README.md)
- ADR template: [assets/adr-template.md](assets/adr-template.md)
- Further reading & sources: [references/further-reading.md](references/further-reading.md)
- Coverage index: [references/coverage-index.md](references/coverage-index.md)


