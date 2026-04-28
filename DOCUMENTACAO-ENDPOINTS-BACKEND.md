# Documentacao tecnica dos endpoints do backend

Este documento lista somente as rotas expostas pelo backend em `src/index.js`. Endpoints de frontend nao foram incluidos.

## Resumo rapido

| Metodo | Rota | Auth | Resposta principal |
| --- | --- | --- | --- |
| GET | `/health` | Nao | Status do servico |
| POST | `/v1/inovafarma/products` | Sim | Cria um batch de produtos |
| GET | `/v1/products` | Sim | Lista produtos em formato compatível com Chatwoot |
| POST | `/v1/sales` | Sim | Cria um registro de venda |
| GET | `/api/v1/inovafarma/sales/:cnpj/pending` | Sim | Lista vendas pendentes |
| GET | `/api/v1/inovafarma/sales/:cnpj/consumed` | Sim | Lista vendas consumidas |
| GET | `/api/v1/inovafarma/sales/:cnpj/:id` | Sim | Retorna a venda original |
| POST | `/api/v1/inovafarma/sales/:cnpj/:id/consume` | Sim | Marca uma venda como consumida ou falha |
| POST | `/admin/pharmacies/:cnpj/api-key` | Admin | Gera ou redefine API key da farmacia |
| POST | `/admin/pharmacies/api-key` | Admin | Gera ou redefine API key da farmacia |

## Autenticacao

### Rotas de API normal

Os endpoints abaixo aceitam uma destas formas de autenticacao:

- `Authorization: Bearer <token>`
- `X-Api-Key: <token>`
- `X-Inova-Api-Key: <token>`

Se o token existir no banco, o backend identifica a farmacia vinculada. Se nao existir, ainda pode aceitar chaves legadas definidas em `VALID_API_KEYS`.

### Rotas administrativas

O endpoint administrativo aceita:

- `Authorization: Bearer <ADMIN_API_KEY>`
- `X-Admin-Api-Key: <ADMIN_API_KEY>`

## Endpoint: GET /health

### Finalidade

Verifica se o servico esta no ar.

### Entrada

Nao exige body, query params nem headers especiais.

### Saida

```json
{
  "status": "ok",
  "timestamp": "2026-04-27T12:34:56.789Z"
}
```

### Tipos de dados

- `status`: string fixa
- `timestamp`: string ISO 8601

### Erros

Nao ha tratamento de erro especifico no handler. Em geral, responde 200 enquanto o processo estiver funcional.

## Endpoint: POST /v1/inovafarma/products

### Finalidade

Recebe um lote de produtos, valida o CNPJ, gera batch idempotente, salva o payload em storage, cria o batch no banco e publica o evento para processamento assíncrono.

### Entrada

Headers obrigatorios:

- `X-Inova-Load-Type`: `delta` ou `full`

Headers de autenticacao:

- `Authorization: Bearer <token>` ou `X-Api-Key: <token>` ou `X-Inova-Api-Key: <token>`

Headers opcionais:

- `Idempotency-Key`: string arbitraria do cliente. Se ausente, o backend gera uma chave automaticamente.

Body:

- JSON array nao vazio de objetos de produto
- O primeiro item precisa conter `CNPJ`

### Exemplo de entrada

```json
[
  {
    "CNPJ": "05927228000145",
    "PRODUCTID": "25901",
    "TITLE": "Buscopan Composto Cx 20Cpr"
  }
]
```

### Saida de sucesso

Resposta 202 para novo batch:

```json
{
  "batch_id": "7f5f7d5e-2ef7-4fb0-8e2a-1b9f0f4cb7a1",
  "status": "RECEIVED",
  "received_at": "2026-04-27T12:34:56.789Z"
}
```

Resposta 202 para batch repetido por idempotencia:

```json
{
  "batch_id": "7f5f7d5e-2ef7-4fb0-8e2a-1b9f0f4cb7a1",
  "status": "RECEIVED",
  "received_at": "2026-04-27T12:34:56.789Z",
  "message": "Batch already received (idempotent)"
}
```

### Tipos de dados

- Entrada: `Array<object>`
- `X-Inova-Load-Type`: string enum (`delta` | `full`)
- `Idempotency-Key`: string
- Saida: objeto com `batch_id` string, `status` string, `received_at` string ISO, `message` opcional

### Regras de negocio

- Usa o CNPJ do primeiro produto para identificar a farmacia
- Rejeita payload vazio ou nao-array
- Rejeita payload sem CNPJ
- Rejeita se a chave de API nao pertencer ao CNPJ do payload
- Faz upload do JSON completo para storage
- Cria batch no banco
- Publica evento em Kafka para processamento posterior

### Erros

