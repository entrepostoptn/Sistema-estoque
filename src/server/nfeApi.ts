import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { 
  cleanDigits, 
  decodeKeyStructure, 
  extractPfxCredentials,
  inspectPfxCertificate, 
  querySefazNFeDistribuicao, 
  queryGatewayDF,
  SefazDiagnosticTrace 
} from './sefazClient';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');
const CONFIG_FILE = path.join(DATA_DIR, 'nfe-server-config.json');
const CERT_FILE = path.join(DATA_DIR, 'cert.pfx');
const CERT_PEM_FILE = path.join(DATA_DIR, 'cert.pem');
const KEY_PEM_FILE = path.join(DATA_DIR, 'key.pem');
const CA_PEM_FILE = path.join(DATA_DIR, 'ca.pem');

const router = Router();

// Garante que a pasta de dados seguros existe
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

interface ServerNfeConfig {
  cnpj?: string;
  ufCode?: string;
  hasCert?: boolean;
  certSubject?: string;
  certValidTo?: string;
  certValidFrom?: string;
  certDaysRemaining?: number;
  certIssuer?: string;
  isExpired?: boolean;
  gatewayUrl?: string;
  hasGatewayToken?: boolean;
  lastUpdated?: string;
}

// Lê a configuração salva sem expor senhas
const loadConfig = (): ServerNfeConfig => {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error('Erro ao ler nfe-server-config.json:', e);
  }
  return {};
};

// Lê segredos e credenciais do disco
const loadSecrets = () => {
  const config = loadConfig();
  let passphrase = process.env.NFE_CERT_PASSWORD || '';
  let gatewayToken = process.env.NFE_GATEWAY_TOKEN || '';
  let cnpj = process.env.NFE_INTERESTED_CNPJ || config.cnpj || '';
  let gatewayUrl = process.env.NFE_GATEWAY_URL || config.gatewayUrl || '';

  // Se houver arquivo com senha criptografada/local
  const secretsFile = path.join(DATA_DIR, 'secrets.json');
  if (fs.existsSync(secretsFile)) {
    try {
      const sec = JSON.parse(fs.readFileSync(secretsFile, 'utf-8'));
      if (sec.passphrase) passphrase = sec.passphrase;
      if (sec.gatewayToken) gatewayToken = sec.gatewayToken;
    } catch {}
  }

  let pfxBuffer: Buffer | null = null;
  const certPath = process.env.NFE_CERT_PATH || CERT_FILE;
  if (fs.existsSync(certPath)) {
    try {
      pfxBuffer = fs.readFileSync(certPath);
    } catch (e) {
      console.error('Erro ao ler arquivo de certificado:', e);
    }
  }

  let certPem = '';
  let keyPem = '';
  let caPems: string[] = [];

  if (fs.existsSync(CERT_PEM_FILE) && fs.existsSync(KEY_PEM_FILE)) {
    try {
      certPem = fs.readFileSync(CERT_PEM_FILE, 'utf-8');
      keyPem = fs.readFileSync(KEY_PEM_FILE, 'utf-8');
      if (fs.existsSync(CA_PEM_FILE)) {
        caPems = fs.readFileSync(CA_PEM_FILE, 'utf-8').split(/(?=-----BEGIN CERTIFICATE-----)/g).filter(Boolean);
      }
    } catch (e) {
      console.error('Erro ao ler arquivos PEM de certificado:', e);
    }
  }

  // Se não tem PEMs mas tem PFX e passphrase, extrai dinamicamente
  if ((!certPem || !keyPem) && pfxBuffer && passphrase) {
    try {
      const extracted = extractPfxCredentials(pfxBuffer, passphrase);
      certPem = extracted.certPem;
      keyPem = extracted.keyPem;
      caPems = extracted.caPems;
      fs.writeFileSync(CERT_PEM_FILE, certPem, 'utf-8');
      fs.writeFileSync(KEY_PEM_FILE, keyPem, 'utf-8');
      if (caPems.length > 0) {
        fs.writeFileSync(CA_PEM_FILE, caPems.join('\n'), 'utf-8');
      }
    } catch (e) {
      console.warn('Tentativa de auto-extração PEM do PFX falhou:', e);
    }
  }

  return {
    pfxBuffer,
    passphrase,
    certPem,
    keyPem,
    caPems,
    cnpj: cleanDigits(cnpj),
    gatewayUrl,
    gatewayToken,
    ufCode: config.ufCode || '35'
  };
};

