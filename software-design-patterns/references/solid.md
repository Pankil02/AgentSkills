# SOLID & OOP Baseline

Apply to every new or modified class/module. Each principle: rule → violation smell → fix.

## OOP essentials
- **Encapsulation:** keep state private; expose behavior, not fields. Default to the narrowest access modifier.
- **Abstraction:** depend on what something does (interface/protocol/function type), not how.
- **Inheritance:** only for true is-a with shared invariants. Otherwise compose.
- **Polymorphism:** replace type-checks with a method call on a common contract.
- **UML (for design notes):** `A ──▷ B` inherits · `A ┈┈▷ B` implements · `A ◆── B` composition (owns lifecycle) · `A ◇── B` aggregation (shares) · `A ──> B` dependency.

## S — Single Responsibility
- **Rule:** one reason to change (one actor/stakeholder).
- **Smell:** class mixes business rules + persistence + formatting/notification; name contains "And"/"Manager".
- **Fix:** split by reason to change: `Invoice` (rules), `InvoiceRepository` (storage), `InvoicePrinter` (output).

## O — Open/Closed
- **Rule:** add behavior by adding code, not editing stable code.
- **Smell:** every new variant edits the same `switch`/`if` chain, often in several places.
- **Fix:** polymorphism, Strategy, a registry map, or Decorator. Apply only after the 2nd variant appears.

## L — Liskov Substitution
- **Rule:** a subtype must be usable anywhere its base is, with no surprises.
- **Smell:** override throws `NotSupported`, weakens postconditions, strengthens preconditions, or callers do `instanceof` checks. Classic: `Square extends Rectangle`, `Penguin extends Bird.fly()`.
- **Fix:** split the contract (`Bird` / `FlyingBird`), or compose instead of inheriting.

## I — Interface Segregation
- **Rule:** clients shouldn't depend on methods they don't use.
- **Smell:** fat interface; implementers leave stubs/empty methods.
- **Fix:** role interfaces (`Printer`, `Scanner`) combined as needed. Prefer small, client-owned interfaces.

## D — Dependency Inversion
- **Rule:** high-level policy depends on abstractions; details implement them.
- **Smell:** business logic calls `new MySqlClient()`, `fetch`, `Date.now()`, or SDKs directly; untestable without I/O.
- **Fix:** inject the dependency (constructor/parameter) via an interface owned by the high-level module. Wire concretes at the composition root.

```ts
// DIP + SRP: policy owns the port, detail implements it, root wires them.
interface Notifier { send(to: string, msg: string): Promise<void> }
class OrderService { constructor(private notifier: Notifier) {} }
class SmsNotifier implements Notifier { async send() { /* SDK call */ } }
const service = new OrderService(new SmsNotifier()); // composition root
```

## Companion principles
- **DRY:** dedupe knowledge, not coincidental look-alike code.
- **KISS / YAGNI:** no abstraction for hypothetical futures.
- **Law of Demeter:** avoid `a.getB().getC().do()`; ask the direct collaborator.
- **Composition over inheritance; program to interfaces; favor immutability; fail fast with validated inputs.**
