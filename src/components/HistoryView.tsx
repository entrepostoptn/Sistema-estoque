import React, { useState, useMemo } from 'react';
import { 
  History, 
  Search, 
  Filter, 
  ArrowDownToLine, 
  ArrowUpFromLine, 
  Calendar, 
  User, 
  Building2, 
  Store as StoreIcon, 
  FileText, 
  RotateCcw,
  Download
} from 'lucide-react';
import { StockMovement, Product, UserAccount } from '../types';

interface HistoryViewProps {
  movements: StockMovement[];
  products: Product[];
}

export const HistoryView: React.FC<HistoryViewProps> = ({ movements, products }) => {
  // Filters State per Requirement 8
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedType, setSelectedType] = useState<'ALL' | 'ENTRADA' | 'SAIDA'>('ALL');
  const [selectedProductCode, setSelectedProductCode] = useState('');
  const [selectedUser, setSelectedUser] = useState('');
  const [searchDocNumber, setSearchDocNumber] = useState('');
  const [searchPartner, setSearchPartner] = useState(''); // Fornecedor or Loja

  // Extract distinct users and partners for filter dropdowns
  const distinctUsers = useMemo(() => {
    const set = new Set<string>();
    movements.forEach(m => {
      if (m.userName) set.add(m.userName);
    });
    return Array.from(set);
  }, [movements]);

  // Quick preset period buttons
  const applyPresetPeriod = (preset: 'today' | 'week' | 'month' | 'all') => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    if (preset === 'today') {
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === 'week') {
      const pastWeek = new Date(today);
      pastWeek.setDate(today.getDate() - 7);
      setStartDate(pastWeek.toISOString().split('T')[0]);
      setEndDate(todayStr);
    } else if (preset === 'month') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      setStartDate(firstDay.toISOString().split('T')[0]);
      setEndDate(todayStr);
    } else {
      setStartDate('');
      setEndDate('');
    }
  };

  const handleResetFilters = () => {
    setStartDate('');
    setEndDate('');
    setSelectedType('ALL');
    setSelectedProductCode('');
    setSelectedUser('');
    setSearchDocNumber('');
    setSearchPartner('');
  };

  // Filtered movements
  const filteredMovements = useMemo(() => {
    return movements.filter((m) => {
      // Date filter
      const movDate = m.createdAtIso ? m.createdAtIso.split('T')[0] : '';
      if (startDate && movDate && movDate < startDate) return false;
      if (endDate && movDate && movDate > endDate) return false;

      // Type filter (Entrada / Saída)
      if (selectedType !== 'ALL' && m.type !== selectedType) return false;

      // Product code or name
      if (selectedProductCode && m.productCode !== selectedProductCode) return false;

      // User
      if (selectedUser && m.userName !== selectedUser) return false;

      // Document Number (NF or Romaneio)
      if (searchDocNumber.trim()) {
        const docMatch = m.documentNumber.toLowerCase().includes(searchDocNumber.toLowerCase().trim());
        if (!docMatch) return false;
      }

      // Partner (Supplier or Store)
      if (searchPartner.trim()) {
        const partner = (m.supplierName || m.storeName || '').toLowerCase();
        if (!partner.includes(searchPartner.toLowerCase().trim())) return false;
      }

      return true;
    });
  }, [movements, startDate, endDate, selectedType, selectedProductCode, selectedUser, searchDocNumber, searchPartner]);

  // Aggregate totals of filtered results
  const totalFilteredBoxes = filteredMovements
    .filter(m => m.status !== 'CANCELLED')
    .reduce((sum, m) => sum + (m.type === 'ENTRADA' ? m.boxes : -m.boxes), 0);
  const totalFilteredWeight = filteredMovements
    .filter(m => m.status !== 'CANCELLED')
    .reduce((sum, m) => sum + (m.type === 'ENTRADA' ? m.weightKg : -m.weightKg), 0);

  const handleExportCSV = () => {
    const headers = ['Tipo', 'Documento', 'Data_Hora', 'Codigo_Produto', 'Produto', 'Quantidade_Caixas', 'Peso_Kg', 'Fornecedor_Loja', 'Usuario_Responsavel', 'Status'];
    const rows = filteredMovements.map(m => [
      m.type,
      `"${m.documentNumber}"`,
      `"${m.createdAtIso || ''}"`,
      m.productCode,
      `"${m.productName}"`,
      m.boxes,
      m.weightKg.toFixed(2),
      `"${m.supplierName || m.storeName || ''}"`,
      `"${m.userName}"`,
      m.status
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `historico_movimentacoes_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <History className="w-6 h-6 text-blue-600" />
            Histórico Completo de Movimentações
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Auditoria detalhada com registro automático de usuário, data, hora, notas fiscais e romaneios.
          </p>
        </div>

        <button
          onClick={handleExportCSV}
          className="inline-flex items-center gap-1.5 px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-lg transition"
        >
          <Download className="w-4 h-4 text-slate-500" />
          Exportar Relatório CSV
        </button>
      </div>

      {/* Filter Panel matching Requirement 8 */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <Filter className="w-4 h-4 text-blue-600" />
            Filtros Avançados de Pesquisa
          </span>
          <div className="flex items-center gap-1 text-xs">
            <button
              onClick={() => applyPresetPeriod('today')}
              className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium"
            >
              Hoje
            </button>
            <button
              onClick={() => applyPresetPeriod('week')}
              className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium"
            >
              Últimos 7 dias
            </button>
            <button
              onClick={() => applyPresetPeriod('month')}
              className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium"
            >
              Este Mês
            </button>
            <button
              onClick={handleResetFilters}
              className="px-2.5 py-1 rounded bg-slate-100 hover:bg-rose-100 hover:text-rose-700 text-slate-700 font-medium flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" /> Limpar Filtros
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          {/* Start Date */}
          <div>
            <label className="block font-semibold text-slate-600 mb-1">Data Inicial</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* End Date */}
          <div>
            <label className="block font-semibold text-slate-600 mb-1">Data Final</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Type Filter */}
          <div>
            <label className="block font-semibold text-slate-600 mb-1">Tipo de Operação</label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as any)}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg outline-none focus:ring-1 focus:ring-blue-500 bg-white"
            >
              <option value="ALL">Todas as Operações</option>
              <option value="ENTRADA">Apenas Entradas (NF)</option>
              <option value="SAIDA">Apenas Saídas (Romaneios)</option>
            </select>
          </div>

          {/* Product Filter */}
          <div>
            <label className="block font-semibold text-slate-600 mb-1">Produto / Código</label>
            <select
              value={selectedProductCode}
              onChange={(e) => setSelectedProductCode(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg outline-none focus:ring-1 focus:ring-blue-500 bg-white"
            >
              <option value="">Todos os Produtos</option>
              {products.map(p => (
                <option key={p.id} value={p.code}>
                  {p.code} - {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* User Filter */}
          <div>
            <label className="block font-semibold text-slate-600 mb-1">Usuário Responsável</label>
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg outline-none focus:ring-1 focus:ring-blue-500 bg-white"
            >
              <option value="">Todos os Usuários</option>
              {distinctUsers.map(u => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>

          {/* Document Number Filter */}
          <div>
            <label className="block font-semibold text-slate-600 mb-1">Nº NF ou Romaneio</label>
            <input
              type="text"
              value={searchDocNumber}
              onChange={(e) => setSearchDocNumber(e.target.value)}
              placeholder="Ex: 1234 ou 000123"
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Partner Filter */}
          <div className="sm:col-span-2">
            <label className="block font-semibold text-slate-600 mb-1">Fornecedor ou Loja de Destino</label>
            <input
              type="text"
              value={searchPartner}
              onChange={(e) => setSearchPartner(e.target.value)}
              placeholder="Ex: Fornecedor ABC, Loja 01..."
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* History Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-700 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Documento</th>
                <th className="px-4 py-3">Data e Hora</th>
                <th className="px-4 py-3">Código</th>
                <th className="px-4 py-3">Produto</th>
                <th className="px-4 py-3 text-right">Qtd (Caixas)</th>
                <th className="px-4 py-3 text-right">Peso (kg)</th>
                <th className="px-4 py-3">Fornecedor / Loja</th>
                <th className="px-4 py-3">Usuário</th>
                <th className="px-4 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {filteredMovements.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-12 text-center text-slate-400">
                    Nenhuma movimentação atende aos filtros selecionados.
                  </td>
                </tr>
              ) : (
                filteredMovements.map((m) => {
                  const isEntry = m.type === 'ENTRADA';
                  const isCancelled = m.status === 'CANCELLED';

                  return (
                    <tr key={m.id} className={`hover:bg-slate-50/80 transition-colors ${isCancelled ? 'bg-slate-100/60 opacity-60' : ''}`}>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          isEntry ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                        }`}>
                          {isEntry ? <ArrowDownToLine className="w-3 h-3" /> : <ArrowUpFromLine className="w-3 h-3" />}
                          {m.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-slate-900">
                        {m.documentNumber}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                        {m.createdAtIso ? new Date(m.createdAtIso).toLocaleString('pt-BR') : '—'}
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-blue-700">
                        {m.productCode}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {m.productName}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900">
                        {isEntry ? `+${m.boxes}` : `-${m.boxes}`} cx
                      </td>
                      <td className="px-4 py-3 text-right font-black text-slate-900">
                        <span className={isEntry ? 'text-emerald-700' : 'text-blue-700'}>
                          {isEntry ? '+' : '-'}{m.weightKg.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-700">
                        {m.supplierName || m.storeName || '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-700 font-medium">
                        {m.userName}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                          isCancelled ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {isCancelled ? 'Cancelado' : 'Confirmado'}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-600 flex justify-between items-center">
          <span>Registros filtrados: <strong>{filteredMovements.length}</strong></span>
          <span className="text-[11px] text-slate-500">
            Histórico auditável imutável via Firestore
          </span>
        </div>
      </div>
    </div>
  );
};
