#!/bin/bash

echo "📊 IntegraHub Pipeline Status Report"
echo "====================================="
echo ""

# Products count
echo "🗄️  Products in Database:"
PGPASSWORD=kdnfpsjf_sf098ew2 psql -h localhost -U integrahub_user -d integra_hub -t -c \
  "SELECT COUNT(*) FROM \"Product\";" | xargs echo "  Total:"

echo ""

# Recent batches
echo "📦 Recent Batches:"
PGPASSWORD=kdnfpsjf_sf098ew2 psql -h localhost -U integrahub_user -d integra_hub -c \
  "SELECT 
    LEFT(batch_id::text, 8) as batch,
    status, 
    items_total as total,
    items_processed as processed,
    items_failed as failed,
    TO_CHAR(created_at, 'HH24:MI:SS') as time
   FROM batches 
   ORDER BY created_at DESC 
   LIMIT 5;"

echo ""

# Chunks status
echo "🧩 Chunks Status:"
PGPASSWORD=kdnfpsjf_sf098ew2 psql -h localhost -U integrahub_user -d integra_hub -c \
  "SELECT 
    status,
    COUNT(*) as count,
    SUM(items_count) as total_items
   FROM batch_chunks
   GROUP BY status;"

echo ""
echo "✅ Pipeline test completed!"
