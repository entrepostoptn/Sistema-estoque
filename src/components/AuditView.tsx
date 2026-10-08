import React, { useState, useEffect, useMemo } from 'react';
import { 
  ShieldAlert, 
  Search, 
  Filter, 
  Calendar, 
  User as UserIcon, 
  FileText, 
  Trash2, 
  XCircle, 
  PlusCircle, 
  Edit3, 
  Sliders, 
  Download, 
  Printer, 
  RefreshCw, 
  Lock,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  History,
  Building2,
  Package
} from 'lucide-react';
import { AuditLogEntry, UserAccount } from '../types';
import { subscribeAuditLogs } from '../services/auditService';
import { isAdminGeral } from '../services/authPermissions';

interface AuditViewProps {
  currentUser: UserAccount | null;
}

export const AuditView: React.FC<AuditViewProps> = ({ currentUser }) => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState('ALL');
  const [selectedActionType, setSelectedActionType] = useState('ALL');
  const [selectedTargetType, setSelectedTargetType] = useState('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const isUserAdminGeral = isAdminGeral(currentUser);

  useEffect(() => {
    const unsubscribe = subscribeAuditLogs((fetchedLogs) => {
      setLogs(fetchedLogs);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Filtered logs
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // User filter
      if (selectedUser !== 'ALL') {
        const uName = (log.userName || '').toLowerCase();
        const uId = (log.userId || '').toLowerCase();
        const sel = selectedUser.toLowerCase();
        if (!uName.includes(sel) && !uId.includes(sel)) return false;
      }

      // Action type filter
      if (selectedActionType !== 'ALL') {
        if (selectedActionType === 'EXCLUSAO' && !log.action.startsWith('EXCLUSAO')) return false;
        if (selectedActionType === 'CANCELAMENTO' && !log.action.startsWith('CANCELAMENTO')) return false;
        if (selectedActionType === 'CRIACAO' && !log.action.startsWith('CRIACAO')) return false;
        if (selectedActionType === 'ALTERACAO' && !log.action.startsWith('ALTERACAO')) return false;
        if (selectedActionType === 'AJUSTE' && !log.action.startsWith('AJUSTE')) return false;
      }

      // Target type filter
      if (selectedTargetType !== 'ALL' && log.targetType !== selectedTargetType) {
        return false;
      }

      // Date range filter
      if (startDate && log.date < startDate) return false;
      if (endDate && log.date > endDate) return false;

      // Search term
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchTarget = (log.targetIdentifier || '').toLowerCase().includes(query);
        const matchReason = (log.reason || '').toLowerCase().includes(query);
        const matchUser = (log.userName || '').toLowerCase().includes(query);
        const matchAction = (log.actionLabel || '').toLowerCase().includes(query);
        const matchId = (log.targetId || '').toLowerCase().includes(query);
        if (!matchTarget && !matchReason && !matchUser && !matchAction && !matchId) {
          return false;
        }
      }

      return true;
    });
  }, [logs, selectedUser, selectedActionType, selectedTargetType, startDate, endDate, searchTerm]);

  // Statistics
  const stats = useMemo(() => {
    let exclusions = 0;
    let cancellations = 0;
    let creations = 0;
    let modifications = 0;

    for (const log of logs) {
      if (log.action.startsWith('EXCLUSAO')) exclusions++;
      else if (log.action.startsWith('CANCELAMENTO')) cancellations++;
      else if (log.action.startsWith('CRIACAO')) creations++;
      else modifications++;
    }

    return {
      total: logs.length,
      exclusions,
      cancellations,
      creations,
      modifications
    };
  }, [logs]);

  // Export to CSV
  const handleExportCSV = () => {
    if (filteredLogs.length === 0) {
      alert('Nenhum registro para exportar.');
      return;
    }

    const headers = ['Data', 'Horário', 'Usuário', 'Perfil', 'Ação', 'Tipo de Registro', 'Identificador / Item', 'Motivo / Justificativa'];
    const rows = filteredLogs.map((l) => [
      `"${l.date}"`,
      `"${l.time}"`,
      `"${l.userName.replace(/"/g, '""')}"`,
      `"${l.userRole.replace(/"/g, '""')}"`,
      `"${l.actionLabel.replace(/"/g, '""')}"`,
      `"${l.targetType}"`,
      `"${l.targetIdentifier.replace(/"/g, '""')}"`,
      `"${(l.reason || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `auditoria_sistema_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  const resetFilters = () => {
    setSearchTerm('');
    setSelectedUser('ALL');
    setSelectedActionType('ALL');
    setSelectedTargetType('ALL');
    setStartDate('');
    setEndDate('');
  };

  const getActionBadge = (action: string) => {
    if (action.startsWith('EXCLUSAO')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-black bg-rose-500/15 text-rose-400 border border-rose-500/30">
          <Trash2 className="w-3.5 h-3.5" />
          EXCLUSÃO DEFINITIVA
        </span>
      );
    }
    if (action.startsWith('CANCELAMENTO')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-black bg-amber-500/15 text-amber-300 border border-amber-500/30">
          <XCircle className="w-3.5 h-3.5" />
          CANCELAMENTO
        </span>
      );
    }
    if (action.startsWith('CRIACAO')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-black bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
          <PlusCircle className="w-3.5 h-3.5" />
          CRIAÇÃO
        </span>
      );
    }
    if (action.startsWith('AJUSTE')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-black bg-purple-500/15 text-purple-300 border border-purple-500/30">
          <Sliders className="w-3.5 h-3.5" />
          AJUSTE DE ESTOQUE
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-black bg-blue-500/15 text-blue-300 border border-blue-500/30">
        <Edit3 className="w-3.5 h-3.5" />
        ALTERAÇÃO
      </span>
    );
  };

  const getTargetIcon = (type: string) => {
    switch (type) {
      case 'NOTA':
        return <FileText className="w-4 h-4 text-emerald-400" />;
      case 'ROMANEIO':
        return <FileText className="w-4 h-4 text-blue-400" />;
      case 'PRODUTO':
        return <Package className="w-4 h-4 text-amber-400" />;
      case 'LOJA':
      case 'FORNECEDOR':
        return <Building2 className="w-4 h-4 text-purple-400" />;
      case 'ESTOQUE':
        return <Sliders className="w-4 h-4 text-cyan-400" />;
      default:
        return <History className="w-4 h-4 text-slate-400" />;
    }
  };

  // Guard for regular users attempting to enter directly
  if (!isUserAdminGeral) {
    return (
      <div className="p-8 max-w-3xl mx-auto text-center space-y-6">
        <div className="w-20 h-20 bg-rose-950/60 border border-rose-700/60 rounded-3xl mx-auto flex items-center justify-center text-rose-400 shadow-xl shadow-rose-950/50">
          <Lock className="w-10 h-10" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-black text-white">Acesso Restrito ao ADMIN GERAL</h2>
          <p className="text-sm text-slate-400 max-w-lg mx-auto">
            O Histórico de Auditoria é confidencial e protegido contra alterações. Apenas o usuário com perfil <strong className="text-amber-400">ADMIN GERAL</strong> tem autorização para consultar os registros de auditoria das ações críticas do sistema.
          </p>
        </div>
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl text-xs text-slate-300 max-w-md mx-auto flex items-center gap-3 text-left">
          <ShieldAlert className="w-6 h-6 text-amber-400 shrink-0" />
          <span>
            Usuário atual: <strong>{currentUser?.name || 'Desconhecido'}</strong> (Perfil: {currentUser?.role || 'Operador'}). Para acessar, faça login como <strong>Admin Geral</strong>.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 print:p-0">
      
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black tracking-tight text-white">
                  Histórico de Auditoria
                </h1>
                <span className="text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-full">
                  Exclusivo Admin Geral
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Rastreamento imutável de todas as ações administrativas, cancelamentos e exclusões definitivas
              </p>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 print:hidden">
          <button
            type="button"
            onClick={handleExportCSV}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer"
            title="Exportar para Excel / CSV"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            <span>Exportar CSV</span>
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer"
            title="Imprimir relatório"
          >
            <Printer className="w-4 h-4 text-blue-400" />
            <span>Imprimir</span>
          </button>
        </div>
      </div>

      {/* Security Rule Notice */}
      <div className="p-4 bg-slate-900/80 border border-amber-500/30 rounded-2xl flex items-start gap-3.5 text-xs text-slate-300 shadow-sm print:hidden">
        <Lock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="font-bold text-white flex items-center gap-2">
            Registro Imutável de Governança e Segurança
            <span className="text-[10px] font-mono bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-md">
              Proteção Ativa
            </span>
          </div>
          <p className="text-slate-400 text-[11px] leading-relaxed">
            Nenhum registro desta trilha de auditoria pode ser apagado ou alterado através da interface da aplicação, garantindo integridade jurídica e rastreabilidade total de exclusões definitivas de notas, romaneios, produtos e ajustes.
          </p>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 print:grid-cols-4">
        <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Total Auditado
          </div>
          <div className="text-2xl font-black text-white mt-1">
            {stats.total}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">Ações registradas</div>
        </div>

        <div className="bg-rose-950/20 border border-rose-900/40 p-4 rounded-2xl">
          <div className="text-[11px] font-semibold text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
            <Trash2 className="w-3.5 h-3.5" />
            Exclusões Definitivas
          </div>
          <div className="text-2xl font-black text-rose-300 mt-1">
            {stats.exclusions}
          </div>
          <div className="text-[10px] text-rose-400/70 mt-1">Exclusivo Admin Geral</div>
        </div>

        <div className="bg-amber-950/20 border border-amber-900/40 p-4 rounded-2xl">
          <div className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
            <XCircle className="w-3.5 h-3.5" />
            Cancelamentos
          </div>
          <div className="text-2xl font-black text-amber-300 mt-1">
            {stats.cancellations}
          </div>
          <div className="text-[10px] text-amber-400/70 mt-1">Estornos justificados</div>
        </div>

        <div className="bg-blue-950/20 border border-blue-900/40 p-4 rounded-2xl">
          <div className="text-[11px] font-semibold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
            <Edit3 className="w-3.5 h-3.5" />
            Alterações / Ajustes
          </div>
          <div className="text-2xl font-black text-blue-300 mt-1">
            {stats.modifications + stats.creations}
          </div>
          <div className="text-[10px] text-blue-400/70 mt-1">Cadastros e estoques</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl space-y-4 print:hidden">
        <div className="flex flex-col md:flex-row gap-3">
          
          {/* Search bar */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Pesquisar por nota, produto, romaneio, justificativa ou código..."
              className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
            />
          </div>

          {/* User Filter */}
          <div className="w-full md:w-44">
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500 transition cursor-pointer"
            >
              <option value="ALL">Todos os Usuários</option>
              <option value="Admin">Admin Geral</option>
              <option value="Paloma">Paloma</option>
              <option value="User">User</option>
            </select>
          </div>

          {/* Action Type Filter */}
          <div className="w-full md:w-44">
            <select
              value={selectedActionType}
              onChange={(e) => setSelectedActionType(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500 transition cursor-pointer"
            >
              <option value="ALL">Todas as Ações</option>
              <option value="EXCLUSAO">Exclusões Definitivas</option>
              <option value="CANCELAMENTO">Cancelamentos</option>
              <option value="CRIACAO">Criações</option>
              <option value="ALTERACAO">Alterações</option>
              <option value="AJUSTE">Ajustes de Estoque</option>
            </select>
          </div>

          {/* Target Type Filter */}
          <div className="w-full md:w-44">
            <select
              value={selectedTargetType}
              onChange={(e) => setSelectedTargetType(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500 transition cursor-pointer"
            >
              <option value="ALL">Todos os Registros</option>
              <option value="NOTA">Notas Fiscais</option>
              <option value="ROMANEIO">Romaneios</option>
              <option value="PRODUTO">Produtos</option>
              <option value="LOJA">Lojas</option>
              <option value="ESTOQUE">Estoque</option>
              <option value="CONFIGURACAO">Configurações</option>
            </select>
          </div>
        </div>

        {/* Date Filter & Reset */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/80 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span className="text-slate-400 text-xs">Período:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-2.5 py-1 bg-slate-950 border border-slate-800 rounded-lg text-white text-xs focus:outline-none focus:border-amber-500"
            />
            <span className="text-slate-500">até</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-2.5 py-1 bg-slate-950 border border-slate-800 rounded-lg text-white text-xs focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-400">
              Mostrando <strong>{filteredLogs.length}</strong> de <strong>{logs.length}</strong> registros
            </span>
            {(searchTerm || selectedUser !== 'ALL' || selectedActionType !== 'ALL' || selectedTargetType !== 'ALL' || startDate || endDate) && (
              <button
                type="button"
                onClick={resetFilters}
                className="text-amber-400 hover:text-amber-300 font-semibold underline text-xs cursor-pointer ml-2"
              >
                Limpar Filtros
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Logs Table / List */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {isLoading ? (
          <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-6 h-6 animate-spin text-amber-500" />
            <span className="text-sm">Carregando histórico de auditoria...</span>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <History className="w-10 h-10 text-slate-600 mx-auto" />
            <h3 className="text-base font-bold text-slate-300">Nenhum registro de auditoria encontrado</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Nenhuma ação corresponde aos filtros selecionados. Experimente limpar os filtros de busca.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {filteredLogs.map((log) => {
              const isExpanded = expandedLogId === log.id;
              return (
                <div 
                  key={log.id} 
                  className={`p-4 transition hover:bg-slate-850/50 ${
                    log.action.startsWith('EXCLUSAO') ? 'bg-rose-950/10' : ''
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    
                    {/* Left: Action, Target & Details */}
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                        {getTargetIcon(log.targetType)}
                      </div>
                      
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {getActionBadge(log.action)}
                          <span className="text-xs font-bold text-slate-400">
                            {log.actionLabel}
                          </span>
                          <span className="text-[11px] text-slate-500 font-mono">
                            [{log.targetType}]
                          </span>
                        </div>

                        <div className="text-sm font-black text-white">
                          {log.targetIdentifier}
                        </div>

                        {log.reason && (
                          <div className="text-xs text-slate-300 flex items-start gap-1.5 pt-0.5">
                            <span className="text-slate-400 font-bold">Motivo:</span>
                            <span className="italic text-slate-200">"{log.reason}"</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right: User & Timestamp */}
                    <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2 text-right shrink-0 border-t sm:border-t-0 border-slate-800/60 pt-2 sm:pt-0">
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <div className="text-xs font-bold text-white flex items-center gap-1.5 justify-end">
                            <UserIcon className="w-3.5 h-3.5 text-slate-400" />
                            {log.userName}
                          </div>
                          <div className="text-[10px] text-amber-400/90 font-mono font-semibold">
                            {log.userRole}
                          </div>
                        </div>
                      </div>

                      <div className="text-[11px] text-slate-400 font-mono">
                        {log.date} às {log.time}
                      </div>

                      {log.details && (
                        <button
                          type="button"
                          onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                          className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1 cursor-pointer font-medium"
                        >
                          <span>{isExpanded ? 'Ocultar Detalhes' : 'Ver Detalhes'}</span>
                          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                      )}
                    </div>

                  </div>

                  {/* Expanded JSON/Details view */}
                  {isExpanded && log.details && (
                    <div className="mt-3 pt-3 border-t border-slate-800">
                      <div className="text-[10px] font-mono text-slate-400 mb-1 font-semibold uppercase">
                        Metadados & Snapshot do Registro:
                      </div>
                      <pre className="p-3 bg-slate-950 border border-slate-850 rounded-xl text-[11px] font-mono text-slate-300 overflow-x-auto">
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                    </div>
                  )}

                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
};
