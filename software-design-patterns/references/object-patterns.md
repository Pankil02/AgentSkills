# Object and Module Patterns

Canonical catalog for object/module collaboration. **GoF** marks the classic 23. Entries distinguish intent from similar structure; a language feature or function may implement the role without a class.

## Creational patterns

### Simple Factory / Static Factory

- **Intent:** Centralize a small creation decision and expose a meaningful construction API.
- **Use when:** selection, defaults, validation, caching, or concrete types should be hidden from callers.
- **Avoid when:** a constructor/object literal is already clear or there is no creation decision.
- **Structure:** `create(kind, config) -> Product`; a static/named factory may return its declaring type, subtype, or cached value.
- **Trade-offs:** one discoverable seam, but a type switch changes for every new variant.
- **Mistakes / related:** “No `new` keyword” does not itself make a useful factory. Compare Factory Method, Abstract Factory, Builder, and DI.

### Factory Method — GoF

- **Intent:** Let a creator's operation defer one product-creation step to an extension point.
- **Use when:** creator workflow is stable but the product chosen by a subclass, plugin, callback, or specialization varies.
- **Avoid when:** callers can inject the product/dependency or a simple factory is sufficient.
- **Structure:** `Creator.operation()` calls `createProduct(): Product`; concrete creators supply that method. Languages may use a function parameter instead of inheritance.
- **Trade-offs:** decouples workflow from product, at the cost of extra creator variants and indirect construction.
- **Mistakes / related:** a standalone switching function is Simple Factory, not classical Factory Method. Compare Abstract Factory and Template Method.

### Abstract Factory — GoF

- **Intent:** Create a compatible family of related products without exposing concrete classes.
- **Use when:** products have multiple dimensions but one family/theme/platform must be selected and mixed families would be invalid.
- **Avoid when:** only one product type varies, compatibility is irrelevant, or direct DI configuration is clearer.
- **Structure:** factory contract has one operation per product kind; each concrete factory returns one coherent family.
- **Trade-offs:** adding a family is localized; adding a product kind changes every factory. Wiring and type count grow.
- **Mistakes / related:** do not create a factory hierarchy for one constructor. Factory operations are often Factory Methods; Builder handles staged assembly.

### Builder — GoF

- **Intent:** Construct a complex or validated value incrementally, optionally producing different representations from a shared process.
- **Use when:** order matters, construction has stages, immutable output needs many optional values, or invalid partial objects must not escape.
- **Avoid when:** named/default parameters, a validated constructor, or a small configuration value is enough.
- **Structure:** builder accumulates parts, validates in `build()`, and returns a complete product; an optional director owns a reusable sequence.
- **Trade-offs:** readable construction and centralized validation, but mutable intermediate state and duplicate fields/API can drift.
- **Mistakes / related:** a fluent setter wrapper is not automatically the GoF form. Define reuse/thread-safety semantics. Compare Abstract Factory and Prototype.

### Prototype — GoF

- **Intent:** Create a new object by copying a configured exemplar rather than knowing its concrete construction.
- **Use when:** setup is expensive, concrete types/configuration arrive at runtime, or many objects begin from curated templates.
- **Avoid when:** normal construction is cheap or copying identity, resources, closures, and mutable graphs is ambiguous.
- **Structure:** prototype exposes copy/clone (or serialization/copy function); optional registry maps keys to exemplars.
- **Trade-offs:** avoids constructor hierarchies and preserves configuration, but deep-copy policy, cycles, versioning, and resource ownership are hard.
- **Mistakes / related:** JavaScript's prototype chain is language inheritance, not this cloning pattern. Never duplicate database IDs, locks, sockets, or subscriptions blindly.

### Singleton — GoF

- **Intent:** Enforce one instance within a defined scope and provide access to it.
- **Use when:** one process/runtime owner is a real invariant—such as one hardware handle or lifecycle coordinator—and the scope is explicit.
- **Avoid when:** the goal is convenient global access, shared mutable configuration/state, or merely one instance “for now.”
- **Structure:** scope controls construction and lifetime; consumers preferably receive the instance through DI rather than calling a global accessor.
- **Trade-offs:** coordinates ownership, but hides dependencies, couples tests, complicates reset/concurrency, and says nothing about cluster-wide uniqueness.
- **Mistakes / related:** module caching or a DI “singleton lifetime” may be enough. Use leader election/leases for distributed exclusivity; never assume private constructors defeat reflection/serialization in every language.

### Object Pool

