# Guia: Endpoint de Geração de API Key

Este endpoint gera ou redefine a chave de API para uma farmácia específica.

---

## Erro 415: Unsupported Media Type

Se você recebe `415 Unsupported Media Type: application/x-www-form-urlencoded`, significa que está enviando a requisição como **form-urlencoded** em vez de **JSON**.

### ❌ ERRADO (causa 415)
```bash
curl -X POST http://localhost:3002/admin/pharmacies/05927228000145/api-key \
  -H "Authorization: Bearer SEU_ADMIN_API_KEY" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "key=minha-chave"
```

### ✅ CORRETO
```bash
curl -X POST http://localhost:3002/admin/pharmacies/05927228000145/api-key \
  -H "Authorization: Bearer SEU_ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"key":"minha-chave"}'
```

---

## Rotas

O endpoint pode ser chamado de **três formas** e **cria a farmácia automaticamente se não existir**:

### 1️⃣ Com CNPJ na URL (path param)

```http
POST /admin/pharmacies/{cnpj}/api-key
```

**Headers obrigatórios:**
- `Authorization: Bearer <ADMIN_API_KEY>` ou `X-Admin-Api-Key: <ADMIN_API_KEY>`
- `Content-Type: application/json`

**Body (opcional):**
```json
{
  "key": "minha-chave-customizada"
}
```

**Exemplo:**
```bash
curl -X POST http://localhost:3002/admin/pharmacies/05927228000145/api-key \
  -H "Authorization: Bearer SEU_ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"key":"chave-customizada"}'
```

**Resposta 200:**
```json
{
  "cnpj": "05927228000145",
  "name": "Farmacia Exemplo",
  "api_key": "chave-customizada",
  "message": "API key set successfully. Store it securely — it will not be shown again."
}
```

---

### 2️⃣ Com CNPJ na query string

```http
POST /admin/pharmacies/api-key?cnpj=05927228000145
```

**Exemplo:**
```bash
curl -X POST "http://localhost:3002/admin/pharmacies/api-key?cnpj=05927228000145" \
  -H "Authorization: Bearer SEU_ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"key":"chave-customizada"}'
```

---

### 3️⃣ Com CNPJ no body

```http
POST /admin/pharmacies/api-key
```

**Body:**
```json
{
  "cnpj": "05927228000145",
  "key": "chave-customizada"
}
```

**Exemplo:**
```bash
curl -X POST http://localhost:3002/admin/pharmacies/api-key \
  -H "Authorization: Bearer SEU_ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "cnpj": "05927228000145",
    "key": "chave-customizada"
  }'
```

---

## Auto-geração (sem passar `key`)

Se você **não enviar o campo `key`** no body, a API gera uma chave aleatória e segura:

```bash
curl -X POST http://localhost:3002/admin/pharmacies/05927228000145/api-key \
  -H "Authorization: Bearer SEU_ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

ou apenas (body vazio):

```bash
curl -X POST http://localhost:3002/admin/pharmacies/05927228000145/api-key \
  -H "Authorization: Bearer SEU_ADMIN_API_KEY" \
  -H "Content-Type: application/json"
```

**Resposta (chave gerada aleatoriamente):**
```json
{
  "cnpj": "05927228000145",
  "name": "Farmacia Exemplo",
  "api_key": "a3f8e9c2d1b5f4a9e7c8d9b5f3a2e1c9d8b7a6f5e4d3c2b1a9f8e7d6c5",
  "message": "API key set successfully. Store it securely — it will not be shown again."
}
```

---

## Exemplos em diferentes linguagens

### JavaScript / Node.js

```javascript
const adminApiKey = 'SEU_ADMIN_API_KEY';
const cnpj = '05927228000145';

// Opção 1: Auto-gerar chave
const response = await fetch(
  `http://localhost:3002/admin/pharmacies/${cnpj}/api-key`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminApiKey}`
    },
    body: JSON.stringify({}) // ou omita o body
  }
);

const result = await response.json();
console.log(result.api_key);

// Opção 2: Customizar chave
const responseCustom = await fetch(
  `http://localhost:3002/admin/pharmacies/${cnpj}/api-key`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminApiKey}`
    },
    body: JSON.stringify({
      key: 'minha-chave-customizada'
    })
  }
);

const resultCustom = await responseCustom.json();
console.log(resultCustom.api_key);
```

### Python

```python
import requests
import json

admin_api_key = 'SEU_ADMIN_API_KEY'
cnpj = '05927228000145'
base_url = 'http://localhost:3002'

# Auto-gerar chave
response = requests.post(
    f'{base_url}/admin/pharmacies/{cnpj}/api-key',
    headers={
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {admin_api_key}'
    },
    json={}  # Body vazio = auto-gerar
)

print(response.json()['api_key'])

# Customizar chave
response_custom = requests.post(
    f'{base_url}/admin/pharmacies/{cnpj}/api-key',
    headers={
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {admin_api_key}'
    },
    json={'key': 'minha-chave-customizada'}
)

print(response_custom.json()['api_key'])
```

### cURL

```bash
# Auto-gerar chave
curl -X POST http://localhost:3002/admin/pharmacies/05927228000145/api-key \
  -H "Authorization: Bearer SEU_ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'

# Customizar chave
curl -X POST http://localhost:3002/admin/pharmacies/05927228000145/api-key \
  -H "Authorization: Bearer SEU_ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"key":"minha-chave"}'
```

### Postman

1. **Método:** POST
2. **URL:** `http://localhost:3002/admin/pharmacies/05927228000145/api-key`
3. **Headers:**
   - `Authorization: Bearer SEU_ADMIN_API_KEY`
   - `Content-Type: application/json`
4. **Body (raw JSON):**
   ```json
   {
     "key": "minha-chave-customizada"
   }
   ```
   Ou deixe vazio para auto-gerar.

---

## Códigos de status e erros

| Status | Significado | Exemplo |
|--------|-------------|---------|
| 200 | Sucesso | Chave criada ou atualizada, farmácia criada se não existisse |
| 400 | requisição inválida | CNPJ ausente ou vazio |
| 401 | Não autenticado | Admin API Key inválida ou ausente |
| 415 | **Unsupported Media Type** | `Content-Type: application/x-www-form-urlencoded` — **use `application/json`** |

---

## Regras importantes

1. **Autenticação obrigatória**: Use `Authorization: Bearer` ou `X-Admin-Api-Key`
2. **JSON obrigatório**: Sempre `Content-Type: application/json` — **não form-urlencoded**
3. **CNPJ formatado**: O CNPJ é normalizado automaticamente (remove caracteres não-numéricos)
4. **Farmácia auto-criada**: Se não existir, é criada automaticamente com nome padrão `Farmácia {CNPJ}`
5. **Chave não é repetida**: Depois de gerar/configurar a chave, não há como recuperá-la — guarde com segurança

---

## Fluxo típico

```
1. Admin chama POST /admin/pharmacies/{cnpj}/api-key
   ↓
2. Backend cria a farmácia automaticamente (se não existir)
   ↓
3. Backend gera ou configura a chave API
   ↓
4. Admin recebe api_key e passa para o sistema de originação (ERP/PDV)
   ↓
5. ERP/PDV passa a chave para todas as requisições:
   - Authorization: Bearer {chave}
   - X-Api-Key: {chave}
   - X-Inova-Api-Key: {chave}
```
