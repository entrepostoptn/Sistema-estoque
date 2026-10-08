import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  serverTimestamp,
  onSnapshot
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { Product, UnitType, UserAccount } from '../types';
import { assertAdminGeral } from './authPermissions';
import { logAuditEvent } from './auditService';
import { 
  getStorageMode, 
  getLocalCollection, 
  saveLocalDoc, 
  updateLocalDoc, 
  deleteLocalDoc, 
  setLocalCollection,
  subscribeLocalCollection 
} from './localStorageAdapter';

export const validateProductCode = (code: string): { isValid: boolean; error?: string } => {
  const trimmed = code.trim();
  if (!trimmed) {
    return { isValid: false, error: 'O código do produto é obrigatório.' };
  }
  if (!/^\d+$/.test(trimmed)) {
    return { isValid: false, error: 'O código deve conter apenas números (sem letras ou símbolos).' };
  }
  if (trimmed.length < 2 || trimmed.length > 4) {
    return { isValid: false, error: 'O código deve ter entre 2 e 4 dígitos numéricos (ex: 10, 101, 1001).' };
  }
  return { isValid: true };
};

/**
 * Normalizes text for comparison by removing accents, collapsing spaces, and uppercasing.
 * E.g., "CONTRAFILÉ", "contrafile", "Contrafilé  " all normalize to "CONTRAFILE".
 */
export const normalizeText = (text?: string | null): string => {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
};

export const checkProductCodeUnique = async (code: string, excludeProductId?: string): Promise<boolean> => {
  const trimmed = code.trim();

  // Local check first
  const localProducts = getLocalCollection<Product>('products');
  const localMatch = localProducts.find(p => p.code === trimmed && p.id !== excludeProductId);
  if (localMatch) return false;

  if (getStorageMode() === 'local') {
    return true;
  }

  try {
    const q = query(collection(db, 'products'), where('code', '==', trimmed));
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) return true;
    if (!excludeProductId) return false;
    
    return snapshot.docs.every(d => d.id === excludeProductId);
  } catch (err) {
    console.warn('Firebase uniqueness check fallback to local:', err);
    return true;
  }
};

/**
 * Calculates the next sequential numeric product code available
 * Defaults to 101 if no numeric products exist.
 */
export const getNextSequentialProductCode = (productsList?: Product[]): string => {
  const list = productsList && productsList.length > 0 ? productsList : getLocalCollection<Product>('products');
  const numericCodes = list
    .map(p => parseInt(p.code?.trim() || '', 10))
    .filter(n => !isNaN(n) && n > 0);

  if (numericCodes.length === 0) {
    return '101';
  }

  const maxCode = Math.max(...numericCodes);
  return String(maxCode + 1);
};

/**
 * Blocks registration if:
 * 1. Product name is identical to supplier name
 * 2. Another product with the exact SAME product name and SAME supplier already exists
 */
