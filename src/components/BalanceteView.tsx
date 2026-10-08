import React, { useState, useMemo } from 'react';
import { 
  PieChart, 
  Calendar, 
  ArrowDownToLine, 
  ArrowUpFromLine, 
  Scale, 
  Box, 
  TrendingUp, 
  Award, 
  Printer, 
  Download,
  Percent
} from 'lucide-react';
import { StockMovement, Product } from '../types';

interface BalanceteViewProps {
  movements: StockMovement[];
  products: Product[];
}

export const BalanceteView: React.FC<BalanceteViewProps> = ({ movements, products }) => {
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  // Parse Month Title (e.g. SETEMBRO/2026)
  const monthNameHeader = useMemo(() => {
    if (!selectedMonth) return '';
    const [year, month] = selectedMonth.split('-');
    const date = new Date(Number(year), Number(month) - 1, 1);
    return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase();
  }, [selectedMonth]);

  // Calculations for selected month
  const balancete = useMemo(() => {
    const monthMovements = movements.filter(m => {
      if (m.status === 'CANCELLED') return false;
      const mMonth = m.createdAtIso ? m.createdAtIso.substring(0, 7) : '';
      return mMonth === selectedMonth;
    });

    let totalEntriesBoxes = 0;
    let totalEntriesWeightKg = 0;
    let totalExitsBoxes = 0;
    let totalExitsWeightKg = 0;

    const productRankingMap = new Map<string, {
      code: string;
      name: string;
      unit: string;
      entriesBoxes: number;
      entriesWeightKg: number;
      exitsBoxes: number;
      exitsWeightKg: number;
      totalMovedBoxes: number;
      totalMovedWeightKg: number;
    }>();

    for (const mov of monthMovements) {
      if (!productRankingMap.has(mov.productId)) {
        productRankingMap.set(mov.productId, {
          code: mov.productCode,
          name: mov.productName,
          unit: mov.unit || 'CAIXA',
          entriesBoxes: 0,
          entriesWeightKg: 0,
          exitsBoxes: 0,
          exitsWeightKg: 0,
          totalMovedBoxes: 0,
          totalMovedWeightKg: 0
        });
      }

      const pStat = productRankingMap.get(mov.productId)!;

      if (mov.type === 'ENTRADA') {
        totalEntriesBoxes += mov.boxes;
        totalEntriesWeightKg += mov.weightKg;
        pStat.entriesBoxes += mov.boxes;
        pStat.entriesWeightKg += mov.weightKg;
      } else {
        totalExitsBoxes += mov.boxes;
        totalExitsWeightKg += mov.weightKg;
        pStat.exitsBoxes += mov.boxes;
        pStat.exitsWeightKg += mov.weightKg;
      }

      pStat.totalMovedBoxes += mov.boxes;
      pStat.totalMovedWeightKg += mov.weightKg;
    }

    // Top Products ranking sorted by volume of boxes moved
    const topProducts = Array.from(productRankingMap.values())
      .sort((a, b) => b.totalMovedBoxes - a.totalMovedBoxes);

    return {
      entriesBoxes: totalEntriesBoxes,
      entriesWeightKg: totalEntriesWeightKg,
      exitsBoxes: totalExitsBoxes,
      exitsWeightKg: totalExitsWeightKg,
      balanceBoxes: totalEntriesBoxes - totalExitsBoxes,
      balanceWeightKg: totalEntriesWeightKg - totalExitsWeightKg,
      topProducts,
      totalMovementsCount: monthMovements.length
    };
  }, [movements, selectedMonth]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <PieChart className="w-6 h-6 text-blue-600" />
            Balancete Geral Mensal
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Consolidação de entradas, saídas, saldo operacional e ranking de mercadorias mais movimentadas.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-300 px-3 py-1.5 rounded-lg">
            <Calendar className="w-4 h-4 text-slate-500" />
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent text-sm font-bold text-slate-800 outline-none cursor-pointer"
            />
          </div>
          <button
            onClick={() => window.print()}
            className="p-2 border border-slate-300 hover:bg-slate-50 rounded-lg text-slate-600"
            title="Imprimir Balancete"
          >
            <Printer className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Balancete Presentation matching Requirement 11 example */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 sm:p-8 shadow-xl border border-slate-800">
        <div className="border-b border-slate-800 pb-4 mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div>
            <span className="text-xs uppercase tracking-widest text-blue-400 font-bold">
              Painel Demonstrativo
            </span>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white uppercase mt-1">
              BALANCETE — {monthNameHeader}
            </h2>
          </div>
          <div className="text-right text-xs text-slate-400">
            {balancete.totalMovementsCount} operações registradas no período
          </div>
        </div>

        {/* 3 Large Pillars: ENTRADAS, SAÍDAS, SALDO */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* ENTRADAS */}
          <div className="bg-slate-800/80 rounded-xl p-5 border border-slate-700">
            <div className="flex items-center justify-between text-emerald-400 text-xs font-bold uppercase tracking-wider mb-2">
              <span className="flex items-center gap-1.5">
                <ArrowDownToLine className="w-4 h-4" /> ENTRADAS
              </span>
              <span className="text-[10px] bg-emerald-950/80 text-emerald-400 border border-emerald-800 px-2 py-0.5 rounded">
                Recebimento NF
              </span>
            </div>
            <div className="mt-3">
              <div className="text-3xl sm:text-4xl font-black text-white font-mono">
                {balancete.entriesBoxes.toLocaleString('pt-BR')} <span className="text-base font-normal text-slate-400">caixas</span>
              </div>
              <div className="text-xl sm:text-2xl font-bold text-emerald-400 font-mono mt-1">
                {balancete.entriesWeightKg.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} <span className="text-sm font-normal text-slate-400">kg</span>
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-4 pt-3 border-t border-slate-700/60">
              Total bruto de mercadoria descarregada no estoque central neste mês.
            </p>
          </div>

          {/* SAÍDAS */}
          <div className="bg-slate-800/80 rounded-xl p-5 border border-slate-700">
            <div className="flex items-center justify-between text-blue-400 text-xs font-bold uppercase tracking-wider mb-2">
              <span className="flex items-center gap-1.5">
                <ArrowUpFromLine className="w-4 h-4" /> SAÍDAS
              </span>
              <span className="text-[10px] bg-blue-950/80 text-blue-400 border border-blue-800 px-2 py-0.5 rounded">
                Expedição / Romaneio
              </span>
            </div>
            <div className="mt-3">
              <div className="text-3xl sm:text-4xl font-black text-white font-mono">
                {balancete.exitsBoxes.toLocaleString('pt-BR')} <span className="text-base font-normal text-slate-400">caixas</span>
              </div>
              <div className="text-xl sm:text-2xl font-bold text-blue-400 font-mono mt-1">
                {balancete.exitsWeightKg.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} <span className="text-sm font-normal text-slate-400">kg</span>
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-4 pt-3 border-t border-slate-700/60">
              Total expedido via romaneios para abastecimento das lojas de destino.
            </p>
          </div>

          {/* SALDO */}
          <div className={`rounded-xl p-5 border ${
            balancete.balanceBoxes >= 0 
              ? 'bg-slate-800/90 border-slate-600' 
              : 'bg-rose-950/40 border-rose-800'
          }`}>
            <div className="flex items-center justify-between text-slate-300 text-xs font-bold uppercase tracking-wider mb-2">
              <span className="flex items-center gap-1.5">
                <Scale className="w-4 h-4 text-amber-400" /> SALDO OPERACIONAL
              </span>
              <span className="text-[10px] bg-slate-700 text-slate-200 px-2 py-0.5 rounded">
                Entradas − Saídas
              </span>
            </div>
            <div className="mt-3">
              <div className={`text-3xl sm:text-4xl font-black font-mono ${
                balancete.balanceBoxes >= 0 ? 'text-white' : 'text-rose-400'
              }`}>
                {balancete.balanceBoxes >= 0 ? `+${balancete.balanceBoxes.toLocaleString('pt-BR')}` : balancete.balanceBoxes.toLocaleString('pt-BR')} <span className="text-base font-normal text-slate-400">caixas</span>
              </div>
              <div className="text-xl sm:text-2xl font-bold text-amber-400 font-mono mt-1">
                {balancete.balanceWeightKg >= 0 ? `+${balancete.balanceWeightKg.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}` : balancete.balanceWeightKg.toLocaleString('pt-BR', { minimumFractionDigits: 1 })} <span className="text-sm font-normal text-slate-400">kg</span>
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-4 pt-3 border-t border-slate-700/60">
              Variação líquida de estoque acumulada durante o mês de {monthNameHeader}.
            </p>
          </div>

        </div>
      </div>

      {/* Top Products Movement Ranking */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-amber-600" />
            <h3 className="font-bold text-slate-900 text-sm sm:text-base">
              Produtos com Maior Movimentação no Mês
            </h3>
          </div>
          <span className="text-xs text-slate-500">
            Classificado por volume de caixas movimentadas
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-700 border-b border-slate-200">
              <tr>
                <th className="px-5 py-3 w-16 text-center">Posição</th>
                <th className="px-5 py-3">Código</th>
                <th className="px-5 py-3">Produto</th>
                <th className="px-5 py-3 text-right text-emerald-800">Entradas (cx / kg)</th>
                <th className="px-5 py-3 text-right text-blue-800">Saídas (cx / kg)</th>
                <th className="px-5 py-3 text-right font-bold text-slate-900">Total Movimentado</th>
                <th className="px-5 py-3 text-right">Saldo do Mês</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {balancete.topProducts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-slate-400 text-xs">
                    Nenhum produto movimentado no mês de {monthNameHeader}.
                  </td>
                </tr>
              ) : (
                balancete.topProducts.map((p, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-5 py-3 text-center">
                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                        idx === 0 ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                        idx === 1 ? 'bg-slate-200 text-slate-800' :
                        idx === 2 ? 'bg-amber-50 text-amber-900' :
                        'text-slate-500'
                      }`}>
                        {idx + 1}º
                      </span>
                    </td>
                    <td className="px-5 py-3 font-mono font-bold text-blue-700">
                      {p.code}
                    </td>
                    <td className="px-5 py-3 font-bold text-slate-900">
                      {p.name}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className="font-semibold text-emerald-700">{p.entriesBoxes} cx</span>
                      <span className="text-[11px] text-slate-400 block">{p.entriesWeightKg.toFixed(1)} kg</span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className="font-semibold text-blue-700">{p.exitsBoxes} cx</span>
                      <span className="text-[11px] text-slate-400 block">{p.exitsWeightKg.toFixed(1)} kg</span>
                    </td>
                    <td className="px-5 py-3 text-right font-black font-mono text-base text-slate-900">
                      <div>{p.totalMovedBoxes} cx</div>
                      <div className="text-xs text-slate-500 font-normal">{p.totalMovedWeightKg.toFixed(1)} kg</div>
                    </td>
                    <td className="px-5 py-3 text-right font-bold">
                      <span className={p.entriesBoxes - p.exitsBoxes >= 0 ? 'text-slate-900' : 'text-rose-600'}>
                        {p.entriesBoxes - p.exitsBoxes >= 0 ? `+${p.entriesBoxes - p.exitsBoxes}` : p.entriesBoxes - p.exitsBoxes} cx
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
