import { 
  collection, 
  getDocs, 
  writeBatch, 
  doc, 
  serverTimestamp, 
  addDoc 
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { Product, Store, Supplier, UserAccount } from '../types';
import { registerInvoiceEntry, registerShipmentExit, calculateStockSummaries } from './inventoryService';
import { 
  getStorageMode, 
  initDefaultLocalDataIfEmpty, 
  getLocalCollection, 
  setLocalCollection 
} from './localStorageAdapter';

export const SAMPLE_PRODUCTS: Array<{ 
  code: string; 
  name: string; 
  unit: 'CAIXA'; 
  defaultWeightKg: number; 
  supplierName?: string; 
  salePrice?: number; 
  salePriceType?: 'POR_KG' | 'POR_UNIDADE'; 
}> = [
  { code: '101', name: 'CONTRAFILÉ', unit: 'CAIXA', defaultWeightKg: 20, supplierName: 'Frigorífico Estrela', salePrice: 42.90, salePriceType: 'POR_KG' },
  { code: '102', name: 'CORAÇÃO', unit: 'CAIXA', defaultWeightKg: 10, supplierName: 'Distribuidora Carnes Sul', salePrice: 26.50, salePriceType: 'POR_KG' },
  { code: '103', name: 'PICANHA', unit: 'CAIXA', defaultWeightKg: 20, supplierName: 'Fornecedor ABC', salePrice: 68.90, salePriceType: 'POR_KG' },
  { code: '104', name: 'BACON', unit: 'CAIXA', defaultWeightKg: 10, supplierName: 'Frigorífico Estrela', salePrice: 34.00, salePriceType: 'POR_KG' },
];

export const SAMPLE_STORES: Array<{ name: string; code: string; address: string }> = [];

export const SAMPLE_SUPPLIERS = [
  { name: 'Fornecedor ABC', cnpj: '12.345.678/0001-90', phone: '(11) 98765-4321' },
  { name: 'Frigorífico Estrela', cnpj: '98.765.432/0001-10', phone: '(19) 3456-7890' },
  { name: 'Distribuidora Carnes Sul', cnpj: '45.123.789/0001-55', phone: '(41) 3211-9000' }
];

export const seedSampleData = async (user: UserAccount): Promise<void> => {
  // Always initialize local database first
  initDefaultLocalDataIfEmpty();

  if (getStorageMode() === 'local') {
    return;
  }

  try {
    // 1. Seed Products if not present
    const prodsSnap = await getDocs(collection(db, 'products'));
    const existingCodes = new Set(prodsSnap.docs.map(d => d.data().code));
    
    for (const sp of SAMPLE_PRODUCTS) {
      if (!existingCodes.has(sp.code)) {
        await addDoc(collection(db, 'products'), {
          ...sp,
          active: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          isSampleData: true
        });
      }
    }

    // 2. Seed Stores if not present
    const storesSnap = await getDocs(collection(db, 'stores'));
    const existingStoreNames = new Set(storesSnap.docs.map(d => d.data().name));

    for (const st of SAMPLE_STORES) {
      if (!existingStoreNames.has(st.name)) {
        await addDoc(collection(db, 'stores'), {
          ...st,
          active: true,
          createdAt: serverTimestamp(),
          isSampleData: true
        });
      }
    }

    // 3. Seed Suppliers if not present
    const suppSnap = await getDocs(collection(db, 'suppliers'));
    const existingSuppNames = new Set(suppSnap.docs.map(d => d.data().name));

    for (const sup of SAMPLE_SUPPLIERS) {
      if (!existingSuppNames.has(sup.name)) {
        await addDoc(collection(db, 'suppliers'), {
          ...sup,
          active: true,
          createdAt: serverTimestamp(),
          isSampleData: true
        });
      }
    }

    // Fetch updated all products and stores
    const allProdsSnap = await getDocs(collection(db, 'products'));
    const allProducts: Product[] = allProdsSnap.docs.map(d => ({
      id: d.id,
      ...(d.data() as Omit<Product, 'id'>)
    }));

    const allStoresSnap = await getDocs(collection(db, 'stores'));
    const allStores: Store[] = allStoresSnap.docs.map(d => ({
      id: d.id,
      ...(d.data() as Omit<Store, 'id'>)
    }));

    // Check if invoices exist. If none, create sample invoice 1234
    const invSnap = await getDocs(collection(db, 'invoices'));
    if (invSnap.empty && allProducts.length >= 4) {
      const p101 = allProducts.find(p => p.code === '101');
      const p102 = allProducts.find(p => p.code === '102');
      const p103 = allProducts.find(p => p.code === '103');
      const p104 = allProducts.find(p => p.code === '104');

      if (p101 && p102 && p103 && p104) {
        await registerInvoiceEntry({
          invoiceNumber: '1234',
          supplierName: 'Fornecedor ABC',
          date: '2026-09-22',
          notes: 'Nota fiscal de exemplo para demonstração inicial',
          user: {
            id: user.id,
            name: user.name || 'Paloma',
            role: user.role || 'Operador',
            email: user.email || 'paloma@patanegra.local'
          },
          items: [
            {
              id: '1',
              productId: p101.id,
              productCode: p101.code,
              productName: p101.name,
              unit: p101.unit,
              quantityBoxes: 50,
              weightKg: 1000,
              mode: 'by_unit'
            },
            {
              id: '2',
              productId: p102.id,
              productCode: p102.code,
              productName: p102.name,
              unit: p102.unit,
              quantityBoxes: 30,
              weightKg: 300,
              mode: 'by_unit'
            },
            {
              id: '3',
              productId: p103.id,
              productCode: p103.code,
              productName: p103.name,
              unit: p103.unit,
              quantityBoxes: 30,
              weightKg: 600,
              mode: 'by_unit'
            },
            {
              id: '4',
              productId: p104.id,
              productCode: p104.code,
              productName: p104.name,
              unit: p104.unit,
              quantityBoxes: 20,
              weightKg: 200,
              mode: 'by_unit'
            }
          ]
        });

        // Also create sample Romaneio 000123
        const s1 = allStores.find(s => s.name.includes('01')) || allStores[0];
        const s2 = allStores.find(s => s.name.includes('02')) || allStores[1];
        const s3 = allStores.find(s => s.name.includes('03')) || allStores[2];

        if (s1 && s2 && s3) {
          const stockMap = calculateStockSummaries(allProducts, [
            { id: '1', type: 'ENTRADA', documentType: 'NOTA_FISCAL', documentNumber: 'NF 1234', documentId: 'temp', productId: p101.id, productCode: '101', productName: p101.name, unit: 'CAIXA', boxes: 50, weightKg: 1000, mode: 'by_unit', userId: '1', userName: 'USUÁRIO 1', timestamp: null, createdAtIso: '', status: 'CONFIRMED' },
            { id: '2', type: 'ENTRADA', documentType: 'NOTA_FISCAL', documentNumber: 'NF 1234', documentId: 'temp', productId: p102.id, productCode: '102', productName: p102.name, unit: 'CAIXA', boxes: 30, weightKg: 300, mode: 'by_unit', userId: '1', userName: 'USUÁRIO 1', timestamp: null, createdAtIso: '', status: 'CONFIRMED' },
            { id: '3', type: 'ENTRADA', documentType: 'NOTA_FISCAL', documentNumber: 'NF 1234', documentId: 'temp', productId: p103.id, productCode: '103', productName: p103.name, unit: 'CAIXA', boxes: 30, weightKg: 600, mode: 'by_unit', userId: '1', userName: 'USUÁRIO 1', timestamp: null, createdAtIso: '', status: 'CONFIRMED' },
            { id: '4', type: 'ENTRADA', documentType: 'NOTA_FISCAL', documentNumber: 'NF 1234', documentId: 'temp', productId: p104.id, productCode: '104', productName: p104.name, unit: 'CAIXA', boxes: 20, weightKg: 200, mode: 'by_unit', userId: '1', userName: 'USUÁRIO 1', timestamp: null, createdAtIso: '', status: 'CONFIRMED' }
          ]);

          await registerShipmentExit({
            date: '2026-09-22',
            notes: 'Carregamento matutino rota leste',
            user: {
              id: user.id,
              name: user.name || 'Paloma',
              role: user.role || 'Operador',
              email: user.email || 'paloma@patanegra.local'
            },
            currentStockMap: stockMap,
            allowNegativeStock: true,
            destinations: [
              {
                id: 'd1',
                storeId: s1.id,
                storeName: s1.name,
                items: [
                  { id: 'i1', productId: p101.id, productCode: '101', productName: p101.name, unit: 'CAIXA', quantityBoxes: 10, weightKg: 200, mode: 'by_unit' },
                  { id: 'i2', productId: p102.id, productCode: '102', productName: p102.name, unit: 'CAIXA', quantityBoxes: 5, weightKg: 50, mode: 'by_unit' }
                ],
                subtotalBoxes: 15,
                subtotalWeightKg: 250
              },
              {
                id: 'd2',
                storeId: s2.id,
                storeName: s2.name,
                items: [
                  { id: 'i3', productId: p101.id, productCode: '101', productName: p101.name, unit: 'CAIXA', quantityBoxes: 8, weightKg: 160, mode: 'by_unit' },
                  { id: 'i4', productId: p103.id, productCode: '103', productName: p103.name, unit: 'CAIXA', quantityBoxes: 3, weightKg: 60, mode: 'by_unit' }
                ],
                subtotalBoxes: 11,
                subtotalWeightKg: 220
              },
              {
                id: 'd3',
                storeId: s3.id,
                storeName: s3.name,
                items: [
                  { id: 'i5', productId: p101.id, productCode: '101', productName: p101.name, unit: 'CAIXA', quantityBoxes: 5, weightKg: 100, mode: 'by_unit' },
                  { id: 'i6', productId: p104.id, productCode: '104', productName: p104.name, unit: 'CAIXA', quantityBoxes: 4, weightKg: 40, mode: 'by_unit' }
                ],
                subtotalBoxes: 9,
                subtotalWeightKg: 140
              }
            ]
          });
        }
      }
    }
  } catch (fbErr) {
    console.warn('seedSampleData Firebase warning (local initialization preserved):', fbErr);
  }
};

export const clearAllData = async (): Promise<void> => {
  // Clear local collections
  setLocalCollection('products', []);
  setLocalCollection('stores', []);
  setLocalCollection('suppliers', []);
  setLocalCollection('invoices', []);
  setLocalCollection('shipments', []);
  setLocalCollection('stockMovements', []);
  setLocalCollection('auditLogs', []);

  if (getStorageMode() === 'local') return;

  try {
    const collections = ['stockMovements', 'shipments', 'invoices', 'products', 'stores', 'suppliers'];
    for (const colName of collections) {
      const snap = await getDocs(collection(db, colName));
      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  } catch (fbErr) {
    console.warn('Firebase clearAllData warning, local collections cleared:', fbErr);
  }
};
