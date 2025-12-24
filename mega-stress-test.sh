#!/bin/bash

# Mega Stress Test - 50,000 requests
# Otimizado para enviar grande volume de requisições

set -e

API_URL="http://localhost:3000/v1/inovafarma/products"
API_KEY='JFiennsli3iNLL2@DFDsdfdAS!JDISkddkLndJKJKN!@;sadffd:kjasjk'

# Configuração do teste
TOTAL_REQUESTS=50000
CONCURRENT=100           # Requisições simultâneas por batch
PRODUCTS_PER_REQUEST=10  # Poucos produtos para focar em throughput de requisições
BATCH_SIZE=1000          # Processar em lotes de 1000 requisições

echo "🔥🔥🔥 IntegraHub MEGA Stress Test 🔥🔥🔥"
echo "=========================================="
echo "  Total requests: $TOTAL_REQUESTS"
echo "  Concurrent per batch: $CONCURRENT"
echo "  Products per request: $PRODUCTS_PER_REQUEST"
echo "  Total products: $((TOTAL_REQUESTS * PRODUCTS_PER_REQUEST))"
echo "  Batch size: $BATCH_SIZE"
echo "  Total batches: $((TOTAL_REQUESTS / BATCH_SIZE))"
echo ""

# Verificar se API está rodando
if ! curl -s http://localhost:3000/health > /dev/null; then
  echo "❌ API não está rodando em http://localhost:3000"
  echo "   Execute: npm run dev"
  exit 1
fi

echo "⚙️  Otimizando sistema..."
# Aumentar file descriptors
ulimit -n 65535 2>/dev/null || echo "⚠️  Não foi possível aumentar ulimit (requer sudo)"

# Criar diretório temporário para payloads
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

echo "📦 Gerando payloads (isso pode levar alguns minutos)..."

# Gerar payloads únicos (para evitar idempotência)
generate_payload() {
  local request_id=$1
  local cnpj_suffix=$((request_id % 1000))  # 1000 CNPJs diferentes
  local cnpj="0592722800$cnpj_suffix"
  
  echo -n '['
  for i in $(seq 1 $PRODUCTS_PER_REQUEST); do
    if [ $i -gt 1 ]; then echo -n ','; fi
    local product_id=$((request_id * 100 + i))
    cat <<EOF
{"CNPJ":"$cnpj","INDICE":$i,"PRODUCTID":$product_id,"EAN":"78960$product_id","TITLE":"Mega Test $product_id","DESCRIPTION":"Stress test product","SHOPID":1,"PRICE":$(awk -v seed=$request_id$i 'BEGIN{srand(seed); printf "%.2f", rand()*100}'),"PRICEPROMO":0,"WHOLESALEPRICE":0,"WHOLESALEMIN":0,"QUANTITY":$(( (request_id + i) % 100 + 1 )),"CATEGORY":"MEGA_STRESS","MEASURE":0,"NCM":"30044990","BRAND":"StressBrand","IMAGELINK":"","SIZE":1.0,"COLOR":"","DATACADASTROPRODUTO":"2025-12-23T00:00:00","DATAATUALIZACAOPRODUTO":"2025-12-23T00:00:00","DATAATUALIZACAOESTOQUE":"2025-12-23T00:00:00"}
EOF
  done
  echo ']'
}

# Gerar alguns payloads de template (reusar para economizar tempo)
NUM_TEMPLATES=100
echo "  Criando $NUM_TEMPLATES templates de payload..."
for i in $(seq 1 $NUM_TEMPLATES); do
  generate_payload $i > "$TEMP_DIR/payload_$i.json"
done

echo "✅ Payloads gerados"
echo ""

# Função para enviar requisição
send_request() {
  local request_id=$1
  local template_id=$((request_id % NUM_TEMPLATES + 1))
  local payload_file="$TEMP_DIR/payload_$template_id.json"
  
  # Enviar requisição
  local http_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL" \
    -H "Content-Type: application/json" \
    -H "X-Inova-Api-Key: $API_KEY" \
    -H "X-Inova-Load-Type: delta" \
    -H "Idempotency-Key: mega-stress-$request_id" \
    --data-binary "@$payload_file" \
    --max-time 30)
  
  echo "$http_code"
}

# Executar teste em batches
TOTAL_BATCHES=$((TOTAL_REQUESTS / BATCH_SIZE))
START_TIME=$(date +%s)
SUCCESSFUL=0
FAILED=0
TIMEOUT=0

echo "🚀 Iniciando envio de $TOTAL_REQUESTS requisições..."
echo ""

