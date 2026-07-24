# Implementation, Refactoring, and Review Playbook

## Evidence-first review

1. **Map behavior:** public APIs, callers, invariants, state ownership, transactions, side effects, errors, timing/order, and compatibility tests.
2. **Map dependencies:** module cycles, concrete construction, framework/ORM/vendor leakage, call fan-out, shared data, and deployment boundaries.
3. **Locate change pain:** cite duplicated edits, repeated conditionals, unstable dependencies, untestable I/O, contention, or observed incidents. A pattern name alone is not evidence.
4. **Recognize existing design:** describe roles by intent. Partial/idiomatic forms can be correct; do not demand textbook participant classes.
5. **Compare minimum fixes:** simplify/delete first, then local extraction/composition, then a named pattern, then architectural redistribution only if forces require it.
6. **Prioritize:** correctness/security/data loss and reliability first; active change cost second; speculative extensibility last.

Do not manufacture findings. A direct constructor, conditional, concrete type, missing `undo`, immutable Strategy, or model without methods is not automatically defective.

## Idiomatic implementation

| Context | Prefer | Avoid |
|---|---|---|
| Functional | functions, closures, ADTs, exhaustive pattern matching, folds, effect boundaries | class hierarchies copied from GoF diagrams |
| Dynamic language | duck/protocol contracts, modules, first-class functions, focused runtime checks | empty interfaces/base classes and metaprogramming without need |
| Statically typed OO | narrow interfaces at substitution/boundaries, sealed types for closed variants, constructor injection | interface-per-class and inheritance for reuse |
| Concurrent/async | immutable messages, structured task ownership, bounded channels, runtime-native primitives | hidden fire-and-forget, blocking event loops, custom locks/queues |
| Framework code | built-in DI, middleware, events, routers, serializers, state/lifecycle hooks | parallel home-grown containers/buses/lifecycles |
| Persistence | explicit transaction/query shape, real-engine integration tests | ORM leakage into domain solely for convenience, generic CRUD wrappers |

Use composition without insisting on a class: a higher-order function can be Decorator, a callback can be Strategy/Factory Method, a sum type plus transition function can be State, and a generator can be Iterator.

## Safe incremental recipes

### Repeated behavior conditional

1. Characterize every branch, including errors and defaults.
2. If variants are few/stable and local, consolidate into one switch/table and stop.
3. If variants truly change independently, extract one function/handler per cohesive behavior.
4. Introduce Strategy/Policy/State only after the common input/output contract is visible.
5. Move selection to one composition boundary; migrate one caller at a time; delete duplicate switches.

### External/legacy integration

1. Freeze a consumer-owned port and contract tests around required semantics.
2. Put vendor types, retries, pagination, error codes, and mapping in an Adapter/ACL.
3. Run old/new adapters in shadow or compare mode where safe.
4. Switch at composition/configuration; retain rollback; remove old translation after observation.

### Monolith-to-service extraction

1. Establish a cohesive module and owner before a process boundary.
2. Stop direct cross-module writes; expose a coarse API and assign data ownership.
3. Measure call/data coupling and operational reason for extraction.
4. Route one vertical capability with Strangler Fig; migrate data with reconciliation and rollback.
5. Add timeouts, idempotency, telemetry, and independent deployability; avoid a networked shared-database module.

### Reliable event publication

1. Define a stable fact, owner, event ID, partition/ordering scope, and consumer contract.
2. Persist state and Outbox record atomically.
3. Relay with duplicate-safe publication; consumers deduplicate/idempotently apply.
4. Bound retries, route poison messages to an owned DLQ, and instrument lag/recovery.

## Boundary and dependency checklist

- [ ] Boundary has one cohesive reason to change and an owner.
- [ ] Contract uses caller/domain language, not leaked framework/vendor/storage types.
- [ ] Dependencies point toward stable policy; composition/wiring stays at the edge.
- [ ] State, resources, subscriptions, threads/tasks, and transaction lifetime have one explicit owner.
- [ ] Errors, null/absence, ordering, concurrency, cancellation, and cleanup semantics are part of the contract.
- [ ] Every queue/cache/pool/history/retry/fan-out is bounded and has overload/expiry behavior.
- [ ] Security/trust validation occurs at boundaries; authorization remains enforced by the resource owner.
- [ ] New abstraction has a current use, a real variant/boundary, and a cheaper test/change story.
- [ ] Public behavior and migration compatibility are preserved or intentionally versioned.
- [ ] Naming describes domain responsibility; comments/ADR capture the pattern decision and trade-off.