- **Intent:** Bound and reuse expensive or scarce live resources.
- **Use when:** measured creation cost or an external capacity limit justifies reuse—database connections are the standard case.
- **Avoid when:** objects are cheap, immutable values can be shared, the runtime already pools them, or state cannot be reset safely.
- **Structure:** bounded pool supports acquire with deadline/cancellation and release/discard; validates, resets, and replaces unhealthy resources.
- **Trade-offs:** amortizes setup and caps pressure, but introduces contention, leaks, starvation, stale state, fairness, and shutdown complexity.
- **Mistakes / related:** always release in a guaranteed cleanup path; do not pool merely to reduce allocations without profiling. Compare Flyweight (shared immutable state) and Thread Pool (work execution).

### Dependency Injection

- **Intent:** Separate object behavior from dependency selection and lifecycle by supplying dependencies externally.
- **Use when:** implementations vary, I/O needs test seams, or a composition boundary should own wiring/lifetimes.
- **Avoid when:** passing a local value/function is already obvious, or a container would obscure a tiny program.
- **Structure:** a composition root creates dependencies and passes them through constructors/parameters; a container is optional.
- **Trade-offs:** explicit substitution and dependency direction, but more wiring and possible runtime configuration errors.
- **Mistakes / related:** container lookups inside domain code are Service Locator. Prefer required constructor injection; keep optional dependencies genuinely optional. DI is a technique supporting Dependency Inversion, not the same thing as it.

### Provider / Scoped Context

- **Intent:** Supply a dependency/value to descendants within an explicit scope (request, component tree, coroutine context).
- **Use when:** many nested consumers share stable ambient context such as theme, locale, trace, or request identity.
- **Avoid when:** a dependency is required by only a few callers, updates are frequent/broad, or origin and ownership become invisible.
- **Structure:** provider establishes a scoped value; consumers request it through the framework's context mechanism; nested providers may override it.
- **Trade-offs:** avoids plumbing through uninterested layers, but creates ambient coupling and can trigger broad updates.
- **Mistakes / related:** split by concern, provide safe defaults or fail clearly outside scope, and do not turn context into a mutable service locator. Compare DI and Observer.

## Structural patterns

### Adapter — GoF

- **Intent:** Translate an existing interface/protocol into the contract a client expects.
- **Use when:** integrating legacy/third-party code, converting data/protocol semantics, or protecting a boundary from vendor types.
- **Avoid when:** both sides can adopt one contract directly or translation would conceal an irreconcilable semantic mismatch.
- **Structure:** adapter implements Target, owns/calls Adaptee, and maps operations, values, errors, and lifecycle.
- **Trade-offs:** localizes compatibility but adds a maintenance point and can lose information or performance.
- **Mistakes / related:** translate semantics, not just names; test with contract tests. A Facade simplifies, Proxy controls, Decorator augments; an Anti-Corruption Layer may contain several adapters.

### Bridge — GoF

- **Intent:** Decouple two independently varying dimensions so their combinations use composition rather than a subclass cross-product.
- **Use when:** both abstraction variants and implementation/platform variants are real, independently extensible axes.
- **Avoid when:** one axis has a single stable option or ordinary composition already communicates the design.
- **Structure:** Abstraction owns an Implementor contract; refined abstractions and concrete implementors evolve separately.
- **Trade-offs:** avoids combinatorial subclasses, but adds delegation and two concept hierarchies.
- **Mistakes / related:** identify both axes with current examples before adding it. Adapter usually retrofits incompatibility; Strategy varies one delegated behavior.

### Composite — GoF

- **Intent:** Represent a part–whole tree so clients can apply meaningful operations uniformly to leaves and groups.
- **Use when:** recursive structures such as UI trees, expressions, files, or organization nodes share operations.
- **Avoid when:** leaves and containers have fundamentally different contracts or the graph can contain arbitrary cycles.
- **Structure:** Component operation; Leaf performs it; Composite owns children and combines/delegates it recursively.
- **Trade-offs:** simple recursive clients, but a broad common interface may permit invalid leaf operations and mutation complicates parent/cycle invariants.
- **Mistakes / related:** keep child-management methods on composites when type safety matters; define ownership and traversal. Iterator traverses; Visitor adds operations.

### Decorator — GoF

- **Intent:** Add optional, composable responsibilities around one object while preserving its client-facing contract.
- **Use when:** logging, metrics, authorization, compression, caching, or other behaviors vary per instance and wrapper order is meaningful.
- **Avoid when:** behavior changes the core contract/identity, order cannot be made safe, or one direct implementation is clearer.
- **Structure:** each decorator implements Component, owns another Component, and acts before/after delegation.
- **Trade-offs:** flexible composition without subclass combinations, but wrapper stacks obscure identity, ordering, error behavior, and debugging.
- **Mistakes / related:** document ordering and exactly-once side effects; do not expose concrete-component assumptions. Proxy controls access/lifecycle; middleware is often a functional decorator/chain.

