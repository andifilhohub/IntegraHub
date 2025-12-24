# Frontend IntegraHub - Guia de Implementação

## 📋 Resumo

Foi criado um frontend completo para o IntegraHub com:
- Tela de login usando autenticação com `INOVA_API_KEY`
- Dashboard com visualização de dados do buffer e produtos processados
- Interface responsiva e moderna

## 🎯 Funcionalidades Implementadas

### 1. Sistema de Autenticação
- Formulário de login que valida a chave `INOVA_API_KEY`
- Token armazenado no localStorage do navegador
- Validação automática do token em todas as requisições
- Redirecionamento automático se não autenticado

### 2. Dashboard Principal
- **Estatísticas em Cards**:
  - Total de produtos
  - Produtos ativos
  - Total de farmácias
  - Arquivos no buffer

- **Aba: Arquivos no Buffer**:
  - Lista todos os arquivos JSON pendentes no diretório buffer
  - Mostra: nome do arquivo, data de criação, tipo de carga, quantidade de produtos, tamanho
  - Botão "Ver Detalhes" que abre modal com o conteúdo JSON completo
  - Botão de atualizar

- **Aba: Produtos Processados**:
  - Lista produtos salvos no banco de dados
  - Mostra: ID, farmácia, título, EAN, preço, estoque, status, última atualização
  - Paginação (50 produtos por página)
  - Botão de atualizar

### 3. Recursos Adicionais
- Auto-refresh a cada 30 segundos
- Design responsivo (funciona em desktop e mobile)
- Formatação de valores (moeda brasileira, datas, tamanhos de arquivo)
- Feedback visual de loading
- Tratamento de erros

## 📁 Arquivos Criados

### Backend (API Endpoints)
```
src/modules/dashboard/
├── dashboard.module.ts       # Módulo do dashboard
├── dashboard.controller.ts   # Endpoints da API
└── dashboard.service.ts      # Lógica de negócio

src/root.controller.ts        # Redirecionamento da raiz
```

### Frontend
```
public/
├── index.html           # Redirecionamento para login
├── login.html          # Página de login
├── dashboard.html      # Página do dashboard
├── login.js           # Lógica de autenticação
├── dashboard.js       # Lógica do dashboard
├── styles.css         # Estilos CSS
└── README.md          # Documentação do frontend
```

### Modificações em Arquivos Existentes
- `src/main.ts` - Adicionado suporte para servir arquivos estáticos
- `src/app.module.ts` - Registrado DashboardModule e RootController

## 🔌 Endpoints da API

### POST /v1/dashboard/auth
Autentica o usuário com o INOVA_API_KEY
```json
// Request
{
  "secret": "sua_chave_secreta"
}

// Response
{
  "authenticated": true,
  "token": "sua_chave_secreta"
}
```

### GET /v1/dashboard/stats?token=<token>
Retorna estatísticas gerais
```json
{
  "totalProducts": 1500,
  "activeProducts": 1450,
  "totalPharmacies": 10,
  "inactiveProducts": 50
}
```

### GET /v1/dashboard/buffer?token=<token>
Lista arquivos no buffer
```json
[
  {
    "fileName": "1234567890-uuid.json",
    "createdAt": "2024-12-08T10:30:00.000Z",
    "size": 15360,
    "productsCount": 100,
    "loadType": "delta",
    "data": { /* conteúdo do arquivo */ }
  }
]
```

### GET /v1/dashboard/products?token=<token>&page=1&limit=50
Lista produtos processados com paginação
```json
{
  "items": [
    {
      "id": 1,
      "pharmacyId": 1,
      "productId": 123,
      "title": "Dipirona 500mg",
      "ean": "7891234567890",
      "price": 12.50,
      "stock": 100,
      "isActive": true,
      "updatedAt": "2024-12-08T10:00:00.000Z",
      "pharmacy": {
        "cnpj": "12.345.678/0001-90",
        "name": "Farmácia Central"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 1500,
    "totalPages": 30
  }
}
```

## 🚀 Como Usar

