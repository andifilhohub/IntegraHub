#!/bin/bash

# Generate large payload test
# Usage: ./test-large-payload.sh [number_of_products]

NUM_PRODUCTS=${1:-10000}  # Default 10,000 products

echo "🚀 Generating payload with $NUM_PRODUCTS products..."

# Create JSON file
cat > /tmp/large-payload.json << 'EOF_START'
[
EOF_START

for i in $(seq 1 $NUM_PRODUCTS); do
  PRODUCT_ID=$((25900 + i))
  PRICE=$(echo "scale=2; 10 + ($i % 100)" | bc)
  QUANTITY=$((1 + ($i % 50)))
  
  cat >> /tmp/large-payload.json << EOF
  {
    "CNPJ": "05927228000145",
    "INDICE": $i,
    "PRODUCTID": "$PRODUCT_ID",
    "EAN": "789609492139$i",
    "TITLE": "Produto Teste $i",
    "DESCRIPTION": "Descrição do Produto $i",
    "SHOPID": 1,
    "PRICE": $PRICE,
    "PRICEPROMO": $(echo "scale=2; $PRICE * 0.9" | bc),
    "WHOLESALEPRICE": $(echo "scale=2; $PRICE * 0.8" | bc),
    "WHOLESALEMIN": 10,
    "QUANTITY": $QUANTITY,
    "CATEGORY": "CATEGORIA_$((i % 5))",
    "MEASURE": 0,
    "NCM": "30044990",
    "BRAND": "Marca $((i % 10))",
    "IMAGELINK": "",
    "SIZE": 1.0,
    "COLOR": "",
    "DATACADASTROPRODUTO": "2025-12-23T10:00:00.000",
    "DATAATUALIZACAOPRODUTO": "2025-12-23T10:00:00.000",
    "DATAATUALIZACAOESTOQUE": "2025-12-23T10:00:00.000"
  }
EOF

  if [ $i -lt $NUM_PRODUCTS ]; then
    echo "," >> /tmp/large-payload.json
  fi
  
  # Progress indicator
  if [ $((i % 1000)) -eq 0 ]; then
    echo "  Generated $i products..."
  fi
done

echo "]" >> /tmp/large-payload.json

FILESIZE=$(du -h /tmp/large-payload.json | cut -f1)
echo "✅ Payload generated: $FILESIZE"
echo ""
echo "📤 Sending to API..."

START_TIME=$(date +%s)

curl -X POST http://localhost:3000/v1/inovafarma/products \
  -H "Content-Type: application/json" \
  -H 'X-Inova-Api-Key: JFiennsli3iNLL2@DFDsdfdAS!JDISkddkLndJKJKN!@;sadffd:kjasjk' \
  -H "X-Inova-Load-Type: full" \
  --data @/tmp/large-payload.json \
  --max-time 60 \
  -v \
  -w "\n\n⏱️  HTTP Status: %{http_code}\n⏱️  Time: %{time_total}s\n"

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo ""
echo "✅ Test completed in ${DURATION}s"
echo "📊 Products sent: $NUM_PRODUCTS"
echo "📦 Payload size: $FILESIZE"