### Facade — GoF

- **Intent:** Offer a focused, stable, higher-level API for common operations across a complex subsystem.
- **Use when:** callers repeat orchestration, subsystem details leak, or a boundary needs a simpler use-case vocabulary.
- **Avoid when:** the facade only forwards every low-level method or would become the sole god gateway for unrelated concerns.
- **Structure:** facade owns/cooperates with subsystem components and exposes cohesive coarse-grained operations; direct subsystem access may or may not remain public by design.
- **Trade-offs:** reduces coupling and call chatter, but can hide capability or accumulate policy and bottlenecks.
- **Mistakes / related:** return boundary-owned types and preserve failure semantics. Adapter changes a contract; API Gateway is a deployment-edge facade with operational duties.

### Flyweight — GoF

- **Intent:** Share immutable intrinsic state among a very large number of logical objects while keeping context-specific extrinsic state outside.
- **Use when:** profiling shows memory dominated by repeated equal state and logical identity does not require a unique full object.
- **Avoid when:** object count is modest, state is mostly unique/mutable, or lookup/computation costs outweigh savings.
- **Structure:** factory interns flyweights by intrinsic key; clients store/pass extrinsic state to operations.
- **Trade-offs:** large memory savings, but more indirection, external state plumbing, lookup cost, and identity surprises.
- **Mistakes / related:** flyweights must be safely shareable; spreading/copying intrinsic fields into every instance defeats the pattern. Compare interning, cache, and Prototype.

### Proxy — GoF

- **Intent:** Stand in for a subject to control access, location, creation, or lifecycle while retaining its contract.
- **Use when:** lazy loading, authorization, remote access, caching, synchronization, or reference accounting belongs at an access boundary.
- **Avoid when:** a distinct explicit API would better expose latency/failure, or interception makes behavior surprising.
- **Structure:** Proxy implements Subject and delegates to/creates RealSubject, adding control before or after calls.
- **Trade-offs:** transparent substitution, but hidden I/O, stale cache, security mistakes, identity differences, and per-call overhead.
- **Mistakes / related:** never imply a remote call has local latency/reliability; preserve language proxy invariants. Decorator adds responsibility; Adapter changes interface; Facade changes granularity.

### Module

- **Intent:** Encapsulate related behavior/data behind a small public API and enforce a namespace and dependency boundary.
- **Use when:** code has one cohesive responsibility, internals should vary independently, or dependency direction needs enforcement.
- **Avoid when:** creating catch-all “utils/common” modules, one-file-per-trivial-symbol fragmentation, or barrels that create cycles and accidental APIs.
- **Structure:** explicit exports/public members; private internals; dependencies supplied/imported in one direction; tests target public behavior.
- **Trade-offs:** native low-cost encapsulation, but module globals can become hidden singleton state and boundaries can erode without tooling.
- **Mistakes / related:** a module is not inherently Singleton or a deployable service. Prefer the language's native module system over legacy IIFEs/namespace emulation.

### Mixin / Trait

- **Intent:** Reuse a small orthogonal capability across otherwise unrelated types without a single base-class chain.
- **Use when:** the language has explicit trait/mixin composition and conflicts/requirements are visible.
- **Avoid when:** copied methods depend on hidden mutable state, names collide, origin is hard to trace, or delegation/composable functions are clearer.
- **Structure:** consuming type explicitly includes capabilities; each capability declares required operations and conflict resolution.
- **Trade-offs:** horizontal reuse, but implicit coupling, method-resolution complexity, and fragile state composition.
- **Mistakes / related:** avoid runtime prototype mutation and deep mixin stacks. Prefer hooks/composables/modules where idiomatic; this is not multiple-domain inheritance.

Persistence-oriented structural patterns—**Repository**, **DAO**, **Data Mapper**, **Identity Map**, and **Lazy Load**—are canonicalized in [domain-data-patterns.md](domain-data-patterns.md) to keep their transaction and ownership semantics together.

## Behavioral patterns

### Chain of Responsibility — GoF

