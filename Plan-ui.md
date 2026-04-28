# Plano de UI — IntegraHub Observability Dashboard

## Visão geral

Frontend standalone (React + Vite) que consome uma **API de observabilidade** nova adicionada ao IntegraHub. Sem overhead no caminho crítico — lê direto do banco em queries otimizadas. Métricas de infraestrutura expostas via Prometheus e visualizadas no Grafana; métricas de negócio/operação numa UI custom.

---

## Estrutura de páginas

### 1. Dashboard (Home)

Visão geral em tempo quase-real. Cards de status e alertas de atenção.

**Métricas no topo:**
- Batches nas últimas 24h (total, `COMPLETED`, `FAILED`, `PARTIAL_FAIL`)
- Produtos processados (upserts) nas últimas 24h
- Vendas recebidas / pendentes / consumidas
- Farmácias ativas (com atividade nos últimos 7 dias)
- Taxa de sucesso de chunks (%)
- Workers ativos vs máximo configurado
- Kafka lag total (soma dos consumer groups: `chunker-workers` + `upsert-workers` + `sales-workers`)

**Gráficos:**
- Linha: volume de batches/hora (delta vs full separados por cor)
- Gauge: Kafka lag por consumer group (verde/amarelo/vermelho por threshold)

**Tabela "Últimos eventos críticos":** chunks com `FAILED`, batches com `error_message`, vendas presas em `PROCESSING`

---

### 2. Requisições de API (Request Log)

Cada chamada à API registrada com contexto completo.

> **Necessidade nova:** o IntegraHub hoje não persiste request log. Requer middleware Fastify que grava na tabela `api_requests` de forma assíncrona (sem impactar latência).

**Colunas da tabela:**

| Campo | Descrição |
|-------|-----------|
| Timestamp | Data e hora exata |
| Método + Endpoint | `POST /v1/inovafarma/products` |
| CNPJ / farmácia | Quem chamou |
| Status HTTP | 200, 400, 409, 500… |
| Latência (ms) | Tempo de resposta |
| Load Type | `full` / `delta` / `—` |
| Idempotency-Key | Chave usada ou gerada |
| Batch ID | Link para o batch gerado |
| Tamanho payload | Bytes recebidos |
| IP origem | |
| Auth key (mascarada) | Últimos 4 chars da chave |

**Filtros:** por farmácia, endpoint, status HTTP, load type, intervalo de data/hora

