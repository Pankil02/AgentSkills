# Overview

## Executive Summary {#overview-summary}

Notify users of new search matches using scheduled batch queries on existing tables.

- **Primary Goal**: Deliver daily or hourly digests for saved search queries.
- **Core Recommendation**: Reuse existing PostgreSQL indexes and a scheduled cron job; no Kafka or external queue.
- **Key Trade-off**: Alerts have up to 1-hour latency instead of sub-second real-time streaming.

## Readiness & Assumptions {#overview-assumptions}

| ID | Category | Assumption / Status | Confidence | Revisit Trigger |
|---|---|---|---|---|
| `ASM-01` | Volume | <= 5,000 active saved alerts across system | High | Active alerts exceed 25,000 |
| `ASM-02` | Latency | Batch evaluation every 15 minutes is acceptable | High | SLA requires instant push notification |

### Technical details {#overview-technical}

- Status: `ready`
- Estimated implementation: 3 engineering days
- See [Architecture Flow](#request-flow) and [Storage Specification](#storage-spec) for data movement.