/**
 * GET /api/nfe/status
 * Retorna o status atual dos serviços de consulta e certificado (sem expor segredos)
 */
router.get('/status', (req: Request, res: Response) => {
  const config = loadConfig();
  const secrets = loadSecrets();
  const hasCert = (!!secrets.certPem && !!secrets.keyPem) || (!!secrets.pfxBuffer && !!secrets.passphrase);

  res.json({
    hasCertificate: hasCert,
    certSubject: config.certSubject || (hasCert ? 'Certificado A1 Carregado' : undefined),
    certValidTo: config.certValidTo,
    certValidFrom: config.certValidFrom,
    certDaysRemaining: config.certDaysRemaining,
    certIssuer: config.certIssuer,
    isExpired: config.isExpired,
    cnpj: config.cnpj || secrets.cnpj,
    hasGateway: !!secrets.gatewayUrl && !!secrets.gatewayToken,
    gatewayUrl: config.gatewayUrl,
    architectureInfo: {
      type: 'SEFAZ mTLS Backend Proxy',
      note: 'Autenticação com Certificado Digital A1 executada no servidor Node.js seguro com mTLS e PEM, protegendo senhas e chaves privadas.'
    }
  });
});

/**
 * POST /api/nfe/configurar-certificado
 * Salva certificado A1 (.pfx) e senha com validação imediata e extração PEM
 */
router.post('/configurar-certificado', (req: Request, res: Response) => {
  try {
    const { pfxBase64, passphrase, cnpj, ufCode } = req.body;

    if (!pfxBase64 || !passphrase) {
      return res.status(400).json({ error: 'Arquivo PFX em base64 e senha são obrigatórios.' });
    }

    const cleanBase64 = String(pfxBase64).replace(/^data:.*?;base64,/, '').replace(/\s+/g, '');
    const pfxBuffer = Buffer.from(cleanBase64, 'base64');
    
    // Valida o certificado e a senha antes de salvar usando o motor node-forge
    const certInfo = extractPfxCredentials(pfxBuffer, passphrase);

    // Salva o arquivo .pfx e os arquivos PEM desacoplados
    fs.writeFileSync(CERT_FILE, pfxBuffer);
    fs.writeFileSync(CERT_PEM_FILE, certInfo.certPem, 'utf-8');
    fs.writeFileSync(KEY_PEM_FILE, certInfo.keyPem, 'utf-8');
    if (certInfo.caPems && certInfo.caPems.length > 0) {
      fs.writeFileSync(CA_PEM_FILE, certInfo.caPems.join('\n'), 'utf-8');
    } else if (fs.existsSync(CA_PEM_FILE)) {
      try { fs.unlinkSync(CA_PEM_FILE); } catch {}
    }

    // Salva a senha no arquivo de segredos protegido
    const secretsFile = path.join(DATA_DIR, 'secrets.json');
    const existingSecrets = fs.existsSync(secretsFile) 
      ? JSON.parse(fs.readFileSync(secretsFile, 'utf-8')) 
      : {};
    
    existingSecrets.passphrase = passphrase;
    fs.writeFileSync(secretsFile, JSON.stringify(existingSecrets, null, 2), { mode: 0o600 });

    // Salva configuração pública
    const config: ServerNfeConfig = {
      ...loadConfig(),
      hasCert: true,
      cnpj: cleanDigits(cnpj || certInfo.cnpj || ''),
      ufCode: ufCode || '35',
      certSubject: certInfo.subject,
      certValidTo: certInfo.validTo,
      certValidFrom: certInfo.validFrom,
      certDaysRemaining: certInfo.daysRemaining,
      certIssuer: certInfo.issuer,
      isExpired: certInfo.isExpired,
      lastUpdated: new Date().toISOString()
    };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));

    res.json({
      success: true,
      message: `Certificado Digital A1 validado e configurado com sucesso! Titular: ${certInfo.subject}`,
      certInfo
    });
  } catch (err: any) {
    console.error('Erro ao configurar certificado:', err);
    res.status(400).json({ error: err.message || 'Erro ao validar ou salvar certificado.' });
  }
});

