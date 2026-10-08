# Guia Definitivo de Deploy na Hostinger (100% Fora do Ambiente Google)

Este guia resolve todos os erros comuns de deploy na Hostinger para o **Sistema de Controle de Estoque e Romaneios**.

A aplicação foi adaptada para funcionar de duas formas na Hostinger:
- **Método 1 (Recomendado & Mais Simples):** Hospedagem de Sites / Cloud (Arquivos Estáticos no `public_html`).
- **Método 2:** Aplicação Node.js no hPanel ou VPS.

---

## 🚀 Método 1: Hospedagem Web Hostinger (`public_html`) — O Mais Rápido

Este método **não exige Node.js rodando no servidor**, utiliza os servidores ultrarrápidos LiteSpeed da Hostinger e custa zero consumo de memória RAM.

### Passo 1: Gerar a pasta de publicação (`dist`)
No seu computador ou terminal, execute:
```bash
npm install
npm run build
```
Isso criará uma pasta chamada `dist/`. Dentro dela já estarão:
- `index.html`
- `assets/` (arquivos JS e CSS otimizados)
- `.htaccess` (configuração do Apache/LiteSpeed com suporte a rotas SPA e tipos MIME corretos)

### Passo 2: Fazer o Upload para a Hostinger
1. Acesse o **hPanel** da Hostinger.
2. Vá em **Sites** -> clique em **Gerenciar** no seu domínio.
3. No menu lateral, clique em **Gerenciador de Arquivos** (File Manager) -> Acesse os arquivos de `public_html`.
4. Envie o conteúdo que está **DENTRO** da pasta `dist/` diretamente para a `public_html`:
   - Envie o `index.html`
   - Envie a pasta `assets/`
   - Envie o arquivo `.htaccess` (Certifique-se de habilitar "Mostrar arquivos ocultos/dotfiles" no gerenciador)
5. Acesse o seu domínio (ex: `https://seudominio.com.br`).

### ✅ O que foi corrigido para evitar erros no Método 1:
1. **Erro de tela branca (404 em assets):** O `vite.config.ts` agora utiliza caminhos relativos (`base: './'`). Você pode colocar os arquivos na raiz da `public_html` ou em subpastas (como `public_html/estoque/`).
2. **Erro 404 ao atualizar a página:** O arquivo `.htaccess` incluído na pasta `public/` é gerado automaticamente na `dist/` e gerencia as rotas do React SPA.
3. **Erro de MIME Type (`Failed to load module script`):** O `.htaccess` declara expressamente os tipos MIME de `.js` e `.mjs` como `application/javascript`.

---

## ⚡ Método 2: Hostinger Aplicação Node.js (hPanel ou VPS)

Se você utiliza o recurso **Aplicativo Node.js** da Hostinger:

### Passo 1: Configurar a Aplicação no painel da Hostinger
No hPanel da Hostinger, na seção **Avançado** -> **Node.js**:
- **Versão do Node.js:** Selecione `Node 20.x` ou `Node 18.x`
- **Ambiente da Aplicação (App Environment):** `production`
- **Diretório raiz da aplicação (Application Root):** `/`
- **Arquivo de inicialização (Application Startup File):** `server.js`

### Passo 2: Variáveis de Ambiente (Opcional)
Se desejar rodar em modo 100% offline local sem Google:
```env
VITE_STORAGE_MODE=local
PORT=3000
```
Se desejar conectar ao seu próprio Firebase:
```env
VITE_STORAGE_MODE=firebase
VITE_FIREBASE_API_KEY=sua-api-key-do-firebase
VITE_FIREBASE_PROJECT_ID=seu-projeto-firebase
```

### Passo 3: Executar a Instalação e Build
Pelo terminal SSH ou console da Hostinger:
```bash
npm install
npm run build
npm start
```
O arquivo `server.js` incluído no projeto iniciará um servidor Express de alta performance servindo a pasta `dist/` com fallback para `index.html` e monitoramento de saúde na rota `/health`.

---

## 🔐 Como Funciona Fora do Ambiente Google

1. **Modo Local Autônomo Ativado Automaticamente:**
   Ao rodar fora do ambiente do Google AI Studio (na Hostinger ou em qualquer domínio próprio), o sistema detecta que está fora do sandbox do Google e entra automaticamente em **Modo Local Autônomo (100% Offline)**.
2. **Sem dependência de API do Google ou Firebase Cloud:**
   - Todo o cadastro de produtos, fornecedores, lojas, notas fiscais, romaneios com múltiplas lojas, balanceamento de estoque e logs de auditoria é armazenado de forma persistente e segura no navegador.
   - O login dos usuários padrão autorizados funciona imediatamente:
     - **Admin Geral:** usuário `admin` | senha `130115`
     - **Paloma:** usuário `paloma` | senha `patanegra@10`
     - **User:** usuário `user` | senha `patanegra10@`
3. **Backup e Exportação de Dados:**
   No menu **Configurações**, você tem os botões:
   - **Exportar Backup Completo (JSON):** baixa todo o banco de dados local em arquivo seguro para cópia de segurança.
   - **Importar Backup (JSON):** restaura todos os dados a qualquer momento em outro computador ou navegador.
   - **Troca de Modo:** Se um dia desejar ligar um projeto próprio do Firebase, basta ir em Configurações e colar as chaves do seu Firebase Console.
