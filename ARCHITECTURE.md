# 🏗️ Arquitetura IntegraHub - Frontend + Backend na Mesma Porta

## ✅ Como Está Configurado (IDEAL)

O IntegraHub usa uma **arquitetura unificada** onde frontend e backend rodam **na mesma porta 3002**.

### 📊 Diagrama da Arquitetura

```
Internet
    ↓
integrahub.geniuscloud.com.br:443 (HTTPS)
    ↓
Nginx (Proxy Reverso) - Porta 80/443
    ↓
localhost:3002 (NestJS - Porta ÚNICA)
    ↓
    ├─── Frontend (Arquivos Estáticos)
    │    ├─ /login.html
    │    ├─ /dashboard.html
    │    ├─ /styles.css
    │    └─ /*.js
    │
    └─── Backend API (Endpoints REST)
         ├─ /v1/inovafarma/products
         ├─ /v1/products
         ├─ /v1/dashboard/auth
         ├─ /v1/dashboard/stats
         ├─ /v1/dashboard/buffer
         └─ /v1/dashboard/products
```

## 🎯 Por Que Esta Arquitetura?

### ✅ Vantagens

1. **Sem Problemas de CORS**
   - Frontend e backend estão na mesma origem
   - Não precisa configurar headers CORS complexos
   - Requisições AJAX funcionam nativamente

2. **Simplicidade Operacional**
   - Uma única porta para gerenciar
   - Um único processo PM2
   - Deploy mais simples

3. **Performance**
   - Menos latência de rede
   - Menos overhead de conexão
   - Cache mais eficiente

4. **Segurança**
   - Menos superfície de ataque
   - Uma única camada de SSL/TLS
   - Autenticação centralizada

5. **Economia de Recursos**
   - Menos portas abertas
   - Menos processos rodando
   - Menos consumo de memória

### ❌ Desvantagens (Mínimas)

- Frontend e backend devem ser deployados juntos
- Em caso de alta carga, não é possível escalar separadamente
  (Mas para o IntegraHub, isso não é um problema)

## 🔧 Como Funciona

### 1. NestJS Serve Tudo na Porta 3002

**Arquivo**: `src/main.ts`

```typescript
// Serve arquivos estáticos (frontend)
app.useStaticAssets(publicPath, {
  prefix: '/',
  index: false,
});

// Serve API em /v1/*
app.setGlobalPrefix('v1');
```

**Resultado**:
- `http://localhost:3002/login.html` → Arquivo estático
- `http://localhost:3002/v1/dashboard/stats` → Endpoint da API

### 2. Nginx Faz Proxy de TUDO

**Arquivo**: `/etc/nginx/sites-available/integrahub`

```nginx
location / {
    proxy_pass http://localhost:3002;
    # Passa TUDO para o NestJS
}
```

**Resultado**:
- `https://integrahub.geniuscloud.com.br/login.html` → NestJS (frontend)
- `https://integrahub.geniuscloud.com.br/v1/dashboard/stats` → NestJS (API)

### 3. DNS Aponta para o Servidor

```
integrahub.geniuscloud.com.br → IP do Servidor → Nginx → NestJS:3002
```

## 📝 Fluxo de uma Requisição

### Exemplo: Acessar Dashboard

```
1. Usuário acessa: https://integrahub.geniuscloud.com.br/dashboard.html

2. DNS resolve para: IP do servidor (ex: 192.168.1.100)

3. Nginx recebe a requisição na porta 443 (HTTPS)
   - Termina SSL
   - Faz proxy para http://localhost:3002/dashboard.html

4. NestJS recebe na porta 3002
   - Verifica: não é /v1/* então não é API
   - Serve o arquivo estático: public/dashboard.html

5. Browser renderiza dashboard.html
   - Carrega: /styles.css (servido pelo NestJS)
   - Carrega: /dashboard.js (servido pelo NestJS)

6. JavaScript faz requisição: /v1/dashboard/stats?token=xyz

7. Requisição vai para o mesmo servidor:
   - https://integrahub.geniuscloud.com.br/v1/dashboard/stats?token=xyz
   - Nginx → NestJS:3002
   - NestJS vê /v1/* → rota da API
   - DashboardController processa
   - Retorna JSON

8. JavaScript atualiza a tela com os dados
```

