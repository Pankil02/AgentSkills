# Concurrency, Messaging, and Reliability Patterns

These entries include patterns and lower-level techniques. Apply them only after defining **ownership, concurrency unit, ordering scope, delivery semantics, deadlines, and capacity bounds**. Across an unreliable boundary, assume partial failure and duplicate attempts; “exactly once” is normally a scoped effect achieved with atomicity/idempotency, not a transport promise.

## Work and message flow

### Producer–Consumer — concurrency pattern

- **Intent:** Decouple work production from processing through a buffer/channel.
- **Use when:** producer and consumer rates differ, work can run concurrently, or buffering smooths short bursts.
- **Avoid when:** direct synchronous processing is simpler or buffered delay violates freshness/latency.
- **Structure:** producers submit immutable/owned items to a **bounded** channel; consumers take, process, and signal completion/failure; shutdown closes/drains deliberately.
- **Trade-offs:** throughput and rate decoupling, but queue latency, memory pressure, ordering, ownership, and shutdown become explicit concerns.
- **Mistakes / related:** unbounded buffers defer overload into an outage. Define backpressure, fairness, error policy, and whether one or many consumers receive each item. Work Queue is its durable/distributed task form.

### Work Queue — messaging pattern

- **Intent:** Reliably distribute tasks so one eligible worker processes each task attempt.
- **Use when:** work should survive producer/worker restarts, execute asynchronously, and scale independently.
- **Avoid when:** immediate response/transactional completion is required or a local bounded executor suffices.
- **Structure:** producer enqueues task; broker makes it visible; worker claims, processes, acknowledges; timeout/nack makes failed claims available again.
- **Trade-offs:** durability and load leveling, but at-least-once attempts, queue delay, poison tasks, schema evolution, and operational dependency.
- **Mistakes / related:** include stable task identity, idempotent effects, bounded retries, visibility timeout longer than normal work (with renewal if needed), and DLQ/redrive. A command message should have one logical owner.

### Competing Consumers — scaling pattern

- **Intent:** Increase throughput by having multiple workers compete for tasks from one queue/subscription.
- **Use when:** tasks are independent or partitionable and horizontal worker scaling is needed.
- **Avoid when:** strict global ordering, shared mutable state, or non-partitionable resource limits prohibit parallelism.
- **Structure:** broker delivers each task attempt to one consumer; prefetch/concurrency and partitions control distribution; acknowledgments govern redelivery.
- **Trade-offs:** elastic throughput and worker failover, but completion reordering, hot partitions, duplicate attempts, and downstream overload.
- **Mistakes / related:** scale to downstream capacity, not queue depth alone; preserve per-key order with partitioning when required. This is a Work Queue consumer topology, not Publish–Subscribe fan-out.

### Publish–Subscribe — messaging pattern

- **Intent:** Deliver each published event to every interested subscription without the publisher knowing subscribers.
- **Use when:** genuine fan-out, independent reactions, or temporal/process decoupling is required.
- **Avoid when:** one receiver owns the command, a return value is needed, or direct in-process Observer is clearer.
- **Structure:** publisher writes typed event to topic; broker/channel routes a copy to each subscription; each subscription may use competing consumers internally.
- **Trade-offs:** extensible fan-out, but schema ownership, retention, duplicates, ordering, slow subscribers, and tracing are harder.
- **Mistakes / related:** distinguish topic from queue and event from command; define delivery, replay, partition key, and consumer idempotency. Observer has a subject-managed in-process subscriber relationship.

### Dead-Letter Queue (DLQ) — recovery pattern

