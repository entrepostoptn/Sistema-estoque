import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  serverTimestamp, 
  onSnapshot, 
  runTransaction 
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { 
  Product, 
  Invoice, 
  InvoiceItem, 
  Shipment, 
  ShipmentDestination, 
  StockMovement, 
  ProductStockSummary, 
  UserAccount, 
  SystemSettings 
} from '../types';
import { getSystemSettings } from './storeService';
import { assertAdminGeral } from './authPermissions';
import { logAuditEvent } from './auditService';
import { updateProductCostPrice } from './productService';
import { 
  getStorageMode, 
  getLocalCollection, 
  setLocalCollection, 
  saveLocalDoc, 
  updateLocalDoc, 
  deleteLocalDoc, 
  subscribeLocalCollection 
} from './localStorageAdapter';

/**
 * Recursively removes undefined fields from an object so Firestore addDoc/setDoc/updateDoc never fails with
 * "Unsupported field value: undefined"
 */
export function removeUndefinedFields<T>(obj: T): T {
  if (obj === undefined) return null as any;
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map(removeUndefinedFields) as any;
  }
  // Preserve Firestore FieldValue tokens (like serverTimestamp())
  if (typeof (obj as any).isEqual === 'function' || (obj as any)._methodName) {
    return obj;
  }
  const clean: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      clean[key] = removeUndefinedFields(value);
    }
  }
  return clean;
}

export const subscribeStockMovements = (callback: (movements: StockMovement[]) => void) => {
  if (getStorageMode() === 'local') {
    return subscribeLocalCollection<StockMovement>('stockMovements', callback);
  }

  const q = query(collection(db, 'stockMovements'), orderBy('createdAtIso', 'desc'));
  return onSnapshot(q, (snapshot) => {
    const list: StockMovement[] = snapshot.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
      } as StockMovement;
    });
    setLocalCollection('stockMovements', list);
    callback(list);
  }, (err) => {
    console.warn('Stock movements listener warning, falling back to local storage:', err);
    callback(getLocalCollection<StockMovement>('stockMovements'));
  });
};

export const subscribeInvoices = (callback: (invoices: Invoice[]) => void) => {
  if (getStorageMode() === 'local') {
    return subscribeLocalCollection<Invoice>('invoices', callback);
  }

  const q = query(collection(db, 'invoices'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snapshot) => {
    const list: Invoice[] = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data()
    } as Invoice));
    setLocalCollection('invoices', list);
    callback(list);
  }, (err) => {
    console.warn('Invoices listener warning, falling back to local storage:', err);
    callback(getLocalCollection<Invoice>('invoices'));
  });
};

export const subscribeShipments = (callback: (shipments: Shipment[]) => void) => {
  if (getStorageMode() === 'local') {
    return subscribeLocalCollection<Shipment>('shipments', callback);
  }

  const q = query(collection(db, 'shipments'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snapshot) => {
    const list: Shipment[] = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data()
    } as Shipment));
    setLocalCollection('shipments', list);
    callback(list);
  }, (err) => {
    console.warn('Shipments listener warning, falling back to local storage:', err);
    callback(getLocalCollection<Shipment>('shipments'));
  });
};

/**
 * Calculates real-time stock balances strictly by:
 * ESTOQUE = ENTRADAS (confirmadas) - SAÍDAS (confirmadas)
 */
export const calculateStockSummaries = (
  products: Product[],
  movements: StockMovement[]
): Map<string, ProductStockSummary> => {
  const summaryMap = new Map<string, ProductStockSummary>();

  // Initialize with all products
  for (const p of products) {
    summaryMap.set(p.id, {
      productId: p.id,
      productCode: p.code,
      productName: p.name,
      unit: p.unit,
      defaultWeightKg: p.defaultWeightKg,
      supplierId: p.supplierId,
      supplierName: p.supplierName,
      salePrice: p.salePrice,
      salePriceType: p.salePriceType,
      totalEntriesBoxes: 0,
      totalEntriesWeightKg: 0,
      totalExitsBoxes: 0,
      totalExitsWeightKg: 0,
      currentBoxes: 0,
      currentWeightKg: 0,
      active: p.active
    });
  }

  // Iterate over active/confirmed movements
  for (const mov of movements) {
    if (mov.status === 'CANCELLED') continue;

    let summary = summaryMap.get(mov.productId);
    if (!summary) {
      // Product may have existed in movements
      summary = {
        productId: mov.productId,
        productCode: mov.productCode,
        productName: mov.productName,
        unit: mov.unit || 'CAIXA',
        defaultWeightKg: 0,
        totalEntriesBoxes: 0,
        totalEntriesWeightKg: 0,
        totalExitsBoxes: 0,
        totalExitsWeightKg: 0,
        currentBoxes: 0,
        currentWeightKg: 0,
        active: true
      };
      summaryMap.set(mov.productId, summary);
    }

    const boxes = Number(mov.boxes) || 0;
    const weight = Number(mov.weightKg) || 0;

    if (mov.type === 'ENTRADA') {
      summary.totalEntriesBoxes += boxes;
      summary.totalEntriesWeightKg += weight;
      summary.currentBoxes += boxes;
      summary.currentWeightKg += weight;
    } else if (mov.type === 'SAIDA') {
      summary.totalExitsBoxes += boxes;
      summary.totalExitsWeightKg += weight;
      summary.currentBoxes -= boxes;
      summary.currentWeightKg -= weight;
    }
  }

  // Round floating point inaccuracies
  for (const summary of summaryMap.values()) {
    summary.currentBoxes = Math.round(summary.currentBoxes * 100) / 100;
    summary.currentWeightKg = Math.round(summary.currentWeightKg * 100) / 100;
    summary.totalEntriesBoxes = Math.round(summary.totalEntriesBoxes * 100) / 100;
    summary.totalEntriesWeightKg = Math.round(summary.totalEntriesWeightKg * 100) / 100;
    summary.totalExitsBoxes = Math.round(summary.totalExitsBoxes * 100) / 100;
    summary.totalExitsWeightKg = Math.round(summary.totalExitsWeightKg * 100) / 100;
  }

  return summaryMap;
};

/**
 * Registers an incoming Invoice with multiple products
 */
