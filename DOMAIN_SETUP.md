# Configuração para Acesso via integrahub.geniuscloud.com.br

## Configuração CORS Aplicada

Foi adicionado suporte CORS no `src/main.ts` para permitir acesso do domínio `integrahub.geniuscloud.com.br`.

### Origens permitidas:
- `http://localhost:3002` (desenvolvimento)
- `http://localhost:3000` (desenvolvimento)
- `https://integrahub.geniuscloud.com.br` (produção)
- `http://integrahub.geniuscloud.com.br` (produção sem SSL)

## Configuração do Servidor (Nginx/Apache)

Para que o domínio `integrahub.geniuscloud.com.br` funcione, você precisa configurar um proxy reverso no seu servidor web.

### Exemplo de Configuração Nginx

Crie um arquivo de configuração em `/etc/nginx/sites-available/integrahub`:

```nginx
server {
    listen 80;
    server_name integrahub.geniuscloud.com.br;

    # Redirecionar HTTP para HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name integrahub.geniuscloud.com.br;

    # Configuração SSL (certbot/Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/integrahub.geniuscloud.com.br/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/integrahub.geniuscloud.com.br/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Logs
    access_log /var/log/nginx/integrahub-access.log;
    error_log /var/log/nginx/integrahub-error.log;

    # Proxy para a aplicação NestJS
    location / {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Cache para arquivos estáticos
    location ~* \.(css|js|jpg|jpeg|png|gif|ico|svg|woff|woff2|ttf|eot)$ {
        proxy_pass http://localhost:3002;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### Passos para Ativar a Configuração

1. **Criar o arquivo de configuração:**
   ```bash
   sudo nano /etc/nginx/sites-available/integrahub
   ```

2. **Criar link simbólico:**
   ```bash
   sudo ln -s /etc/nginx/sites-available/integrahub /etc/nginx/sites-enabled/
   ```

3. **Testar a configuração:**
   ```bash
   sudo nginx -t
   ```

4. **Recarregar o Nginx:**
   ```bash
   sudo systemctl reload nginx
   ```

5. **Instalar certificado SSL (Let's Encrypt):**
   ```bash
   sudo certbot --nginx -d integrahub.geniuscloud.com.br
   ```

## Configuração do DNS

Certifique-se de que o DNS do domínio está apontando para o IP do servidor:

```
integrahub.geniuscloud.com.br  →  A Record  →  [IP do Servidor]
```

## Verificação

Após configurar:

1. **Testar HTTP:**
   ```bash
   curl http://integrahub.geniuscloud.com.br
   ```

2. **Testar HTTPS:**
   ```bash
   curl https://integrahub.geniuscloud.com.br
   ```

3. **Acessar no navegador:**
   - `https://integrahub.geniuscloud.com.br`

## Configuração com Docker (Opcional)

Se você estiver usando Docker Compose, adicione um serviço nginx:

```yaml
services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf
      - /etc/letsencrypt:/etc/letsencrypt
    depends_on:
      - api
    restart: unless-stopped

  api:
    build: .
    environment:
      - PORT=3002
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
      - INOVA_API_KEY=${INOVA_API_KEY}
    expose:
      - "3002"
    restart: unless-stopped
```

## PM2 Configuration (Produção)

Se você usa PM2, certifique-se de que a aplicação está rodando:

```bash
pm2 start npm --name "integrahub" -- run start:prod
pm2 save
pm2 startup
```

## Firewall

Permita tráfego nas portas 80 e 443:

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw reload
```

## Troubleshooting

### 502 Bad Gateway
- Verifique se a aplicação NestJS está rodando: `pm2 status` ou `ps aux | grep node`
- Verifique os logs: `pm2 logs integrahub` ou `tail -f /var/log/nginx/integrahub-error.log`

### CORS Errors
- Verifique se o domínio está na lista de origens permitidas no `src/main.ts`
- Verifique os headers do navegador (DevTools → Network)

### SSL Certificate Issues
- Renove o certificado: `sudo certbot renew`
- Verifique a validade: `sudo certbot certificates`

### Conexão recusada
- Verifique se a porta 3002 está aberta: `netstat -tulpn | grep 3002`
- Verifique se o firewall não está bloqueando

## Variáveis de Ambiente

Lembre-se de configurar as variáveis de ambiente no servidor:

```bash
# .env
PORT=3002
DATABASE_URL=postgresql://user:password@localhost:5432/integrahub
REDIS_URL=redis://localhost:6379
INOVA_API_KEY=sua_chave_secreta_aqui
LOG_LEVEL=info
INOVAFARMA_BUFFER_DIR=/var/integrahub/buffer
```

## Backup e Monitoramento

Configure monitoramento com PM2:

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 30
```

## Conclusão

Após seguir estas configurações:
1. ✅ CORS estará configurado para aceitar requisições do domínio
2. ✅ Nginx fará proxy reverso para a aplicação
3. ✅ SSL/HTTPS estará configurado
4. ✅ Frontend acessível via `https://integrahub.geniuscloud.com.br`
