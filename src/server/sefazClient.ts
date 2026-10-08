import https from 'https';
import tls from 'tls';
import zlib from 'zlib';
import crypto from 'crypto';
import forge from 'node-forge';
import { XMLParser } from 'fast-xml-parser';

export interface SefazDiagnosticTrace {
  timestamp: string;
  accessKeySent: string;
  serviceQueried: string;
  responseStatus: string;
  cStat?: string;
  xMotivo?: string;
  returnedKey?: string;
  returnedCnpj?: string;
  returnedInvoiceNumber?: string;
  returnedSeries?: string;
  itemsCount?: number;
  totalProductsValue?: number;
  totalInvoiceValue?: number;
  validationChecks: {
    keyMatches: boolean;
    cnpjMatches: boolean;
    numberMatches: boolean;
    seriesMatches: boolean;
    itemsValid: boolean;
  };
  isValid: boolean;
  errorMessage?: string;
}

export interface PfxExtractedCredentials {
  isValidPassphrase: boolean;
  certPem: string;
  keyPem: string;
  caPems: string[];
  subject: string;
  cnpj: string;
  issuer: string;
  validFrom: string;
  validTo: string;
  daysRemaining: number;
  isExpired: boolean;
}

export interface CertConfig {
  pfxPath?: string;
  pfxBuffer?: Buffer;
  passphrase?: string;
  certPem?: string;
  keyPem?: string;
  caPems?: string[];
  cnpj?: string;
  ufCode?: string;
}

export interface GatewayConfig {
  url?: string;
  token?: string;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  removeNSPrefix: true
});

/**
 * Remove qualquer caractere não numérico
 */
export const cleanDigits = (val: string): string => {
  return (val || '').replace(/\D/g, '');
};

/**
 * Decodifica campos estruturais dos 44 dígitos da chave de acesso
 */
export const decodeKeyStructure = (key: string) => {
  const clean = cleanDigits(key);
  if (clean.length !== 44) {
    throw new Error(`Chave de acesso inválida (${clean.length}/44 dígitos).`);
  }
  const ufCode = clean.slice(0, 2);
  const aamm = clean.slice(2, 6);
  const cnpj = clean.slice(6, 20);
  const model = clean.slice(20, 22);
  const series = String(parseInt(clean.slice(22, 25), 10));
  const invoiceNumber = String(parseInt(clean.slice(25, 34), 10));
  const emissionType = clean.slice(34, 35);
  const numericCode = clean.slice(35, 43);
  const dv = clean.slice(43, 44);

  return {
    cleanKey: clean,
    ufCode,
    aamm,
    cnpj,
    model,
    series,
    invoiceNumber,
    emissionType,
    numericCode,
    dv
  };
};

/**
 * Extrai credenciais (cert e chave privada) do arquivo PKCS#12 (.pfx / .p12)
 * Utiliza o motor 'node-forge' para compatibilidade total com os algoritmos legados (3DES, RC2)
 * comumente utilizados pelas Autoridades Certificadoras ICP-Brasil (Serasa, Certisign, Soluti, etc.),
 * contornando restrições do OpenSSL 3 padrão sem requerer flags externas.
 */