- **Intent:** Pass a request through ordered handlers until one handles, rejects, routes, or terminates it.
- **Use when:** handlers/order are configurable and the sender should not select a receiver.
- **Avoid when:** every step must run in a fixed transform sequence (use Pipeline) or one direct decision table is clearer.
- **Structure:** each handler returns an explicit outcome such as handled/continue/error and may invoke the next handler.
- **Trade-offs:** flexible composition and local handlers, but order dependence, hidden control flow, and accidentally unhandled requests.
- **Mistakes / related:** define terminal/default behavior and error semantics; do not rely on implicit fall-through. Middleware often combines Chain and Decorator.

### Command — GoF

- **Intent:** Represent an action request as a value/object independent of when and by whom it is invoked.
- **Use when:** actions need queueing, scheduling, logging, authorization, serialization, history, macro composition, or undo.
- **Avoid when:** a direct call/callback suffices or commands would merely mirror every service method.
- **Structure:** command carries required immutable input and invokes a receiver/handler; invoker controls execution. Undo, result, and persistence are optional capabilities.
- **Trade-offs:** decoupled scheduling and first-class actions, but more types, stale serialized schemas, and complex exactly-once/undo semantics.
- **Mistakes / related:** undo needs captured prior state or a compensating command; remote commands need idempotency. Strategy represents how; Command represents what to request.

```text
CommandBus.handle(ReserveStock(orderId, items))
  -> ReserveStockHandler(inventoryPort).execute(command)
```

### Interpreter — GoF

- **Intent:** Represent a small grammar as expressions and evaluate sentences/trees in that language.
- **Use when:** a stable, simple DSL or rule expression benefits from an explicit AST and composable evaluation.
- **Avoid when:** grammar, diagnostics, performance, ambiguity, or untrusted input requires a mature parser/evaluator.
- **Structure:** terminal and nonterminal expression nodes implement `evaluate(context)`; parser/build step creates the AST.
- **Trade-offs:** grammar rules are extensible and testable, but class/node count and parse/evaluation complexity grow rapidly.
- **Mistakes / related:** constrain recursion/resources and separate parsing from evaluation. Consider parser combinators, generated parsers, Specification, or a safe existing expression language.

### Iterator — GoF

- **Intent:** Traverse an aggregate through a stable protocol without exposing its representation.
- **Use when:** traversal is lazy, custom, resumable, or uniform across structures.
- **Avoid when:** the language's iterable/generator or collection operation already expresses it.
- **Structure:** iterator owns cursor state and yields next/done (or the aggregate supplies an internal iterator/generator).
- **Trade-offs:** hides representation and supports streaming, but mutation invalidation, resource cleanup, errors, and concurrent iteration need policy.
- **Mistakes / related:** use standard protocols and close disposable streams on early exit. Iterator traverses; Visitor performs type-specific operations.

### Mediator — GoF

- **Intent:** Encapsulate the coordination protocol among a bounded set of colleagues so they do not directly depend on one another.
- **Use when:** a dialog/workflow has dense peer interactions and one explicit coordinator makes rules clearer.
- **Avoid when:** direct collaboration is simple, events need broad decoupled fan-out, or the mediator would absorb domain behavior indiscriminately.
- **Structure:** colleagues report meaningful events/requests to mediator; mediator invokes colleagues according to workflow rules.
- **Trade-offs:** reduces many-to-many dependencies, but centralizes complexity and can become a god object.
- **Mistakes / related:** scope one mediator to one collaboration. An event bus routes messages without necessarily owning workflow; middleware is Chain/Pipeline, not Mediator by default.

### Memento — GoF

- **Intent:** Capture restorable state without exposing an originator's internal representation to its caretaker.
- **Use when:** bounded undo, checkpoints, drafts, or rollback require opaque snapshots.
- **Avoid when:** state is huge/non-copyable, an operation log is cheaper, or durable versioned persistence is the actual need.
- **Structure:** originator creates/restores opaque memento; caretaker stores it without interpreting internals.
- **Trade-offs:** preserves encapsulation, but snapshots consume memory, retain sensitive data, and couple restoration to versions.
- **Mistakes / related:** bound history, define deep-copy/resource semantics, and protect/expire durable snapshots. Compare Command history and Event Sourcing.

### Observer — GoF

- **Intent:** Maintain an in-process one-to-many subscription so a subject directly notifies dependents of changes.
- **Use when:** a bounded object/component lifecycle has multiple dynamic reactions and direct callbacks would be duplicated.
- **Avoid when:** one caller can invoke directly, cross-process durability is needed, or implicit synchronous reentrancy is unsafe.
- **Structure:** subject owns subscriptions and dispatches a typed event/snapshot; subscription returns an unsubscribe/disposable handle.
- **Trade-offs:** dynamic fan-out and loose concrete coupling, but lifecycle leaks, ordering, reentrancy, slow/failing observers, and event cascades.
- **Mistakes / related:** define sync/async, error isolation, mutation-during-notify, and unsubscribe behavior. Publish–Subscribe inserts a channel/broker and stronger decoupling.

