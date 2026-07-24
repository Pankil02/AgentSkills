# Pattern Disambiguation

Choose by intent and forces, not diagram similarity. If a row's deciding force is absent, use the simpler option.

## Strategy vs State

| Question | Strategy | State |
|---|---|---|
| What varies? | Algorithm/mechanism | Behavior across lifecycle states |
| Who selects? | Caller/composition/configuration usually selects | Context transitions in response to events/guards |
| Does variant know transitions? | No | Often knows or participates in legal transitions |
| Simpler precursor | Function parameter/lookup | Enum + transition table |

Same delegation shape; use **State** only when transition validity and state-specific behavior are the problem.

## Strategy vs Template Method

| | Strategy | Template Method |
|---|---|---|
| Variation mechanism | Composition/delegation | Inheritance/hooks |
| Selection | Runtime or construction time | Subclass type |
| Best when | Algorithms vary/reuse independently | Framework owns a stable sequence and controlled hooks |
| Main cost | Extra collaborator/selection | Fragile base contract and call-order coupling |

Prefer a function/Strategy unless an established inheritance framework genuinely owns the lifecycle.

## Adapter vs Facade vs Proxy vs Decorator

| Pattern | Client-facing contract | Intent | Typical clue |
|---|---|---|---|
| **Adapter** | Different from adaptee | Translate incompatibility/semantics | “Make vendor/legacy API fit our port” |
| **Facade** | New, simpler/coarser API | Simplify/orchestrate subsystem use | “Call one use-case operation, not six components” |
| **Proxy** | Same as subject | Control access/location/lifecycle | lazy, remote, protection, cache stand-in |
| **Decorator** | Same as component | Add composable responsibility | ordered logging/metrics/auth wrappers |

A wrapper can play more than one role, but state the primary intent. Do not hide remote latency behind “transparent” Proxy semantics.

## Factory choices

| Need | Choose |
|---|---|
| One small selection/default/validation point | **Simple/static/named factory** |
| Stable creator workflow delegates one product creation step | **Factory Method** |
| Select a compatible family of several product kinds | **Abstract Factory** |
| Staged/validated construction or many optional parts | **Builder** |
| Copy configured runtime exemplars | **Prototype** |
| External composition chooses implementation/lifetime | **DI**, possibly with a simple provider function |

Factory Method is not “any function returning an object.” Abstract Factory's pressure is **family compatibility**. Builder's pressure is **construction process**, not polymorphic selection.

## Observer vs Publish–Subscribe

| | Observer | Publish–Subscribe |
|---|---|---|
| Relationship | Subject owns/notifies subscriber handles | Publisher writes topic; broker/channel knows subscriptions |
| Scope | Usually same process/object lifecycle | Often cross-component/process/time boundary |
| Coupling | Subject knows subscriber contract | Parties know message/topic contract, not each other |
| Delivery concerns | reentrancy, order, unsubscribe, callback errors | durability, duplicates, partition order, retention, replay, DLQ |

Use callbacks/Observer for bounded in-process reactions. Add a broker only for real temporal/spatial decoupling or durability.

## Mediator vs Event Bus

| | Mediator | Event Bus |
|---|---|---|
| Owns interaction workflow? | Yes, coordinates named colleagues | Usually no; routes messages to unknown subscribers |
| Topology | Many colleagues to one coordinator | Publishers/subscribers through channels |
| Flow visibility | Central and explicit | Distributed among handlers |
| Risk | God mediator | Hidden event chains and unclear ownership |

If sequence/decision ownership matters, use a focused **Mediator/orchestrator**. If independent reactions to facts matter, use an event bus/Pub-Sub. Do not call middleware a Mediator merely because it is central.

## Command vs Strategy

| | Command | Strategy |
|---|---|---|
| Represents | A requested action (“what/when”) | An algorithm (“how”) |
| Typical data | Parameters, identity, metadata | Configuration/dependencies for mechanism |
| Lifecycle | May be queued, serialized, audited, retried, undone | Usually invoked directly by a context |
| Example | `ChargeInvoice(invoiceId)` | `CardFeeCalculation` |

A command handler can use a Strategy. A callback is sufficient until action lifecycle is first-class.

## Repository vs DAO vs Data Mapper

| | Repository | DAO | Data Mapper |
|---|---|---|---|
| Abstraction language | Domain aggregate/collection | Data source/table/query | Translation between object and record |
| Returns | Aggregates or explicit projections | Records/data models | Materialized domain object / persistence data |
| Hides | Persistence choice and aggregate storage | Low-level SQL/API mechanics | Mapping mechanics |
| Typical caller | Application/domain-facing port | Data/application layer | Repository/Unit of Work |

Do not stack all three as pass-through wrappers. A repository may use a DAO and mapper only when each has distinct work. For read reports, a query DAO/projection often beats forcing results through an aggregate repository.

## MVC vs MVP vs MVVM

| | MVC | MVP | MVVM |
|---|---|---|---|
| Input coordinator | Controller | Presenter | View commands/bindings to ViewModel |
| View relationship | Variant-specific; controller selects/updates, model may notify | Passive View interface driven by Presenter | Declarative binding to observable ViewModel |
| Test seam | Controller/model | Presenter without UI toolkit | ViewModel state/commands |
| Best fit | Framework already defines MVC | Imperative UI needing passive-view tests | UI framework with strong data binding/reactivity |

Names vary by framework. Follow its lifecycle; keep domain policy out of all three presentation coordinators.

## Layered vs Hexagonal vs Clean vs Onion

