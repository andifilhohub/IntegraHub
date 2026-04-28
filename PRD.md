# PRD — IntegraHub

## O que é

IntegraHub é um sistema de ingestão e sincronização de catálogos de produtos para redes de farmácias. Ele recebe grandes volumes de dados de inventário enviados por sistemas externos (como o InovaFarma), processa de forma assíncrona e mantém um catálogo centralizado e atualizado no banco de dados.

O sistema foi projetado para suportar milhares de farmácias enviando payloads simultâneos com dezenas de milhares de produtos cada — sem bloquear o recebimento, sem perder dados e sem processar nada inline na requisição HTTP.

---

## Problema que resolve

Sistemas de gestão de farmácias (ERPs, PDVs) precisam sincronizar seus catálogos de produtos com plataformas externas (e-commerce, marketplaces, sistemas de compliance). Esses sistemas:

- Enviam payloads grandes (até 200MB, 50k+ produtos por vez)
- Operam em horários concentrados (abertura e fechamento de loja)
- Têm picos de envio simultâneo de milhares de CNPJs
- Precisam de garantia de entrega — nenhum produto pode ser perdido silenciosamente
- Enviam dois tipos de carga: **carga completa** (inventário total) e **delta** (apenas mudanças recentes)

Um endpoint HTTP comum não consegue absorver esse volume sem travar, perder dados ou explodir em memória.

---

## Proposta de valor

> Receba qualquer volume de dados de qualquer número de farmácias, confirme o recebimento em milissegundos, e processe tudo de forma assíncrona, ordenada e rastreável — sem perder um único produto.

---

## Fluxo principal

```
Farmácia (ERP/PDV)
    │
    │  POST /v1/inovafarma/products
    │  Headers: X-Inova-Api-Key, X-Inova-Load-Type, Idempotency-Key
    │  Body: JSON array de produtos (até 200MB)
    ▼
┌─────────────────────────────────────┐
│           Ingest API (Fastify)       │
│  1. Valida autenticação e cabeçalhos │
│  2. Stream do payload → MinIO/S3     │
│  3. Registra batch no PostgreSQL     │
│  4. Publica evento no Kafka          │
│  5. Retorna 202 Accepted             │
└──────────────────┬──────────────────┘
                   │ Kafka: batches.received
                   ▼
┌─────────────────────────────────────┐
│           Chunker Worker             │
│  1. Baixa payload do MinIO           │
│  2. Divide em chunks de ~1000 items  │
│  3. Faz upload de cada chunk         │
│  4. Publica evento para cada chunk   │
└──────────────────┬──────────────────┘
                   │ Kafka: chunks.ready
                   ▼
┌─────────────────────────────────────┐
│         Upsert Workers (N)           │
│  1. Baixa chunk do MinIO             │
│  2. Bulk upsert no PostgreSQL        │
│  3. Aplica lógica FULL vs DELTA      │
│  4. Atualiza progresso do batch      │
└─────────────────────────────────────┘
```

---

## Tipos de carga

### FULL (carga completa)
- O payload contém **todo o inventário** da farmácia
- Produtos presentes no banco mas **ausentes no payload** são marcados como `isActive = false` (soft delete)
- Produtos novos são inseridos
- Produtos existentes têm seus campos atualizados se houver diferença

### DELTA (carga incremental)
- O payload contém **apenas mudanças recentes** (últimos minutos)
- Apenas os campos que mudam com frequência são atualizados: `PRICE`, `PRICEPROMO`, `QUANTITY`, `WHOLESALEPRICE`, `WHOLESALEMIN`
- Produtos **não presentes no payload não são alterados**
- Sem soft delete — ausência no delta não significa remoção

---

## Entidades principais

### Pharmacy
Representa uma farmácia/tenant identificada pelo CNPJ.

| Campo | Tipo | Descrição |
|---|---|---|
| id | integer PK | Identificador interno |
| cnpj | text | CNPJ da farmácia |
| name | text | Nome da farmácia |
| state | text | Estado |
| city | text | Cidade |
| rawJson | jsonb | Payload completo original |

### Product
Catálogo de produtos por farmácia.

| Campo | Tipo | Descrição |
|---|---|---|
| id | integer PK | Identificador interno |
| pharmacyId | integer FK | Farmácia proprietária |
| productId | integer | ID do produto no sistema de origem |
| title | text | Nome do produto |
| ean | text | Código de barras EAN |
| price | double | Preço atual |
| pricePromo | jsonb | Array de promoções de preço |
| stock | integer | Estoque disponível |
| brand | text | Marca |
| ncm | text | Código NCM fiscal |
| category | text | Categoria |
| imageLink | text | URL da imagem |
| isActive | boolean | Flag de soft delete |
| lastBatchId | text | Último batch que atualizou este produto |
| lastSeenAt | timestamp | Última vez que o produto apareceu em um batch |
| rawJson | jsonb | Payload completo original |

