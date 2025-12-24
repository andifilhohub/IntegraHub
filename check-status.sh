#!/bin/bash

echo "=== BATCHES (Metadata) ==="
psql -U integrahub_user -d integra_hub -c "SELECT batch_id, load_type, status, items_total, created_at FROM batches ORDER BY created_at DESC LIMIT 5;"

echo ""
echo "=== PRODUCTS (Should be empty until workers run) ==="
psql -U integrahub_user -d integra_hub -c "SELECT COUNT(*) as total_products FROM \"Product\";"

echo ""
echo "=== MinIO Objects (Payloads stored) ==="
echo "Access MinIO Console: http://localhost:9001"
echo "User: minioadmin | Pass: minioadmin"
echo "Bucket: integrahub-batches"

echo ""
echo "=== Kafka Topics (Events) ==="
docker exec integrahub-kafka kafka-topics --list --bootstrap-server localhost:9092

echo ""
echo "=== Kafka Messages (batches.received) ==="
docker exec integrahub-kafka kafka-console-consumer \
  --bootstrap-server localhost:9092 \
  --topic batches.received \
  --from-beginning \
  --max-messages 5 \
  --timeout-ms 3000 2>/dev/null || echo "No messages or timeout"
