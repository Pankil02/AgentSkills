# Domain and Data Patterns

Domain-Driven Design (DDD) is a modeling approach for complex business rules, not a mandatory architecture or collection of suffixes. Use its building blocks selectively. For straightforward CRUD, validated records plus clear application/data-access functions may be better.

## Strategic modeling

### Domain-Driven Design — modeling approach

- **Intent:** Align software boundaries, language, and models with important business capabilities and rules through continuous collaboration with domain experts.
- **Use when:** rules, exceptions, terminology, and model evolution—not data plumbing—create the main complexity.
- **Avoid when:** the domain is commodity CRUD, experts are unavailable, or ceremonial layers would exceed the business complexity.
- **Structure:** ubiquitous language within bounded contexts; explicit context relationships; tactical patterns only where invariants warrant them.
- **Trade-offs:** models fit business change and expose ambiguity, but modeling/collaboration take time and poor boundaries duplicate or couple concepts.
- **Mistakes / related:** DDD does not require microservices, repositories for every table, or “domain” folders around an anemic schema.

### Bounded Context

- **Intent:** Define where one model and ubiquitous language have a precise meaning and an owning boundary.
- **Use when:** the same term has different rules/meaning across capabilities or ownership and integration need clarification.
- **Avoid when:** splitting a small coherent model would create translation with no semantic difference.
- **Structure:** named boundary owns model, code, contracts, and data semantics; context map records upstream/downstream relationships and translations.
- **Trade-offs:** local model coherence and team autonomy, but duplicated concepts and explicit integration work.
- **Mistakes / related:** a context is a semantic boundary, not automatically a service, repository, namespace, or team. Enforce it first as a module when possible.

### Anti-Corruption Layer (ACL)

- **Intent:** Prevent an external or legacy model from distorting the consuming bounded context's language and invariants.
- **Use when:** integration semantics differ materially, the upstream evolves independently, or migration requires coexistence.
- **Avoid when:** models already align and a small mapping function suffices.
- **Structure:** boundary-owned facade/adapters/translators map requests, identities, values, errors, and events between models.
- **Trade-offs:** protects autonomy and local vocabulary, but duplicates mapping and can lag upstream capabilities.
- **Mistakes / related:** do not leak generated vendor DTOs beyond the layer or pretend lossy translation is reversible. ACL is larger in scope than one Adapter and often supports Strangler Fig.

## Tactical domain building blocks

### Entity

- **Intent:** Model something defined by stable identity and lifecycle even as its attributes change.
- **Use when:** continuity, identity-based references, and lifecycle transitions are meaningful to the business.
- **Avoid when:** all meaning is captured by immutable attributes; use a Value Object instead.
- **Structure:** identity equality (usually within a type/context), encapsulated state transitions, and invariants; persistence ID mechanics remain secondary.
- **Trade-offs:** models lifecycle accurately, but mutable identity-bearing objects require ownership, concurrency, and equality discipline.
- **Mistakes / related:** a database row or object with an `id` is not automatically a domain Entity. Do not use mutable fields in identity/hash equality.

### Value Object

- **Intent:** Model a descriptive concept by its value, with no independent identity.
- **Use when:** money, quantity, date range, address, identifier, or other concept has validation/operations and should be passed atomically.
- **Avoid when:** the concept has a tracked lifecycle or identity independent of its attributes.
- **Structure:** validate at construction, expose no invalid state, compare by all defining values, and prefer immutability.
- **Trade-offs:** stronger invariants and fewer primitive-parameter mistakes, but mapping/serialization and copy cost increase.
- **Mistakes / related:** include units/currency/time zone where semantically required; avoid public setters. An immutable record is a Value Object only when it represents a domain concept.

### Aggregate and Aggregate Root

- **Intent:** Define the smallest consistency/transaction boundary that must enforce a set of domain invariants atomically.
- **Use when:** multiple entities/values participate in invariants that must hold after every accepted command.
- **Avoid when:** grouping is based only on object navigation, screen shape, or foreign-key relationships.
- **Structure:** one root controls mutations and is the external reference; internal members have local identity; other aggregates reference the root by identity; one transaction normally changes one aggregate.
- **Trade-offs:** clear consistency and concurrency boundary, but oversized aggregates contend/load poorly while undersized ones shift invariants to workflows.
- **Mistakes / related:** aggregate ≠ collection/object graph. Put cross-aggregate processes in application workflows/Sagas and accept eventual consistency only when the business permits it.

