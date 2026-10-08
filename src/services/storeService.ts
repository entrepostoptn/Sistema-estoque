import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  setDoc,
  query, 
  orderBy, 
  serverTimestamp, 
  onSnapshot 
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { Store, Supplier, SystemSettings, UserAccount } from '../types';
import { assertAdminGeral } from './authPermissions';
import { logAuditEvent } from './auditService';
import { 
  getStorageMode, 
  getLocalCollection, 
  saveLocalDoc, 
  updateLocalDoc, 
  deleteLocalDoc, 
  setLocalCollection,
  subscribeLocalCollection,
  getLocalSettings,
  saveLocalSettings,
  INITIAL_DEFAULT_STORES
} from './localStorageAdapter';

export const subscribeStores = (callback: (stores: Store[]) => void) => {
  if (getStorageMode() === 'local') {
    return subscribeLocalCollection<Store>('stores', callback);
  }

  const q = query(collection(db, 'stores'), orderBy('name', 'asc'));
  return onSnapshot(q, (snapshot) => {
    const list: Store[] = snapshot.docs.map(d => ({
      id: d.id,
      ...(d.data() as Omit<Store, 'id'>)
    }));
    // Mirror to local
    setLocalCollection('stores', list);
    callback(list);
  }, (err) => {
    console.warn('Firebase stores subscription warning, falling back to local:', err);
    callback(getLocalCollection<Store>('stores'));
  });
};

export const createStore = async (
  data: { name: string; code?: string; address?: string },
  user?: UserAccount | null
): Promise<string> => {
  const payload = {
    name: data.name.trim(),
    code: data.code?.trim() || '',
    address: data.address?.trim() || '',
    active: true
  };

  let generatedId = '';

  if (getStorageMode() === 'local') {
    generatedId = saveLocalDoc('stores', payload);
  } else {
    try {
      const docRef = await addDoc(collection(db, 'stores'), {
        ...payload,
        createdAt: serverTimestamp()
      });
      generatedId = docRef.id;
      saveLocalDoc('stores', { id: generatedId, ...payload });
    } catch (fbErr) {
      console.warn('Firebase createStore failed, saving locally:', fbErr);
      generatedId = saveLocalDoc('stores', payload);
    }
  }

  if (user) {
    await logAuditEvent({
      user,
      action: 'CRIACAO_LOJA',
      actionLabel: 'Cadastro de Loja',
      targetType: 'LOJA',
      targetId: generatedId,
      targetIdentifier: data.name.trim(),
      reason: 'Nova loja cadastrada no sistema'
    });
  }

  return generatedId;
};

export const updateStore = async (
  id: string, 
  data: { name: string; code?: string; address?: string; active: boolean },
  user?: UserAccount | null
): Promise<void> => {
  const payload = {
    name: data.name.trim(),
    code: data.code?.trim() || '',
    address: data.address?.trim() || '',
    active: data.active
  };

  updateLocalDoc('stores', id, payload);

  if (getStorageMode() === 'firebase') {
    try {
      await updateDoc(doc(db, 'stores', id), payload);
    } catch (fbErr) {
      console.warn('Firebase updateStore failed, preserved locally:', fbErr);
    }
  }

  if (user) {
    await logAuditEvent({
      user,
      action: 'ALTERACAO_LOJA',
      actionLabel: 'Alteração de Cadastro de Loja',
      targetType: 'LOJA',
      targetId: id,
      targetIdentifier: data.name.trim(),
      reason: 'Dados da loja atualizados'
    });
  }
};

export const deleteStore = async (id: string, user?: UserAccount | null): Promise<void> => {
  if (user) {
    assertAdminGeral(user, 'excluir lojas definitivamente');
  }

  const localStores = getLocalCollection<Store>('stores');
  const store = localStores.find(s => s.id === id);
  const storeName = store?.name || id;

  deleteLocalDoc('stores', id);

  if (getStorageMode() === 'firebase') {
    try {
      await deleteDoc(doc(db, 'stores', id));
    } catch (fbErr) {
      console.warn('Firebase deleteStore failed, removed locally:', fbErr);
    }
  }

  if (user) {
    await logAuditEvent({
      user,
      action: 'EXCLUSAO_LOJA',
      actionLabel: 'Exclusão Definitiva de Loja',
      targetType: 'LOJA',
      targetId: id,
      targetIdentifier: `Loja: ${storeName}`,
      reason: 'Exclusão de loja realizada'
    });
  }
};

