export type UnitType = 'CAIXA' | 'PACOTE' | 'PECA' | 'UNIDADE' | 'FARDO' | 'KG';

export interface Product {
  id: string;
  code: string; // Strictly 2 to 4 digits: e.g. "101", "102"
  name: string; // e.g. "CONTRAFILÉ"
  unit: UnitType; // e.g. "CAIXA"
  defaultWeightKg: number; // e.g. 20 kg
  supplierId?: string; // ID do Fornecedor associado
  supplierName?: string; // Nome do Fornecedor (ex: Frigorífico Estrela)
  supplierProductCode?: string; // Código do produto no fornecedor (ex: cProd)
  ncm?: string; // NCM fiscal (apenas referência)
  costPrice?: number; // Preço/Valor de compra/custo pago pela empresa (R$) — SOMENTE CONTROLE INTERNO
  costPriceType?: 'POR_KG' | 'POR_UNIDADE'; // Base do custo (R$/cx ou R$/kg)
  salePrice?: number; // Preço/Valor de venda para a loja (R$)
  salePriceType?: 'POR_KG' | 'POR_UNIDADE'; // R$ por kg ou R$ por unidade/caixa
  active: boolean;
  createdAt: any;
  updatedAt: any;
  isSampleData?: boolean;
}

export interface InvoiceItem {
  id: string;
  productId: string;
  productCode: string;
  productName: string;
  unit: UnitType;
  quantityBoxes: number;
  weightKg: number; // Peso efetivamente recebido/conferido (utilizado no estoque)
  nfeOriginalWeightKg?: number; // Peso informado na NF-e (referência original, NUNCA sobrescrito)
  receivedWeightKg?: number; // Peso recebido aferido
  weightDiffKg?: number; // Diferença entre peso recebido e peso da NF-e (recebido - original)
  mode: 'by_unit' | 'by_weight';
  unitCostPrice?: number; // Preço de custo unitário (R$) — SOMENTE CONTROLE INTERNO
  costPriceType?: 'POR_KG' | 'POR_UNIDADE'; // R$ por caixa ou R$ por kg
  totalCostPrice?: number; // Custo total deste produto na nota (R$)
  supplierProductCode?: string; // Código do produto no fornecedor (cProd da NF-e)
  supplierProductName?: string; // Descrição original no XML da NF-e (xProd)
  ncm?: string; // NCM quando disponível
  commercialUnit?: string; // Unidade comercial na NF-e (CX, KG, UN, etc.)
}

export interface WeightAdjustmentRecord {
  itemIndex: number;
  productCode: string;
  productName: string;
  nfeOriginalWeightKg: number;
  receivedWeightKg: number;
  diffKg: number;
  adjustedByUserId: string;
  adjustedByUserName: string;
  adjustedAtIso: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string; // e.g. "1234"
  supplierName: string;
  date: string; // YYYY-MM-DD
  notes?: string;
  userId: string;
  userName: string;
  items: InvoiceItem[];
  totalBoxes: number;
  totalWeightKg: number; // Peso total efetivamente recebido (vai para o estoque)
  totalNfeOriginalWeightKg?: number; // Peso total original declarado na NF-e
  totalWeightDiffKg?: number; // Diferença total de pesagem
  hasWeightAdjustment?: boolean; // Se houve divergência de pesagem conferida
  weightAdjustmentHistory?: WeightAdjustmentRecord[]; // Histórico detalhado de divergências de peso conferidas
  totalCostPrice?: number; // Custo total da nota (R$) — CONTROLE INTERNO
  createdAt: any;
  status: 'CONFIRMED' | 'CANCELLED';
  cancelledAt?: any;
  cancelledByUserId?: string;
  cancelledByUserName?: string;
  cancelReason?: string;
  // Campos de Controle da NF-e:
  accessKey?: string; // Chave de acesso de 44 dígitos
  series?: string; // Série da NF-e
  supplierCnpj?: string; // CNPJ do Fornecedor / Emitente
  emissionDate?: string; // Data de emissão original da NF-e
  entryType?: 'MANUAL' | 'NFE_CHAVE'; // Tipo de entrada
  originalNfeData?: any; // Cópia dos dados brutos originais da NF-e para auditoria e conferência
}

export interface ShipmentItem {
  id: string;
  productId: string;
  productCode: string;
  productName: string;
  unit: UnitType;
  quantityBoxes: number;
  weightKg: number;
  mode: 'by_unit' | 'by_weight';
  defaultWeightKg?: number;
  conversionText?: string;
  unitPrice?: number; // Preço de venda unitário (R$)
  priceType?: 'POR_KG' | 'POR_UNIDADE'; // Base de cálculo do preço de venda
  totalPrice?: number; // Valor a ser pago pela loja neste produto (R$)
  unitCostPrice?: number; // Preço de compra / custo pago pela empresa (R$) — SOMENTE CONTROLE INTERNO
  costPriceType?: 'POR_KG' | 'POR_UNIDADE'; // Base do custo de compra
  totalCostPrice?: number; // Custo total deste item (R$) — SOMENTE CONTROLE INTERNO
  supplierId?: string;
  supplierName?: string; // Fornecedor da mercadoria
}

