import { UnitType } from './index';

export interface NfeDecodedKey {
  rawKey: string;
  cleanKey: string;
  ufCode: string;
  ufState: string;
  yearMonth: string; // AAMM (ex: "2603")
  formattedDate: string; // MM/AAAA (ex: "03/2026")
  cnpj: string;
  formattedCnpj: string;
  model: string; // "55" (NF-e) ou "65" (NFC-e)
  series: string; // ex: "001"
  invoiceNumber: string; // ex: "00012345"
  emissionType: string; // "1" = Normal, etc.
  numericCode: string;
  verifierDigit: string;
  calculatedDigit: string;
  isValidChecksum: boolean;
}

export interface NfeProductItem {
  itemIndex: number; // Número de ordem do item na NF-e (nItem)
  supplierProductCode: string; // Código do produto no fornecedor (cProd da NF-e)
  description: string; // Descrição original do produto na NF-e (xProd)
  ncm?: string; // NCM oficial da NF-e
  cfop?: string; // CFOP oficial da NF-e
  commercialUnit: string; // Unidade comercial na NF-e (uCom: CX, KG, UN, PC, etc.)
  quantity: number; // Quantidade comercial da NF-e (qCom)
  unitValue: number; // Valor unitário de compra na NF-e (vUnCom)
  totalValue: number; // Valor total dos produtos do item na NF-e (vProd)
  
  // Componentes de valor oficiais da NF-e
  discountValue?: number; // Desconto no item (vDesc)
  freightValue?: number; // Frete rateado no item (vFrete)
  insuranceValue?: number; // Seguro no item (vSeg)
  otherExpensesValue?: number; // Outras despesas acessórias no item (vOutro)

  // Unidade tributável (quando informada na NF-e)
  taxableUnit?: string; // uTrib
  taxableQuantity?: number; // qTrib
  taxableUnitValue?: number; // vUnTrib
  
  // Pesagem
  netWeightKg?: number; // Peso líquido do item se disponível (pesoL)
  grossWeightKg?: number; // Peso bruto do item se disponível (pesoB)
  weightKg?: number; // Peso efetivamente recebido na conferência (vai para o estoque)
  nfeOriginalWeightKg?: number; // Peso informado na NF-e (referência original, NUNCA sobrescrito)
  receivedWeightKg?: number; // Peso conferido na balança física
  weightDiffKg?: number; // Diferença entre peso recebido e peso da NF-e (recebido - original)
  
  // Vínculo exclusivo com o catálogo interno (apenas para direcionar a entrada no estoque)
  matchedProductId?: string; // ID do produto no sistema
  matchedProductCode?: string; // Código interno (ex: "015", "101")
  matchedProductName?: string; // Nome no cadastro interno (ex: "CONTRAFILÉ")
  matchedUnit?: UnitType;
  matchStatus: 'AUTO_MATCHED' | 'MANUAL_MATCHED' | 'NOT_FOUND';
  matchConfidence?: string;
  isExcluded?: boolean; // Se o conferente optar por ignorar este item da conferência
}

export interface NfeParsedData {
  accessKey: string; // Chave de acesso de 44 dígitos
  invoiceNumber: string; // Número da NF-e (nNF)
  series: string; // Série da NF-e (serie)
  emissionDate: string; // Data de emissão da NF-e (YYYY-MM-DD)
  supplierName: string; // Razão social do emitente (xNome)
  supplierTradeName?: string; // Nome fantasia do emitente (xFant)
  supplierCnpj: string; // CNPJ formatado do fornecedor/emitente
  supplierIe?: string; // Inscrição Estadual (IE)
  supplierUf?: string; // UF do emitente
  recipientName?: string; // Razão social do destinatário (xNome)
  recipientCnpj?: string; // CNPJ formatado do destinatário
  
  // Valores Oficiais Totais da NF-e (Grupo ICMSTot)
  totalProductsValue: number; // Valor total dos produtos (vProd)
  totalDiscount: number; // Total de desconto (vDesc)
  totalFreight: number; // Total de frete (vFrete)
  totalInsurance: number; // Total de seguro (vSeg)
  totalOtherExpenses: number; // Outras despesas acessórias (vOutro)
  totalTaxes?: number; // Impostos incidentes (vST, vIPI, etc.)
  totalInvoiceValue: number; // Valor total da NF-e (vNF oficial da SEFAZ)
  
  // Carga e Pesagem
  totalBoxes: number; // Total de caixas / volumes (qVol ou soma de quantidades)
  totalWeightKg: number; // Peso total a entrar no estoque (peso recebido)
  totalNfeOriginalWeightKg?: number; // Peso total original declarado na NF-e (pesoL/pesoB)
  totalReceivedWeightKg?: number; // Peso total conferido recebido na balança
  totalWeightDiffKg?: number; // Diferença de pesagem total
  
  items: NfeProductItem[];
  source: 'API' | 'XML_UPLOAD' | 'XML_PASTED' | 'SEFAZ_DISTRIBUICAO' | 'GATEWAY_DFE';
  apiProvider?: string;
  rawXml?: string;
  
  // Validação da resposta em relação à chave informada
  validationStatus?: {
    isValid: boolean;
    checkedKey: boolean;
    checkedCnpj: boolean;
    checkedNumber: boolean;
    checkedSeries: boolean;
    validationNotes?: string[];
  };
}

export interface NfeDiagnosticTrace {
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

export interface NfeServerStatus {
  hasCertificate: boolean;
  certSubject?: string;
  certValidTo?: string;
  certValidFrom?: string;
  certDaysRemaining?: number;
  certIssuer?: string;
  isExpired?: boolean;
  cnpj?: string;
  hasGateway: boolean;
  gatewayUrl?: string;
  architectureInfo?: {
    type: string;
    note: string;
  };
}