export const registerInvoiceEntry = async (params: {
  invoiceNumber: string;
  supplierName: string;
  date: string;
  notes?: string;
  items: InvoiceItem[];
  user: UserAccount;
  saveCostsToProducts?: boolean;
  accessKey?: string;
  series?: string;
  supplierCnpj?: string;
  entryType?: 'MANUAL' | 'NFE_CHAVE';
  emissionDate?: string;
  originalNfeData?: any;
}): Promise<string> => {
  const { 
    invoiceNumber, 
    supplierName, 
    date, 
    notes, 
    items, 
    user, 
    saveCostsToProducts,
    accessKey,
    series,
    supplierCnpj,
    entryType,
    emissionDate,
    originalNfeData
  } = params;

  if (!invoiceNumber.trim()) throw new Error('Número da Nota Fiscal é obrigatório.');
  if (!supplierName.trim()) throw new Error('Nome do fornecedor é obrigatório.');
  if (!items || items.length === 0) throw new Error('A nota deve possuir pelo menos um produto.');

  const totalBoxes = items.reduce((sum, item) => sum + (Number(item.quantityBoxes) || 0), 0);
  const totalWeightKg = items.reduce((sum, item) => sum + (Number(item.weightKg) || 0), 0);

  const nowIso = new Date().toISOString();

  // 1. Sanitize items and compute total cost price (Internal Control)
  let totalCostPrice = 0;
  const sanitizedItems = items.map(item => {
    const qty = Number(item.quantityBoxes) || 0;
    const wt = Number(item.weightKg) || 0;
    const unitCost = typeof item.unitCostPrice === 'number' && !isNaN(item.unitCostPrice) && item.unitCostPrice > 0 ? Number(item.unitCostPrice) : undefined;
    const costType = item.costPriceType || 'POR_UNIDADE';
    let itemTotalCost: number | undefined = undefined;

    if (unitCost !== undefined && unitCost > 0) {
      if (costType === 'POR_KG') {
        itemTotalCost = Math.round(wt * unitCost * 100) / 100;
      } else {
        itemTotalCost = Math.round(qty * unitCost * 100) / 100;
      }
      totalCostPrice += itemTotalCost;
    }

    const cleanItem: Record<string, any> = {
      id: item.id || Math.random().toString(36).substring(2, 7),
      productId: item.productId || '',
      productCode: item.productCode || '',
      productName: item.productName || '',
      unit: item.unit || 'CAIXA',
      quantityBoxes: qty,
      weightKg: wt, // Peso efetivamente recebido (vai para o estoque)
      nfeOriginalWeightKg: typeof item.nfeOriginalWeightKg === 'number' ? item.nfeOriginalWeightKg : wt,
      receivedWeightKg: wt, // Peso efetivamente recebido
      weightDiffKg: typeof item.weightDiffKg === 'number' ? item.weightDiffKg : Math.round((wt - (item.nfeOriginalWeightKg || wt)) * 100) / 100,
      mode: item.mode || 'by_unit',
      unitCostPrice: unitCost,
      costPriceType: costType,
      totalCostPrice: itemTotalCost,
      supplierProductCode: item.supplierProductCode || undefined,
      supplierProductName: item.supplierProductName || undefined,
      ncm: item.ncm || undefined,
      commercialUnit: item.commercialUnit || undefined
    };
    return cleanItem;
  });

  const totalNfeOriginalWeightKg = sanitizedItems.reduce(
    (sum, item) => sum + (Number(item.nfeOriginalWeightKg) || Number(item.weightKg) || 0), 
    0
  );
  const totalWeightDiffKg = Math.round((totalWeightKg - totalNfeOriginalWeightKg) * 100) / 100;
  const hasWeightAdjustment = Math.abs(totalWeightDiffKg) >= 0.01;

  // Detailed history of weight divergence per product (conferido na balança vs NF-e)
  const weightAdjustmentHistory = sanitizedItems
    .filter(item => typeof item.nfeOriginalWeightKg === 'number' && Math.abs(item.weightKg - item.nfeOriginalWeightKg) >= 0.01)
    .map((item, idx) => ({
      itemIndex: idx + 1,
      productCode: item.productCode,
      productName: item.productName,
      nfeOriginalWeightKg: Number(item.nfeOriginalWeightKg) || 0,
      receivedWeightKg: Number(item.weightKg) || 0,
      diffKg: Math.round(((Number(item.weightKg) || 0) - (Number(item.nfeOriginalWeightKg) || 0)) * 100) / 100,
      adjustedByUserId: user?.id || 'usr_unknown',
      adjustedByUserName: user?.name || 'Operador',
      adjustedAtIso: nowIso
    }));

  const invoicePayload = {
    invoiceNumber: invoiceNumber.trim(),
    supplierName: supplierName.trim(),
    date: date || nowIso.split('T')[0],
    notes: notes?.trim() || '',
    userId: user?.id || 'usr_unknown',
    userName: user?.name || 'Operador',
    items: sanitizedItems,
    totalBoxes: Math.round(totalBoxes * 100) / 100,
    totalWeightKg: Math.round(totalWeightKg * 100) / 100, // Peso efetivamente recebido (vai para o estoque)
    totalNfeOriginalWeightKg: Math.round(totalNfeOriginalWeightKg * 100) / 100, // Peso original declarado na NF-e (referência)
    totalWeightDiffKg, // Diferença entre recebido e NF-e
    hasWeightAdjustment,
    weightAdjustmentHistory: weightAdjustmentHistory.length > 0 ? weightAdjustmentHistory : undefined,
    totalCostPrice: totalCostPrice > 0 ? Math.round(totalCostPrice * 100) / 100 : undefined,
    status: 'CONFIRMED' as const,
    createdAt: nowIso,
    accessKey: accessKey?.trim() || undefined,
    series: series?.trim() || undefined,
    supplierCnpj: supplierCnpj?.trim() || undefined,
    entryType: entryType || (accessKey ? 'NFE_CHAVE' : 'MANUAL'),
    emissionDate: emissionDate || undefined,
    originalNfeData: originalNfeData || undefined
  };

  let invoiceId = '';

  if (getStorageMode() === 'local') {
    invoiceId = saveLocalDoc('invoices', invoicePayload);
    // Create stock movements locally
    for (const item of sanitizedItems) {
      saveLocalDoc('stockMovements', {
        type: 'ENTRADA',
        documentType: 'NOTA_FISCAL',
        documentNumber: `NF ${invoiceNumber.trim()}`,
        documentId: invoiceId,
        supplierName: supplierName.trim(),
        productId: item.productId,
        productCode: item.productCode,
        productName: item.productName,
        unit: item.unit,
        boxes: Number(item.quantityBoxes) || 0,
        weightKg: Number(item.weightKg) || 0, // Peso recebido no estoque
        nfeOriginalWeightKg: item.nfeOriginalWeightKg,
        weightDiffKg: item.weightDiffKg,
        mode: item.mode,
        unitCostPrice: item.unitCostPrice,
        costPriceType: item.costPriceType,
        totalCostPrice: item.totalCostPrice,
        userId: user?.id || 'usr_unknown',
        userName: user?.name || 'Operador',
        createdAtIso: nowIso,
        notes: notes?.trim() || '',
        status: 'CONFIRMED'
      });
    }
  } else {
    try {
      const invoiceData = removeUndefinedFields({
        ...invoicePayload,
        createdAt: serverTimestamp()
      });
      const invoiceRef = await addDoc(collection(db, 'invoices'), invoiceData);
      invoiceId = invoiceRef.id;

      // Save to local as mirror
      saveLocalDoc('invoices', { id: invoiceId, ...invoicePayload });

      for (const item of sanitizedItems) {
        const movementData = removeUndefinedFields({
          type: 'ENTRADA',
          documentType: 'NOTA_FISCAL',
          documentNumber: `NF ${invoiceNumber.trim()}`,
          documentId: invoiceId,
          supplierName: supplierName.trim(),
          productId: item.productId,
          productCode: item.productCode,
          productName: item.productName,
          unit: item.unit,
          boxes: Number(item.quantityBoxes) || 0,
          weightKg: Number(item.weightKg) || 0, // Peso recebido no estoque
          nfeOriginalWeightKg: item.nfeOriginalWeightKg,
          weightDiffKg: item.weightDiffKg,
          mode: item.mode,
          unitCostPrice: item.unitCostPrice,
          costPriceType: item.costPriceType,
          totalCostPrice: item.totalCostPrice,
          userId: user?.id || 'usr_unknown',
          userName: user?.name || 'Operador',
          timestamp: serverTimestamp(),
          createdAtIso: nowIso,
          notes: notes?.trim() || '',
          status: 'CONFIRMED'
        });

        const movDoc = await addDoc(collection(db, 'stockMovements'), movementData);
        saveLocalDoc('stockMovements', { id: movDoc.id, ...movementData });
      }
    } catch (fbErr) {
      console.warn('Firebase invoice registration failed, saving locally:', fbErr);
      invoiceId = saveLocalDoc('invoices', invoicePayload);
      for (const item of sanitizedItems) {
        saveLocalDoc('stockMovements', {
          type: 'ENTRADA',
          documentType: 'NOTA_FISCAL',
          documentNumber: `NF ${invoiceNumber.trim()}`,
          documentId: invoiceId,
          supplierName: supplierName.trim(),
          productId: item.productId,
          productCode: item.productCode,
          productName: item.productName,
          unit: item.unit,
          boxes: Number(item.quantityBoxes) || 0,
          weightKg: Number(item.weightKg) || 0,
          nfeOriginalWeightKg: item.nfeOriginalWeightKg,
          weightDiffKg: item.weightDiffKg,
          mode: item.mode,
          unitCostPrice: item.unitCostPrice,
          costPriceType: item.costPriceType,
          totalCostPrice: item.totalCostPrice,
          userId: user?.id || 'usr_unknown',
          userName: user?.name || 'Operador',
          createdAtIso: nowIso,
          notes: notes?.trim() || '',
          status: 'CONFIRMED'
        });
      }
    }
  }

  // If saveCostsToProducts is requested, update the standard cost on the product catalog
  if (saveCostsToProducts) {
    for (const item of sanitizedItems) {
      if (item.productId && typeof item.unitCostPrice === 'number' && item.unitCostPrice > 0) {
        try {
          await updateProductCostPrice(
            item.productId,
            item.unitCostPrice,
            item.costPriceType || 'POR_UNIDADE',
            user
          );
        } catch (pErr) {
          console.warn('Could not update standard product cost price:', pErr);
        }
      }
    }
  }

  if (user) {
    const isNfeKey = entryType === 'NFE_CHAVE' || !!accessKey;
    const diffDesc = hasWeightAdjustment
      ? ` • Pesagem: NF-e ${totalNfeOriginalWeightKg.toFixed(2)} kg ➔ Recebido ${totalWeightKg.toFixed(2)} kg (Diferença: ${totalWeightDiffKg > 0 ? '+' : ''}${totalWeightDiffKg.toFixed(2)} kg)`
      : ` • Peso: ${totalWeightKg.toFixed(2)} kg`;

    await logAuditEvent({
      user,
      action: isNfeKey ? 'ENTRADA_NFE_CHAVE' : 'ENTRADA_NOTA',
      actionLabel: isNfeKey ? 'Entrada Automática por Chave de NF-e' : 'Lançamento de Entrada / Nota Fiscal',
      targetType: 'NOTA',
      targetId: invoiceId,
      targetIdentifier: `NF ${invoiceNumber.trim()} (${supplierName.trim()})`,
      reason: isNfeKey 
        ? `Entrada via NF-e (${accessKey ? accessKey.slice(0, 4) + '...' + accessKey.slice(-4) : ''}): ${sanitizedItems.length} produto(s), ${totalBoxes} caixas${diffDesc}. Custo Total: R$ ${(totalCostPrice || 0).toFixed(2)}`
        : `Entrada de ${sanitizedItems.length} produto(s) com ${totalBoxes} caixas${diffDesc}. Custo Total de Compra: R$ ${(totalCostPrice || 0).toFixed(2)}`,
      details: {
        totalBoxes,
        totalWeightKg,
        totalNfeOriginalWeightKg,
        totalWeightDiffKg,
        hasWeightAdjustment,
        totalCostPrice,
        itemsCount: sanitizedItems.length,
        weightAdjustments: weightAdjustmentHistory.map(h => ({
          produto: `${h.productCode} - ${h.productName}`,
          pesoNfeKg: h.nfeOriginalWeightKg,
          pesoRecebidoKg: h.receivedWeightKg,
          diferencaKg: h.diffKg,
          usuario: h.adjustedByUserName,
          dataHora: h.adjustedAtIso
        }))
      }
    });
  }

  return invoiceId;
};

