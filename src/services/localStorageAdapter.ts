import { 
  Product, 
  Invoice, 
  Shipment, 
  StockMovement, 
  Store, 
  Supplier, 
  SystemSettings, 
  AuditLogEntry 
} from '../types';

export type StorageMode = 'firebase' | 'local';

const STORAGE_MODE_KEY = 'ptn_storage_mode';
const SYNC_EVENT_NAME = 'ptn_storage_sync';

export const COLLECTION_KEYS: Record<string, string> = {
  products: 'ptn_db_products',
  invoices: 'ptn_db_invoices',
  shipments: 'ptn_db_shipments',
  stockMovements: 'ptn_db_movements',
  stores: 'ptn_db_stores',
  suppliers: 'ptn_db_suppliers',
  settings: 'ptn_db_settings',
  auditLogs: 'ptn_db_audit'
};

const DEFAULT_SETTINGS: SystemSettings = {
  allowNegativeStock: false,
  companyName: 'CENTRAL DE DISTRIBUIÇÃO E CARNES',
  companyCnpj: '12.345.678/0001-90',
  companyPhone: '(11) 3344-5566',
  companyAddress: 'Av. Logística Industrial, 1000 - Galpão 04',
  nextRomaneioNumber: 1
};

export const INITIAL_DEFAULT_STORES: Store[] = [];

export const INITIAL_DEFAULT_SUPPLIERS: Supplier[] = [
  { id: 'supp_1', name: 'Frigorífico Estrela', cnpj: '98.765.432/0001-10', phone: '(19) 3456-7890', active: true, createdAt: new Date().toISOString() },
  { id: 'supp_2', name: 'Distribuidora Carnes Sul', cnpj: '45.123.789/0001-55', phone: '(41) 3211-9000', active: true, createdAt: new Date().toISOString() },
  { id: 'supp_3', name: 'Fornecedor ABC', cnpj: '12.345.678/0001-90', phone: '(11) 98765-4321', active: true, createdAt: new Date().toISOString() }
];

export const INITIAL_DEFAULT_PRODUCTS: Product[] = [
  { id: 'prod_101', code: '101', name: 'CONTRAFILÉ', unit: 'CAIXA', defaultWeightKg: 20, supplierName: 'Frigorífico Estrela', salePrice: 42.90, salePriceType: 'POR_KG', active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), isSampleData: true },
  { id: 'prod_102', code: '102', name: 'CORAÇÃO', unit: 'CAIXA', defaultWeightKg: 10, supplierName: 'Distribuidora Carnes Sul', salePrice: 26.50, salePriceType: 'POR_KG', active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), isSampleData: true },
  { id: 'prod_103', code: '103', name: 'PICANHA', unit: 'CAIXA', defaultWeightKg: 20, supplierName: 'Fornecedor ABC', salePrice: 68.90, salePriceType: 'POR_KG', active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), isSampleData: true },
  { id: 'prod_104', code: '104', name: 'BACON', unit: 'CAIXA', defaultWeightKg: 10, supplierName: 'Frigorífico Estrela', salePrice: 34.00, salePriceType: 'POR_KG', active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), isSampleData: true }
];

/**
 * Gets currently active storage mode:
 * - 'firebase' (default when Firebase config is available)
 * - 'local' (standalone, 100% offline, zero Google cloud dependency)
 */
export const getStorageMode = (): StorageMode => {
  // 1. If explicitly configured in localStorage, honor user selection
  const saved = localStorage.getItem(STORAGE_MODE_KEY);
  if (saved === 'local' || saved === 'firebase') {
    return saved;
  }

  // 2. If explicitly specified in environment variable
  if (import.meta.env.VITE_STORAGE_MODE === 'local') {
    return 'local';
  }
  if (import.meta.env.VITE_STORAGE_MODE === 'firebase') {
    return 'firebase';
  }

  // 3. If custom Firebase config was saved in settings or provided via VITE_ env vars
  try {
    const customConfig = localStorage.getItem('ptn_custom_firebase_config');
    const hasCustomEnv = Boolean(import.meta.env.VITE_FIREBASE_API_KEY && import.meta.env.VITE_FIREBASE_PROJECT_ID);
    if (customConfig || hasCustomEnv) {
      return 'firebase';
    }
  } catch (e) {
    // fallback
  }

  // 4. Outside Google environment (Hostinger, VPS, custom domain, offline):
  // Automatically operate in 100% autonomous Local Mode so the app NEVER depends on Google Cloud!
  if (typeof window !== 'undefined' && window.location) {
    const hostname = window.location.hostname;
    const isGoogleSandbox = hostname.includes('run.app') || 
                            hostname.includes('web.app') || 
                            hostname.includes('firebaseapp.com') ||
                            hostname === 'localhost' || 
                            hostname === '127.0.0.1';
    if (!isGoogleSandbox) {
      return 'local';
    }
  }

  return 'firebase';
};

