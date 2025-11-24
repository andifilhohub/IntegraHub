# IntegraHub API operacional

Este documento centraliza tudo o que você precisa saber para operar a API IntegraHub: autenticação, ingestão de lotes, consumidor via BullMQ, configuração e testes. Use-o como single source of truth antes de integrar o ERP InovaFarma ou o ecossistema GeniusCloud/Chatwoot.

---

## 1. Visão geral

- **Objetivo**: receber cargas assinadas do ERP InovaFarma, validar via HMAC, enfileirar e persistir farmácias/produtos no PostgreSQL, expor dados para Chatwoot/automações e manter o sistema desacoplado.
- **Tecnologias principais**: NestJS + TypeScript, Prisma + PostgreSQL, BullMQ + Redis, `nestjs-pino`/`pino` para logging JSON e Swagger para documentação em `/v1/docs`.
- **Arquitetura mínima**:
  - API (Express/Fastify via Nest) com `AuthModule`, `InovafarmaModule`, `ProductsModule`, `PharmaciesModule`.
  - Jobs: `ProcessProductsModule` (BullMQ queue) + worker em `src/jobs/process-products/worker.ts`.
  - Prisma global (`src/prisma/prisma.module.ts`, `src/prisma/prisma.service.ts`) conectando ao `DATABASE_URL`.

---

## 2. Segurança e autenticação

### 2.1 Cabeçalhos obrigatórios
Todas as requisições POST na rota `POST /v1/inovafarma/products` **devem** conter:

- `X-Inova-Timestamp`: epoch em milissegundos.
- `X-Inova-Signature`: `sha256=<hex>` calculado com `HMAC_SHA256(INOVA_SECRET, timestamp + rawBody)`.

### 2.2 Validação

- Guard (`HmacGuard`) compara o timestamp com `HMAC_TIME_WINDOW_MS` (padrão 300.000 ms) e rejeita replay attacks.
- `crypto.timingSafeEqual` impede timing attacks.  
- Se o segredo não estiver em `.env`, o guard devolve 500 e o log nativo registra a falha.

---

## 3. Endpoints principais

### 3.1 POST /v1/inovafarma/products

- **Fluxo**: valida HMAC → garante que todos os produtos pertençam à mesma farmácia → enfileira no BullMQ → responde rápido com `queued`.
- **Headers**:
  - `X-Inova-Load-Type`: `full` ou `delta` (default `delta`). Quando `full`, o worker marca os produtos que não aparecem nesse lote como inativos para manter a base sincronizada.
- **Payload**: array de `IngestProductDto` (veja `src/modules/inovafarma/dto/ingest-product.dto.ts`) contendo:
  - `productId`, `title`, `price?`, `stock?`, `brand?`, `ncm?`, `category?`, `imageLink?`, `rawJson` (object com a carga original).
  - `pharmacy`: `cnpj`, `name`, `state?`, `city?`.
- **Resposta**:
  ```json
  {
    "status": "queued",
    "count": 532
  }
  ```

### 3.2 GET /v1/products

- **Query**: `cnpj` (obrigatório), `q` (termo de busca opcional), `limit` (máx 200, padrão 40) e `page` (padrão 1).
- Retorna `{ items, pagination: { page, limit, count } }`, onde `items` traz os campos Prisma (`productId`, `title`, `price`, `stock`, `brand`, `category`, `rawJson` etc.).
- Cada combinação de query é armazenada em cache por `PRODUCTS_CACHE_TTL_MS` (default 20000ms) e o total de chaves respeita `PRODUCTS_CACHE_MAX_ENTRIES` para conter o uso de memória.
- Os resultados são ordenados por `updatedAt desc` e suportam filtros por título, marca ou descrição de forma insensível.

---

## 4. Worker e filas

### 4.1 Queue `process-products`