**Tabela proposta (`api_requests`):**
```sql
CREATE TABLE api_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint TEXT,
  method VARCHAR(10),
  pharmacy_id INTEGER,
  cnpj VARCHAR(20),
  status_code INTEGER,
  latency_ms INTEGER,
  load_type VARCHAR(10),
  idempotency_key TEXT,
  batch_id UUID,
  sale_id UUID,
  payload_size INTEGER,
  ip_address TEXT,
  api_key_hint TEXT,
  headers JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

### 3. Batches — Cargas Full e Delta

Tudo sobre cada carga recebida de cada farmácia.

**Listagem principal:**

| Campo | |
|-------|--|
| Batch ID | UUID com botão de cópia |
| Farmácia | Nome + CNPJ |
| Tipo | Badge `FULL` (laranja) / `DELTA` (azul) |
| Status | `RECEIVED` → `PROCESSING` → `COMPLETED` / `FAILED` |
| Total de itens | Quantos produtos vieram |
| Processados / Falhados | Progresso em barra |
| Data/hora recebido | |
| Duração total | `received_at` → `updated_at` |
| Idempotency key | |

**Filtros:** farmácia, tipo de carga, status, intervalo de datas

**Detalhe do batch (página/drawer):**
- Header com todas as colunas acima
- `error_message` + `error_context` formatado em JSON
- Lista de chunks com status individual
- Link para a requisição de API que gerou o batch
- **Botão "Reprocessar batch"** — disponível quando status é `FAILED` ou `PARTIAL_FAIL` (chama `POST /obs/batches/:id/reprocess`)

---

### 4. Chunks — Processamento interno

Rastreabilidade de cada pedaço do processamento.

**Listagem:**

| Campo | |
|-------|--|
| Chunk ID | |
| Batch ID | Link para o batch pai |
| Farmácia | |
| Índice | Chunk 1 de 47 |
| Status | `PENDING` / `PROCESSING` / `COMPLETED` / `FAILED` |
| Itens | Quantidade de produtos no chunk |
| Tentativas | Quantas retries |
| Processado em | Timestamp |
| Duração (ms) | |
| Erro | Mensagem se `FAILED` |

**Detalhe do chunk:**
- `error_context` JSONB expandido (mostra constraint violada, linha do erro, etc.)
- Botão "Ver produtos deste chunk" → filtra produtos por `lastBatchId`
- **Botão "Reprocessar chunk"** — disponível quando status é `FAILED` (chama `POST /obs/chunks/:id/reprocess`)

---

### 5. Produtos — Catálogo com rastreabilidade

A tela mais rica — mostra o que chegou, quando, de onde, e o estado atual.

**Listagem:**

| Campo | |
|-------|--|
| Produto | Título + imagem thumbnail |
| EAN | Código de barras |
| Farmácia | Nome + CNPJ |
| Product ID externo | |
| Preço | |
| Preço(s) promo | Array de promos |
| Estoque | |
| Status | `isActive` badge |
| Categoria / Marca | |
| Último batch | Link para o batch que atualizou |
| Última vez visto | `lastSeenAt` |
| Criado em | `createdAt` |
| Atualizado em | `updatedAt` |
| Deletado em | `deletedAt` (se inativo por full load) |

**Filtros:** farmácia, categoria, marca, isActive, EAN, intervalo de preço, intervalo de datas, batch específico, tipo da última carga

**Detalhe do produto:**
- Histórico de atualizações (query por `lastBatchId` nos batches)
- `rawJson` expandido — o que veio exatamente da farmácia
- Timeline: criado → atualizações de delta → marcado inativo (se for o caso)

---

### 6. Farmácias

Painel por farmácia — tudo consolidado por CNPJ.

**Cards:**
- Total de produtos ativos
- Último batch recebido (tipo + status + quando)
- Batches nos últimos 30 dias (volume full vs delta)
- Vendas recentes

**Detalhe da farmácia:**
- Dados cadastrais (nome, cidade, estado)
- Gráfico de atividade (batches por dia, últimos 30d)
- Lista dos últimos batches
- Lista de produtos (link para página de produtos filtrada)
- Lista de vendas

---

### 7. Vendas

Visibilidade completa sobre as vendas recebidas.

**Listagem:**

| Campo | |
|-------|--|
| Sale ID | |
| Farmácia | CNPJ + nome |
| Código da venda | `codigo_venda_online` |
| Cliente | `nome_cliente` |
| Data da venda | `data_venda` |
| Tipo e-commerce | |
| Status | `RECEIVED` → `PENDING` → `CONSUMED` / `FAILED` |
| Consumida em / por | Timestamp + sistema que consumiu |
| Recebida em | `received_at` |

**Detalhe da venda:**
- Produtos vendidos (`produtos` JSONB expandido)
- Pagamentos (`pagamentos` JSONB expandido)
- Entrega (`entrega` JSONB)
- `raw_json` completo
- Histórico de status

---

### 8. DLQ — Dead Letter Queue

Visibilidade sobre chunks que esgotaram todas as tentativas e foram para o tópico `chunks.failed`.

**Listagem:**

| Campo | |
|-------|--|
| Chunk ID | |
| Batch ID | Link para o batch pai |
| Farmácia | |
| Motivo da falha | `error_code` + `error_message` |
| Tentativas realizadas | |
| Último erro em | `last_error_at` |
| `error_context` | JSONB expandido |

**Ações:**
- Botão "Reprocessar" por chunk individual
- Botão "Reprocessar todos da farmácia X" — reprocessa todos os chunks falhados de um CNPJ
- Filtros: farmácia, intervalo de datas, error_code

---

### 9. Alertas / Saúde do sistema

Monitoramento ativo de problemas — negócio e infraestrutura.

**Alertas de negócio:**
- Chunks em `FAILED` há mais de X minutos
- Batches travados em `PROCESSING` há mais de X minutos
- Vendas travadas em `PROCESSING`
- Taxa de erro dos últimos 60 minutos acima de threshold
- Retries excessivos (chunk `attempts` > 2)

**Alertas de infraestrutura** (via endpoint `/obs/health` com verificação ativa):
- Kafka lag > 10.000 mensagens em qualquer consumer group
- PostgreSQL: conexões ativas > 80% do máximo (pool max: 20)
- MinIO: storage utilizado > 80%
- Status de conectividade em tempo real: Kafka / MinIO / PostgreSQL (verde/vermelho)

---

### 10. Grafana Dashboards (integração)

Link direto da UI custom para os dashboards Grafana com métricas Prometheus.

**Dashboard de API:**
- Requisições/segundo por endpoint
- Latência P50, P95, P99
- Taxa de erro por status HTTP
- Tamanho médio de payload

**Dashboard de Workers:**
- Workers ativos vs máximo
- Kafka lag por consumer group (série temporal)
- Throughput de produtos processados/segundo
- Chunks pendentes vs processados
- Histograma de tempo de processamento por chunk

**Dashboard de Negócio:**
- Batches por status (série temporal)
- CNPJs processados nas últimas 24h
- Produtos ingeridos (24h, 7d, 30d)
- Taxa de atualização vs novos produtos

---

## Arquitetura técnica

```
[IntegraHub API]
  ├── middleware de log ──────→ [api_requests table]
  └── prom-client ────────────→ [Prometheus] → [Grafana]

