# 🏛️ System Architecture & Flow

## 🧩 Component Overview {#architecture-components}

The feature introduces one API controller for search persistence and one scheduled runner for alert processing.

- 👤 **Web Client**: Allows users to save search filters.
- ⚙️ **Alert API**: Validates search filter queries and saves alert records.
- ⚙️ **Worker Job**: Periodic runner reading pending alerts.
- 🗄️ **PostgreSQL**: Stores alert definitions and tracks dispatched notifications.

## 🔄 Request & Data Flow {#request-flow}

```diagram-json
{
  "schemaVersion": 1,
  "id": "alert-processing-flow",
  "type": "graph",
  "title": "Enterprise Alert Evaluation Pipeline",
  "summary": "Multi-tier ingestion, caching, transactional persistence, read-replica evaluation, and asynchronous notification delivery.",
  "nodes": [
    { "id": "user", "label": "Client Browser", "detail": "Web & Mobile Client", "role": "actor", "icon": "browser" },
    { "id": "cdn", "label": "Cloudflare CDN", "detail": "Edge Caching & TLS", "role": "external", "icon": "cdn" },
    { "id": "gateway", "label": "Load Balancer & API GW", "detail": "Traffic Distribution & Auth", "role": "service", "icon": "load-balancer" },
    { "id": "api", "label": "Application Server", "detail": "Alerts & Rule Engine", "role": "service", "icon": "app-server" },
    { "id": "cache", "label": "Redis Cache", "detail": "Hot Filter Store (TTL 15m)", "role": "store", "icon": "redis" },
    { "id": "db", "label": "SQL Database (Primary)", "detail": "Alert Configs & Dispatches", "role": "store", "icon": "database" },
    { "id": "queue", "label": "Kafka Event Queue", "detail": "Buffered Evaluation Stream", "role": "queue", "icon": "queue" },
    { "id": "worker", "label": "Cron Worker", "detail": "Batched Scheduler Runner", "role": "service", "icon": "worker" },
    { "id": "mailer", "label": "Third-Party API", "detail": "Outbound SMTP / Webhooks", "role": "external", "icon": "external" }
  ],
  "edges": [
    { "id": "e1", "from": "user", "to": "cdn", "label": "HTTPS Request", "kind": "sync" },
    { "id": "e2", "from": "cdn", "to": "gateway", "label": "Origin Forward", "kind": "sync" },
    { "id": "e3", "from": "gateway", "to": "api", "label": "Balance Traffic", "kind": "sync" },
    { "id": "e4", "from": "api", "to": "cache", "label": "Cache Query Spec", "kind": "data" },
    { "id": "e5", "from": "api", "to": "db", "label": "Atomic SQL Write", "kind": "sync" },
    { "id": "e6", "from": "api", "to": "queue", "label": "Enqueue Trigger", "kind": "async" },
    { "id": "e7", "from": "queue", "to": "worker", "label": "Poll Batch (100 msgs)", "kind": "async" },
    { "id": "e8", "from": "worker", "to": "db", "label": "Execute Index Query", "kind": "data" },
    { "id": "e9", "from": "worker", "to": "mailer", "label": "Send Email Digest", "kind": "async" }
  ]
}
```

### ⚙️ Technical details {#architecture-technical}

| 🌐 Component | 📋 Responsibility | 🛡️ Failure Policy |
|---|---|---|
| Alerts API | Validates filter payload bounds | Returns 400 Bad Request on malformed queries |
| Cron Worker | Executes batched evaluations | Logs error, advances cursor on fatal error, retries transient timeouts |
| Email Service | Transports email message | Bounded exponential backoff; max 3 retries |