export interface ShipmentDestination {
  id: string;
  storeId: string;
  storeName: string;
  items: ShipmentItem[];
  subtotalBoxes: number;
  subtotalWeightKg: number;
  subtotalPrice?: number; // Valor subtotal de venda a pagar por esta loja (R$)
  subtotalCostPrice?: number; // Subtotal de custo desta loja (R$) — SOMENTE CONTROLE INTERNO
}

export interface Shipment {
  id: string;
  romaneioNumber: string; // e.g. "000123"
  date: string; // YYYY-MM-DD
  notes?: string;
  userId: string;
  userName: string;
  destinations: ShipmentDestination[];
  totalBoxes: number;
  totalWeightKg: number;
  totalPrice?: number; // Valor total a ser pago no romaneio (R$)
  totalCostPrice?: number; // Custo total de compra do romaneio (R$) — SOMENTE CONTROLE INTERNO
  supplierName?: string; // Fornecedor da mercadoria (quando aplicável ao romaneio todo)
  createdAt: any;
  status: 'CONFIRMED' | 'CANCELLED';
  cancelledAt?: any;
  cancelledByUserId?: string;
  cancelledByUserName?: string;
  cancelReason?: string;
  updatedAt?: any;
  lastModifiedByUserId?: string;
  lastModifiedByUserName?: string;
  weightAdjustmentNotes?: string;
}

export interface StockMovement {
  id: string;
  type: 'ENTRADA' | 'SAIDA';
  documentType: 'NOTA_FISCAL' | 'ROMANEIO' | 'AJUSTE' | 'INVENTARIO';
  documentNumber: string; // e.g. "NF 1234" or "ROMANEIO 000123" or "AJUSTE 2026-09-23"
  documentId: string;
  storeId?: string;
  storeName?: string;
  supplierName?: string;
  productId: string;
  productCode: string;
  productName: string;
  unit: UnitType;
  boxes: number;
  weightKg: number; // Peso efetivamente movimentado no estoque
  nfeOriginalWeightKg?: number; // Peso original declarado na NF-e (referência)
  weightDiffKg?: number; // Diferença de pesagem (recebido - original)
  mode: 'by_unit' | 'by_weight';
  unitPrice?: number; // Preço de venda unitário (R$)
  priceType?: 'POR_KG' | 'POR_UNIDADE'; // Base de cálculo do preço de venda
  totalPrice?: number; // Valor total de venda (R$)
  unitCostPrice?: number; // Preço de custo pago na compra/entrada (R$)
  costPriceType?: 'POR_KG' | 'POR_UNIDADE'; // Base de cálculo do custo
  totalCostPrice?: number; // Custo total da movimentação (R$)
  userId: string;
  userName: string;
  timestamp: any;
  createdAtIso: string;
  notes?: string;
  status: 'CONFIRMED' | 'CANCELLED';
  cancelledByUserId?: string;
  cancelledByUserName?: string;
  cancelReason?: string;
}

export interface ProductStockSummary {
  productId: string;
  productCode: string;
  productName: string;
  unit: UnitType;
  defaultWeightKg: number;
  supplierId?: string;
  supplierName?: string;
  salePrice?: number;
  salePriceType?: 'POR_KG' | 'POR_UNIDADE';
  totalEntriesBoxes: number;
  totalEntriesWeightKg: number;
  totalExitsBoxes: number;
  totalExitsWeightKg: number;
  currentBoxes: number;
  currentWeightKg: number;
  active: boolean;
}

export interface Store {
  id: string;
  code?: string;
  name: string; // e.g. "Loja 01 - Centro"
  address?: string;
  active: boolean;
  createdAt?: any;
}

export interface Supplier {
  id: string;
  name: string;
  cnpj?: string;
  phone?: string;
  active: boolean;
  createdAt?: any;
}

export interface SystemSettings {
  allowNegativeStock: boolean;
  companyName: string;
  companyCnpj: string;
  companyPhone: string;
  companyAddress: string;
  nextRomaneioNumber: number;
}

export interface UserAccount {
  id: string;
  name: string;
  username?: string;
  role: 'ADMIN GERAL' | 'Administrador' | 'Operador' | 'Gerente' | 'Conferente';
  email: string;
  avatarColor?: string;
  pin?: string;
  password?: string;
  description?: string;
  department?: string;
}

export type AuditAction = 
  | 'ENTRADA_NOTA'
  | 'ENTRADA_NFE_CHAVE'
  | 'EXCLUSAO_NOTA'
  | 'CANCELAMENTO_NOTA'
  | 'EXCLUSAO_ROMANEIO'
  | 'CANCELAMENTO_ROMANEIO'
  | 'AJUSTE_PESO_ROMANEIO'
  | 'EXCLUSAO_PRODUTO'
  | 'CRIACAO_PRODUTO'
  | 'ALTERACAO_PRODUTO'
  | 'AJUSTE_VALOR_PRODUTO'
  | 'EXCLUSAO_LOJA'
  | 'CRIACAO_LOJA'
  | 'ALTERACAO_LOJA'
  | 'AJUSTE_ESTOQUE'
  | 'ALTERACAO_CONFIGURACAO';

export interface AuditLogEntry {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  action: AuditAction;
  actionLabel: string;
  targetType: 'NOTA' | 'PRODUTO' | 'ROMANEIO' | 'LOJA' | 'FORNECEDOR' | 'ESTOQUE' | 'CONFIGURACAO';
  targetId: string;
  targetIdentifier: string;
  reason?: string;
  details?: any;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM:SS
  createdAt?: any;
}
