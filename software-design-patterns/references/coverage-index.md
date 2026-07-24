# Coverage and Source Audit

This file supports maintenance/validation; it is not needed for ordinary pattern selection.

## Taxonomy used

| Kind | Meaning | Examples |
|---|---|---|
| **Design/application pattern** | Reusable collaboration/structure responding to forces | Adapter, Repository, Saga, Outbox |
| **Architectural style** | System-wide boundary/dependency/deployment constraints | Layered, Hexagonal, Modular Monolith, Microservices, EDA |
| **Domain building block** | Modeling concept with semantic rules | Entity, Value Object, Aggregate, Bounded Context |
| **Technique/mechanism** | Implementation/operational tool, not a full design pattern | DI, Mutex, Retry, Idempotency, immutable data |
| **Deployment/rendering model** | Runtime/delivery choice | Serverless, Islands |
| **Principle** | Decision heuristic, not a code template | KISS, YAGNI, cohesion, dependency inversion |

Names can overlap categories; the catalog identifies the practical role rather than inflating the pattern count.

## Classic GoF inventory (23/23)

All canonical entries are in [object-patterns.md](object-patterns.md).

| Family | Patterns |
|---|---|
| Creational (5) | Factory Method; Abstract Factory; Builder; Prototype; Singleton |
| Structural (7) | Adapter; Bridge; Composite; Decorator; Facade; Flyweight; Proxy |
| Behavioral (11) | Chain of Responsibility; Command; Interpreter; Iterator; Mediator; Memento; Observer; State; Strategy; Template Method; Visitor |

## Required extended coverage map

| Family | Pattern/concept | Canonical file |
|---|---|---|
| Creational | Simple Factory / Static Factory; Object Pool; Dependency Injection; Provider / Scoped Context | [object-patterns.md](object-patterns.md) |
| Structural | Module; Mixin / Trait | [object-patterns.md](object-patterns.md) |
| Structural/data | Repository; DAO; Data Mapper; Identity Map; Lazy Load | [domain-data-patterns.md](domain-data-patterns.md) |
| Behavioral/domain | Null Object; Policy | [object-patterns.md](object-patterns.md) |
| Behavioral/domain | Specification | [domain-data-patterns.md](domain-data-patterns.md) |
| Application | Pipeline / Pipes and Filters; Plugin Architecture; Microkernel | [architecture-patterns.md](architecture-patterns.md) |
| Presentation | MVC; MVP; MVVM | [architecture-patterns.md](architecture-patterns.md) |
| Web rendering/delivery | Islands Architecture; code splitting/dynamic import; prefetch/preload; PRPL; facade embeds; virtualization | [architecture-patterns.md](architecture-patterns.md) |

## Architecture and application coverage

Canonical file: [architecture-patterns.md](architecture-patterns.md).

- **Boundary styles:** Layered Architecture; Hexagonal / Ports and Adapters; Clean Architecture; Onion Architecture.
- **System/deployment styles:** Modular Monolith; Microservices; Event-Driven Architecture; Serverless.
- **State/read models:** Event Sourcing; CQRS.
- **Application extension/flow:** Pipeline / Pipes and Filters; Plugin Architecture; Microkernel.
- **Client/API edge:** Backend for Frontend; API Gateway.
- **Evolution:** Strangler Fig.
- **Presentation/rendering:** MVC; MVP; MVVM; Islands Architecture.

Distributed application patterns **Saga**, **Transactional Outbox**, and resilience patterns are kept with delivery/failure semantics in [distributed-concurrency.md](distributed-concurrency.md).

## Domain and enterprise coverage

Canonical file: [domain-data-patterns.md](domain-data-patterns.md).

- DDD approach and Ubiquitous Language guidance.
- Bounded Context and Anti-Corruption Layer.
- Entity; Value Object; Aggregate and Aggregate Root.
- Domain Service; Application Service; Domain Event.
- Repository; Unit of Work; Specification.
- DTO; DAO; Data Mapper; Identity Map; Lazy Load.