export const checkProductNameSupplierDuplicate = async (
  name: string,
  supplierName?: string,
  excludeProductId?: string,
  productsList?: Product[],
  supplierId?: string
): Promise<{ isDuplicate: boolean; error?: string; duplicateProduct?: Product }> => {
  const normName = normalizeText(name);
  const normSupplier = normalizeText(supplierName);

  if (!normName) {
    return { isDuplicate: false };
  }

  // 1. Literal check: Product name cannot be identical to supplier name
  if (normSupplier && normName === normSupplier) {
    return {
      isDuplicate: true,
      error: 'O nome do produto não pode ser idêntico ao nome do fornecedor.'
    };
  }

  // 2. Duplicity check: Check if product with SAME name and SAME supplier already exists
  const candidatesMap = new Map<string, Product>();

  // From local collection
  const localList = getLocalCollection<Product>('products');
  for (const p of localList) {
    if (p.id) candidatesMap.set(p.id, p);
  }

  // From passed list (e.g. state in component)
  if (productsList && productsList.length > 0) {
    for (const p of productsList) {
      if (p.id) candidatesMap.set(p.id, p);
    }
  }

  // From Firestore if firebase mode is active to ensure zero stale reads
  if (getStorageMode() === 'firebase') {
    try {
      const snap = await getDocs(collection(db, 'products'));
      for (const d of snap.docs) {
        candidatesMap.set(d.id, { id: d.id, ...(d.data() as any) });
      }
    } catch (e) {
      // ignore
    }
  }

  const list = Array.from(candidatesMap.values());

  const duplicate = list.find(p => {
    if (excludeProductId && p.id === excludeProductId) return false;

    const pNormName = normalizeText(p.name);
    const pNormSupplier = normalizeText(p.supplierName);

    // Names must match (accent and case insensitive)
    if (pNormName !== normName) return false;

    // Supplier match criteria:
    // a) Both have identical normalized supplier name
    // b) Both have identical non-empty supplierId
    // c) Neither has a supplier assigned (both empty)
    const sameSupplierName = Boolean(normSupplier && pNormSupplier && normSupplier === pNormSupplier);
    const sameSupplierId = Boolean(supplierId && p.supplierId && supplierId === p.supplierId);
    const bothWithoutSupplier = !normSupplier && !pNormSupplier;

    return sameSupplierName || sameSupplierId || bothWithoutSupplier;
  });

  if (duplicate) {
    const suppText = duplicate.supplierName || supplierName
      ? `para o fornecedor "${duplicate.supplierName || supplierName}"`
      : 'sem fornecedor associado';
    return {
      isDuplicate: true,
      duplicateProduct: duplicate,
      error: `Já existe um produto cadastrado com o nome "${duplicate.name}" ${suppText} (Código: ${duplicate.code}). Não é permitido cadastrar produtos com o mesmo nome e mesmo fornecedor.`
    };
  }

  return { isDuplicate: false };
};