/**
 * Verifica se já existe uma NF-e com a mesma chave de acesso registrada no sistema
 */
export const findInvoiceByAccessKey = (
  accessKey: string,
  invoicesList?: Invoice[]
): Invoice | undefined => {
  const cleanKey = (accessKey || '').replace(/\D/g, '');
  if (!cleanKey) return undefined;

  if (invoicesList && invoicesList.length > 0) {
    return invoicesList.find(
      inv => inv.status !== 'CANCELLED' && (inv.accessKey || '').replace(/\D/g, '') === cleanKey
    );
  }

  const localInvoices = getLocalCollection<Invoice>('invoices');
  return localInvoices.find(
    inv => inv.status !== 'CANCELLED' && (inv.accessKey || '').replace(/\D/g, '') === cleanKey
  );
};

/**
 * Generates the next sequential unique Romaneio number
 * e.g., "000123"
 */
export const getNextRomaneioNumber = async (): Promise<string> => {
  if (getStorageMode() === 'local') {
    const shipments = getLocalCollection<Shipment>('shipments');
    const highest = shipments.reduce((max, s) => {
      const num = parseInt(s.romaneioNumber, 10);
      return !isNaN(num) && num > max ? num : max;
    }, 122);
    return String(highest + 1).padStart(6, '0');
  }

  try {
    const counterDocRef = doc(db, 'counters', 'romaneios');
    const result = await runTransaction(db, async (transaction) => {
      const counterSnap = await transaction.get(counterDocRef);
      let nextNum = 123;
      if (counterSnap.exists()) {
        nextNum = (counterSnap.data().nextNumber || 123) + 1;
      }
      transaction.set(counterDocRef, { nextNumber: nextNum }, { merge: true });
      return nextNum;
    });
    return String(result).padStart(6, '0');
  } catch (err) {
    console.warn('Firebase counter warning, computing locally:', err);
    const shipments = getLocalCollection<Shipment>('shipments');
    const highest = shipments.reduce((max, s) => {
      const num = parseInt(s.romaneioNumber, 10);
      return !isNaN(num) && num > max ? num : max;
    }, 122);
    return String(highest + 1).padStart(6, '0');
  }
};

/**
 * Registers an outgoing Shipment / Romaneio
 */
