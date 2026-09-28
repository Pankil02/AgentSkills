# Structural Patterns

These patterns compose classes and objects into larger structures. Each entry lists **Use**, **Avoid**, a **Shape**, and **Pitfalls**.

## Adapter
- **Use:** make an incompatible interface (third-party SDK, legacy API, vendor payload) fit the interface your code expects.
- **Avoid:** the interfaces already match, or a one-line mapping function is enough.
- **Shape:**
  ```ts
  class StripeGateway implements PaymentGateway { constructor(private sdk: Stripe) {} pay(a) { return this.sdk.charges.create(map(a)) } }
  ```
- **Pitfalls:**
  - Leaking vendor types past the adapter.
  - Silently changing semantics (errors, units, nulls).
  - Hiding remote latency.
- **At domain scale** this becomes an Anti-Corruption Layer.

## Decorator
- **Use:** add responsibilities dynamically and in combinations (logging, caching, retry, metrics, compression, coffee add-ons) without a subclass for every combination.
- **Avoid:** only one fixed extra behavior. Put it inline or in middleware.
- **Shape:** implements the same interface as the wrapped object. `new Cached(new Retrying(new HttpClient()))`. In FP, `withRetry(fn)`.
- **Pitfalls:** wrapper order matters and is implicit (document it), long wrapper stacks are hard to debug, and identity checks break.

## Proxy
- **Use:** control access to an object that keeps the same interface:
  - Virtual: lazy loading.
  - Protection: auth checks.
  - Caching.
  - Remote.
  - Rate limiting.
- **Avoid:** adding new behavior (that is Decorator) or simplifying an API (that is Facade).
- **Shape:** holds the real subject and checks, loads, or caches before delegating to it.
- **Pitfalls:** hiding network or failure behavior behind a local-looking call, and cache invalidation.

## Composite
- **Use:** part–whole trees where clients treat a leaf and a group the same way (file system, org chart, UI tree, menu, bill of materials).
- **Avoid:** flat collections, or when leaf and group operations really differ.
- **Shape:** `interface Node { size(): number }`. `File` returns its own value and `Folder` sums its children.
- **Pitfalls:** child-management methods on leaves (LSP violation), cycles, and deep recursion cost.

## Facade
- **Use:** give a simple, stable entry point to a complex subsystem (`checkout()` coordinating inventory, payment, and shipping; home-theater `watchMovie()`).
- **Avoid:** a thin pass-through layer that adds nothing.
- **Shape:** a single class or module whose methods orchestrate subsystem calls. Clients can still use the subsystem directly if they need to.
- **Pitfalls:** the facade grows into a god object, and business rules end up inside it.

## Flyweight
- **Use:** very large numbers of similar objects exhaust memory (text characters/glyphs, map tiles, game particles, trees in a forest).
- **Avoid:** until profiling shows memory pressure.
- **Shape:** split intrinsic state (shared and immutable, e.g. texture or font) from extrinsic state (per-use, e.g. x/y position). A `FlyweightFactory` caches shared instances by key.
- **Pitfalls:** mutable shared state, thread safety of the factory cache, and added complexity for small savings.

## Bridge
- **Use:** two dimensions vary independently and inheritance would multiply them into M×N classes (shape × renderer, notification × channel, device × remote).
- **Avoid:** only one dimension varies. Use Strategy.
- **Shape:** the abstraction holds a reference to an implementor interface, and each side has its own hierarchy.
- **Pitfalls:** designing a Bridge up front with no second dimension.