export const createProduct = async (
  data: {
    code: string;
    name: string;
    unit: UnitType;
    defaultWeightKg: number;
    supplierId?: string;
    supplierName?: string;
    supplierProductCode?: string;
    ncm?: string;
    costPrice?: number;
    costPriceType?: 'POR_KG' | 'POR_UNIDADE';
    salePrice?: number;
    salePriceType?: 'POR_KG' | 'POR_UNIDADE';
    active: boolean;
  },
  user?: UserAccount
): Promise<string> => {
  const codeVal = validateProductCode(data.code);
  if (!codeVal.isValid) {
    throw new Error(codeVal.error);
  }

  const isUnique = await checkProductCodeUnique(data.code);
  if (!isUnique) {
    throw new Error(`O código ${data.code} já está cadastrado para outro produto. Escolha um código único.`);
  }

  const cleanName = data.name.trim().toUpperCase();
  if (!cleanName) {
    throw new Error('O nome do produto é obrigatório.');
  }

  // Validate duplicate product name and supplier
  const dupCheck = await checkProductNameSupplierDuplicate(
    cleanName, 
    data.supplierName, 
    undefined, 
    undefined, 
    data.supplierId
  );
  if (dupCheck.isDuplicate) {
    throw new Error(dupCheck.error);
  }

  const payload: Record<string, any> = {
    code: data.code.trim(),
    name: cleanName,
    unit: data.unit,
    defaultWeightKg: Number(data.defaultWeightKg) || 0,
    supplierId: data.supplierId?.trim() || '',
    supplierName: data.supplierName?.trim() || '',
    supplierProductCode: data.supplierProductCode?.trim() || '',
    ncm: data.ncm?.trim() || '',
    costPrice: typeof data.costPrice === 'number' && data.costPrice > 0 ? Number(data.costPrice) : undefined,
    costPriceType: data.costPriceType || 'POR_UNIDADE',
    salePrice: Number(data.salePrice) || 0,
    salePriceType: data.salePriceType || 'POR_KG',
    active: data.active !== false,
  };

  let generatedId = '';

  if (getStorageMode() === 'local') {
    generatedId = saveLocalDoc('products', payload);
  } else {
    try {
      const docRef = await addDoc(collection(db, 'products'), {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      generatedId = docRef.id;
      // Mirror to local storage
      saveLocalDoc('products', { id: generatedId, ...payload });
    } catch (fbErr) {
      console.warn('Firebase createProduct failed, falling back to local:', fbErr);
      generatedId = saveLocalDoc('products', payload);
    }
  }

  if (user) {
    await logAuditEvent({
      user,
      action: 'CRIACAO_PRODUTO',
      actionLabel: 'Cadastro de Produto',
      targetType: 'PRODUTO',
      targetId: generatedId,
      targetIdentifier: `${cleanName} (Cód: ${data.code.trim()})`,
      reason: 'Novo produto cadastrado no catálogo'
    });
  }

  return generatedId;
};

export const updateProduct = async (
  id: string, 
  data: {
    code: string;
    name: string;
    unit: UnitType;
    defaultWeightKg: number;
    supplierId?: string;
    supplierName?: string;
    costPrice?: number;
    costPriceType?: 'POR_KG' | 'POR_UNIDADE';
    salePrice?: number;
    salePriceType?: 'POR_KG' | 'POR_UNIDADE';
    active: boolean;
  },
  user?: UserAccount
): Promise<void> => {
  const codeVal = validateProductCode(data.code);
  if (!codeVal.isValid) {
    throw new Error(codeVal.error);
  }

  const isUnique = await checkProductCodeUnique(data.code, id);
  if (!isUnique) {
    throw new Error(`O código ${data.code} já está cadastrado para outro produto.`);
  }

  const cleanName = data.name.trim().toUpperCase();
  if (!cleanName) {
    throw new Error('O nome do produto é obrigatório.');
  }

  // Validate duplicate product name and supplier
  const dupCheck = await checkProductNameSupplierDuplicate(
    cleanName, 
    data.supplierName, 
    id, 
    undefined, 
    data.supplierId
  );
  if (dupCheck.isDuplicate) {
    throw new Error(dupCheck.error);
  }

  const payload: Record<string, any> = {
    code: data.code.trim(),
    name: cleanName,
    unit: data.unit,
    defaultWeightKg: Number(data.defaultWeightKg) || 0,
    supplierId: data.supplierId?.trim() || '',
    supplierName: data.supplierName?.trim() || '',
    costPrice: typeof data.costPrice === 'number' && data.costPrice > 0 ? Number(data.costPrice) : undefined,
    costPriceType: data.costPriceType || 'POR_UNIDADE',
    salePrice: Number(data.salePrice) || 0,
    salePriceType: data.salePriceType || 'POR_KG',
    active: data.active
  };

  // Update locally first
  updateLocalDoc('products', id, payload);

  if (getStorageMode() === 'firebase') {
    try {
      const productRef = doc(db, 'products', id);
      await updateDoc(productRef, {
        ...payload,
        updatedAt: serverTimestamp()
      });
    } catch (fbErr) {
      console.warn('Firebase updateProduct failed, preserved locally:', fbErr);
    }
  }

  if (user) {
    await logAuditEvent({
      user,
      action: 'ALTERACAO_PRODUTO',
      actionLabel: 'Alteração de Dados do Produto',
      targetType: 'PRODUTO',
      targetId: id,
      targetIdentifier: `${cleanName} (Cód: ${data.code.trim()})`,
      reason: 'Atualização cadastral do produto'
    });
  }
};

/**
 * Updates only the internal cost price of a product (e.g. when entered via an invoice)
 */
export const updateProductCostPrice = async (
  id: string,
  costPrice: number,
  costPriceType: 'POR_KG' | 'POR_UNIDADE' = 'POR_UNIDADE',
  user?: UserAccount
): Promise<void> => {
  const localProducts = getLocalCollection<Product>('products');
  const existing = localProducts.find(p => p.id === id);
  if (!existing) return;

  const payload = {
    costPrice: costPrice > 0 ? Number(costPrice) : undefined,
    costPriceType
  };

  updateLocalDoc('products', id, payload);

  if (getStorageMode() === 'firebase') {
    try {
      const productRef = doc(db, 'products', id);
      await updateDoc(productRef, {
        ...payload,
        updatedAt: serverTimestamp()
      });
    } catch (fbErr) {
      console.warn('Firebase updateProductCostPrice warning:', fbErr);
    }
  }

  if (user) {
    await logAuditEvent({
      user,
      action: 'AJUSTE_VALOR_PRODUTO',
      actionLabel: 'Atualização de Custo do Produto (Controle Interno)',
      targetType: 'PRODUTO',
      targetId: id,
      targetIdentifier: `${existing.name} (Cód: ${existing.code})`,
      reason: `Atualização de custo de compra para R$ ${costPrice.toFixed(2)} (${costPriceType})`
    });
  }
};

export const toggleProductStatus = async (
  id: string, 
  currentActive: boolean,
  user?: UserAccount
): Promise<void> => {
  const localProducts = getLocalCollection<Product>('products');
  const item = localProducts.find(p => p.id === id);
  const prodName = item?.name || id;
  const prodCode = item?.code || '';

  updateLocalDoc('products', id, { active: !currentActive });

  if (getStorageMode() === 'firebase') {
    try {
      const productRef = doc(db, 'products', id);
      await updateDoc(productRef, {
        active: !currentActive,
        updatedAt: serverTimestamp()
      });
    } catch (fbErr) {
      console.warn('Firebase toggleProductStatus failed, preserved locally:', fbErr);
    }
  }

  if (user) {
    await logAuditEvent({
      user,
      action: 'ALTERACAO_PRODUTO',
      actionLabel: currentActive ? 'Inativação de Produto' : 'Reativação de Produto',
      targetType: 'PRODUTO',
      targetId: id,
      targetIdentifier: `${prodName} (Cód: ${prodCode})`,
      reason: currentActive ? 'Produto inativado' : 'Produto reativado'
    });
  }
};

export const deleteProduct = async (id: string, user?: UserAccount): Promise<void> => {
  // CRITICAL REQUIREMENT: Exclusão definitiva is strictly reserved for ADMIN GERAL
  assertAdminGeral(user, 'excluir produtos definitivamente');

  const localProducts = getLocalCollection<Product>('products');
  const prod = localProducts.find(p => p.id === id);
  const prodName = prod?.name || 'Produto sem nome';
  const prodCode = prod?.code || 'Sem código';

  // Check movements locally
  const localMovements = getLocalCollection<any>('stockMovements');
  const hasMovements = localMovements.some(m => m.productId === id);
  if (hasMovements) {
    throw new Error('Não é possível excluir este produto pois já existem movimentações de estoque registradas para ele. Inative o produto para manter a integridade fiscal.');
  }

  deleteLocalDoc('products', id);

  if (getStorageMode() === 'firebase') {
    try {
      const productRef = doc(db, 'products', id);
      await deleteDoc(productRef);
    } catch (fbErr) {
      console.warn('Firebase deleteProduct failed, removed locally:', fbErr);
    }
  }

  if (user) {
    await logAuditEvent({
      user,
      action: 'EXCLUSAO_PRODUTO',
      actionLabel: 'Exclusão Definitiva de Produto',
      targetType: 'PRODUTO',
      targetId: id,
      targetIdentifier: `Produto: ${prodName} (Cód: ${prodCode})`,
      reason: 'Exclusão definitiva executada pelo Administrador Geral'
    });
  }
};

export const subscribeProducts = (callback: (products: Product[]) => void) => {
  if (getStorageMode() === 'local') {
    return subscribeLocalCollection<Product>('products', callback);
  }

  const q = query(collection(db, 'products'), orderBy('code', 'asc'));
  return onSnapshot(q, (snapshot) => {
    const list: Product[] = snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...(docSnap.data() as Omit<Product, 'id'>)
    }));
    // Keep local backup updated
    setLocalCollection('products', list);
    callback(list);
  }, (error) => {
    console.warn('Firebase products listener warning, falling back to local storage:', error);
    callback(getLocalCollection<Product>('products'));
  });
};
