# Architecture and Application Patterns

An **architectural style** constrains system-wide organization; an **application pattern** organizes a subsystem; a **deployment model** describes where code runs. Do not combine labels as trophies. Select boundaries from forces and enforce them with modules, dependency rules, tests, and ownership.

## Core boundary styles

### Layered Architecture — architectural style

- **Intent:** Separate concerns into ordered layers such as presentation, application, domain, and infrastructure.
- **Use when:** the system has conventional request/use-case/data concerns and one-way layer dependencies improve comprehension.
- **Avoid when:** layers become pass-through ceremony, domain behavior is trivial, or feature/module cohesion matters more than technical grouping.
- **Structure:** each layer exposes a narrow API; strict layering calls only the next layer, relaxed layering may skip; choose deliberately.
- **Trade-offs:** familiar and independently testable, but horizontal change can touch every layer and infrastructure often leaks upward.
- **Mistakes / related:** organize cohesive features/modules within layers; forbid cycles. Unlike Hexagonal/Clean/Onion, conventional layers do not inherently require all dependencies to point toward domain policy.

### Hexagonal Architecture / Ports and Adapters — architectural style

- **Intent:** Keep application/domain logic independent of delivery and infrastructure through explicit ports.
- **Use when:** the same use cases need multiple drivers (HTTP, CLI, jobs) or driven services (DB, broker, vendor) and isolation is valuable.
- **Avoid when:** a small CRUD application gains only interfaces and mapping with no meaningful substitution or boundary.
- **Structure:** driving adapters call inbound ports/use cases; core calls outbound ports implemented by driven adapters; composition happens outside the core.
- **Trade-offs:** fast core tests and replaceable edges, but more contracts, mapping, and wiring.
- **Mistakes / related:** define ports in the language of the core, not as wrappers over framework/ORM APIs. “Port” means boundary contract, not one interface per class.

### Clean Architecture — architectural style

- **Intent:** Protect high-level policies and use cases by making source-code dependencies point inward from frameworks and details.
- **Use when:** business rules are long-lived, delivery/storage technologies change independently, and explicit use-case boundaries aid testing.
- **Avoid when:** concentric layers become DTO/mapper/interactor ceremony around straightforward behavior.
- **Structure:** entities/domain policy at center; application use cases around them; interface adapters translate; frameworks/drivers remain outermost.
- **Trade-offs:** policy independence and test seams, but mapping/type proliferation and conceptual overhead.
- **Mistakes / related:** “independent of framework” does not mean hiding every library. Keep framework-neutral policy, allow pragmatic edge integration. Closely overlaps Hexagonal and Onion.

### Onion Architecture — architectural style

- **Intent:** Center the domain model and direct dependencies inward through domain services, application services, and infrastructure rings.
- **Use when:** domain behavior/invariants are the primary asset and persistence/UI must remain replaceable details.
- **Avoid when:** there is no rich domain model or rings merely rename conventional pass-through layers.
- **Structure:** domain model has no outward dependencies; application coordinates it; infrastructure supplies interfaces defined inward; UI/API is outside.
- **Trade-offs:** strong domain isolation, with the same mapping, wiring, and over-abstraction risks as Clean/Hexagonal.
- **Mistakes / related:** rings are conceptual dependency boundaries, not mandatory projects/packages. Choose one vocabulary among Onion, Clean, and Hexagonal and enforce its shared inward-dependency rule.

## Deployment and system styles

### Modular Monolith — architectural style

- **Intent:** Keep one deployable/runtime while enforcing cohesive modules with explicit APIs and ownership.
- **Use when:** atomic local changes/transactions and operational simplicity matter, while the codebase needs strong business boundaries.
- **Avoid when:** independently deployable/scalable/failure-isolated capabilities are already demonstrated necessities that one deployment cannot meet.
- **Structure:** modules hide internals, depend acyclically through contracts, and preferably own schemas/tables even if one database is used; CI enforces boundaries.
- **Trade-offs:** simple operations/refactoring and local calls, but whole-app releases/scaling and weak runtime isolation.
- **Mistakes / related:** folders alone are not modules; prevent cross-module table access and shared mutable internals. Usually the safer starting point before Microservices.

### Microservices — architectural style

