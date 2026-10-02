# Planning Reference & Enterprise Rubric

This reference guides AI coding agents through feature intake, architectural evaluation, quantitative workload calculations, evidence-based trade-offs, and enterprise failure case analysis.

---

## 1. Intake: Clarify Before Designing

When a feature request arrives, prevent premature architecture or speculative infrastructure. If decision-blocking dimensions are ambiguous, ask up to 3 targeted questions covering:

| Dimension | Purpose | Example Question |
|---|---|---|
| **Actors & Outcome** | Clarify user value and success state | Who initiates this flow, and what observable state change defines success? |
| **Existing System** | Maximize reuse of existing boundaries | Which existing modules, tables, endpoints, and background jobs touch this domain? |
| **Scope & Exclusions** | Prevent scope creep | What is the minimum viable delivery, and what is explicitly out of scope? |
| **Workload & Scale** | Size compute, storage, and I/O | What is the expected active user count, peak request rate (QPS), and read/write ratio? |
| **Latency Budgets** | Bound end-to-end performance | What are the p50, p95, and p99 client-perceived response time targets? |
| **Data Invariants** | Preserve business integrity | Is eventual consistency acceptable, or is atomic transaction serializability required? |
| **Delivery & Deadlines** | Honor project constraints | What are the deployment milestones, compliance boundaries, or forbidden dependencies? |

Confirm understanding with:
- One plain-language outcome sentence (<=25 words).
- Explicit in-scope acceptance criteria and non-goals.
- Explicit assumptions labeled with IDs (`ASM-01`, `ASM-02`), categories, confidence ratings, and revisit triggers.

---

## 2. Evidence Gathering & Citations

Before designing new solutions, inspect the active codebase:
1. **Entry Points & Callers**: Verify how requests currently enter the application (controllers, handlers, CLI routers).
2. **Data Stores & Schemas**: Inspect existing tables, migration files, index definitions, and connection pools.
3. **Query Patterns**: Check query builders, ORM models, or raw SQL queries to observe existing join complexity and scanning behavior.
4. **Tests & Contracts**: Inspect test suites to understand verified invariants and error handling.

Cite active code explicitly:
- Format: `<path/to/file.ext:line>` or `<path/to/file.ext:symbol>`.
- Distinguish between **observed** behavior in existing code and **proposed** new behavior.
- Never invent metrics, benchmark results, or query timings; label unverified values as `target`, `estimate`, or `assumption`.

---

## 3. Architecture Evaluation & Decision Contract

Evaluate 2–3 viable, realistic end-to-end architectures for each substantive decision. Never present synthetic straw-man alternatives to justify a preselected favorite.

### Priority Ranking
1. **Correctness & Security**: Never compromise atomicity, tenant isolation, or access controls for speed.
2. **Workload & Latency Budgets**: Meet declared p95 and p99 targets under stated peak load.
3. **Minimal Resource Work**: Eliminate unnecessary database round-trips, scans, allocations, and wire bytes before introducing caches, queues, or workers.
4. **Operational Simplicity**: Favor single-process and native database capabilities over distributed microservices.
5. **Maintainability & Growth**: Clear module boundaries with explicit revisit triggers.

### Decision Template
For each architectural decision:
- **Chosen Option (Recommended)**: The simplest approach satisfying correctness and workload requirements.
- **Accepted Downside**: The explicit operational, latency, or storage trade-off accepted by choosing this option.
- **Rejected Alternatives**: Concrete operational, complexity, consistency, or performance flaws that disqualified them.
- **Confidence Rating**: High / Medium / Low based on verified evidence.
- **Revisit Trigger**: Measurable quantitative threshold (e.g. ">1,000 writes/sec" or ">100 GB table size") that justifies re-evaluating the decision.

---

## 4. Quantitative System-Design & Workload Calculations

Do not size production systems from registered account counts alone. Always derive workloads from active users and concrete operations.

