# Storage Deep Dive

## Storage Specification {#storage-spec}

Detailed partitioning and replication design for alert data.

- **Primary Table**: `saved_searches` partitioned by tenant hash.
- **Index**: GiST index on query payload tokens.
- **Purge Strategy**: Soft delete with daily background cleanup worker.

### Technical details {#storage-technical}

| Parameter | Value | Note |
|---|---|---|
| Max partitions | 64 | Hash partitioned on `org_id` |
| Retention window | 90 days | Inactive alerts archived |
| WAL overhead | ~12 MB/day | Minimal replication traffic |
