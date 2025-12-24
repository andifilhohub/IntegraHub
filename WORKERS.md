# IntegraHub Workers

## Architecture

```
API → Kafka (batches.received) → Chunker Worker → Kafka (chunks.ready) → Upsert Workers (2-4) → PostgreSQL
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
```

## Configuration

`.env` variables:
- `MAX_UPSERT_WORKERS`: Maximum upsert workers (default: CPU cores)
- `MIN_UPSERT_WORKERS`: Minimum upsert workers (default: 2)
- `CHUNK_SIZE`: Products per chunk (default: 1000)
- `SCALE_CHECK_INTERVAL`: Auto-scaling check interval in ms (default: 30000)

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

## Monitoring

Workers log to stdout with structured JSON:
```json
{"level":"INFO","event":"upsert.complete","chunkId":"...","upserted":1000}
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