/**
 * POST /api/nfe/configurar-gateway
 * Salva endpoint e token de Gateway DF-e
 */
router.post('/configurar-gateway', (req: Request, res: Response) => {
  try {
    const { gatewayUrl, gatewayToken } = req.body;
    if (!gatewayUrl) {
      return res.status(400).json({ error: 'URL do Gateway é obrigatória.' });
    }

    const secretsFile = path.join(DATA_DIR, 'secrets.json');
    const existingSecrets = fs.existsSync(secretsFile) 
      ? JSON.parse(fs.readFileSync(secretsFile, 'utf-8')) 
      : {};
    
    if (gatewayToken) {
      existingSecrets.gatewayToken = gatewayToken;
      fs.writeFileSync(secretsFile, JSON.stringify(existingSecrets, null, 2), { mode: 0o600 });
    }

    const config: ServerNfeConfig = {
      ...loadConfig(),
      gatewayUrl,
      hasGatewayToken: !!existingSecrets.gatewayToken,
      lastUpdated: new Date().toISOString()
    };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));

    res.json({
      success: true,
      message: 'Gateway DF-e configurado com sucesso!'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Erro ao salvar configuração do Gateway.' });
  }
});

/**
 * DELETE /api/nfe/remover-certificado
 * Remove o certificado configurado
 */
router.delete('/remover-certificado', (req: Request, res: Response) => {
  try {
    if (fs.existsSync(CERT_FILE)) fs.unlinkSync(CERT_FILE);
    if (fs.existsSync(CERT_PEM_FILE)) fs.unlinkSync(CERT_PEM_FILE);
    if (fs.existsSync(KEY_PEM_FILE)) fs.unlinkSync(KEY_PEM_FILE);
    if (fs.existsSync(CA_PEM_FILE)) fs.unlinkSync(CA_PEM_FILE);
    
    const secretsFile = path.join(DATA_DIR, 'secrets.json');
    if (fs.existsSync(secretsFile)) {
      const sec = JSON.parse(fs.readFileSync(secretsFile, 'utf-8'));
      delete sec.passphrase;
      fs.writeFileSync(secretsFile, JSON.stringify(sec, null, 2));
    }
    const config = loadConfig();
    delete config.hasCert;
    delete config.certSubject;
    delete config.certValidTo;
    delete config.certValidFrom;
    delete config.certDaysRemaining;
    delete config.certIssuer;
    delete config.isExpired;
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));

    res.json({ success: true, message: 'Certificado removido do servidor com sucesso.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Erro ao remover certificado.' });
  }
});

/**
 * POST /api/nfe/consultar
 * Consulta Oficial da NF-e por Chave de Acesso via SEFAZ ou Gateway com Validação Absoluta
 */