### State — GoF

- **Intent:** Make substantial behavior and valid transitions depend explicitly on an object's current lifecycle state.
- **Use when:** operations differ across several states, invalid transitions matter, and conditionals are dispersed or growing.
- **Avoid when:** a small enum plus one transition table/function remains clearer.
- **Structure:** context holds current state; state handlers implement state-specific operations; transition ownership is deliberately centralized or delegated.
- **Trade-offs:** localizes state behavior and exposes transitions, but adds types and can scatter the transition graph.
- **Mistakes / related:** model events, guards, and illegal transitions explicitly; test the full transition table. Strategy is externally selected behavior, not lifecycle progression.

```text
next = transitions[(currentState, event)] ?? reject
state = next.state
return next.effect
```

Use a table like this until state-specific behavior is large enough to justify state objects.

### Strategy — GoF

- **Intent:** Encapsulate interchangeable algorithms behind one contract so the client is independent of the selected mechanism.
- **Use when:** multiple real algorithms vary by runtime/configuration and need isolated tests or composition.
- **Avoid when:** there is one implementation, a short function argument suffices, or variants are lifecycle states.
- **Structure:** context receives Strategy and delegates the varying operation; strategy may be a function, object, closure, type class, or protocol implementation.
- **Trade-offs:** replaceable behavior and fewer selection conditionals, but more concepts and selection still belongs somewhere.
- **Mistakes / related:** runtime setters are not required; immutable constructor injection is often safer. Policy names a business decision; Template Method uses inheritance.

### Template Method — GoF

- **Intent:** Fix an algorithm's sequence in a base operation while allowing subclasses to implement selected steps/hooks.
- **Use when:** a genuinely stable framework lifecycle already uses inheritance and variants differ at controlled points.
- **Avoid when:** variants need runtime composition, independent reuse, or the base contract is likely to evolve.
- **Structure:** non-overridable template calls required primitive operations and narrowly defined optional hooks.
- **Trade-offs:** deduplicates sequence and controls extension, but creates fragile base-class coupling and subclass call-order assumptions.
- **Mistakes / related:** do not expose many hooks or call overridable methods during construction. Prefer Strategy when composition can express the variation.

### Visitor — GoF

- **Intent:** Add type-specific operations to a stable set of element variants without placing every operation on those elements.
- **Use when:** element kinds are closed/stable but new cross-cutting operations over them are frequent.
- **Avoid when:** element kinds change often, operations belong naturally on elements, or the language has exhaustive pattern matching over sealed ADTs.
- **Structure:** each element `accept(visitor)` dispatches to an overloaded/type-specific `visit(ElementType)`—double dispatch.
- **Trade-offs:** adding operations is localized; adding an element changes every visitor, and elements may expose internals.
- **Mistakes / related:** do not use reflection/type switches disguised as Visitor unless that is idiomatic and exhaustive. Compare Iterator and pattern matching.

### Null Object

- **Intent:** Supply an object with valid neutral behavior where absence is an expected, semantically meaningful option.
- **Use when:** callers can uniformly invoke a no-op logger/metric/notification and “do nothing” is correct.
- **Avoid when:** absence is an error, missing configuration must fail fast, or a result/option type communicates absence better.
- **Structure:** immutable implementation of the same narrow contract with identity/neutral results and no surprising side effects.
- **Trade-offs:** removes scattered null checks, but can silently mask wiring defects and lose diagnostic context.
- **Mistakes / related:** name it explicitly (`NoOpAuditSink`) and test neutral laws. Do not claim every Command requires one.

### Policy

- **Intent:** Give a business or operational decision rule an explicit, replaceable name separate from the mechanism that enforces it.
- **Use when:** eligibility, pricing, authorization, routing, retention, or retry decisions vary by tenant/configuration and carry domain meaning.
- **Avoid when:** one obvious condition has no independent lifecycle or variation.
- **Structure:** policy takes decision inputs/context and returns a typed decision/reason; application/domain service applies it. Often implemented as Strategy or composed Specifications.
- **Trade-offs:** auditable and testable decisions, but proliferating tiny policies can fragment understanding.
- **Mistakes / related:** keep effects outside pure policy when possible; distinguish a decision from execution. Compare Strategy (mechanism) and Specification (composable proposition).

The **Specification** pattern is canonicalized with domain rules in [domain-data-patterns.md](domain-data-patterns.md).