- **Intent:** Split business capabilities into independently owned, deployable services with explicit network contracts and data ownership.
- **Use when:** independent release cadence, scaling, isolation, regulation, or team autonomy repays network and operational cost.
- **Avoid when:** boundaries are uncertain, teams cannot own build-to-production operations, or the motive is codebase size/technology fashion.
- **Structure:** each service owns behavior and data; communicates through versioned APIs/events; automation covers deployment, discovery, telemetry, security, and recovery.
- **Trade-offs:** autonomy and selective scaling/failure containment, but latency, partial failure, eventual consistency, duplicated platform work, and difficult cross-service change/testing.
- **Mistakes / related:** no shared write database, lockstep releases, synchronous call chains, or “entity service” slicing. Extract from a modular monolith by business boundary with Strangler Fig.

### Event-Driven Architecture — architectural style

- **Intent:** Coordinate components by producing and reacting to facts/events, often asynchronously.
- **Use when:** real fan-out, temporal decoupling, independent reactions, buffering, or audit integration is required.
- **Avoid when:** a direct request/response must give an immediate result, workflow ordering is central, or events merely hide a simple call graph.
- **Structure:** producer owns event schema; channel/broker transports; consumers handle according to declared delivery and ordering semantics.
- **Trade-offs:** loose temporal coupling and elastic processing, but eventual consistency, duplicates, ordering gaps, schema evolution, tracing, and difficult debugging.
- **Mistakes / related:** events are past-tense facts, not disguised commands broadcast to unknown owners. Define partition key, idempotency, retention, replay, privacy, and failure handling. Event Sourcing is not required.

### Event Sourcing — persistence/architecture pattern

- **Intent:** Store an entity/aggregate's accepted domain events as the authoritative history and derive current state by replay/fold.
- **Use when:** business history, temporal queries, audit, correction, or alternate projections are core requirements and event semantics are durable.
- **Avoid when:** ordinary CRUD/current state suffices, history contains hard-to-retain sensitive data, or the team cannot own event evolution and replay operations.
- **Structure:** load stream, decide command, append new events with expected version, publish/project; snapshots are optional accelerators, not authority.
- **Trade-offs:** complete history and reproducible projections, but event versioning/upcasting, storage growth, replay cost, eventual projections, and operational complexity.
- **Mistakes / related:** store business facts, not object snapshots or UI events; never rewrite history casually. Event Sourcing can be used without broad EDA; CQRS is common but independent.

### CQRS — application/architecture pattern

- **Intent:** Use distinct command and query models/interfaces when reads and writes have materially different concerns.
- **Use when:** read shapes/scaling/security differ significantly, write-side invariants need isolation, or independent models remove real compromise.
- **Avoid when:** ordinary use-case methods and repository queries are clear, or two models would duplicate simple CRUD.
- **Structure:** commands validate/modify authoritative state; queries use a read model optimized for consumers. Models may share a process/database or be separately projected.
- **Trade-offs:** tailored models and independent optimization, but duplication, synchronization lag, more contracts, and harder end-to-end reasoning.
- **Mistakes / related:** separate method names are not necessarily CQRS; separate databases, events, and Event Sourcing are optional. State the consistency expectation to users.

### Serverless — deployment model

- **Intent:** Run functions/services on managed elastic infrastructure with provider-owned provisioning and per-use scaling.
- **Use when:** event-driven/bursty workloads, low platform-operations appetite, and managed integrations outweigh portability/control.
- **Avoid when:** sustained workloads make cost poor, hard real-time/low-tail latency is required, execution is long/stateful, or provider limits conflict.
- **Structure:** stateless handlers triggered by HTTP/events; durable state externalized; infrastructure, IAM, quotas, and event sources declared as code.
- **Trade-offs:** rapid deployment and elastic scale, but cold starts, quotas, opaque infrastructure, local-test gaps, vendor coupling, and event duplicates.
- **Mistakes / related:** make handlers idempotent and observable; bound fan-out/concurrency and connection use. Serverless does not imply Microservices, and functions are not architectural boundaries by themselves.

## Application organization

### Pipeline / Pipes and Filters — application pattern

