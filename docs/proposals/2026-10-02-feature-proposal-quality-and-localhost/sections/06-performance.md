# Performance

## Two different workloads {#quality-performance-scope}

The skill's browser tool has a few local readers; the systems it proposes may serve millions of accounts. Size each separately so we do not build cloud infrastructure for a local document viewer.

Analogy: millions of library members do not mean millions of people at the checkout desk simultaneously. Request rate depends on active readers and actions; averages still hide bursts and hot tenants.

All targets below are proposed budgets, not measured guarantees. Baseline observations are explicitly identified.

## Production proposal quantitative rubric {#quality-resource-rubric}

For each material operation and each viable architecture, author compact tables with operation, scenario, value/range, unit, evidence status and source/derivation. Status is one of observed, target, estimate, assumption, unknown or N/A. Unknown includes measurement/owner; N/A includes reason and applicability trigger.

| Dimension | Minimum applicable detail | Validation |
|---|---|---|
| Workload | Registered users; DAU; operations/user/day; active window; QPS; read/write mix; tenant skew; burst factor; concurrency; growth horizon. | Product telemetry or labelled assumptions; peak sensitivity. |
| Database | Queries/op; rows scanned/returned; query plan/index; row/index bytes; transaction/lock duration; DB CPU/I/O; pool utilization/wait; replication/WAL; retention/growth. | Representative EXPLAIN/ANALYZE or labelled query-plan expectation; production-safe measurement plan. |
| CPU | CPU ms/op at reference hardware; parse/validate/serialize/compress/encrypt cost; hot-loop complexity; cores/headroom; worker saturation. | Representative benchmark with hardware, payload mix, runtime and confidence. |
| Memory | Baseline RSS/heap; per-in-flight buffers/AST; allocation/GC; cache upper bounds; batch/queue bounds. | Steady and peak measurement, not file-size arithmetic alone. |
| Latency | Client-visible boundary; p50/p95/p99 targets; network/queue/DB/CPU hops; parallel critical path; cold/warm; timeout/retry paths. | Timed traces/load tests under same workload and error rate. |
| Transfer | Request/response raw bytes; encoded wire bytes; page/batch limits; download/upload/replication fan-out; daily bandwidth/egress. | Real serialization/compression sizes on representative data. |
| Blob/object | Typical/p95/max bytes; KB and KiB; metadata separation; object path; signed-link lifetime if used; retention/deletion; multipart/resume if applicable. | Representative content inventory and enforced limits. |
| Compression/ZIP | Identity vs gzip/Brotli; compression ratio; CPU time; decompressed bound; already-compressed bypass; archive needs and abuse limits. | Payload-specific benchmark and maximum expansion policy. |
| Capacity | Baseline/peak/stress outcomes; saturation resource; headroom; horizontal limits; hot-key/partition behavior; revisit triggers. | Load/soak/fault tests and explicit hardware/data assumptions. |
| Cost/operations | Storage, backups/replication, egress, cache/service cost, deploy/monitor effort; rate and currency assumptions. | Current quoted prices or unknown; avoid invented dollars. |

Use bytes as source unit; `KB = 1,000 bytes`, `KiB = 1,024 bytes`; distinguish Mbps from MB/s and GiB from GB. Do not label database data transferred as DB CPU or estimate an object's size from its ID.

## Calculation rules {#quality-performance-calculations}

- Average QPS = active users × operations/user/day ÷ active seconds/day. Peak QPS requires observed or explicitly assumed burst factor; registered-user count alone is insufficient.
- Average in-flight requests = arrival rate × mean duration, under steady state. Little's Law uses means; it does not establish p99, safe pool capacity or instantaneous burst capacity.
- App cores needed approximately = QPS × CPU milliseconds/op ÷ (1,000 × chosen target utilization). This excludes unmeasured GC/contention and needs a benchmark before provisioning.
- DB occupancy estimate = DB operations/s × mean connection-held seconds, adjusted for batching/concurrency/transactions. Do not size pools from whole HTTP request concurrency; include all app instances and DB max-connections budget.
- DB work includes query/row/byte amplification and locks, not just connection count. Do not assert “one indexed query” scans one row unless query/index/plan proves it.
- End-to-end latency follows critical sequential/parallel dependencies plus queue wait, CPU and transfer. Do not add stage p99 values and label the sum an observed end-to-end p99.
- Transfer bytes/day = operation counts × representative wire sizes; include read/write mix and replication/fan-out separately. Disk growth includes indexes, metadata, WAL/backups and retention policies.
- Raw content, encoded payload, compressed HTTP representation and stored blob are different sizes. Record each applicable boundary explicitly.
- Compression saves transfer at a CPU/memory cost. ZIP is an archive format, not interchangeable with HTTP gzip. Never recommend zipping tiny API messages by default.
- Bound retry amplification, queue length, page size and concurrent buffers. Identify the first saturation signal and graceful degradation behavior before claiming scalability.
- Evaluate blob storage choices only when needed: DB bytes vs object store with metadata rows vs existing file storage. Compare transaction/backup load, cache/CDN suitability, egress, access expiry, upload limits and deletion consistency; do not assume an object store always wins for tiny objects.
- If ZIP/archive extraction is proposed, require compressed/decompressed byte limits, entry-count/depth/time limits, no absolute/traversal paths or symlinks, and streaming/bounded memory. Already-compressed formats usually gain little; measure actual data.
- For production infrastructure, include availability zones/region needs, stateless scaling limits, TLS/trust/service identity, private data boundaries, backups/restore RPO/RTO, replica lag/failover, disaster recovery and deployment/rollback. Mark irrelevant dimensions N/A; do not build multi-region by default.