export const registerShipmentExit = async (params: {
  date: string;
  notes?: string;
  destinations: ShipmentDestination[];
  user: UserAccount;
  currentStockMap: Map<string, ProductStockSummary>;
  allowNegativeStock?: boolean;
}): Promise<{ shipmentId: string; romaneioNumber: string; totalPrice?: number }> => {
  const { date, notes, destinations, user, currentStockMap, allowNegativeStock = false } = params;

  if (!destinations || destinations.length === 0) {
    throw new Error('O romaneio deve conter pelo menos uma loja de destino.');
  }

  let totalItemsCount = 0;
  let totalBoxes = 0;
  let totalWeightKg = 0;

  const requiredStockByProduct = new Map<string, { boxes: number; weight: number; name: string }>();

  for (const dest of destinations) {
    if (!dest.items || dest.items.length === 0) {
      throw new Error(`A loja "${dest.storeName}" não possui nenhum produto adicionado.`);
    }

    for (const item of dest.items) {
      totalItemsCount++;
      const boxes = Number(item.quantityBoxes) || 0;
      const weight = Number(item.weightKg) || 0;

      totalBoxes += boxes;
      totalWeightKg += weight;

      const currentReq = requiredStockByProduct.get(item.productId) || {
        boxes: 0,
        weight: 0,
        name: item.productName
      };
      currentReq.boxes += boxes;
      currentReq.weight += weight;
      requiredStockByProduct.set(item.productId, currentReq);
    }
  }

  if (totalItemsCount === 0) {
    throw new Error('Nenhum item foi inserido no romaneio.');
  }

  // Stock check validation
  if (!allowNegativeStock) {
    for (const [prodId, req] of requiredStockByProduct.entries()) {
      const stock = currentStockMap.get(prodId);
      const availableBoxes = stock ? stock.currentBoxes : 0;
      const availableWeight = stock ? stock.currentWeightKg : 0;

      if (req.boxes > availableBoxes) {
        throw new Error(
          `Estoque insuficiente para "${req.name}"! Solicitado no romaneio: ${req.boxes} caixas/unid, disponível em estoque: ${availableBoxes} caixas/unid.`
        );
      }

      if (req.weight > availableWeight) {
        throw new Error(
          `Estoque em peso insuficiente para "${req.name}"! Solicitado no romaneio: ${req.weight.toFixed(2)} kg, disponível em estoque: ${availableWeight.toFixed(2)} kg.`
        );
      }
    }
  }

  const romaneioNumber = await getNextRomaneioNumber();
  const nowIso = new Date().toISOString();

  let calculatedGrandTotalPrice = 0;
  let calculatedGrandTotalCostPrice = 0;
  const uniqueSuppliersSet = new Set<string>();

  const sanitizedDestinations = destinations.map(dest => {
    let destSubtotalPrice = 0;
    let destSubtotalCostPrice = 0;
    const cleanItems = dest.items.map(item => {
      const boxes = Number(item.quantityBoxes) || 0;
      const weight = Number(item.weightKg) || 0;
      const unitPrice = Number(item.unitPrice) || 0;
      const priceType = item.priceType || 'POR_KG';

      let calculatedItemTotal = 0;
      if (unitPrice > 0) {
        calculatedItemTotal = priceType === 'POR_KG' ? weight * unitPrice : boxes * unitPrice;
        calculatedItemTotal = Math.round(calculatedItemTotal * 100) / 100;
      }
      destSubtotalPrice += calculatedItemTotal;

      // Cost price (INTERNAL ONLY)
      const unitCost = Number(item.unitCostPrice) || 0;
      const costType = item.costPriceType || 'POR_UNIDADE';
      let calculatedItemCost = 0;
      if (unitCost > 0) {
        calculatedItemCost = costType === 'POR_KG' ? weight * unitCost : boxes * unitCost;
        calculatedItemCost = Math.round(calculatedItemCost * 100) / 100;
      } else if (item.totalCostPrice && item.totalCostPrice > 0) {
        calculatedItemCost = item.totalCostPrice;
      }
      destSubtotalCostPrice += calculatedItemCost;

      if (item.supplierName && item.supplierName.trim()) {
        uniqueSuppliersSet.add(item.supplierName.trim());
      }

      const itemClean: Record<string, any> = {
        id: item.id || Math.random().toString(36).substring(2, 7),
        productId: item.productId || '',
        productCode: item.productCode || '',
        productName: item.productName || '',
        unit: item.unit || 'CAIXA',
        quantityBoxes: boxes,
        weightKg: weight,
        mode: item.mode || 'by_unit',
        defaultWeightKg: Number(item.defaultWeightKg) || 0,
        conversionText: item.conversionText || '',
        unitPrice: unitPrice > 0 ? unitPrice : null,
        priceType: unitPrice > 0 ? priceType : null,
        totalPrice: calculatedItemTotal > 0 ? calculatedItemTotal : null,
        unitCostPrice: unitCost > 0 ? unitCost : null,
        costPriceType: unitCost > 0 ? costType : null,
        totalCostPrice: calculatedItemCost > 0 ? calculatedItemCost : null,
        supplierId: item.supplierId || null,
        supplierName: item.supplierName?.trim() || null
      };
      return itemClean;
    });

    destSubtotalPrice = Math.round(destSubtotalPrice * 100) / 100;
    destSubtotalCostPrice = Math.round(destSubtotalCostPrice * 100) / 100;
    calculatedGrandTotalPrice += destSubtotalPrice;
    calculatedGrandTotalCostPrice += destSubtotalCostPrice;

    return {
      id: dest.id || Math.random().toString(36).substring(2, 7),
      storeId: dest.storeId,
      storeName: dest.storeName,
      items: cleanItems,
      subtotalBoxes: Math.round(dest.subtotalBoxes * 100) / 100,
      subtotalWeightKg: Math.round(dest.subtotalWeightKg * 100) / 100,
      subtotalPrice: destSubtotalPrice > 0 ? destSubtotalPrice : null,
      subtotalCostPrice: destSubtotalCostPrice > 0 ? destSubtotalCostPrice : null
    };
  });

  calculatedGrandTotalPrice = Math.round(calculatedGrandTotalPrice * 100) / 100;
  calculatedGrandTotalCostPrice = Math.round(calculatedGrandTotalCostPrice * 100) / 100;
  const aggregatedSupplierName = Array.from(uniqueSuppliersSet).join(', ') || null;

  const shipmentPayload = {
    romaneioNumber,
    date: date || nowIso.split('T')[0],
    notes: notes?.trim() || '',
    userId: user?.id || 'usr_unknown',
    userName: user?.name || 'Operador',
    destinations: sanitizedDestinations,
    totalBoxes: Math.round(totalBoxes * 100) / 100,
    totalWeightKg: Math.round(totalWeightKg * 100) / 100,
    totalPrice: calculatedGrandTotalPrice > 0 ? calculatedGrandTotalPrice : null,
    totalCostPrice: calculatedGrandTotalCostPrice > 0 ? calculatedGrandTotalCostPrice : null,
    supplierName: aggregatedSupplierName,
    status: 'CONFIRMED' as const,
    createdAt: nowIso
  };

  let shipmentId = '';

  if (getStorageMode() === 'local') {
    shipmentId = saveLocalDoc('shipments', shipmentPayload);
    // Create stock movements locally
    for (const dest of sanitizedDestinations) {
      for (const item of dest.items) {
        saveLocalDoc('stockMovements', {
          type: 'SAIDA',
          documentType: 'ROMANEIO',
          documentNumber: `ROM Nº ${romaneioNumber}`,
          documentId: shipmentId,
          storeId: dest.storeId,
          storeName: dest.storeName,
          productId: item.productId,
          productCode: item.productCode,
          productName: item.productName,
          unit: item.unit,
          boxes: Number(item.quantityBoxes) || 0,
          weightKg: Number(item.weightKg) || 0,
          mode: item.mode,
          unitPrice: item.unitPrice || null,
          priceType: item.priceType || null,
          totalPrice: item.totalPrice || null,
          unitCostPrice: item.unitCostPrice || null,
          costPriceType: item.costPriceType || null,
          totalCostPrice: item.totalCostPrice || null,
          supplierName: item.supplierName || null,
          userId: user?.id || 'usr_unknown',
          userName: user?.name || 'Operador',
          createdAtIso: nowIso,
          notes: notes?.trim() || '',
          status: 'CONFIRMED'
        });
      }
    }
  } else {
    try {
      const shipmentData = removeUndefinedFields({
        ...shipmentPayload,
        createdAt: serverTimestamp()
      });
      const shipmentRef = await addDoc(collection(db, 'shipments'), shipmentData);
      shipmentId = shipmentRef.id;

      // Save to local mirror
      saveLocalDoc('shipments', { id: shipmentId, ...shipmentPayload });

      for (const dest of sanitizedDestinations) {
        for (const item of dest.items) {
          const movementData = removeUndefinedFields({
            type: 'SAIDA',
            documentType: 'ROMANEIO',
            documentNumber: `ROM Nº ${romaneioNumber}`,
            documentId: shipmentId,
            storeId: dest.storeId,
            storeName: dest.storeName,
            productId: item.productId,
            productCode: item.productCode,
            productName: item.productName,
            unit: item.unit,
            boxes: Number(item.quantityBoxes) || 0,
            weightKg: Number(item.weightKg) || 0,
            mode: item.mode,
            unitPrice: item.unitPrice || null,
            priceType: item.priceType || null,
            totalPrice: item.totalPrice || null,
            unitCostPrice: item.unitCostPrice || null,
            costPriceType: item.costPriceType || null,
            totalCostPrice: item.totalCostPrice || null,
            supplierName: item.supplierName || null,
            userId: user?.id || 'usr_unknown',
            userName: user?.name || 'Operador',
            timestamp: serverTimestamp(),
            createdAtIso: nowIso,
            notes: notes?.trim() || '',
            status: 'CONFIRMED'
          });

          const movRef = await addDoc(collection(db, 'stockMovements'), movementData);
          saveLocalDoc('stockMovements', { id: movRef.id, ...movementData });
        }
      }
    } catch (fbErr) {
      console.warn('Firebase shipment registration failed, saving locally:', fbErr);
      shipmentId = saveLocalDoc('shipments', shipmentPayload);
      for (const dest of sanitizedDestinations) {
        for (const item of dest.items) {
          saveLocalDoc('stockMovements', {
            type: 'SAIDA',
            documentType: 'ROMANEIO',
            documentNumber: `ROM Nº ${romaneioNumber}`,
            documentId: shipmentId,
            storeId: dest.storeId,
            storeName: dest.storeName,
            productId: item.productId,
            productCode: item.productCode,
            productName: item.productName,
            unit: item.unit,
            boxes: Number(item.quantityBoxes) || 0,
            weightKg: Number(item.weightKg) || 0,
            mode: item.mode,
            unitPrice: item.unitPrice || null,
            priceType: item.priceType || null,
            totalPrice: item.totalPrice || null,
            unitCostPrice: item.unitCostPrice || null,
            costPriceType: item.costPriceType || null,
            totalCostPrice: item.totalCostPrice || null,
            supplierName: item.supplierName || null,
            userId: user?.id || 'usr_unknown',
            userName: user?.name || 'Operador',
            createdAtIso: nowIso,
            notes: notes?.trim() || '',
            status: 'CONFIRMED'
          });
        }
      }
    }
  }

  return { shipmentId, romaneioNumber, totalPrice: calculatedGrandTotalPrice };
};