[Workers (chunker + upsert + sales)]
  └── prom-client ────────────→ [Prometheus] → [Grafana]

[PostgreSQL (batches, chunks, products, sales, pharmacies)]
  └── queries /obs/* ─────────→ [Observability API]
                                       ↓
                          [React Dashboard] (Vite + TanStack Query)
                          Tabelas: TanStack Table
                          Gráficos: Recharts
                          UI: shadcn/ui + Tailwind
                          Links: → Grafana (métricas de infra)
```

---

## Endpoints de observabilidade a criar

### Leitura
| Endpoint | Descrição |
|----------|-----------|
| `GET /obs/requests` | Request log paginado + filtros |
| `GET /obs/batches` | Batches paginados + filtros |
| `GET /obs/batches/:id` | Detalhe do batch com lista de chunks |
| `GET /obs/chunks` | Chunks paginados + filtros |
| `GET /obs/products` | Produtos paginados + filtros pesados |
| `GET /obs/products/:id` | Detalhe do produto com rawJson |
| `GET /obs/pharmacies` | Lista com métricas agregadas por farmácia |
| `GET /obs/pharmacies/:cnpj` | Detalhe consolidado da farmácia |
| `GET /obs/sales` | Vendas paginadas + filtros |
| `GET /obs/sales/:id` | Detalhe da venda |
| `GET /obs/dlq` | Chunks no tópico chunks.failed |
| `GET /obs/health` | Saúde completa: conectividade ativa (Kafka/MinIO/PostgreSQL) + métricas agregadas + alertas de infra |

### Ações
| Endpoint | Descrição |
|----------|-----------|
| `POST /obs/batches/:id/reprocess` | Reprocessar batch falhado |
| `POST /obs/chunks/:id/reprocess` | Reprocessar chunk individual falhado |

---

## O que precisa ser implementado no backend

1. **Tabela `api_requests`** + middleware Fastify de logging assíncrono
2. **Instrumentação Prometheus** na API com `prom-client` (requisições, latência, payload size, batches criados)
3. **Instrumentação Prometheus** nos workers (workers ativos, chunks processados, tempo de processamento, Kafka lag, erros por tipo)
4. **Endpoints `/obs/*`** de leitura com paginação e filtros
5. **Endpoints de reprocessamento** (`POST /obs/batches/:id/reprocess`, `POST /obs/chunks/:id/reprocess`)
6. **`GET /obs/health`** com verificação ativa de conectividade dos serviços
7. **Índices adicionais** no banco para queries de observabilidade
8. (Opcional) WebSocket ou polling curto para atualização em tempo real

---

## Resumo do escopo

| Página | Dados já existem? | Backend novo necessário |
|--------|------------------|------------------------|
| Dashboard | Sim (parcial) | Queries agregadas + Prometheus |
| Request Log | **Não** | Tabela `api_requests` + middleware |
| Batches | Sim | `GET /obs/batches` + endpoint reprocess |
| Chunks | Sim | `GET /obs/chunks` + endpoint reprocess |
| Produtos | Sim | `GET /obs/products` |
| Farmácias | Sim | `GET /obs/pharmacies` |
| Vendas | Sim | `GET /obs/sales` |
| DLQ | Sim (parcial) | `GET /obs/dlq` + consumer do tópico chunks.failed |
| Alertas / Saúde | Sim (parcial) | `GET /obs/health` expandido |
| Grafana | **Não** | Instrumentação prom-client na API e workers |

---

## Lista de implementação (ordem correta)

### Fase 1 — Fundação de banco e logging

- [ ] Criar migração SQL para tabela `api_requests`
- [ ] Implementar middleware Fastify de request logging (gravação assíncrona, sem impactar latência)
- [ ] Criar migração com índices para queries de observabilidade
  - `api_requests(created_at, pharmacy_id, status_code)`
  - `batches(pharmacy_id, status, created_at)`
  - `batch_chunks(batch_id, status)`
  - `products(pharmacy_id, "isActive", "lastSeenAt")`

### Fase 2 — Instrumentação Prometheus

- [ ] Instalar `prom-client` e expor endpoint `GET /metrics` na API
- [ ] Adicionar métricas na API: contador de requisições por status, histograma de latência, gauge de tamanho de payload, contador de batches criados
- [ ] Adicionar métricas nos workers: gauge de workers ativos, contador de chunks processados, histograma de tempo de processamento, gauge de Kafka lag por consumer group, contador de erros por tipo

### Fase 3 — Endpoints de observabilidade (leitura)

- [ ] `GET /obs/health` — verificação ativa de conectividade (Kafka, MinIO, PostgreSQL) + métricas agregadas + alertas de infra (lag, conexões, storage)
- [ ] `GET /obs/requests` — paginado, filtros: farmácia, endpoint, status HTTP, load type, datas
- [ ] `GET /obs/batches` — paginado, filtros: farmácia, tipo full/delta, status, datas
- [ ] `GET /obs/batches/:id` — detalhe com lista de chunks filhos
- [ ] `GET /obs/chunks` — paginado, filtros: batch, farmácia, status, tentativas
- [ ] `GET /obs/dlq` — chunks do tópico `chunks.failed`, filtros: farmácia, error_code, datas
- [ ] `GET /obs/products` — paginado, filtros: farmácia, isActive, EAN, categoria, batch, datas, faixa de preço
- [ ] `GET /obs/products/:id` — detalhe com rawJson e histórico de batches
- [ ] `GET /obs/pharmacies` — lista com métricas agregadas (total produtos, último batch, volume 30d)
- [ ] `GET /obs/pharmacies/:cnpj` — detalhe consolidado: cadastro + batches + produtos + vendas
- [ ] `GET /obs/sales` — paginado, filtros: farmácia, status, datas, cliente
- [ ] `GET /obs/sales/:id` — detalhe com produtos, pagamentos, entrega e rawJson

### Fase 4 — Endpoints de ação (reprocessamento)

- [ ] `POST /obs/batches/:id/reprocess` — reenfileira batch falhado no Kafka (`batches.received`)
- [ ] `POST /obs/chunks/:id/reprocess` — reenfileira chunk falhado no Kafka (`chunks.ready`)

### Fase 5 — Frontend: setup e layout

- [ ] Inicializar projeto (Vite + React + TypeScript + Tailwind + shadcn/ui + TanStack Query + TanStack Table + Recharts)
- [ ] Implementar layout base: sidebar com navegação, header com breadcrumb, área de conteúdo
- [ ] Implementar componentes reutilizáveis: tabela paginada genérica, badge de status, drawer de detalhe, JSON viewer, filtros de data

### Fase 6 — Frontend: páginas (ordem por valor operacional)

- [ ] **Alertas / Saúde** — primeira a ir no ar; mostra conectividade dos serviços e alertas críticos de negócio + infra com polling de 30s
- [ ] **Dashboard** — cards de métricas, gráfico de volume batches/hora, gauges de Kafka lag e workers ativos, tabela de eventos críticos
- [ ] **Batches** — tabela com progresso em barra, badges full/delta/status, drawer de detalhe com botão de reprocessar
- [ ] **Chunks** — tabela com tentativas e error_context expandido, link para batch pai, botão de reprocessar
- [ ] **DLQ** — lista de chunks.failed, reprocessamento individual e em lote por farmácia, filtros por error_code
- [ ] **Request Log** — tabela paginada com todos os campos, link para batch gerado
- [ ] **Produtos** — tabela rica com thumbnail, filtros avançados, detalhe com rawJson e timeline de atualizações
- [ ] **Farmácias** — cards com métricas, gráfico de atividade 30d, detalhe consolidado
- [ ] **Vendas** — tabela com status badges, detalhe com produtos/pagamentos/entrega e rawJson

### Fase 7 — Integrações e polish

- [ ] Ativar polling automático no Dashboard e Alertas (intervalo configurável, padrão 30s)
- [ ] Criar dashboards Grafana: API (req/s, latência P50/P95/P99, taxa de erro), Workers (Kafka lag, throughput, chunks pendentes), Negócio (batches por status, produtos ingeridos)
- [ ] Adicionar links da UI custom → dashboards Grafana correspondentes
