import React, { useMemo } from 'react';
import { 
  Package, 
  ArrowDownToLine, 
  ArrowUpFromLine, 
  FileText, 
  Scale, 
  Box, 
  TrendingUp, 
  History, 
  Plus, 
  ChevronRight, 
  AlertCircle, 
  CheckCircle2, 
  Store as StoreIcon,
  Calendar,
  CloudCheck,
  Barcode
} from 'lucide-react';
import { 
  Product, 
  ProductStockSummary, 
  Invoice, 
  Shipment, 
  StockMovement, 
  UserAccount 
} from '../types';
import { NavTab } from './Navbar';

interface DashboardViewProps {
  products: Product[];
  stockSummaries: ProductStockSummary[];
  invoices: Invoice[];
  shipments: Shipment[];
  movements: StockMovement[];
  currentUser: UserAccount | null;
  onNavigate: (tab: NavTab) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  products,
  stockSummaries,
  invoices,
  shipments,
  movements,
  currentUser,
  onNavigate
}) => {
  // Current month string (YYYY-MM)
  const currentMonthStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  const currentMonthLabel = useMemo(() => {
    const d = new Date();
    return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase();
  }, []);

  // Total Current Stock in Boxes and Weight
  const totalStockBoxes = useMemo(() => {
    return stockSummaries.reduce((sum, item) => sum + item.currentBoxes, 0);
  }, [stockSummaries]);

  const totalStockWeightKg = useMemo(() => {
    return stockSummaries.reduce((sum, item) => sum + item.currentWeightKg, 0);
  }, [stockSummaries]);

  // Entries of this month
  const currentMonthEntries = useMemo(() => {
    const monthInvoices = invoices.filter(i => {
      if (i.status === 'CANCELLED') return false;
      return i.date && i.date.startsWith(currentMonthStr);
    });

    const totalBoxes = monthInvoices.reduce((sum, i) => sum + i.totalBoxes, 0);
    const totalWeight = monthInvoices.reduce((sum, i) => sum + i.totalWeightKg, 0);

    return {
      count: monthInvoices.length,
      boxes: totalBoxes,
      weight: totalWeight
    };
  }, [invoices, currentMonthStr]);

  // Exits of this month
  const currentMonthExits = useMemo(() => {
    const monthShipments = shipments.filter(s => {
      if (s.status === 'CANCELLED') return false;
      return s.date && s.date.startsWith(currentMonthStr);
    });

    const totalBoxes = monthShipments.reduce((sum, s) => sum + s.totalBoxes, 0);
    const totalWeight = monthShipments.reduce((sum, s) => sum + s.totalWeightKg, 0);

    return {
      count: monthShipments.length,
      boxes: totalBoxes,
      weight: totalWeight
    };
  }, [shipments, currentMonthStr]);

  // Recent movements (last 6)
  const recentMovements = useMemo(() => {
    return movements.slice(0, 7);
  }, [movements]);

  // Items with low or zero stock
  const lowStockItems = useMemo(() => {
    return stockSummaries.filter(s => s.currentBoxes <= 5);
  }, [stockSummaries]);

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-blue-950 text-white p-6 sm:p-7 rounded-2xl shadow-md border border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-400 uppercase tracking-wider mb-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
            Sistema Operacional Ativo • {currentMonthLabel}
          </div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
            Painel Geral de Controle de Estoque
          </h1>
          <p className="text-sm text-slate-300 mt-1 max-w-xl">
            Bem-vindo, <strong className="text-white">{currentUser?.name}</strong>. Gestão centralizada de recebimento de cargas, expedição para lojas e romaneios em tempo real.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => onNavigate('nfe-entry')}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs rounded-xl shadow-md transition active:scale-98 cursor-pointer"
            title="Bipar chave de 44 dígitos da NF-e para entrada automática"
          >
            <Barcode className="w-4 h-4" />
            Entrada por NF-e (Leitor)
          </button>
          <button
            onClick={() => onNavigate('entries')}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl shadow-sm transition border border-slate-700 cursor-pointer"
          >
            <ArrowDownToLine className="w-4 h-4" />
            Entrada Manual (NF)
          </button>
          <button
            onClick={() => onNavigate('shipments')}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-sm transition cursor-pointer"
          >
            <ArrowUpFromLine className="w-4 h-4" />
            Novo Romaneio (Saída)
          </button>
        </div>
      </div>

      {/* Requirement 14 KPI Cards: Estoque Atual, Entradas do Mês, Saídas do Mês, Quantidade Romaneios, Quantidade Notas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        
        {/* 1. Estoque Atual */}
        <div 
          onClick={() => onNavigate('stock')}
          className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs hover:border-blue-400 hover:shadow-md transition cursor-pointer"
        >
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase">
            <span>Estoque Atual</span>
            <Box className="w-4 h-4 text-blue-600" />
          </div>
          <div className="mt-2 text-2xl font-black text-slate-900 font-mono">
            {totalStockBoxes} <span className="text-xs font-normal text-slate-500">cx</span>
          </div>
          <div className="text-xs font-bold text-emerald-700 font-mono mt-0.5">
            {totalStockWeightKg.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg
          </div>
          <div className="text-[11px] text-slate-400 mt-2 flex items-center justify-between pt-2 border-t border-slate-100">
            <span>{products.length} produtos cadastrados</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* 2. Entradas do Mês */}
        <div 
          onClick={() => onNavigate('entries')}
          className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs hover:border-emerald-400 hover:shadow-md transition cursor-pointer"
        >
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase">
            <span>Entradas do Mês</span>
            <ArrowDownToLine className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-black text-emerald-800 font-mono">
            {currentMonthEntries.boxes} <span className="text-xs font-normal text-slate-500">cx</span>
          </div>
          <div className="text-xs font-bold text-emerald-700 font-mono mt-0.5">
            {currentMonthEntries.weight.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg
          </div>
          <div className="text-[11px] text-slate-400 mt-2 flex items-center justify-between pt-2 border-t border-slate-100">
            <span>{currentMonthEntries.count} notas recebidas</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* 3. Saídas do Mês */}
        <div 
          onClick={() => onNavigate('shipments')}
          className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs hover:border-blue-400 hover:shadow-md transition cursor-pointer"
        >
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase">
            <span>Saídas do Mês</span>
            <ArrowUpFromLine className="w-4 h-4 text-blue-600" />
          </div>
          <div className="mt-2 text-2xl font-black text-blue-800 font-mono">
            {currentMonthExits.boxes} <span className="text-xs font-normal text-slate-500">cx</span>
          </div>
          <div className="text-xs font-bold text-blue-700 font-mono mt-0.5">
            {currentMonthExits.weight.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg
          </div>
          <div className="text-[11px] text-slate-400 mt-2 flex items-center justify-between pt-2 border-t border-slate-100">
            <span>{currentMonthExits.count} romaneios expedidos</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* 4. Quantidade de Romaneios */}
        <div 
          onClick={() => onNavigate('shipments')}
          className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs hover:border-slate-400 hover:shadow-md transition cursor-pointer"
        >
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase">
            <span>Qtd Romaneios</span>
            <FileText className="w-4 h-4 text-purple-600" />
          </div>
          <div className="mt-2 text-2xl font-black text-slate-900 font-mono">
            {shipments.length}
          </div>
          <div className="text-xs text-slate-500 font-medium mt-0.5">
            {shipments.filter(s => s.status === 'CONFIRMED').length} confirmados
          </div>
          <div className="text-[11px] text-slate-400 mt-2 flex items-center justify-between pt-2 border-t border-slate-100">
            <span>Multi-lojas ativas</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* 5. Quantidade de Notas Fiscais */}
        <div 
          onClick={() => onNavigate('entries')}
          className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs hover:border-slate-400 hover:shadow-md transition cursor-pointer"
        >
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase">
            <span>Qtd Notas Fiscais</span>
            <FileText className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-2 text-2xl font-black text-slate-900 font-mono">
            {invoices.length}
          </div>
          <div className="text-xs text-slate-500 font-medium mt-0.5">
            {invoices.filter(i => i.status === 'CONFIRMED').length} confirmadas
          </div>
          <div className="text-[11px] text-slate-400 mt-2 flex items-center justify-between pt-2 border-t border-slate-100">
            <span>Entrada de fornecedores</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </div>
        </div>

      </div>

      {/* Main Grid: Últimas Movimentações + Estoque Rápido / Balancete Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left: Últimas Movimentações (Requisito 14) */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-blue-600" />
              <h2 className="font-bold text-slate-900 text-sm sm:text-base">
                Últimas Movimentações Registradas
              </h2>
            </div>
            <button
              onClick={() => onNavigate('history')}
              className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1"
            >
              Ver Todas ({movements.length}) <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {recentMovements.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                Nenhuma movimentação realizada ainda. Use "Nova Entrada" ou "Novo Romaneio".
              </div>
            ) : (
              recentMovements.map((m) => {
                const isEntry = m.type === 'ENTRADA';
                return (
                  <div key={m.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 transition">
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg text-white font-bold text-xs shrink-0 ${
                        isEntry ? 'bg-emerald-600' : 'bg-blue-600'
                      }`}>
                        {isEntry ? <ArrowDownToLine className="w-4 h-4" /> : <ArrowUpFromLine className="w-4 h-4" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-900 text-sm">{m.documentNumber}</span>
                          <span className="text-xs bg-slate-100 font-semibold px-2 py-0.2 rounded text-slate-700">
                            {m.productCode} — {m.productName}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {m.supplierName || m.storeName || 'Estoque Central'} • Por: <strong className="text-slate-700">{m.userName}</strong>
                        </div>
                      </div>
                    </div>

                    <div className="text-right sm:shrink-0 pl-11 sm:pl-0">
                      <div className={`font-mono font-bold text-sm ${isEntry ? 'text-emerald-700' : 'text-blue-700'}`}>
                        {isEntry ? '+' : '-'}{m.boxes} cx
                      </div>
                      <div className="text-xs text-slate-500 font-medium">
                        {isEntry ? '+' : '-'}{m.weightKg.toFixed(1)} kg
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Quick Stock Status & Balancete Shortcut */}
        <div className="space-y-6">
          
          {/* Balancete Quick Summary */}
          <div className="bg-slate-900 text-white rounded-xl p-5 border border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">
                Resumo {currentMonthLabel}
              </span>
              <button
                onClick={() => onNavigate('balancete')}
                className="text-xs text-slate-300 hover:text-white underline"
              >
                Abrir Balancete
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Total Entradas:</span>
                <span className="font-bold text-emerald-400 text-sm font-mono">
                  {currentMonthEntries.boxes} cx ({currentMonthEntries.weight.toFixed(0)} kg)
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Total Saídas:</span>
                <span className="font-bold text-blue-400 text-sm font-mono">
                  {currentMonthExits.boxes} cx ({currentMonthExits.weight.toFixed(0)} kg)
                </span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-slate-800">
                <span className="text-slate-300 font-bold">Saldo do Mês:</span>
                <span className="font-black text-amber-400 text-base font-mono">
                  {currentMonthEntries.boxes - currentMonthExits.boxes} cx
                </span>
              </div>
            </div>
          </div>

          {/* Quick Products Stock Position */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                Estoque dos Principais Produtos
              </h3>
              <button
                onClick={() => onNavigate('stock')}
                className="text-xs text-blue-600 font-bold hover:underline"
              >
                Ver todos
              </button>
            </div>

            <div className="space-y-2.5">
              {stockSummaries.slice(0, 5).map((s) => (
                <div key={s.productId} className="flex justify-between items-center text-xs">
                  <div>
                    <span className="font-mono font-bold text-blue-700 mr-1.5">{s.productCode}</span>
                    <span className="font-medium text-slate-800">{s.productName}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-slate-900">{s.currentBoxes} cx</span>
                    <span className="text-slate-400 block text-[10px]">{s.currentWeightKg.toFixed(0)} kg</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
