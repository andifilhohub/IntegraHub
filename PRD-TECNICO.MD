PRD Técnico
Ingestão Massiva de Produtos – IntegraHub / InovaFarma
Status

Proposto → Implementação

Owner

Plataforma / Backend

Stack (fechada)

Runtime: Node.js 20+

API: Fastify

Streaming: Node Streams

Broker: Kafka

Storage: S3 ou MinIO

DB: PostgreSQL

Infra: Kubernetes

Observabilidade: Prometheus + Grafana + Logs estruturados

1. Problema

Precisamos receber cargas massivas de produtos (até dezenas de milhares por request), com milhares de CNPJs enviando simultaneamente, garantindo:

Zero perda de dados

Alta disponibilidade

Processamento assíncrono

Idempotência

Escalabilidade horizontal

Capacidade de replay

O modelo tradicional (API síncrona + JSON.parse + ORM) não atende.

2. Objetivos
Funcionais

Receber produtos via API com headers específicos

Suportar delta e full load

Processar grandes volumes sem timeouts

Garantir ingestão mesmo sob pico extremo

Permitir reprocessamento seguro

Não funcionais

Nenhum produto pode ser perdido

Endpoint não deve travar sob carga

Processamento deve ser desacoplado da ingestão

Sistema deve se recuperar de falhas automaticamente

3. Princípios Arquiteturais (não negociáveis)

Ingest ≠ Processamento

Persistência durável antes de qualquer ACK

Streaming, nunca materialização total em memória

Fila como amortecedor de carga

Bulk write no banco

Idempotência por lote e por item

Reprocessamento deve ser normal, não exceção

4. Arquitetura Geral
Cliente
  |
  v
[Fastify Ingest API]
  |
  |---> Object Storage (payload bruto gzip)
  |
  |---> PostgreSQL (metadados do batch)
  |
  |---> Kafka (BatchReceived)
                |
                v
         [Chunker Worker]
                |
                v
            Kafka (ChunkReady)
                |
                v
          [Upsert Worker]
                |
                v
           PostgreSQL (bulk)

5. Contrato da API de Ingestão
Endpoint

POST /v1/inovafarma/products

Headers obrigatórios

X-Inova-Api-Key

X-Inova-Load-Type: delta | full

Content-Type: application/json ou application/x-ndjson

Content-Encoding: gzip (fortemente recomendado)

Idempotency-Key

Regras

Payload não pode ser processado no endpoint

Payload deve ser gravado integralmente em storage

Endpoint responde 202 Accepted

Em caso de retry com mesmo Idempotency-Key, deve retornar o mesmo batch_id

Response
{
  "batch_id": "uuid",
  "status": "RECEIVED",
  "received_at": "ISO-8601"
}

6. Ingest API – Comportamento Técnico
Fluxo

Autenticar API Key

Validar headers

Criar batch_id

Stream do body → gzip → Object Storage

Calcular checksum (SHA-256) em streaming

Persistir metadados do batch no Postgres

Publicar evento BatchReceived no Kafka

Retornar 202

Proibições explícitas

❌ JSON.parse() em payload grande

❌ Processar produtos no endpoint

❌ Escrever produto direto no banco

❌ ORM item a item

7. Modelo de Dados
Tabela: batches
Campo	Tipo
batch_id	UUID (PK)
tenant_id	UUID
load_type	ENUM
idempotency_key	TEXT
payload_uri	TEXT
payload_checksum	TEXT
status	ENUM
received_at	TIMESTAMP
items_parsed	INT
items_processed	INT
items_failed	INT

Constraints

UNIQUE (tenant_id, idempotency_key)

Tabela: batch_chunks
Campo	Tipo
chunk_id	UUID
batch_id	UUID
chunk_uri	TEXT
status	ENUM
attempts	INT
Tabela: products

Chave natural

PRIMARY KEY (cnpj, shopid, productid)


Campos relevantes:

dados do produto

source_updated_at

last_batch_id

row_hash

8. Kafka
Tópicos

batches.received

chunks.ready

chunks.failed

Particionamento

Key: cnpj

Garante paralelismo + isolamento por tenant

9. Workers
9.1 Chunker Worker

Responsabilidade

Ler BatchReceived

Baixar payload do storage

Parse streaming

Gerar chunks (500–2000 itens)

Persistir chunk no storage

Publicar ChunkReady

Importante

Nunca carregar tudo em memória

Erros por item são registrados, não quebram o lote

9.2 Upsert Worker

Responsabilidade

Consumir ChunkReady

Baixar chunk

Escrever no banco em bulk

Pipeline obrigatório

COPY → staging_products

INSERT … SELECT … ON CONFLICT

Commit

Marcar chunk como DONE

Regra

1 chunk = 1 transação curta

10. Bulk Write (requisito crítico)
O que é aceito

COPY

Multi-row INSERT

MERGE/UPSERT set-based

O que é proibido

INSERT por item

.save() em loop

ORM automático para ingest

11. Idempotência
Por lote

tenant_id + idempotency_key

Por produto

cnpj + shopid + productid

Atualiza somente se source_updated_at for mais recente

Fallback por row_hash

12. Limites Operacionais
Request

Max payload: configurável (ex: 200MB)

Acima disso → upload via batch (futuro)

Worker

--max-old-space-size definido

1 core por processo

chunk size fixo

13. Observabilidade
Logs (estruturados)

batch_id

chunk_id

cnpj

Métricas

batches received / processed / failed

lag do Kafka

tempo médio por chunk

erro por tipo

14. Falhas e Recuperação

Worker caiu → Kafka reentrega

Chunk falhou → retry controlado

Após N falhas → DLQ

Batch pode ficar PARTIAL_FAIL, nunca “perdido”

15. Fora de Escopo (por agora)

UI de monitoramento

Webhooks de callback

Upload pré-assinado

Analytics avançado

16. Critérios de Sucesso

Sistema suporta pico simultâneo sem queda

Nenhum payload aceito é perdido

Banco não vira gargalo

Reprocessamento funciona sem duplicar dados

Operação previsível sob carga