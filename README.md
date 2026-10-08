# Sistema de Controle de Estoque e Romaneios

Sistema profissional para gestão de estoque frigorífico/distribuição com controle por **caixas e peso em kg**, emissão de **romaneios de saída com múltiplas lojas destinatárias**, entrada de notas fiscais, impressão oficial, balancete de estoque e histórico com auditoria.

---

## 🚀 Como Rodar Fora do Ambiente do Google

Esta aplicação foi desenvolvida e adaptada para funcionar de forma **100% autônoma e independente**, podendo ser executada em qualquer computador (Windows, Mac ou Linux), rede interna, servidor VPS ou serviço de hospedagem web (Vercel, Netlify, Docker).

### Opção 1: Execução Local no seu Computador (Windows / Linux / Mac)

#### Requisitos:
- **Node.js** (versão 18 ou superior instalada). Baixe em [nodejs.org](https://nodejs.org).

#### Passo a Passo:
1. Extraia os arquivos do projeto em uma pasta do seu computador.
2. Abra o terminal (Prompt de Comando ou PowerShell no Windows, ou Terminal no Linux/Mac) dentro da pasta do projeto.
3. Instale as dependências:
   ```bash
   npm install
   ```
4. Inicie o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```
5. Acesse no navegador:
   ```
   http://localhost:3000
   ```

---

### Opção 2: Gerar Versão para Produção (Hospedagem Web / Servidor)

Para publicar em servidores como Apache, Nginx, Vercel, Netlify ou Render:
1. No terminal do projeto, execute o comando de compilação:
   ```bash
   npm run build
   ```
2. A pasta `dist` será gerada com os arquivos estáticos e otimizados prontos para servir.
3. Você pode testar localmente com:
   ```bash
   npx serve -s dist
   ```

---

### Opção 3: Modo 100% Offline (Sem Nenhuma Dependência do Google / Firebase)

O sistema possui o **Modo Local Autônomo**:
- Não necessita de internet ou conta no Google.
- Todos os produtos, lojas, notas, romaneios e saldos de estoque são gravados no armazenamento local do navegador do dispositivo (`LocalStorage / IndexedDB`).
- Para ativar:
  1. No sistema, clique na aba **Configurações**.
  2. Na seção **Execução Fora do Ambiente do Google**, selecione **"Modo Local Autônomo (100% Offline / Sem Google)"**.
  3. O sistema funcionará com velocidade máxima e zero chamadas de rede externas.

---

### 📦 Backup e Restauração de Dados (Portabilidade Total)

Você pode migrar ou salvar todos os dados da empresa a qualquer momento:
1. Acesse a aba **Configurações**.
2. Clique em **"📥 Exportar Backup (JSON)"** para baixar um arquivo completo com todos os dados.
3. Em outro computador ou navegador, clique em **"📤 Restaurar Backup (JSON)"** e selecione o arquivo para carregar todos os registros imediatamente.

---

### 🔑 Usuários e Senhas de Acesso

| Usuário | Nome | Senha | Nível de Acesso |
| :--- | :--- | :--- | :--- |
| **admin** | **Admin Geral** | `130115` | **Acesso Total:** auditoria, configurações e exclusão definitiva |
| **paloma** | **Paloma** | `patanegra@10` | **Operacional:** estoque, notas e romaneios |
| **user** | **User** | `patanegra10@` | **Operacional:** estoque, notas e romaneios |

---

### ⚙️ Usar com seu Próprio Firebase (Opcional)

Se desejar usar a Nuvem com sua própria conta do Firebase (fora do Google AI Studio):
1. Crie um arquivo `.env` na raiz do projeto baseado no `.env.example`:
   ```bash
   VITE_FIREBASE_API_KEY="sua-api-key"
   VITE_FIREBASE_PROJECT_ID="seu-project-id"
   VITE_FIREBASE_AUTH_DOMAIN="seu-project-id.firebaseapp.com"
   ```
2. Ou insira as credenciais diretamente na tela de **Configurações** clicando em *"Configurar Chaves do Firebase Próprio"*.
