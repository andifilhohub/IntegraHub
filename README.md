# IntegraHub

IntegraHub é a API corporativa responsável por receber cargas validadas do ERP InovaFarma, processá-las em lote via filas BullMQ/Redis, persistir farmácias e produtos no PostgreSQL (via Prisma) e expor consulta segura ao ecossistema GeniusCloud/Chatwoot.

## Visão geral da arquitetura

- **NestJS + TypeScript** como framework principal, com logging estruturado em JSON por `nestjs-pino`/`pino`.
- **HMAC SHA256** (`X-Inova-Timestamp` + `X-Inova-Signature`) para validar que apenas o ERP envia cargas válidas.
- **BullMQ + Redis** para enfileirar e processar lotes pesados de produtos em workers isolados (`npm run worker:prod`).
- **Prisma + PostgreSQL** para persistência transacional de farmácias e produtos, com `@@unique([pharmacyId, productId])` e histórico de `rawJson` para auditoria.
- **Swagger** em `/v1/docs` para documentação consumível por times externos.

## Fluxo de ingestão

1. O ERP chama **POST /v1/inovafarma/products** com um array de produtos assinados.
2. O `HmacGuard` valida headers `X-Inova-Timestamp` e `X-Inova-Signature`, rejeitando replay attacks com janela configurável.
3. A API enfileira os produtos no BullMQ (`process-products`), respondendo rápido com `{ "status": "queued", "count": 123 }`.
4. O worker (`npm run worker:prod`) processa o lote, faz `upsert` de farmácias e produtos no banco e mantém logs estruturados.
5. Sistemas como Chatwoot consultam **GET /v1/products?cnpj=...&q=...** para exibir estoque atualizado.

## Endpoints principais

### POST /v1/inovafarma/products
- **Headers obrigatórios:** `X-Inova-Timestamp`, `X-Inova-Signature`
- **Corpo:** array de produtos com `pharmacy` embutido (CNPJ/nome) e campos como `productId`, `title`, `price`, `stock`, `rawJson` etc.
- **Resposta:**
  ```json
  {
    "status": "queued",
    "count": 532
  }
  ```

### GET /v1/products?cnpj=<cnpj>&q=<termo opcional>
- Busca produtos para uma farmácia específica.
- Filtra por título/marca/descrição (insensível a maiúsculas) quando `q` é informado.
- Retorna modelo Prisma (`productId`, `title`, `price`, `stock`, `brand`, ...).

## Configuração e execução

```bash
# Instale dependências locais
npm install

# Copie e ajuste o template
cp .env.example .env

# Em ambiente de desenvolvimento
npm run start:dev       # servidor HTTP
npm run worker:dev      # worker em ts-node

# Em produção (build + servidores separados)
npm run build
npm run start:prod      # API
npm run worker:prod     # worker BullMQ
```

## Docker & orquestração

O `docker-compose.yml` já reúne PostgreSQL, Redis, API e worker:

```bash
docker compose up --build
```

Os serviços expõem:
- PostgreSQL: `5432`
- Redis: `6379`
- API: `3000`

A API carrega variáveis do `.env` (ex.: `DATABASE_URL`, `REDIS_URL`, `INOVA_SECRET`).

## Paginação e cache de leitura

- `GET /v1/products` agora suporta `limit` (máximo 200, padrão 40) e `page` (padrão 1) para entregar páginas delimitadas. A resposta ficou no formato `{ items, pagination: { page, limit, count } }`.
- A mesma combinação de query é mantida em cache por `PRODUCTS_CACHE_TTL_MS` (default 20000ms) e o número de chaves nunca excede `PRODUCTS_CACHE_MAX_ENTRIES` (default 400), diminuindo a pressão sobre o PostgreSQL durante exposição concorrente.

## Documentação

Após iniciar a API, a documentação Swagger fica disponível em `http://localhost:3000/v1/docs`.

## Testes

- `npm run test` roda os unitários (HmacGuard etc.).
- `npm run test:e2e` roda o pacote E2E padrão.
- `npm run test:cov` gera cobertura.
- `node scripts/api-endpoints-test.js` executa um fluxo rápido de POST/GET simples e testes “pesados” (múltiplos requests) contra os endpoints principais. Antes de rodar, carregue as variáveis (`set -a && source .env && set +a`) para garantir `INOVA_SECRET`, `DATABASE_URL` e `API_URL` (opcional) estejam disponíveis.
- O script aceita variáveis extra (`HEAVY_GET_LIMIT`, `PRODUCTS_CACHE_TTL_MS`, `PRODUCTS_CACHE_MAX_ENTRIES`) para ajustar quanto o cache/paginação retorna; o valor padrão de `HEAVY_GET_LIMIT` é 100.
- `bash scripts/monitor-load.sh` exibe CPU, Node, PostgreSQL e Redis durante testes intensos (usa `DATABASE_URL`/`REDIS_URL` do `.env`). Rode em paralelo com os scripts de carga (ou o stress-test) para identificar gargalos de infraestrutura.
- `bash scripts/run-full-test.sh` carrega o `.env`, sobe o monitor de recursos e dispara o `api-endpoints-test.js` automaticamente. Ele encerra o monitor quando o teste termina, então basta executar um comando para gerar carga e observar a infraestrutura simultaneamente.
- `bash scripts/auto-increase-stress.sh` repete `api-endpoints-test.js` com concorrência crescente até algum lote falhar; use-o para detectar o limite do ambiente e registrar o ponto em que a API começa a degradar.

## Próximos passos possíveis

1. Adicionar métricas (Prometheus + Grafana).
2. Criar jobs de reconcialiação de estoque/crons via BullMQ/retry.
3. Implementar versionamento real em sub-rotas (`/v2`).