### Workload Sizing Formulas
- **Average QPS**:
  $$\text{Average QPS} = \frac{\text{Active Users} \times \text{Operations / User / Day}}{\text{Active Seconds / Day}}$$
  *(e.g., 200,000 DAU × 11 ops/day ÷ 28,800 active seconds/day ≈ 76.4 QPS)*
- **Peak QPS**:
  $$\text{Peak QPS} = \text{Average QPS} \times \text{Burst Factor}$$
  *(Always document whether burst factor is an observed telemetry metric or an explicitly labeled assumption).*
- **In-Flight Requests (Little's Law)**:
  $$L = \lambda \times W$$
  Where $\lambda$ is arrival rate (requests/second) and $W$ is mean duration (seconds). Note: Little's Law governs mean steady-state concurrency; it does not determine p99 latency, safe pool size, or burst headroom.
- **App CPU Cores Needed**:
  $$\text{Cores} \approx \frac{\text{QPS} \times \text{CPU ms / op}}{1,000 \times \text{Target Utilization}}$$
  *(Target utilization typically 0.50–0.70 to allow reserve for GC, TLS handshakes, and bursts).*
- **Database Connection Occupancy**:
  $$\text{Occupied Connections} \approx \text{DB Ops / sec} \times \text{Mean Connection-Held Time (seconds)}$$
  *(Size pool considering total app instances and database `max_connections` limits; never assume 1 HTTP request equals 1 connection).*
- **End-to-End Latency Critical Path**:
  $$\text{Latency} \approx \sum \text{Sequential I/O Hops} + \text{Queue Wait} + \text{CPU Time} + \text{Serialization / Wire}$$
  *Critical rule: Never sum individual stage p99 percentiles and label the sum an observed end-to-end p99.*
- **Data Transfer & Wire Size**:
  Distinguish raw data size, serialized JSON/Protobuf payload, compressed HTTP representation (gzip/Brotli), and stored blob size.
  Use exact byte counts: `1 KB = 1,000 bytes`, `1 KiB = 1,024 bytes`, `1 MB = 1,000,000 bytes`, `1 MiB = 1,048,576 bytes`.
- **HTTP Compression vs. Archive ZIP**:
  HTTP gzip/Brotli is dynamic wire compression; ZIP is a filesystem archive container. Never recommend ZIP for tiny API responses. For archive extraction, document byte bounds, entry count/depth limits, traversal protection, and streaming memory bounds.
- **Blob Storage Selection**:
  Evaluate: (a) Database byte columns vs. (b) Dedicated object store with metadata rows vs. (c) Local filesystem storage. Compare transaction overhead, cache/CDN fitness, egress cost, signed URL lifespans, and upload size limits.

---

## 5. Specialist Completeness Rubric & Statuses

For every material operation, evaluate the applicable dimensions using compact tables:

| Dimension | Minimum Applicable Detail | Validation & Evidence |
|---|---|---|
| **Workload** | Registered users, DAU, ops/user/day, active window, QPS, read/write mix, tenant skew, burst factor, concurrency. | Production telemetry or labeled assumptions (`ASM-NN`). |
| **Database** | Queries/op, rows scanned vs returned, index coverage, lock duration, connection holding time, pool occupancy. | Query execution plan (`EXPLAIN ANALYZE`) or query model analysis. |
| **CPU** | CPU ms/op, parse/validation cost, serialization/crypto work, hot-loop complexity, worker saturation. | Microbenchmark on reference hardware or labeled estimate. |
| **Memory** | Baseline RSS/heap, per-request buffer size, AST/allocation spikes, cache bounds, batch limits. | Heap profiling, steady-state vs peak RSS measurement. |
| **Latency** | Client-visible boundary, p50/p95/p99 targets, critical path hops, timeout/retry tail behavior. | End-to-end timed trace or synthetic load test. |
| **Transfer** | Request/response raw bytes, encoded wire bytes, batch/page limits, daily bandwidth, egress costs. | Measured serialization on representative payloads. |
| **Blob / Object** | Typical/p95/max bytes (in bytes and KiB/MiB), metadata separation, retention/deletion lifecycle. | Inventory sample or enforced schema size constraints. |
| **Compression** | Identity vs gzip/Brotli ratio, CPU decompression overhead, decompression memory limit. | Payload-specific compression benchmark. |
| **Capacity** | Baseline/peak/stress outcomes, first saturation bottleneck, horizontal scaling limits, headroom. | Load testing to failure or step-stress modeling. |
| **Cost & Ops** | Storage growth/month, backup replication, egress fees, cache/service costs, monitoring effort. | Current pricing rates or marked unknown with owner. |

### Evidence Status Values
Every metric or quantitative assertion must be tagged with exactly one status:
- `observed`: Directly measured in live code, telemetry, or benchmark traces.
- `target`: Explicit requirement or SLA established by product/business stakeholders.
- `estimate`: Calculated from concrete formulas and stated workload parameters.
- `assumption`: Unmeasured baseline assumption requiring validation (`ASM-NN`).
- `unknown`: Acknowledged unknown; must include assigned owner and measurement plan.
- `N/A`: Dimension is not applicable; **must include concrete reason and applicability trigger**.

### N/A Justifications Rule
Never leave a dimension blank. If a dimension does not apply (e.g. a local client tool has no database), explicitly state:
> *Database: N/A — System runs entirely as a client-side static tool with no server or persistent data store. Applicability trigger: If multi-user synchronization or server persistence is introduced.*

---

## 6. Audience Layering & Communication Standards

Structure substantive proposals so that executives, managers, developers, and designers can navigate them without friction:

1. **Plain-Language Summary**: Every substantive section begins with a clear outcome sentence (<=25 words) explaining what is delivered and why.
2. **Terminology at First Use**: Define all domain and technical jargon on first introduction (e.g., *"p99 latency: the duration within which 99% of requests complete"*), then use consistent terms throughout.
3. **Optional Single Analogy**: Use at most one concise analogy for complex mechanisms, explicitly stating its limit (e.g., *"Like a library checkout desk, peak queues occur when readers arrive in bursts, not based on total cardholders"*).
4. **Consequences to Users**: Explain user-facing impact of technical decisions (latency wait, staleness, retry loops, error recovery).
5. **Specialist Details in Accordions**: Place deep technical specifications, schemas, queries, and failure matrices inside `### Technical details {#slug}`, which render into native collapsible `<details>` elements in the local viewer.

---

## 7. Enterprise Failure Matrix & Security Checklist

Review all 10 enterprise failure dimensions. Provide concrete mitigations and verification tests, or provide a justified N/A:

1. **Input Validation**: Missing fields, payload bounds (bytes), Unicode normalization, boundary validation.
2. **Permissions & Tenancy**: Tenant isolation predicates, object-level authorization, role privilege escalation defenses.
3. **Sensitive Data & PII**: Redaction in logs/traces, encryption in flight and at rest, retention and deletion policies.
4. **Concurrency & Races**: Simultaneous double-submits, lost updates, optimistic concurrency version predicates, idempotency keys.
5. **Consistency & Transactions**: Transaction boundaries, atomic rollback, handling partial failures across systems.
6. **Failure & Resilience**: Upstream timeouts, circuit breakers, bounded retries with exponential backoff and jitter, graceful degradation.
7. **Database Contention**: N+1 query elimination, covering compound indexes, cursor pagination, connection pool exhaustion.
8. **Scale & Throttling**: Rate limiting per tenant/user, burst absorption, memory bounds on batch processing.
9. **Lifecycle & Cleanup**: Soft-deletion invariants, orphaned resource cleanup, archival and purging schedules.
10. **Operations & Observability**: Structured JSON logging, core metrics/counters, actionable alerting thresholds, rollback readiness.