router.post('/consultar', async (req: Request, res: Response) => {
  const { accessKey } = req.body;
  const cleanKey = cleanDigits(accessKey);

  if (!cleanKey || cleanKey.length !== 44) {
    return res.status(400).json({
      success: false,
      error: `Chave de acesso inválida (${cleanKey?.length || 0}/44 dígitos). Informe os 44 dígitos exatos.`
    });
  }

  const decoded = decodeKeyStructure(cleanKey);
  const secrets = loadSecrets();
  const hasCert = (!!secrets.certPem && !!secrets.keyPem) || (!!secrets.pfxBuffer && !!secrets.passphrase);

  const diagnostic: SefazDiagnosticTrace = {
    timestamp: new Date().toISOString(),
    accessKeySent: cleanKey,
    serviceQueried: 'Nenhum serviço configurado',
    responseStatus: 'Iniciando',
    validationChecks: {
      keyMatches: false,
      cnpjMatches: false,
      numberMatches: false,
      seriesMatches: false,
      itemsValid: false
    },
    isValid: false
  };

  // 1. Tentar SEFAZ Nacional via mTLS se houver certificado A1 configurado
  if (hasCert) {
    try {
      diagnostic.serviceQueried = 'SEFAZ Nacional - NFeDistribuicaoDFe (mTLS)';
      const result = await querySefazNFeDistribuicao(cleanKey, {
        certPem: secrets.certPem,
        keyPem: secrets.keyPem,
        caPems: secrets.caPems,
        pfxBuffer: secrets.pfxBuffer || undefined,
        passphrase: secrets.passphrase,
        cnpj: secrets.cnpj || decoded.cnpj,
        ufCode: secrets.ufCode
      });

      return res.json({
        success: true,
        source: 'SEFAZ_DISTRIBUICAO_DFE',
        xmlString: result.xmlString,
        diagnostic: result.diagnostic
      });
    } catch (sefazErr: any) {
      diagnostic.errorMessage = sefazErr.message || 'Erro ao consultar SEFAZ Nacional.';
      diagnostic.responseStatus = 'FALHA SEFAZ';
      console.warn('Falha na consulta direta à SEFAZ:', sefazErr.message);

      // Se falhou e NÃO há Gateway configurado, falha imediatamente
      if (!secrets.gatewayUrl) {
        return res.status(422).json({
          success: false,
          error: `Não foi possível consultar a NF-e na SEFAZ: ${sefazErr.message}. Nenhum dado aproximado será utilizado.`,
          diagnostic
        });
      }
    }
  }

  // 2. Tentar Gateway DF-e se configurado
  if (secrets.gatewayUrl && secrets.gatewayToken) {
    try {
      diagnostic.serviceQueried = `Gateway DF-e (${secrets.gatewayUrl})`;
      const gwResult = await queryGatewayDF(cleanKey, secrets.gatewayUrl, secrets.gatewayToken);

      return res.json({
        success: true,
        source: 'GATEWAY_DFE',
        xmlString: gwResult.xmlString,
        jsonData: gwResult.jsonData,
        diagnostic: gwResult.diagnostic
      });
    } catch (gwErr: any) {
      diagnostic.errorMessage = gwErr.message;
      diagnostic.responseStatus = 'FALHA GATEWAY';
      console.warn('Falha na consulta via Gateway:', gwErr.message);

      return res.status(422).json({
        success: false,
        error: `Não foi possível consultar a NF-e no Gateway: ${gwErr.message}. Nenhum dado aproximado será utilizado.`,
        diagnostic
      });
    }
  }

  // 3. Nenhum canal de consulta oficial configurado
  diagnostic.responseStatus = 'SEM CONFIGURAÇÃO';
  diagnostic.errorMessage = 'Certificado Digital A1 (.pfx) ou Gateway DF-e não configurado no servidor.';
  
  return res.status(503).json({
    success: false,
    error: 'Certificado Digital A1 ou Gateway de Consulta DF-e não configurado no servidor. Configure o Certificado Digital no botão "Configurações da NF-e / Certificado". Nenhum dado aproximado será utilizado.',
    diagnostic
  });
});

/**
 * POST /api/nfe/diagnostico
 * Executa o teste de diagnóstico completo da chave e das credenciais
 */
