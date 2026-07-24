# Adapter Migration in TypeScript

## Situation

Application code directly consumes a vendor payment SDK. Vendor response types and error codes have spread into use cases, and a new SDK must be introduced without changing the public checkout contract.

## Forces

- The application needs one stable operation: authorize a payment with a deadline and idempotency key.
- Vendor errors, money representation, cancellation, and uncertain outcomes differ.
- Existing checkout behavior must remain available for rollback.
- A remote call must not be disguised as a cheap local property access.

## Decision

Define a consumer-owned port and implement one Adapter per SDK. Select the adapter only at the composition root.

```ts
export type Money = Readonly<{ currency: string; minorUnits: number }>;

export type Authorization = Readonly<{
  authorizationId: string;
  status: "approved" | "declined";
}>;

export class PaymentUnavailable extends Error {}
export class PaymentOutcomeUnknown extends Error {}

export interface PaymentGateway {
  authorize(input: {
    orderId: string;
    amount: Money;
    idempotencyKey: string;
    signal: AbortSignal;
  }): Promise<Authorization>;
}
```

The adapter translates semantics, not only method names:

```ts
export class AcmePaymentAdapter implements PaymentGateway {
  constructor(private readonly client: AcmeClient) {}

  async authorize(input: {
    orderId: string;
    amount: Money;
    idempotencyKey: string;
    signal: AbortSignal;
  }): Promise<Authorization> {
    try {
      const result = await this.client.createCharge({
        reference: input.orderId,
        amount: input.amount.minorUnits,
        currency: input.amount.currency,
        requestKey: input.idempotencyKey,
        signal: input.signal,
      });

      return {
        authorizationId: result.chargeId,
        status: result.accepted ? "approved" : "declined",
      };
    } catch (error) {
      if (input.signal.aborted || isAbortError(error)) {
        throw error; // Preserve the caller's cancellation contract.
      }
      if (isDefinitePreSendFailure(error)) {
        throw new PaymentUnavailable("Payment provider unavailable", { cause: error });
      }
      throw new PaymentOutcomeUnknown(
        "Authorization may have completed; reconcile by idempotency key",
        { cause: error },
      );
    }
  }
}
```

Composition remains explicit:

```ts
const gateway: PaymentGateway = flags.useNewPayments
  ? new AcmePaymentAdapter(acmeClient)
  : new LegacyPaymentAdapter(legacyClient);
```

## Rejected alternatives

- **Facade only:** simplification does not address incompatible vendor semantics or protect the application model.
- **Abstract Factory:** there is one boundary dependency, not a compatible family of products.
- **Rewrite all callers:** increases migration and rollback risk unnecessarily.

## Incremental migration

1. Characterize current approved, declined, timeout, cancellation, and duplicate-request behavior.
2. Introduce the port using the existing adapter first; do not change behavior yet.
3. Run the same contract suite against both adapters.
4. Shadow safe requests or compare sandbox results, then enable by tenant or percentage.
5. Monitor latency, mapped error rates, unknown outcomes, and reconciliation backlog.
6. Keep a configuration rollback until the observation window closes; then remove leaked vendor types.

## Contract verification

```ts
export function paymentGatewayContract(
  name: string,
  createGateway: () => PaymentGateway,
) {
  describe(name, () => {
    it("maps an approval to the application contract", async () => {
      const result = await createGateway().authorize(approvedRequest());
      expect(result.status).toBe("approved");
      expect(result.authorizationId).not.toBe("");
    });

    it("forwards cancellation", async () => {
      const controller = new AbortController();
      controller.abort();
      await expect(
        createGateway().authorize(request({ signal: controller.signal })),
      ).rejects.toMatchObject({ name: "AbortError" });
    });

    it("does not classify an uncertain outcome as a safe failure", async () => {
      await expect(createGateway().authorize(timeoutAfterSendRequest()))
        .rejects.toBeInstanceOf(PaymentOutcomeUnknown);
    });
  });
}
```

Run this against the real vendor sandbox in addition to unit tests; mocks cannot prove vendor error and timeout semantics.
