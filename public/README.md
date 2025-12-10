# IntegraHub Dashboard

## Frontend de Monitoramento

Este diretório contém o frontend do IntegraHub Dashboard, uma interface web para monitorar os dados que chegam na API.

### Funcionalidades

1. **Tela de Login**: Autenticação usando a chave `INOVA_SECRET` do arquivo `.env`
2. **Dashboard**: Visualização dos dados em duas seções:
   - **Arquivos no Buffer**: Mostra os arquivos JSON que estão aguardando processamento no diretório buffer
   - **Produtos Processados**: Mostra os produtos que já foram processados e salvos no banco de dados

### Estrutura dos Arquivos

- `login.html` - Página de login
- `dashboard.html` - Página principal do dashboard
- `login.js` - Lógica de autenticação
- `dashboard.js` - Lógica do dashboard (carregamento de dados, paginação, etc.)
- `styles.css` - Estilos CSS para todas as páginas
- `index.html` - Redirecionamento para a página de login

### Como Usar

1. **Iniciar a aplicação**:
   ```bash
   npm run start:dev
   ```

2. **Acessar o dashboard**:
   - Abra o navegador em `http://localhost:3002`
   - Você será redirecionado para a página de login
   - Digite a chave `INOVA_SECRET` (a mesma que está no arquivo `.env`)
   - Após autenticar, você verá o dashboard com:
     - Estatísticas gerais (total de produtos, farmácias, etc.)
     - Aba "Arquivos no Buffer" mostrando os arquivos JSON pendentes
     - Aba "Produtos Processados" mostrando os produtos salvos no banco

### Endpoints da API

O dashboard consome os seguintes endpoints:

- `POST /v1/dashboard/auth` - Autenticação
- `GET /v1/dashboard/stats` - Estatísticas gerais
- `GET /v1/dashboard/buffer` - Lista de arquivos no buffer
- `GET /v1/dashboard/products` - Lista de produtos processados (com paginação)

### Funcionalidades do Dashboard

- **Auto-refresh**: Os dados são atualizados automaticamente a cada 30 segundos
- **Paginação**: A lista de produtos suporta navegação entre páginas
- **Modal de Detalhes**: Clique em "Ver Detalhes" nos arquivos do buffer para ver o conteúdo JSON completo
- **Filtros visuais**: Status dos produtos (ativo/inativo), tipo de carga (full/delta)

### Segurança

- A autenticação é feita usando a chave `INOVA_SECRET`
- O token é armazenado no `localStorage` do navegador
- Todas as requisições verificam o token antes de retornar dados
- Se o token for inválido, o usuário é redirecionado para a tela de login

### Tecnologias Utilizadas

- HTML5
- CSS3 (com variáveis CSS personalizadas)
- JavaScript (ES6+)
- Fetch API para comunicação com o backend