## Verification matrix

| Risk | Test/evidence |
|---|---|
| Preserve legacy behavior | characterization/golden-master tests around observable contract, then differential old/new checks |
| Algorithm/policy | table, boundary, property/metamorphic tests; one suite reused across Strategies where laws match |
| Adapter/proxy/repository/plugin | consumer-driven contract suite run against each implementation; real vendor/database sandbox where semantics matter |
| Builder/value/aggregate | invalid construction, invariant and property tests; no partial state escapes |
| State/workflow/Saga | transition table including illegal events, timeout, duplicate, compensation failure, restart/recovery |
| Decorator/chain/pipeline | ordering, short-circuit, error propagation, cleanup, and composition tests |
| Observer/events/messages | unsubscribe, reentrancy, slow/failing subscriber; duplicate, reorder, replay, schema compatibility, DLQ/redrive |
| Persistence | real-engine constraints, isolation/conflicts, query count, precision/time zones, rollback, migrations |
| Concurrency | deterministic coordination where possible, stress/race tooling, cancellation/shutdown, capacity bounds; stress alone is not a proof |
| Resilience | fault injection for latency, timeout, retry budget, half-open breaker, saturation, stale cache, partial dependency loss |
| Architecture | dependency/static rules, module API tests, ownership/schema checks, deploy/rollback exercise, operational SLO evidence |

Test observable promises, not pattern scaffolding. Avoid asserting that a particular role is a class unless that is itself a public extension contract.

## Operational review

For networked or asynchronous changes, explicitly answer:

- What is the end-to-end deadline and where is remaining time propagated?
- What is the max concurrency, queue depth, payload, fan-out, retry count/elapsed budget, cache size/TTL, and history retention?
- Which failures are transient, permanent, overload, cancellation, or uncertain outcome?
- What is idempotency scope and atomic deduplication mechanism?
- What ordering is guaranteed (global, partition/key, none), and what happens on duplicate/reorder?
- How are schema versions deployed compatibly and old messages/data migrated?
- Which metrics/logs/traces reveal queue age, saturation, attempts, lag, breaker state, stale data, and recovery?
- Who owns alerts, DLQ/redrive, reconciliation, manual compensation, rollout, and rollback?

## Anti-pattern detection and correction