## Illustrative million-account calculation {#quality-scale-example}

This is a prompt-evaluation scenario, not a guarantee or template default:

- Assumptions: 1,000,000 registered users; 20% DAU = 200,000; 10 reads and 1 write each/day; 8-hour active window; assumed 10× peak factor.
- Average total QPS = 2,200,000 ÷ 28,800 = 76.39; assumed peak = 763.89 QPS. Validate burst factor, tenant skew and overlap; do not call this measured.
- Assumed app CPU cost 2 ms/op and target utilization 60% yields about 2.55 cores at assumed peak, before overhead/reserve. DB CPU is separate; account count does not determine machine count.
- Assumed 1 query/op and 8 ms mean DB connection-held time yields about 6.11 average occupied connections at assumed peak. This is not a safe pool recommendation; bursts, transactions, instances, DB limits and percentile wait require tests.
- At assumed mean 80 ms end-to-end duration, about 61.11 requests are in flight at assumed peak. This differs from DB-held occupancy and does not prove the p99 budget.
- Assumed 2,048-byte request and 20,480-byte raw read response: show exact bytes plus 2 KiB/20 KiB. If representative response compresses to 8,192 bytes, estimated read response transfer is 16.384 GB/day at 2,000,000 reads, excluding headers/replication. Compression size must be measured per payload.
- Blob scenario: typical 256 KiB = 262,144 bytes = 262.144 KB; max 5 MiB = 5,242,880 bytes. p95 remains unknown until sampled; do not invent it. ZIP may be N/A if blobs are already compressed media.
- Required comparison: reuse existing indexed DB/service; introduce cache only with measured read redundancy and invalidation contract; use async object/worker path only if blob/job workload requires it. No automatic sharding/microservice deployment.

## Skill and viewer budgets {#quality-tool-budgets}

| Resource | Verified baseline | Proposed acceptance target |
|---|---|---|
| SKILL.md UTF-8 bytes | 4,390 | <=3,584 bytes; no duplicate instructions. |
| Viewer source assets, raw | 137,511 / 134.29 KiB | <=102,400 bytes aggregate; prefer removing unnecessary work over minification. |
| Startup data | Metadata and selected tab/source via current routes | Same lazy shape; navigation map does not preload all AST/source. |
| Snapshot count | Current + previous | Max 2, one active refresh. |
| Bundle limits | 128 KiB/file; 1 MiB total; 24 docs | Unchanged security limits. |
| Network | Localhost, no polls | No periodic requests, external calls/fonts or auth lifecycle. |
| CPU during idle | Not measured | No recurring app JS work when idle; remove decorative continuous animations. |
| First usable view | Not measured | Target <500 ms warm local fixture, 30 reloads, reference machine/browser reported. |
| Small tab render | Not measured | Target <100 ms p95 selected cached tab render, measured over 30 switches. |
| Near-limit document | Not measured | Target <1 s usable selected section; bounded DOM, no repeated long tasks >50 ms on baseline fixture. |
| Memory | Not measured | Plateau over 100 tab/refresh cycles; no growth from retained observers, requests, timers or rendered trees. |

Targets are engineering review gates, not shipped guarantees. Report measured results on defined browser/CPU and request approval for any budget change. Bundle bytes do not directly bound parsed AST/DOM/RSS; measure expansion. Do not add a token accounting system or mandatory telemetry framework to meet instruction-size goals.

### Technical details {#quality-local-optimization}

- Preload the five allowlisted assets once per server start; reuse buffers. Do not synchronously reread each asset for every request. Keep no-cache semantics for restart/update correctness unless content-aware validators are implemented.
- Keep bundle reads on startup/explicit refresh; coalesce refresh. Native synchronous work on a bounded <=1 MiB bundle can remain until measurements show unacceptable event-loop blocking; no speculative worker pool.
- Remove regex syntax-highlighting/token DOM and terminal chrome; use plain code blocks. Keep diagrams imported only when needed if the small renderer boundary supports it without complicated asynchronous layout.
- Simplify SVG icon paths while keeping accepted icon keys/aliases; do not trade away diagram legibility for line count.
- Default identity HTTP transfer after trim. Only add native cached gzip when measured transfer—not rendering—fails the target; then test q-values, identity fallback, Vary, cache variants and no-store source.
- Measurement report must record per-file raw bytes, real transferred encoded bytes, CPU time/load, memory, benchmark payloads/runtime, percentiles and error rates. Offline gzip estimates must stay labelled estimates.
