#!/bin/bash

echo "🧹 Cleaning up test data..."

# Limpar produtos de teste
PGPASSWORD=kdnfpsjf_sf098ew2 psql -h localhost -U integrahub_user -d integra_hub << 'EOF'
DELETE FROM batch_chunks;
DELETE FROM batches;
DELETE FROM "Product" WHERE "pharmacyId" = 1;
EOF

echo "✅ Test data cleaned"
echo ""
echo "📊 Current state:"
PGPASSWORD=kdnfpsjf_sf098ew2 psql -h localhost -U integrahub_user -d integra_hub -c "
SELECT 
  (SELECT COUNT(*) FROM \"Product\") as products,
  (SELECT COUNT(*) FROM batches) as batches,
  (SELECT COUNT(*) FROM batch_chunks) as chunks;"