Relationships and required disambiguations are in [comparisons.md](comparisons.md): Repository/DAO/Data Mapper, Domain/Application Service, Entity/Value Object, and Specification/Predicate.

## Concurrency, messaging, consistency, and reliability coverage

Canonical file: [distributed-concurrency.md](distributed-concurrency.md).

| Area | Covered entries |
|---|---|
| Work/messaging | Producer–Consumer; Work Queue; Competing Consumers; Publish–Subscribe; Dead-Letter Queue; Backpressure / Bounded Buffer |
| Execution/concurrency | Thread Pool; Actor Model; Reactor; Futures / Promises; Structured Concurrency; Mutex; Semaphore; Immutable Data |
| Data concurrency | Optimistic Locking; Pessimistic Locking |
| Remote resilience | Timeout / Deadline; Retry with exponential backoff and jitter; Circuit Breaker; Bulkhead; Idempotency |
| Distributed consistency | Transactional Outbox; Saga; Distributed Transaction / Two-Phase Commit |
| Coordination/infrastructure | Leader Election; Service Discovery |
| Data/admission | Cache-Aside; Rate Limiting |

The catalog deliberately adds deadlines, backpressure, structured concurrency, and distributed-transaction comparison because the requested patterns are unsafe or ambiguous without them.

## Confused-choice coverage

[comparisons.md](comparisons.md) contains all required comparisons:

- Strategy vs State; Strategy vs Template Method.
- Adapter vs Facade vs Proxy vs Decorator.
- Factory Method vs Abstract Factory vs Builder (plus Simple Factory, Prototype, DI).
- Observer vs Publish–Subscribe; Mediator vs Event Bus.
- Command vs Strategy; Chain of Responsibility vs Pipeline.
- Repository vs DAO vs Data Mapper.
- MVC vs MVP vs MVVM.
- Layered vs Hexagonal vs Clean vs Onion.
- Modular Monolith vs Microservices.
- CQRS vs ordinary service/repository separation.
- Event Sourcing vs Event-Driven Architecture.
- Saga vs distributed transaction.
- Decorator vs inheritance.
- Specification vs Predicate.
- Domain Service vs Application Service.
- Entity vs Value Object.
- Bridge vs Adapter vs Strategy; DI vs Service Locator.

## Anti-pattern coverage

[review-playbook.md](review-playbook.md) covers detection and incremental correction for:

God Object; Service Locator; Singleton abuse; Anemic Domain Model; Big Ball of Mud; Spaghetti code; Golden Hammer; factory overuse; interface-per-class; premature microservices; shared database coupling; distributed monolith; chatty interfaces; leaky abstractions; circular dependencies; deep inheritance; boolean-flag behavior selection; copy-pasted conditional logic; generic repository misuse; event-driven overuse; CQRS/Event Sourcing overuse; retry storms; cache stampedes; unbounded queues; missing idempotency; and pattern stacking.

## Source-folder inspection inventory

All 39 source files present before this skill was created were inspected.

### `skills/*/SKILL.md` (29)

1. `bundle-splitting`
2. `command-pattern`
3. `compression`
4. `dynamic-import`
5. `factory-pattern`
6. `flyweight-pattern`
7. `import-on-interaction`
8. `import-on-visibility`
9. `islands-architecture`
10. `js-performance-patterns`
11. `loading-sequence`
12. `mediator-pattern`
13. `mixin-pattern`
14. `module-pattern`
15. `observer-pattern`
16. `prefetch`
17. `preload`
18. `prototype-pattern`
19. `provider-pattern`
20. `proxy-pattern`
21. `prpl`
22. `route-based`
23. `singleton-pattern`
24. `static-import`
25. `third-party`
26. `tree-shaking`
27. `view-transitions`
28. `virtual-lists`
29. `vite-bundle-optimization`

### `zlstas-skills-design-patterns` (10)

- `SKILL.md`
- `references/patterns-catalog.md`
- `references/review-checklist.md`
- `scripts/scaffold.py`
- `evals/evals.json`
- `examples/before.md`
- `examples/after.md`
- placeholder files `assets/example_asset.txt`, `references/api_reference.md`, and `scripts/example.py`