## 🌐 URLs Funcionando

### Frontend (Arquivos Estáticos)
✅ `https://integrahub.geniuscloud.com.br/` → Redireciona para login
✅ `https://integrahub.geniuscloud.com.br/login.html` → Tela de login
✅ `https://integrahub.geniuscloud.com.br/dashboard.html` → Dashboard
✅ `https://integrahub.geniuscloud.com.br/styles.css` → CSS
✅ `https://integrahub.geniuscloud.com.br/dashboard.js` → JavaScript

### Backend (API)
✅ `https://integrahub.geniuscloud.com.br/v1/dashboard/auth` → POST - Login
✅ `https://integrahub.geniuscloud.com.br/v1/dashboard/stats` → GET - Estatísticas
✅ `https://integrahub.geniuscloud.com.br/v1/dashboard/buffer` → GET - Buffer
✅ `https://integrahub.geniuscloud.com.br/v1/dashboard/products` → GET - Produtos
✅ `https://integrahub.geniuscloud.com.br/v1/inovafarma/products` → POST - Ingest
✅ `https://integrahub.geniuscloud.com.br/v1/products` → GET - Buscar produtos

### Documentação
✅ `https://integrahub.geniuscloud.com.br/docs` → Swagger API Docs

## 🔍 Verificar se Está Funcionando

### 1. Testar Frontend
```bash
curl http://integrahub.geniuscloud.com.br/login.html
# Deve retornar HTML
```

### 2. Testar API
```bash
curl http://integrahub.geniuscloud.com.br/v1/dashboard/stats?token=test
# Deve retornar JSON (erro 401 se token inválido)
```

### 3. Testar Nginx
```bash
sudo nginx -t
systemctl status nginx
```

### 4. Testar NestJS
```bash
pm2 status
pm2 logs integrahub-api --lines 20
```

## 🚀 Comandos Úteis

### Ver todas as portas em uso
```bash
sudo netstat -tulpn | grep :3002
sudo netstat -tulpn | grep :80
sudo netstat -tulpn | grep :443
```

### Testar localmente (sem Nginx)
```bash
curl http://localhost:3002/login.html
```

### Testar via domínio (com Nginx)
```bash
curl http://integrahub.geniuscloud.com.br/login.html
```

### Reiniciar tudo
```bash
npm run build
pm2 restart integrahub-api
sudo systemctl reload nginx
```

## 📊 Comparação: 1 Porta vs 2 Portas

### ❌ Se fossem portas separadas (NÃO recomendado):
```
Frontend: Port 3000 → Serve apenas HTML/CSS/JS
Backend:  Port 3002 → Serve apenas API

Problemas:
- Precisa configurar CORS
- Duas portas no firewall
- Dois processos PM2
- Mais complexo para gerenciar
```

### ✅ Como está (1 porta - RECOMENDADO):
```
NestJS: Port 3002 → Serve TUDO (Frontend + API)

Vantagens:
- Sem CORS
- Uma porta
- Um processo
- Simples e eficiente
```

## 🎓 Resumo

**Pergunta**: "Por que o frontend não usa outra porta?"

**Resposta**: Porque NÃO PRECISA! 🎯

- O NestJS pode servir arquivos estáticos E API na mesma porta
- É mais simples, seguro e eficiente
- Evita problemas de CORS
- É a arquitetura padrão para aplicações modernas

**Arquitetura Atual** = ✅ IDEAL
```
1 Domínio → 1 Nginx → 1 Porta (3002) → Frontend + API juntos
```

**Alternativa Desnecessária** = ❌ Mais Complexo
```
1 Domínio → Nginx → 2 Portas (3000 + 3002) → Frontend e API separados
```

## 💡 Observação Final

A única razão para separar frontend e backend em portas diferentes seria se:
1. Frontend fosse uma SPA pesada (React/Vue) servida por Node
2. Backend fosse um serviço completamente separado
3. Precisasse escalar frontend e backend independentemente

**No caso do IntegraHub**: Frontend é simples (HTML/CSS/JS) e backend é NestJS.
Servir tudo junto na mesma porta é a escolha CORRETA! ✅
