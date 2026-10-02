# ⚡ Performance & Workload Budgets

## ⏱️ Quantitative Workload & Resource Budgets {#performance-budgets}

All metrics must declare units, evidence status, and derivation source. Status is one of `observed`, `target`, `estimate`, `assumption`, `unknown`, or `N/A`.

| 📊 Dimension | 🟢 Baseline | 🟡 Peak Target | 🔴 Stress Boundary | 🏷️ Unit | 📊 Status | 🔬 Evidence / Derivation |
|---|---|---|---|---|---|---|
| ⚡ Request Rate (QPS) | [N] | [N] | [N] | req/s | `estimate` | Derived from active users × ops/day × burst |
| 🗄️ Database Operations | [N] | [N] | [N] | queries/op | `observed` | Query trace on representative handler |
| 🏊 DB Connection Occupancy | [N] | [N] | [N] | connections | `estimate` | Mean DB hold time × query rate |
| ⚙️ Compute CPU Work | [N] | [N] | [N] | ms / op | `estimate` | Processing, validation, and serialization cost |
| 💾 Process Memory (RSS) | [N] | [N] | [N] | MiB | `estimate` | Base footprint plus in-flight request buffers |
| ⏱️ Client p95 Latency | [N] | [N] | [N] | ms | `target` | Product SLA requirement |
| ⏱️ Client p99 Latency | [N] | [N] | [N] | ms | `target` | Product SLA requirement |
| 📦 Wire Transfer per Req | [N] | [N] | [N] | bytes | `estimate` | Serialized JSON and HTTP headers |
| 🗜️ Wire Compressed (gzip) | [N] | [N] | [N] | bytes | `estimate` | HTTP body compression ratio |
| 📁 Blob / File Storage | [N] | [N] | [N] | KiB | `N/A` | Payloads inline; no binary blobs stored |

## 📈 Critical Path Latency Analysis {#performance-critical-path}

$$\text{Request Latency} \approx T_{\text{client-network}} + T_{\text{auth/routing}} + T_{\text{domain/cpu}} + T_{\text{database}} + T_{\text{serialization}}$$

```diagram-json
{
  "schemaVersion": 1,
  "id": "feature-latency-breakdown",
  "type": "sequence",
  "title": "Critical Path Latency Sequence",
  "summary": "Sequential hop breakdown and time allocation along the critical path.",
  "participants": [
    { "id": "client", "label": "Client", "icon": "browser" },
    { "id": "server", "label": "App Server", "icon": "app-server" },
    { "id": "db", "label": "Database", "icon": "database" }
  ],
  "messages": [
    { "id": "m1", "from": "client", "to": "server", "label": "Request Transmission", "kind": "request" },
    { "id": "m2", "from": "server", "to": "db", "label": "Indexed Query / Write", "kind": "request" },
    { "id": "m3", "from": "db", "to": "server", "label": "Row Result", "kind": "response" },
    { "id": "m4", "from": "server", "to": "client", "label": "Serialized Response", "kind": "response" }
  ]
}
```

## 📐 System Sizing & Concurrency Calculations {#performance-calculations}

- ⚡ **Average QPS**: $\text{Average QPS} = \frac{\text{Active Users} \times \text{Ops / User / Day}}{\text{Active Seconds / Day}} = \frac{[N] \times [N]}{[N]} \approx [N]\text{ req/s}$.
- 📈 **Peak QPS**: $\text{Peak QPS} = \text{Average QPS} \times \text{Burst Factor ([N]x)} \approx [N]\text{ req/s}$.
- 🏊 **In-Flight Requests (Little's Law)**: $L = \lambda \times W$. At peak [N] req/s with mean duration [N] ms, concurrent in-flight requests $L \approx [N]$.
- 🖥️ **CPU Core Headroom**: Estimated cores required $\approx \frac{\text{QPS} \times \text{CPU ms/op}}{1,000 \times \text{Target Utilization ([N]%)}}$.
- 🗄️ **Database Pool Occupancy**: $\text{Occupancy} \approx \text{DB Ops/s} \times \text{Mean Connection-Held Seconds}$.

### ⚙️ Technical details {#performance-technical}

- 🛑 **First Saturation Bottleneck**: [Identify which resource (CPU, DB pool, memory, or network) saturates first under 3x–5x stress load.]
- 🛡️ **Degradation Policy**: [Describe backpressure, rate-limiting (429), or shed-load behavior when saturated.]
- 🧪 **Benchmark Validation Method**: [Specific tooling, reference hardware, test script, and sample size to measure and verify budgets.]