Pi's complete skill-format documentation (`.../@earendil-works/pi-coding-agent/docs/skills.md`) was also inspected before choosing the `SKILL.md` + progressive `references/` structure.

## Source synthesis and corrections

Useful source material was retained only after reconciling these issues:

- The existing catalog covered GoF/MVC but omitted most architecture, domain/data, concurrency, messaging, and distributed reliability decisions required here.
- JavaScript prototype-chain inheritance was labeled as Prototype; the new catalog distinguishes it from GoF exemplar cloning.
- Mediator was conflated with middleware; the new catalog classifies middleware as Chain/Pipeline/Decorator unless it truly coordinates colleagues.
- Observer and Publish–Subscribe were conflated; process/lifecycle, broker, delivery, and durability differences are now explicit.
- “Factory” variants were conflated with any function returning an object; Simple Factory, Factory Method, Abstract Factory, Builder, Prototype, and DI now have separate decision forces.
- Some guidance treated every direct construction/concrete dependency, Strategy without a runtime setter, Command without undo, or MVC without a fixed GoF composition as incomplete. Those are not universal correctness requirements.
- Singleton guidance now separates process-scoped instance lifetime from distributed uniqueness and defaults to explicit ownership/DI.
- Existing Flyweight examples copied shared fields into each logical object, undermining the claimed memory saving; the new entry requires measured sharing of immutable intrinsic state.
- Existing Proxy/Provider/Mixin/scaffold examples contained semantic or code-quality hazards (false-value property checks, hidden ambient coupling, fragile prototype mutation, and non-compilable/misleading boilerplate). They were not copied.
- Web references included outdated recommendations/metrics (HTTP/2 server push, FID/TTI emphasis, older framework assumptions). Delivery guidance is kept compact, flags server-push deprecation, and remains subordinate to measurement/current platform support.
- Existing review checks over-prescribed factories, iterators, null objects, and pattern participant classes. The new review process requires observable impact and allows “no pattern.”

## New skill file map

| File | Runtime purpose |
|---|---|
| `SKILL.md` | Compact decision workflow, selection map, gates, implementation/output contract, progressive-loading router |
| `references/object-patterns.md` | GoF and object/module/creation catalog |
| `references/architecture-patterns.md` | System, application, UI, evolution, deployment, and web rendering styles |
| `references/domain-data-patterns.md` | DDD building blocks and persistence boundaries |
| `references/distributed-concurrency.md` | Concurrency, messaging, consistency, resilience, and operations |
| `references/comparisons.md` | High-confusion decision tables |
| `references/review-playbook.md` | Idiomatic implementation, incremental refactoring, tests, operations, anti-patterns |
| `references/further-reading.md` | Canonical source traditions and maintenance rules |
| `examples/README.md` and `examples/*.md` | Progressive worked decisions: no-pattern, Adapter migration, idiomatic forms, module/Outbox evolution |
| `assets/adr-template.md` | Evidence, alternatives, consequences, migration, fitness, and rollback record |
| `evals/evals.json` | Balanced behavioral rubric covering justified patterns, no-pattern decisions, correct-as-is review, architecture, and reliability |
| `references/coverage-index.md` | Coverage/source audit and maintenance inventory |
| `scripts/validate.py` | Offline structure, all-local-link, catalog-section, eval-schema, routing, frontmatter, and core-size validator |

## Quality gates

The offline validator checks structure but does not claim to replace model evaluation. Release confidence requires both:

1. **Deterministic validation:** valid frontmatter, bounded core, required files, all local links, unique headings, complete catalog consequence fields, progressive routing, and eval schema/tag balance.
2. **Behavioral evaluation:** run prompts from `evals/evals.json` against target models and inspect whether responses choose the minimum safe design, preserve contracts, follow repository idioms, and avoid manufactured findings. Include regression evals whenever guidance changes after an incident or review failure.

A structural `PASS` proves packaging and catalog invariants only; it does not by itself prove response quality.