- `401 Unauthorized`: API key ausente ou invalida
- `400 Bad Request`: falta `X-Inova-Load-Type`, load type invalido, payload vazio ou CNPJ ausente
- `403 Forbidden`: API key nao pertence ao CNPJ do payload
- `500 Internal Server Error`: falha durante validacao, storage, banco ou publicacao Kafka

## Endpoint: GET /v1/products

### Finalidade

Lista produtos ativos de uma farmacia, com filtros de busca e paginação, retornando um formato voltado a Chatwoot.

### Entrada

Headers de autenticacao:

- `Authorization: Bearer <token>` ou `X-Api-Key: <token>` ou `X-Inova-Api-Key: <token>`

Query params:

- `cnpj`: string, obrigatorio se a chave nao estiver amarrada a uma farmacia
- `page`: number, default `1`
- `limit`: number, default `40`, maximo `100`
- `q`: string, busca por titulo ou descricao
- `ean`: string, filtro por EAN
- `category`: string, filtro por categoria

### Saida de sucesso

```json
{
  "items": [
    {
      "id": 25901,
      "productId": 25901,
      "product_id": 25901,
      "title": "Buscopan Composto Cx 20Cpr",
      "name": "Buscopan Composto Cx 20Cpr",
      "sku": "7896094921399",
      "price": 27.04,
      "pricePromo": 25.5,
      "pricePromos": [],
      "stock": 4,
      "quantity": 4,
      "brand": "Boehringer",
      "category": "ETICOS",
      "description": "Buscopan Composto Cx 20Cpr",
      "image": "",
      "imageLink": "",
      "cnpj": "05927228000145",
      "rawJson": {}
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 40,
    "count": 1,
    "total_pages": 1
  }
}
```

### Tipos de dados

- `items`: array de objetos
- `pagination.page`: number
- `pagination.limit`: number
- `pagination.count`: number
- `pagination.total_pages`: number
- Campos do item: mistura de `number`, `string`, `array` e `object`

### Regras de negocio

- Retorna apenas produtos ativos
- Filtra pela farmacia resolvida via auth ou via `cnpj` na query
- Se a chave estiver vinculada a uma farmacia e o `cnpj` da query for diferente, retorna 403
- O retorno inclui aliases de campo para compatibilidade com o consumidor Chatwoot

### Erros

- `401 Unauthorized`: API key ausente ou invalida
- `400 Bad Request`: `cnpj` ausente quando necessario
- `403 Forbidden`: `cnpj` da query nao bate com a farmacia da chave
- `500 Internal Server Error`: falha ao consultar o banco

## Endpoint: POST /v1/sales

### Finalidade

Recebe uma venda, valida os campos obrigatorios, aplica idempotencia, armazena o payload e publica o evento para processamento assíncrono.

### Entrada

Headers de autenticacao:

- `Authorization: Bearer <token>` ou `X-Api-Key: <token>` ou `X-Inova-Api-Key: <token>`

Headers opcionais:

- `Idempotency-Key`: string

Body: objeto JSON com, no minimo:

- `cnpjEmpresa`: string
- `codigoVendaOnLine`: string
- `dataVenda`: string de data valida

Campos opcionais usados pelo handler:

- `nomeCliente`: string
- `tipoDeEcommerce`: string
- `entrega`: object
- `produtos`: array
- `pagamentos`: array

### Exemplo de entrada

```json
{
  "cnpjEmpresa": "05927228000145",
  "codigoVendaOnLine": "V12345",
  "dataVenda": "2026-04-27T12:34:56.789Z",
  "nomeCliente": "Maria Silva",
  "tipoDeEcommerce": "marketplace",
  "entrega": {},
  "produtos": [],
  "pagamentos": []
}
```

### Saida de sucesso

Nova venda recebida:

```json
{
  "sale_id": "2a8c1a3a-0d2c-4f7f-b8c8-2b0df2d8e9fa",
  "status": "RECEIVED",
  "received_at": "2026-04-27T12:34:56.789Z"
}
```

Venda repetida por idempotencia:

```json
{
  "sale_id": "2a8c1a3a-0d2c-4f7f-b8c8-2b0df2d8e9fa",
  "status": "RECEIVED",
  "received_at": "2026-04-27T12:34:56.789Z",
  "message": "Sale already received (idempotent)"
}
```

### Tipos de dados

- Entrada: `object`
- `cnpjEmpresa`: string
- `codigoVendaOnLine`: string
- `dataVenda`: string de data
- `entrega`: object
- `produtos`: array
- `pagamentos`: array
- Saida: objeto com `sale_id` string, `status` string, `received_at` string ISO, `message` opcional

### Regras de negocio

- Rejeita body que nao seja objeto JSON
- Rejeita se `cnpjEmpresa`, `codigoVendaOnLine` ou `dataVenda` estiverem ausentes
- Rejeita se a chave de API nao pertencer ao CNPJ do payload
- Rejeita `dataVenda` invalida
- Gera idempotency key automaticamente quando nao enviada
- Cria farmacia automaticamente se ainda nao existir
- Salva payload completo em object storage e cria registro da venda no banco
- Publica evento para processamento posterior

