# Performance & Workload Budgets

## Workload Budgets {#performance-budgets}

| Dimension | Baseline | Peak Target | Stress Boundary |
|---|---|---|---|
| User Writes (Create Alert) | 2 req/s | 10 req/s | 50 req/s |
| Worker Alert Evaluations | 300 / min | 1,000 / min | 5,000 / min |
| p95 Write Latency | <= 40 ms | <= 80 ms | <= 150 ms |
| Cron Job Execution Window | 45 seconds | 120 seconds | 300 seconds |

## Critical Path Analysis {#performance-critical-path}

$$\text{Alert Creation Latency} = T_{\text{JWT}} + T_{\text{JSON validation}} + T_{\text{DB INSERT}}$$

```diagram-json
{
  "schemaVersion": 1,
  "id": "alert-sequence-perf",
  "type": "sequence",
  "title": "Alert Evaluation Execution",
  "summary": "Sequence diagram demonstrating worker batch evaluation cycle.",
  "participants": [
    { "id": "worker", "label": "Worker" },
    { "id": "db", "label": "PostgreSQL" },
    { "id": "mail", "label": "Email API" }
  ],
  "messages": [
    { "id": "m1", "from": "worker", "to": "db", "label": "SELECT pending alerts (LIMIT 100)", "kind": "request" },
    { "id": "m2", "from": "db", "to": "worker", "label": "Return 100 alert rows", "kind": "response" },
    { "id": "m3", "from": "worker", "to": "db", "label": "Find matching items (indexed)", "kind": "request" },
    { "id": "m4", "from": "db", "to": "worker", "label": "Return new items", "kind": "response" },
    { "id": "m5", "from": "worker", "to": "mail", "label": "POST /v1/send (batched)", "kind": "async" },
    { "id": "m6", "from": "worker", "to": "db", "label": "INSERT INTO dispatches ON CONFLICT DO NOTHING", "kind": "request" }
  ]
}
```

### Technical details {#performance-technical}

- Batch evaluation consumes under 40 MB RSS memory in worker process.
- Bounded batch size of 100 ensures DB connection lock duration remains < 250ms per iteration.
