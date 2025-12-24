# IntegraHub - AI Coding Agent Instructions

## Project Overview
IntegraHub is a **high-throughput product ingestion system** for InovaFarma, designed to handle massive concurrent loads (tens of thousands of products per request, thousands of CNPJs simultaneously). The architecture follows strict **streaming-first, zero-data-loss** principles.

**Critical Principle**: Ingestion ≠ Processing. Never process data where you receive it.

## Architecture Components

### 1. Ingest API (Fastify)
- **Endpoint**: `POST /v1/inovafarma/products`
- **Flow**: Stream → Object Storage → PostgreSQL metadata → Kafka event → Return 202
- **Required Headers**: `X-Inova-Api-Key`, `X-Inova-Load-Type` (delta|full)
- **Optional Headers**: `Idempotency-Key` (auto-generated if not provided)
- **NEVER**:
  - Use `JSON.parse()` on large payloads
  - Process products in the endpoint
  - Use ORM for individual items
  - Block the request while processing

### 2. Chunker Worker (Kafka Consumer)
- Consumes `batches.received` topic
- Streams payload from object storage
- Generates chunks of 500-2000 items
- Publishes `chunks.ready` events
- **Never** load entire payload into memory

### 3. Upsert Worker (Kafka Consumer)
- Consumes `chunks.ready` topic
- Uses **bulk writes only**: `COPY` or multi-row `INSERT`
- Pattern: `COPY → staging_products` then `INSERT ... ON CONFLICT`
- 1 chunk = 1 short transaction

## Data Flow
```
Client → Fastify → [Object Storage + PostgreSQL + Kafka] → Chunker → Kafka → Upsert → PostgreSQL
```

## Tech Stack (Closed)
- **Runtime**: Node.js 20+
- **API**: Fastify
- **Streaming**: Node.js Streams
- **Message Broker**: Kafka (partitioned by CNPJ)
- **Storage**: S3 or MinIO
- **Database**: PostgreSQL
- **Observability**: Prometheus + Grafana + structured logs

## Code Standards

### Clean Code Principles (Mandatory)
- **Be concise, not verbose** - avoid unnecessary abstractions and boilerplate
- **Readable over clever** - code should be self-explanatory for future maintenance
- **Single Responsibility** - functions/modules do ONE thing well
- **Descriptive names** - no abbreviations unless domain-standard (e.g., `cnpj`, `ean`)
- **Small functions** - prefer 10-20 lines, extract when logic grows
- **No comments explaining what** - code shows what, comments explain why (sparingly)
- **Error messages must be actionable** - include context: `batch_id`, `cnpj`, `productId`

Examples:
```javascript
// ❌ Verbose and unclear
async function processDataFromTheIncomingPayload(data) {
  // Parse the data
  const parsed = JSON.parse(data);
  // Validate it
  if (!parsed) throw new Error('Invalid');
  // Return the result
  return parsed;
}

// ✅ Concise and clear
async function parseProduct(json) {
  const product = JSON.parse(json);
  if (!product.CNPJ || !product.PRODUCTID) {
    throw new Error(`Missing required fields: ${json}`);
  }
  return product;
}
```

### Module Organization
- `src/api/` - Fastify routes and handlers
- `src/workers/` - Kafka consumers (chunker, upsert)
- `src/storage/` - Object storage abstraction (S3/MinIO)
- `src/db/` - Database queries and migrations
- `src/kafka/` - Producer/consumer utilities
- `src/utils/` - Shared utilities (logging, validation)

## Development Philosophy

### File Creation Guidelines
**Create ONLY files essential to the architecture**. Avoid:
- Unnecessary abstractions or layers
- Files "for future use"
- Over-engineered patterns
- Redundant utilities

Every file must have a clear, immediate purpose in the streaming pipeline.

## Database Schema

**Database**: `integra_hub`

### Pharmacy Table
Stores pharmacy/tenant information:
- `id` (integer, PK)
- `cnpj` (text)
- `name` (text)
- `state` (text)
- `city` (text)
- `rawJson` (jsonb) - stores complete pharmacy data
- `createdAt` (timestamp without time zone)
- `updatedAt` (timestamp without time zone)