- **Intent:** Process data through ordered, independently composable stages with explicit input/output contracts.
- **Use when:** parsing, compilation, ETL, media, validation, or request processing naturally transforms/filters a stream in stages.
- **Avoid when:** stages share substantial mutable context, require tangled backtracking, or one direct algorithm is clearer.
- **Structure:** filters transform/read/write values; pipes connect them; execution may be pull, push, batch, or streaming with explicit error/backpressure policy.
- **Trade-offs:** reusable stages and parallelism, but serialization/buffering cost, order dependence, partial-result and observability complexity.
- **Mistakes / related:** type stage boundaries and bound buffers. Pipeline normally runs all applicable stages; Chain of Responsibility may terminate after one handler.

```text
source -> parse -> validate -> enrich -> persist
          Result<A>  Result<B>  Result<C>
```

### Plugin Architecture — application/architecture pattern

- **Intent:** Let independently developed extensions add capabilities through a stable host contract.
- **Use when:** integrations/features must vary by deployment, third parties extend the product, or optional capabilities should not modify core code.
- **Avoid when:** all extensions ship/release with the host and direct modules/configuration are simpler.
- **Structure:** host defines narrow versioned extension points, discovery/registration, lifecycle, capabilities, and isolation; plugins depend on an SDK/contract, not host internals.
- **Trade-offs:** extensibility and separate ownership, but compatibility matrices, dependency conflicts, security/sandboxing, diagnostics, and upgrade burden.
- **Mistakes / related:** validate untrusted plugins, define time/resource budgets and failure isolation, and keep contracts additive. Microkernel is a system organized around this relationship.

### Microkernel — architectural style

- **Intent:** Keep a minimal stable core that supplies essential mechanisms while plugins provide most variable product capabilities.
- **Use when:** product-line variants, tools/IDEs, workflow engines, or operating-system-like platforms have a genuinely stable kernel and many extensions.
- **Avoid when:** deciding what belongs in the core is unstable or only one/two extensions exist.
- **Structure:** kernel owns lifecycle, shared services, and extension protocol; internal/external servers/plugins add capabilities.
- **Trade-offs:** product variability and stable core, but core API ossification, plugin coordination, and central bottleneck risk.
- **Mistakes / related:** keep business features out of the kernel unless universally required. Every Microkernel uses plugin ideas; not every plugin-enabled application is meaningfully a Microkernel.

### Backend for Frontend (BFF) — edge application pattern

- **Intent:** Give each materially different client experience a backend tailored to its workflows and data shape.
- **Use when:** web, mobile, partner, or device clients have divergent aggregation, release, latency, or authorization needs and separate owners.
- **Avoid when:** clients need nearly identical APIs or BFFs would duplicate domain rules and data access.
- **Structure:** client-specific edge service orchestrates downstream APIs and presentation shaping; domain decisions remain in owning services/modules.
- **Trade-offs:** fewer chatty client calls and independent evolution, but duplicated orchestration, more deployments, and consistency/security policy drift.
- **Mistakes / related:** align ownership with the client team and share generated contracts/libraries selectively. API Gateway handles cross-client edge concerns; it may route to BFFs.

### API Gateway — infrastructure/edge pattern

- **Intent:** Provide one managed entry point for routing and cross-cutting edge policy across backend services.
- **Use when:** clients need stable routing, authentication enforcement, TLS, quotas, protocol translation, aggregation, or observability at the edge.
- **Avoid when:** one service has no edge complexity or the gateway would centralize business workflows and every release.
- **Structure:** highly available stateless gateway routes by version/path/tenant; policy/config is automated; backends still enforce authorization relevant to their resources.
- **Trade-offs:** consistent edge controls and hidden topology, but added hop, blast radius, configuration coupling, and bottleneck risk.
- **Mistakes / related:** keep domain logic out, bound aggregation fan-out, propagate deadlines/identity/traces, and provide bypass/recovery plans. Compare Facade and BFF.

### Strangler Fig — evolutionary architecture pattern