/**
 * Deletes all stores whose name is equal to targetName (case-insensitive and trimmed),
 * such as deleting all stores whose name is "loja" or "Loja".
 */
export const deleteStoresMatchingName = async (
  targetName: string = 'loja',
  user?: UserAccount | null
): Promise<{ count: number; deletedStores: string[] }> => {
  if (user) {
    assertAdminGeral(user, `excluir lojas com o nome "${targetName}"`);
  }

  const cleanTarget = targetName.trim().toLowerCase();
  const localStores = getLocalCollection<Store>('stores');
  
  // Find matching stores locally
  const matchingStores = localStores.filter(s => (s.name || '').trim().toLowerCase() === cleanTarget);

  const storeIdsToDelete = new Set<string>(matchingStores.map(s => s.id));
  const deletedNames: string[] = matchingStores.map(s => s.name);

  // If in firebase, also check Firestore
  if (getStorageMode() === 'firebase') {
    try {
      const snap = await getDocs(collection(db, 'stores'));
      for (const d of snap.docs) {
        const data = d.data();
        const dName = (data.name || '').trim().toLowerCase();
        if (dName === cleanTarget) {
          storeIdsToDelete.add(d.id);
          if (!deletedNames.includes(data.name)) {
            deletedNames.push(data.name);
          }
        }
      }
    } catch (err) {
      console.warn('Firebase stores query failed during bulk delete:', err);
    }
  }

  for (const id of storeIdsToDelete) {
    deleteLocalDoc('stores', id);
    if (getStorageMode() === 'firebase') {
      try {
        await deleteDoc(doc(db, 'stores', id));
      } catch (err) {
        console.warn(`Failed to delete store ${id} from firebase:`, err);
      }
    }
  }

  if (user && storeIdsToDelete.size > 0) {
    await logAuditEvent({
      user,
      action: 'EXCLUSAO_LOJA',
      actionLabel: 'Exclusão de Lojas com Nome "Loja"',
      targetType: 'LOJA',
      targetId: 'multiple',
      targetIdentifier: `${storeIdsToDelete.size} lojas excluídas (Nome: "${targetName}")`,
      reason: `Exclusão de lojas cujo nome é igual a "${targetName}"`
    });
  }

  return { count: storeIdsToDelete.size, deletedStores: deletedNames };
};

/**
 * Identifies and deletes duplicate store entries, keeping one of each unique name
 */
export const deleteDuplicateStores = async (
  user?: UserAccount | null
): Promise<{ count: number }> => {
  if (user) {
    assertAdminGeral(user, 'excluir lojas duplicadas');
  }

  const localStores = getLocalCollection<Store>('stores');
  const seenNames = new Set<string>();
  const duplicateIds: string[] = [];

  for (const st of localStores) {
    const key = (st.name || '').trim().toUpperCase();
    if (seenNames.has(key)) {
      duplicateIds.push(st.id);
    } else {
      seenNames.add(key);
    }
  }

  for (const id of duplicateIds) {
    deleteLocalDoc('stores', id);
    if (getStorageMode() === 'firebase') {
      try {
        await deleteDoc(doc(db, 'stores', id));
      } catch (e) {
        // ignore
      }
    }
  }

  if (user && duplicateIds.length > 0) {
    await logAuditEvent({
      user,
      action: 'EXCLUSAO_LOJA',
      actionLabel: 'Exclusão de Lojas Duplicadas',
      targetType: 'LOJA',
      targetId: 'duplicates',
      targetIdentifier: `${duplicateIds.length} lojas duplicadas removidas`,
      reason: 'Limpeza de cadastros de lojas duplicadas'
    });
  }

  return { count: duplicateIds.length };
};

