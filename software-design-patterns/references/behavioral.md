# Behavioral Patterns

These patterns cover how objects communicate and share responsibility. Each entry lists **Use**, **Avoid**, a code **Shape**, and **Pitfalls**.

## Strategy
- **Use:** interchangeable algorithms chosen at runtime (pricing, routing, payment, sorting).
- **Avoid:** 2–3 stable branches in one place → keep an exhaustive `switch` or map.
- **Shape:**
  ```ts
  type FareStrategy = (trip: Trip) => Money;
  const fares: Record<RideType, FareStrategy> = { economy, premium, pool };
  fares[trip.type](trip);
  ```
- **Pitfalls:** building class hierarchies where plain functions would do, or letting callers know about every concrete strategy.

## State
- **Use:** behavior and allowed transitions depend on a lifecycle status (order, ride, vending machine, document).
- **Avoid:** few states with trivial behavior → use an enum plus a transition table.
- **Shape:** `context.state.handle(context)`. Each state class implements the same interface and sets `context.state = next`.
- **Pitfalls:** transitions scattered across states with no single view (keep a transition map or diagram); states holding context data.
- **vs Strategy:** the client picks a Strategy, while a State replaces itself.

## Memento
- **Use:** undo/redo, snapshots, checkpoint/rollback, and you must not expose internal state.
- **Avoid:** immutable values, where the previous value already serves as the snapshot.
- **Shape:** `Originator.save(): Memento` / `restore(m)`. A **Caretaker** holds `undo[]` and `redo[]` stacks and never reads memento internals.
- **Pitfalls:** unbounded history (cap it), deep-copy cost on large state (store diffs instead), and forgetting to clear redo when a new action happens.

## Observer
- **Use:** one-to-many change notification inside a process (UI updates, domain events, cache invalidation).
- **Avoid:** delivery across processes or that must be durable → use a message broker (Pub/Sub) or an Outbox.
- **Shape:**
  ```ts
  subject.subscribe(fn): Unsubscribe; subject.notify(event) // loops over listeners
  ```
- **Pitfalls:** memory leaks from missing unsubscribe, dependence on notification order, cascading updates, and one listener's exception breaking the others. Prefer native emitters, signals, or Rx.

## Command
- **Use:** turn a request into an object so it can be queued, logged, retried, undone, scheduled, or bound to UI (remote buttons, job queues, transactions).
- **Avoid:** a direct call with no queueing, undo, or audit need.
- **Shape:** `interface Command { execute(); undo?() }`. An **Invoker** stores and runs commands, and the **Receiver** does the work.
- **Pitfalls:** commands that carry too much logic (delegate to the receiver), and commands that are not serializable when you need to queue them.
- **Combine** with Memento for undo that requires restoring state.

## Template Method
- **Use:** a fixed algorithm skeleton where subclasses vary specific steps (data import: read → parse → validate → save).
- **Avoid:** in most modern code, prefer passing step functions (a higher-order function or Strategy) over inheritance.
- **Shape:** `final run() { a(); this.stepB(); c(); }` with an abstract `stepB()` and optional hooks.
- **Pitfalls:** fragile base classes, and subclasses overriding steps that should stay fixed.

## Iterator
- **Use:** sequential access to a custom collection (tree, paginated API, stream) without exposing its structure.
- **Avoid:** writing one by hand when the language already has iterators, generators, or streams (`Symbol.iterator`, `yield`, `Iterable<T>`).
- **Shape:** `hasNext()/next()`, or implement the language's iterable protocol. Lazy pagination with `async function*` is a good fit.
- **Pitfalls:** mutating the collection while iterating, and iterators that never release resources.

## Mediator
- **Use:** many components interact N×N (chat room, air-traffic control, form widgets, auction). Centralize the coordination.
- **Avoid:** only 2–3 collaborators, or a mediator that grows into a god object.
- **Shape:** components know only the `Mediator`. `mediator.notify(sender, event)` routes the event to the others.
- **Pitfalls:** the mediator absorbs domain logic (split it per use case), and the call flow becomes hidden.

## Chain of Responsibility
- **Use:** a request passes through ordered handlers, and each one handles it, passes it on, or stops it (middleware, approval levels, logging levels, validation).
- **Avoid:** one fixed sequence where every step always runs → call the steps in a plain pipeline.
- **Shape:** `handler.setNext(h2)`, then `handle(req) { if (canHandle) ...; else next?.handle(req) }`. Framework middleware is usually enough.
- **Pitfalls:** a request that falls off the end unhandled (add a terminal default), and hidden coupling to handler order.

## Visitor
- **Use:** add new operations over a stable, closed set of node types (AST, document export, tax rules across item types).
- **Avoid:** node types change often. Languages with sum types and pattern matching should use `match`/`switch` with exhaustiveness checks instead.
- **Shape:** `node.accept(v)` calls `v.visitX(this)` (double dispatch).
- **Pitfalls:** every new node type breaks every visitor, and visitors break encapsulation.

## Interpreter
- **Use:** a small, stable DSL or rule grammar (filters, feature-flag rules, calculators).
- **Avoid:** complex grammars → use a parser generator or an existing expression library.
- **Shape:** an expression tree (`Terminal`, `And`, `Or`) with `interpret(ctx)`. This is Composite plus recursion.
- **Pitfalls:** slow execution and poor error messages. Never `eval` untrusted input.

## Null Object
- **Use:** replace repeated `if (x != null)` checks with a do-nothing implementation (`NoopLogger`).
- **Avoid:** cases where absence is meaningful and must be handled → use `Optional`/`Result`.
