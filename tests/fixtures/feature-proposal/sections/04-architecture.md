# System Architecture & Flow

## Component Overview {#architecture-components}

The feature introduces one API controller for search persistence and one scheduled runner for alert processing.

- **Web Client**: Allows users to save search filters.
- **Alert API**: Validates search filter queries and saves alert records.
- **Worker Job**: Periodic runner reading pending alerts.
- **PostgreSQL**: Stores alert definitions and tracks dispatched notifications.

## Request & Data Flow {#request-flow}

```diagram-json
{
  "schemaVersion": 1,
  "id": "alert-processing-flow",
  "type": "graph",
  "title": "Alert Evaluation Pipeline",
  "summary": "Worker reads alerts, runs indexed query against items, and writes dispatches.",
  "nodes": [
    { "id": "user", "label": "Web Client", "detail": "Configures alert", "lane": 0, "order": 0, "role": "actor" },
    { "id": "api", "label": "Alerts API", "detail": "Validates & Saves", "lane": 1, "order": 0, "role": "service" },
    { "id": "db", "label": "PostgreSQL", "detail": "Alerts & Dispatches", "lane": 2, "order": 0, "role": "store" },
    { "id": "worker", "label": "Cron Worker", "detail": "Runs every 15m", "lane": 1, "order": 1, "role": "service" },
    { "id": "mailer", "label": "Email Service", "detail": "Sends digests", "lane": 3, "order": 1, "role": "external" }
  ],
  "edges": [
    { "id": "e1", "from": "user", "to": "api", "label": "POST /saved-searches", "kind": "sync" },
    { "id": "e2", "from": "api", "to": "db", "label": "Save search", "kind": "sync" },
    { "id": "e3", "from": "worker", "to": "db", "label": "Query new items", "kind": "data" },
    { "id": "e4", "from": "worker", "to": "mailer", "label": "Send email", "kind": "async" }
  ]
}
```

### Technical details {#architecture-technical}

| Component | Responsibility | Failure Policy |
|---|---|---|
| Alerts API | Validates filter payload bounds | Returns 400 Bad Request on malformed queries |
| Cron Worker | Executes batched evaluations | Logs error, advances cursor on fatal error, retries transient timeouts |
| Email Service | Transports email message | Bounded exponential backoff; max 3 retries |
