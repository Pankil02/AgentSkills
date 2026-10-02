# Architectural Options & Decisions

## Key Architectural Decisions {#options-decisions}

### Alert Evaluation Engine {#alert-engine}

| Option | Verdict | Rationale & Downside | Revisit Trigger |
|---|---|---|---|
| **Option A (Recommended)**: Batch Polling via DB Index | **Chosen** | Zero additional infrastructure; leverages existing PostgreSQL btree/gin indexes. | Alert count > 50,000 or evaluation time > 5 min. |
| **Option B**: Kafka / Flink Streaming Pipeline | Rejected | Massive operational overhead, new infrastructure costs, multi-system failure modes. | Sub-second alert latency requirement. |
| **Option C**: Redis In-Memory Inverted Index | Rejected | Memory cost, state synchronization complexity on cluster restarts. | DB CPU exceeds 60% during batch window. |

### Technical details {#options-technical}

- Option A evaluates queries in batches of 100 with `last_evaluated_at` cursor.
- DB load during 15-minute cron is estimated at <4% CPU.
