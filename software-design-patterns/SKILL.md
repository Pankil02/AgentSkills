---
name: software-design-patterns
description: Selects, applies, refactors, and reviews software design patterns and architectures without overengineering. Use when designing boundaries or extensibility, untangling coupling or conditionals, choosing GoF/domain/data/concurrency/distributed patterns, comparing architectural styles, or reviewing pattern use, reliability, testability, and migration risk. Adapts guidance to the repository's language, framework, conventions, scale, deployment model, and operational constraints.
metadata:
  version: "1.1.0"
---

# Software Design Pattern Decisions

Patterns are optional responses to demonstrated forces, not goals. Prefer the smallest design that preserves behavior and leaves the likely change cheap. A function, data structure, module, framework feature, or direct call often beats a named pattern.

## Operating workflow

1. **Inspect before prescribing.** Read the affected code, tests, public contracts, dependency/configuration style, persistence and deployment boundaries, and nearby conventions. Do not redesign from a prompt alone when the repository can answer it.
2. **Frame the problem in forces.** Establish:
   - required behavior and invariants; what varies, what must remain stable, and how often each changes;
   - current coupling/cohesion problem and the concrete extension or test seam needed;
   - ownership and trust boundaries; consistency, latency, throughput, ordering, concurrency, security, and failure constraints;
   - language/framework idioms, compatibility promises, team/operational capacity, and migration limits.
3. **Establish the no-pattern baseline.** Try direct code, a focused function/module, a standard-library abstraction, composition, or explicit dependency injection. If that satisfies known requirements, stop.
4. **Shortlist, then compare.** Consider two or three plausible options from the map below, including “no new pattern.” Reject options whose extra indirection does not pay for itself now.
5. **Choose the minimum sufficient form.** State the pattern's job in one sentence and identify its boundary, owner, dependencies, and lifecycle. Apply roles idiomatically; do not manufacture classes named `Manager`, `Factory`, or `Strategy` merely to resemble a diagram.
6. **Change incrementally.** Preserve public behavior unless change is requested. Add characterization/contract tests, create one seam, migrate callers in small slices, and retain a rollback path. Avoid speculative rewrites and pattern stacking. When asked to implement, edit the repository rather than stopping at a diagram or generic sketch; follow its formatting, validation, and test commands.
7. **Verify consequences.** Test normal, edge, and failure paths. For async/distributed work also test timeout, cancellation, duplicate, reordering, retry exhaustion, partial failure, backpressure, and recovery as applicable. Check observability and rollout impact.

Ask only questions that block a safe decision; otherwise infer from evidence and label assumptions.

## Problem-to-option map

| Observed force | Start with | Escalate only when |
|---|---|---|
| Construction varies | named constructor/simple factory or DI | **Factory Method** for a creator extension point; **Abstract Factory** for compatible families; **Builder** for staged/validated construction; **Prototype** for configured copies; **Object Pool** for measured scarce-resource reuse |
| Algorithm or rule varies | function/lookup table | **Strategy** for interchangeable mechanisms; **Policy** for named decisions; **Template Method** only with a stable inheritance skeleton |
| Behavior follows lifecycle state | enum + small transition function | **State** when state-specific operations/transitions are substantial |
| Existing interface does not fit | translation function | **Adapter**; use an **Anti-Corruption Layer** when an external model must not enter the domain |
| Add optional responsibilities | explicit composition | **Decorator** for transparent, orderable wrappers |
| Subsystem is hard to use | focused use-case function/module | **Facade** for a stable simplified boundary |
| Control access/lifecycle/remoting/cache | explicit wrapper | **Proxy** when clients retain the subject contract; do not pretend remote calls are local |
| Part-whole hierarchy | recursive data/ADT | **Composite** when leaves and groups need uniform operations |
| Two dimensions vary independently | composition | **Bridge** when both axes are real and growing |
| Request passes ordered stages | direct sequence | **Chain of Responsibility** when a handler may stop/route; **Pipeline** when stages normally all transform/process |
| Decouple action request from performer | callback | **Command** for queueing, history, scheduling, serialization, or undo; **Mediator** for coordinated peer interactions; messaging across process/time boundaries |
| Multiple dependents react | callbacks | **Observer** in-process with subject-known subscriptions; **Publish–Subscribe** through a topic/broker for stronger spatial or temporal decoupling |
| Persistence leaks into domain | direct data access for simple CRUD | **Repository** for aggregate-oriented access, **Data Mapper** for object/record independence, **Unit of Work** for an explicit commit boundary |
| Preserve domain invariants | validated values and focused functions | **Value Objects** and an **Aggregate Root** when identity, lifecycle, and transactional invariants justify them |
| Cross-boundary consistency | one local transaction | **Outbox** for reliable publication, **Saga** for multi-service business transactions, plus idempotency and compensations; distributed transactions only in a controlled supported environment |
| Reads and writes have different needs | one model/service | **CQRS** only for independently demonstrated model, scale, security, or latency asymmetry |
| Repeated remote failure threatens capacity | timeout/deadline | bounded **Retry** for transient failures, **Circuit Breaker** to stop futile calls, **Bulkhead** to contain exhaustion |
| Concurrent work needs coordination | ownership + immutable data | bounded queue, actor, lock/semaphore, optimistic/pessimistic locking, or leader election according to the actual shared resource |
| System boundary/architecture is unclear | cohesive modules | layered or ports-based boundaries; default to a **Modular Monolith** unless independent deployment and data ownership repay distributed-systems cost |