### Product Table
Stores product catalog with composite natural key:
- `id` (integer, PK)
- `pharmacyId` (integer, FK → Pharmacy)
- `productId` (integer) - product ID from source system
- `title` (text)
- `description` (text)
- `ean` (text)
- `price` (double precision)
- `stock` (integer)
- `brand` (text)
- `ncm` (text)
- `category` (text)
- `imageLink` (text)
- `rawJson` (jsonb) - stores complete product payload
- `createdAt` (timestamp without time zone)
- `updatedAt` (timestamp without time zone)
- `deletedAt` (timestamp without time zone) - for soft deletes
- `isActive` (boolean) - active flag for soft deletes
- `lastSeenAt` (timestamp without time zone) - last time product appeared in a batch

**Natural Key**: `(pharmacyId, productId, title)` or lookup by `cnpj + productId + title`

**Missing Fields to Add**:
- `shopid` (integer) - maps to `SHOPID` from payload
- `pricePromo` (double precision) - maps to `PRICEPROMO`
- `wholesalePrice` (double precision) - maps to `WHOLESALEPRICE`
- `wholesaleMin` (integer) - maps to `WHOLESALEMIN`
- `measure` (integer) - maps to `MEASURE`
- `size` (double precision) - maps to `SIZE`
- `color` (text) - maps to `COLOR`
- `indice` (integer) - maps to `INDICE`
- `lastBatchId` (text) - track which batch last updated this product

### Tables to Create

#### batches
- `batch_id` (UUID, PK)
- `pharmacy_id` (integer, FK → Pharmacy)
- `load_type` (ENUM: 'delta' | 'full')
- `idempotency_key` (text)
- `payload_uri` (text) - S3/MinIO object path
- `payload_checksum` (text) - SHA-256 hash
- `status` (ENUM: 'RECEIVED' | 'PROCESSING' | 'COMPLETED' | 'PARTIAL_FAIL' | 'FAILED')
- `received_at` (timestamp with time zone)
- `items_total` (integer)
- `items_processed` (integer)
- `items_failed` (integer)
- `created_at` (timestamp with time zone)
- `updated_at` (timestamp with time zone)
- **UNIQUE**: `(pharmacy_id, idempotency_key)`

