import React, { useState, useMemo } from 'react';
import { 
  BarChart3, 
  Calendar, 
  User, 
  Package, 
  Store as StoreIcon, 
  Printer, 
  Download, 
  ArrowDownToLine, 
  ArrowUpFromLine, 
  Scale, 
  Box,
  FileText,
  TrendingUp,
  DollarSign,
  Lock,
  Percent,
  Search,
  Filter
} from 'lucide-react';
import { Product, StockMovement, Invoice, Shipment, Store } from '../types';
import { useAuth } from '../firebase/authContext';
import { exportStockAndMovementsPDF } from '../utils/pdfExport';

const formatBRL = (val?: number | null) => {
  return (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

interface ReportsViewProps {
  products: Product[];
  movements: StockMovement[];
  invoices: Invoice[];
  shipments: Shipment[];
  stores: Store[];
}

export const ReportsView: React.FC<ReportsViewProps> = ({
  products,
  movements,
  invoices,
  shipments,
  stores
}) => {
  const { currentUser } = useAuth();
  const [activeReportTab, setActiveReportTab] = useState<'profit' | 'monthly' | 'by_user' | 'by_product' | 'by_store'>('profit');
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  // Profit Report State & Filters
  const [profitStartDate, setProfitStartDate] = useState('');
  const [profitEndDate, setProfitEndDate] = useState('');
  const [profitProductId, setProfitProductId] = useState('');
  const [profitStoreId, setProfitStoreId] = useState('');
  const [profitRomaneioNum, setProfitRomaneioNum] = useState('');
  const [profitInvoiceNum, setProfitInvoiceNum] = useState('');
  const [profitViewMode, setProfitViewMode] = useState<'by_product' | 'by_operation'>('by_product');

  const handleExportPDF = () => {
    try {
      setIsExportingPdf(true);
      exportStockAndMovementsPDF(products, movements, currentUser?.name);
    } catch (err) {
      console.error('Erro ao gerar PDF:', err);
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Month selector for Monthly Report (YYYY-MM)
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  // User report filters
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [userStartDate, setUserStartDate] = useState('');
  const [userEndDate, setUserEndDate] = useState('');

  // Product report filters
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [prodStartDate, setProdStartDate] = useState('');
  const [prodEndDate, setProdEndDate] = useState('');

  // Store report filters
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');
  const [storeStartDate, setStoreStartDate] = useState('');
  const [storeEndDate, setStoreEndDate] = useState('');

  // Available users list
  const availableUsers = useMemo(() => {
    const set = new Set<string>();
    movements.forEach(m => { if (m.userName) set.add(m.userName); });
    return Array.from(set);
  }, [movements]);

  // Set initial selected user
  React.useEffect(() => {
    if (!selectedUser && availableUsers.length > 0) {
      setSelectedUser(availableUsers[0]);
    }
  }, [availableUsers, selectedUser]);

  // 0. INTERNAL PROFIT REPORT CALCULATIONS (Controle Interno de Lucro)
  const profitReportData = useMemo(() => {
    // 1. Process incoming invoices (Purchases)
    let totalBoughtBoxes = 0;
    let totalBoughtKg = 0;
    let totalCostBought = 0;

    const filteredInvoices = invoices.filter(inv => {
      if (inv.status === 'CANCELLED') return false;
      if (profitStartDate && inv.date < profitStartDate) return false;
      if (profitEndDate && inv.date > profitEndDate) return false;
      if (profitInvoiceNum.trim() && !inv.invoiceNumber.toLowerCase().includes(profitInvoiceNum.trim().toLowerCase())) return false;
      return true;
    });

    for (const inv of filteredInvoices) {
      for (const item of inv.items) {
        if (profitProductId && item.productId !== profitProductId) continue;
        const bxs = Number(item.quantityBoxes) || 0;
        const wt = Number(item.weightKg) || 0;
        const itemCost = Number(item.totalCostPrice) || (
          item.unitCostPrice ? (item.costPriceType === 'POR_KG' ? wt * item.unitCostPrice : bxs * item.unitCostPrice) : 0
        );
        totalBoughtBoxes += bxs;
        totalBoughtKg += wt;
        totalCostBought += itemCost;
      }
    }

    // 2. Process outbound shipments (Sales to stores)
    const operations: Array<{
      id: string;
      romaneioNumber: string;
      date: string;
      storeName: string;
      productId: string;
      productCode: string;
      productName: string;
      unit: string;
      quantityBoxes: number;
      weightKg: number;
      unitCostPrice: number;
      costPriceType: 'POR_KG' | 'POR_UNIDADE';
      unitSalePrice: number;
      salePriceType: 'POR_KG' | 'POR_UNIDADE';
      totalCost: number;
      totalRevenue: number;
      profit: number;
      marginPercent: number;
    }> = [];

    const productsAggMap = new Map<string, {
      productId: string;
      productCode: string;
      productName: string;
      unit: string;
      quantityBoxes: number;
      weightKg: number;
      totalCost: number;
      totalRevenue: number;
      profit: number;
      marginPercent: number;
      unitCostPrice: number;
      costPriceType: 'POR_KG' | 'POR_UNIDADE';
      unitSalePrice: number;
      salePriceType: 'POR_KG' | 'POR_UNIDADE';
    }>();

    let totalSoldBoxes = 0;
    let totalSoldKg = 0;
    let totalCostSold = 0;
    let totalRevenue = 0;

    const filteredShipments = shipments.filter(ship => {
      if (ship.status === 'CANCELLED') return false;
      if (profitStartDate && ship.date < profitStartDate) return false;
      if (profitEndDate && ship.date > profitEndDate) return false;
      if (profitRomaneioNum.trim() && !ship.romaneioNumber.toLowerCase().includes(profitRomaneioNum.trim().toLowerCase())) return false;
      return true;
    });

    for (const ship of filteredShipments) {
      for (const dest of ship.destinations) {
        if (profitStoreId && dest.storeId !== profitStoreId && dest.storeName !== profitStoreId) continue;

        for (const item of dest.items) {
          if (profitProductId && item.productId !== profitProductId) continue;

          const prod = products.find(p => p.id === item.productId);
          const bxs = Number(item.quantityBoxes) || 0;
          const wt = Number(item.weightKg) || 0;

          // Unit cost price (Internal)
          let unitCost = 0;
          let costType: 'POR_KG' | 'POR_UNIDADE' = 'POR_UNIDADE';

          if (typeof item.unitCostPrice === 'number' && item.unitCostPrice > 0) {
            unitCost = item.unitCostPrice;
            costType = item.costPriceType || 'POR_UNIDADE';
          } else if (prod && typeof prod.costPrice === 'number' && prod.costPrice > 0) {
            unitCost = prod.costPrice;
            costType = prod.costPriceType || 'POR_UNIDADE';
          } else {
            // Check recent invoice movement
            const lastMov = movements.find(m => m.productId === item.productId && m.type === 'ENTRADA' && m.status !== 'CANCELLED' && m.unitCostPrice && m.unitCostPrice > 0);
            if (lastMov && lastMov.unitCostPrice) {
              unitCost = lastMov.unitCostPrice;
              costType = lastMov.costPriceType || 'POR_UNIDADE';
            }
          }

          // Item Cost calculation
          let itemCost = 0;
          if (typeof item.totalCostPrice === 'number' && item.totalCostPrice > 0) {
            itemCost = item.totalCostPrice;
          } else if (unitCost > 0) {
            if (costType === 'POR_KG') {
              itemCost = Math.round(wt * unitCost * 100) / 100;
            } else {
              itemCost = Math.round(bxs * unitCost * 100) / 100;
            }
          }

          // Sale Price & Revenue
          let unitSale = item.unitPrice || prod?.salePrice || 0;
          let saleType: 'POR_KG' | 'POR_UNIDADE' = item.priceType || prod?.salePriceType || 'POR_KG';
          let itemRevenue = item.totalPrice || 0;
          if (itemRevenue <= 0 && unitSale > 0) {
            if (saleType === 'POR_KG') {
              itemRevenue = Math.round(wt * unitSale * 100) / 100;
            } else {
              itemRevenue = Math.round(bxs * unitSale * 100) / 100;
            }
          }

          const itemProfit = Math.round((itemRevenue - itemCost) * 100) / 100;
          const itemMargin = itemRevenue > 0 ? Math.round((itemProfit / itemRevenue) * 10000) / 100 : 0;

          totalSoldBoxes += bxs;
          totalSoldKg += wt;
          totalCostSold += itemCost;
          totalRevenue += itemRevenue;

          operations.push({
            id: `${ship.id}_${dest.id}_${item.id}`,
            romaneioNumber: ship.romaneioNumber,
            date: ship.date,
            storeName: dest.storeName,
            productId: item.productId,
            productCode: item.productCode,
            productName: item.productName,
            unit: item.unit,
            quantityBoxes: bxs,
            weightKg: wt,
            unitCostPrice: unitCost,
            costPriceType: costType,
            unitSalePrice: unitSale,
            salePriceType: saleType,
            totalCost: itemCost,
            totalRevenue: itemRevenue,
            profit: itemProfit,
            marginPercent: itemMargin
          });

          // Aggregate by product
          if (!productsAggMap.has(item.productId)) {
            productsAggMap.set(item.productId, {
              productId: item.productId,
              productCode: item.productCode,
              productName: item.productName,
              unit: item.unit,
              quantityBoxes: 0,
              weightKg: 0,
              totalCost: 0,
              totalRevenue: 0,
              profit: 0,
              marginPercent: 0,
              unitCostPrice: unitCost,
              costPriceType: costType,
              unitSalePrice: unitSale,
              salePriceType: saleType
            });
          }

          const pAgg = productsAggMap.get(item.productId)!;
          pAgg.quantityBoxes += bxs;
          pAgg.weightKg += wt;
          pAgg.totalCost += itemCost;
          pAgg.totalRevenue += itemRevenue;
          pAgg.profit += itemProfit;
          pAgg.marginPercent = pAgg.totalRevenue > 0 ? Math.round((pAgg.profit / pAgg.totalRevenue) * 10000) / 100 : 0;
        }
      }
    }

    const totalProfit = Math.round((totalRevenue - totalCostSold) * 100) / 100;
    const overallMargin = totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 10000) / 100 : 0;

    const productsAggList = Array.from(productsAggMap.values()).sort((a, b) => b.profit - a.profit);

    return {
      totalBoughtBoxes,
      totalBoughtKg,
      totalCostBought,
      totalSoldBoxes,
      totalSoldKg,
      totalCostSold,
      totalRevenue,
      totalProfit,
      overallMargin,
      productsAggList,
      operations
    };
  }, [invoices, shipments, products, movements, profitStartDate, profitEndDate, profitProductId, profitStoreId, profitRomaneioNum, profitInvoiceNum]);

  // 1. MONTHLY REPORT CALCULATIONS
  const monthlyData = useMemo(() => {
    const validMovements = movements.filter(m => {
      if (m.status === 'CANCELLED') return false;
      const mMonth = m.createdAtIso ? m.createdAtIso.substring(0, 7) : '';
      return mMonth === selectedMonth;
    });

    let entriesBoxes = 0;
    let entriesKg = 0;
    let exitsBoxes = 0;
    let exitsKg = 0;

    const productsMap = new Map<string, { code: string; name: string; entriesBoxes: number; entriesKg: number; exitsBoxes: number; exitsKg: number }>();

    for (const mov of validMovements) {
      if (!productsMap.has(mov.productId)) {
        productsMap.set(mov.productId, {
          code: mov.productCode,
          name: mov.productName,
          entriesBoxes: 0,
          entriesKg: 0,
          exitsBoxes: 0,
          exitsKg: 0
        });
      }
      const pEntry = productsMap.get(mov.productId)!;

      if (mov.type === 'ENTRADA') {
        entriesBoxes += mov.boxes;
        entriesKg += mov.weightKg;
        pEntry.entriesBoxes += mov.boxes;
        pEntry.entriesKg += mov.weightKg;
      } else {
        exitsBoxes += mov.boxes;
        exitsKg += mov.weightKg;
        pEntry.exitsBoxes += mov.boxes;
        pEntry.exitsKg += mov.weightKg;
      }
    }

    return {
      entriesBoxes,
      entriesKg,
      exitsBoxes,
      exitsKg,
      balanceBoxes: entriesBoxes - exitsBoxes,
      balanceKg: entriesKg - exitsKg,
      productsList: Array.from(productsMap.values()),
      totalOperations: validMovements.length
    };
  }, [movements, selectedMonth]);

  // 2. USER REPORT CALCULATIONS
  const userReportData = useMemo(() => {
    if (!selectedUser) return null;

    const userInvoices = invoices.filter(inv => {
      if (inv.userName !== selectedUser) return false;
      if (userStartDate && inv.date < userStartDate) return false;
      if (userEndDate && inv.date > userEndDate) return false;
      return true;
    });

    const userShipments = shipments.filter(ship => {
      if (ship.userName !== selectedUser) return false;
      if (userStartDate && ship.date < userStartDate) return false;
      if (userEndDate && ship.date > userEndDate) return false;
      return true;
    });

    const totalOps = userInvoices.length + userShipments.length;
    const totalEntriesBoxes = userInvoices.reduce((s, i) => s + (i.status === 'CONFIRMED' ? i.totalBoxes : 0), 0);
    const totalEntriesKg = userInvoices.reduce((s, i) => s + (i.status === 'CONFIRMED' ? i.totalWeightKg : 0), 0);
    const totalExitsBoxes = userShipments.reduce((s, i) => s + (i.status === 'CONFIRMED' ? i.totalBoxes : 0), 0);
    const totalExitsKg = userShipments.reduce((s, i) => s + (i.status === 'CONFIRMED' ? i.totalWeightKg : 0), 0);

    return {
      userInvoices,
      userShipments,
      totalOps,
      totalEntriesBoxes,
      totalEntriesKg,
      totalExitsBoxes,
      totalExitsKg
    };
  }, [invoices, shipments, selectedUser, userStartDate, userEndDate]);

  // 3. PRODUCT REPORT CALCULATIONS
  const productReportData = useMemo(() => {
    const prod = products.find(p => p.id === selectedProductId) || products[0];
    if (!prod) return null;

    const prodMovements = movements.filter(m => {
      if (m.productId !== prod.id) return false;
      if (m.status === 'CANCELLED') return false;
      const mDate = m.createdAtIso ? m.createdAtIso.split('T')[0] : '';
      if (prodStartDate && mDate < prodStartDate) return false;
      if (prodEndDate && mDate > prodEndDate) return false;
      return true;
    });

    let totalEntriesBoxes = 0;
    let totalEntriesKg = 0;
    let totalExitsBoxes = 0;
    let totalExitsKg = 0;

    for (const m of prodMovements) {
      if (m.type === 'ENTRADA') {
        totalEntriesBoxes += m.boxes;
        totalEntriesKg += m.weightKg;
      } else {
        totalExitsBoxes += m.boxes;
        totalExitsKg += m.weightKg;
      }
    }

    return {
      product: prod,
      totalEntriesBoxes,
      totalEntriesKg,
      totalExitsBoxes,
      totalExitsKg,
      balanceBoxes: totalEntriesBoxes - totalExitsBoxes,
      balanceKg: totalEntriesKg - totalExitsKg,
      movements: prodMovements
    };
  }, [products, movements, selectedProductId, prodStartDate, prodEndDate]);

  // 4. STORE REPORT CALCULATIONS
  const storeReportData = useMemo(() => {
    // Shipments items filtered by store and date
    const storeDeliveries = new Map<string, { storeName: string; totalBoxes: number; totalWeightKg: number; shipmentsCount: number; productsBreakdown: Map<string, { name: string; boxes: number; weightKg: number }> }>();

    for (const ship of shipments) {
      if (ship.status === 'CANCELLED') continue;
      if (storeStartDate && ship.date < storeStartDate) continue;
      if (storeEndDate && ship.date > storeEndDate) continue;

      for (const dest of ship.destinations) {
        if (selectedStoreId && dest.storeName !== selectedStoreId && dest.storeId !== selectedStoreId) continue;

        if (!storeDeliveries.has(dest.storeName)) {
          storeDeliveries.set(dest.storeName, {
            storeName: dest.storeName,
            totalBoxes: 0,
            totalWeightKg: 0,
            shipmentsCount: 0,
            productsBreakdown: new Map()
          });
        }

        const storeData = storeDeliveries.get(dest.storeName)!;
        storeData.shipmentsCount += 1;
        storeData.totalBoxes += dest.subtotalBoxes;
        storeData.totalWeightKg += dest.subtotalWeightKg;

        for (const item of dest.items) {
          if (!storeData.productsBreakdown.has(item.productId)) {
            storeData.productsBreakdown.set(item.productId, {
              name: item.productName,
              boxes: 0,
              weightKg: 0
            });
          }
          const p = storeData.productsBreakdown.get(item.productId)!;
          p.boxes += item.quantityBoxes;
          p.weightKg += item.weightKg;
        }
      }
    }

    return Array.from(storeDeliveries.values());
  }, [shipments, selectedStoreId, storeStartDate, storeEndDate]);

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-blue-600" />
            Central de Relatórios Gerenciais
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Análise consolidada por Mês, Usuário responsável, Produto e Lojas de destino.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleExportPDF}
            disabled={isExportingPdf}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold text-xs rounded-lg transition shadow-xs cursor-pointer"
            title="Baixar resumo de estoque e movimentações em documento PDF formatado"
          >
            <Download className="w-4 h-4" />
            {isExportingPdf ? 'Gerando PDF...' : 'Exportar PDF'}
          </button>

          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-lg transition cursor-pointer"
          >
            <Printer className="w-4 h-4 text-slate-500" />
            Imprimir
          </button>
        </div>
      </div>

      {/* Report Selection Tabs */}
      <div className="flex border-b border-slate-200 overflow-x-auto gap-2 bg-white px-4 pt-2 rounded-t-xl border-t border-x">
        <button
          onClick={() => setActiveReportTab('profit')}
          className={`flex items-center gap-2 py-3 px-4 border-b-2 font-bold text-xs sm:text-sm whitespace-nowrap transition cursor-pointer ${
            activeReportTab === 'profit'
              ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <TrendingUp className="w-4 h-4 text-emerald-600" />
          <span>Relatório de Lucro & Margem</span>
          <span className="text-[10px] bg-amber-100 text-amber-900 border border-amber-300 font-extrabold px-1.5 py-0.5 rounded">
            🔒 Interno
          </span>
        </button>

        <button
          onClick={() => setActiveReportTab('monthly')}
          className={`flex items-center gap-2 py-3 px-4 border-b-2 font-bold text-xs sm:text-sm whitespace-nowrap transition ${
            activeReportTab === 'monthly'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Calendar className="w-4 h-4" />
          Relatório Mensal de Estoque
        </button>

        <button
          onClick={() => setActiveReportTab('by_user')}
          className={`flex items-center gap-2 py-3 px-4 border-b-2 font-bold text-xs sm:text-sm whitespace-nowrap transition ${
            activeReportTab === 'by_user'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <User className="w-4 h-4" />
          Relatório por Usuário
        </button>

        <button
          onClick={() => setActiveReportTab('by_product')}
          className={`flex items-center gap-2 py-3 px-4 border-b-2 font-bold text-xs sm:text-sm whitespace-nowrap transition ${
            activeReportTab === 'by_product'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Package className="w-4 h-4" />
          Relatório por Produto
        </button>

        <button
          onClick={() => setActiveReportTab('by_store')}
          className={`flex items-center gap-2 py-3 px-4 border-b-2 font-bold text-xs sm:text-sm whitespace-nowrap transition ${
            activeReportTab === 'by_store'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <StoreIcon className="w-4 h-4" />
          Relatório por Loja
        </button>
      </div>

      {/* 0. PROFIT REPORT CONTENT */}
      {activeReportTab === 'profit' && (
        <div className="space-y-6">
          {/* Profit Filters Bar */}
          <div className="bg-white p-5 rounded-b-xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-emerald-600" />
                <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Filtros Administrativos do Relatório de Lucro
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setProfitStartDate('');
                    setProfitEndDate('');
                    setProfitProductId('');
                    setProfitStoreId('');
                    setProfitRomaneioNum('');
                    setProfitInvoiceNum('');
                  }}
                  className="text-xs text-slate-500 hover:text-slate-800 font-medium hover:underline cursor-pointer"
                >
                  Limpar Todos os Filtros
                </button>
                <div className="inline-flex rounded-lg border border-slate-300 p-0.5 bg-slate-50 text-xs">
                  <button
                    type="button"
                    onClick={() => setProfitViewMode('by_product')}
                    className={`px-3 py-1 rounded-md font-semibold transition cursor-pointer ${
                      profitViewMode === 'by_product' ? 'bg-emerald-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Por Produto (Agrupado)
                  </button>
                  <button
                    type="button"
                    onClick={() => setProfitViewMode('by_operation')}
                    className={`px-3 py-1 rounded-md font-semibold transition cursor-pointer ${
                      profitViewMode === 'by_operation' ? 'bg-emerald-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Por Operação / Venda
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 uppercase mb-1">Data Inicial</label>
                <input
                  type="date"
                  value={profitStartDate}
                  onChange={(e) => setProfitStartDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs outline-none focus:ring-1 focus:ring-emerald-500 bg-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 uppercase mb-1">Data Final</label>
                <input
                  type="date"
                  value={profitEndDate}
                  onChange={(e) => setProfitEndDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs outline-none focus:ring-1 focus:ring-emerald-500 bg-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 uppercase mb-1">Produto</label>
                <select
                  value={profitProductId}
                  onChange={(e) => setProfitProductId(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs outline-none focus:ring-1 focus:ring-emerald-500 bg-white font-medium truncate"
                >
                  <option value="">Todos os Produtos</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.code} - {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 uppercase mb-1">Loja / Destino</label>
                <select
                  value={profitStoreId}
                  onChange={(e) => setProfitStoreId(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs outline-none focus:ring-1 focus:ring-emerald-500 bg-white font-medium truncate"
                >
                  <option value="">Todas as Lojas</option>
                  {stores.map(st => (
                    <option key={st.id} value={st.name}>{st.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 uppercase mb-1">Nº Romaneio</label>
                <input
                  type="text"
                  placeholder="Ex: 000123"
                  value={profitRomaneioNum}
                  onChange={(e) => setProfitRomaneioNum(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs outline-none focus:ring-1 focus:ring-emerald-500 bg-white font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 uppercase mb-1">Nº Nota Fiscal</label>
                <input
                  type="text"
                  placeholder="Ex: 1234"
                  value={profitInvoiceNum}
                  onChange={(e) => setProfitInvoiceNum(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs outline-none focus:ring-1 focus:ring-emerald-500 bg-white font-mono"
                />
              </div>
            </div>

            {/* Security disclaimer banner */}
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-950 text-xs flex items-center gap-2.5">
              <Lock className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>Confidencialidade Estrita:</strong> Os custos de compra pagos pela empresa são exclusivos deste controle administrativo interno. O cliente/loja NUNCA tem acesso a esses custos no Romaneio ou documentos de entrega.
              </span>
            </div>
          </div>

          {/* KPI Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-xs text-slate-500 font-bold uppercase mb-1">
                <span>Total Comprado</span>
                <ArrowDownToLine className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-xl font-black text-slate-900 font-mono">
                {profitReportData.totalBoughtBoxes} cx
              </div>
              <div className="text-xs text-slate-500 font-medium">
                {profitReportData.totalBoughtKg.toFixed(1)} kg
              </div>
              <div className="text-xs text-amber-900 font-bold mt-1 font-mono">
                Custo: {formatBRL(profitReportData.totalCostBought)}
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-xs text-slate-500 font-bold uppercase mb-1">
                <span>Total Vendido</span>
                <ArrowUpFromLine className="w-4 h-4 text-blue-600" />
              </div>
              <div className="text-xl font-black text-blue-700 font-mono">
                {profitReportData.totalSoldBoxes} cx
              </div>
              <div className="text-xs text-slate-500 font-medium">
                {profitReportData.totalSoldKg.toFixed(1)} kg
              </div>
              <span className="text-[10px] text-slate-400 block mt-1">Expedido em romaneios</span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-amber-200 bg-amber-50/40 shadow-xs">
              <div className="flex items-center justify-between text-xs text-amber-900 font-bold uppercase mb-1">
                <span>Custo das Vendas</span>
                <Lock className="w-3.5 h-3.5 text-amber-600" />
              </div>
              <div className="text-xl font-black text-amber-950 font-mono">
                {formatBRL(profitReportData.totalCostSold)}
              </div>
              <div className="text-[10px] text-amber-700 font-medium mt-1">
                Custo pago pela empresa
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-xs text-slate-500 font-bold uppercase mb-1">
                <span>Receita de Vendas</span>
                <DollarSign className="w-4 h-4 text-blue-600" />
              </div>
              <div className="text-xl font-black text-slate-900 font-mono">
                {formatBRL(profitReportData.totalRevenue)}
              </div>
              <div className="text-[10px] text-slate-500 font-medium mt-1">
                Valor faturado às lojas
              </div>
            </div>

            <div className={`p-4 rounded-xl border shadow-xs ${
              profitReportData.totalProfit >= 0 ? 'bg-emerald-50/70 border-emerald-300' : 'bg-rose-50 border-rose-300'
            }`}>
              <div className="flex items-center justify-between text-xs font-black uppercase mb-1 text-slate-700">
                <span>Lucro Bruto Total</span>
                <TrendingUp className={`w-4 h-4 ${profitReportData.totalProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`} />
              </div>
              <div className={`text-xl font-black font-mono ${profitReportData.totalProfit >= 0 ? 'text-emerald-800' : 'text-rose-800'}`}>
                {formatBRL(profitReportData.totalProfit)}
              </div>
              <div className="text-[10px] text-slate-600 font-bold mt-1">
                Receita - Custo interno
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-xs text-slate-500 font-bold uppercase mb-1">
                <span>Margem de Lucro</span>
                <Percent className="w-4 h-4 text-emerald-600" />
              </div>
              <div className={`text-xl font-black font-mono ${profitReportData.overallMargin >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                {profitReportData.overallMargin.toFixed(1)}%
              </div>
              <div className="text-[10px] text-slate-400 font-medium mt-1">
                Sobre a receita de vendas
              </div>
            </div>
          </div>

          {/* Profit Table - Mode 1: By Product (Agrupado) */}
          {profitViewMode === 'by_product' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                    Apuração de Lucro Consolidada por Produto
                  </h3>
                  <p className="text-xs text-slate-500">
                    Demonstração de custo de aquisição, preço de venda para as lojas, receita total e margem alcançada.
                  </p>
                </div>
                <span className="text-xs text-slate-500">
                  Total: <strong>{profitReportData.productsAggList.length}</strong> produto(s)
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-600">
                  <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-700 border-b border-slate-200 tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Cód</th>
                      <th className="px-4 py-3">Produto</th>
                      <th className="px-4 py-3 text-right">Qtd Vendida</th>
                      <th className="px-4 py-3 text-right">Peso Vendido</th>
                      <th className="px-4 py-3 text-right bg-amber-50/60 text-amber-950">
                        Custo Unit. (R$)
                        <span className="block text-[9px] text-amber-700 font-normal">🔒 Interno</span>
                      </th>
                      <th className="px-4 py-3 text-right">Preço Venda Unit.</th>
                      <th className="px-4 py-3 text-right bg-amber-50/60 text-amber-950">Custo Total (R$)</th>
                      <th className="px-4 py-3 text-right">Receita Venda (R$)</th>
                      <th className="px-4 py-3 text-right bg-emerald-50/60 text-emerald-950 font-bold">Lucro (R$)</th>
                      <th className="px-4 py-3 text-right font-bold">Margem (%)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {profitReportData.productsAggList.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="px-6 py-10 text-center text-slate-400 text-xs">
                          Nenhuma venda ou romaneio encontrado para os filtros selecionados.
                        </td>
                      </tr>
                    ) : (
                      profitReportData.productsAggList.map((p) => (
                        <tr key={p.productId} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-mono font-bold text-blue-700">{p.productCode}</td>
                          <td className="px-4 py-3 font-semibold text-slate-900">{p.productName}</td>
                          <td className="px-4 py-3 text-right font-medium text-slate-900">{p.quantityBoxes} cx</td>
                          <td className="px-4 py-3 text-right font-bold text-slate-700">{p.weightKg.toFixed(1)} kg</td>
                          <td className="px-4 py-3 text-right font-mono text-amber-900 font-bold bg-amber-50/20 text-xs">
                            {p.unitCostPrice > 0 ? (
                              <span>
                                {formatBRL(p.unitCostPrice)}
                                <span className="text-[10px] text-slate-500 font-normal ml-0.5">
                                  {p.costPriceType === 'POR_KG' ? '/kg' : '/cx'}
                                </span>
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">Não inf.</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-slate-800 font-bold text-xs">
                            {p.unitSalePrice > 0 ? (
                              <span>
                                {formatBRL(p.unitSalePrice)}
                                <span className="text-[10px] text-slate-500 font-normal ml-0.5">
                                  {p.salePriceType === 'POR_KG' ? '/kg' : '/cx'}
                                </span>
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-amber-950 bg-amber-50/20 text-xs">
                            {formatBRL(p.totalCost)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 text-xs">
                            {formatBRL(p.totalRevenue)}
                          </td>
                          <td className={`px-4 py-3 text-right font-mono font-black text-xs bg-emerald-50/30 ${
                            p.profit >= 0 ? 'text-emerald-700' : 'text-rose-700'
                          }`}>
                            {formatBRL(p.profit)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className={`inline-flex px-2 py-0.5 rounded text-xs font-bold font-mono ${
                              p.marginPercent >= 20 ? 'bg-emerald-100 text-emerald-800' : p.marginPercent >= 0 ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
                            }`}>
                              {p.marginPercent.toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {profitReportData.productsAggList.length > 0 && (
                    <tfoot className="bg-slate-100 font-bold text-xs text-slate-800 border-t-2 border-slate-200">
                      <tr>
                        <td colSpan={2} className="px-4 py-3 uppercase">Total Geral:</td>
                        <td className="px-4 py-3 text-right font-mono">{profitReportData.totalSoldBoxes} cx</td>
                        <td className="px-4 py-3 text-right font-mono">{profitReportData.totalSoldKg.toFixed(1)} kg</td>
                        <td className="px-4 py-3 text-right bg-amber-50/60">—</td>
                        <td className="px-4 py-3 text-right">—</td>
                        <td className="px-4 py-3 text-right font-mono bg-amber-50/60 text-amber-950 font-black">
                          {formatBRL(profitReportData.totalCostSold)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-900 font-black">
                          {formatBRL(profitReportData.totalRevenue)}
                        </td>
                        <td className={`px-4 py-3 text-right font-mono font-black text-sm bg-emerald-50/60 ${
                          profitReportData.totalProfit >= 0 ? 'text-emerald-800' : 'text-rose-800'
                        }`}>
                          {formatBRL(profitReportData.totalProfit)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-black">
                          {profitReportData.overallMargin.toFixed(1)}%
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}

          {/* Profit Table - Mode 2: By Operation / Delivery */}
          {profitViewMode === 'by_operation' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                    Apuração Detalhada de Lucro por Operação de Romaneio
                  </h3>
                  <p className="text-xs text-slate-500">
                    Cada produto despachado em romaneio comparando custo interno de compra versus preço praticado para a loja.
                  </p>
                </div>
                <span className="text-xs text-slate-500">
                  Total: <strong>{profitReportData.operations.length}</strong> item(ns)
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-600">
                  <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-700 border-b border-slate-200 tracking-wider">
                    <tr>
                      <th className="px-3 py-3">Data</th>
                      <th className="px-3 py-3">Romaneio</th>
                      <th className="px-3 py-3">Loja / Destino</th>
                      <th className="px-3 py-3">Produto</th>
                      <th className="px-3 py-3 text-right">Qtd</th>
                      <th className="px-3 py-3 text-right">Peso (kg)</th>
                      <th className="px-3 py-3 text-right bg-amber-50/60 text-amber-950">
                        Custo Unit.
                        <span className="block text-[8px] text-amber-700 font-normal">🔒 Interno</span>
                      </th>
                      <th className="px-3 py-3 text-right">Preço Venda</th>
                      <th className="px-3 py-3 text-right bg-amber-50/60 text-amber-950">Custo Total</th>
                      <th className="px-3 py-3 text-right">Receita Total</th>
                      <th className="px-3 py-3 text-right bg-emerald-50/60 text-emerald-950 font-bold">Lucro</th>
                      <th className="px-3 py-3 text-right font-bold">Margem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {profitReportData.operations.length === 0 ? (
                      <tr>
                        <td colSpan={12} className="px-6 py-10 text-center text-slate-400">
                          Nenhum registro de romaneio encontrado com os filtros atuais.
                        </td>
                      </tr>
                    ) : (
                      profitReportData.operations.map((op) => (
                        <tr key={op.id} className="hover:bg-slate-50">
                          <td className="px-3 py-2.5 text-slate-600">{op.date}</td>
                          <td className="px-3 py-2.5 font-mono font-bold text-blue-700">{op.romaneioNumber}</td>
                          <td className="px-3 py-2.5 font-medium text-slate-900 truncate max-w-[140px]">{op.storeName}</td>
                          <td className="px-3 py-2.5 font-semibold text-slate-800">
                            {op.productCode} - {op.productName}
                          </td>
                          <td className="px-3 py-2.5 text-right font-bold text-slate-900">{op.quantityBoxes} cx</td>
                          <td className="px-3 py-2.5 text-right font-bold text-slate-700">{op.weightKg.toFixed(1)}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-amber-900 font-bold bg-amber-50/20">
                            {op.unitCostPrice > 0 ? `${formatBRL(op.unitCostPrice)}${op.costPriceType === 'POR_KG' ? '/kg' : '/cx'}` : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-slate-900 font-bold">
                            {op.unitSalePrice > 0 ? `${formatBRL(op.unitSalePrice)}${op.salePriceType === 'POR_KG' ? '/kg' : '/cx'}` : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-amber-950 bg-amber-50/20 font-bold">
                            {formatBRL(op.totalCost)}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-slate-900 font-bold">
                            {formatBRL(op.totalRevenue)}
                          </td>
                          <td className={`px-3 py-2.5 text-right font-mono font-black bg-emerald-50/30 ${
                            op.profit >= 0 ? 'text-emerald-700' : 'text-rose-700'
                          }`}>
                            {formatBRL(op.profit)}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-bold">
                            <span className={`px-1.5 py-0.5 rounded text-[11px] ${
                              op.marginPercent >= 20 ? 'bg-emerald-100 text-emerald-800' : op.marginPercent >= 0 ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
                            }`}>
                              {op.marginPercent.toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {profitReportData.operations.length > 0 && (
                    <tfoot className="bg-slate-100 font-bold text-xs text-slate-800 border-t-2 border-slate-200">
                      <tr>
                        <td colSpan={4} className="px-3 py-3 uppercase">Total das Operações:</td>
                        <td className="px-3 py-3 text-right font-mono">{profitReportData.totalSoldBoxes} cx</td>
                        <td className="px-3 py-3 text-right font-mono">{profitReportData.totalSoldKg.toFixed(1)}</td>
                        <td className="px-3 py-3 text-right bg-amber-50/60">—</td>
                        <td className="px-3 py-3 text-right">—</td>
                        <td className="px-3 py-3 text-right font-mono bg-amber-50/60 text-amber-950 font-black">
                          {formatBRL(profitReportData.totalCostSold)}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-slate-900 font-black">
                          {formatBRL(profitReportData.totalRevenue)}
                        </td>
                        <td className={`px-3 py-3 text-right font-mono font-black text-sm bg-emerald-50/60 ${
                          profitReportData.totalProfit >= 0 ? 'text-emerald-800' : 'text-rose-800'
                        }`}>
                          {formatBRL(profitReportData.totalProfit)}
                        </td>
                        <td className="px-3 py-3 text-right font-mono font-black">
                          {profitReportData.overallMargin.toFixed(1)}%
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 1. MONTHLY REPORT CONTENT */}
      {activeReportTab === 'monthly' && (
        <div className="space-y-6">
          <div className="bg-white p-4 rounded-b-xl border border-slate-200 shadow-xs flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-700 uppercase">Selecione o Mês:</span>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <span className="text-xs text-slate-500">
              Total de movimentações: <strong>{monthlyData.totalOperations}</strong>
            </span>
          </div>

          {/* Monthly KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs border-l-4 border-l-emerald-600">
              <span className="text-xs font-bold text-slate-500 uppercase block">Total de Entradas no Mês</span>
              <div className="mt-2 text-2xl font-black text-slate-900 font-mono">
                {monthlyData.entriesBoxes} cx
              </div>
              <div className="text-sm font-bold text-emerald-700 font-mono mt-0.5">
                {monthlyData.entriesKg.toLocaleString('pt-BR', { minimumFractionDigits: 1 })} kg
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs border-l-4 border-l-blue-600">
              <span className="text-xs font-bold text-slate-500 uppercase block">Total de Saídas no Mês</span>
              <div className="mt-2 text-2xl font-black text-slate-900 font-mono">
                {monthlyData.exitsBoxes} cx
              </div>
              <div className="text-sm font-bold text-blue-700 font-mono mt-0.5">
                {monthlyData.exitsKg.toLocaleString('pt-BR', { minimumFractionDigits: 1 })} kg
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs border-l-4 border-l-slate-800">
              <span className="text-xs font-bold text-slate-500 uppercase block">Saldo Operacional do Mês</span>
              <div className="mt-2 text-2xl font-black text-slate-900 font-mono">
                {monthlyData.balanceBoxes >= 0 ? `+${monthlyData.balanceBoxes}` : monthlyData.balanceBoxes} cx
              </div>
              <div className="text-sm font-bold text-slate-700 font-mono mt-0.5">
                {monthlyData.balanceKg >= 0 ? `+${monthlyData.balanceKg.toFixed(1)}` : monthlyData.balanceKg.toFixed(1)} kg
              </div>
            </div>
          </div>

          {/* Products moved in the month */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 font-bold text-xs uppercase text-slate-700">
              Produtos Movimentados no Mês Selecionado
            </div>
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/50 text-xs text-slate-500 uppercase border-b">
                <tr>
                  <th className="p-3">Código</th>
                  <th className="p-3">Produto</th>
                  <th className="p-3 text-right">Entradas (cx)</th>
                  <th className="p-3 text-right">Entradas (kg)</th>
                  <th className="p-3 text-right">Saídas (cx)</th>
                  <th className="p-3 text-right">Saídas (kg)</th>
                  <th className="p-3 text-right">Saldo do Mês (cx)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {monthlyData.productsList.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400 text-xs">
                      Nenhum produto movimentado neste mês.
                    </td>
                  </tr>
                ) : (
                  monthlyData.productsList.map((p, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="p-3 font-mono font-bold text-blue-700">{p.code}</td>
                      <td className="p-3 font-semibold text-slate-900">{p.name}</td>
                      <td className="p-3 text-right text-emerald-700 font-semibold">{p.entriesBoxes} cx</td>
                      <td className="p-3 text-right text-emerald-700">{p.entriesKg.toFixed(1)} kg</td>
                      <td className="p-3 text-right text-blue-700 font-semibold">{p.exitsBoxes} cx</td>
                      <td className="p-3 text-right text-blue-700">{p.exitsKg.toFixed(1)} kg</td>
                      <td className="p-3 text-right font-black text-slate-900">{p.entriesBoxes - p.exitsBoxes} cx</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 2. USER REPORT CONTENT */}
      {activeReportTab === 'by_user' && (
        <div className="space-y-6">
          <div className="bg-white p-4 rounded-b-xl border border-slate-200 shadow-xs grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Selecionar Usuário</label>
              <select
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm font-semibold bg-white"
              >
                {availableUsers.map(u => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Data Inicial</label>
              <input
                type="date"
                value={userStartDate}
                onChange={(e) => setUserStartDate(e.target.value)}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Data Final</label>
              <input
                type="date"
                value={userEndDate}
                onChange={(e) => setUserEndDate(e.target.value)}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm"
              />
            </div>
          </div>

          {userReportData && (
            <div className="space-y-6">
              {/* Operations KPI */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-xs font-bold text-slate-500 uppercase">Total de Operações Lançadas</span>
                  <div className="mt-2 text-2xl font-black text-slate-900 font-mono">
                    {userReportData.totalOps} operações
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {userReportData.userInvoices.length} Notas Fiscais + {userReportData.userShipments.length} Romaneios
                  </p>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-xs font-bold text-slate-500 uppercase">Entradas Recebidas pelo Usuário</span>
                  <div className="mt-2 text-xl font-bold text-emerald-800 font-mono">
                    {userReportData.totalEntriesBoxes} cx ({userReportData.totalEntriesKg.toFixed(1)} kg)
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-xs font-bold text-slate-500 uppercase">Saídas Expedidas pelo Usuário</span>
                  <div className="mt-2 text-xl font-bold text-blue-800 font-mono">
                    {userReportData.totalExitsBoxes} cx ({userReportData.totalExitsKg.toFixed(1)} kg)
                  </div>
                </div>
              </div>

              {/* Lists of Invoices and Romaneios by this user */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Notas Lançadas */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 font-bold text-xs uppercase text-slate-800 flex justify-between">
                    <span>Notas Fiscais Registradas ({userReportData.userInvoices.length})</span>
                  </div>
                  <div className="p-4 divide-y divide-slate-100 max-h-72 overflow-y-auto text-xs">
                    {userReportData.userInvoices.length === 0 ? (
                      <p className="text-slate-400 py-4 text-center">Nenhuma nota lançada por este usuário no período.</p>
                    ) : (
                      userReportData.userInvoices.map(inv => (
                        <div key={inv.id} className="py-2.5 flex justify-between items-center">
                          <div>
                            <span className="font-mono font-bold text-blue-700 text-sm">NF {inv.invoiceNumber}</span>
                            <span className="text-slate-500 block">{inv.supplierName} • {inv.date}</span>
                          </div>
                          <div className="text-right">
                            <span className="font-bold text-slate-800">{inv.totalBoxes} cx</span>
                            <span className="text-slate-500 block">{inv.totalWeightKg.toFixed(1)} kg</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Romaneios Lançados */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 font-bold text-xs uppercase text-slate-800 flex justify-between">
                    <span>Romaneios Registrados ({userReportData.userShipments.length})</span>
                  </div>
                  <div className="p-4 divide-y divide-slate-100 max-h-72 overflow-y-auto text-xs">
                    {userReportData.userShipments.length === 0 ? (
                      <p className="text-slate-400 py-4 text-center">Nenhum romaneio lançado por este usuário no período.</p>
                    ) : (
                      userReportData.userShipments.map(ship => (
                        <div key={ship.id} className="py-2.5 flex justify-between items-center">
                          <div>
                            <span className="font-mono font-bold text-blue-700 text-sm">Romaneio Nº {ship.romaneioNumber}</span>
                            <span className="text-slate-500 block">{ship.destinations?.length} loja(s) • {ship.date}</span>
                          </div>
                          <div className="text-right">
                            <span className="font-bold text-slate-800">{ship.totalBoxes} cx</span>
                            <span className="text-slate-500 block">{ship.totalWeightKg.toFixed(1)} kg</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. PRODUCT REPORT CONTENT */}
      {activeReportTab === 'by_product' && (
        <div className="space-y-6">
          <div className="bg-white p-4 rounded-b-xl border border-slate-200 shadow-xs grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Selecionar Produto</label>
              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm font-semibold bg-white"
              >
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.code} - {p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Data Inicial</label>
              <input
                type="date"
                value={prodStartDate}
                onChange={(e) => setProdStartDate(e.target.value)}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Data Final</label>
              <input
                type="date"
                value={prodEndDate}
                onChange={(e) => setProdEndDate(e.target.value)}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm"
              />
            </div>
          </div>

          {productReportData && (
            <div className="space-y-6">
              {/* Product Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-xs font-bold text-slate-500 uppercase">Produto Selecionado</span>
                  <div className="mt-1 font-mono font-bold text-blue-700 text-lg">{productReportData.product.code}</div>
                  <div className="font-bold text-slate-900">{productReportData.product.name}</div>
                  <span className="text-[11px] text-slate-400">{productReportData.product.unit} (~{productReportData.product.defaultWeightKg} kg)</span>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-xs font-bold text-slate-500 uppercase">Total de Entradas</span>
                  <div className="mt-1 text-2xl font-black text-emerald-800 font-mono">{productReportData.totalEntriesBoxes} cx</div>
                  <div className="text-xs font-bold text-emerald-700 font-mono">{productReportData.totalEntriesKg.toFixed(1)} kg</div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-xs font-bold text-slate-500 uppercase">Total de Saídas</span>
                  <div className="mt-1 text-2xl font-black text-blue-800 font-mono">{productReportData.totalExitsBoxes} cx</div>
                  <div className="text-xs font-bold text-blue-700 font-mono">{productReportData.totalExitsKg.toFixed(1)} kg</div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-xs font-bold text-slate-500 uppercase">Saldo no Período</span>
                  <div className="mt-1 text-2xl font-black text-slate-900 font-mono">{productReportData.balanceBoxes} cx</div>
                  <div className="text-xs font-bold text-slate-700 font-mono">{productReportData.balanceKg.toFixed(1)} kg</div>
                </div>
              </div>

              {/* Product movements table */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 font-bold text-xs uppercase text-slate-700">
                  Movimentações do Produto ({productReportData.movements.length})
                </div>
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50/50 text-xs text-slate-500 uppercase border-b">
                    <tr>
                      <th className="p-3">Tipo</th>
                      <th className="p-3">Documento</th>
                      <th className="p-3">Data</th>
                      <th className="p-3 text-right">Caixas</th>
                      <th className="p-3 text-right">Peso (kg)</th>
                      <th className="p-3">Fornecedor / Loja</th>
                      <th className="p-3">Usuário</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-xs">
                    {productReportData.movements.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-slate-400">
                          Nenhuma movimentação registrada para este produto no período.
                        </td>
                      </tr>
                    ) : (
                      productReportData.movements.map(m => (
                        <tr key={m.id} className="hover:bg-slate-50">
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${m.type === 'ENTRADA' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}`}>
                              {m.type}
                            </span>
                          </td>
                          <td className="p-3 font-mono font-bold text-slate-900">{m.documentNumber}</td>
                          <td className="p-3 text-slate-600">{m.createdAtIso ? m.createdAtIso.split('T')[0] : '—'}</td>
                          <td className="p-3 text-right font-bold text-slate-900">{m.boxes} cx</td>
                          <td className="p-3 text-right font-bold text-slate-900">{m.weightKg.toFixed(1)} kg</td>
                          <td className="p-3 text-slate-600">{m.supplierName || m.storeName || '—'}</td>
                          <td className="p-3 text-slate-600">{m.userName}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. STORE REPORT CONTENT */}
      {activeReportTab === 'by_store' && (
        <div className="space-y-6">
          <div className="bg-white p-4 rounded-b-xl border border-slate-200 shadow-xs grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Filtrar Loja</label>
              <select
                value={selectedStoreId}
                onChange={(e) => setSelectedStoreId(e.target.value)}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm font-semibold bg-white"
              >
                <option value="">Todas as Lojas</option>
                {stores.map(st => (
                  <option key={st.id} value={st.name}>{st.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Data Inicial</label>
              <input
                type="date"
                value={storeStartDate}
                onChange={(e) => setStoreStartDate(e.target.value)}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Data Final</label>
              <input
                type="date"
                value={storeEndDate}
                onChange={(e) => setStoreEndDate(e.target.value)}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {storeReportData.length === 0 ? (
              <div className="col-span-2 bg-white p-12 text-center rounded-xl border border-slate-200 text-slate-400">
                Nenhum romaneio expedido para lojas no período selecionado.
              </div>
            ) : (
              storeReportData.map((st, idx) => (
                <div key={idx} className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                  <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                    <div>
                      <h3 className="font-bold text-base text-slate-900 uppercase flex items-center gap-2">
                        <StoreIcon className="w-4 h-4 text-emerald-600" />
                        {st.storeName}
                      </h3>
                      <span className="text-xs text-slate-500">{st.shipmentsCount} romaneio(s) entregue(s)</span>
                    </div>
                    <div className="text-right">
                      <div className="text-base font-black text-blue-700 font-mono">{st.totalBoxes} cx</div>
                      <div className="text-xs font-bold text-emerald-700 font-mono">{st.totalWeightKg.toFixed(1)} kg</div>
                    </div>
                  </div>

                  <div className="p-4">
                    <span className="text-xs font-bold text-slate-600 uppercase mb-2 block">
                      Detalhamento de Produtos Enviados:
                    </span>
                    <table className="w-full text-left text-xs">
                      <thead className="text-slate-400 border-b pb-1">
                        <tr>
                          <th className="py-1">Produto</th>
                          <th className="py-1 text-right">Caixas</th>
                          <th className="py-1 text-right">Peso (kg)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {Array.from(st.productsBreakdown.values()).map((p, pIdx) => (
                          <tr key={pIdx} className="hover:bg-slate-50">
                            <td className="py-1.5 font-semibold text-slate-800">{p.name}</td>
                            <td className="py-1.5 text-right font-medium text-slate-900">{p.boxes} cx</td>
                            <td className="py-1.5 text-right font-bold text-emerald-700">{p.weightKg.toFixed(1)} kg</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
