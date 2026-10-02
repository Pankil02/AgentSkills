# 🛡️ Enterprise Risks & Mitigations

## 🚨 Enterprise Failure Matrix {#risks-matrix}

| 🏷️ Risk Category | 💥 Concrete Failure Mode | 🛡️ Preventative Control | 🧪 Verification Test | 🚦 Residual Risk |
|---|---|---|---|---|
| 🔍 **Input Validation** | Nested JSON regex bombs in search filter | Enforce strict schema and whitelist filter operators | Reject malformed filter payload test | 🟡 Minor |
| 🔑 **Permissions** | Tampering with other user's alert ID | Scoped update with `WHERE user_id = :current_user` | Tenant isolation authorization test | 🟢 Nil |
| ⚡ **Concurrency** | Multiple workers processing the same alert | Use `FOR UPDATE SKIP LOCKED` on alert batch fetch | Simulated multi-worker concurrency test | 🟢 Nil |
| 🔄 **Idempotency** | Worker crashes after sending email before marking DB | Database dispatch table has unique `(alert_id, item_id)` | Crash-recovery idempotency replay test | 🟢 Nil |
| 📬 **Email Failure** | Provider rate limit or temporary 503 | Queue unsent notifications with exponential backoff | Downstream error simulation test | 🟡 Delayed delivery |

## 🔒 Security & Sensitive Data {#risks-security}

- 🛡️ Search filter strings are sanitized to prevent SQL/JSON injection.
- 🔒 Email contents do not leak item pricing histories or sensitive supplier metadata.

### ⚙️ Technical details {#risks-technical}

- 🔒 Concurrency safe via `SELECT id FROM saved_searches WHERE last_evaluated_at < NOW() - INTERVAL '15 minutes' ORDER BY last_evaluated_at ASC LIMIT 100 FOR UPDATE SKIP LOCKED;`