- Implementado em `src/jobs/process-products/process-products.queue.ts`.
- Usa `Queue.add()` com `attempts: 3`, `backoff exponential` e `removeOnComplete`.
- Requer `REDIS_URL`; lança erro claro quando vazio.
- Redis options definem `maxRetriesPerRequest: null` para cumprir os requisitos do BullMQ/Redis.

### 4.2 Worker

- Local: `src/jobs/process-products/worker.ts`.
- Instancia `Worker<ProcessProductsJobPayload>` com conexão Redis.
- Para cada job:
  1. Upserta a farmácia (`prisma.pharmacy.upsert`) gravando `rawJson` como `Prisma.InputJsonValue`.
  2. Percorre produtos e faz `prisma.product.upsert` usando `pharmacy_product_unique`.
  3. Usa `pino` para log JSON e trata `error`/`failed`.
- Sinais `SIGINT`/`SIGTERM` fecham worker/Prisma.
- Quando `loadType` é `full`, o worker compara os `productId` recebidos com os já persistidos e executa um `updateMany` para marcar `isActive = false` e registrar `deletedAt` nos produtos ausentes.

---

## 5. Banco de dados

### 5.1 Schema Prisma (`prisma/schema.prisma`)

- `Pharmacy`: `cnpj` único, `rawJson`, timestamps.
- `Product`: relação `pharmacyId`, `@@unique([pharmacyId, productId])`, `rawJson`, campos (title, price, stock etc.) e campos de status (`isActive`, `deletedAt`, `lastSeenAt`) usados para sincronizações completas.
- Cliente gerado com `npx prisma generate` (recomenda-se rodar após alterar `.env` ou o schema).

### 5.2 Configuração

- `.env.example` define `DATABASE_URL`, `REDIS_URL`, `INOVA_SECRET`, `HMAC_TIME_WINDOW_MS`, `LOG_LEVEL`.
- Prisma carrega `.env` via `prisma.config.ts` (use `set -a && source .env && set +a` antes de rodar).

---

## 6. Operação & testes

### 6.1 Ambiente local

```bash
npm install
cp .env.example .env          # preencha URLs reais
set -a && source .env && set +a
npx prisma generate
npm run start:dev
npm run worker:dev            # em outro terminal
```

- Swagger: `http://localhost:3000/v1/docs`.
- Worker logs também JSON e consome Redis/DB.

### 6.2 Produção

```bash
npm run build
npm run start:prod
npm run worker:prod
```

Use o Dockerfile multi-stage e `docker compose up --build` para levantar API, worker, PostgreSQL e Redis (`docker-compose.yml`).

### 6.3 Testes

- `npm run test` (unitários com Jest, rodar `--runInBand` se houver crash de worker).
- `npm run test:e2e`, `npm run test:cov`.
-
### 6.4 Health-checks

- O módulo `PrismaService` faz `$connect` na inicialização; se o PostgreSQL estiver inacessível, a API falha cedo com `PrismaClientInitializationError`.
- O Redis também precisa estar disponível no `REDIS_URL` ou o worker não sobe.

---

## 7. Observações finais

1. **Chatwoot** nunca persiste dados ERP; ele só consome `GET /v1/products`.
2. **Logs**: `nestjs-pino` retorna JSON estruturado para observabilidade.
3. **Escalabilidade**: API e worker rodam separados (ver `worker:prod` e `docker-compose`), filas BullMQ permitem reprocessar com backoff.
4. **Segurança**: o segredo `INOVA_SECRET` deve ser protegido em produção.
5. **Sincronização completa**: cargas marcadas com `X-Inova-Load-Type: full` desativam produtos ausentes (`isActive = false`, `deletedAt` preenchido) sem remover o histórico, o que garante que o catálogo reflita o ERP após a carga semanal.

Use este arquivo para treinar novos operadores, documentar integrações e revisar políticas de segurança. Se quiser exportar para outro formato (PDF, HTML), posso gerar em Markdown estruturado para você. Deseja exportar? 
