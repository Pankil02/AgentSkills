# Architecture Evolution with a Transactional Outbox

## Situation

An order module commits an order and then publishes `OrderConfirmed`. A process crash between those operations loses the event. The team proposes extracting Orders as a microservice to “make events reliable.”

## Forces

- The actual defect is a database/broker dual write.
- Orders and Billing still release together and share frequent cross-module changes.
- Independent scaling, deployment, data ownership, and on-call ownership are not demonstrated.
- Consumers tolerate eventual delivery but not permanent loss; duplicate delivery is possible.

## Decision

Keep a **modular monolith**, enforce the Orders boundary, and add a **Transactional Outbox** inside the existing local transaction. Distribution does not solve atomic publication.

```text
modules/
  orders/        # owns order behavior, tables, use cases, integration events
  billing/       # consumes versioned OrderConfirmed; cannot write order tables
  platform/
    messaging/   # relay mechanism, not domain event ownership
```

The use case commits state and its integration fact together:

```sql
BEGIN;

UPDATE orders
SET status = 'confirmed', version = version + 1
WHERE id = :order_id AND version = :expected_version;

INSERT INTO outbox (
  event_id, aggregate_id, aggregate_version, event_type,
  schema_version, payload, occurred_at
) VALUES (
  :event_id, :order_id, :new_version, 'OrderConfirmed',
  1, :payload, :occurred_at
);

COMMIT;
```

A relay publishes committed rows. Marking a row after publish can fail, so repeated publication is expected:

```text
load unpublished rows in bounded batches
for each row:
  publish(topic, key=aggregate_id, event_id, schema_version, payload)
  mark published if still unmarked
```

The consumer claims an event ID atomically with its local effect:

```sql
BEGIN;
INSERT INTO inbox (consumer, event_id, received_at)
VALUES (:consumer, :event_id, :now)
ON CONFLICT DO NOTHING;

-- Continue only if the insert won; then apply the local billing effect.
COMMIT;
```

## Rejected alternatives

- **Publish after commit:** retains the crash gap.
- **Publish before commit:** can expose an event for state that later rolls back.
- **Retry alone:** cannot determine safely whether publication succeeded and can duplicate effects.
- **Microservices now:** adds network partial failure and operational cost without fixing the dual write.
- **Distributed transaction:** unnecessary when business state and Outbox can share one local database transaction.

## Migration and ownership

1. Establish Orders as a module with an explicit API and table ownership.
2. Version `OrderConfirmed`; exclude secrets and unstable internal object graphs.
3. Deploy Outbox writes before enabling the relay.
4. Make consumers idempotent and test duplicate/reordered delivery.
5. Backfill or reconcile events for the rollout window.
6. Alert on oldest unpublished age, relay failures, duplicate rate, and Inbox growth.
7. Define retention, redrive, and schema compatibility ownership.
8. Consider service extraction later only if independent deployment/scaling/failure or team ownership becomes concrete.

## Verification

- Roll back the transaction and prove no Outbox row remains.
- Commit, kill the process before relay, restart, and prove eventual publication.
- Publish the same event repeatedly and prove one consumer effect.
- Deliver later aggregate versions out of order and verify the declared ordering policy.
- Exercise broker outage, relay backlog, malformed payload, and schema compatibility.
- Measure transaction cost, relay lag, and cleanup behavior under expected load.

The patterns address separate forces: module boundaries control coupling and ownership; Outbox closes the local commit/publication gap; idempotency handles repeated attempts. None implies microservices.
