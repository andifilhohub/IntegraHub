# IntegraHub - Roadmap & Próximos Passos

## ✅ Implementado

### Core Pipeline (100% Funcional)
- [x] API de Ingestão (Fastify)
  - [x] Endpoint POST /v1/inovafarma/products
  - [x] Validação de headers (X-Inova-Api-Key, X-Inova-Load-Type)
  - [x] Streaming para MinIO
  - [x] Idempotência automática
  - [x] Graceful shutdown
  - [x] Health check endpoint

- [x] Worker de Chunking
  - [x] Consumer Kafka (batches.received)
  - [x] Download de payload do MinIO
  - [x] Divisão em chunks de 1000 produtos
  - [x] Upload de chunks para MinIO
  - [x] Publicação de eventos (chunks.ready)

- [x] Workers de Upsert (2-4 instâncias)
  - [x] Consumer group Kafka (chunks.ready)
  - [x] Bulk INSERT com ON CONFLICT
  - [x] Suporte a FULL e DELTA loads
  - [x] Soft delete para FULL loads
  - [x] Tracking de progresso de batches

- [x] Worker Orchestrator
  - [x] Gerenciamento de 1 chunker + 2-4 upsert workers
  - [x] Framework de auto-scaling
  - [x] Monitoramento de workers

- [x] Database Schema
  - [x] Tabela Pharmacy
  - [x] Tabela Product (com todos os campos)
  - [x] Tabela batches
  - [x] Tabela batch_chunks
  - [x] Constraints e índices

- [x] Infraestrutura de Testes
  - [x] Scripts de teste de carga
  - [x] Teste de pipeline completo
  - [x] Mega stress test (50k requisições)
  - [x] Scripts de monitoramento

---

## 🔧 Melhorias Necessárias

### 1. Observabilidade & Monitoramento (Alta Prioridade)

#### Métricas Prometheus
- [ ] Instrumentar API com prom-client
  - [ ] Contador de requisições por status (202, 400, 500)
  - [ ] Histograma de latência de upload
  - [ ] Gauge de tamanho de payloads
  - [ ] Contador de batches criados

- [ ] Instrumentar Workers
  - [ ] Gauge de workers ativos
  - [ ] Contador de chunks processados
  - [ ] Histograma de tempo de processamento
  - [ ] Gauge de Kafka lag por consumer group
  - [ ] Contador de erros por tipo

- [ ] Métricas de Negócio
  - [ ] Taxa de produtos processados/segundo
  - [ ] Taxa de sucesso de batches
  - [ ] Tempo médio de processamento de batch
  - [ ] Produtos ativos vs inativos

#### Dashboard Grafana
- [ ] Criar dashboard de API
  - [ ] Requisições/segundo
  - [ ] Latência P50, P95, P99
  - [ ] Taxa de erro
  - [ ] Tamanho médio de payload

- [ ] Criar dashboard de Workers
  - [ ] Workers ativos vs máximo
  - [ ] Kafka lag
  - [ ] Throughput de produtos
  - [ ] Chunks pendentes vs processados

- [ ] Criar dashboard de Negócio
  - [ ] Batches por status
  - [ ] CNPJs processados
  - [ ] Produtos ingeridos (24h, 7d, 30d)
  - [ ] Taxa de atualização vs novos produtos

#### Alertas
- [ ] Kafka lag > 10000 mensagens
- [ ] Taxa de erro da API > 5%
- [ ] Workers crash loop
- [ ] PostgreSQL conexões > 80%
- [ ] MinIO storage > 80%

### 2. Resiliência & Error Handling (Alta Prioridade)

#### Retry Automático
- [ ] Implementar retry exponencial para chunks falhados
  - [ ] Max 3 tentativas com backoff
  - [ ] Após 3 falhas → Dead Letter Queue

- [ ] Dead Letter Queue (DLQ)
  - [ ] Tópico Kafka: chunks.failed
  - [ ] Worker dedicado para análise de falhas
  - [ ] Interface para reprocessamento manual

#### Circuit Breaker
- [ ] Implementar circuit breaker para:
  - [ ] Conexões com MinIO
  - [ ] Conexões com PostgreSQL
  - [ ] Conexões com Kafka

#### Health Checks Avançados
- [ ] Health check detalhado da API
  - [ ] Verificar conectividade Kafka
  - [ ] Verificar conectividade MinIO
  - [ ] Verificar conectividade PostgreSQL
  - [ ] Retornar status 503 se algum serviço está down

- [ ] Liveness probe para workers
- [ ] Readiness probe para workers

### 3. Performance & Otimizações (Média Prioridade)

#### Database
- [ ] Adicionar índices adicionais
  - [ ] `Product(cnpj, lastSeenAt)` para FULL loads
  - [ ] `batches(status, created_at)` para queries
  - [ ] `batch_chunks(batch_id, status)` para tracking

- [ ] Connection pooling otimizado
  - [ ] Ajustar min/max connections por worker
  - [ ] Implementar pool connection reuse

- [ ] Query optimization
  - [ ] Usar COPY ao invés de multi-row INSERT (se necessário)
  - [ ] Batch updates para batch progress
  - [ ] Preparar statements reutilizáveis

#### Kafka
- [ ] Configurar partições adequadas
  - [ ] batches.received: 10 partições (para paralelismo)
  - [ ] chunks.ready: 20 partições (mais workers)

