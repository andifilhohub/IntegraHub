#!/bin/bash

# Script de Deploy do IntegraHub Frontend
# Este script configura o Nginx para servir a aplicação via domínio

echo "🚀 Iniciando configuração do IntegraHub..."

# Cores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Verificar se está rodando como root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}❌ Por favor, execute como root ou use sudo${NC}"
    exit 1
fi

# 1. Copiar configuração do Nginx
echo -e "${YELLOW}📋 Copiando configuração do Nginx...${NC}"
cp nginx-integrahub.conf /etc/nginx/sites-available/integrahub

# 2. Criar link simbólico
echo -e "${YELLOW}🔗 Criando link simbólico...${NC}"
ln -sf /etc/nginx/sites-available/integrahub /etc/nginx/sites-enabled/

# 3. Testar configuração do Nginx
echo -e "${YELLOW}🧪 Testando configuração do Nginx...${NC}"
nginx -t

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Erro na configuração do Nginx!${NC}"
    exit 1
fi

# 4. Recarregar Nginx
echo -e "${YELLOW}🔄 Recarregando Nginx...${NC}"
systemctl reload nginx

# 5. Verificar status do Nginx
if systemctl is-active --quiet nginx; then
    echo -e "${GREEN}✅ Nginx está rodando!${NC}"
else
    echo -e "${RED}❌ Nginx não está rodando!${NC}"
    systemctl status nginx
    exit 1
fi

# 6. Verificar se a aplicação está rodando
echo -e "${YELLOW}🔍 Verificando se a aplicação IntegraHub está rodando...${NC}"
if lsof -Pi :3002 -sTCP:LISTEN -t >/dev/null ; then
    echo -e "${GREEN}✅ Aplicação está rodando na porta 3002!${NC}"
else
    echo -e "${RED}❌ Aplicação NÃO está rodando na porta 3002!${NC}"
    echo -e "${YELLOW}💡 Inicie a aplicação com: pm2 start npm --name integrahub -- run start:prod${NC}"
fi

# 7. Verificar DNS
echo -e "${YELLOW}🌐 Verificando DNS...${NC}"
if host integrahub.geniuscloud.com.br > /dev/null 2>&1; then
    echo -e "${GREEN}✅ DNS configurado!${NC}"
    host integrahub.geniuscloud.com.br
else
    echo -e "${YELLOW}⚠️  DNS ainda não está propagado ou não configurado${NC}"
    echo -e "${YELLOW}💡 Configure o registro A do domínio para apontar para o IP deste servidor${NC}"
fi

# 8. Próximos passos
echo -e "\n${GREEN}✅ Configuração básica concluída!${NC}\n"
echo -e "${YELLOW}📝 PRÓXIMOS PASSOS:${NC}"
echo -e "1. Certifique-se de que a aplicação está rodando:"
echo -e "   ${GREEN}pm2 start npm --name integrahub -- run start:prod${NC}"
echo -e "\n2. Configure DNS (se ainda não fez):"
echo -e "   integrahub.geniuscloud.com.br → A → $(curl -s ifconfig.me)"
echo -e "\n3. Instale certificado SSL (recomendado):"
echo -e "   ${GREEN}sudo certbot --nginx -d integrahub.geniuscloud.com.br${NC}"
echo -e "\n4. Teste o acesso:"
echo -e "   ${GREEN}curl http://integrahub.geniuscloud.com.br${NC}"
echo -e "\n5. Abra no navegador:"
echo -e "   ${GREEN}http://integrahub.geniuscloud.com.br${NC}"
echo -e "\n${GREEN}🎉 Deploy configurado com sucesso!${NC}"