### 1. Iniciar a Aplicação

**Desenvolvimento (com hot-reload):**
```bash
npm run start:dev
```

**Produção:**
```bash
npm run build
npm run start:prod
```

### 2. Acessar o Dashboard

1. Abra o navegador em `http://localhost:3002`
2. Você será redirecionado para `/login.html`
3. Digite a chave `INOVA_API_KEY` (a mesma configurada no `.env`)
4. Após autenticar, você verá o dashboard

### 3. Navegar pelo Dashboard

- **Visualizar Estatísticas**: Cards no topo mostram números gerais
- **Ver Arquivos no Buffer**: Clique na aba "Arquivos no Buffer"
  - Clique em "Ver Detalhes" para ver o JSON completo
- **Ver Produtos Processados**: Clique na aba "Produtos Processados"
  - Use os botões "Anterior" e "Próxima" para navegar entre páginas
- **Atualizar Dados**: Clique nos botões "Atualizar" ou aguarde o auto-refresh (30s)
- **Sair**: Clique no botão "Sair" no canto superior direito

## 🔐 Segurança

- **Autenticação**: Todas as rotas do dashboard exigem o token
- **Validação**: O token é validado em cada requisição
- **Timeout**: Se o token for inválido, o usuário é redirecionado para login
- **Proteção**: O `INOVA_API_KEY` nunca é exposto no frontend (apenas usado para autenticação)

## 🎨 Design

- Interface moderna e limpa
- Paleta de cores profissional (azul como cor primária)
- Responsivo (funciona em desktop, tablet e mobile)
- Feedback visual para todas as ações
- Animações suaves

## 📊 Dados Mostrados

### Arquivos no Buffer
- Nome do arquivo
- Data de criação
- Tipo de carga (full/delta)
- Quantidade de produtos
- Tamanho do arquivo
- Botão para ver detalhes completos (JSON)

### Produtos Processados
- ID do produto
- Nome e CNPJ da farmácia
- Título do produto
- Código EAN
- Preço (formatado em R$)
- Quantidade em estoque
- Status (Ativo/Inativo)
- Data da última atualização

## 🛠️ Tecnologias Utilizadas

### Frontend
- HTML5
- CSS3 (com CSS Variables)
- JavaScript (ES6+)
- Fetch API

### Backend
- NestJS
- TypeScript
- Prisma ORM
- PostgreSQL

## 📝 Notas Importantes

1. **Diretório Buffer**: Os arquivos do buffer são lidos do diretório configurado em `INOVAFARMA_BUFFER_DIR` (padrão: `.data/inovafarma-buffer`)

2. **Auto-refresh**: Os dados são atualizados automaticamente a cada 30 segundos

3. **Paginação**: A lista de produtos é paginada (50 por página) para melhor performance

4. **Cache**: O backend utiliza cache para otimizar consultas de produtos

5. **Validação de Token**: Todas as requisições validam o token antes de retornar dados

## 🐛 Troubleshooting

### Erro ao fazer login
- Verifique se o `INOVA_API_KEY` no `.env` está correto
- Certifique-se de que a aplicação está rodando

### Dados não aparecem no dashboard
- Verifique se o banco de dados tem dados
- Verifique se há arquivos no diretório buffer
- Abra o console do navegador para ver erros

### Token inválido
- Limpe o localStorage do navegador
- Faça login novamente

## ✅ Checklist de Implementação

- [x] Backend: Endpoints de autenticação
- [x] Backend: Endpoints para listar buffer
- [x] Backend: Endpoints para listar produtos
- [x] Backend: Endpoints para estatísticas
- [x] Backend: Configuração de arquivos estáticos
- [x] Frontend: Página de login
- [x] Frontend: Página de dashboard
- [x] Frontend: Sistema de autenticação
- [x] Frontend: Visualização de buffer
- [x] Frontend: Visualização de produtos
- [x] Frontend: Paginação
- [x] Frontend: Auto-refresh
- [x] Frontend: Design responsivo
- [x] Documentação completa