/**
 * Sets storage mode and notifies all tabs/components
 */
export const setStorageMode = (mode: StorageMode): void => {
  localStorage.setItem(STORAGE_MODE_KEY, mode);
  notifySync('__mode_change__');
};

/**
 * Triggers storage change event across components and window tabs
 */
export const notifySync = (collectionName: string): void => {
  try {
    window.dispatchEvent(new CustomEvent(SYNC_EVENT_NAME, { detail: { collectionName } }));
  } catch (e) {
    console.warn('Sync notification warning:', e);
  }
};

/**
 * Reads an entire collection from localStorage
 */
export const getLocalCollection = <T>(collectionName: string): T[] => {
  const key = COLLECTION_KEYS[collectionName] || `ptn_db_${collectionName}`;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (err) {
    console.error(`Error reading local collection ${collectionName}:`, err);
    return [];
  }
};

/**
 * Writes an entire collection to localStorage
 */
export const setLocalCollection = <T>(collectionName: string, items: T[]): void => {
  const key = COLLECTION_KEYS[collectionName] || `ptn_db_${collectionName}`;
  try {
    localStorage.setItem(key, JSON.stringify(items));
    notifySync(collectionName);
  } catch (err) {
    console.error(`Error writing local collection ${collectionName}:`, err);
  }
};

/**
 * Generates an ID if not provided
 */
export const generateId = (prefix: string = 'doc'): string => {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
};

/**
 * Saves or inserts a document in local collection
 */
