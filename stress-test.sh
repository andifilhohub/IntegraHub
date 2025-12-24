#!/bin/bash

# Stress Test - IntegraHub API
# Simula múltiplas requisições simultâneas

set -e

API_URL="http://localhost:3000/v1/inovafarma/products"
API_KEY='JFiennsli3iNLL2@DFDsdfdAS!JDISkddkLndJKJKN!@;sadffd:kjasjk'
LOAD_TYPE="delta"  # Use delta para evitar soft deletes em testes

# Parâmetros do teste
CONCURRENT_REQUESTS=${1:-10}      # Número de requisições simultâneas
PRODUCTS_PER_REQUEST=${2:-1000}   # Produtos por requisição
TOTAL_ROUNDS=${3:-3}              # Quantas rodadas de requisições

echo "🔥 IntegraHub Stress Test"
echo "======================="
echo "  Concurrent requests: $CONCURRENT_REQUESTS"
echo "  Products per request: $PRODUCTS_PER_REQUEST"
echo "  Total rounds: $TOTAL_ROUNDS"
echo "  Total requests: $((CONCURRENT_REQUESTS * TOTAL_ROUNDS))"
echo "  Total products: $((CONCURRENT_REQUESTS * TOTAL_ROUNDS * PRODUCTS_PER_REQUEST))"
echo ""

# Verificar se API está rodando
if ! curl -s http://localhost:3000/health > /dev/null; then
  echo "❌ API não está rodando em http://localhost:3000"
  echo "   Execute: npm run dev"
  exit 1
fi

# Verificar se workers estão rodando
if ! pgrep -f "workers/orchestrator" > /dev/null; then
  echo "⚠️  Workers não estão rodando"
  echo "   Recomendado: npm run workers (em outro terminal)"
  read -p "   Continuar mesmo assim? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

echo "✅ Preparando testes..."
echo ""

# Função para gerar payload
generate_payload() {
  local products=$1
  local cnpj=$2
  local batch_num=$3
  
  echo -n '['
  for i in $(seq 1 $products); do
    if [ $i -gt 1 ]; then echo -n ','; fi
    local product_id=$((batch_num * 100000 + i))
    cat <<EOF
{
  "CNPJ": "$cnpj",
  "INDICE": $i,
  "PRODUCTID": $product_id,
  "EAN": "789609492$product_id",
  "TITLE": "Product Stress Test $product_id",
  "DESCRIPTION": "Stress test product $batch_num-$i",
  "SHOPID": 1,
  "PRICE": $(awk -v seed=$RANDOM 'BEGIN{srand(seed); printf "%.2f", rand()*100 + 10}'),
  "PRICEPROMO": $(awk -v seed=$RANDOM 'BEGIN{srand(seed); printf "%.2f", rand()*80 + 5}'),
  "WHOLESALEPRICE": 0,
  "WHOLESALEMIN": 0,
  "QUANTITY": $(shuf -i 1-100 -n 1),
  "CATEGORY": "STRESS_TEST",
  "MEASURE": 0,
  "NCM": "30044990",
  "BRAND": "StressTest",
  "IMAGELINK": "",
  "SIZE": 1.0,
  "COLOR": "",
  "DATACADASTROPRODUTO": "$(date -Iseconds)",
  "DATAATUALIZACAOPRODUTO": "$(date -Iseconds)",
  "DATAATUALIZACAOESTOQUE": "$(date -Iseconds)"
}
EOF
  done
  echo ']'
}

# Função para enviar requisição
send_request() {
  local request_id=$1
  local round=$2
  local cnpj="0592722800014$request_id"  # CNPJs diferentes para paralelismo Kafka
  local start_time=$(date +%s%3N)
  
  # Gerar payload em arquivo temporário
  local temp_file=$(mktemp)
  generate_payload $PRODUCTS_PER_REQUEST $cnpj $((round * 1000 + request_id)) > "$temp_file"
  
  # Enviar requisição
  local response=$(curl -s -w "\n%{http_code}\n%{time_total}" -X POST "$API_URL" \
    -H "Content-Type: application/json" \
    -H "X-Inova-Api-Key: $API_KEY" \
    -H "X-Inova-Load-Type: $LOAD_TYPE" \
    --data-binary "@$temp_file")
  
  local http_code=$(echo "$response" | tail -n 2 | head -n 1)
  local time_total=$(echo "$response" | tail -n 1)
  local end_time=$(date +%s%3N)
  local duration=$((end_time - start_time))
  
  rm -f "$temp_file"
  
  if [ "$http_code" = "202" ]; then
    echo "✅ Request #$request_id (Round $round): ${time_total}s (${duration}ms) - CNPJ: $cnpj"
  else
    echo "❌ Request #$request_id (Round $round): HTTP $http_code - FAILED"
  fi
}

# Executar testes
TOTAL_START=$(date +%s)
SUCCESSFUL=0
FAILED=0

for round in $(seq 1 $TOTAL_ROUNDS); do
  echo "🚀 Round $round/$TOTAL_ROUNDS - Sending $CONCURRENT_REQUESTS concurrent requests..."
  
  # Enviar requisições em paralelo
  pids=()
  for i in $(seq 1 $CONCURRENT_REQUESTS); do
    send_request $i $round &
    pids+=($!)
  done
  
  # Aguardar todas as requisições
  for pid in "${pids[@]}"; do
    if wait $pid; then
      ((SUCCESSFUL++))
    else
      ((FAILED++))
    fi
  done
  
  echo ""
  
  # Pausa entre rounds para não sobrecarregar
  if [ $round -lt $TOTAL_ROUNDS ]; then
    echo "⏳ Aguardando 2 segundos antes do próximo round..."
    sleep 2
    echo ""
  fi
done

TOTAL_END=$(date +%s)
TOTAL_DURATION=$((TOTAL_END - TOTAL_START))

echo "================================================"
echo "📊 Stress Test Results"
echo "================================================"
echo "  Total duration: ${TOTAL_DURATION}s"
echo "  Successful requests: $SUCCESSFUL"
echo "  Failed requests: $FAILED"
echo "  Success rate: $(awk "BEGIN {printf \"%.2f%%\", ($SUCCESSFUL/($SUCCESSFUL+$FAILED))*100}")"
echo "  Average time per request: $(awk "BEGIN {printf \"%.2fs\", $TOTAL_DURATION/($SUCCESSFUL+$FAILED)}")"
echo "  Products sent: $((SUCCESSFUL * PRODUCTS_PER_REQUEST))"
echo "  Throughput: $(awk "BEGIN {printf \"%.0f\", ($SUCCESSFUL*$PRODUCTS_PER_REQUEST)/$TOTAL_DURATION}") products/sec"
echo ""

# Aguardar processamento dos workers
echo "⏳ Aguardando 10 segundos para workers processarem..."
sleep 10

# Verificar resultados no banco
echo ""
echo "📊 Database Status:"
PGPASSWORD=kdnfpsjf_sf098ew2 psql -h localhost -U integrahub_user -d integra_hub << 'EOF'
SELECT 
  COUNT(*) as total_products,
  COUNT(DISTINCT "pharmacyId") as unique_cnpjs,
  MAX("updatedAt") as last_update
FROM "Product"
WHERE category = 'STRESS_TEST';

SELECT 
  status,
  COUNT(*) as count,
  SUM(items_total) as total_items,
  SUM(items_processed) as processed_items
FROM batches
WHERE created_at > NOW() - INTERVAL '5 minutes'
GROUP BY status;
EOF

echo ""
echo "✅ Stress test completed!"
