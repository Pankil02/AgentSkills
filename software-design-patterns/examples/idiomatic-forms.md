# Idiomatic Pattern Forms

Pattern roles do not require one class per box. Start with the language's smallest native abstraction and promote it only when lifecycle, substitution, or ownership requires more.

## Strategy as a TypeScript function

```ts
type ShippingQuote = (cart: Cart, destination: Address) => Promise<Money>;

export class Checkout {
  constructor(private readonly quoteShipping: ShippingQuote) {}

  total(cart: Cart, destination: Address): Promise<Money> {
    return this.quoteShipping(cart, destination);
  }
}
```

A function is enough while the strategy has one operation. Use an object/interface when several operations share state, lifecycle, or invariants.

## Decorator as a higher-order function

```ts
type Handler<I, O> = (input: I, signal: AbortSignal) => Promise<O>;

function withMetrics<I, O>(
  name: string,
  metrics: Metrics,
  next: Handler<I, O>,
): Handler<I, O> {
  return async (input, signal) => {
    const started = performance.now();
    try {
      const result = await next(input, signal);
      metrics.observe(name, "ok", performance.now() - started);
      return result;
    } catch (error) {
      metrics.observe(name, "error", performance.now() - started);
      throw error;
    }
  };
}
```

Wrapper order, cancellation, errors, and exactly-once side effects remain part of the contract even without decorator classes.

## Python consumer-owned Protocol

```py
from datetime import datetime, timedelta
from typing import Protocol

class Clock(Protocol):
    def now(self) -> datetime: ...

class ExpiryPolicy:
    def __init__(self, clock: Clock, lifetime: timedelta) -> None:
        self._clock = clock
        self._lifetime = lifetime

    def is_expired(self, created_at: datetime) -> bool:
        return self._clock.now() >= created_at + self._lifetime
```

The protocol belongs near the consumer. A container and abstract base class are unnecessary unless the repository already uses them for a real boundary.

## State as a closed algebraic data type

```rust
enum OrderState {
    Draft,
    Submitted { submitted_at: Instant },
    Cancelled { reason: String },
}

enum Event {
    Submit { at: Instant },
    Cancel(String),
}

fn transition(state: OrderState, event: Event) -> Result<OrderState, DomainError> {
    match (state, event) {
        (OrderState::Draft, Event::Submit { at }) =>
            Ok(OrderState::Submitted { submitted_at: at }),
        (OrderState::Draft, Event::Cancel(reason)) =>
            Ok(OrderState::Cancelled { reason }),
        (current, attempted) => Err(DomainError::IllegalTransition { current, attempted }),
    }
}
```

This is preferable to State objects while the state set is closed and behavior is compact. Promote to state-specific collaborators only when operations become substantial or extensions are independently owned.

## Go interface at the consumer boundary

```go
type UserLoader interface {
    ByID(ctx context.Context, id UserID) (User, error)
}

type GetProfile struct {
    users UserLoader
}
```

Define the narrow interface where it is consumed, not beside the implementation as an interface-per-class convention. Keep `context.Context`, deadlines, and errors visible.

## Framework-owned patterns

Before implementing a custom event bus, iterator, object pool, DI container, middleware pipeline, router, or lifecycle manager, inspect the framework's native mechanism. Wrap it only when a stable consumer-owned semantic boundary is needed; do not duplicate framework infrastructure merely to attach a pattern name.