export const saveLocalDoc = <T extends Record<string, any>>(collectionName: string, docData: T): string => {
  const items = getLocalCollection<any>(collectionName);
  const docId = docData.id || generateId(collectionName.slice(0, 4));
  const newDoc = {
    ...docData,
    id: docId,
    createdAt: (docData as any).createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const existingIndex = items.findIndex(item => item.id === docId);
  if (existingIndex >= 0) {
    items[existingIndex] = { ...items[existingIndex], ...newDoc };
  } else {
    items.unshift(newDoc);
  }

  setLocalCollection(collectionName, items);
  return docId;
};

/**
 * Updates a document in local collection
 */
export const updateLocalDoc = (collectionName: string, id: string, updates: any): void => {
  const items = getLocalCollection<any>(collectionName);
  const index = items.findIndex(item => item.id === id);
  if (index >= 0) {
    items[index] = {
      ...items[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    setLocalCollection(collectionName, items);
  }
};

/**
 * Deletes a document from local collection
 */
export const deleteLocalDoc = (collectionName: string, id: string): void => {
  const items = getLocalCollection<any>(collectionName);
  const filtered = items.filter(item => item.id !== id);
  setLocalCollection(collectionName, filtered);
};

/**
 * Subscribes to local collection changes (via custom event and storage event)
 */
export const subscribeLocalCollection = <T>(
  collectionName: string, 
  callback: (items: T[]) => void
): (() => void) => {
  // 1. Initial call
  callback(getLocalCollection<T>(collectionName));

  // 2. Listener
  const handleCustomSync = (e: Event) => {
    const custom = e as CustomEvent;
    if (!custom.detail || custom.detail.collectionName === collectionName || custom.detail.collectionName === '__mode_change__') {
      callback(getLocalCollection<T>(collectionName));
    }
  };

  const handleStorageEvent = (e: StorageEvent) => {
    const key = COLLECTION_KEYS[collectionName] || `ptn_db_${collectionName}`;
    if (e.key === key || e.key === STORAGE_MODE_KEY) {
      callback(getLocalCollection<T>(collectionName));
    }
  };

  window.addEventListener(SYNC_EVENT_NAME, handleCustomSync);
  window.addEventListener('storage', handleStorageEvent);

  return () => {
    window.removeEventListener(SYNC_EVENT_NAME, handleCustomSync);
    window.removeEventListener('storage', handleStorageEvent);
  };
};

/**
 * Reads or saves local system settings
 */
export const getLocalSettings = (): SystemSettings => {
  try {
    const raw = localStorage.getItem(COLLECTION_KEYS.settings);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
};

export const saveLocalSettings = (settings: Partial<SystemSettings>): void => {
  const current = getLocalSettings();
  const updated = { ...current, ...settings };
  localStorage.setItem(COLLECTION_KEYS.settings, JSON.stringify(updated));
  notifySync('settings');
};

/**
 * Initializes default stores, suppliers, products and settings in localStorage if empty.
 * This guarantees the system is 100% operational on any device/server without Google.
 */
export const initDefaultLocalDataIfEmpty = (): void => {
  // 1. Stores
  const stores = getLocalCollection<Store>('stores');
  if (stores.length === 0) {
    setLocalCollection('stores', INITIAL_DEFAULT_STORES);
  }

  // 2. Suppliers
  const suppliers = getLocalCollection<Supplier>('suppliers');
  if (suppliers.length === 0) {
    setLocalCollection('suppliers', INITIAL_DEFAULT_SUPPLIERS);
  }

  // 3. Products
  const products = getLocalCollection<Product>('products');
  if (products.length === 0) {
    setLocalCollection('products', INITIAL_DEFAULT_PRODUCTS);
  }

  // 4. Settings
  const rawSettings = localStorage.getItem(COLLECTION_KEYS.settings);
  if (!rawSettings) {
    localStorage.setItem(COLLECTION_KEYS.settings, JSON.stringify(DEFAULT_SETTINGS));
  }
};

/**
 * Exports complete database to a JSON file format for offline portability / backup
 */
export const exportDatabaseBackup = () => {
  const backup = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    system: 'Sistema de Controle de Estoque e Romaneios - Pata Negra',
    storageMode: getStorageMode(),
    data: {
      products: getLocalCollection('products'),
      invoices: getLocalCollection('invoices'),
      shipments: getLocalCollection('shipments'),
      stockMovements: getLocalCollection('stockMovements'),
      stores: getLocalCollection('stores'),
      suppliers: getLocalCollection('suppliers'),
      settings: getLocalSettings(),
      auditLogs: getLocalCollection('auditLogs')
    }
  };

  const json = JSON.stringify(backup, null, 2);
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `backup-sistema-romaneio-${dateStr}.json`;

  return { filename, json };
};

/**
 * Imports a JSON backup file and restores all collections locally
 */
export const importDatabaseBackup = (jsonString: string): { success: boolean; message: string; counts?: any } => {
  try {
    const parsed = JSON.parse(jsonString);
    if (!parsed || !parsed.data) {
      return { success: false, message: 'Arquivo JSON inválido. Estrutura de dados não reconhecida.' };
    }

    const { data } = parsed;

    if (Array.isArray(data.products)) setLocalCollection('products', data.products);
    if (Array.isArray(data.invoices)) setLocalCollection('invoices', data.invoices);
    if (Array.isArray(data.shipments)) setLocalCollection('shipments', data.shipments);
    if (Array.isArray(data.stockMovements)) setLocalCollection('stockMovements', data.stockMovements);
    if (Array.isArray(data.stores)) setLocalCollection('stores', data.stores);
    if (Array.isArray(data.suppliers)) setLocalCollection('suppliers', data.suppliers);
    if (data.settings) saveLocalSettings(data.settings);
    if (Array.isArray(data.auditLogs)) setLocalCollection('auditLogs', data.auditLogs);

    // Notify all UI components to refresh
    notifySync('__mode_change__');

    return {
      success: true,
      message: 'Backup restaurado com sucesso no armazenamento local!',
      counts: {
        products: data.products?.length || 0,
        invoices: data.invoices?.length || 0,
        shipments: data.shipments?.length || 0,
        stores: data.stores?.length || 0
      }
    };
  } catch (err: any) {
    return { success: false, message: `Erro ao processar arquivo de backup: ${err.message}` };
  }
};