router.post('/diagnostico', async (req: Request, res: Response) => {
  const { accessKey } = req.body;
  const cleanKey = cleanDigits(accessKey);
  const secrets = loadSecrets();
  const hasCert = (!!secrets.certPem && !!secrets.keyPem) || (!!secrets.pfxBuffer && !!secrets.passphrase);

  const diagnostic: SefazDiagnosticTrace = {
    timestamp: new Date().toISOString(),
    accessKeySent: cleanKey || '(vazio)',
    serviceQueried: hasCert ? 'SEFAZ Nacional (mTLS)' : (secrets.gatewayUrl ? 'Gateway DF-e' : 'Nenhum serviço ativo'),
    responseStatus: 'Verificando estrutura...',
    validationChecks: {
      keyMatches: false,
      cnpjMatches: false,
      numberMatches: false,
      seriesMatches: false,
      itemsValid: false
    },
    isValid: false
  };

  if (!cleanKey || cleanKey.length !== 44) {
    diagnostic.errorMessage = `Chave informada possui ${cleanKey.length} dígitos (esperado: 44).`;
    diagnostic.responseStatus = 'CHAVE INVÁLIDA';
    return res.json({ diagnostic, certStatus: { hasCert, hasGateway: !!secrets.gatewayUrl } });
  }

  try {
    const decoded = decodeKeyStructure(cleanKey);
    diagnostic.returnedKey = cleanKey;
    diagnostic.returnedCnpj = decoded.cnpj;
    diagnostic.returnedInvoiceNumber = decoded.invoiceNumber;
    diagnostic.returnedSeries = decoded.series;

    if (!hasCert && !secrets.gatewayUrl) {
      diagnostic.responseStatus = 'SERVIÇO NÃO CONFIGURADO';
      diagnostic.errorMessage = 'Nenhum Certificado Digital A1 ou Gateway DF-e foi configurado no servidor ainda.';
      return res.json({ diagnostic, certStatus: { hasCert: false, hasGateway: false } });
    }

    if (hasCert) {
      try {
        const result = await querySefazNFeDistribuicao(cleanKey, {
          certPem: secrets.certPem,
          keyPem: secrets.keyPem,
          caPems: secrets.caPems,
          pfxBuffer: secrets.pfxBuffer || undefined,
          passphrase: secrets.passphrase,
          cnpj: secrets.cnpj || decoded.cnpj,
          ufCode: secrets.ufCode
        });
        return res.json({
          diagnostic: result.diagnostic,
          certStatus: { hasCert: true, hasGateway: !!secrets.gatewayUrl },
          rawXmlFound: !!result.xmlString
        });
      } catch (err: any) {
        diagnostic.responseStatus = 'ERRO SEFAZ';
        diagnostic.errorMessage = err.message;
        return res.json({ diagnostic, certStatus: { hasCert: true, hasGateway: !!secrets.gatewayUrl } });
      }
    }

    if (secrets.gatewayUrl && secrets.gatewayToken) {
      try {
        const gwResult = await queryGatewayDF(cleanKey, secrets.gatewayUrl, secrets.gatewayToken);
        return res.json({
          diagnostic: gwResult.diagnostic,
          certStatus: { hasCert: false, hasGateway: true }
        });
      } catch (err: any) {
        diagnostic.responseStatus = 'ERRO GATEWAY';
        diagnostic.errorMessage = err.message;
        return res.json({ diagnostic, certStatus: { hasCert: false, hasGateway: true } });
      }
    }

    return res.json({ diagnostic, certStatus: { hasCert: false, hasGateway: false } });
  } catch (err: any) {
    diagnostic.errorMessage = err.message;
    diagnostic.responseStatus = 'ERRO GERAL';
    return res.json({ diagnostic, certStatus: { hasCert: !!secrets.pfxBuffer, hasGateway: !!secrets.gatewayUrl } });
  }
});

export default router;
