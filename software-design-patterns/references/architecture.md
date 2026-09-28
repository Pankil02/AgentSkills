# Architecture, Domain & Distributed Patterns

Load only when change crosses module/process boundaries. Default: **modular monolith with clean boundaries**.

## Boundaries
| Pattern | Use when | Avoid when |
|---|---|---|
| **Layered** (UI → app → domain → infra) | typical CRUD/business apps | layers become pass-through |
| **Ports & Adapters / Clean / Onion** | domain logic must be isolated from DB/HTTP/frameworks; many adapters | tiny scripts, pure CRUD |
| **Modular Monolith** | default for one team/product; modules own data & API | — |
| **Microservices** | independent deploy/scale per team, data isolation, ops maturity | code size is the only reason |
| **Event-Driven** | fan-out of domain facts, temporal decoupling | hiding a synchronous call graph |
| **CQRS** | read/write models diverge in scale/shape/security | ordinary CRUD |
| **Event Sourcing** | audit/replay of every change is a requirement | default persistence |
| **Strangler Fig** | incremental migration off legacy | greenfield |
| **MVC / MVP / MVVM** | separate UI view from logic; use framework's native one | inventing your own |

## Domain (DDD) & data
- **Entity:** identity + lifecycle. **Value Object:** immutable, equality by value (`Money`, `Email`); validates on creation.
- **Aggregate Root:** consistency boundary; external code modifies only via root; one aggregate per transaction.
- **Domain Service:** logic spanning entities. **Application Service:** orchestrates use case, transactions, auth.
- **Domain Event:** past-tense fact (`OrderPlaced`).
- **Repository:** collection-like access to aggregates; interface in domain, impl in infra. **DAO:** table-level access. **Unit of Work:** one commit for many changes (usually your ORM).
- **DTO:** boundary data shape; never leak ORM entities through APIs.
- **Anti-Corruption Layer:** adapter set translating an external model into yours.
- **Specification:** composable business predicates (`isEligible.and(isActive)`).

## Distributed consistency
- **Idempotency key:** required for any retried or at-least-once operation.
- **Transactional Outbox:** write state + event in one local transaction; relay publishes. Never dual-write DB + broker.
- **Saga:** multi-service workflow with compensating actions (orchestrated or choreographed). Avoid 2PC unless forced.
- **Queues:** Producer–Consumer / Competing Consumers with bounded buffers, backpressure, and a **Dead-Letter Queue**.

## Resilience (apply in this order)
1. **Timeout/deadline** on every remote call.
2. **Retry** with exponential backoff + jitter, bounded, only for idempotent ops.
3. **Circuit Breaker:** stop calling a failing dependency; half-open probe.
4. **Bulkhead:** isolate pools/concurrency per dependency.
5. **Rate limiting** (token bucket) at admission; **Cache-Aside** with TTL + invalidation plan.

## Concurrency
- Prefer immutability and single ownership → message passing (actors/channels) → locks last.
- **Optimistic locking** (version column) for low contention; **pessimistic** for high contention hot rows.
- Bound every pool, queue, cache, and retry; define shutdown/cancellation (structured concurrency).
