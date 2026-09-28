# Creational Patterns

These patterns control how objects are created. Each entry gives **Use**, **Avoid**, a code **Shape**, and **Pitfalls**.

## Singleton
- **Use:** exactly one instance is a genuine invariant per process: config snapshot, connection pool, logger, hardware handle.
- **Avoid:** most cases. Prefer a DI container's singleton scope or a module-level instance that you inject. A global Singleton hides dependencies and breaks tests.
- **Shape:** private constructor plus a static `getInstance()`. In JS/Python a module export is already a singleton.
- **Pitfalls:**
  - Thread safety: use eager init, a holder idiom, `enum` (Java), or double-checked locking with `volatile`.
  - Serialization and reflection can create extra instances.
  - "One per process" does not mean one per cluster.
  - Mutable global state.

## Builder
- **Use:** objects with many optional parameters, required-before-build validation, or step-wise assembly (HTTP requests, queries, test fixtures).
- **Avoid:** languages with named/default args or options objects. Use `new X({ a, b })` when there are few fields.
- **Shape:**
  ```ts
  new PizzaBuilder().size('L').addTopping('olive').build(); // build() validates, returns immutable product
  ```
- **Pitfalls:** a mutable product after `build()`, missing validation in `build()`, and builders written for 2–3 fields.

## Factory (Simple Factory / Factory Method)
- **Use:** callers need a product through an interface without knowing the concrete class, and the choice depends on input or config (`NotificationFactory.create('sms')`).
- **Simple/static factory:** one function or map that returns the concrete type. This is the default.
- **Factory Method:** a creator class declares `createX()` and subclasses decide the product. Use it only when a framework hook needs it.
- **Avoid:** a single concrete class. Just call `new`.
- **Pitfalls:** a factory that turns into a growing `switch` (use a registry map instead), and a factory per class.

## Abstract Factory
- **Use:** families of related products that must stay consistent (the Windows/Mac UI kit, AWS/GCP clients, light/dark theme components).
- **Avoid:** a single product type (use a plain Factory) or a single family.
- **Shape:** `interface UIFactory { button(); checkbox() }` with `WinFactory` and `MacFactory`. The client receives one factory.
- **Pitfalls:** adding a new product type forces changes to every factory.

## Prototype
- **Use:** creating an object is expensive (heavy init, DB/config load) or you need copies of a configured exemplar (game units, document templates).
- **Avoid:** cheap construction. Plain spread/`copy()`/`structuredClone` is usually enough.
- **Shape:** `interface Prototype<T> { clone(): T }`, optionally with a registry of named prototypes.
- **Pitfalls:** shallow vs deep copy bugs, cloning cyclic graphs, and copying identity fields such as IDs.

## Dependency Injection (companion)
- **Use:** always, for I/O, clock, random, and external services. Pass them in through the constructor or a parameter.
- **Prefer** constructor injection plus a composition root over a Service Locator, which hides dependencies.
- **Object Pool:** reuse scarce, expensive resources (DB connections, threads). Keep it bounded, reset objects on return, and prefer the pool your library provides.