- **Intent:** Replace a legacy system incrementally by routing selected capabilities to a new implementation until the old path can be retired.
- **Use when:** a big-bang rewrite is unsafe and behavior can be carved out by route, tenant, use case, or data ownership slice.
- **Avoid when:** there is no viable interception seam or maintaining two paths costs more than a small direct replacement.
- **Structure:** facade/router intercepts traffic; establish characterization tests and data seam; migrate one vertical slice; compare/observe; cut over and delete old code.
- **Trade-offs:** controlled risk and early value, but prolonged coexistence, data synchronization, duplicate behavior, and temporary routing complexity.
- **Mistakes / related:** define source of truth, rollback, reconciliation, and decommission criteria before each slice. An Anti-Corruption Layer can protect the new model during coexistence.

## Presentation patterns

Frameworks use these names differently. Follow the repository's framework contract rather than forcing textbook object diagrams.

### MVC — presentation pattern

- **Intent:** Separate domain/application state (Model), rendering (View), and input/request interpretation (Controller).
- **Use when:** the platform already supports MVC or multiple presentation concerns benefit from separation.
- **Avoid when:** adding parallel controller/model wrappers around a component framework only duplicates its data flow.
- **Structure:** controller translates input into model/use-case actions and selects/updates a view; exact notification and lifecycle vary between desktop and web MVC.
- **Trade-offs:** familiar separation and testable request logic, but ambiguous variants and “fat controller/model” drift.
- **Mistakes / related:** MVC is not universally “Observer + Strategy + Composite”; do not put domain policy in controllers or persistence in views.

### MVP — presentation pattern

- **Intent:** Make a Presenter mediate between a usually passive View contract and Model/application services.
- **Use when:** imperative UI frameworks make view logic hard to test and a presenter can be tested without rendering.
- **Avoid when:** declarative binding/state architecture already provides the seam or presenter becomes a screen-sized god object.
- **Structure:** View forwards events; Presenter calls use cases/model and issues view updates through an interface; View contains minimal decisions.
- **Trade-offs:** isolated presentation tests, but verbose view contracts and manual synchronization.
- **Mistakes / related:** keep domain logic out of Presenter and split by user workflow. Unlike MVC, Presenter normally drives the view directly.

### MVVM — presentation pattern

- **Intent:** Expose presentation-ready observable state and commands in a ViewModel consumed through data binding.
- **Use when:** the UI framework has mature binding/reactivity and view state needs independent tests.
- **Avoid when:** binding is absent/fragile or ViewModels merely mirror every domain field and become dumping grounds.
- **Structure:** View binds to ViewModel state/commands; ViewModel adapts model/use cases without depending on concrete widgets.
- **Trade-offs:** less imperative view wiring and reusable presentation state, but implicit binding flow, synchronization, and lifecycle complexity.
- **Mistakes / related:** distinguish transient view state from domain state and dispose subscriptions. A ViewModel is not a persistence model or generic service.

### Islands Architecture — web rendering style

- **Intent:** Serve mostly static/server-rendered HTML with independently hydrated interactive regions (“islands”).
- **Use when:** content-heavy pages need a few isolated interactions and low client JavaScript/fast initial rendering matter.
- **Avoid when:** most of the screen shares live state or interactions cross many islands, making duplicated runtimes/coordination worse than an application shell.
- **Structure:** server/static renderer emits full content; only declared islands ship component code and hydrate by load/idle/visibility/interaction policy.
- **Trade-offs:** low JavaScript and resilient content, but cross-island state, duplicate dependencies, hydration scheduling, and framework constraints.
- **Mistakes / related:** preserve accessible server HTML, reserve layout space, and measure total duplicated runtime. This is a rendering/deployment choice, not a domain architecture.

## Web delivery techniques (supporting, not general design patterns)

- **Code/bundle splitting and dynamic import:** load code at route, visibility, or interaction boundaries; include error/loading states and avoid tiny request waterfalls.
- **Prefetch vs preload:** prefetch likely future resources at low priority; preload only current critical resources. Measure bandwidth/priority effects.
- **PRPL:** historically “Push/Preload, Render, Pre-cache, Lazy-load.” Treat it as a delivery checklist; HTTP/2 server push is deprecated in major browsers, so prefer preload/modulepreload and measured caching.
- **Facade embeds:** replace costly third-party widgets with accessible static previews until interaction; disclose delayed behavior.
- **Virtualization:** render a bounded visible window for measured large-list cost; preserve focus, semantics, item identity, and accessibility.

These techniques optimize delivery and rendering; they do not justify factories, services, or distributed boundaries.