```text
Order.confirm(now):
  require status == DRAFT and lines not empty
  status = CONFIRMED
  record OrderConfirmed(orderId, total, now)
```

The root owns the transition; persistence and event publication remain outside through Repository/Unit of Work/Outbox.

### Domain Service

- **Intent:** Express a stateless domain operation that belongs to the model but has no natural Entity or Value Object owner.
- **Use when:** a rule combines several domain concepts and naming it in domain language clarifies the model.
- **Avoid when:** behavior belongs on an entity/value, is application orchestration, or merely wraps a repository/client.
- **Structure:** domain inputs and output; domain-named operation; ideally pure, with required domain ports explicit.
- **Trade-offs:** preserves domain vocabulary without forcing ownership, but overuse creates an anemic model and procedural service layer.
- **Mistakes / related:** no transaction, transport DTO, authorization workflow, or generic CRUD in a Domain Service. Compare Application Service.

### Application Service

- **Intent:** Coordinate one application use case across domain objects, ports, authorization, and a transaction boundary.
- **Use when:** an external request/command needs orchestration while domain decisions remain in the domain model/policies.
- **Avoid when:** it is a pass-through wrapper with no boundary duty or it accumulates domain conditionals.
- **Structure:** validate request shape/auth, load via ports, invoke domain behavior, commit, publish/return mapped result; dependencies point inward through contracts.
- **Trade-offs:** clear use-case API and transaction/test seam, but can become a god service or duplicate controllers.
- **Mistakes / related:** keep it thin in policy, not necessarily in lines. It may coordinate several objects but should not decide domain truth.

### Domain Event

- **Intent:** Record a business-significant fact that occurred inside a domain model.
- **Use when:** a completed transition matters to other domain behavior, audit, or downstream reactions without coupling the aggregate to them.
- **Avoid when:** a direct return value/call is sufficient, the message is an instruction, or every setter would emit noise.
- **Structure:** immutable past-tense fact with domain identity/time and minimal stable data; aggregate records it; application transaction dispatches it safely.
- **Trade-offs:** explicit facts and decoupled reactions, but ordering, duplicate handling, schema evolution, and transactional publication add work.
- **Mistakes / related:** distinguish in-process Domain Event from versioned Integration Event. Use Transactional Outbox when publication must survive commit; consumers must not assume exactly once.

### Specification

- **Intent:** Give a domain proposition an explicit name and support evaluation and, where useful, composition (`and/or/not`).
- **Use when:** the same non-trivial rule is reused for validation, selection, policy, or repository query and is meaningful to domain experts.
- **Avoid when:** a local predicate is clearer, rules are side-effectful, or translation across runtime/query engines would change semantics.
- **Structure:** `isSatisfiedBy(candidate) -> bool/reasons`; optional compositors and query expression representation.
- **Trade-offs:** reusable, explainable rules, but object trees/DSLs grow and in-memory versus database evaluation can diverge.
- **Mistakes / related:** avoid one class per trivial comparison and generic “universal specification” frameworks. A Predicate is any boolean function; a Specification is a named domain concept with reuse/composition intent. Policy uses specifications to make a decision.

## Persistence boundaries

### Repository

- **Intent:** Give domain/application code a collection-like, aggregate-oriented persistence boundary while hiding storage mechanics.
- **Use when:** a domain model needs retrieval/persistence by domain concepts and storage independence/test seams have value.
- **Avoid when:** simple query/CRUD functions are clearer, or a generic wrapper merely duplicates the ORM.
- **Structure:** contract uses aggregate IDs and domain-specific queries; implementation uses mapper/ORM; Unit of Work defines commit. Return aggregates or purpose-built projections, not unrestricted query providers.
- **Trade-offs:** isolates persistence and protects aggregate boundaries, but can hide expensive queries and create mapping/abstraction overhead.
- **Mistakes / related:** do not make `GenericRepository<T>` with every CRUD/query operation, one repository per table, or pretend an in-memory fake proves SQL behavior. Compare DAO and Data Mapper.

### Data Access Object (DAO)

- **Intent:** Encapsulate operations against a particular data source/table/API and its data representation.
- **Use when:** persistence-oriented code needs a focused reusable gateway and domain aggregate semantics are not the abstraction goal.
- **Avoid when:** adding a DAO plus Repository as identical pass-through layers.
- **Structure:** data-source-specific queries/commands returning records/data models; transaction often supplied by caller.
- **Trade-offs:** localizes SQL/API details, but consumers can couple to storage shape and business queries may scatter.
- **Mistakes / related:** name by data responsibility, expose query cost, and parameterize safely. Repository speaks domain collections/aggregates; DAO speaks persistence operations.