/**
 * Checks if a store name/code follows the numbered example pattern:
 * e.g. "LOJA 01", "LOJA 02", "LOJA 03", ..., "LOJA 34", "LOJA 1", or code "LJ01", "LJ02".
 */
export const isNumberedExampleStore = (name?: string, code?: string): boolean => {
  const cleanName = (name || '').trim().toUpperCase();
  const cleanCode = (code || '').trim().toUpperCase();

  // Matches exact "LOJA 01", "LOJA 02", ..., "LOJA 34" or "LOJA 1", "LOJA 2", or "LOJA"
  if (/^LOJA(\s*\d+)?$/i.test(cleanName)) return true;
  if (/^LOJA\s+\d+/i.test(cleanName)) return true;
  if (/^LJ\d+$/i.test(cleanCode)) return true;
  if (cleanName === 'LOJA') return true;

  return false;
};

/**
 * Permanently deletes all stores that follow the pattern "LOJA 01", "LOJA 02", "LOJA 03"...
 * from both localStorage and Firestore database.
 */
export const deleteStoresPatternNumberedLoja = async (
  user?: UserAccount | null
): Promise<{ count: number; deletedStores: string[] }> => {
  if (user) {
    assertAdminGeral(user, 'excluir todas as lojas de exemplo (LOJA 01, LOJA 02...)');
  }

  const localStores = getLocalCollection<Store>('stores');
  const matchedStores = localStores.filter(s => isNumberedExampleStore(s.name, s.code));

  const storeIdsToDelete = new Set<string>(matchedStores.map(s => s.id));
  const deletedNames: string[] = matchedStores.map(s => s.name);

  // If in firebase, also query Firestore to catch any remote records
  if (getStorageMode() === 'firebase') {
    try {
      const snap = await getDocs(collection(db, 'stores'));
      for (const d of snap.docs) {
        const data = d.data();
        if (isNumberedExampleStore(data.name, data.code)) {
          storeIdsToDelete.add(d.id);
          if (!deletedNames.includes(data.name)) {
            deletedNames.push(data.name);
          }
        }
      }
    } catch (err) {
      console.warn('Firebase stores query failed during numbered stores purge:', err);
    }
  }

  // Delete each matching store
  for (const id of storeIdsToDelete) {
    deleteLocalDoc('stores', id);
    if (getStorageMode() === 'firebase') {
      try {
        await deleteDoc(doc(db, 'stores', id));
      } catch (err) {
        console.warn(`Failed to delete store ${id} from firebase:`, err);
      }
    }
  }

  if (user && storeIdsToDelete.size > 0) {
    await logAuditEvent({
      user,
      action: 'EXCLUSAO_LOJA',
      actionLabel: 'Exclusão em Massa de Lojas Modelo (LOJA 01, LOJA 02...)',
      targetType: 'LOJA',
      targetId: 'numbered_stores',
      targetIdentifier: `${storeIdsToDelete.size} lojas modelo excluídas (LOJA 01, LOJA 02...)`,
      reason: 'Exclusão de lojas de teste/modelo numeradas a pedido do usuário'
    });
  }

  return { count: storeIdsToDelete.size, deletedStores: deletedNames };
};

export const ensureDefault34Stores = async (): Promise<void> => {
  // Neutralized: Auto-generation of LOJA 01..34 is disabled per user request.
  return;
};

export const subscribeSuppliers = (callback: (suppliers: Supplier[]) => void) => {
  if (getStorageMode() === 'local') {
    return subscribeLocalCollection<Supplier>('suppliers', callback);
  }

  const q = query(collection(db, 'suppliers'), orderBy('name', 'asc'));
  return onSnapshot(q, (snapshot) => {
    const list: Supplier[] = snapshot.docs.map(d => ({
      id: d.id,
      ...(d.data() as Omit<Supplier, 'id'>)
    }));
    setLocalCollection('suppliers', list);
    callback(list);
  }, (err) => {
    console.warn('Firebase suppliers listener warning, falling back to local:', err);
    callback(getLocalCollection<Supplier>('suppliers'));
  });
};