/**
 * Cancels an Invoice and reverses stock movements with audit info
 */
export const cancelInvoice = async (
  invoiceId: string, 
  user: UserAccount, 
  reason: string
): Promise<void> => {
  const localInvoices = getLocalCollection<Invoice>('invoices');
  const inv = localInvoices.find(i => i.id === invoiceId);

  updateLocalDoc('invoices', invoiceId, {
    status: 'CANCELLED',
    cancelledAt: new Date().toISOString(),
    cancelledByUserId: user.id,
    cancelledByUserName: user.name,
    cancelReason: reason.trim()
  });

  const localMovements = getLocalCollection<StockMovement>('stockMovements');
  const updatedMovements = localMovements.map(m => {
    if (m.documentId === invoiceId && m.documentType === 'NOTA_FISCAL') {
      return {
        ...m,
        status: 'CANCELLED' as const,
        cancelledByUserId: user.id,
        cancelledByUserName: user.name,
        cancelReason: reason.trim()
      };
    }
    return m;
  });
  setLocalCollection('stockMovements', updatedMovements);

  if (getStorageMode() === 'firebase') {
    try {
      const invRef = doc(db, 'invoices', invoiceId);
      await updateDoc(invRef, {
        status: 'CANCELLED',
        cancelledAt: serverTimestamp(),
        cancelledByUserId: user.id,
        cancelledByUserName: user.name,
        cancelReason: reason.trim()
      });

      const q = query(
        collection(db, 'stockMovements'), 
        where('documentId', '==', invoiceId),
        where('documentType', '==', 'NOTA_FISCAL')
      );
      const movementsSnap = await getDocs(q);

      for (const docSnap of movementsSnap.docs) {
        await updateDoc(docSnap.ref, {
          status: 'CANCELLED',
          cancelledByUserId: user.id,
          cancelledByUserName: user.name,
          cancelReason: reason.trim()
        });
      }
    } catch (fbErr) {
      console.warn('Firebase cancelInvoice warning, preserved locally:', fbErr);
    }
  }

  // Record audit log
  await logAuditEvent({
    user,
    action: 'CANCELAMENTO_NOTA',
    actionLabel: 'Cancelamento de Nota Fiscal',
    targetType: 'NOTA',
    targetId: invoiceId,
    targetIdentifier: `Nota Fiscal: ${inv?.invoiceNumber || invoiceId} (${inv?.supplierName || ''})`,
    reason: reason.trim()
  });
};

/**
 * Permanently deletes an Invoice from database.
 * CRITICAL RULE: Reserved exclusively for ADMIN GERAL.
 */
export const deleteInvoicePermanently = async (
  invoiceId: string,
  user: UserAccount,
  reason?: string
): Promise<void> => {
  assertAdminGeral(user, 'excluir notas fiscais definitivamente');

  const localInvoices = getLocalCollection<Invoice>('invoices');
  const inv = localInvoices.find(i => i.id === invoiceId);

  deleteLocalDoc('invoices', invoiceId);

  const localMovements = getLocalCollection<StockMovement>('stockMovements');
  const filtered = localMovements.filter(m => !(m.documentId === invoiceId && m.documentType === 'NOTA_FISCAL'));
  setLocalCollection('stockMovements', filtered);

  if (getStorageMode() === 'firebase') {
    try {
      const q = query(
        collection(db, 'stockMovements'), 
        where('documentId', '==', invoiceId),
        where('documentType', '==', 'NOTA_FISCAL')
      );
      const movementsSnap = await getDocs(q);
      for (const docSnap of movementsSnap.docs) {
        await deleteDoc(docSnap.ref);
      }
      await deleteDoc(doc(db, 'invoices', invoiceId));
    } catch (fbErr) {
      console.warn('Firebase deleteInvoicePermanently warning, removed locally:', fbErr);
    }
  }

  await logAuditEvent({
    user,
    action: 'EXCLUSAO_NOTA',
    actionLabel: 'Exclusão Definitiva de Nota Fiscal',
    targetType: 'NOTA',
    targetId: invoiceId,
    targetIdentifier: `Nota Fiscal: ${inv?.invoiceNumber || invoiceId} (${inv?.supplierName || ''})`,
    reason: reason?.trim() || 'Exclusão definitiva efetuada pelo Administrador Geral'
  });
};

/**
 * Cancels a Shipment / Romaneio and reverses stock movements with audit info
 */
export const cancelShipment = async (
  shipmentId: string, 
  user: UserAccount, 
  reason: string
): Promise<void> => {
  const localShipments = getLocalCollection<Shipment>('shipments');
  const ship = localShipments.find(s => s.id === shipmentId);

  updateLocalDoc('shipments', shipmentId, {
    status: 'CANCELLED',
    cancelledAt: new Date().toISOString(),
    cancelledByUserId: user.id,
    cancelledByUserName: user.name,
    cancelReason: reason.trim()
  });

  const localMovements = getLocalCollection<StockMovement>('stockMovements');
  const updatedMovements = localMovements.map(m => {
    if (m.documentId === shipmentId && m.documentType === 'ROMANEIO') {
      return {
        ...m,
        status: 'CANCELLED' as const,
        cancelledByUserId: user.id,
        cancelledByUserName: user.name,
        cancelReason: reason.trim()
      };
    }
    return m;
  });
  setLocalCollection('stockMovements', updatedMovements);

  if (getStorageMode() === 'firebase') {
    try {
      const shipRef = doc(db, 'shipments', shipmentId);
      await updateDoc(shipRef, {
        status: 'CANCELLED',
        cancelledAt: serverTimestamp(),
        cancelledByUserId: user.id,
        cancelledByUserName: user.name,
        cancelReason: reason.trim()
      });

      const q = query(
        collection(db, 'stockMovements'), 
        where('documentId', '==', shipmentId),
        where('documentType', '==', 'ROMANEIO')
      );
      const movementsSnap = await getDocs(q);

      for (const docSnap of movementsSnap.docs) {
        await updateDoc(docSnap.ref, {
          status: 'CANCELLED',
          cancelledByUserId: user.id,
          cancelledByUserName: user.name,
          cancelReason: reason.trim()
        });
      }
    } catch (fbErr) {
      console.warn('Firebase cancelShipment warning, preserved locally:', fbErr);
    }
  }

  const storeNames = (ship?.destinations || []).map((d: any) => d.storeName).join(', ');
  await logAuditEvent({
    user,
    action: 'CANCELAMENTO_ROMANEIO',
    actionLabel: 'Cancelamento de Romaneio',
    targetType: 'ROMANEIO',
    targetId: shipmentId,
    targetIdentifier: `Romaneio: Nº ${ship?.romaneioNumber || shipmentId} [${storeNames}]`,
    reason: reason.trim()
  });
};

