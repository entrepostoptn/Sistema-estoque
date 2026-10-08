import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import nfeRouter from './src/server/nfeApi';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const distPath = path.resolve(__dirname, 'dist');
const isProduction = process.env.NODE_ENV === 'production';

// Middleware: desabilita x-powered-by
app.disable('x-powered-by');

// Middlewares para parsing de JSON e arquivos em Base64 (Certificado PFX)
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Health-check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'online', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: isProduction ? 'production' : 'development'
  });
});

// Rotas da API de NF-e, Certificados Digitais e Diagnóstico
app.use('/api/nfe', nfeRouter);

// Configuração do Vite em Desenvolvimento vs Produção
async function startServer() {
  if (!isProduction) {
    // Modo de Desenvolvimento com Vite Middleware
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        host: '0.0.0.0',
        port: PORT
      },
      appType: 'spa'
    });
    app.use(vite.middlewares);
    console.log('⚡ Vite middlewares montados com sucesso em ambiente de desenvolvimento.');
  } else {
    // Modo de Produção: serve os estáticos compilados em dist/
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath, {
        maxAge: '1y',
        immutable: true,
        index: false,
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          }
        }
      }));

      app.get('*', (req, res) => {
        const indexPath = path.join(distPath, 'index.html');
        if (fs.existsSync(indexPath)) {
          res.sendFile(indexPath);
        } else {
          res.status(404).send('index.html não encontrado no diretório dist. Execute "npm run build".');
        }
      });
    } else {
      app.get('*', (req, res) => {
        res.status(503).send('Aplicação compilando ou aguardando build.');
      });
    }
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`=======================================================`);
    console.log(`🚀 Sistema de Estoque e Romaneios rodando com sucesso!`);
    console.log(`📡 Porta: ${PORT}`);
    console.log(`🌐 Ambiente: ${isProduction ? 'production' : 'development'}`);
    console.log(`📡 API NF-e & Certificado Digital ativa em /api/nfe/*`);
    console.log(`=======================================================`);
  });

  process.on('SIGTERM', () => {
    server.close(() => {
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    server.close(() => {
      process.exit(0);
    });
  });
}

startServer().catch((err) => {
  console.error('Erro fatal ao iniciar servidor:', err);
  process.exit(1);
});
