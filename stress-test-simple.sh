#!/bin/bash

# Stress Test Simples - Usando Apache Bench (ab)

set -e

API_URL="http://localhost:3000/v1/inovafarma/products"
API_KEY='JFiennsli3iNLL2@DFDsdfdAS!JDISkddkLndJKJKN!@;sadffd:kjasjk'

CONCURRENT=${1:-10}   # Requisições simultâneas
TOTAL=${2:-100}        # Total de requisições
PRODUCTS=${3:-100}     # Produtos por requisição

echo "🔥 IntegraHub Stress Test (Apache Bench)"
echo "========================================"
echo "  Concurrent: $CONCURRENT"
echo "  Total requests: $TOTAL"
echo "  Products per request: $PRODUCTS"
echo "  Total products: $((TOTAL * PRODUCTS))"
echo ""

# Gerar payload de teste
echo "📦 Generating test payload..."
PAYLOAD='['
for i in $(seq 1 $PRODUCTS); do
  if [ $i -gt 1 ]; then PAYLOAD+=','; fi
  product_id=$((900000 + i))
  PAYLOAD+="{\"CNPJ\":\"05927228000145\",\"INDICE\":$i,\"PRODUCTID\":$product_id,\"EAN\":\"7896$i\",\"TITLE\":\"Stress Test $i\",\"DESCRIPTION\":\"Test\",\"SHOPID\":1,\"PRICE\":10.0,\"PRICEPROMO\":9.0,\"WHOLESALEPRICE\":0,\"WHOLESALEMIN\":0,\"QUANTITY\":10,\"CATEGORY\":\"STRESS\",\"MEASURE\":0,\"NCM\":\"30044990\",\"BRAND\":\"Test\",\"IMAGELINK\":\"\",\"SIZE\":1.0,\"COLOR\":\"\",\"DATACADASTROPRODUTO\":\"2025-12-23T00:00:00\",\"DATAATUALIZACAOPRODUTO\":\"2025-12-23T00:00:00\",\"DATAATUALIZACAOESTOQUE\":\"2025-12-23T00:00:00\"}"
done
PAYLOAD+=']'

# Salvar em arquivo
TEMP_FILE=$(mktemp)
echo "$PAYLOAD" > "$TEMP_FILE"

echo "📊 Payload size: $(stat -f%z "$TEMP_FILE" 2>/dev/null || stat -c%s "$TEMP_FILE") bytes"
echo ""

# Verificar se ab está instalado
if ! command -v ab &> /dev/null; then
  echo "⚠️  Apache Bench (ab) não está instalado"
  echo "   Ubuntu/Debian: sudo apt-get install apache2-utils"
  echo "   MacOS: brew install httpd (ab já vem incluído)"
  echo ""
  echo "🔄 Usando curl em loop..."
  
  START=$(date +%s)
  SUCCESS=0
  FAILED=0
  
  for i in $(seq 1 $TOTAL); do
    RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL" \
      -H "Content-Type: application/json" \
      -H "X-Inova-Api-Key: $API_KEY" \
      -H "X-Inova-Load-Type: delta" \
      --data-binary "@$TEMP_FILE")
    
    if [ "$RESPONSE" = "202" ]; then
      ((SUCCESS++))
      echo -ne "✅ $SUCCESS/$TOTAL \r"
    else
      ((FAILED++))
      echo "❌ Request $i failed: HTTP $RESPONSE"
    fi
  done
  
  END=$(date +%s)
  DURATION=$((END - START))
  
  echo ""
  echo "================================================"
  echo "📊 Results"
  echo "================================================"
  echo "  Total time: ${DURATION}s"
  echo "  Successful: $SUCCESS"
  echo "  Failed: $FAILED"
  echo "  Requests/sec: $(awk "BEGIN {printf \"%.2f\", $SUCCESS/$DURATION}")"
  echo "  Products/sec: $(awk "BEGIN {printf \"%.0f\", ($SUCCESS*$PRODUCTS)/$DURATION}")"
  
else
  # Usar Apache Bench
  echo "🚀 Running Apache Bench..."
  echo ""
  
  ab -n $TOTAL \
     -c $CONCURRENT \
     -p "$TEMP_FILE" \
     -T "application/json" \
     -H "X-Inova-Api-Key: $API_KEY" \
     -H "X-Inova-Load-Type: delta" \
     "$API_URL"
fi

rm -f "$TEMP_FILE"

echo ""
echo "⏳ Waiting 5 seconds for workers to process..."
sleep 5

echo ""
echo "📊 Database Status:"
PGPASSWORD=kdnfpsjf_sf098ew2 psql -h localhost -U integrahub_user -d integra_hub -c \
  "SELECT COUNT(*) as products FROM \"Product\" WHERE category = 'STRESS';"

echo ""
echo "✅ Stress test completed!"
