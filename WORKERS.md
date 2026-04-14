# IntegraHub Workers

## Architecture

```
API → Kafka (batches.received) → Chunker Worker → Kafka (chunks.ready) → Upsert Workers (2-4) → PostgreSQL

API → Kafka (sales.received) → Sales Worker → PostgreSQL
```

## Running Workers

### Development (Orchestrated - Recommended)
Starts 1 chunker + 2-4 upsert workers with auto-scaling:
```bash
npm run workers
```

### Production (Kubernetes-ready)
Each worker runs independently:

```bash
# Chunker (1 instance)
npm run worker:chunker

# Upsert (multiple instances)
npm run worker:upsert

# Sales (1 instance)
npm run worker:sales
```

## Configuration

`.env` variables:
- `MAX_UPSERT_WORKERS`: Maximum upsert workers (default: CPU cores)
- `MIN_UPSERT_WORKERS`: Minimum upsert workers (default: 2)
- `CHUNK_SIZE`: Products per chunk (default: 1000)
- `SCALE_CHECK_INTERVAL`: Auto-scaling check interval in ms (default: 30000)
- `MAX_CHUNK_RETRIES`: Maximum retry attempts per failed chunk in upsert (default: 3)
- `KAFKA_TOPIC_CHUNKS_READY`: Topic for chunk processing/retry (default: `chunks.ready`)
- `KAFKA_TOPIC_CHUNKS_FAILED`: Topic for terminal chunk failures (default: `chunks.failed`)

## Worker Responsibilities

### Chunker Worker
- Consumes `batches.received` events
- Downloads payload from MinIO
- Splits into chunks of ~1000 products
- Publishes `chunks.ready` events (partitioned by CNPJ)

### Upsert Worker
- Consumes `chunks.ready` events (consumer group for load balancing)
- Bulk upserts products to PostgreSQL
- Updates batch progress
- Handles FULL vs DELTA load logic
- Retries failed chunks automatically until `MAX_CHUNK_RETRIES`
- Publishes final failures to `chunks.failed` when retries are exhausted

### Sales Worker
- Consumes `sales.received` events
- Downloads payload from MinIO
- Persists raw JSON to PostgreSQL
- Updates status to COMPLETED/FAILED

## Monitoring

Workers log to stdout with structured JSON:
```json
{"level":"INFO","event":"upsert.complete","chunkId":"...","upserted":1000}
```

### Failure Observability

Batch and chunk failures are persisted in PostgreSQL for post-mortem analysis:
- `batches.error_message`, `batches.error_code`, `batches.error_context`, `batches.last_error_at`
- `batch_chunks.error_message`, `batch_chunks.error_code`, `batch_chunks.error_context`, `batch_chunks.last_error_at`

Quick queries:

```sql
-- Latest failed batches with root cause
SELECT batch_id, status, items_total, items_processed, items_failed,
       error_code, error_message, last_error_at
FROM batches
WHERE status IN ('FAILED', 'PARTIAL_FAIL')
ORDER BY COALESCE(last_error_at, updated_at) DESC
LIMIT 20;

-- Failed chunks with error payload context
SELECT chunk_id, batch_id, chunk_index, attempts, items_count,
       error_code, error_message, error_context, last_error_at
FROM batch_chunks
WHERE status = 'FAILED'
ORDER BY COALESCE(last_error_at, updated_at) DESC
LIMIT 50;
```

## Kubernetes Deployment (Future)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: integrahub-chunker
spec:
  replicas: 1  # Always 1
  template:
    spec:
      containers:
      - name: chunker
        command: ["npm", "run", "worker:chunker"]
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: integrahub-upsert
spec:
  replicas: 4  # Can be auto-scaled
  template:
    spec:
      containers:
      - name: upsert
        command: ["npm", "run", "worker:upsert"]
```

## Performance

- **Chunker**: ~10,000 products/sec
- **Upsert** (per worker): ~5,000 products/sec
- **4 workers**: ~20,000 products/sec total