### Data Mapper

- **Intent:** Move data between independent in-memory domain objects and storage records without making domain types persistence-aware.
- **Use when:** a rich model must remain independent of schema/ORM or one model maps non-trivially to storage.
- **Avoid when:** Active Record/ORM mapping is adequate and independence yields only repetitive field copying.
- **Structure:** mapper translates identity, values, relationships, and versions in both directions; repository commonly delegates to it.
- **Trade-offs:** clean domain independence and flexible schemas, but mapping code, partial-load semantics, and change tracking are complex.
- **Mistakes / related:** test round trips and null/precision/time-zone/version mappings. Do not let ORM proxies/annotations leak if independence is the reason for the mapper.

### Unit of Work

- **Intent:** Track a business operation's persistence changes and commit/rollback them as one explicit transaction.
- **Use when:** several repository operations must share transaction, identity, ordering, and atomic commit.
- **Avoid when:** one direct statement/aggregate save already has a clear transaction or the framework safely owns it.
- **Structure:** begin scope; repositories share connection/session and Identity Map; register/track changes; commit once; rollback/dispose on failure.
- **Trade-offs:** coherent atomic boundary and batched writes, but hidden change tracking, long transactions, and lifecycle coupling.
- **Mistakes / related:** scope it to one request/job/use case, never share across threads, and do not hold it open over remote calls. A Unit of Work cannot make independent service databases atomic.

### Identity Map

- **Intent:** Ensure one in-memory object instance represents a given persistence identity within a Unit of Work.
- **Use when:** repeated loads must preserve object identity, consistent changes, and avoid duplicate queries.
- **Avoid when:** immutable snapshots are preferred, scopes are long-lived, or stale state/memory retention is unacceptable.
- **Structure:** scoped map `(type, id) -> instance`; mapper/repository checks it before materialization and clears it when scope ends.
- **Trade-offs:** identity consistency and fewer reads, but stale data, memory growth, and concurrency/thread-safety hazards.
- **Mistakes / related:** never make it a process-global cache; define refresh/detach behavior. Most ORMs already provide one through their session/change tracker.

### Lazy Load

- **Intent:** Defer loading expensive related data until it is actually needed.
- **Use when:** usage is sparse, lifetime/session is controlled, and avoiding eager work is measured to help.
- **Avoid when:** access may occur after session close, latency must be predictable, serialization traverses properties, or it creates N+1 queries.
- **Structure:** proxy, value holder, ghost, or explicit async loader resolves once and caches according to policy.
- **Trade-offs:** avoids unused I/O, but hides latency/failure, creates query waterfalls, and complicates concurrency/tests.
- **Mistakes / related:** prefer explicit fetch plans/batch queries at service boundaries; never hide async network I/O behind an apparently cheap property. Proxy is a common mechanism.

### Data Transfer Object (DTO)

- **Intent:** Carry a boundary-specific data shape without domain behavior across process, layer, serialization, or trust boundaries.
- **Use when:** API/version/security/query shape differs from domain/persistence models or over-posting/data leakage must be controlled.
- **Avoid when:** copying an identical internal value between adjacent functions adds no boundary protection.
- **Structure:** serializable fields with boundary validation/versioning; explicit mapper to command/query/domain values.
- **Trade-offs:** stable tailored contracts and safer exposure, but duplicated shapes and mapping/version maintenance.
- **Mistakes / related:** do not treat transport validation as domain invariant enforcement, expose entities directly, or create DTOs between every internal method.

## Choosing the persistence shape

| Need | Prefer |
|---|---|
| Small CRUD/query code, storage shape is acceptable | focused query/command functions or DAO |
| Rich aggregate model independent of persistence | Repository + Data Mapper (often framework-supported) |
| One transaction and identity scope across repositories | Unit of Work + Identity Map |
| Read-optimized shape that is not an aggregate | dedicated query service/DAO/projection; do not force through Repository |
| Deferred relationship occasionally used | explicit loader/fetch plan before implicit Lazy Load |
| External/API shape | DTO at the boundary |

Test domain rules without infrastructure, but verify repositories/mappers/transactions against the real database engine for constraints, isolation, query count, and concurrency.
