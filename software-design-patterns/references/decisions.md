# Decisions: Confusable Patterns & Worked Refactor

## Confusable pairs
| Choice | Pick first when | Pick second when |
|---|---|---|
| Strategy vs State | client selects algorithm | object's status selects behavior & transitions itself |
| Strategy vs Template Method | vary whole algorithm via composition | fixed skeleton, vary steps (inheritance) — prefer Strategy |
| Strategy vs Command | *how* to do something | *what* to do, as a storable/undoable request |
| Adapter vs Facade | convert one interface to another expected one | simplify many subsystem interfaces into one |
| Decorator vs Proxy | add behavior, stackable | control access (lazy/auth/cache/remote), same behavior |
| Adapter vs Bridge | fix existing mismatch (after the fact) | design two independent hierarchies (up front) |
| Factory vs Abstract Factory | one product type | consistent families of products |
| Builder vs Factory | step-wise assembly of one complex object | choose which concrete type to create |
| Prototype vs Factory | copy configured exemplar | construct fresh from inputs |
| Observer vs Mediator | one subject broadcasts to many listeners | many peers coordinate through a hub |
| Observer vs Pub/Sub | in-process, synchronous, subject knows listeners | broker-decoupled, async, cross-process |
| Chain of Responsibility vs Pipeline | any handler may stop/handle | every stage always runs |
| Composite vs Decorator | tree of many children | single wrapped component |
| Memento vs Command undo | restore snapshot of state | invert the action (`undo()`) |
| Repository vs DAO | domain aggregates, collection semantics | table/row-level data access |
| Inheritance vs Composition | strict is-a, LSP holds | everything else |
| DI vs Service Locator | always DI | legacy frameworks only |

## Worked refactor: Ride-sharing app (all categories combined)
Symptom-driven evolution — introduce each pattern only when the force appears.

| Force | Pattern | Result |
|---|---|---|
| Fare logic `switch(rideType)` growing | **Strategy** | `FareStrategy` per `economy/premium/pool` |
| Driver matching varies (nearest, rating, surge) | **Strategy** | `MatchingStrategy` injected |
| Ride lifecycle `REQUESTED→ACCEPTED→ONGOING→COMPLETED/CANCELLED`; illegal transitions | **State** | each state allows only its valid actions |
| Rider/driver notified on status change | **Observer** | `RideEvents.subscribe(notifier)` |
| SMS/email/push vendors differ | **Adapter** + **Factory** | `NotificationFactory.for(channel)` returns adapter |
| Payment providers (card, wallet, UPI) | **Strategy** + **Adapter** | `PaymentMethod` over vendor SDKs |
| Ride request has many optional fields | **Builder** | `RideRequest.builder()...build()` validates |
| Single ride-matching engine / config | DI singleton scope | injected, not global `getInstance()` |
| Booking flow touches pricing, matching, payment | **Facade** | `RideService.book()` orchestrates |
| Retry + logging on payment calls | **Decorator** | `withRetry(withLogging(gateway))` |
| Business logic calling DB directly | **Repository** + **DIP** | `RideRepository` interface, SQL impl in infra |

Checklist after refactor: each class has one reason to change (SRP); new ride type = new file, no edits (OCP); states/strategies are substitutable (LSP); small role interfaces (ISP); services depend on interfaces injected at the composition root (DIP).
