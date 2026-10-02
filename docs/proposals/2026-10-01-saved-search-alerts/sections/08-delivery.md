# 🚀 Delivery & Implementation Plan

## 📁 Proposed File Map {#delivery-files}

```text
src/features/saved-searches/
├── alerts-controller.ts         # HTTP routes for creating/listing/deleting searches
├── alert-evaluator.ts           # Background worker batch logic
├── repository.ts                # Database query helpers with SKIP LOCKED
└── types.ts                     # Schema and filter contracts
```

## 📝 Ordered Implementation Checklist {#delivery-steps}

- [ ] Step 1: Database migration adding `saved_searches` and `search_alert_dispatches` tables with indexes.
- [ ] Step 2: Implementation of `alerts-controller.ts` with Zod validation schema.
- [ ] Step 3: Implementation of `alert-evaluator.ts` worker query with `SKIP LOCKED`.
- [ ] Step 4: Unit and integration tests verifying deduplication and tenant isolation.
- [ ] Step 5: Production deployment and feature flag enable for 5% beta cohort.

## 🔁 Rollout & Rollback Strategy {#delivery-rollout}

- 🚀 **Rollout**: Additive migration applied ahead of code release. Cron job enabled via environment flag.
- ⏪ **Rollback**: Disable cron flag in worker service; API continues to read existing tables without alert triggers.

## 🤖 Fresh-Chat Handoff Prompt {#delivery-handoff}

```text
Implement the saved search alerts feature specified in:
  docs/proposals/2026-10-01-saved-search-alerts/proposal.md

Preserve the batch polling architecture and avoid message queues.
Verify the SKIP LOCKED concurrency queries against PostgreSQL before merge.
```
