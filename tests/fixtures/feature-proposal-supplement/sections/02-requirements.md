# Requirements & Scope

## Actors & User Stories {#requirements-stories}

- **Search User**: Wants to save a complex search query and receive an email when new items appear.
- **System Worker**: Reads active alert criteria, finds newly added items, and dispatches email notifications.

## Acceptance Criteria & Non-Goals {#requirements-criteria}

### In Scope
- [x] CRUD endpoints for user saved searches.
- [x] Background evaluation job running every 15 minutes.
- [x] Email dispatch with deduplication on `(alert_id, item_id)`.

### Explicit Non-Goals
- Real-time streaming or WebSocket alert delivery.
- In-app notification bell center (deferred to v2).

## Scale Assumptions & Evidence {#requirements-scale}

| Metric | Target / Assumption | Source / Observation |
|---|---|---|
| Total Users | 10,000 accounts | Current platform baseline |
| Saved Searches | ~5,000 queries | ~0.5 alerts per user |
| New Items / Hour | ~200 items | Write rate to primary catalog |

### Glossary {#requirements-glossary}
- **Saved Search**: A stored JSON filter payload linked to a user account.
- **Alert Dispatch**: An idempotent delivery of matching items to user email.