export const extractPfxCredentials = (pfxBuffer: Buffer, rawPassphrase: string): PfxExtractedCredentials => {
  if (!pfxBuffer || pfxBuffer.length === 0) {
    throw new Error('O arquivo de Certificado Digital (.pfx) está vazio ou corrompido.');
  }

  let p12Asn1: forge.asn1.Asn1;
  try {
    p12Asn1 = forge.asn1.fromDer(pfxBuffer.toString('binary'), false);
  } catch (e: any) {
    throw new Error('Arquivo PFX inválido ou corrompido: não foi possível interpretar a estrutura ASN.1.');
  }

  // Tenta com a senha exata e, se falhar, tenta com trim (caso haja espaço acidental copiado)
  const passphrasesToTry = [rawPassphrase];
  if (rawPassphrase && rawPassphrase.trim() !== rawPassphrase) {
    passphrasesToTry.push(rawPassphrase.trim());
  }

  let p12: any = null;
  let lastError: any = null;

  for (const pass of passphrasesToTry) {
    try {
      p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, pass);
      if (p12) break;
    } catch (e: any) {
      lastError = e;
    }
  }

  if (!p12) {
    const msg = (lastError && lastError.message) || '';
    if (msg.includes('MAC') || msg.includes('password') || msg.includes('verify') || msg.includes('Invalid')) {
      throw new Error('Senha do Certificado Digital incorreta. Verifique se a senha foi digitada corretamente (letras maiúsculas/minúsculas) e tente novamente.');
    }
    throw new Error(`Falha ao decifrar o Certificado Digital: ${msg || 'Senha incorreta ou formato PFX não reconhecido.'}`);
  }

  let certPem = '';
  let keyPem = '';
  const caPems: string[] = [];
  let mainCert: forge.pki.Certificate | null = null;

  for (const sci of p12.safeContents) {
    for (const bag of sci.safeBags) {
      if (bag.cert) {
        const pem = forge.pki.certificateToPem(bag.cert);
        if (!mainCert) {
          mainCert = bag.cert;
          certPem = pem;
        } else {
          caPems.push(pem);
        }
      }
      if (bag.key) {
        keyPem = forge.pki.privateKeyToPem(bag.key);
      }
    }
  }

  if (!certPem || !keyPem) {
    throw new Error('O arquivo PFX não contém par de certificado e chave privada válidos para autenticação mTLS.');
  }

  // Valida o par de chaves criando um contexto TLS seguro no Node
  try {
    tls.createSecureContext({
      cert: certPem,
      key: keyPem,
      ca: caPems.length > 0 ? caPems : undefined
    });
  } catch (tlsErr: any) {
    throw new Error(`Certificado ou chave privada incompatível: ${tlsErr.message}`);
  }

  let subject = 'Certificado Digital ICP-Brasil A1';
  let cnpj = '';
  let issuer = '';
  let validFrom = '';
  let validTo = '';
  let daysRemaining = 0;
  let isExpired = false;

  if (mainCert) {
    const cnAttr = mainCert.subject.attributes.find((a: any) => a.shortName === 'CN');
    const orgAttr = mainCert.subject.attributes.find((a: any) => a.shortName === 'O');
    if (cnAttr && cnAttr.value) {
      subject = String(cnAttr.value);
      // Extrair CNPJ ou CPF do CN se estiver no formato NOME EMPRESA:00000000000100
      const match = subject.match(/:(\d{11,14})$/);
      if (match) {
        cnpj = match[1];
      }
    } else if (orgAttr && orgAttr.value) {
      subject = String(orgAttr.value);
    }

    const issuerCn = mainCert.issuer.attributes.find((a: any) => a.shortName === 'CN');
    const issuerOrg = mainCert.issuer.attributes.find((a: any) => a.shortName === 'O');
    issuer = (issuerCn ? String(issuerCn.value) : (issuerOrg ? String(issuerOrg.value) : '')) || 'Autoridade Certificadora ICP-Brasil';

    const notAfter = mainCert.validity.notAfter;
    const notBefore = mainCert.validity.notBefore;
    if (notAfter) {
      validTo = notAfter.toLocaleDateString('pt-BR');
      const now = new Date();
      daysRemaining = Math.round((notAfter.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (daysRemaining < 0) {
        isExpired = true;
      }
    }
    if (notBefore) {
      validFrom = notBefore.toLocaleDateString('pt-BR');
    }
  }

  return {
    isValidPassphrase: true,
    certPem,
    keyPem,
    caPems,
    subject,
    cnpj,
    issuer,
    validFrom,
    validTo,
    daysRemaining,
    isExpired
  };
};

/**
 * Lê informações públicas do Certificado A1 (.pfx) sem expor chaves privadas
 */
export const inspectPfxCertificate = (pfxBuffer: Buffer, passphrase: string) => {
  return extractPfxCredentials(pfxBuffer, passphrase);
};

/**
 * Consulta a SEFAZ Nacional via Web Service NFeDistribuicaoDFe com mTLS
 */
export const querySefazNFeDistribuicao = async (
  accessKey: string,
  certConfig: { 
    certPem?: string; 
    keyPem?: string; 
    caPems?: string[]; 
    pfxBuffer?: Buffer; 
    passphrase?: string; 
    cnpj: string; 
    ufCode?: string 
  }
): Promise<{ xmlString: string; diagnostic: SefazDiagnosticTrace }> => {
  const decoded = decodeKeyStructure(accessKey);
  const cleanKey = decoded.cleanKey;
  const interestedCnpj = cleanDigits(certConfig.cnpj || decoded.cnpj);
  const ufAutor = certConfig.ufCode || decoded.ufCode || '35';

  const diagnostic: SefazDiagnosticTrace = {
    timestamp: new Date().toISOString(),
    accessKeySent: cleanKey,
    serviceQueried: 'SEFAZ Nacional - NFeDistribuicaoDFe (mTLS SOAP 1.2)',
    responseStatus: 'Iniciando requisição...',
    validationChecks: {
      keyMatches: false,
      cnpjMatches: false,
      numberMatches: false,
      seriesMatches: false,
      itemsValid: false
    },
    isValid: false
  };

  // Garante credenciais PEM (se vier pfxBuffer + passphrase, extrai)
  let certPem = certConfig.certPem || '';
  let keyPem = certConfig.keyPem || '';
  let caPems = certConfig.caPems || [];

  if (!certPem || !keyPem) {
    if (certConfig.pfxBuffer && certConfig.passphrase) {
      const extracted = extractPfxCredentials(certConfig.pfxBuffer, certConfig.passphrase);
      certPem = extracted.certPem;
      keyPem = extracted.keyPem;
      caPems = extracted.caPems;
    } else {
      throw new Error('Credenciais de Certificado Digital ausentes para autenticação mTLS.');
    }
  }

  // Monta o payload SOAP 1.2 oficial da SEFAZ
  const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">
      <nfeDadosMsg>
        <distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">
          <tpAmb>1</tpAmb>
          <cUFAutor>${ufAutor}</cUFAutor>
          <CNPJ>${interestedCnpj}</CNPJ>
          <consChNFe>
            <chNFe>${cleanKey}</chNFe>
          </consChNFe>
        </distDFeInt>
      </nfeDadosMsg>
    </nfeDistDFeInteresse>
  </soap12:Body>
</soap12:Envelope>`;

  // Configura o agente HTTPS com TLS mútuo (mTLS) usando as credenciais PEM
  const agent = new https.Agent({
    cert: certPem,
    key: keyPem,
    ca: caPems.length > 0 ? caPems : undefined,
    minVersion: 'TLSv1.2',
    rejectUnauthorized: false // Permite interoperabilidade com a cadeia ICP-Brasil da SEFAZ
  });

  return new Promise((resolve, reject) => {
    const postData = Buffer.from(soapEnvelope, 'utf-8');

    const options: https.RequestOptions = {
      hostname: 'www1.nfe.fazenda.gov.br',
      port: 443,
      path: '/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx',
      method: 'POST',
      agent,
      headers: {
        'Content-Type': 'application/soap+xml; charset=utf-8',
        'Content-Length': postData.length,
        'SOAPAction': 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse'
      },
      timeout: 15000
    };

    const req = https.request(options, (res) => {
      let responseBody = '';
      res.setEncoding('utf-8');

      res.on('data', (chunk) => {
        responseBody += chunk;
      });

      res.on('end', () => {
        diagnostic.responseStatus = `HTTP ${res.statusCode} ${res.statusMessage || ''}`;

        try {
          if (res.statusCode !== 200) {
            diagnostic.errorMessage = `Servidor SEFAZ retornou status HTTP ${res.statusCode}.`;
            return reject(new Error(diagnostic.errorMessage));
          }

          const parsedSoap = parser.parse(responseBody);
          const body = parsedSoap.Envelope?.Body || parsedSoap.Body;
          const distResult = body?.nfeDistDFeInteresseResponse?.nfeDistDFeInteresseResult?.retDistDFeInt 
            || body?.retDistDFeInt;

          if (!distResult) {
            diagnostic.errorMessage = 'Resposta da SEFAZ não contém o elemento retDistDFeInt esperado.';
            return reject(new Error(diagnostic.errorMessage));
          }

          diagnostic.cStat = String(distResult.cStat || '');
          diagnostic.xMotivo = String(distResult.xMotivo || '');

          // cStat 138 = Documento localizado para o interessado
          if (diagnostic.cStat !== '138') {
            diagnostic.errorMessage = `SEFAZ cStat ${diagnostic.cStat}: ${diagnostic.xMotivo || 'Nenhum documento localizado para este CNPJ e Chave.'}`;
            return reject(new Error(diagnostic.errorMessage));
          }

          const lote = distResult.loteDistDFeInt;
          let docZip = lote?.docZip;
          if (Array.isArray(docZip)) {
            docZip = docZip[0];
          }

          if (!docZip) {
            diagnostic.errorMessage = 'SEFAZ retornou cStat 138 mas o elemento docZip não foi encontrado no lote.';
            return reject(new Error(diagnostic.errorMessage));
          }

          const base64Data = typeof docZip === 'string' ? docZip : (docZip['#text'] || '');
          const compressedBuffer = Buffer.from(base64Data, 'base64');
          const uncompressedXml = zlib.gunzipSync(compressedBuffer).toString('utf-8');

          resolve({
            xmlString: uncompressedXml,
            diagnostic
          });
        } catch (parseErr: any) {
          diagnostic.errorMessage = `Erro ao decodificar resposta da SEFAZ: ${parseErr.message}`;
          reject(new Error(diagnostic.errorMessage));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      diagnostic.responseStatus = 'TIMEOUT';
      diagnostic.errorMessage = 'Tempo limite de resposta com os servidores da SEFAZ esgotado (15 segundos).';
      reject(new Error(diagnostic.errorMessage));
    });

    req.on('error', (netErr: any) => {
      diagnostic.responseStatus = 'ERRO DE REDE';
      diagnostic.errorMessage = `Falha na conexão mTLS com SEFAZ: ${netErr.message}`;
      reject(new Error(diagnostic.errorMessage));
    });

    req.write(postData);
    req.end();
  });
};

/**
 * Consulta via Gateway DF-e configurado (REST API)
 */
export const queryGatewayDF = async (
  accessKey: string,
  gatewayUrl: string,
  gatewayToken: string
): Promise<{ xmlString?: string; jsonData?: any; diagnostic: SefazDiagnosticTrace }> => {
  const decoded = decodeKeyStructure(accessKey);
  const cleanKey = decoded.cleanKey;

  const diagnostic: SefazDiagnosticTrace = {
    timestamp: new Date().toISOString(),
    accessKeySent: cleanKey,
    serviceQueried: `Gateway DF-e (${new URL(gatewayUrl).hostname})`,
    responseStatus: 'Iniciando chamada REST...',
    validationChecks: {
      keyMatches: false,
      cnpjMatches: false,
      numberMatches: false,
      seriesMatches: false,
      itemsValid: false
    },
    isValid: false
  };

  const cleanUrl = gatewayUrl.replace(/\/$/, '');
  const targetUrl = `${cleanUrl}/nfe/${cleanKey}`;

  const response = await fetch(targetUrl, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${gatewayToken}`,
      'Accept': 'application/json, application/xml, text/xml',
      'User-Agent': 'PTN-Estoque-NFe/1.0'
    }
  });

  diagnostic.responseStatus = `HTTP ${response.status} ${response.statusText}`;

  if (!response.ok) {
    const errorText = await response.text();
    diagnostic.errorMessage = `Gateway retornou erro HTTP ${response.status}: ${errorText.slice(0, 300)}`;
    throw new Error(diagnostic.errorMessage);
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('xml') || contentType.includes('text')) {
    const xml = await response.text();
    return { xmlString: xml, diagnostic };
  } else {
    const json = await response.json();
    if (json.xml) {
      return { xmlString: json.xml, diagnostic };
    }
    return { jsonData: json, diagnostic };
  }
};