| Anti-pattern | Evidence / risk | Smallest credible correction |
|---|---|---|
| **God Object / God Service** | unrelated state/workflows and many reasons to change; central dependency fan-in | identify cohesive responsibilities and state owners; extract one module/use case at a time behind characterization tests |
| **Service Locator** | business code calls global container/registry; dependencies/lifetimes hidden | constructor/parameter injection from one composition root; pass a narrow factory only when runtime creation varies |
| **Singleton abuse** | mutable global state, test resets/order dependence, hidden access | create an explicitly owned instance, inject it, make state immutable/scoped; keep singleton only if cardinality is an invariant |
| **Anemic Domain Model** | in a rule-heavy domain, services mutate public entity data and duplicate invariants | move behavior/invariants to Value Objects/Aggregate Root; retain simple records for genuinely CRUD domains |
| **Big Ball of Mud** | no enforceable boundaries, arbitrary imports/data writes, changes ripple unpredictably | map dependencies/data owners, define one module seam, forbid new violations, migrate by vertical slices |
| **Spaghetti code** | tangled jumps/callbacks/shared mutation and unclear control flow | make sequence and ownership explicit; extract named functions, return typed outcomes, then consider Pipeline/State only if forces remain |
| **Golden Hammer** | same favorite pattern/technology applied despite different forces | write alternatives and rejection reasons; run a small spike/measure; choose native/simple mechanisms |
| **Factory overuse** | factories only call one constructor and mirror every type | inject/construct directly at composition root; keep named factory only for real validation/selection/lifecycle |
| **Interface-per-class** | one implementation, same method list, no boundary/substitution | depend on concrete cohesive type; introduce an interface at the consumer when a real second implementation or test boundary appears |
| **Premature microservices** | distribution before stable business/data boundaries or operations capability | enforce modular monolith boundaries first; extract only with measured autonomy/scaling/isolation need |
| **Shared database coupling** | services write/read each other's tables, migrations/releases coordinated | assign table/schema owner; expose API/events; migrate foreign writes with Strangler/Outbox and reconciliation |
| **Distributed monolith** | network services deploy together, synchronous chains, shared data, no failure isolation | merge where autonomy is absent or decouple contracts/data/deploys; eliminate chatty chains and establish local ownership |
| **Chatty interface** | many fine calls per use case, N+1/network latency and partial-failure surface | design coarse use-case/batch API or BFF; return purpose-built projection; measure payload versus round trips |
| **Leaky abstraction** | caller knows SQL/vendor errors, wrapper internals, hidden remote cost | narrow/rename boundary, map semantics/errors, expose unavoidable latency/streaming explicitly; remove wrapper if it adds no protection |
| **Circular dependencies** | module initialization/order issues and inseparable tests/releases | identify ownership; invert one stable contract, move shared concept to its rightful owner, or merge falsely separated modules |
| **Deep inheritance** | behavior depends on override order/protected state and fragile base changes | flatten and compose behaviors; preserve inheritance only for stable substitutable framework contract |
| **Boolean-flag behavior selection** | calls like `run(true, false)` and branching modes grow | separate named operations/options; use enum then Strategy/Policy if variants independently evolve |
| **Copy-pasted conditional logic** | same discriminator switch changed in several places | centralize a table/function first; extract polymorphism only when behaviors/owners genuinely vary |
| **Generic repository misuse** | `Repository<T>` exposes arbitrary CRUD/query/IQueryable and ignores aggregates/query cost | use domain-specific aggregate repository plus dedicated query functions/DAO; or use ORM directly in simple app |
| **Event-driven overuse** | simple workflow scattered across handlers; unknown completion/order and hard debugging | restore direct call/orchestrator for owned flow; reserve events for facts and independent reactions |
| **CQRS/Event Sourcing overuse** | duplicate models/event infrastructure around CRUD with no audit/read-write asymmetry | return to one state model and explicit queries; retain events only where history is a requirement |
| **Retry storm** | nested/unbounded immediate retries amplify outage and saturation | one owning retry layer, deadline/attempt budget, exponential backoff + jitter, `Retry-After`, breaker/rate limits |
| **Cache stampede** | many concurrent misses/expirations hammer source | request coalescing/single-flight, jittered TTL, stale-while-revalidate, bounded warmup; keep source protected |
| **Unbounded queues** | memory/lag grows while “accepting” work; stale work never catches up | set capacity/age limits and explicit block/reject/drop/spill policy; autoscale only within downstream capacity |
| **Missing idempotency** | duplicate payment/create/message effects after timeout/redelivery | stable request/event ID plus atomic claim/result record or naturally idempotent state transition; test concurrent duplicates |
| **Pattern stacking** | factory creates decorators over proxies feeding buses with no independent force | write one job per abstraction; remove layers whose behavior can be direct; add patterns one at a time with tests/metrics |

Additional warning signs—primitive obsession, feature envy, shotgun surgery, speculative generality, and N+1 queries—are prompts to inspect ownership and change cost, not automatic instructions to install a pattern.

## Review output

Report only evidence-backed findings:

- **Context and forces** (including unknowns)
- **What is already working** and any correctly used roles
- **Finding:** location, observable consequence, severity, and evidence
- **Minimum recommendation:** include “leave as is” where appropriate
- **Alternative rejected:** why it adds cost or misses a force
- **Migration and verification:** compatibility, tests, telemetry, rollback

Severity follows impact and likelihood, not pattern purity. A pattern opportunity with no current consequence is at most a low-priority option.