/**
 * Permanently deletes a Shipment / Romaneio from database.
 * CRITICAL RULE: Reserved exclusively for ADMIN GERAL.
 */
export const deleteShipmentPermanently = async (
  shipmentId: string,
  user: UserAccount,
  reason?: string
): Promise<void> => {
  assertAdminGeral(user, 'excluir romaneios definitivamente');

  const localShipments = getLocalCollection<Shipment>('shipments');
  const ship = localShipments.find(s => s.id === shipmentId);

  deleteLocalDoc('shipments', shipmentId);

  const localMovements = getLocalCollection<StockMovement>('stockMovements');
  const filtered = localMovements.filter(m => !(m.documentId === shipmentId && m.documentType === 'ROMANEIO'));
  setLocalCollection('stockMovements', filtered);

  if (getStorageMode() === 'firebase') {
    try {
      const q = query(
        collection(db, 'stockMovements'), 
        where('documentId', '==', shipmentId),
        where('documentType', '==', 'ROMANEIO')
      );
      const movementsSnap = await getDocs(q);
      for (const docSnap of movementsSnap.docs) {
        await deleteDoc(docSnap.ref);
      }
      await deleteDoc(doc(db, 'shipments', shipmentId));
    } catch (fbErr) {
      console.warn('Firebase deleteShipmentPermanently warning, removed locally:', fbErr);
    }
  }

  const storeNames = (ship?.destinations || []).map((d: any) => d.storeName).join(', ');
  await logAuditEvent({
    user,
    action: 'EXCLUSAO_ROMANEIO',
    actionLabel: 'Exclusão Definitiva de Romaneio',
    targetType: 'ROMANEIO',
    targetId: shipmentId,
    targetIdentifier: `Romaneio: Nº ${ship?.romaneioNumber || shipmentId} [${storeNames}]`,
    reason: reason?.trim() || 'Exclusão definitiva efetuada pelo Administrador Geral'
  });
};

/**
 * Updates item weights for a Shipment / Romaneio and recalculates subtotals,
 * total price, and synchronizes the associated stock movements.
 */
export const updateShipmentWeights = async (params: {
  shipmentId: string;
  updatedDestinations: ShipmentDestination[];
  user: UserAccount;
  reason?: string;
}): Promise<Shipment> => {
  const { shipmentId, updatedDestinations, user, reason } = params;

  const localShipments = getLocalCollection<Shipment>('shipments');
  const existingShipment = localShipments.find(s => s.id === shipmentId);
  if (!existingShipment) {
    throw new Error('Romaneio não encontrado para alteração de peso.');
  }

  // Recalculate totals
  let totalBoxes = 0;
  let totalWeightKg = 0;
  let grandTotalPrice = 0;
  let grandTotalCostPrice = 0;

  const sanitizedDestinations: ShipmentDestination[] = updatedDestinations.map(dest => {
    let destSubtotalWeight = 0;
    let destSubtotalBoxes = 0;
    let destSubtotalPrice = 0;
    let destSubtotalCostPrice = 0;

    const items = dest.items.map(item => {
      const boxes = Number(item.quantityBoxes) || 0;
      const weightKg = Math.max(0, Number(item.weightKg) || 0);
      const unitPrice = Number(item.unitPrice) || 0;
      const priceType = item.priceType || 'POR_KG';

      let calculatedItemTotal = 0;
      if (unitPrice > 0) {
        calculatedItemTotal = priceType === 'POR_KG' ? weightKg * unitPrice : boxes * unitPrice;
        calculatedItemTotal = Math.round(calculatedItemTotal * 100) / 100;
      } else if (item.totalPrice && item.totalPrice > 0) {
        calculatedItemTotal = item.totalPrice;
      }

      // Cost price (INTERNAL CONTROL ONLY)
      const unitCost = Number(item.unitCostPrice) || 0;
      const costType = item.costPriceType || 'POR_UNIDADE';
      let calculatedItemCost = 0;
      if (unitCost > 0) {
        calculatedItemCost = costType === 'POR_KG' ? weightKg * unitCost : boxes * unitCost;
        calculatedItemCost = Math.round(calculatedItemCost * 100) / 100;
      } else if (item.totalCostPrice && item.totalCostPrice > 0) {
        calculatedItemCost = item.totalCostPrice;
      }

      destSubtotalBoxes += boxes;
      destSubtotalWeight += weightKg;
      destSubtotalPrice += calculatedItemTotal;
      destSubtotalCostPrice += calculatedItemCost;

      return {
        ...item,
        quantityBoxes: boxes,
        weightKg: Math.round(weightKg * 100) / 100,
        unitPrice: unitPrice > 0 ? unitPrice : undefined,
        priceType: unitPrice > 0 ? priceType : undefined,
        totalPrice: calculatedItemTotal > 0 ? calculatedItemTotal : undefined,
        unitCostPrice: unitCost > 0 ? unitCost : undefined,
        costPriceType: unitCost > 0 ? costType : undefined,
        totalCostPrice: calculatedItemCost > 0 ? calculatedItemCost : undefined
      };
    });

    destSubtotalWeight = Math.round(destSubtotalWeight * 100) / 100;
    destSubtotalBoxes = Math.round(destSubtotalBoxes * 100) / 100;
    destSubtotalPrice = Math.round(destSubtotalPrice * 100) / 100;
    destSubtotalCostPrice = Math.round(destSubtotalCostPrice * 100) / 100;

    totalBoxes += destSubtotalBoxes;
    totalWeightKg += destSubtotalWeight;
    grandTotalPrice += destSubtotalPrice;
    grandTotalCostPrice += destSubtotalCostPrice;

    return {
      ...dest,
      items,
      subtotalBoxes: destSubtotalBoxes,
      subtotalWeightKg: destSubtotalWeight,
      subtotalPrice: destSubtotalPrice > 0 ? destSubtotalPrice : undefined,
      subtotalCostPrice: destSubtotalCostPrice > 0 ? destSubtotalCostPrice : undefined
    };
  });

  totalBoxes = Math.round(totalBoxes * 100) / 100;
  totalWeightKg = Math.round(totalWeightKg * 100) / 100;
  grandTotalPrice = Math.round(grandTotalPrice * 100) / 100;
  grandTotalCostPrice = Math.round(grandTotalCostPrice * 100) / 100;

  const updatedShipmentPayload: Partial<Shipment> = {
    destinations: sanitizedDestinations,
    totalBoxes,
    totalWeightKg,
    totalPrice: grandTotalPrice > 0 ? grandTotalPrice : undefined,
    totalCostPrice: grandTotalCostPrice > 0 ? grandTotalCostPrice : undefined,
    updatedAt: new Date().toISOString(),
    lastModifiedByUserId: user.id,
    lastModifiedByUserName: user.name,
    weightAdjustmentNotes: reason?.trim() || `Alteração de peso e valores no romaneio`
  };

  // Update local shipment
  updateLocalDoc('shipments', shipmentId, updatedShipmentPayload);

  // Update corresponding stock movements
  const localMovements = getLocalCollection<StockMovement>('stockMovements');
  const updatedMovements = localMovements.map(m => {
    if (m.documentId === shipmentId && m.documentType === 'ROMANEIO') {
      for (const dest of sanitizedDestinations) {
        if (!m.storeId || m.storeId === dest.storeId || m.storeName === dest.storeName) {
          const matchedItem = dest.items.find(it => it.productId === m.productId);
          if (matchedItem) {
            return {
              ...m,
              weightKg: matchedItem.weightKg,
              boxes: matchedItem.quantityBoxes,
              unitPrice: matchedItem.unitPrice || undefined,
              priceType: matchedItem.priceType || undefined,
              totalPrice: matchedItem.totalPrice || undefined,
              unitCostPrice: matchedItem.unitCostPrice || undefined,
              costPriceType: matchedItem.costPriceType || undefined,
              totalCostPrice: matchedItem.totalCostPrice || undefined
            };
          }
        }
      }
    }
    return m;
  });
  setLocalCollection('stockMovements', updatedMovements);

  // Sync with Firebase if in firebase mode
  if (getStorageMode() === 'firebase') {
    try {
      const shipRef = doc(db, 'shipments', shipmentId);
      await updateDoc(shipRef, removeUndefinedFields({
        ...updatedShipmentPayload,
        updatedAt: serverTimestamp()
      }));

      // Update movements in Firebase
      const q = query(
        collection(db, 'stockMovements'),
        where('documentId', '==', shipmentId),
        where('documentType', '==', 'ROMANEIO')
      );
      const movementsSnap = await getDocs(q);
      for (const docSnap of movementsSnap.docs) {
        const data = docSnap.data();
        for (const dest of sanitizedDestinations) {
          if (!data.storeId || data.storeId === dest.storeId || data.storeName === dest.storeName) {
            const matchedItem = dest.items.find(it => it.productId === data.productId);
            if (matchedItem) {
              await updateDoc(docSnap.ref, removeUndefinedFields({
                weightKg: matchedItem.weightKg,
                boxes: matchedItem.quantityBoxes,
                unitPrice: matchedItem.unitPrice || null,
                priceType: matchedItem.priceType || null,
                totalPrice: matchedItem.totalPrice || null,
                unitCostPrice: matchedItem.unitCostPrice || null,
                costPriceType: matchedItem.costPriceType || null,
                totalCostPrice: matchedItem.totalCostPrice || null
              }));
              break;
            }
          }
        }
      }
    } catch (fbErr) {
      console.warn('Firebase updateShipmentWeights warning, saved locally:', fbErr);
    }
  }

  // Audit event
  const storeNames = sanitizedDestinations.map(d => d.storeName).join(', ');
  await logAuditEvent({
    user,
    action: 'AJUSTE_PESO_ROMANEIO',
    actionLabel: 'Alteração de Peso e Valores do Romaneio',
    targetType: 'ROMANEIO',
    targetId: shipmentId,
    targetIdentifier: `Romaneio Nº ${existingShipment.romaneioNumber} [${storeNames}]`,
    reason: reason?.trim() || `Alteração de peso: ${existingShipment.totalWeightKg.toFixed(2)} kg ➔ ${totalWeightKg.toFixed(2)} kg`,
    details: {
      previousWeightKg: existingShipment.totalWeightKg,
      newWeightKg: totalWeightKg,
      previousTotalPrice: existingShipment.totalPrice,
      newTotalPrice: grandTotalPrice,
      newTotalCostPrice: grandTotalCostPrice
    }
  });

  return {
    ...existingShipment,
    ...updatedShipmentPayload
  } as Shipment;
};