for batch in $(seq 1 $TOTAL_BATCHES); do
  BATCH_START=$(date +%s)
  batch_success=0
  batch_fail=0
  
  # Enviar BATCH_SIZE requisições em paralelo (com controle de concorrência)
  pids=()
  results=()
  
  for i in $(seq 1 $BATCH_SIZE); do
    request_id=$(( (batch - 1) * BATCH_SIZE + i ))
    
    # Controle de concorrência - aguardar se já temos CONCURRENT processos
    while [ ${#pids[@]} -ge $CONCURRENT ]; do
      # Verificar processos finalizados
      for idx in "${!pids[@]}"; do
        if ! kill -0 ${pids[$idx]} 2>/dev/null; then
          wait ${pids[$idx]}
          unset pids[$idx]
        fi
      done
      pids=("${pids[@]}")  # Reindexar array
      sleep 0.01
    done
    
    # Enviar requisição em background
    (
      result=$(send_request $request_id)
      echo "$result" > "$TEMP_DIR/result_$request_id.txt"
    ) &
    pids+=($!)
  done
  
  # Aguardar todas as requisições do batch
  for pid in "${pids[@]}"; do
    wait $pid 2>/dev/null || true
  done
  
  # Contar resultados do batch
  for i in $(seq 1 $BATCH_SIZE); do
    request_id=$(( (batch - 1) * BATCH_SIZE + i ))
    if [ -f "$TEMP_DIR/result_$request_id.txt" ]; then
      code=$(cat "$TEMP_DIR/result_$request_id.txt")
      if [ "$code" = "202" ]; then
        ((batch_success++))
        ((SUCCESSFUL++))
      elif [ "$code" = "000" ]; then
        ((TIMEOUT++))
      else
        ((batch_fail++))
        ((FAILED++))
      fi
    fi
  done
  
  BATCH_END=$(date +%s)
  BATCH_DURATION=$((BATCH_END - BATCH_START))
  ELAPSED=$((BATCH_END - START_TIME))
  PROGRESS=$(awk "BEGIN {printf \"%.1f\", ($batch/$TOTAL_BATCHES)*100}")
  
  echo "📊 Batch $batch/$TOTAL_BATCHES ($PROGRESS%) - ${BATCH_DURATION}s - ✅ $batch_success ❌ $batch_fail - Total: ✅ $SUCCESSFUL ❌ $FAILED ⏱ $TIMEOUT - Elapsed: ${ELAPSED}s"
  
  # Pequena pausa entre batches para não sobrecarregar
  if [ $batch -lt $TOTAL_BATCHES ]; then
    sleep 0.5
  fi
done

END_TIME=$(date +%s)
TOTAL_DURATION=$((END_TIME - START_TIME))

echo ""
echo "================================================"
echo "🏁 MEGA Stress Test Completed"
echo "================================================"
echo "  Total duration: ${TOTAL_DURATION}s ($((TOTAL_DURATION / 60))m $((TOTAL_DURATION % 60))s)"
echo "  Successful requests: $SUCCESSFUL"
echo "  Failed requests: $FAILED"
echo "  Timeout requests: $TIMEOUT"
echo "  Success rate: $(awk "BEGIN {printf \"%.2f%%\", ($SUCCESSFUL/($SUCCESSFUL+$FAILED+$TIMEOUT))*100}")"
echo "  Throughput: $(awk "BEGIN {printf \"%.1f\", $SUCCESSFUL/$TOTAL_DURATION}") requests/sec"
echo "  Products sent: $((SUCCESSFUL * PRODUCTS_PER_REQUEST))"
echo "  Products/sec: $(awk "BEGIN {printf \"%.0f\", ($SUCCESSFUL*$PRODUCTS_PER_REQUEST)/$TOTAL_DURATION}")"
echo ""

# Aguardar processamento
echo "⏳ Aguardando 30 segundos para workers processarem..."
sleep 30

echo ""
echo "📊 Database Status:"
PGPASSWORD=kdnfpsjf_sf098ew2 psql -h localhost -U integrahub_user -d integra_hub << 'EOF'
SELECT 
  COUNT(*) as total_products,
  COUNT(DISTINCT "pharmacyId") as unique_pharmacies,
  MAX("updatedAt") as last_update
FROM "Product"
WHERE category = 'MEGA_STRESS';

SELECT 
  status,
  COUNT(*) as batches,
  SUM(items_total) as total_items,
  SUM(items_processed) as processed,
  SUM(items_failed) as failed
FROM batches
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY status
ORDER BY status;
EOF

echo ""
echo "✅ Mega stress test finalizado!"
echo "💡 Dica: Execute './check-pipeline-status.sh' para ver status detalhado"
