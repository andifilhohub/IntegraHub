# 🌐 Guia Rápido: Acessar via integrahub.geniuscloud.com.br

## ✅ O que foi feito

1. **CORS configurado** - A aplicação agora aceita requisições de `integrahub.geniuscloud.com.br`
2. **Arquivos criados**:
   - `nginx-integrahub.conf` - Configuração do Nginx
   - `deploy-domain.sh` - Script de deploy automatizado
   - `DOMAIN_SETUP.md` - Documentação completa

## 🚀 Como Configurar (Passo a Passo)

### Opção 1: Usando o Script Automatizado

```bash
# No servidor, execute:
sudo ./deploy-domain.sh
```

### Opção 2: Configuração Manual

#### 1. Configurar Nginx

```bash
# Copiar configuração
sudo cp nginx-integrahub.conf /etc/nginx/sites-available/integrahub

# Criar link simbólico
sudo ln -s /etc/nginx/sites-available/integrahub /etc/nginx/sites-enabled/

# Testar configuração
sudo nginx -t

# Recarregar Nginx
sudo systemctl reload nginx
```

#### 2. Garantir que a Aplicação está Rodando

```bash
# Com PM2
pm2 start npm --name integrahub -- run start:prod
pm2 save

# Ou em desenvolvimento
npm run start:dev
```

#### 3. Configurar DNS

No painel de DNS do seu domínio (GeniusCloud), crie um registro:

```
Tipo: A
Nome: integrahub
Valor: [IP do servidor]
TTL: 3600
```

#### 4. Instalar Certificado SSL (Recomendado)

```bash
# Instalar certbot (se ainda não tiver)
sudo apt install certbot python3-certbot-nginx

# Obter certificado
sudo certbot --nginx -d integrahub.geniuscloud.com.br

# Certbot vai configurar automaticamente o SSL
```

## 🧪 Testar

### 1. Testar localmente no servidor

```bash
curl http://localhost:3002
```

### 2. Testar via domínio

```bash
curl http://integrahub.geniuscloud.com.br
```

### 3. Testar no navegador

Abra: `https://integrahub.geniuscloud.com.br` (com SSL) ou `http://integrahub.geniuscloud.com.br` (sem SSL)

## 📋 Checklist

- [ ] DNS configurado (registro A apontando para o IP do servidor)
- [ ] Nginx instalado e configurado
- [ ] Aplicação IntegraHub rodando na porta 3002
- [ ] Firewall permitindo portas 80 e 443
- [ ] SSL configurado (opcional, mas recomendado)
- [ ] CORS configurado no código (já feito ✅)

## 🔧 Troubleshooting

### "502 Bad Gateway"
```bash
# Verificar se app está rodando
pm2 status
# ou
lsof -i :3002

# Iniciar se necessário
pm2 start npm --name integrahub -- run start:prod
```

### "Connection Refused"
```bash
# Verificar Nginx
sudo systemctl status nginx

# Verificar logs
sudo tail -f /var/log/nginx/error.log
```

### "DNS not resolved"
```bash
# Verificar DNS
nslookup integrahub.geniuscloud.com.br
# ou
dig integrahub.geniuscloud.com.br

# Esperar propagação (pode levar até 24h, geralmente minutos)
```

### CORS Errors no navegador
- O CORS já está configurado no código
- Se ainda tiver erro, verifique se você está acessando o domínio correto
- Limpe o cache do navegador

## 📱 Acessar o Dashboard

1. Acesse: `https://integrahub.geniuscloud.com.br`
2. Faça login com a chave `INOVA_API_KEY`
3. Visualize os dados do buffer e produtos processados

## 🔐 Segurança

- ✅ Use HTTPS (SSL/TLS)
- ✅ Mantenha o `INOVA_API_KEY` seguro
- ✅ Configure firewall (UFW/iptables)
- ✅ Atualize o servidor regularmente

## 📞 Suporte

Se tiver problemas:
1. Verifique logs do Nginx: `sudo tail -f /var/log/nginx/error.log`
2. Verifique logs da aplicação: `pm2 logs integrahub`
3. Consulte `DOMAIN_SETUP.md` para documentação completa