#### batch_chunks
- `chunk_id` (UUID, PK)
- `batch_id` (UUID, FK → batches)
- `chunk_uri` (text) - S3/MinIO chunk path
- `chunk_index` (integer) - order within batch
- `status` (ENUM: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED')
- `attempts` (integer, default 0)
- `items_count` (integer)
- `created_at` (timestamp with time zone)
- `updated_at` (timestamp with time zone)
- `processed_at` (timestamp with time zone)

## Idempotency Strategy
1. **Batch level**: `pharmacy_id + idempotency_key` → same `batch_id` on retry
2. **Product level**: Match by `(pharmacyId, productId, title)` - only update if field values differ

## Kafka Topics & Partitioning
- `batches.received`, `chunks.ready`, `chunks.failed`
- **Key**: `cnpj` (ensures parallelism + tenant isolation)

## Critical Patterns

### Product Payload Structure
Each product contains:
```json
{
  "CNPJ": "05927228000145",
  "INDICE": 0,
  "PRODUCTID": "25901",
  "EAN": "7896094921399",
  "TITLE": "Buscopan Composto Cx 20Cpr",
  "DESCRIPTION": "Buscopan Composto Cx 20Cpr",
  "SHOPID": 1,
  "PRICE": 27.04,
  "PRICEPROMO": 25.5,
  "WHOLESALEPRICE": 0,
  "WHOLESALEMIN": 0,
  "QUANTITY": 4.0,
  "CATEGORY": "ETICOS",
  "MEASURE": 0,
  "NCM": "30044990",
  "BRAND": "Boehringer",
  "IMAGELINK": "",
  "SIZE": 1.0,
  "COLOR": "",
  "DATACADASTROPRODUTO": "2025-12-10T11:49:18.623",
  "DATAATUALIZACAOPRODUTO": "2025-12-10T11:49:18.623",
  "DATAATUALIZACAOESTOQUE": "2025-12-10T11:49:18.623"
}
```

### Load Type Business Rules (`X-Inova-Load-Type` Header)

#### FULL Load
- Payload contains **entire inventory** for the CNPJ
- Products in DB but **NOT in payload** → mark as `active = false` (soft delete)
- Products in payload but **NOT in DB** → insert as new
- Products in **BOTH** → update fields if different (except timestamps)

#### DELTA Load  
- Payload contains **only recent changes** (last few minutes)
- Products in payload → update only changed fields:
  - `QUANTITY`, `PRICE`, `PRICEPROMO`, `WHOLESALEPRICE`, `WHOLESALEMIN`
- Products NOT in payload → leave unchanged in DB
- New products → insert as new

### Product Matching Logic
Identify existing products by:
1. `CNPJ` (primary tenant identifier)
2. `PRODUCTID` (product ID within tenant)
3. `TITLE` (product name for validation)

**All three must match** to consider it the same product.

### Field Update Rules
- **Always update**: `PRICE`, `PRICEPROMO`, `QUANTITY`, `WHOLESALEPRICE`, `WHOLESALEMIN`, `DESCRIPTION`, `CATEGORY`, `BRAND`, `IMAGELINK`, etc.
- **Never update from payload**: Timestamp fields (`DATACADASTROPRODUTO`, `DATAATUALIZACAOPRODUTO`, `DATAATUALIZACAOESTOQUE`) - these are controlled by the system
- **Only compare non-timestamp fields** for change detection

### Streaming Over Materialization
Always use Node.js streams for payload handling:
```javascript
// ✅ Correct
request.raw.pipe(gzip).pipe(s3Upload).pipe(checksumCalculator)

// ❌ Wrong
const body = await request.body // Loads entire payload into memory
```

### Bulk Database Operations
```sql
-- ✅ Correct
COPY staging_products FROM ...;
INSERT INTO products SELECT * FROM staging_products ON CONFLICT ...;

-- ❌ Wrong
for (const product of products) {
  await orm.save(product); // Individual inserts kill performance
}
```

### Error Handling Philosophy
- Worker crashes → Kafka redelivery handles it
- Item-level errors → log and continue (don't fail entire batch)
- After N retries → Dead Letter Queue
- Batches can be `PARTIAL_FAIL`, never "lost"

## Upsert Worker Logic

### Full Load Processing
1. Load chunk from storage
2. For each product in chunk:
   - Check if exists by `(cnpj, productid, title)`
   - If exists → compare all fields (except timestamps), update if different
   - If not exists → insert new record with `active = true`
3. After processing all chunks for a batch:
   - Find products in DB with same CNPJ NOT in the batch payload
   - Set `active = false` for those products (soft delete)

### Delta Load Processing
1. Load chunk from storage  
2. For each product in chunk:
   - Check if exists by `(cnpj, productid, title)`
   - If exists → update **only** fields that changed: `QUANTITY`, `PRICE`, `PRICEPROMO`, `WHOLESALEPRICE`, `WHOLESALEMIN`, and other business fields
   - If not exists → insert new record with `active = true`
3. **No soft deletes** for delta loads - products not in payload remain unchanged

### Implementation Note
Use PostgreSQL's `INSERT ... ON CONFLICT` with conditional updates:
```sql
INSERT INTO products (cnpj, shopid, productid, title, price, quantity, ...)
VALUES (...)
ON CONFLICT (cnpj, shopid, productid)
DO UPDATE SET
  price = EXCLUDED.price,
  quantity = EXCLUDED.quantity,
  pricepromo = EXCLUDED.pricepromo,
  -- ... other fields except timestamps
WHERE products.price IS DISTINCT FROM EXCLUDED.price
   OR products.quantity IS DISTINCT FROM EXCLUDED.quantity
   OR ...; -- only update if something actually changed
```

For FULL loads, track which products were in the batch to handle soft deletes efficiently.

## Development Workflows

### Local Setup (Future)
Project is in early stage. When implementing:
1. Set up Node.js 20+ environment
2. Configure local Kafka (or use Docker Compose)
3. Set up PostgreSQL with schema from PRD
4. Use MinIO for local object storage
5. Configure worker memory: `--max-old-space-size`

### Testing Strategy (To Be Implemented)
- Load tests with simulated concurrent CNPJs
- Idempotency tests (replay same batch)
- Worker failure/recovery scenarios
- Verify zero data loss under failure

## Configuration & Limits
- Max payload size: 200MB (configurable)
- Chunk size: 500-2000 items (fixed per deployment)
- Worker concurrency: 1 core per process
- Content-Encoding: gzip strongly recommended

## Observability Requirements
All logs must include structured context:
- `batch_id`, `chunk_id`, `cnpj` for tracing
- Metrics: batches processed, Kafka lag, chunk processing time, error rates by type

## Out of Scope (Current Phase)
- Monitoring UI
- Webhook callbacks  
- Pre-signed upload URLs
- Advanced analytics

## References
- Full technical specification: `PRD-TECNICO.MD`
- Stack decisions are **closed** (non-negotiable)
- Architecture follows event-driven, CQRS-inspired pattern optimized for write-heavy workloads
