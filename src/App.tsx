import React, { useState, useEffect, useMemo } from 'react';
import { AuthProvider, useAuth } from './firebase/authContext';
import { Navbar, NavTab } from './components/Navbar';
import { DashboardView } from './components/DashboardView';
import { ProductsView } from './components/ProductsView';
import { EntriesView } from './components/EntriesView';
import { NfeEntryView } from './components/NfeEntryView';
import { ShipmentsView } from './components/ShipmentsView';
import { StockView } from './components/StockView';
import { HistoryView } from './components/HistoryView';
import { ReportsView } from './components/ReportsView';
import { BalanceteView } from './components/BalanceteView';
import { StoresAndSuppliersView } from './components/StoresAndSuppliersView';
import { SettingsView } from './components/SettingsView';
import { MaintenanceView } from './components/MaintenanceView';
import { AuditView } from './components/AuditView';
import { 
  Product, 
  Invoice, 
  Shipment, 
  StockMovement, 
  Store, 
  Supplier, 
  SystemSettings,
  ProductStockSummary 
} from './types';
import { 
  calculateStockSummaries, 
  subscribeInvoices, 
  subscribeShipments, 
  subscribeStockMovements 
} from './services/inventoryService';
import { subscribeProducts } from './services/productService';
import { seedSampleData } from './services/seedService';
import { 
  ensureDefault34Stores, 
  subscribeStores, 
  subscribeSuppliers, 
  getSystemSettings 
} from './services/storeService';
import { 
  getStorageMode, 
  initDefaultLocalDataIfEmpty, 
  getLocalSettings,
  StorageMode 
} from './services/localStorageAdapter';
import { LoginScreen } from './components/LoginScreen';
import { Loader2 } from 'lucide-react';

const defaultSettings: SystemSettings = {
  allowNegativeStock: false,
  companyName: 'CENTRAL DE DISTRIBUIÇÃO E CARNES',
  companyCnpj: '12.345.678/0001-90',
  companyPhone: '(11) 3344-5566',
  companyAddress: 'Av. Logística Industrial, 1000 - Galpão 04',
  nextRomaneioNumber: 1
};

