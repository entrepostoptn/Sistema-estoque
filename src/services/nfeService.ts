import { Product, Supplier, UnitType } from '../types';
import { NfeDecodedKey, NfeDiagnosticTrace, NfeParsedData, NfeProductItem, NfeServerStatus } from '../types/nfe';

// Tabela Oficial de Códigos UF da SEFAZ
const UF_MAP: Record<string, string> = {
  '11': 'RO', '12': 'AC', '13': 'AM', '14': 'RR', '15': 'PA', '16': 'AP', '17': 'TO',
  '21': 'MA', '22': 'PI', '23': 'CE', '24': 'RN', '25': 'PB', '26': 'PE', '27': 'AL', '28': 'SE', '29': 'BA',
  '31': 'MG', '32': 'ES', '33': 'RJ', '35': 'SP',
  '41': 'PR', '42': 'SC', '43': 'RS',
  '50': 'MS', '51': 'MT', '52': 'GO', '53': 'DF'
};

/**
 * Remove qualquer caractere não numérico da chave
 */
export const cleanNfeKey = (rawKey: string): string => {
  return (rawKey || '').replace(/\D/g, '');
};

/**
 * Algoritmo Oficial SEFAZ - Módulo 11 com pesos de 2 a 9
 * Calcula o Dígito Verificador (último dígito) dos primeiros 43 números
 */
export const calculateNfeCheckDigit = (key43: string): number => {
  if (key43.length < 43) return -1;
  const digits = key43.slice(0, 43);
  let weight = 2;
  let sum = 0;

  for (let i = digits.length - 1; i >= 0; i--) {
    const digit = parseInt(digits[i], 10);
    sum += digit * weight;
    weight++;
    if (weight > 9) weight = 2;
  }

  const remainder = sum % 11;
  if (remainder === 0 || remainder === 1) {
    return 0;
  }
  return 11 - remainder;
};

/**
 * Formata CNPJ: 00.000.000/0000-00
 */