/**
 * Registers a manual stock adjustment / inventory balance correction
 */
export const registerStockAdjustment = async (params: {
  productId: string;
  productCode: string;
  productName: string;
  unit: any;
  currentBoxes: number;
  currentWeightKg: number;
  targetBoxes: number;
  targetWeightKg: number;
  reason: string;
  user: UserAccount;
}): Promise<void> => {
  const deltaBoxes = Math.round((params.targetBoxes - params.currentBoxes) * 100) / 100;
  const deltaWeightKg = Math.round((params.targetWeightKg - params.currentWeightKg) * 100) / 100;

  if (deltaBoxes === 0 && deltaWeightKg === 0) {
    throw new Error('Nenhuma alteração detectada entre o saldo atual e o saldo informado.');
  }

  const nowIso = new Date().toISOString();
  const documentId = `adj_${Date.now()}`;
  const dateStr = nowIso.slice(0, 10);
  const docNumber = `AJUSTE ${dateStr}`;

  const movementsToAdd: any[] = [];

  if (deltaBoxes >= 0 && deltaWeightKg >= 0) {
    movementsToAdd.push({
      type: 'ENTRADA',
      documentType: 'AJUSTE',
      documentNumber: docNumber,
      documentId,
      productId: params.productId,
      productCode: params.productCode,
      productName: params.productName,
      unit: params.unit,
      boxes: deltaBoxes,
      weightKg: deltaWeightKg,
      mode: 'by_unit',
      userId: params.user.id,
      userName: params.user.name,
      createdAtIso: nowIso,
      notes: `Ajuste Manual / Inventário (+${deltaBoxes} cx, +${deltaWeightKg.toFixed(2)} kg): ${params.reason.trim()}`,
      status: 'CONFIRMED'
    });
  } else if (deltaBoxes <= 0 && deltaWeightKg <= 0) {
    movementsToAdd.push({
      type: 'SAIDA',
      documentType: 'AJUSTE',
      documentNumber: docNumber,
      documentId,
      productId: params.productId,
      productCode: params.productCode,
      productName: params.productName,
      unit: params.unit,
      boxes: Math.abs(deltaBoxes),
      weightKg: Math.abs(deltaWeightKg),
      mode: 'by_unit',
      userId: params.user.id,
      userName: params.user.name,
      createdAtIso: nowIso,
      notes: `Ajuste Manual / Inventário (${deltaBoxes} cx, ${deltaWeightKg.toFixed(2)} kg): ${params.reason.trim()}`,
      status: 'CONFIRMED'
    });
  } else {
    if (deltaBoxes > 0) {
      movementsToAdd.push({
        type: 'ENTRADA',
        documentType: 'AJUSTE',
        documentNumber: `${docNumber} (QTD)`,
        documentId,
        productId: params.productId,
        productCode: params.productCode,
        productName: params.productName,
        unit: params.unit,
        boxes: deltaBoxes,
        weightKg: 0,
        mode: 'by_unit',
        userId: params.user.id,
        userName: params.user.name,
        createdAtIso: nowIso,
        notes: `Ajuste de Caixas (+${deltaBoxes} cx): ${params.reason.trim()}`,
        status: 'CONFIRMED'
      });
    } else if (deltaBoxes < 0) {
      movementsToAdd.push({
        type: 'SAIDA',
        documentType: 'AJUSTE',
        documentNumber: `${docNumber} (QTD)`,
        documentId,
        productId: params.productId,
        productCode: params.productCode,
        productName: params.productName,
        unit: params.unit,
        boxes: Math.abs(deltaBoxes),
        weightKg: 0,
        mode: 'by_unit',
        userId: params.user.id,
        userName: params.user.name,
        createdAtIso: nowIso,
        notes: `Ajuste de Caixas (${deltaBoxes} cx): ${params.reason.trim()}`,
        status: 'CONFIRMED'
      });
    }

    if (deltaWeightKg > 0) {
      movementsToAdd.push({
        type: 'ENTRADA',
        documentType: 'AJUSTE',
        documentNumber: `${docNumber} (PESO)`,
        documentId,
        productId: params.productId,
        productCode: params.productCode,
        productName: params.productName,
        unit: params.unit,
        boxes: 0,
        weightKg: deltaWeightKg,
        mode: 'by_weight',
        userId: params.user.id,
        userName: params.user.name,
        createdAtIso: nowIso,
        notes: `Ajuste de Peso (+${deltaWeightKg.toFixed(2)} kg): ${params.reason.trim()}`,
        status: 'CONFIRMED'
      });
    } else if (deltaWeightKg < 0) {
      movementsToAdd.push({
        type: 'SAIDA',
        documentType: 'AJUSTE',
        documentNumber: `${docNumber} (PESO)`,
        documentId,
        productId: params.productId,
        productCode: params.productCode,
        productName: params.productName,
        unit: params.unit,
        boxes: 0,
        weightKg: Math.abs(deltaWeightKg),
        mode: 'by_weight',
        userId: params.user.id,
        userName: params.user.name,
        createdAtIso: nowIso,
        notes: `Ajuste de Peso (${deltaWeightKg.toFixed(2)} kg): ${params.reason.trim()}`,
        status: 'CONFIRMED'
      });
    }
  }

  // Save movements locally
  for (const mov of movementsToAdd) {
    saveLocalDoc('stockMovements', mov);
  }

  if (getStorageMode() === 'firebase') {
    try {
      for (const mov of movementsToAdd) {
        await addDoc(collection(db, 'stockMovements'), {
          ...mov,
          timestamp: serverTimestamp()
        });
      }
    } catch (fbErr) {
      console.warn('Firebase registerStockAdjustment warning, preserved locally:', fbErr);
    }
  }

  await logAuditEvent({
    user: params.user,
    action: 'AJUSTE_ESTOQUE',
    actionLabel: 'Ajuste de Saldo de Estoque',
    targetType: 'ESTOQUE',
    targetId: params.productId,
    targetIdentifier: `${params.productName} (Cód: ${params.productCode})`,
    reason: params.reason.trim(),
    details: {
      previousBoxes: params.currentBoxes,
      targetBoxes: params.targetBoxes,
      deltaBoxes,
      previousWeightKg: params.currentWeightKg,
      targetWeightKg: params.targetWeightKg,
      deltaWeightKg
    }
  });
};

