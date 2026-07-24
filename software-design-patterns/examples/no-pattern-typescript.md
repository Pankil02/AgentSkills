# No Pattern: Keep an Exhaustive TypeScript Function

## Situation

A checkout module calculates one of three stable delivery estimates. The variants are local, have no independent dependencies or lifecycle, and change with the same team and release.

```ts
type DeliveryMethod = "standard" | "express" | "pickup";

export function estimatedDays(method: DeliveryMethod): number {
  switch (method) {
    case "standard": return 5;
    case "express": return 2;
    case "pickup": return 0;
    default: return assertNever(method);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled delivery method: ${String(value)}`);
}
```

## Forces

- The set is closed and compiler-checked.
- Selection and behavior are in one small, cohesive place.
- There is no runtime plugin, per-tenant algorithm, external dependency, or separate ownership.
- Tests can call one pure function directly.

## Decision

Use **no named pattern**. Keep the discriminated union and exhaustive function.

A lookup table would also be reasonable if every result remains a constant:

```ts
const DAYS = {
  standard: 5,
  express: 2,
  pickup: 0,
} satisfies Record<DeliveryMethod, number>;
```

## Rejected alternative

Three `DeliveryStrategy` classes plus a factory add files, names, wiring, and an indirect call without making a current change or test cheaper. “Open for extension” is not free; this set is deliberately closed.

## Verification

```ts
import { describe, expect, it } from "vitest";
import { estimatedDays } from "./delivery";

describe("estimatedDays", () => {
  it.each([
    ["standard", 5],
    ["express", 2],
    ["pickup", 0],
  ] as const)("maps %s to %i days", (method, days) => {
    expect(estimatedDays(method)).toBe(days);
  });
});
```

Escalate to Strategy only if mechanisms acquire independent dependencies, release cadence, configuration, substantial behavior, or third-party extension points.