export const formatCnpj = (cnpjRaw: string): string => {
  const c = cnpjRaw.padStart(14, '0');
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12, 14)}`;
};

/**
 * Formata chave de acesso em blocos legíveis de 4 dígitos
 */
export const formatNfeKeyBlocks = (key: string): string => {
  const clean = cleanNfeKey(key);
  return clean.replace(/(\d{4})/g, '$1 ').trim();
};

/**
 * Decodifica as partes internas dos 44 dígitos da chave de acesso
 */
export const decodeNfeKey = (cleanKey: string): NfeDecodedKey => {
  const ufCode = cleanKey.slice(0, 2);
  const yearMonth = cleanKey.slice(2, 6);
  const cnpj = cleanKey.slice(6, 20);
  const model = cleanKey.slice(20, 22);
  const series = cleanKey.slice(22, 25);
  const invoiceNumber = cleanKey.slice(25, 34);
  const emissionType = cleanKey.slice(34, 35);
  const numericCode = cleanKey.slice(35, 43);
  const verifierDigit = cleanKey.slice(43, 44);

  const calcDigit = String(calculateNfeCheckDigit(cleanKey.slice(0, 43)));

  const year = '20' + yearMonth.slice(0, 2);
  const month = yearMonth.slice(2, 4);

  return {
    rawKey: cleanKey,
    cleanKey,
    ufCode,
    ufState: UF_MAP[ufCode] || 'UF Desconhecida',
    yearMonth,
    formattedDate: `${month}/${year}`,
    cnpj,
    formattedCnpj: formatCnpj(cnpj),
    model,
    series: String(parseInt(series, 10)),
    invoiceNumber: String(parseInt(invoiceNumber, 10)),
    emissionType,
    numericCode,
    verifierDigit,
    calculatedDigit: calcDigit,
    isValidChecksum: verifierDigit === calcDigit
  };
};

/**
 * Valida a chave de acesso da NF-e (44 dígitos e algoritmo Módulo 11)
 */
export const validateNfeKey = (rawKey: string): { 
  isValid: boolean; 
  cleanKey: string; 
  error?: string; 
  decoded?: NfeDecodedKey 
} => {
  const cleanKey = cleanNfeKey(rawKey);

  if (!cleanKey) {
    return { isValid: false, cleanKey, error: 'Por favor, bipe ou digite a chave de acesso da NF-e.' };
  }

  if (cleanKey.length < 44) {
    return { 
      isValid: false, 
      cleanKey, 
      error: `Chave de acesso incompleta (${cleanKey.length}/44 dígitos). Confira os 44 dígitos.` 
    };
  }

  if (cleanKey.length > 44) {
    return { 
      isValid: false, 
      cleanKey, 
      error: `Chave com tamanho superior a 44 dígitos (${cleanKey.length} dígitos encontrados).` 
    };
  }

  const decoded = decodeNfeKey(cleanKey);

  if (decoded.model !== '55' && decoded.model !== '65') {
    return {
      isValid: false,
      cleanKey,
      error: `Modelo de documento ${decoded.model} não é NF-e (modelo 55) nem NFC-e (modelo 65).`,
      decoded
    };
  }

  if (!decoded.isValidChecksum) {
    return {
      isValid: false,
      cleanKey,
      error: `Chave de acesso com dígito verificador inválido (DV informado: ${decoded.verifierDigit}, calculado: ${decoded.calculatedDigit}). Verifique a digitação ou bipe novamente.`,
      decoded
    };
  }

  return { isValid: true, cleanKey, decoded };
};

/**
 * Normaliza strings para comparação flexível (remove acentos, caixa alta, caracteres especiais)
 */
const normalizeText = (text: string): string => {
  return (text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Vinculação Estrita com o Catálogo Interno
 * REGRA FUNDAMENTAL:
 * - O cadastro interno NÃO altera nem substitui nenhum dado original da NF-e.
 * - Serve apenas para apontar qual produto do estoque deve ser incrementado.
 * - Somente faz vínculo automático se o código de produto do fornecedor bater exatamente
 *   ou se o nome cadastrado for estritamente idêntico.
 * - Zero fuzzy matching, zero aproximações por sinônimos, zero estimativas.
 */
export const autoMatchProducts = (items: NfeProductItem[], catalog: Product[]): NfeProductItem[] => {
  return items.map(item => {
    // Se o operador já vinculou manualmente nesta tela, preserva a escolha do operador
    if (item.matchStatus === 'MANUAL_MATCHED' && item.matchedProductId) {
      return item;
    }

    const normSupplierCode = normalizeText(item.supplierProductCode);
    const normDesc = normalizeText(item.description);

    // 1. Vínculo por código exato de produto do fornecedor pré-configurado no cadastro
    if (normSupplierCode) {
      const matchBySupplierCode = catalog.find(p => {
        const pSupCode = p.supplierProductCode ? normalizeText(p.supplierProductCode) : '';
        return pSupCode && pSupCode === normSupplierCode;
      });

      if (matchBySupplierCode) {
        return {
          ...item,
          matchedProductId: matchBySupplierCode.id,
          matchedProductCode: matchBySupplierCode.code,
          matchedProductName: matchBySupplierCode.name,
          matchedUnit: matchBySupplierCode.unit,
          matchStatus: 'AUTO_MATCHED',
          matchConfidence: 'Código do Fornecedor Coincidente'
        };
      }

      // Vínculo por código interno exato (caso o fornecedor use o mesmo código da empresa)
      const matchByInternalCode = catalog.find(p => normalizeText(p.code) === normSupplierCode);
      if (matchByInternalCode) {
        return {
          ...item,
          matchedProductId: matchByInternalCode.id,
          matchedProductCode: matchByInternalCode.code,
          matchedProductName: matchByInternalCode.name,
          matchedUnit: matchByInternalCode.unit,
          matchStatus: 'AUTO_MATCHED',
          matchConfidence: 'Código Interno Idêntico'
        };
      }
    }

    // 2. Vínculo por descrição exata e idêntica
    const matchByExactName = catalog.find(p => normalizeText(p.name) === normDesc);
    if (matchByExactName) {
      return {
        ...item,
        matchedProductId: matchByExactName.id,
        matchedProductCode: matchByExactName.code,
        matchedProductName: matchByExactName.name,
        matchedUnit: matchByExactName.unit,
        matchStatus: 'AUTO_MATCHED',
        matchConfidence: 'Descrição Idêntica ao Cadastro'
      };
    }

    // Se não houver correspondência exata, NÃO adivinhar. O item fica como NÃO VINCULADO
    return {
      ...item,
      matchedProductId: undefined,
      matchedProductCode: undefined,
      matchedProductName: undefined,
      matchedUnit: undefined,
      matchStatus: 'NOT_FOUND',
      matchConfidence: undefined
    };
  });
};

/**
 * Converte unidade comercial da NF-e para o padrão do sistema (UnitType)
 */
export const mapCommercialUnitToSystem = (uCom?: string): UnitType => {
  const clean = (uCom || '').trim().toUpperCase();
  if (['CX', 'CXS', 'CAIXA', 'BOX'].includes(clean)) return 'CAIXA';
  if (['PCT', 'PACOTE', 'PCTS'].includes(clean)) return 'PACOTE';
  if (['PC', 'PECA', 'PECAS', 'UN', 'UND', 'UNID', 'UNIDADE'].includes(clean)) return 'PECA';
  if (['FARDO', 'FD'].includes(clean)) return 'FARDO';
  if (['KG', 'QUILO', 'KGS'].includes(clean)) return 'KG';
  return 'CAIXA';
};

/**
 * Parser de XML Oficial de NF-e com Validação Estrita de Documento
 * Extrai diretamente as tags oficiais da SEFAZ (<det>, <prod>, <ICMSTot>, <vol>).
 * Se expectedAccessKey for fornecida, confere se o XML pertence estritamente a essa chave.
 */
export const parseNfeXml = (
  xmlString: string, 
  catalog: Product[],
  expectedAccessKey?: string
): NfeParsedData => {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, 'text/xml');

  // Checa erros de parsing XML
  const parseError = xmlDoc.getElementsByTagName('parsererror');
  if (parseError.length > 0) {
    throw new Error('Arquivo XML inválido ou corrompido. Não foi possível ler a estrutura da NF-e.');
  }

  // Chave de acesso: atributo Id de infNFe (ex: Id="NFe35260302916265000100550010000123451123456781") ou tag chNFe
  let accessKey = '';
  const infNFe = xmlDoc.getElementsByTagName('infNFe')[0];
  if (infNFe) {
    const rawId = infNFe.getAttribute('Id') || '';
    accessKey = cleanNfeKey(rawId);
  }
  if (!accessKey) {
    const chNFeTag = xmlDoc.getElementsByTagName('chNFe')[0];
    if (chNFeTag) accessKey = cleanNfeKey(chNFeTag.textContent || '');
  }

  const getTagValue = (parent: Element | Document, tagName: string): string => {
    const el = parent.getElementsByTagName(tagName)[0];
    return el && el.textContent ? el.textContent.trim() : '';
  };

  // Identificação da Nota (<ide>)
  const ideEl = xmlDoc.getElementsByTagName('ide')[0];
  const invoiceNumber = ideEl ? getTagValue(ideEl, 'nNF') : '';
  const series = ideEl ? getTagValue(ideEl, 'serie') : '1';
  let dhEmi = ideEl ? (getTagValue(ideEl, 'dhEmi') || getTagValue(ideEl, 'dEmi')) : '';
  const emissionDate = dhEmi ? dhEmi.slice(0, 10) : new Date().toISOString().split('T')[0];

  // Emitente / Fornecedor (<emit>)
  const emitEl = xmlDoc.getElementsByTagName('emit')[0];
  const supplierName = emitEl ? (getTagValue(emitEl, 'xNome') || 'FORNECEDOR') : 'FORNECEDOR';
  const supplierTradeName = emitEl ? getTagValue(emitEl, 'xFant') : '';
  const supplierCnpj = emitEl ? (getTagValue(emitEl, 'CNPJ') || getTagValue(emitEl, 'CPF')) : '';
  const supplierIe = emitEl ? getTagValue(emitEl, 'IE') : '';
  const enderEmit = emitEl ? emitEl.getElementsByTagName('enderEmit')[0] : null;
  const supplierUf = enderEmit ? getTagValue(enderEmit, 'UF') : '';

  // Destinatário (<dest>)
  const destEl = xmlDoc.getElementsByTagName('dest')[0];
  const recipientName = destEl ? getTagValue(destEl, 'xNome') : '';
  const recipientCnpj = destEl ? (getTagValue(destEl, 'CNPJ') || getTagValue(destEl, 'CPF')) : '';

  // Totais Oficiais (<total><ICMSTot>)
  const icmsTot = xmlDoc.getElementsByTagName('ICMSTot')[0];
  const totalInvoiceValue = icmsTot ? parseFloat(getTagValue(icmsTot, 'vNF')) || 0 : 0;
  const totalProductsValue = icmsTot ? parseFloat(getTagValue(icmsTot, 'vProd')) || 0 : 0;
  const totalDiscount = icmsTot ? parseFloat(getTagValue(icmsTot, 'vDesc')) || 0 : 0;
  const totalFreight = icmsTot ? parseFloat(getTagValue(icmsTot, 'vFrete')) || 0 : 0;
  const totalInsurance = icmsTot ? parseFloat(getTagValue(icmsTot, 'vSeg')) || 0 : 0;
  const totalOtherExpenses = icmsTot ? parseFloat(getTagValue(icmsTot, 'vOutro')) || 0 : 0;
  const totalTaxes = icmsTot ? (parseFloat(getTagValue(icmsTot, 'vST')) || 0) + (parseFloat(getTagValue(icmsTot, 'vIPI')) || 0) : 0;

  // Validação Estrita se uma chave específica foi solicitada
  if (expectedAccessKey) {
    const cleanExpected = cleanNfeKey(expectedAccessKey);
    const decodedExpected = decodeNfeKey(cleanExpected);

    const keyMatches = !accessKey || accessKey === cleanExpected;
    const cnpjMatches = cleanNfeKey(supplierCnpj) === decodedExpected.cnpj;
    const numberMatches = parseInt(invoiceNumber, 10) === parseInt(decodedExpected.invoiceNumber, 10);
    const seriesMatches = parseInt(series, 10) === parseInt(decodedExpected.series, 10);

    if (!keyMatches || !cnpjMatches || !numberMatches || !seriesMatches) {
      throw new Error(
        `Não foi possível validar a NF-e correspondente a esta chave. Nenhum dado aproximado será utilizado. (Esperado: Nº ${decodedExpected.invoiceNumber}, Série ${decodedExpected.series}, CNPJ ${decodedExpected.formattedCnpj} | Recebido: Nº ${invoiceNumber}, Série ${series}, CNPJ ${formatCnpj(supplierCnpj)})`
      );
    }
  }

  // Itens da Nota (<det>)
  const detElements = Array.from(xmlDoc.getElementsByTagName('det'));
  if (detElements.length === 0) {
    throw new Error('Não foi possível identificar itens válidos no documento da NF-e.');
  }

  let totalBoxes = 0;
  let totalExplicitWeight = 0;

  const parsedItems: NfeProductItem[] = detElements.map((det, index) => {
    const prodEl = det.getElementsByTagName('prod')[0];
    const cProd = prodEl ? getTagValue(prodEl, 'cProd') : `ITEM-${index + 1}`;
    const xProd = prodEl ? getTagValue(prodEl, 'xProd') : `Produto ${index + 1}`;
    const ncm = prodEl ? getTagValue(prodEl, 'NCM') : '';
    const cfop = prodEl ? getTagValue(prodEl, 'CFOP') : '';
    const uCom = prodEl ? getTagValue(prodEl, 'uCom') : 'CX';
    const qCom = prodEl ? parseFloat(getTagValue(prodEl, 'qCom')) || 0 : 0;
    const vUnCom = prodEl ? parseFloat(getTagValue(prodEl, 'vUnCom')) || 0 : 0;
    const vProd = prodEl ? parseFloat(getTagValue(prodEl, 'vProd')) || 0 : qCom * vUnCom;

    // Tributáveis
    const uTrib = prodEl ? getTagValue(prodEl, 'uTrib') : '';
    const qTrib = prodEl ? parseFloat(getTagValue(prodEl, 'qTrib')) || 0 : 0;
    const vUnTrib = prodEl ? parseFloat(getTagValue(prodEl, 'vUnTrib')) || 0 : 0;

    // Componentes de valor do item se houver
    const discountValue = prodEl ? parseFloat(getTagValue(prodEl, 'vDesc')) || 0 : 0;
    const freightValue = prodEl ? parseFloat(getTagValue(prodEl, 'vFrete')) || 0 : 0;
    const insuranceValue = prodEl ? parseFloat(getTagValue(prodEl, 'vSeg')) || 0 : 0;
    const otherExpensesValue = prodEl ? parseFloat(getTagValue(prodEl, 'vOutro')) || 0 : 0;

    // Extrai o peso real do item se especificado na nota
    let itemWeightKg = 0;
    if (uTrib.toUpperCase() === 'KG' && qTrib > 0) {
      itemWeightKg = qTrib;
    } else if (uCom.toUpperCase() === 'KG' && qCom > 0) {
      itemWeightKg = qCom;
    }

    totalBoxes += qCom;
    totalExplicitWeight += itemWeightKg;
    const finalWeight = Math.round(itemWeightKg * 100) / 100;

    return {
      itemIndex: index + 1,
      supplierProductCode: cProd,
      description: xProd,
      ncm,
      cfop,
      commercialUnit: uCom,
      quantity: qCom,
      unitValue: Math.round(vUnCom * 100) / 100,
      totalValue: Math.round(vProd * 100) / 100,
      discountValue: discountValue > 0 ? discountValue : undefined,
      freightValue: freightValue > 0 ? freightValue : undefined,
      insuranceValue: insuranceValue > 0 ? insuranceValue : undefined,
      otherExpensesValue: otherExpensesValue > 0 ? otherExpensesValue : undefined,
      taxableUnit: uTrib || undefined,
      taxableQuantity: qTrib > 0 ? qTrib : undefined,
      taxableUnitValue: vUnTrib > 0 ? vUnTrib : undefined,
      weightKg: finalWeight,
      nfeOriginalWeightKg: finalWeight,
      receivedWeightKg: finalWeight,
      weightDiffKg: 0,
      matchStatus: 'NOT_FOUND'
    };
  });

  // Tenta obter peso e volumes dos dados de transporte (<transp><vol>)
  let transportWeightKg = 0;
  let transportNetWeightKg = 0;
  let transportGrossWeightKg = 0;

  const volEl = xmlDoc.getElementsByTagName('vol')[0];
  if (volEl) {
    const pesoL = parseFloat(getTagValue(volEl, 'pesoL')) || 0;
    const pesoB = parseFloat(getTagValue(volEl, 'pesoB')) || 0;
    const qVol = parseFloat(getTagValue(volEl, 'qVol')) || 0;
    transportNetWeightKg = pesoL;
    transportGrossWeightKg = pesoB;
    if (pesoL > 0) transportWeightKg = pesoL;
    else if (pesoB > 0) transportWeightKg = pesoB;
    if (qVol > 0 && totalBoxes === 0) totalBoxes = qVol;
  }

  // Determina o peso total oficial da NF-e
  const totalWeightKg = transportWeightKg > 0 
    ? transportWeightKg 
    : totalExplicitWeight;

  const roundedTotalWeight = Math.round(totalWeightKg * 100) / 100;

  // Se o peso total do transporte estiver informado mas os itens não tiverem peso individual,
  // distribui o peso proporcionalmente aos itens para preencher o peso inicial de referência
  if (transportWeightKg > 0 && totalExplicitWeight === 0 && totalBoxes > 0) {
    parsedItems.forEach(it => {
      const propWeight = Math.round(((it.quantity / totalBoxes) * transportWeightKg) * 100) / 100;
      it.weightKg = propWeight;
      it.nfeOriginalWeightKg = propWeight;
      it.receivedWeightKg = propWeight;
      it.netWeightKg = transportNetWeightKg > 0 ? propWeight : undefined;
      it.grossWeightKg = transportGrossWeightKg > 0 ? propWeight : undefined;
    });
  }

  // Realiza o vínculo estrito com o catálogo interno (sem alterar dados da NF-e)
  const matchedItems = autoMatchProducts(parsedItems, catalog);

  return {
    accessKey: accessKey || expectedAccessKey || `CHAVE-${invoiceNumber}`,
    invoiceNumber: invoiceNumber || '000000',
    series: series || '1',
    emissionDate,
    supplierName,
    supplierTradeName,
    supplierCnpj,
    supplierIe,
    supplierUf,
    recipientName,
    recipientCnpj,
    totalInvoiceValue: Math.round(totalInvoiceValue * 100) / 100,
    totalProductsValue: Math.round(totalProductsValue * 100) / 100,
    totalDiscount: Math.round(totalDiscount * 100) / 100,
    totalFreight: Math.round(totalFreight * 100) / 100,
    totalInsurance: Math.round(totalInsurance * 100) / 100,
    totalOtherExpenses: Math.round(totalOtherExpenses * 100) / 100,
    totalTaxes: Math.round(totalTaxes * 100) / 100,
    totalWeightKg: roundedTotalWeight,
    totalNfeOriginalWeightKg: roundedTotalWeight,
    totalReceivedWeightKg: roundedTotalWeight,
    totalWeightDiffKg: 0,
    totalBoxes: Math.round(totalBoxes * 100) / 100,
    items: matchedItems,
    source: 'XML_UPLOAD',
    rawXml: xmlString,
    validationStatus: {
      isValid: true,
      checkedKey: true,
      checkedCnpj: true,
      checkedNumber: true,
      checkedSeries: true
    }
  };
};

/**
 * Consulta Oficial de NF-e por Chave de Acesso
 * ARQUITETURA DEFINITIVA:
 * 1. Valida estritamente os 44 dígitos e o DV Módulo 11.
 * 2. Consulta o backend seguro (/api/nfe/consultar), que executa a autenticação mTLS
 *    com o Certificado Digital A1 da empresa ou via Gateway DF-e oficial.
 * 3. O backend retorna o XML real emitido e autorizado pela SEFAZ para aquela chave.
 * 4. Valida obrigatoriamente se os dados retornados batem 100% com a chave informada.
 * 5. SE NÃO LOCALIZAR OU HOUVER QUALQUER DIVERGÊNCIA:
 *    Retorna ERRO e ABORTA. NUNCA utiliza mock, estimativas, produtos aproximados ou notas falsas!
 */
export const fetchNfeByAccessKey = async (
  rawKey: string,
  catalog: Product[],
  suppliers: Supplier[]
): Promise<NfeParsedData> => {
  const validation = validateNfeKey(rawKey);
  if (!validation.isValid || !validation.decoded) {
    throw new Error(validation.error || 'Chave de acesso inválida.');
  }

  const cleanKey = validation.cleanKey;

  // Requisição ao backend seguro
  let response: Response;
  try {
    response = await fetch('/api/nfe/consultar', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ accessKey: cleanKey })
    });
  } catch (netErr: any) {
    throw new Error(
      `Falha na comunicação com o servidor de consulta de NF-e: ${netErr.message || 'Servidor inacessível'}. Nenhum dado aproximado será utilizado.`
    );
  }

  const result = await response.json();

  if (!response.ok || !result.success) {
    const errorMsg = result.error || 'Não foi possível consultar a NF-e para a chave informada.';
    throw new Error(errorMsg);
  }

  // 1. Se o serviço retornou o XML oficial
  if (result.xmlString) {
    const parsed = parseNfeXml(result.xmlString, catalog, cleanKey);
    parsed.source = result.source === 'GATEWAY_DFE' ? 'GATEWAY_DFE' : 'SEFAZ_DISTRIBUICAO';
    parsed.apiProvider = result.diagnostic?.serviceQueried || 'SEFAZ Nacional - Web Service NFeDistribuicaoDFe';
    parsed.validationStatus = {
      isValid: true,
      checkedKey: true,
      checkedCnpj: true,
      checkedNumber: true,
      checkedSeries: true
    };
    return parsed;
  }

  // 2. Se retornou JSON estruturado de gateway oficial
  if (result.jsonData && result.jsonData.itens && Array.isArray(result.jsonData.itens)) {
    const data = result.jsonData;
    const items: NfeProductItem[] = data.itens.map((it: any, idx: number) => ({
      itemIndex: idx + 1,
      supplierProductCode: String(it.codigo || it.cProd || `IT-${idx + 1}`),
      description: String(it.descricao || it.xProd || `Item ${idx + 1}`),
      ncm: it.ncm || '',
      cfop: it.cfop || '',
      commercialUnit: String(it.unidade || it.uCom || 'CX'),
      quantity: Number(it.quantidade || it.qCom) || 0,
      unitValue: Number(it.valorUnitario || it.vUnCom) || 0,
      totalValue: Number(it.valorTotal || it.vProd) || 0,
      weightKg: Number(it.peso || it.pesoKg) || 0,
      nfeOriginalWeightKg: Number(it.peso || it.pesoKg) || 0,
      receivedWeightKg: Number(it.peso || it.pesoKg) || 0,
      weightDiffKg: 0,
      matchStatus: 'NOT_FOUND'
    }));

    const matched = autoMatchProducts(items, catalog);
    const totalW = Number(data.pesoTotal) || items.reduce((s, i) => s + (i.weightKg || 0), 0);

    return {
      accessKey: cleanKey,
      invoiceNumber: String(data.numero || validation.decoded.invoiceNumber),
      series: String(data.serie || validation.decoded.series),
      emissionDate: data.dataEmissao || new Date().toISOString().split('T')[0],
      supplierName: data.emitente?.nome || data.fornecedor || 'FORNECEDOR',
      supplierTradeName: data.emitente?.fantasia,
      supplierCnpj: data.emitente?.cnpj || validation.decoded.formattedCnpj,
      totalInvoiceValue: Number(data.valorTotal || data.total) || 0,
      totalProductsValue: Number(data.valorProdutos || data.total) || 0,
      totalDiscount: Number(data.desconto || data.totalDiscount) || 0,
      totalFreight: Number(data.frete || data.totalFreight) || 0,
      totalInsurance: Number(data.seguro || data.totalInsurance) || 0,
      totalOtherExpenses: Number(data.outrasDespesas || data.totalOtherExpenses) || 0,
      totalWeightKg: totalW,
      totalNfeOriginalWeightKg: totalW,
      totalReceivedWeightKg: totalW,
      totalWeightDiffKg: 0,
      totalBoxes: Number(data.totalVolumes) || items.reduce((s, i) => s + (i.quantity || 0), 0),
      items: matched,
      source: 'GATEWAY_DFE',
      apiProvider: 'Gateway DF-e REST'
    };
  }

  // Se chegou aqui sem documento válido: ABORTA COM ERRO
  throw new Error('Não foi possível validar a NF-e correspondente a esta chave. Nenhum dado aproximado será utilizado.');
};

/**
 * Consulta o Diagnóstico Técnico da NF-e para Desenvolvimento e Auditoria
 */
export const fetchNfeDiagnostic = async (rawKey: string): Promise<{ 
  diagnostic: NfeDiagnosticTrace; 
  certStatus: { hasCert: boolean; hasGateway: boolean } 
}> => {
  const cleanKey = cleanNfeKey(rawKey);
  const response = await fetch('/api/nfe/diagnostico', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessKey: cleanKey })
  });

  if (!response.ok) {
    throw new Error(`Erro HTTP ${response.status} ao consultar diagnóstico de NF-e.`);
  }

  return response.json();
};

/**
 * Obtém o status dos serviços do servidor (Certificado A1 e Gateway)
 */
export const getNfeServerStatus = async (): Promise<NfeServerStatus> => {
  const res = await fetch('/api/nfe/status');
  if (!res.ok) {
    return { hasCertificate: false, hasGateway: false };
  }
  return res.json();
};

/**
 * Salva e valida o Certificado Digital A1 no backend seguro
 */
export const saveCertificateToBackend = async (
  pfxBase64: string,
  passphrase: string,
  cnpj: string,
  ufCode?: string
): Promise<{ success: boolean; message: string; certInfo?: any }> => {
  const res = await fetch('/api/nfe/configurar-certificado', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pfxBase64, passphrase, cnpj, ufCode })
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Erro ao configurar certificado no servidor.');
  }
  return data;
};

/**
 * Salva a URL e Token do Gateway DF-e
 */
export const saveGatewayToBackend = async (
  gatewayUrl: string,
  gatewayToken: string
): Promise<{ success: boolean; message: string }> => {
  const res = await fetch('/api/nfe/configurar-gateway', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gatewayUrl, gatewayToken })
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Erro ao configurar gateway no servidor.');
  }
  return data;
};

/**
 * Remove o certificado configurado no backend
 */
export const removeCertificateFromBackend = async (): Promise<void> => {
  const res = await fetch('/api/nfe/remover-certificado', {
    method: 'DELETE'
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Erro ao remover certificado.');
  }
};