- **Intent:** Isolate messages that cannot succeed after a bounded policy so they do not block or churn the main flow.
- **Use when:** durable async processing has poison data, permanent incompatibility, or exhausted transient retries requiring investigation.
- **Avoid when:** failures should fail the caller synchronously or a DLQ would become an unowned graveyard.
- **Structure:** after classified failure/attempt limit, move original envelope plus safe diagnostic metadata to restricted queue; alert, inspect, repair, and explicitly redrive/discard.
- **Trade-offs:** protects throughput and preserves evidence, but adds sensitive-data retention, replay ordering, tooling, and ownership work.
- **Mistakes / related:** monitor age/count, retain cause/correlation/schema version, prevent infinite redrive loops, and test replay idempotency. A DLQ is not a substitute for fixing consumers.

### Backpressure / Bounded Buffer — flow-control technique

- **Intent:** Make producers slow, shed, coalesce, or fail before demand exceeds finite downstream capacity.
- **Use when:** streams, executors, brokers, or APIs can receive bursts faster than safe processing.
- **Avoid when:** none; every asynchronous buffer still needs an explicit capacity policy, even if the limit is high.
- **Structure:** bounded queue plus policy: block/await, reject, drop oldest/newest, sample/coalesce, or spill durably; propagate demand/cancellation where supported.
- **Trade-offs:** stable resource use, but shifts cost to latency, producer blocking, or intentional loss.
- **Mistakes / related:** choose policy from business semantics, expose saturation metrics, and avoid blocking an event-loop thread. Bulkhead bounds per dependency; Rate Limiting bounds admission.

## Local concurrency patterns and techniques

### Thread Pool — execution technique

- **Intent:** Reuse a bounded set of worker threads to execute many tasks while limiting concurrency.
- **Use when:** the runtime uses threads and task concurrency must be controlled; separate pools may isolate blocking I/O from CPU work.
- **Avoid when:** an async event loop/runtime scheduler already handles the work, tasks are unbounded/block forever, or thread affinity is required.
- **Structure:** bounded task queue, fixed/adaptive workers, rejection/backpressure, cancellation, exception capture, and graceful drain/shutdown.
- **Trade-offs:** amortized thread creation and capacity control, but queueing, starvation, deadlock, context-switching, and context propagation issues.
- **Mistakes / related:** do not use an unbounded queue with an effectively fixed pool; size from workload/measurement and downstream limits, not folklore. Object Pool manages resources, not task execution.

### Actor Model — concurrency model

- **Intent:** Isolate mutable state inside actors that process one mailbox message at a time and communicate by messages.
- **Use when:** many stateful concurrent entities, supervision, or location-aware distribution fit message-driven behavior.
- **Avoid when:** simple immutable tasks/shared data structures suffice, global transactions are central, or blocking calls would occupy actors.
- **Structure:** actor owns state and mailbox; handles messages sequentially; sends/spawns/stops; supervisor defines restart/escalation. Distributed delivery semantics depend on runtime.
- **Trade-offs:** fewer shared-memory races and natural fault containment, but mailbox growth, message ordering, request correlation, debugging, and distributed duplicates remain.
- **Mistakes / related:** bound mailboxes, avoid blocking actor dispatchers, preserve actor identity, and make recovery state explicit. Actors do not magically guarantee exactly-once delivery.

### Reactor — event-driven concurrency pattern

- **Intent:** Multiplex many non-blocking I/O sources through an event loop that dispatches readiness/completion handlers.
- **Use when:** large numbers of mostly waiting connections make thread-per-connection expensive.
- **Avoid when:** APIs are blocking, handlers do long CPU work, or the runtime already abstracts the event loop safely.
- **Structure:** demultiplexer/event loop waits for events and invokes short handlers; state machine/coroutine continues operation; heavy work is offloaded to a bounded executor.
- **Trade-offs:** high I/O concurrency with few threads, but one blocking handler stalls the loop and control flow/cancellation can be subtle.
- **Mistakes / related:** never block the loop, bound offloaded work, and handle partial reads/writes. Futures/coroutines often provide a friendlier interface over a Reactor.

### Futures / Promises — async composition technique

