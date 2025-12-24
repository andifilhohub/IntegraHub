# IntegraHub API

## Setup

1. **Copy environment variables**:
```bash
cp .env.example .env
```

2. **Configure `.env`** with your database and services:
```env
DATABASE_URL=postgresql://user:password@localhost:5432/integra_hub
STORAGE_ENDPOINT=http://localhost:9000
KAFKA_BROKERS=localhost:9092
VALID_API_KEYS=your-api-key-here
```

3. **Install dependencies**:
```bash
npm install
```

4. **Run migrations**:
```bash
npm run migrate
```

5. **Start the server**:
```bash
npm run dev
```

## API Endpoints

### POST /v1/inovafarma/products
Webhook endpoint to receive product batches.

**Required Headers**:
- `X-Inova-Api-Key`: API key for authentication
- `X-Inova-Load-Type`: `delta` or `full`
- `Idempotency-Key`: Unique key for idempotent requests

**Body**: JSON array of products
```json
[{
  "CNPJ": "05927228000145",
  "PRODUCTID": "25901",
  "TITLE": "Product Name",
  "PRICE": 27.04,
  "QUANTITY": 4.0,
  ...
}]
```

**Response** (202 Accepted):
```json
{
  "batch_id": "uuid",
  "status": "RECEIVED",
  "received_at": "2025-12-23T10:00:00Z"
}
```

### GET /health
Health check endpoint.

## Architecture

- **Ingest API**: Receives products, streams to storage, publishes Kafka events
- **Object Storage**: MinIO/S3 for raw payload persistence
- **Database**: PostgreSQL for metadata and product catalog
- **Message Broker**: Kafka for async processing coordination

See `.github/copilot-instructions.md` for detailed architecture.