- [ ] Tuning de consumer
  - [ ] Ajustar fetch.min.bytes
  - [ ] Ajustar fetch.max.wait.ms
  - [ ] Ajustar max.poll.records

- [ ] Compressão de mensagens
  - [ ] Habilitar compression.type=snappy no producer

#### MinIO
- [ ] Lifecycle policies
  - [ ] Expirar payloads após 30 dias
  - [ ] Mover chunks para cold storage após 7 dias

- [ ] Otimizar uploads
  - [ ] Multipart upload para payloads > 5MB
  - [ ] Connection reuse

### 4. Segurança (Média Prioridade)

#### API Security
- [ ] Rate limiting por API key
  - [ ] Limite: 100 req/min por CNPJ
  - [ ] Retornar 429 Too Many Requests

- [ ] Validação de payload
  - [ ] JSON Schema validation
  - [ ] Tamanho máximo por produto
  - [ ] Validação de CNPJ format

- [ ] HTTPS obrigatório
  - [ ] Configurar TLS certificates
  - [ ] Redirect HTTP → HTTPS

#### Infrastructure Security
- [ ] Secrets management
  - [ ] Migrar para AWS Secrets Manager / Vault
  - [ ] Rotação automática de credenciais

- [ ] Network policies
  - [ ] Workers → PostgreSQL only
  - [ ] API → MinIO + Kafka + PostgreSQL
  - [ ] Nenhum acesso externo direto

### 5. Auto-scaling Real (Média Prioridade)

#### Implementar auto-scaling baseado em métricas
- [ ] Escalar workers baseado em Kafka lag
  - [ ] Lag > 5000: adicionar 1 worker
  - [ ] Lag < 1000: remover 1 worker
  - [ ] Min: 2 workers, Max: 16 workers

- [ ] Escalar API baseado em CPU/memória
  - [ ] CPU > 70%: adicionar 1 instância
  - [ ] CPU < 30%: remover 1 instância
  - [ ] Min: 2 instâncias, Max: 10 instâncias

### 6. Features Adicionais (Baixa Prioridade)

#### Webhook de Notificação
- [ ] Notificar cliente quando batch completo
  - [ ] POST para webhook_url configurado
  - [ ] Payload: batch_id, status, items_processed, timestamp

#### API de Consulta
- [ ] Endpoint GET /v1/batches/:batch_id
  - [ ] Status do batch
  - [ ] Progresso (X/Y produtos processados)
  - [ ] Tempo estimado de conclusão

- [ ] Endpoint GET /v1/products
  - [ ] Buscar produtos por CNPJ
  - [ ] Filtros: category, price range, stock
  - [ ] Paginação

#### Interface de Administração
- [ ] Dashboard web para monitoramento
  - [ ] Lista de batches (últimas 24h)
  - [ ] Gráficos de throughput
  - [ ] Logs de erros
  - [ ] Reprocessar batches falhados

### 7. Testes (Média Prioridade)

#### Testes Automatizados
- [ ] Unit tests
  - [ ] Bulk operations
  - [ ] Chunk generation
  - [ ] Payload validation

- [ ] Integration tests
  - [ ] API → MinIO → Kafka flow
  - [ ] Worker → PostgreSQL flow
  - [ ] End-to-end pipeline test

- [ ] Load tests
  - [ ] 100k requisições simultâneas
  - [ ] 1M produtos em 1 batch
  - [ ] 10 CNPJs enviando simultaneamente

#### CI/CD
- [ ] GitHub Actions
  - [ ] Run tests on PR
  - [ ] Build Docker images
  - [ ] Deploy to staging on merge to main
  - [ ] Deploy to production on tag

### 8. Documentação (Baixa Prioridade)

- [ ] OpenAPI/Swagger spec para API
- [ ] Diagramas de arquitetura atualizados
- [ ] Runbook para operações
  - [ ] Como reiniciar workers
  - [ ] Como reprocessar batch falhado
  - [ ] Como fazer rollback
- [ ] SLA e SLO definidos

---

## 🎯 Prioridades para as Próximas Sprints

### Sprint 1 (1-2 semanas)
1. ✅ Deploy em produção (básico)
2. ⚠️ Observabilidade básica (Prometheus + Grafana)
3. ⚠️ Health checks avançados
4. ⚠️ Retry automático para chunks falhados

### Sprint 2 (2-3 semanas)
1. Auto-scaling baseado em Kafka lag
2. Dead Letter Queue
3. Rate limiting na API
4. Testes de carga 100k requisições

### Sprint 3 (3-4 semanas)
1. Webhook de notificação
2. API de consulta de batches
3. Dashboard de administração
4. Documentação completa

---

## 📊 KPIs a Medir

### Performance
- Throughput: **> 10,000 produtos/segundo**
- Latência API P95: **< 500ms**
- Latência processamento batch: **< 5 minutos** (para batches de 10k produtos)

### Confiabilidade
- Uptime API: **> 99.9%**
- Taxa de sucesso de batches: **> 99.5%**
- Taxa de retry bem-sucedidos: **> 95%**

### Escalabilidade
- Suporte a **1000 CNPJs simultâneos**
- Suporte a **100k requisições/dia**
- Suporte a **10M produtos/dia**

---

**Status Geral**: Sistema em **produção-ready** para cargas médias. Necessita observabilidade e resiliência para cargas massivas em produção.