| Style | Primary organizing idea | Dependency rule |
|---|---|---|
| **Layered** | Ordered technical concerns | Usually downward; may be strict or relaxed |
| **Hexagonal** | Core ports with driving/driven adapters | Adapters depend on core-owned ports |
| **Clean** | Policy/use-case rings protected from details | Source dependencies point inward |
| **Onion** | Domain model at center with surrounding services/infrastructure | Source dependencies point inward |

Hexagonal, Clean, and Onion substantially overlap: stable policy inside, I/O/framework details outside. Pick one vocabulary and minimum boundaries; do not implement all four as nested duplicate layers.

## Modular Monolith vs Microservices

| Force | Modular Monolith | Microservices |
|---|---|---|
| Deployment | One coordinated deploy | Independent per service |
| Calls/transactions | Local; local ACID available | Network; partial failure/eventual workflows |
| Scaling/failure isolation | Mostly whole application | Per capability if boundaries are sound |
| Refactoring | Easier across modules | Contract/data migrations across owners |
| Operations | Lower | Discovery, deployment, telemetry, security, on-call maturity required |

Default to a modular monolith while boundaries are evolving. Choose microservices only for demonstrated independent deployment/scaling/failure/team ownership and explicit data ownership—not “future scale.”

## CQRS vs ordinary service/repository separation

Use ordinary commands/query methods when:
- one domain/data model serves both acceptably;
- consistency is immediate and load/security needs are similar;
- separate DTOs or optimized SQL can solve read shape.

Use CQRS when command invariants and query models **must evolve/scale/secure independently**. CQRS does not require separate services/databases, a broker, or Event Sourcing. Two method folders named `commands` and `queries` without independent models are organization, not a reason to accept CQRS complexity.

## Event Sourcing vs Event-Driven Architecture

| | Event Sourcing | Event-Driven Architecture |
|---|---|---|
| Role of events | Authoritative persistence history for state | Communication/coordination between components |
| Rebuild state? | Yes, by folding an entity/aggregate stream | Not necessarily; consumers may store current state |
| Scope | Persistence model, often per aggregate | System integration style |
| Core burden | event evolution, replay, snapshots/projections | delivery, schemas, ordering, consumer operations |

They can coexist but neither implies the other. Publishing CRUD change notifications is EDA-like integration, not Event Sourcing.

## Saga vs distributed transaction

| | Saga | Distributed transaction / 2PC |
|---|---|---|
| Atomicity | Sequence of committed local transactions | Coordinated all-or-nothing decision |
| Failure response | Semantic compensation/forward recovery | Rollback before commit; recover in-doubt participants |
| Visibility | Intermediate states are observable | Isolation depends on participants; prepared resources may block |
| Best fit | Autonomous services, long business workflows | Controlled compatible participants, short work, strict atomicity |
| Cost | complex workflow/idempotency/compensation | availability/blocking/operational coupling |

First seek one data owner/local transaction. A Saga is not rollback with HTTP calls; compensation can be impossible or require human resolution.

## Decorator vs inheritance

Choose **Decorator/composition** when responsibilities are optional, per-instance, orderable, or combine independently. Choose **inheritance** only for a stable substitutable “is-a” contract where base behavior/lifecycle intentionally governs subclasses. One fixed behavior in one type may need neither. Wrapper depth and ordering can be as harmful as subclass explosion.

## Specification vs Predicate

- **Predicate:** any boolean function; best for a local, one-off check.
- **Specification:** a named domain proposition with reuse/explanation/composition intent, sometimes translatable to a query.

Start with a predicate. Promote only when the rule is domain vocabulary or must be shared/composed. Do not promise identical semantics across in-memory and SQL evaluators without tests.

## Domain Service vs Application Service

| | Domain Service | Application Service |
|---|---|---|
| Language | Business/domain | Use case/application boundary |
| Responsibility | Domain decision with no natural entity/value owner | Orchestration, authorization, transactions, ports, mapping |
| Inputs/outputs | Domain types | Commands/DTOs plus mapped results |
| Infrastructure | None or domain-defined port only | Coordinates repositories/clients/UoW |

If a rule naturally belongs on an Entity/Value Object, put it there. If code decides **what is true in the business**, it is domain behavior; if it coordinates **how this use case runs**, it is application behavior.

## Entity vs Value Object

| Question | Entity | Value Object |
|---|---|---|
| Equality | Stable identity | All defining values |
| Lifecycle | Persists through attribute changes | Replace with a new value |
| Mutation | Encapsulated transitions possible | Prefer immutable |
| Example | Order, Account | Money, DateRange, EmailAddress |

An ID field does not automatically make an Entity. Ask whether two equal-looking instances are still distinct to the business and whether continuity matters.

## Chain of Responsibility vs Pipeline

- **Chain:** each handler may handle/stop/route; receiver is not known in advance.
- **Pipeline:** stages normally all process/transform in order; input/output flow is the focus.

Authentication middleware may be Chain-like (reject or continue); compiler/ETL stages are Pipeline. A framework middleware stack can combine both.

## Bridge vs Adapter vs Strategy

- **Bridge:** designed around two independent, growing dimensions.
- **Adapter:** retrofits an incompatible existing boundary.
- **Strategy:** swaps one algorithm/behavior dimension.

All may delegate. Require two explicit axes before calling composition a Bridge.

## Dependency Injection vs Service Locator

- **DI:** composition root supplies declared dependencies; constructor/signature reveals requirements.
- **Service Locator:** code asks a global/container for dependencies at runtime; requirements and lifetime are hidden.

A DI container is acceptable at the composition root. Calling it from domain/application code turns it into Service Locator.
