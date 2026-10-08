import React, { useState, useMemo } from 'react';
import { 
  Package, 
  Search, 
  Filter, 
  ArrowDownToLine, 
  ArrowUpFromLine, 
  Scale, 
  Box, 
  AlertTriangle, 
  CheckCircle, 
  Printer, 
  Download,
  Info,
  Sliders,
  X,
  Check,
  RotateCcw,
  DollarSign,
  Truck,
  Building2,
  Store as StoreIcon,
  FileText,
  ChevronRight
} from 'lucide-react';
import { ProductStockSummary, Product, UserAccount, StockMovement, Shipment, Store } from '../types';
import { registerStockAdjustment } from '../services/inventoryService';

interface StockViewProps {
  stockSummaries: ProductStockSummary[];
  products?: Product[];
  currentUser?: UserAccount;
  movements?: StockMovement[];
  shipments?: Shipment[];
  stores?: Store[];
  onOpenEntries: () => void;
  onOpenShipments: () => void;
}

export const StockView: React.FC<StockViewProps> = ({
  stockSummaries,
  products = [],
  currentUser,
  movements = [],
  shipments = [],
  stores = [],
  onOpenEntries,
  onOpenShipments
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'central' | 'distributions'>('central');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'IN_STOCK' | 'LOW_OR_ZERO'>('ALL');
  const [selectedStoreFilter, setSelectedStoreFilter] = useState<string>('ALL');

  // Adjustment Modal State
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [selectedProductForAdjust, setSelectedProductForAdjust] = useState<ProductStockSummary | null>(null);
  const [selectedProductIdInput, setSelectedProductIdInput] = useState('');
  const [adjustMode, setAdjustMode] = useState<'SET_BALANCE' | 'DELTA'>('SET_BALANCE');
  const [targetBoxesInput, setTargetBoxesInput] = useState<number>(0);
  const [targetWeightInput, setTargetWeightInput] = useState<number>(0);
  const [deltaBoxesInput, setDeltaBoxesInput] = useState<number>(0);
  const [deltaWeightInput, setDeltaWeightInput] = useState<number>(0);
  const [adjustReason, setAdjustReason] = useState('Contagem física de inventário / Balanço');
  const [adjustLoading, setAdjustLoading] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [adjustSuccess, setAdjustSuccess] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return stockSummaries.filter((item) => {
      const sTerm = searchTerm.toLowerCase();
      const matchSearch = 
        item.productName.toLowerCase().includes(sTerm) ||
        item.productCode.includes(searchTerm) ||
        (item.supplierName && item.supplierName.toLowerCase().includes(sTerm));

      if (filterStatus === 'IN_STOCK') {
        return matchSearch && item.currentBoxes > 0;
      }
      if (filterStatus === 'LOW_OR_ZERO') {
        return matchSearch && item.currentBoxes <= 5;
      }
      return matchSearch;
    });
  }, [stockSummaries, searchTerm, filterStatus]);

  // Aggregate totals
  const totalBoxesInStock = stockSummaries.reduce((sum, item) => sum + item.currentBoxes, 0);
  const totalWeightInStock = stockSummaries.reduce((sum, item) => sum + item.currentWeightKg, 0);
  const totalEntriesBoxes = stockSummaries.reduce((sum, item) => sum + item.totalEntriesBoxes, 0);
  const totalExitsBoxes = stockSummaries.reduce((sum, item) => sum + item.totalExitsBoxes, 0);

  const totalEstimatedStockValue = useMemo(() => {
    return stockSummaries.reduce((sum, item) => {
      if (!item.salePrice || item.salePrice <= 0) return sum;
      if (item.salePriceType === 'POR_UNIDADE') {
        return sum + (item.currentBoxes * item.salePrice);
      }
      return sum + (item.currentWeightKg * item.salePrice);
    }, 0);
  }, [stockSummaries]);

  // Aggregate distributions by store from shipments & movements
  const storeDistributionList = useMemo(() => {
    const storeMap = new Map<string, {
      storeName: string;
      storeCode?: string;
      totalBoxes: number;
      totalWeightKg: number;
      productsMap: Map<string, {
        productId: string;
        productCode: string;
        productName: string;
        unit: string;
        boxes: number;
        weightKg: number;
        romaneios: Set<string>;
      }>;
    }>();

    // Populate from all registered stores so user sees all of them (e.g. 34 stores)
    for (const st of stores) {
      const key = st.name.trim().toUpperCase();
      if (!storeMap.has(key)) {
        storeMap.set(key, {
          storeName: st.name,
          storeCode: st.code,
          totalBoxes: 0,
          totalWeightKg: 0,
          productsMap: new Map()
        });
      }
    }

    // Process shipments
    for (const ship of shipments) {
      if (ship.status === 'CANCELLED') continue;
      for (const dest of ship.destinations || []) {
        const key = (dest.storeName || 'LOJA').trim().toUpperCase();
        if (!storeMap.has(key)) {
          storeMap.set(key, {
            storeName: dest.storeName,
            totalBoxes: 0,
            totalWeightKg: 0,
            productsMap: new Map()
          });
        }
        const stEntry = storeMap.get(key)!;
        stEntry.totalBoxes += Number(dest.subtotalBoxes) || 0;
        stEntry.totalWeightKg += Number(dest.subtotalWeightKg) || 0;

        for (const it of dest.items || []) {
          if (!stEntry.productsMap.has(it.productId)) {
            stEntry.productsMap.set(it.productId, {
              productId: it.productId,
              productCode: it.productCode,
              productName: it.productName,
              unit: it.unit,
              boxes: 0,
              weightKg: 0,
              romaneios: new Set()
            });
          }
          const p = stEntry.productsMap.get(it.productId)!;
          p.boxes += Number(it.quantityBoxes) || 0;
          p.weightKg += Number(it.weightKg) || 0;
          if (ship.romaneioNumber) {
            p.romaneios.add(ship.romaneioNumber);
          }
        }
      }
    }

    return Array.from(storeMap.values()).map(entry => ({
      ...entry,
      products: Array.from(entry.productsMap.values()).map(p => ({
        ...p,
        romaneiosList: Array.from(p.romaneios)
      }))
    })).sort((a, b) => a.storeName.localeCompare(b.storeName, undefined, { numeric: true }));
  }, [stores, shipments]);

  const filteredStoreDistributions = useMemo(() => {
    let list = storeDistributionList;
    if (selectedStoreFilter !== 'ALL') {
      list = list.filter(s => s.storeName.toUpperCase() === selectedStoreFilter.toUpperCase());
    }
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      list = list.filter(s => 
        s.storeName.toLowerCase().includes(term) ||
        (s.storeCode && s.storeCode.toLowerCase().includes(term)) ||
        s.products.some(p => p.productName.toLowerCase().includes(term) || p.productCode.includes(term))
      );
    }
    return list;
  }, [storeDistributionList, selectedStoreFilter, searchTerm]);

  const totalDistributedBoxesAcrossStores = useMemo(() => {
    return storeDistributionList.reduce((sum, s) => sum + s.totalBoxes, 0);
  }, [storeDistributionList]);

  const totalDistributedWeightAcrossStores = useMemo(() => {
    return storeDistributionList.reduce((sum, s) => sum + s.totalWeightKg, 0);
  }, [storeDistributionList]);

  const handleExportCSV = () => {
    const headers = ['Codigo', 'Produto', 'Fornecedor', 'Unidade', 'Valor_Venda', 'Entradas_Caixas', 'Entradas_Kg', 'Saidas_Caixas', 'Saidas_Kg', 'Saldo_Caixas', 'Saldo_Kg'];
    const rows = stockSummaries.map(s => [
      s.productCode,
      `"${s.productName}"`,
      `"${s.supplierName || 'Nao informado'}"`,
      s.unit,
      s.salePrice ? s.salePrice.toFixed(2) : '0.00',
      s.totalEntriesBoxes,
      s.totalEntriesWeightKg.toFixed(2),
      s.totalExitsBoxes,
      s.totalExitsWeightKg.toFixed(2),
      s.currentBoxes,
      s.currentWeightKg.toFixed(2)
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `posicao_estoque_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleOpenAdjustModal = (item: ProductStockSummary | null) => {
    setAdjustError(null);
    setAdjustSuccess(null);
    if (item) {
      setSelectedProductForAdjust(item);
      setSelectedProductIdInput(item.productId);
      setTargetBoxesInput(item.currentBoxes);
      setTargetWeightInput(item.currentWeightKg);
      setDeltaBoxesInput(0);
      setDeltaWeightInput(0);
    } else {
      const first = stockSummaries[0] || null;
      setSelectedProductForAdjust(first);
      setSelectedProductIdInput(first ? first.productId : '');
      setTargetBoxesInput(first ? first.currentBoxes : 0);
      setTargetWeightInput(first ? first.currentWeightKg : 0);
      setDeltaBoxesInput(0);
      setDeltaWeightInput(0);
    }
    setAdjustReason('Contagem física de inventário / Balanço');
    setIsAdjustModalOpen(true);
  };

  const handleSelectProductInModal = (prodId: string) => {
    setSelectedProductIdInput(prodId);
    const found = stockSummaries.find(s => s.productId === prodId) || null;
    setSelectedProductForAdjust(found);
    if (found) {
      setTargetBoxesInput(found.currentBoxes);
      setTargetWeightInput(found.currentWeightKg);
      setDeltaBoxesInput(0);
      setDeltaWeightInput(0);
    }
  };

  const handleSaveAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdjustError(null);
    setAdjustSuccess(null);

    if (!selectedProductForAdjust) {
      setAdjustError('Selecione um produto para ajustar.');
      return;
    }

    const currentBoxes = selectedProductForAdjust.currentBoxes;
    const currentWeight = selectedProductForAdjust.currentWeightKg;

    let finalTargetBoxes = Number(targetBoxesInput);
    let finalTargetWeight = Number(targetWeightInput);

    if (adjustMode === 'DELTA') {
      finalTargetBoxes = Math.round((currentBoxes + Number(deltaBoxesInput)) * 100) / 100;
      finalTargetWeight = Math.round((currentWeight + Number(deltaWeightInput)) * 100) / 100;
    }

    if (finalTargetBoxes === currentBoxes && finalTargetWeight === currentWeight) {
      setAdjustError('Nenhuma alteração de quantidade ou peso foi informada.');
      return;
    }

    setAdjustLoading(true);

    try {
      const user: UserAccount = currentUser || {
        id: 'usr_manual',
        name: 'Operador Pata Negra',
        email: 'user@patanegra.com',
        role: 'Administrador'
      };

      await registerStockAdjustment({
        productId: selectedProductForAdjust.productId,
        productCode: selectedProductForAdjust.productCode,
        productName: selectedProductForAdjust.productName,
        unit: selectedProductForAdjust.unit,
        currentBoxes,
        currentWeightKg: currentWeight,
        targetBoxes: finalTargetBoxes,
        targetWeightKg: finalTargetWeight,
        reason: adjustReason,
        user
      });

      setAdjustSuccess('Estoque ajustado com sucesso e registrado no histórico de movimentações!');
      setTimeout(() => {
        setIsAdjustModalOpen(false);
      }, 1200);
    } catch (err: any) {
      console.error(err);
      setAdjustError(err.message || 'Erro ao ajustar estoque.');
    } finally {
      setAdjustLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800">
              Estoque Geral do CD
            </span>
            <span className="text-xs text-slate-400">• Não vinculado diretamente às lojas</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2 mt-1">
            <Package className="w-6 h-6 text-blue-600" />
            Estoque Central do CD (Principal)
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            O estoque pertence exclusivamente ao CD. As lojas recebem mercadorias apenas através de romaneios de distribuição.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => handleOpenAdjustModal(null)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg transition shadow-xs"
            title="Ajustar ou manipular quantidade e peso de produtos no Estoque Central"
          >
            <Sliders className="w-4 h-4" />
            Ajustar Estoque Central
          </button>
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium text-xs rounded-lg transition"
            title="Exportar para Excel / CSV"
          >
            <Download className="w-4 h-4 text-slate-500" />
            Exportar CSV
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium text-xs rounded-lg transition"
            title="Imprimir Posição de Estoque"
          >
            <Printer className="w-4 h-4 text-slate-500" />
            Imprimir
          </button>
        </div>
      </div>

      {/* Operational Flow Banner */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50/50 border border-blue-200/80 rounded-xl p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs text-slate-700">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-600 text-white rounded-lg font-bold text-xs shrink-0 flex items-center gap-1.5">
            <Building2 className="w-4 h-4" />
            <span>FLUXO CD</span>
          </div>
          <div>
            <span className="font-bold text-blue-950">Lógica Operacional de Estoque:</span>
            <div className="flex flex-wrap items-center gap-2 text-slate-600 mt-0.5">
              <span className="font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                1. Entrada NF → Aumenta Estoque Central do CD
              </span>
              <span>➔</span>
              <span className="font-semibold text-blue-800 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                2. Distribuição Romaneio → Diminui Estoque Central
              </span>
              <span>➔</span>
              <span className="font-semibold text-indigo-800 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                3. Lojas Recebem as Cargas
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onOpenEntries}
            className="px-3 py-1.5 bg-white border border-emerald-300 hover:bg-emerald-50 text-emerald-800 font-bold rounded-lg transition shadow-2xs"
          >
            + Entrada NF no CD
          </button>
          <button
            onClick={onOpenShipments}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition shadow-xs"
          >
            + Distribuir p/ Lojas
          </button>
        </div>
      </div>

      {/* Sub Tabs Selection */}
      <div className="flex border-b border-slate-200 gap-2">
        <button
          onClick={() => setActiveSubTab('central')}
          className={`flex items-center gap-2 px-4 py-2.5 font-bold text-sm border-b-2 transition ${
            activeSubTab === 'central'
              ? 'border-blue-600 text-blue-700 bg-blue-50/50 rounded-t-lg'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-t-lg'
          }`}
        >
          <Package className="w-4 h-4" />
          <span>Estoque Central do CD (Principal)</span>
          <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-mono font-bold">
            {stockSummaries.length} produtos
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab('distributions')}
          className={`flex items-center gap-2 px-4 py-2.5 font-bold text-sm border-b-2 transition ${
            activeSubTab === 'distributions'
              ? 'border-blue-600 text-blue-700 bg-blue-50/50 rounded-t-lg'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-t-lg'
          }`}
        >
          <StoreIcon className="w-4 h-4" />
          <span>Distribuição por Loja (Histórico Consolidado)</span>
          <span className="text-xs bg-slate-200 text-slate-800 px-2 py-0.5 rounded-full font-mono font-bold">
            {storeDistributionList.filter(s => s.totalBoxes > 0).length} lojas atendidas
          </span>
        </button>
      </div>

      {/* TAB 1: Central CD Stock View */}
      {activeSubTab === 'central' && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase">
                <span>Saldo em Caixas</span>
                <Box className="w-4 h-4 text-blue-600" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-900 font-mono">{totalBoxesInStock}</span>
                <span className="text-xs text-slate-500 font-medium">caixas/unid</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Disponível no armazém do CD</p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase">
                <span>Saldo em Peso</span>
                <Scale className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-black text-emerald-700 font-mono">
                  {totalWeightInStock.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                </span>
                <span className="text-xs text-slate-500 font-medium">kg</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Peso total estocado no CD</p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-xs bg-gradient-to-br from-white to-emerald-50/40">
              <div className="flex items-center justify-between text-emerald-800 text-xs font-bold uppercase">
                <span>Valor em Estoque</span>
                <DollarSign className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-xl xl:text-2xl font-black text-emerald-900 font-mono">
                  {totalEstimatedStockValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
              </div>
              <p className="text-[11px] text-emerald-700/80 mt-1">Baseado no valor de venda</p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase">
                <span>Entradas Total</span>
                <ArrowDownToLine className="w-4 h-4 text-blue-600" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-800 font-mono">{totalEntriesBoxes}</span>
                <span className="text-xs text-slate-500">cx recebidas</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Via notas fiscais</p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase">
                <span>Saídas Total</span>
                <ArrowUpFromLine className="w-4 h-4 text-amber-600" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-800 font-mono">{totalExitsBoxes}</span>
                <span className="text-xs text-slate-500">cx distribuídas</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Via romaneios para lojas</p>
            </div>
          </div>

          {/* Filter and Search Bar */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Pesquisar estoque central por código ou produto (ex: 101, Contrafilé)..."
                className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div className="flex items-center gap-2 text-xs">
              <Filter className="w-4 h-4 text-slate-400" />
              <span className="font-semibold text-slate-500">Filtro:</span>
              <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
                <button
                  onClick={() => setFilterStatus('ALL')}
                  className={`px-3 py-1.5 rounded-md font-medium transition ${
                    filterStatus === 'ALL' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Todos ({stockSummaries.length})
                </button>
                <button
                  onClick={() => setFilterStatus('IN_STOCK')}
                  className={`px-3 py-1.5 rounded-md font-medium transition ${
                    filterStatus === 'IN_STOCK' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Com Saldo ({stockSummaries.filter(s => s.currentBoxes > 0).length})
                </button>
                <button
                  onClick={() => setFilterStatus('LOW_OR_ZERO')}
                  className={`px-3 py-1.5 rounded-md font-medium transition ${
                    filterStatus === 'LOW_OR_ZERO' ? 'bg-white text-rose-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Baixo/Zerado ({stockSummaries.filter(s => s.currentBoxes <= 5).length})
                </button>
              </div>
            </div>
          </div>

          {/* Stock Table matching Central CD logic */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="px-5 py-3.5 w-24">Código</th>
                    <th className="px-5 py-3.5">Produto</th>
                    <th className="px-5 py-3.5">Fornecedor</th>
                    <th className="px-5 py-3.5">Unidade</th>
                    <th className="px-5 py-3.5 text-right bg-blue-50/40 text-blue-900">Entradas no CD</th>
                    <th className="px-5 py-3.5 text-right bg-amber-50/40 text-amber-900">Saídas p/ Lojas</th>
                    <th className="px-5 py-3.5 text-right bg-slate-100/60 font-bold text-slate-900">Saldo CD (Caixas)</th>
                    <th className="px-5 py-3.5 text-right bg-emerald-50/60 font-bold text-emerald-950">Saldo CD (Peso kg)</th>
                    <th className="px-5 py-3.5 text-right font-bold text-emerald-900">Valor Venda</th>
                    <th className="px-5 py-3.5 text-center">Status</th>
                    <th className="px-4 py-3.5 text-center">Manipular Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="px-6 py-12 text-center text-slate-400">
                        <Box className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                        <p className="font-semibold text-slate-700">Nenhum registro de estoque central encontrado</p>
                        <p className="text-xs text-slate-400 mt-1">
                          {searchTerm ? 'Tente ajustar sua busca ou filtro.' : 'Lance uma Nota Fiscal de Entrada para formar o saldo inicial do CD.'}
                        </p>
                      </td>
                    </tr>
                  ) : (
                    filtered.map((item) => {
                      const isZero = item.currentBoxes <= 0;
                      const isLow = item.currentBoxes > 0 && item.currentBoxes <= 5;

                      return (
                        <tr key={item.productId} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-5 py-3.5 font-mono font-bold text-blue-700 text-base">
                            {item.productCode}
                          </td>
                          <td className="px-5 py-3.5 font-bold text-slate-900">
                            {item.productName}
                          </td>
                          <td className="px-5 py-3.5">
                            {item.supplierName ? (
                              <div className="flex items-center gap-1.5 text-slate-700 font-medium text-xs">
                                <Truck className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                <span className="truncate max-w-[130px]" title={item.supplierName}>{item.supplierName}</span>
                              </div>
                            ) : (
                              <span className="text-slate-400 text-xs italic">—</span>
                            )}
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-semibold">
                              {item.unit}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-right text-slate-700 bg-blue-50/20">
                            <div>{item.totalEntriesBoxes} cx</div>
                            <div className="text-[11px] text-slate-400 font-normal">{item.totalEntriesWeightKg.toFixed(1)} kg</div>
                          </td>
                          <td className="px-5 py-3.5 text-right text-slate-700 bg-amber-50/20">
                            <div>{item.totalExitsBoxes} cx</div>
                            <div className="text-[11px] text-slate-400 font-normal">{item.totalExitsWeightKg.toFixed(1)} kg</div>
                          </td>
                          <td className="px-5 py-3.5 text-right font-black font-mono text-base text-slate-900 bg-slate-50/80">
                            {item.currentBoxes}
                          </td>
                          <td className="px-5 py-3.5 text-right font-black font-mono text-base text-emerald-800 bg-emerald-50/40">
                            {item.currentWeightKg.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            {item.salePrice && item.salePrice > 0 ? (
                              <div className="inline-flex flex-col items-end">
                                <span className="font-bold text-emerald-700 text-sm">
                                  {item.salePrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                </span>
                                <span className="text-[10px] text-slate-500 font-semibold uppercase">
                                  {item.salePriceType === 'POR_UNIDADE' ? `por ${item.unit.toLowerCase()}` : 'por kg'}
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-400 text-xs italic">—</span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-center">
                            {isZero ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800">
                                Sem Estoque
                              </span>
                            ) : isLow ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                                Estoque Baixo
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                                Adequado
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            <button
                              type="button"
                              onClick={() => handleOpenAdjustModal(item)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-blue-700 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition shadow-2xs"
                              title="Manipular saldo de caixas ou peso deste produto no CD"
                            >
                              <Sliders className="w-3.5 h-3.5" />
                              Ajustar
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Consolidated Store Distributions View */}
      {activeSubTab === 'distributions' && (
        <div className="space-y-6">
          {/* Store distribution KPI cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase">
                <span>Lojas com Cargas</span>
                <StoreIcon className="w-4 h-4 text-blue-600" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-900 font-mono">
                  {storeDistributionList.filter(s => s.totalBoxes > 0).length}
                </span>
                <span className="text-xs text-slate-500">de {storeDistributionList.length} lojas</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Lojas abastecidas por romaneios</p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase">
                <span>Total Caixas Distribuídas</span>
                <Box className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-black text-emerald-700 font-mono">
                  {totalDistributedBoxesAcrossStores}
                </span>
                <span className="text-xs text-slate-500 font-medium">cx saíram do CD</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Dedução total do estoque central</p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase">
                <span>Total Peso Distribuído</span>
                <Scale className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-black text-emerald-800 font-mono">
                  {totalDistributedWeightAcrossStores.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                </span>
                <span className="text-xs text-slate-500 font-medium">kg</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Peso total expedido para lojas</p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase">
                <span>Romaneios Emitidos</span>
                <FileText className="w-4 h-4 text-indigo-600" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-black text-indigo-900 font-mono">
                  {shipments.filter(s => s.status !== 'CANCELLED').length}
                </span>
                <span className="text-xs text-slate-500">romaneios ativos</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Histórico de saídas do CD</p>
            </div>
          </div>

          {/* Filter Bar for Stores */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Pesquisar loja (ex: LOJA 01, LOJA 06, LOJA 10, LOJA 14)..."
                className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">Filtrar Loja:</span>
              <select
                value={selectedStoreFilter}
                onChange={(e) => setSelectedStoreFilter(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-300 rounded-lg font-medium text-slate-800 bg-white"
              >
                <option value="ALL">Todas as Lojas ({storeDistributionList.length} Lojas)</option>
                {storeDistributionList.map((st) => (
                  <option key={st.storeName} value={st.storeName}>
                    {st.storeName} ({st.totalBoxes} cx)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Stores Distribution Cards */}
          <div className="space-y-4">
            {filteredStoreDistributions.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
                <StoreIcon className="w-12 h-12 mx-auto text-slate-300 mb-2" />
                <p className="font-semibold text-slate-700">Nenhuma loja encontrada para o filtro selecionado.</p>
              </div>
            ) : (
              filteredStoreDistributions.map((storeEntry) => {
                const hasDistribution = storeEntry.totalBoxes > 0;
                return (
                  <div key={storeEntry.storeName} className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                    <div className="px-5 py-4 bg-slate-50/80 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className={`p-2.5 rounded-xl ${hasDistribution ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                          <StoreIcon className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-slate-900 text-base">{storeEntry.storeName}</h3>
                            {storeEntry.storeCode && (
                              <span className="text-[11px] font-mono bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-bold">
                                {storeEntry.storeCode}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {hasDistribution 
                              ? `${storeEntry.products.length} produtos diferentes recebidos do Estoque Central do CD`
                              : 'Nenhuma mercadoria distribuída do CD para esta loja até o momento'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-sm">
                        <div className="text-right">
                          <span className="text-[10px] text-slate-400 block uppercase font-bold">Total Recebido do CD</span>
                          <span className="font-black text-slate-900 font-mono text-base">{storeEntry.totalBoxes} cx</span>
                          <span className="text-xs font-bold text-emerald-700 ml-1.5">
                            ({storeEntry.totalWeightKg.toFixed(2)} kg)
                          </span>
                        </div>
                        <button
                          onClick={onOpenShipments}
                          className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs rounded-lg border border-blue-200 transition"
                        >
                          + Montar Romaneio
                        </button>
                      </div>
                    </div>

                    {hasDistribution ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-slate-600">
                          <thead className="bg-slate-50/50 text-[11px] uppercase font-bold text-slate-500 border-b border-slate-200">
                            <tr>
                              <th className="px-5 py-2.5 w-24">Código</th>
                              <th className="px-5 py-2.5">Produto Distribuído</th>
                              <th className="px-5 py-2.5">Unidade</th>
                              <th className="px-5 py-2.5 text-right font-bold text-slate-900">Qtd Recebida</th>
                              <th className="px-5 py-2.5 text-right font-bold text-emerald-800">Peso Total (kg)</th>
                              <th className="px-5 py-2.5">Romaneios de Origem</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {storeEntry.products.map((prod) => (
                              <tr key={prod.productId} className="hover:bg-slate-50/60">
                                <td className="px-5 py-3 font-mono font-bold text-blue-700">
                                  {prod.productCode}
                                </td>
                                <td className="px-5 py-3 font-semibold text-slate-900">
                                  {prod.productName}
                                </td>
                                <td className="px-5 py-3">
                                  <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-semibold">
                                    {prod.unit}
                                  </span>
                                </td>
                                <td className="px-5 py-3 text-right font-bold text-slate-900 font-mono">
                                  {prod.boxes} {prod.unit.toLowerCase()}
                                </td>
                                <td className="px-5 py-3 text-right font-bold text-emerald-700 font-mono">
                                  {prod.weightKg.toFixed(2)} kg
                                </td>
                                <td className="px-5 py-3">
                                  <div className="flex flex-wrap gap-1">
                                    {prod.romaneiosList.length > 0 ? (
                                      prod.romaneiosList.map((romNum) => (
                                        <span key={romNum} className="text-[11px] font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded">
                                          Nº {romNum}
                                        </span>
                                      ))
                                    ) : (
                                      <span className="text-slate-400 text-xs italic">—</span>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="p-6 text-center text-xs text-slate-400">
                        Nenhum produto enviado para esta loja. Para distribuir produtos do Estoque Central do CD para {storeEntry.storeName}, inicie uma distribuição por Romaneio.
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Manual Stock Adjustment / Inventory Modal */}
      {isAdjustModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-500/20 rounded-lg text-blue-400">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base leading-tight">Manipulação de Estoque / Inventário</h3>
                  <p className="text-xs text-slate-300">Ajuste manual e livre de caixas e peso físico</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAdjustModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSaveAdjustment} className="p-6 space-y-4">
              {adjustError && (
                <div className="p-3 text-xs bg-rose-50 border border-rose-200 text-rose-700 rounded-lg flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{adjustError}</span>
                </div>
              )}

              {adjustSuccess && (
                <div className="p-3 text-xs bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span>{adjustSuccess}</span>
                </div>
              )}

              {/* Product Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Produto a ser manipulado
                </label>
                <select
                  value={selectedProductIdInput}
                  onChange={(e) => handleSelectProductInModal(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm font-semibold border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                  required
                >
                  <option value="">-- Selecione o produto --</option>
                  {stockSummaries.map((p) => (
                    <option key={p.productId} value={p.productId}>
                      {p.productCode} — {p.productName} (Atual: {p.currentBoxes} cx / {p.currentWeightKg.toFixed(1)} kg)
                    </option>
                  ))}
                </select>
              </div>

              {/* Current Balance Display Card */}
              {selectedProductForAdjust && (
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-slate-500 block font-medium">Saldo Atual no Sistema:</span>
                    <strong className="text-slate-900 font-bold text-sm">
                      {selectedProductForAdjust.productCode} • {selectedProductForAdjust.productName}
                    </strong>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-blue-700 text-sm block">
                      {selectedProductForAdjust.currentBoxes} caixas
                    </span>
                    <span className="font-bold text-emerald-700 text-xs">
                      {selectedProductForAdjust.currentWeightKg.toFixed(2)} kg
                    </span>
                  </div>
                </div>
              )}

              {/* Mode switch */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Forma do Ajuste
                </label>
                <div className="grid grid-cols-2 rounded-lg border border-slate-300 p-0.5 bg-slate-100 text-xs">
                  <button
                    type="button"
                    onClick={() => setAdjustMode('SET_BALANCE')}
                    className={`py-2 rounded-md font-bold transition ${
                      adjustMode === 'SET_BALANCE' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    Definir Novo Saldo Físico
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustMode('DELTA')}
                    className={`py-2 rounded-md font-bold transition ${
                      adjustMode === 'DELTA' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    Lançar Acerto (+ / -)
                  </button>
                </div>
              </div>

              {/* Inputs based on Mode */}
              {adjustMode === 'SET_BALANCE' ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Novo Saldo em Caixas
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={targetBoxesInput}
                      onChange={(e) => setTargetBoxesInput(Number(e.target.value))}
                      placeholder="0"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-black text-slate-900 bg-white"
                      required
                    />
                    {selectedProductForAdjust && (
                      <span className="text-[11px] text-slate-500 block mt-1">
                        Diferença: <strong className={targetBoxesInput - selectedProductForAdjust.currentBoxes >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                          {targetBoxesInput - selectedProductForAdjust.currentBoxes >= 0 ? '+' : ''}
                          {(targetBoxesInput - selectedProductForAdjust.currentBoxes).toFixed(2)} cx
                        </strong>
                      </span>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Novo Saldo em Peso (kg)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={targetWeightInput}
                        onChange={(e) => setTargetWeightInput(Number(e.target.value))}
                        placeholder="0.00"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-black text-emerald-800 bg-white"
                        required
                      />
                      <span className="absolute right-3 top-2 text-xs font-bold text-slate-400">kg</span>
                    </div>
                    {selectedProductForAdjust && (
                      <span className="text-[11px] text-slate-500 block mt-1">
                        Diferença: <strong className={targetWeightInput - selectedProductForAdjust.currentWeightKg >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                          {targetWeightInput - selectedProductForAdjust.currentWeightKg >= 0 ? '+' : ''}
                          {(targetWeightInput - selectedProductForAdjust.currentWeightKg).toFixed(2)} kg
                        </strong>
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Acerto de Caixas (+ ou -)
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={deltaBoxesInput}
                      onChange={(e) => setDeltaBoxesInput(Number(e.target.value))}
                      placeholder="Ex: 2 ou -1"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-black text-slate-900 bg-white"
                      required
                    />
                    <span className="text-[11px] text-slate-500 block mt-1">
                      Use valor positivo (+) ou negativo (-)
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Acerto de Peso em kg (+ ou -)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.01"
                        value={deltaWeightInput}
                        onChange={(e) => setDeltaWeightInput(Number(e.target.value))}
                        placeholder="Ex: 40.50 ou -15.20"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-black text-emerald-800 bg-white"
                        required
                      />
                      <span className="absolute right-3 top-2 text-xs font-bold text-slate-400">kg</span>
                    </div>
                    <span className="text-[11px] text-slate-500 block mt-1">
                      Use valor positivo (+) ou negativo (-)
                    </span>
                  </div>
                </div>
              )}

              {/* Reason */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Motivo / Observação do Acerto
                </label>
                <input
                  type="text"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="Ex: Contagem física na câmara fria, quebra, acerto de pesagem"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                  required
                />
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAdjustModalOpen(false)}
                  disabled={adjustLoading}
                  className="px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-lg transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={adjustLoading || !selectedProductForAdjust}
                  className="inline-flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs rounded-lg transition shadow-xs"
                >
                  {adjustLoading ? (
                    <span>Registrando...</span>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      Salvar e Atualizar Estoque
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
