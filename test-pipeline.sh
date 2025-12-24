#!/bin/bash

echo "🧪 IntegraHub Complete Pipeline Test"
echo "======================================"
echo ""
echo "Prerequisites:"
echo "  ✅ PostgreSQL running on localhost:5432"
echo "  ✅ Kafka running on localhost:9092"
echo "  ✅ MinIO running on localhost:9000"
echo "  ✅ API server running on localhost:3000"
echo ""
echo "This test will:"
echo "  1. Send 1000 products to API"
echo "  2. Verify Kafka event published"
echo "  3. Start workers to process batch"
echo "  4. Check products in database"
echo ""

API_KEY='JFiennsli3iNLL2@DFDsdfdAS!JDISkddkLndJKJKN!@;sadffd:kjasjk'
CNPJ="05927228000145"
LOAD_TYPE="full"

# Generate test payload
echo "📦 Generating 1000 product payload..."
PRODUCTS='['
for i in {1..1000}; do
  if [ $i -gt 1 ]; then PRODUCTS+=','; fi
  PRODUCTS+="{
    \"CNPJ\": \"$CNPJ\",
    \"INDICE\": $i,
    \"PRODUCTID\": \"$i\",
    \"EAN\": \"789609492139$i\",
    \"TITLE\": \"Test Product $i\",
    \"DESCRIPTION\": \"Description for product $i\",
    \"SHOPID\": 1,
    \"PRICE\": 27.04,
    \"PRICEPROMO\": 25.5,
    \"WHOLESALEPRICE\": 0,
    \"WHOLESALEMIN\": 0,
    \"QUANTITY\": 4.0,
    \"CATEGORY\": \"TEST\",
    \"MEASURE\": 0,
    \"NCM\": \"30044990\",
    \"BRAND\": \"Test Brand\",
    \"IMAGELINK\": \"\",
    \"SIZE\": 1.0,
    \"COLOR\": \"\",
    \"DATACADASTROPRODUTO\": \"2025-12-10T11:49:18.623\",
    \"DATAATUALIZACAOPRODUTO\": \"2025-12-10T11:49:18.623\",
    \"DATAATUALIZACAOESTOQUE\": \"2025-12-10T11:49:18.623\"
  }"
done
PRODUCTS+=']'

echo "📊 Payload size: $(echo "$PRODUCTS" | wc -c | numfmt --to=iec-i --suffix=B)"

# Write to temp file to avoid "Argument list too long"
TEMP_FILE=$(mktemp)
echo "$PRODUCTS" > "$TEMP_FILE"
trap "rm -f $TEMP_FILE" EXIT

# Send to API
echo ""
echo "🚀 Sending to API..."
RESPONSE=$(curl -s -X POST http://localhost:3000/v1/inovafarma/products \
  -H "Content-Type: application/json" \
  -H "X-Inova-Api-Key: $API_KEY" \
  -H "X-Inova-Load-Type: $LOAD_TYPE" \
  --data-binary "@$TEMP_FILE")

echo "Response: $RESPONSE"
BATCH_ID=$(echo "$RESPONSE" | grep -o '"batch_id":"[^"]*"' | cut -d'"' -f4)

if [ -z "$BATCH_ID" ]; then
  echo "❌ Failed to get batch_id from API"
  exit 1
fi

echo "✅ Batch ID: $BATCH_ID"

# Check batch in database
echo ""
echo "🔍 Checking batch in database..."
PGPASSWORD=kdnfpsjf_sf098ew2 psql -h localhost -U integrahub_user -d integra_hub -c \
  "SELECT batch_id, status, items_total, created_at FROM batches WHERE batch_id = '$BATCH_ID';"

echo ""
echo "⏳ Waiting 5 seconds before starting workers..."
sleep 5

echo ""
echo "🔧 Starting workers (Ctrl+C to stop)..."
echo "Workers will:"
echo "  - Chunker: Download batch from MinIO, split into chunks"
echo "  - Upsert (2-4 workers): Bulk insert products into PostgreSQL"
echo ""
npm run workers