### Erros

- `401 Unauthorized`: API key ausente ou invalida
- `400 Bad Request`: body invalido, campos obrigatorios ausentes ou data invalida
- `403 Forbidden`: API key nao pertence ao CNPJ do payload
- `500 Internal Server Error`: falha de storage, banco ou publicacao Kafka

## Endpoint: GET /api/v1/inovafarma/sales/:cnpj/pending

### Finalidade

Lista as vendas pendentes de uma farmacia.

### Entrada

Headers de autenticacao:

- `Authorization: Bearer <token>` ou `X-Api-Key: <token>` ou `X-Inova-Api-Key: <token>`

Path params:

- `cnpj`: string

Query params:

- `limit`: number, default `100`, maximo `500`

### Saida de sucesso

```json
{
  "sales": [
    {
      "id": "2a8c1a3a-0d2c-4f7f-b8c8-2b0df2d8e9fa",
      "created_at": "2026-04-27T12:34:56.789Z"
    }
  ]
}
```

### Tipos de dados

- `sales`: array de objetos
- `sales[].id`: string
- `sales[].created_at`: string ISO

### Regras de negocio

- Exige autenticacao valida
- Bloqueia acesso se a chave pertencer a outra farmacia
- Retorna apenas vendas em estado pendente

### Erros

- `401 Unauthorized`: API key ausente ou invalida
- `400 Bad Request`: `cnpj` ausente
- `403 Forbidden`: `cnpj` nao corresponde a farmacia da chave
- `500 Internal Server Error`: falha de banco

## Endpoint: GET /api/v1/inovafarma/sales/:cnpj/consumed

### Finalidade

Lista as vendas ja consumidas de uma farmacia com paginação e filtro por periodo.

### Entrada

Headers de autenticacao:

- `Authorization: Bearer <token>` ou `X-Api-Key: <token>` ou `X-Inova-Api-Key: <token>`

Path params:

- `cnpj`: string

Query params:

- `limit`: number, default `100`, maximo `500`
- `offset`: number, default `0`
- `date_from`: string ISO opcional
- `date_to`: string ISO opcional

### Saida de sucesso

```json
{
  "total": 1,
  "limit": 100,
  "offset": 0,
  "sales": [
    {
      "id": "2a8c1a3a-0d2c-4f7f-b8c8-2b0df2d8e9fa",
      "codigo_venda_online": "V12345",
      "data_venda": "2026-04-27T12:34:56.789Z",
      "nome_cliente": "Maria Silva",
      "tipo_ecommerce": "marketplace",
      "produtos": [],
      "pagamentos": [],
      "consumed_at": "2026-04-27T12:40:00.000Z",
      "consumed_by": "worker-1",
      "created_at": "2026-04-27T12:34:56.789Z"
    }
  ]
}
```

### Tipos de dados

- `total`: number
- `limit`: number
- `offset`: number
- `sales`: array de objetos
- `date_from` e `date_to`: string ISO opcional

### Regras de negocio

- Exige autenticacao valida
- Bloqueia acesso se a chave pertencer a outra farmacia
- Valida datas de filtro quando informadas

### Erros

- `401 Unauthorized`: API key ausente ou invalida
- `400 Bad Request`: `cnpj` ausente ou datas invalidas
- `403 Forbidden`: `cnpj` nao corresponde a farmacia da chave
- `500 Internal Server Error`: falha de banco

## Endpoint: GET /api/v1/inovafarma/sales/:cnpj/:id

### Finalidade

Retorna a venda original pelo id e CNPJ. Se o payload nao estiver mais no banco, tenta recupera-lo do storage.

### Entrada

Headers de autenticacao:

- `Authorization: Bearer <token>` ou `X-Api-Key: <token>` ou `X-Inova-Api-Key: <token>`

Path params:

- `cnpj`: string
- `id`: string

### Saida de sucesso

O endpoint devolve o payload original da venda, sem envelope adicional. O formato exato depende do JSON armazenado quando a venda foi criada.

### Tipos de dados

- Saida: `object` JSON livre, igual ao payload armazenado

### Regras de negocio

- Exige autenticacao valida
- Bloqueia acesso se a chave pertencer a outra farmacia
- Busca primeiro no banco
- Se necessario, faz fallback para object storage e faz parse do JSON

### Erros

- `401 Unauthorized`: API key ausente ou invalida
- `400 Bad Request`: `cnpj` ausente
- `403 Forbidden`: `cnpj` nao corresponde a farmacia da chave
- `404 Not Found`: venda nao encontrada
- `500 Internal Server Error`: falha de banco, storage ou parse do JSON

