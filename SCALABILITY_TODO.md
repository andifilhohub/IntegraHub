# Scalability TODO — 10k Farmácias

## Dias 1–2 — Ganhos Rápidos (DB + Config)

- [ ] Adicionar índices críticos no banco de dados: `("pharmacyId", "isActive")`, `("pharmacyId", "lastBatchId")`, `("batch_id", "status")` em `batch_chunks`
- [ ] Aumentar pool de conexões do banco: `max: 150`, `connectionTimeoutMillis: 5000`, `idleTimeoutMillis: 60000`
- [ ] Aumentar `MAX_UPSERT_WORKERS` para 32+ e `MIN_UPSERT_WORKERS` para 8+ no `.env.example` e orchestrator

## Dias 2–3 — Previne OOM (Streaming + Chunker Scale)

- [ ] Refatorar stream handling no `chunker.js` para usar `JSONStream.parse()` em vez de acumular buffer em memória
- [ ] Refatorar stream handling no `upsert.js` para usar `JSONStream.parse()` em vez de acumular buffer em memória
- [ ] Refatorar stream handling no `sales.js` para usar `JSONStream.parse()` em vez de acumular buffer em memória
- [ ] Paralelizar upload de chunks no `chunker.js` com `Promise.all` + limite de concorrência (10–20)
- [ ] Escalar chunker para consumer group — permitir múltiplas instâncias (4–8) via variável de ambiente

## Dias 3–4 — Habilita Escala Real

- [ ] Implementar leitura real de consumer lag do Kafka no orchestrator (substituir `const lag = 0`)
- [ ] Adicionar backpressure na API: verificar lag do Kafka antes de aceitar request, retornar 503 se lag > threshold
- [ ] Implementar retry com backoff exponencial no `chunker.js` (substituir retry imediato sem delay)
- [ ] Implementar retry com backoff exponencial no `upsert.js` (substituir retry imediato sem delay)
- [ ] Criar Dead Letter Queue (DLQ) no Kafka para chunks e batches que excedem `MAX_RETRIES`
- [ ] Mudar consumer de `eachMessage` para `eachBatch` com prefetch de 50–100 mensagens por ciclo nos upsert workers
- [ ] Substituir polling de conclusão de batch (`COUNT` em `batch_chunks`) por trigger no PostgreSQL
- [ ] Adicionar rate limiting por farmácia na API (ex: 100 requests/min por CNPJ)

## Dias 4–5 — Observabilidade

- [ ] Expor métricas Prometheus: consumer lag, pool de DB, throughput de chunks, error rate por worker
- [ ] Configurar alertas: lag > 10k, pool DB > 80%, worker memory > 2GB, API error rate > 1%

## Validação Final

- [ ] Executar load test com 10k farmácias simuladas após todos os fixes para validar throughput e estabilidade

---

## Capacidade Estimada por Fase

| Fase concluída | Farmácias simultâneas |
|---|---|
| Hoje (sem fixes) | ~100–200 |
| Após Dias 1–2 | ~500–1.000 |
| Após Dias 2–3 | ~3.000–5.000 |
| Após todos os fixes | **10.000+** |