/**
 * Updates item cost prices on an existing Invoice, recalculates its total cost,
 * and synchronizes the associated stock movements so internal reports and profit metrics are accurate.
 */
export const updateInvoiceCostPrices = async (params: {
  invoiceId: string;
  items: {
    id: string;
    unitCostPrice?: number;
    costPriceType?: 'POR_KG' | 'POR_UNIDADE';
    totalCostPrice?: number;
  }[];
  user: UserAccount;
  saveCostsToProducts?: boolean;
}): Promise<Invoice> => {
  const { invoiceId, items: updatedItemsData, user, saveCostsToProducts } = params;

  const localInvoices = getLocalCollection<Invoice>('invoices');
  const existingInvoice = localInvoices.find(inv => inv.id === invoiceId);
  if (!existingInvoice) {
    throw new Error('Nota Fiscal não encontrada para atualização de custos.');
  }

  let newTotalCostPrice = 0;
  const updatedItems = existingInvoice.items.map(item => {
    const patch = updatedItemsData.find(u => u.id === item.id);
    if (!patch) {
      if (item.totalCostPrice && item.totalCostPrice > 0) {
        newTotalCostPrice += item.totalCostPrice;
      }
      return item;
    }

    const qty = Number(item.quantityBoxes) || 0;
    const wt = Number(item.weightKg) || 0;
    const unitCost = typeof patch.unitCostPrice === 'number' && !isNaN(patch.unitCostPrice) && patch.unitCostPrice > 0
      ? Number(patch.unitCostPrice)
      : undefined;
    const costType = patch.costPriceType || item.costPriceType || 'POR_UNIDADE';

    let itemTotalCost: number | undefined = undefined;
    if (patch.totalCostPrice !== undefined && patch.totalCostPrice > 0) {
      itemTotalCost = Math.round(patch.totalCostPrice * 100) / 100;
    } else if (unitCost !== undefined && unitCost > 0) {
      if (costType === 'POR_KG') {
        itemTotalCost = Math.round(wt * unitCost * 100) / 100;
      } else {
        itemTotalCost = Math.round(qty * unitCost * 100) / 100;
      }
    }

    if (itemTotalCost && itemTotalCost > 0) {
      newTotalCostPrice += itemTotalCost;
    }

    return {
      ...item,
      unitCostPrice: unitCost,
      costPriceType: costType,
      totalCostPrice: itemTotalCost
    };
  });

  const updatedInvoice: Invoice = {
    ...existingInvoice,
    items: updatedItems,
    totalCostPrice: newTotalCostPrice > 0 ? Math.round(newTotalCostPrice * 100) / 100 : undefined
  };

  // 1. Update invoice locally
  updateLocalDoc('invoices', invoiceId, updatedInvoice);

  // 2. Synchronize stock movements locally
  const localMovements = getLocalCollection<StockMovement>('stockMovements');
  for (const it of updatedItems) {
    for (const mov of localMovements) {
      if (
        (mov.documentId === invoiceId || mov.documentNumber === `NF ${existingInvoice.invoiceNumber.trim()}`) &&
        mov.productId === it.productId &&
        mov.type === 'ENTRADA'
      ) {
        updateLocalDoc('stockMovements', mov.id, {
          unitCostPrice: it.unitCostPrice,
          costPriceType: it.costPriceType,
          totalCostPrice: it.totalCostPrice
        });
      }
    }
  }

  // 3. Update Firebase if active
  if (getStorageMode() === 'firebase') {
    try {
      const invRef = doc(db, 'invoices', invoiceId);
      await updateDoc(invRef, {
        items: updatedItems,
        totalCostPrice: updatedInvoice.totalCostPrice || null,
        updatedAt: serverTimestamp()
      });

      // Synchronize movements in Firebase
      const q = query(
        collection(db, 'stockMovements'),
        where('documentId', '==', invoiceId)
      );
      const snapshot = await getDocs(q);
      for (const d of snapshot.docs) {
        const movData = d.data() as StockMovement;
        const matchedItem = updatedItems.find(it => it.productId === movData.productId);
        if (matchedItem) {
          await updateDoc(d.ref, {
            unitCostPrice: matchedItem.unitCostPrice || null,
            costPriceType: matchedItem.costPriceType || null,
            totalCostPrice: matchedItem.totalCostPrice || null
          });
        }
      }
    } catch (fbErr) {
      console.warn('Firebase updateInvoiceCostPrices warning:', fbErr);
    }
  }

  // 4. Optionally update standard cost price in product catalog
  if (saveCostsToProducts) {
    for (const it of updatedItems) {
      if (it.productId && typeof it.unitCostPrice === 'number' && it.unitCostPrice > 0) {
        try {
          await updateProductCostPrice(
            it.productId,
            it.unitCostPrice,
            it.costPriceType || 'POR_UNIDADE',
            user
          );
        } catch (pErr) {
          console.warn('Could not update product cost price:', pErr);
        }
      }
    }
  }

  // 5. Audit log
  await logAuditEvent({
    user,
    action: 'AJUSTE_VALOR_PRODUTO',
    actionLabel: 'Alteração de Custo da Nota Fiscal (Controle Interno)',
    targetType: 'NOTA',
    targetId: invoiceId,
    targetIdentifier: `NF ${existingInvoice.invoiceNumber} (${existingInvoice.supplierName})`,
    reason: `Atualização de preços de compra/custo da nota. Novo custo total: R$ ${(updatedInvoice.totalCostPrice || 0).toFixed(2)}`
  });

  return updatedInvoice;
};