- **Intent:** Represent one eventual result/error so asynchronous operations can be composed without blocking the caller.
- **Use when:** independent I/O or computation needs sequencing, fan-out/fan-in, timeout, or result propagation.
- **Avoid when:** fire-and-forget would lose errors/ownership or synchronous work is simpler.
- **Structure:** producer completes once; consumers await/chain/combine; structured scope owns task lifetime, cancellation, and deadline.
- **Trade-offs:** composable results and errors, but orphan tasks, lost cancellation/context, callback chains, and unbounded fan-out.
- **Mistakes / related:** always observe failures, propagate cancellation/deadlines, and limit parallelism. A timeout on waiting must normally cancel or otherwise account for the underlying work.

### Structured Concurrency — lifecycle technique

- **Intent:** Tie concurrent task lifetime to a lexical/request scope so children complete or cancel before the parent exits.
- **Use when:** a use case fans out work and must not leak orphan tasks or silently lose failures.
- **Avoid when:** intentionally durable background work should instead be handed to an owned scheduler/queue.
- **Structure:** scope starts children, joins them, propagates cancellation/context, and defines fail-fast or collect-all behavior.
- **Trade-offs:** predictable ownership and cleanup, but may require runtime support and careful cancellation-safe code.
- **Mistakes / related:** do not launch untracked “fire-and-forget” futures from request scope. Use a Work Queue for work that must outlive the request.

### Mutex

- **Intent:** Serialize access to a shared mutable invariant.
- **Use when:** immutable ownership/message passing is impractical and multiple threads/tasks can concurrently mutate related state.
- **Avoid when:** thread confinement, atomics, immutable snapshots, or redesign removes sharing more simply.
- **Structure:** one lock protects a documented invariant; acquire, re-check condition, mutate briefly, release in guaranteed cleanup.
- **Trade-offs:** straightforward correctness, but contention, priority inversion, deadlock, and reduced parallelism.
- **Mistakes / related:** use one lock order, never hold across slow/network I/O, avoid calling unknown code while locked, and use the runtime's async-aware primitive when awaiting. `volatile`/atomic visibility alone does not protect compound invariants.

### Semaphore

- **Intent:** Limit concurrent access to a finite-capacity resource with a fixed number of permits.
- **Use when:** bounding requests, connections, expensive jobs, or fan-out to downstream capacity.
- **Avoid when:** protecting one compound invariant (use Mutex) or a queue/executor already enforces the same limit.
- **Structure:** acquire permit with deadline/cancellation; execute; release exactly once in guaranteed cleanup; optional weighted permits/fairness.
- **Trade-offs:** simple concurrency cap, but waiting, starvation, leaked permits, and limits that drift from real capacity.
- **Mistakes / related:** instrument wait time/usage and avoid nested inconsistent acquisition. A binary semaphore can exclude, but a mutex usually carries clearer ownership semantics.

### Immutable Data

- **Intent:** Prevent in-place change so values can be shared without synchronization and state transitions are explicit.
- **Use when:** snapshots cross threads/tasks, deterministic reasoning matters, or copy-on-write/persistent structures are efficient enough.
- **Avoid when:** copying huge mutable graphs dominates cost or exclusive ownership already makes mutation safe.
- **Structure:** construct valid value once; update returns new value/version; mutable resources remain behind an owner.
- **Trade-offs:** fewer races and easy snapshots, but allocation/copy pressure and stale-version conflicts.
- **Mistakes / related:** immutability must be deep enough for shared fields; a final/read-only reference to a mutable collection is not immutable. Pair with optimistic compare-and-swap where appropriate.

### Optimistic Locking

- **Intent:** Detect write conflicts at commit without holding a lock while work proceeds.
- **Use when:** conflicts are uncommon, operations are short/retryable, and disconnected or distributed clients edit state.
- **Avoid when:** contention is high, side effects occur before conflict detection, or retries are expensive/unsafe.
- **Structure:** read value plus version; update with `WHERE version = expected`; zero rows/CAS failure is a conflict; reload, merge, retry, or report.
- **Trade-offs:** high concurrency without blocking, but conflict handling and starvation under contention.
- **Mistakes / related:** do not silently last-write-wins where invariants matter; bound retries and keep external effects after successful commit/outbox. Event streams commonly use expected version.