const MainAppContent: React.FC = () => {
  const { currentUser, isLoggedIn, logout, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [storageMode, setStorageModeState] = useState<StorageMode>(getStorageMode());

  // Collections state
  const [products, setProducts] = useState<Product[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [settings, setSettings] = useState<SystemSettings>(defaultSettings);
  const [initialLoading, setInitialLoading] = useState(true);

  // Initialize local data and subscriptions
  useEffect(() => {
    // 1. Initialize local baseline data so app operates 100% offline immediately
    initDefaultLocalDataIfEmpty();
    setSettings(getLocalSettings());

    // 2. Subscriptions to collections (handles both Firebase and Local mode automatically)
    const unsubProducts = subscribeProducts((items) => {
      setProducts(items);
      setInitialLoading(false);
    });

    const unsubInvoices = subscribeInvoices((items) => {
      setInvoices(items);
    });

    const unsubShipments = subscribeShipments((items) => {
      setShipments(items);
    });

    const unsubMovements = subscribeStockMovements((items) => {
      setMovements(items);
    });

    const unsubStores = subscribeStores((items) => {
      setStores(items);
    });

    const unsubSuppliers = subscribeSuppliers((items) => {
      setSuppliers(items);
    });

    getSystemSettings().then((s) => setSettings(s)).catch(() => {});

    // Listen for storage mode changes
    const handleSync = (e: Event) => {
      const custom = e as CustomEvent;
      if (custom.detail?.collectionName === '__mode_change__') {
        setStorageModeState(getStorageMode());
        getSystemSettings().then((s) => setSettings(s)).catch(() => {});
      }
    };
    window.addEventListener('ptn_storage_sync', handleSync);

    // Fallback safety timeout so app never gets stuck on loading screen
    const safetyTimer = setTimeout(() => {
      setInitialLoading(false);
    }, 700);

    return () => {
      clearTimeout(safetyTimer);
      window.removeEventListener('ptn_storage_sync', handleSync);
      unsubProducts();
      unsubInvoices();
      unsubShipments();
      unsubMovements();
      unsubStores();
      unsubSuppliers();
    };
  }, [storageMode]);

  // Auto-seed sample products on first boot if collection is empty
  useEffect(() => {
    if (!initialLoading && products.length === 0 && currentUser) {
      seedSampleData(currentUser).catch((e) => console.log('Auto-seed completed or skipped', e));
    }
  }, [initialLoading, products.length, currentUser]);

  // Compute live stock balances dynamically: ESTOQUE = ENTRADAS - SAÍDAS
  const stockMap = useMemo(() => {
    return calculateStockSummaries(products, movements);
  }, [products, movements]);

  const stockSummaries: ProductStockSummary[] = useMemo(() => {
    return Array.from(stockMap.values());
  }, [stockMap]);

  if (initialLoading || authLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white">
        <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-4" />
        <h2 className="text-xl font-bold">Carregando Sistema de Estoque e Romaneios...</h2>
        <p className="text-xs text-slate-400 mt-1">Carregando saldo de estoque e movimentações em tempo real</p>
      </div>
    );
  }

  // If no operator is selected, present the Login Screen
  if (!isLoggedIn || !currentUser) {
    return (
      <LoginScreen onLoginSuccess={() => setActiveTab('dashboard')} />
    );
  }

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900 flex flex-col font-sans">
      {/* Top Navigation Bar with Multi-User Switcher & Storage Mode Indicator */}
      <Navbar 
        currentTab={activeTab} 
        onSelectTab={setActiveTab} 
        onOpenLoginScreen={logout}
      />

      {/* Main Screen Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {activeTab === 'dashboard' && (
          <DashboardView
            products={products}
            stockSummaries={stockSummaries}
            invoices={invoices}
            shipments={shipments}
            movements={movements}
            currentUser={currentUser}
            onNavigate={setActiveTab}
          />
        )}

        {activeTab === 'products' && (
          <ProductsView 
            products={products} 
            suppliers={suppliers}
            onOpenNewSupplier={() => setActiveTab('stores')}
          />
        )}

        {activeTab === 'entries' && (
          <EntriesView
            products={products}
            invoices={invoices}
            suppliers={suppliers}
            onOpenNewProduct={() => setActiveTab('products')}
            onOpenNfeEntry={() => setActiveTab('nfe-entry')}
          />
        )}

        {activeTab === 'nfe-entry' && (
          <NfeEntryView
            products={products}
            invoices={invoices}
            suppliers={suppliers}
            currentUser={currentUser}
            onNavigateToStock={() => setActiveTab('stock')}
            onNavigateToEntries={() => setActiveTab('entries')}
          />
        )}

        {activeTab === 'shipments' && (
          <ShipmentsView
            products={products}
            stores={stores}
            shipments={shipments}
            stockMap={stockMap}
            suppliers={suppliers}
            settings={settings}
            onOpenNewStore={() => setActiveTab('stores')}
            onOpenNewProduct={() => setActiveTab('products')}
          />
        )}

        {activeTab === 'stock' && (
          <StockView
            stockSummaries={stockSummaries}
            products={products}
            movements={movements}
            currentUser={currentUser}
            onOpenEntries={() => setActiveTab('entries')}
            onOpenShipments={() => setActiveTab('shipments')}
          />
        )}

        {activeTab === 'history' && (
          <HistoryView
            movements={movements}
            products={products}
          />
        )}

        {activeTab === 'reports' && (
          <ReportsView
            products={products}
            movements={movements}
            invoices={invoices}
            shipments={shipments}
            stores={stores}
          />
        )}

        {activeTab === 'balancete' && (
          <BalanceteView
            products={products}
            movements={movements}
          />
        )}

        {activeTab === 'stores' && (
          <StoresAndSuppliersView
            stores={stores}
            suppliers={suppliers}
            currentUser={currentUser}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            settings={settings}
            currentUser={currentUser}
            onRefreshData={() => {
              getSystemSettings().then((s) => setSettings(s)).catch(() => {});
            }}
            onOpenLoginScreen={logout}
          />
        )}

        {activeTab === 'maintenance' && (
          <MaintenanceView 
            currentUser={currentUser}
            onNavigateToAudit={() => setActiveTab('audit')}
          />
        )}

        {activeTab === 'audit' && (
          <AuditView currentUser={currentUser} />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 px-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Sistema de Controle de Estoque e Romaneios • Pata Negra</span>
          <span className="flex items-center gap-1.5 font-medium">
            <span className={`w-2 h-2 rounded-full ${storageMode === 'local' ? 'bg-blue-500' : 'bg-emerald-500'}`}></span>
            {storageMode === 'local' ? 'Modo Local Autônomo (Offline / Sem Google)' : 'Nuvem Firebase Conectada'}
          </span>
        </div>
      </footer>
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <MainAppContent />
    </AuthProvider>
  );
}