export const createSupplier = async (data: { name: string; cnpj?: string; phone?: string }): Promise<string> => {
  const payload = {
    name: data.name.trim(),
    cnpj: data.cnpj?.trim() || '',
    phone: data.phone?.trim() || '',
    active: true
  };

  let generatedId = '';

  if (getStorageMode() === 'local') {
    generatedId = saveLocalDoc('suppliers', payload);
  } else {
    try {
      const docRef = await addDoc(collection(db, 'suppliers'), {
        ...payload,
        createdAt: serverTimestamp()
      });
      generatedId = docRef.id;
      saveLocalDoc('suppliers', { id: generatedId, ...payload });
    } catch (fbErr) {
      console.warn('Firebase createSupplier failed, saving locally:', fbErr);
      generatedId = saveLocalDoc('suppliers', payload);
    }
  }

  return generatedId;
};

export const updateSupplier = async (id: string, data: { name: string; cnpj?: string; phone?: string; active: boolean }): Promise<void> => {
  const payload = {
    name: data.name.trim(),
    cnpj: data.cnpj?.trim() || '',
    phone: data.phone?.trim() || '',
    active: data.active
  };

  updateLocalDoc('suppliers', id, payload);

  if (getStorageMode() === 'firebase') {
    try {
      await updateDoc(doc(db, 'suppliers', id), payload);
    } catch (fbErr) {
      console.warn('Firebase updateSupplier failed, preserved locally:', fbErr);
    }
  }
};

export const deleteSupplier = async (id: string, user?: UserAccount): Promise<void> => {
  assertAdminGeral(user, 'excluir fornecedores definitivamente');

  const localSuppliers = getLocalCollection<Supplier>('suppliers');
  const supp = localSuppliers.find(s => s.id === id);
  const suppName = supp?.name || id;

  deleteLocalDoc('suppliers', id);

  if (getStorageMode() === 'firebase') {
    try {
      await deleteDoc(doc(db, 'suppliers', id));
    } catch (fbErr) {
      console.warn('Firebase deleteSupplier failed, removed locally:', fbErr);
    }
  }

  if (user) {
    await logAuditEvent({
      user,
      action: 'EXCLUSAO_LOJA',
      actionLabel: 'Exclusão Definitiva de Fornecedor',
      targetType: 'FORNECEDOR',
      targetId: id,
      targetIdentifier: `Fornecedor: ${suppName}`,
      reason: 'Exclusão de fornecedor realizada pelo Administrador Geral'
    });
  }
};

export const getSystemSettings = async (): Promise<SystemSettings> => {
  const localSettings = getLocalSettings();

  if (getStorageMode() === 'local') {
    return localSettings;
  }

  try {
    const docRef = doc(db, 'settings', 'global');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data() as SystemSettings;
      saveLocalSettings(data);
      return data;
    }
    await setDoc(docRef, localSettings);
    return localSettings;
  } catch (err) {
    console.warn('Firebase getSystemSettings warning, using local:', err);
    return localSettings;
  }
};

export const updateSystemSettings = async (
  settings: Partial<SystemSettings>,
  user?: UserAccount
): Promise<void> => {
  assertAdminGeral(user, 'alterar configurações gerais do sistema');

  saveLocalSettings(settings);

  if (getStorageMode() === 'firebase') {
    try {
      const docRef = doc(db, 'settings', 'global');
      await setDoc(docRef, settings, { merge: true });
    } catch (fbErr) {
      console.warn('Firebase updateSystemSettings failed, preserved locally:', fbErr);
    }
  }

  if (user) {
    await logAuditEvent({
      user,
      action: 'ALTERACAO_CONFIGURACAO',
      actionLabel: 'Alteração de Parâmetros do Sistema',
      targetType: 'CONFIGURACAO',
      targetId: 'global',
      targetIdentifier: 'Parâmetros Gerais do Sistema',
      reason: 'Atualização de parâmetros e configurações',
      details: settings
    });
  }
};