### Pessimistic Locking

- **Intent:** Reserve data/resource before change so conflicting operations wait or fail.
- **Use when:** conflicts are frequent, work inside the lock is short, and the database/runtime can enforce the needed lock semantics.
- **Avoid when:** operations call remote systems, users hold think-time, throughput is high, or distributed leases are being mistaken for DB locks.
- **Structure:** acquire row/range/resource lock in transaction, validate/mutate, commit promptly; use consistent order and timeout/deadlock retry policy.
- **Trade-offs:** prevents many conflicts, but blocks capacity and risks deadlocks, lock escalation, and convoying.
- **Mistakes / related:** understand isolation and phantom/range behavior; never hold locks while awaiting external work. Compare Optimistic Locking and Saga.

## Remote-call resilience

### Timeout / Deadline — foundational technique

- **Intent:** Bound how long an operation may consume caller and system resources.
- **Use when:** every network call, queue wait, lock acquisition, and potentially blocking operation can stall.
- **Avoid when:** none across unreliable boundaries; choose a deliberate bound rather than an infinite default.
- **Structure:** caller sets end-to-end deadline from latency budget; each hop receives remaining time and cancels/releases work on expiry.
- **Trade-offs:** limits resource retention and tail latency, but too-short bounds cause false failures and retries.
- **Mistakes / related:** distinguish connect/read/overall timeouts, propagate cancellation, and record phase timing. Timeout precedes Retry/Circuit Breaker; it does not prove the remote side stopped.

### Retry with Exponential Backoff and Jitter — resilience technique

- **Intent:** Re-attempt a transient, safe operation without synchronizing clients or overwhelming a recovering dependency.
- **Use when:** failures are classified transient, operation/effect is idempotent or deduplicated, and another attempt fits the deadline/budget.
- **Avoid when:** validation/auth/permanent errors occur, a transaction outcome is unknown without idempotency, or overload is the cause.
- **Structure:** cap attempts/elapsed time; honor server retry hints; delay with jitter, e.g. `uniform(0, min(cap, base * 2^attempt))`; stop on cancellation/deadline.
- **Trade-offs:** masks brief faults, but amplifies load/latency and complicates outcome certainty.
- **Mistakes / related:** retry at one owning layer, budget globally, instrument attempts, and do not retry every nested hop. Pair with Circuit Breaker, Rate Limiting, and Idempotency.

### Circuit Breaker — resilience pattern

- **Intent:** Stop calls likely to fail so a dependency and callers can recover instead of wasting capacity.
- **Use when:** repeated remote failures/timeouts cause cascading resource exhaustion and a fallback/fail-fast response exists.
- **Avoid when:** calls are local, failures are independent business errors, or low traffic cannot produce meaningful health signals.
- **Structure:** Closed records classified outcomes; threshold opens and rejects; after cool-down Half-Open permits limited probes; success closes, failure reopens.
- **Trade-offs:** contains cascades and reduces futile latency, but tuning, per-instance state, false opening, and fallback staleness are hard.
- **Mistakes / related:** scope by dependency/operation, not all traffic; exclude caller errors, bound half-open probes, expose state metrics. It complements—not replaces—timeouts, retries, and bulkheads.

### Bulkhead — resilience pattern

- **Intent:** Partition finite resources/concurrency so one workload or dependency cannot exhaust all capacity.
- **Use when:** tenants, endpoints, dependencies, or job classes have different failure/latency profiles and shared pools cause cascades.
- **Avoid when:** partitions would strand scarce capacity without meaningful isolation or one global bounded pool is enough.
- **Structure:** separate connection/thread/queue/semaphore budgets with admission and fallback; reserve critical capacity where justified.
- **Trade-offs:** fault containment and predictable degradation, but lower aggregate utilization, sizing complexity, and more queues/metrics.
- **Mistakes / related:** bound queue and execution together; monitor saturation/rejections and revisit limits. Backpressure controls flow; Circuit Breaker reacts to dependency health.

