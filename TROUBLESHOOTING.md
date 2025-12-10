# 🔧 Solução de Problemas - Frontend IntegraHub

## ⚠️ "Não consigo acessar o frontend"

### ✅ O servidor ESTÁ funcionando!

Testes confirmam que o frontend está acessível:
```bash
curl http://integrahub.geniuscloud.com.br/login.html
# Retorna: HTTP 200 OK ✅
```

---

## 🔍 Possíveis Causas e Soluções

### 1️⃣ Você está usando HTTPS? ❌

**Problema**: SSL/HTTPS ainda não foi configurado.

**ERRO**:
```
https://integrahub.geniuscloud.com.br  ❌
```

**CORRETO**:
```
http://integrahub.geniuscloud.com.br   ✅
```

**Solução**:
- Use `http://` (sem o "s")
- OU configure SSL com Let's Encrypt:
  ```bash
  sudo certbot --nginx -d integrahub.geniuscloud.com.br
  ```

---

### 2️⃣ Cache do Navegador

**Problema**: O navegador está mostrando versão antiga em cache.

**Solução**:
- **Chrome/Edge**: Ctrl + Shift + R (Windows/Linux) ou Cmd + Shift + R (Mac)
- **Firefox**: Ctrl + F5
- **Safari**: Cmd + Option + R
- **Ou**: Abra uma aba anônima/privada

---

### 3️⃣ DNS não Propagou

**Problema**: O DNS ainda não atualizou.

**Verificar**:
```bash
nslookup integrahub.geniuscloud.com.br
```

**Solução Temporária** - Use o IP direto:
```
http://178.156.205.155/login.html
```

**Limpar Cache DNS** (no seu computador):
- **Windows**: `ipconfig /flushdns`
- **Mac**: `sudo dscacheutil -flushcache`
- **Linux**: `sudo systemd-resolve --flush-caches`

---

### 4️⃣ Firewall/Antivírus Bloqueando

**Problema**: Seu firewall ou antivírus está bloqueando a conexão.

**Solução**:
- Desative temporariamente o firewall/antivírus
- Ou adicione exceção para o domínio

---

### 5️⃣ Navegador com Proxy/VPN

**Problema**: VPN ou proxy pode estar interferindo.

**Solução**:
- Desconecte VPN temporariamente
- Desative proxy no navegador
- Teste em outro navegador

---

### 6️⃣ Porta 80 Bloqueada

**Problema**: Seu provedor/rede bloqueia porta 80.

**Verificar**:
```bash
telnet integrahub.geniuscloud.com.br 80
```

**Solução**:
- Configure o servidor para usar porta alternativa
- Ou configure HTTPS (porta 443)

---

## 🧪 Testes para Fazer

### Teste 1: Acesso Direto via IP
```
http://178.156.205.155/login.html
```
Se funcionar: problema é DNS
Se não funcionar: problema é no servidor

### Teste 2: Usando curl
```bash
curl -v http://integrahub.geniuscloud.com.br/login.html
```
Deve retornar: `HTTP/1.1 200 OK`

### Teste 3: Página de Status
```
http://integrahub.geniuscloud.com.br/status.html
```
Página que mostra o status atual do sistema

### Teste 4: Outro Dispositivo
- Tente acessar do celular (dados móveis, não WiFi)
- Tente de outro computador
- Tente de outra rede

---

## 📊 Checklist de Diagnóstico

Marque o que você testou:

- [ ] Estou usando `http://` (não https://)
- [ ] Limpei cache do navegador (Ctrl+Shift+R)
- [ ] Testei em aba anônima
- [ ] Testei em outro navegador
- [ ] Testei no celular (dados móveis)
- [ ] Testei via IP direto (http://178.156.205.155/login.html)
- [ ] Desliguei VPN
- [ ] Desliguei antivírus/firewall temporariamente
- [ ] Limpei cache DNS do meu computador

---

## 🌐 URLs Corretas para Testar

### ✅ CORRETO (HTTP):
```
http://integrahub.geniuscloud.com.br
http://integrahub.geniuscloud.com.br/login.html
http://integrahub.geniuscloud.com.br/dashboard.html
http://integrahub.geniuscloud.com.br/status.html
http://integrahub.geniuscloud.com.br/docs
```

### ❌ INCORRETO (HTTPS):
```
https://integrahub.geniuscloud.com.br  ❌ Não funciona (SSL não configurado)
```

---

## 🔧 Comandos para Verificar no Servidor

```bash
# 1. Verificar se NestJS está rodando
pm2 status
# Deve mostrar: integrahub-api (online)

# 2. Verificar se Nginx está rodando
sudo systemctl status nginx
# Deve mostrar: active (running)

# 3. Verificar porta 3002
sudo lsof -i :3002
# Deve mostrar: node

# 4. Verificar porta 80
sudo lsof -i :80
# Deve mostrar: nginx

# 5. Testar localmente
curl http://localhost:3002/login.html
# Deve retornar HTML

# 6. Testar via domínio
curl http://integrahub.geniuscloud.com.br/login.html
# Deve retornar HTML

# 7. Ver logs
pm2 logs integrahub-api --lines 50
```

---

## 🚀 Se Tudo Falhar

### Opção 1: Reinstalar tudo
```bash
cd /home/IntegraHub
npm run build
pm2 restart integrahub-api
sudo systemctl reload nginx
```

### Opção 2: Configurar SSL (Let's Encrypt)
```bash
sudo certbot --nginx -d integrahub.geniuscloud.com.br
```
Depois acesse via: `https://integrahub.geniuscloud.com.br`

### Opção 3: Usar outra porta
Se porta 80 estiver bloqueada, configure para usar 8080:

**Nginx** (`/etc/nginx/sites-available/integrahub`):
```nginx
server {
    listen 8080;  # Mude para 8080
    # ...
}
```

Depois acesse: `http://integrahub.geniuscloud.com.br:8080`

---

## 💡 Resposta Rápida

**"Não consigo acessar"** → 90% das vezes é um destes:
1. Está usando `https://` ao invés de `http://`
2. Cache do navegador
3. DNS não propagou (use o IP direto)

**Tente isto AGORA**:
1. Abra aba anônima do navegador
2. Acesse: `http://integrahub.geniuscloud.com.br/login.html`
3. Se não funcionar, tente: `http://178.156.205.155/login.html`

---

## 📞 Verificação Final

Execute no servidor:
```bash
curl -s http://integrahub.geniuscloud.com.br/login.html | grep -i title
```

Se retornar:
```html
<title>IntegraHub - Login</title>
```

✅ **O servidor ESTÁ FUNCIONANDO!**
O problema está no seu lado (cliente).

---

## 🎯 TL;DR - Solução Rápida

```
1. Use: http://integrahub.geniuscloud.com.br/login.html
   (NÃO use https://)

2. Se não funcionar, tente o IP:
   http://178.156.205.155/login.html

3. Limpe cache: Ctrl+Shift+R

4. Se ainda não funcionar, configure SSL:
   sudo certbot --nginx -d integrahub.geniuscloud.com.br
```

---

*Última atualização: 8 de Dezembro de 2025*
