Abaixo está um PRD técnico/operacional, totalmente direto, corporativo e orientado para execução.
Esse documento serve como instrução oficial para o Codex/Cursor saber exatamente o que implementar, o que criar, como estruturar, como configurar e qual o resultado final esperado.

Este PRD define:

arquitetura

módulos obrigatórios

endpoints

workers

banco

autenticação

responsabilidades

requisitos de produção

Use esse texto como single source of truth para guiar o Codex na construção completa do sistema.

PRD – IntegraHub (Hub de Integração InovaFarma → Ecosistema GeniusCloud/Chatwoot)
1. Objetivo

Implementar uma API corporativa robusta que:

Recebe cargas de produtos/estoque enviadas pelo ERP InovaFarma.

Valida todas as requisições via API key simples (segredo compartilhado).

Processa lotes de produtos usando filas assíncronas (BullMQ + Redis).

Armazena produtos, estoques e farmácias em um banco separado (PostgreSQL).

Exponibiliza endpoints de consulta para integrações (Chatwoot, automações, flows, etc.).

Opera como camada isolada, independente e escalável.

O Chatwoot nunca persiste dados de ERP; ele somente consome da API IntegraHub.

2. Tecnologias obrigatórias
Backend

NestJS (com Express ou Fastify padrão)

Node 18+

TypeScript

Segurança

API key via header

Banco

PostgreSQL

ORM: Prisma

Processamento assíncrono

BullMQ

Redis

Logging

nestjs-pino

pino@9

Documentação

Swagger (/docs)

3. Arquitetura do projeto

Estrutura obrigatória:

src/
  app.module.ts

  prisma/
    prisma.module.ts
    prisma.service.ts

  modules/
    auth/
      hmac.guard.ts
      auth.module.ts

    inovafarma/
      inovafarma.controller.ts
      inovafarma.service.ts
      inovafarma.module.ts

    products/
      products.controller.ts
      products.service.ts
      products.module.ts

    pharmacies/
      pharmacies.module.ts
      pharmacies.service.ts

  jobs/
    process-products/
      worker.ts

  common/
    dto/
    utils/

main.ts
.env

4. Fluxo principal do sistema
4.1. Ingestão (Entrada – InovaFarma → IntegraHub)

InovaFarma envia POST para /inovafarma/products.

Requisição é autenticada com API key e verificada pelo ApiKeyGuard.

Payload (array de produtos) é aceito.

Cada requisição é adicionada à fila "products" via BullMQ.

Worker processa o payload:

normaliza CNPJ

identifica/insere farmácia (tabela Pharmacy)

insere/atualiza produto (Product)

guarda JSON bruto no campo rawJson

Log de processamento via pino.

5. Banco de Dados (Prisma)
Modelo obrigatório:
model Pharmacy {
  id        Int       @id @default(autoincrement())
  cnpj      String    @unique
  name      String?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  products  Product[]
}

model Product {
  id         Int       @id @default(autoincrement())
  pharmacy   Pharmacy  @relation(fields: [pharmacyId], references: [id])
  pharmacyId Int

  productId  Int
  title      String
  description String?
  ean        String?
  price      Float?
  stock      Int?
  brand      String?
  ncm        String?
  category   String?
  imageLink  String?

  rawJson    Json

  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  @@unique([pharmacyId, productId], name: "pharmacy_product_unique")
}

6. Regras de Segurança (API key)
Header obrigatório:
X-Inova-Api-Key (ou X-Api-Key): deve ser idêntico a INOVA_API_KEY.

Validação:

comparar valor do header com a variável de ambiente
retornar 401 se ausente ou divergente

7. Endpoints obrigatórios
7.1. Ingestão de produtos
POST /inovafarma/products
Headers:
  X-Inova-Api-Key (ou X-Api-Key)

Body: [ {...}, {...}, ... ]


Resposta:

{
  "status": "queued",
  "count": 532
}

7.2. Consulta de produtos (para Chatwoot / automações)
GET /products?cnpj=02433981000196&q=DIPIRONA


Retorno:

[
  {
    "productId": 401,
    "title": "PARACETAMOL MEL E LIMAO 1ENV 5G",
    "price": 10,
    "stock": 10,
    "brand": "GRUPO EMS SIGMA PHARMA",
    ...
  }
]

8. Requisitos de produção

A API deve rodar atrás de reverse-proxy (Nginx).

Banco e Redis devem ser serviços separados (Docker).

Worker BullMQ deve rodar como processo separado:

npm run worker:prod

Todas as variáveis sensíveis vêm de .env.

Logs devem estar em JSON (pino).

Documentação Swagger deve ficar disponível em /docs.

O Chatwoot não persiste estoque — somente consulta esta API.

9. Docker e serviços obrigatórios
docker-compose.yml (API + Postgres + Redis):

Serviços esperados:

postgres:
redis:
api:
worker:


API expõe porta 3000.

10. Qualidade e estabilidade

Sem Express puro; usar NestJS.

Sem RabbitMQ; usar BullMQ.

Banco separado (não usar database do Chatwoot).

Versionamento de API futuro: /v1/...

Testes mínimos para API key e ingestão.

11. Resultado final esperado

Quando o Codex terminar:

✔️ InovaFarma envia cargas para IntegraHub
✔️ IntegraHub valida, processa, persiste
✔️ Dados ficam centralizados
✔️ Chatwoot consome via GET /products
✔️ Nada interfere no Chatwoot
✔️ Sistema escalável, modulado e preparado para produção