### Idempotency — correctness technique

- **Intent:** Make repeated execution of the same logical request produce one accepted effect and a consistent outcome.
- **Use when:** clients/brokers/retries can duplicate commands with side effects such as payment, creation, or message handling.
- **Avoid when:** the operation is naturally read-only/idempotent or requests cannot be assigned stable logical identity.
- **Structure:** caller sends scoped idempotency key; handler atomically claims/stores key, request hash, status, and result with the state change; duplicates return/wait on recorded outcome.
- **Trade-offs:** safe retries, but durable storage, key scope/TTL, concurrent duplicate races, payload mismatch, and response retention.
- **Mistakes / related:** atomic uniqueness is essential; “check then act” races. Same key with different payload must fail. Idempotency does not make several external side effects atomic—use Outbox/Saga and idempotent participants.

## Distributed consistency and integration

### Transactional Outbox — integration pattern

- **Intent:** Reliably publish a message corresponding to a local database change without a dual write.
- **Use when:** state commit and event/command publication must not diverge and no atomic DB+broker transaction exists.
- **Avoid when:** publication can safely be best-effort or the state store cannot atomically persist an outbox record.
- **Structure:** in one local transaction write business state + outbox row; relay/CDC publishes unsent rows; mark/track delivery; consumers handle duplicates.
- **Trade-offs:** closes the commit/publish gap, but relay lag, table growth, ordering, duplicate delivery, and operational cleanup remain.
- **Mistakes / related:** outbox guarantees eventual publication after committed state, not exactly-once consumption. Preserve aggregate ordering key and use an Inbox/idempotent consumer when effects must deduplicate.

```text
transaction:
  save(order)
  insert(outbox, eventId, aggregateId, type, payload)
commit
relay: publish(outboxRow)   # may repeat; consumer deduplicates eventId
```

### Saga — distributed consistency pattern

- **Intent:** Coordinate a long-running business transaction as local transactions with explicit compensations or forward recovery.
- **Use when:** multiple independently owned data stores/services must reach a business outcome without one atomic transaction.
- **Avoid when:** one local transaction is possible, strong isolation is mandatory, or compensating actions cannot satisfy the business.
- **Structure:** steps commit locally and emit result; **orchestrator** commands next steps or **choreography** reacts to events; failures trigger idempotent compensation/recovery.
- **Trade-offs:** autonomy and availability, but intermediate states, isolation anomalies, complex compensation, timeouts, observability, and manual recovery.
- **Mistakes / related:** compensation is a new semantic action, not database rollback, and may fail; record saga state, deadlines, dedupe, and audit. Use Outbox for reliable step messages; avoid event choreography when workflow ownership becomes invisible.

### Distributed Transaction / Two-Phase Commit — coordination alternative

- **Intent:** Atomically decide commit/rollback across participants that implement a common transaction protocol.
- **Use when:** strong atomicity is non-negotiable, participant set is controlled/small, infrastructure supports it, and blocking/availability costs are acceptable.
- **Avoid when:** internet-scale independent services, long workflows, heterogeneous stores, or partition availability matters.
- **Structure:** coordinator asks prepared participants to vote, durably records decision, then commands commit/rollback; recovery resolves in-doubt transactions.
- **Trade-offs:** strong atomic outcome, but coordinator/participant blocking, operational coupling, reduced availability, and difficult recovery.
- **Mistakes / related:** do not call a sequence of remote requests a distributed transaction. Prefer one owner/local transaction; otherwise compare Saga based on business isolation and compensation.

### Leader Election — distributed coordination technique