**Chave natural**: `(pharmacyId, productId)` — identifica unicamente um produto por farmácia.

### Batch
Representa um envio recebido de uma farmácia.

| Campo | Tipo | Descrição |
|---|---|---|
| batch_id | UUID PK | Identificador do batch |
| pharmacy_id | integer FK | Farmácia remetente |
| load_type | enum | `delta` ou `full` |
| idempotency_key | text | Chave de idempotência |
| payload_uri | text | Caminho no MinIO/S3 |
| status | enum | `RECEIVED` → `PROCESSING` → `COMPLETED` / `PARTIAL_FAIL` / `FAILED` |
| items_total | integer | Total de produtos no payload |
| items_processed | integer | Produtos processados com sucesso |
| items_failed | integer | Produtos com falha |
| error_code | text | Código do erro (se falhou) |
| error_message | text | Mensagem do erro |

**Unicidade**: `(pharmacy_id, idempotency_key)` — garante idempotência por farmácia.

### BatchChunk
Subdivide um batch em unidades de processamento independentes.

| Campo | Tipo | Descrição |
|---|---|---|
| chunk_id | UUID PK | Identificador do chunk |
| batch_id | UUID FK | Batch pai |
| chunk_index | integer | Posição do chunk dentro do batch |
| chunk_uri | text | Caminho do chunk no MinIO/S3 |
| status | enum | `PENDING` → `PROCESSING` → `COMPLETED` / `FAILED` |
| attempts | integer | Número de tentativas de processamento |
| items_count | integer | Produtos neste chunk |

---

## Stack técnica

| Camada | Tecnologia |
|---|---|
| API | Fastify (Node.js 20+) |
| Message Broker | Apache Kafka |
| Object Storage | MinIO / AWS S3 |
| Banco de dados | PostgreSQL |
| Observabilidade | Prometheus + Grafana + logs estruturados |

---

## Garantias do sistema

- **Zero perda de dados**: payload persiste no object storage antes de qualquer resposta
- **Idempotência**: reenvio do mesmo batch com a mesma `Idempotency-Key` não duplica dados
- **Rastreabilidade**: todo batch tem status auditável do recebimento até a conclusão
- **Tolerância a falhas**: chunks com falha são reprocessados automaticamente até `MAX_RETRIES`; após isso, vão para Dead Letter Queue
- **Isolamento por farmácia**: particionamento Kafka por CNPJ impede que uma farmácia impacte o processamento de outra

---

## Autenticação

Toda requisição deve incluir o header `X-Inova-Api-Key` com uma chave válida configurada em `VALID_API_KEYS`. Sem autenticação, a requisição é rejeitada com `401 Unauthorized`.

---

## Endpoints

### `POST /v1/inovafarma/products`
Recebe um batch de produtos.

**Headers obrigatórios:**
- `X-Inova-Api-Key`: chave de autenticação
- `X-Inova-Load-Type`: `delta` ou `full`
- `Idempotency-Key`: chave única para prevenir duplicação (gerada automaticamente se ausente)

**Body:** array JSON de produtos (até 200MB)

**Resposta 202 Accepted:**
```json
{
  "batch_id": "uuid",
  "status": "RECEIVED",
  "received_at": "2025-12-23T10:00:00Z"
}
```

### `GET /health`
Verifica se a API está no ar.

### `GET /products`
Consulta produtos do catálogo.

---

## Fora de escopo (fase atual)

- Interface de monitoramento web
- Webhooks de callback ao término do processamento
- Upload via pre-signed URLs
- Analytics sobre o catálogo
- Multi-tenancy além do CNPJ
- API pública de leitura do catálogo

---

## Roadmap de escala

O sistema foi projetado para crescer horizontalmente. Ver [SCALABILITY_TODO.md](SCALABILITY_TODO.md) para a lista completa de melhorias necessárias para suportar 10k farmácias simultâneas.

| Fase | Capacidade estimada |
|---|---|
| Hoje | ~100–200 farmácias simultâneas |
| Após fixes de DB e config | ~500–1.000 |
| Após refactor de streaming | ~3.000–5.000 |
| Após todos os fixes | **10.000+** |
