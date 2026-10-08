/**
 * Production Server for Hostinger Node.js Applications (VPS, Cloud or cPanel/hPanel)
 * 
 * Serves the compiled Vite React frontend from the 'dist' directory with
 * full Single Page Application (SPA) routing support and health checks.
 */

import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const distPath = path.resolve(__dirname, 'dist');

// Middleware: disable x-powered-by header
app.disable('x-powered-by');

// Health-check endpoint for Hostinger load balancers & monitoring
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'online', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime() 
  });
});

// Check if dist folder exists
if (fs.existsSync(distPath)) {
  // Serve static assets with caching
  app.use(express.static(distPath, {
    maxAge: '1y',
    immutable: true,
    index: false,
    setHeaders: (res, filePath) => {
      // Don't cache index.html
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      }
    }
  }));

  // Fallback to index.html for React SPA Router
  app.get('*', (req, res) => {
    const indexPath = path.join(distPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).send('index.html não encontrado no diretório dist. Execute "npm run build".');
    }
  });
} else {
  // If dist doesn't exist yet, guide the administrator
  app.get('*', (req, res) => {
    res.status(503).send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>Construção Necessária - Hostinger</title>
        <style>
          body { font-family: sans-serif; background: #0f172a; color: #fff; padding: 40px; text-align: center; }
          .card { max-width: 600px; margin: 0 auto; background: #1e293b; padding: 30px; border-radius: 12px; }
          code { background: #334155; padding: 4px 8px; border-radius: 4px; color: #38bdf8; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>Pasta "dist" não encontrada</h2>
          <p>Para inicializar a aplicação na Hostinger, execute o comando de build:</p>
          <p><code>npm run build</code></p>
          <p style="font-size: 13px; color: #94a3b8; margin-top: 20px;">
            Depois de concluído, o sistema carregará automaticamente.
          </p>
        </div>
      </body>
      </html>
    `);
  });
}

// Start the server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(`🚀 Sistema de Estoque e Romaneios rodando com sucesso!`);
  console.log(`📡 Porta: ${PORT}`);
  console.log(`🌐 Ambiente: ${process.env.NODE_ENV || 'production'}`);
  console.log(`📂 Pasta estática: ${distPath}`);
  console.log(`=======================================================`);
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('Recebido SIGTERM, encerrando servidor graciosamente...');
  server.close(() => {
    console.log('Servidor finalizado.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('Recebido SIGINT, encerrando servidor...');
  server.close(() => {
    process.exit(0);
  });
});