## Endpoint: POST /api/v1/inovafarma/sales/:cnpj/:id/consume

### Finalidade

Marca uma venda como consumida ou como falha de consumo. Quando a marcação e bem-sucedida, o backend pode disparar um webhook externo.

### Entrada

Headers de autenticacao:

- `Authorization: Bearer <token>` ou `X-Api-Key: <token>` ou `X-Inova-Api-Key: <token>`

Path params:

- `cnpj`: string
- `id`: string

Body:

- `consumer`: string
- `status`: string enum `SUCCESS` ou `FAILED`

### Exemplo de entrada

```json
{
  "consumer": "worker-1",
  "status": "SUCCESS"
}
```

### Saida de sucesso

```json
{
  "id": "2a8c1a3a-0d2c-4f7f-b8c8-2b0df2d8e9fa",
  "status": "CONSUMED",
  "consumed_at": "2026-04-27T12:40:00.000Z"
}
```

Se `status` for `FAILED`, a venda fica com status `FAILED`.

### Tipos de dados

- Entrada: `object`
- `consumer`: string
- `status`: string enum `SUCCESS` | `FAILED`
- Saida: objeto com `id` string, `status` string, `consumed_at` string ISO ou `null` dependendo do estado salvo

### Regras de negocio

- Exige autenticacao valida
- Bloqueia acesso se a chave pertencer a outra farmacia
- Requer `consumer` e `status`
- Converte `SUCCESS` para estado interno `CONSUMED`
- Converte `FAILED` para estado interno `FAILED`
- Dispara webhook externo quando o estado final for `CONSUMED`

### Erros

- `401 Unauthorized`: API key ausente ou invalida
- `400 Bad Request`: `cnpj` ausente, body incompleto ou `status` invalido
- `403 Forbidden`: `cnpj` nao corresponde a farmacia da chave
- `404 Not Found`: venda nao encontrada
- `500 Internal Server Error`: falha de banco ou webhook

## Endpoint: POST /admin/pharmacies/:cnpj/api-key

### Finalidade

Gera ou redefine a API key de uma farmacia especifica. Cria a farmacia automaticamente se ela nao existir.

### Entrada

Headers administrativos:

- `Authorization: Bearer <ADMIN_API_KEY>`
- ou `X-Admin-Api-Key: <ADMIN_API_KEY>`

Path params:

- `cnpj`: string opcional no handler, mas esperada nesta rota

Body opcional:

- `key`: string customizada para migracao ou rotacao controlada

### Exemplo de entrada

```json
{
  "key": "custom-api-key-value"
}
```

### Saida de sucesso

```json
{
  "cnpj": "05927228000145",
  "name": "Farmacia Exemplo",
  "api_key": "custom-api-key-value",
  "message": "API key set successfully. Store it securely — it will not be shown again."
}
```

### Tipos de dados

- Entrada: `object` opcional
- `key`: string opcional
- Saida: objeto com `cnpj` string, `name` string, `api_key` string, `message` string

### Regras de negocio

- Exige chave admin valida
- Normaliza o CNPJ removendo caracteres nao numericos
- Cria a farmacia automaticamente se nao existir (com nome padrao `Farmacia {CNPJ}`)
- Gera chave aleatoria se `key` nao for informada
- Persiste a nova chave no banco

### Erros

- `401 Unauthorized`: chave admin ausente ou invalida
- `400 Bad Request`: `cnpj` ausente
- `500 Internal Server Error`: falha ao atualizar o banco

## Endpoint: POST /admin/pharmacies/api-key

### Finalidade

Mesma operacao do endpoint anterior, mas aceita o CNPJ por body ou query quando a rota nao traz o parametro na URL.

### Entrada

Headers administrativos:

- `Authorization: Bearer <ADMIN_API_KEY>`
- ou `X-Admin-Api-Key: <ADMIN_API_KEY>`

Body ou query params:

- `cnpj`: string
- `key`: string opcional

### Saida de sucesso

Mesma estrutura do endpoint anterior.

### Tipos de dados

- Entrada: `object` ou query com `cnpj`
- Saida: objeto com `cnpj`, `name`, `api_key`, `message`

### Regras de negocio e erros

As mesmas do endpoint `POST /admin/pharmacies/:cnpj/api-key` — cria a farmacia automaticamente, gera chave aleatoria, sem 404.

## Observacoes de contrato

- Os endpoints de sales e products usam escrita assíncrona e devolvem 202 quando apenas registram o evento para processamento posterior.
- O endpoint `GET /api/v1/inovafarma/sales/:cnpj/:id` pode devolver o payload bruto original, sem shape fixo de envelope.
- O backend aceita chaves legadas enquanto `VALID_API_KEYS` estiver configurado.
- Esta documentacao cobre apenas as rotas registradas no backend atual.