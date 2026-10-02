# Data Model & API Contracts

## API Specifications {#api-specifications}

### Endpoint: `POST /api/v1/saved-searches` {#endpoint-create}
- **Description**: Stores a saved search for the authenticated user.
- **Request Body**:
```json
{
  "title": "Vintage Watches under $500",
  "query": "vintage watch",
  "maxPrice": 500,
  "frequency": "hourly"
}
```
- **Responses**:
  - `201 Created`: Returns created search alert ID.
  - `400 Bad Request`: Payload validation error.

## Database Schema & Indexes {#database-schema}

```sql
CREATE TABLE IF NOT EXISTS saved_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title VARCHAR(120) NOT NULL,
  filters JSONB NOT NULL,
  last_evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS search_alert_dispatches (
  alert_id UUID NOT NULL REFERENCES saved_searches(id) ON DELETE CASCADE,
  item_id UUID NOT NULL,
  dispatched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (alert_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_searches_eval 
  ON saved_searches (last_evaluated_at ASC);
```

### Technical details {#data-technical}

- Primary key `(alert_id, item_id)` on `search_alert_dispatches` provides zero-cost deduplication against repeated email sends.
- `last_evaluated_at ASC` index allows the worker to pull the oldest pending alerts efficiently.
