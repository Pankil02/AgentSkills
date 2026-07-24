# Sources and Further Reading

Use this bibliography to verify terminology and deepen a decision. The skill synthesizes these traditions rather than treating any source as universally prescriptive.

## Object design and refactoring

- Erich Gamma, Richard Helm, Ralph Johnson, John Vlissides, *Design Patterns: Elements of Reusable Object-Oriented Software* — canonical GoF intents and trade-offs.
- Martin Fowler, *Refactoring: Improving the Design of Existing Code* — behavior-preserving, incremental structural change.
- Joshua Kerievsky, *Refactoring to Patterns* — introducing and removing patterns through refactoring rather than speculative design.
- Robert C. Martin, *Agile Software Development: Principles, Patterns, and Practices* — dependency and responsibility principles; apply pragmatically.

## Enterprise, domain, and architecture

- Martin Fowler, *Patterns of Enterprise Application Architecture* — data-source, domain-logic, object-relational, and distribution patterns.
- Eric Evans, *Domain-Driven Design* — ubiquitous language, bounded contexts, aggregates, and strategic modeling.
- Vaughn Vernon, *Implementing Domain-Driven Design* — practical context, aggregate, application, and integration guidance.
- Len Bass, Paul Clements, Rick Kazman, *Software Architecture in Practice* — quality attributes, architectural tactics, and evidence-based trade-offs.
- Neal Ford, Rebecca Parsons, Patrick Kua, *Building Evolutionary Architectures* — fitness functions and incremental architectural change.
- Sam Newman, *Building Microservices* and *Monolith to Microservices* — service forces, ownership, and migration patterns.

## Messaging, concurrency, and reliability

- Gregor Hohpe, Bobby Woolf, *Enterprise Integration Patterns* — messaging channels, routing, transformation, and endpoints.
- Michael Nygard, *Release It!* — stability patterns including timeouts, circuit breakers, bulkheads, and operational feedback.
- Martin Kleppmann, *Designing Data-Intensive Applications* — replication, partitioning, transactions, streams, and consistency trade-offs.
- Chris Richardson, *Microservices Patterns* — Saga, Outbox, service decomposition, and distributed data management.
- Andrew S. Tanenbaum, Maarten van Steen, *Distributed Systems* — coordination, failure, time, and consistency foundations.

## Maintenance rules

- Prefer primary language/framework/runtime documentation for APIs and lifecycle behavior.
- Re-check platform-sensitive web, cloud, and framework claims before prescribing configuration.
- Separate a source's canonical definition from modern idiomatic implementations using functions, protocols, ADTs, traits, middleware, or managed services.
- Record material semantic changes in `metadata.version`, update the coverage audit, and add an eval that would have caught the old guidance.