## Decision gates

- **No pattern:** choose it when there is one implementation, no demonstrated change axis, a local conditional is clearer, or the framework already owns the lifecycle.
- **Interfaces:** add one for real substitution, a stable boundary, independent testing, or dependency inversion—not one per class. Structural typing, protocols, functions, traits, or algebraic data types may be the idiomatic abstraction.
- **Inheritance:** require a true substitutable relationship and stable base contract. Prefer composition for optional behavior or independently varying axes.
- **Singleton:** process-local uniqueness is not cluster-wide uniqueness. Prefer an explicitly owned instance with injected lifetime; use a singleton only when cardinality itself is an invariant.
- **Microservices:** require independent deployment/scaling/failure or team ownership, explicit data ownership, and operational maturity. Codebase size alone is not evidence.
- **Events:** use events for facts and genuine fan-out/temporal decoupling, not to hide a simple call graph. Define schema ownership, delivery semantics, ordering scope, idempotency, and tracing first.
- **CQRS/Event Sourcing:** they are independent choices. Neither is a default route to “scalability”; each adds models, consistency lag, migration, and operational work.
- **Distributed resilience:** begin with deadlines, bounded resources, and idempotency. Retries without budgets/backoff can amplify an outage.

## Implementation rules

- Keep dependencies explicit and directed toward stable policy/domain code. Put I/O, frameworks, clocks, randomness, and external clients behind the narrowest useful boundary.
- Preserve semantic contracts: errors, ordering, transactions, authorization, cancellation, nullability, timing assumptions, and serialization—not only method signatures.
- Assign state and resource ownership. Bound queues, caches, histories, pools, retries, and subscriber lifetimes; define cleanup and shutdown.
- Prefer immutable values and pure decision logic where useful, but do not copy large graphs blindly or force functional/OO style against the codebase.
- Reuse native framework mechanisms before recreating containers, event buses, iterators, middleware, pools, or state stores.
- Name by domain responsibility. Mention the pattern in the rationale or architecture record; role names in code are useful only when they clarify the domain.
- Every new abstraction needs a current caller, a credible second variation or boundary, and a cheaper test/change story. Otherwise remove it.

## Response contract

For a non-trivial design or review, communicate compactly:

1. **Forces/assumptions** — evidence, invariants, constraints, and the change axis.
2. **Decision** — selected pattern or “no pattern,” its scope, and why it is the simplest fit.
3. **Alternatives rejected** — usually one or two, with the force they fail or cost they add.
4. **Implementation/migration** — dependency direction, ownership, incremental steps, compatibility plan.
5. **Verification/operations** — tests, failure modes, telemetry, rollout and rollback.

For a small code change, fold this into a few sentences rather than producing an architecture essay.

## Load references progressively

Read only what the task needs, but read the relevant catalog before implementing. For a large file, locate the matching heading and read that section plus any linked comparison instead of loading unrelated entries:

- Object collaboration and all GoF patterns: [references/object-patterns.md](references/object-patterns.md)
- System, UI, deployment, and evolutionary architecture: [references/architecture-patterns.md](references/architecture-patterns.md)
- DDD and persistence boundaries: [references/domain-data-patterns.md](references/domain-data-patterns.md)
- Concurrency, messaging, distributed consistency, and resilience: [references/distributed-concurrency.md](references/distributed-concurrency.md)
- Commonly confused choices: [references/comparisons.md](references/comparisons.md)
- Refactoring, testing, review, and anti-pattern correction: [references/review-playbook.md](references/review-playbook.md)
- Worked coding and architecture decisions: [examples/README.md](examples/README.md)
- Architecture decision record: [assets/adr-template.md](assets/adr-template.md)
- Sources and maintenance guidance: [references/further-reading.md](references/further-reading.md)
- Coverage/classification audit (not normally needed at runtime): [references/coverage-index.md](references/coverage-index.md)