- **Intent:** Select one active coordinator for work that must have a single logical leader at a time.
- **Use when:** scheduling, partition ownership, metadata coordination, or singleton maintenance cannot be safely parallelized.
- **Avoid when:** work can be partitioned/idempotent, a managed coordinator exists, or “one instance” is only a convenience.
- **Structure:** consensus-backed lease/election; leader renews before expiry; every protected write carries a monotonically increasing fencing token checked by the resource.
- **Trade-offs:** centralized coordination, but failover delay, availability loss, split-brain risk, clock/lease complexity, and hot leader bottleneck.
- **Mistakes / related:** a lock file, DNS, or expiring lease without fencing cannot stop a paused former leader. Prefer platform primitives and test partitions/process pauses.

### Service Discovery — infrastructure pattern

- **Intent:** Resolve a logical service identity to healthy, changing network endpoints.
- **Use when:** instances are ephemeral/elastic and static addresses or platform routing cannot hide location.
- **Avoid when:** orchestrator DNS/load balancer/service mesh already provides it or endpoints are stable and few.
- **Structure:** instances register/are observed; health/lease removes stale entries; client-side or server-side load balancer resolves and selects endpoints.
- **Trade-offs:** dynamic scaling/failover, but stale caches, thundering refresh, health ambiguity, and another control-plane dependency.
- **Mistakes / related:** prefer platform-native discovery, secure registration, distinguish liveness/readiness, and combine with load balancing/timeouts. Discovery does not guarantee an endpoint can serve a particular request.

## Data and admission resilience

### Cache-Aside — caching pattern

- **Intent:** Let application code load data on cache miss and populate an external cache while the source of truth remains elsewhere.
- **Use when:** repeated reads tolerate bounded staleness and measured source latency/load justifies caching.
- **Avoid when:** correctness requires latest data, hit rate is low, values are highly volatile/sensitive, or invalidation cannot be defined.
- **Structure:** read cache; on miss read source and set with TTL; writes update source then invalidate/update cache according to consistency policy.
- **Trade-offs:** simple scalable reads, but stale values, miss latency, invalidation races, memory/serialization cost, and stampedes.
- **Mistakes / related:** coalesce requests/single-flight, jitter TTLs, use stale-while-revalidate where safe, cap negative caching, and prevent old fills overwriting new invalidations. A cache is not the authority.

### Rate Limiting — admission-control pattern

- **Intent:** Bound accepted operations over time per principal/resource to protect capacity, fairness, cost, or policy.
- **Use when:** APIs/jobs face abuse, bursts, tenant fairness, or hard downstream quotas.
- **Avoid when:** it is used as authorization, a substitute for capacity/backpressure, or keys cannot represent the protected resource fairly.
- **Structure:** token bucket allows controlled bursts; leaky bucket smooths; fixed/sliding window counts; distributed limiter trades consistency, latency, and availability.
- **Trade-offs:** predictable admission and protection, but false rejection, shared-state cost, evasion, and limit-tuning complexity.
- **Mistakes / related:** identify authenticated key, return clear retry metadata, handle limiter failure deliberately, and enforce near the scarce resource. Pair with quotas, Bulkhead, and Backpressure.

## Reliability review order

1. Define end-to-end latency/deadline and cancellation.
2. Bound concurrency, queues, payloads, caches, and fan-out; choose overload behavior.
3. Classify errors and uncertain outcomes; make side effects idempotent.
4. Add retry only where another attempt can help and fits a shared budget.
5. Add bulkheads/circuit breakers where measured dependency failures cascade.
6. For messaging, define task/event ownership, delivery/order scope, ack, poison handling, replay, and schema evolution.
7. For multi-owner state, first seek one owner/local transaction; then Outbox/Saga or, rarely, supported distributed transaction.
8. Instrument attempts, queue age, saturation, rejection, breaker state, idempotency hits, saga age, DLQ depth, and recovery—not only success rate.
