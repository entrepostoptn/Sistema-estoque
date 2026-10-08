import React, { useState } from 'react';
import { 
  ShieldAlert, 
  Trash2, 
  AlertTriangle, 
  RefreshCw, 
  Lock, 
  CheckCircle2, 
  FileText, 
  Store as StoreIcon, 
  Package, 
  Truck, 
  History, 
  PieChart, 
  Sliders, 
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Building2,
  Info
} from 'lucide-react';
import { UserAccount } from '../types';
import { isAdminGeral } from '../services/authPermissions';
import { 
  clearMovements, 
  clearInvoices, 
  clearShipments, 
  clearStockAndMovements, 
  clearOperationalHistory, 
  clearBalanceData, 
  clearAllOperationalData 
} from '../services/maintenanceService';

interface MaintenanceViewProps {
  currentUser: UserAccount | null;
  onNavigateToAudit?: () => void;
}

type CleanupTarget = 
  | 'movements'
  | 'invoices'
  | 'shipments'
  | 'stock'
  | 'history'
  | 'balance'
  | 'all';

interface CleanupModalConfig {
  target: CleanupTarget;
  title: string;
  description: string;
  affectedData: string;
  isDangerousAll?: boolean;
}

export const MaintenanceView: React.FC<MaintenanceViewProps> = ({ 
  currentUser, 
  onNavigateToAudit 
}) => {
  const isUserAdmin = isAdminGeral(currentUser);

  const [activeModal, setActiveModal] = useState<CleanupModalConfig | null>(null);
  const [confirmStep, setConfirmStep] = useState<1 | 2>(1);
  const [typedConfirm, setTypedConfirm] = useState('');
  const [reasonInput, setReasonInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const openConfirmation = (config: CleanupModalConfig) => {
    setActiveModal(config);
    setConfirmStep(1);
    setTypedConfirm('');
    setReasonInput('');
    setStatusMessage(null);
  };

  const closeModal = () => {
    if (isProcessing) return;
    setActiveModal(null);
    setConfirmStep(1);
    setTypedConfirm('');
    setReasonInput('');
  };

  const handleExecuteCleanup = async () => {
    if (!activeModal) return;

    // For dangerous all, require step 2 and confirmation word
    if (activeModal.isDangerousAll && confirmStep === 1) {
      setConfirmStep(2);
      return;
    }

    if (activeModal.isDangerousAll && typedConfirm.trim().toUpperCase() !== 'ZERAR') {
      alert('Por favor, digite a palavra ZERAR para confirmar a exclusão dos dados operacionais.');
      return;
    }

    setIsProcessing(true);
    setStatusMessage(null);

    try {
      const reason = reasonInput.trim() || 'Manutenção e homologação de testes pelo Admin Geral';
      let message = '';

      switch (activeModal.target) {
        case 'movements': {
          const count = await clearMovements(currentUser, reason);
          message = `Sucesso: ${count} movimentações operacionais foram zeradas. Produtos, lojas e fornecedores preservados.`;
          break;
        }
        case 'invoices': {
          const count = await clearInvoices(currentUser, reason);
          message = `Sucesso: ${count} notas fiscais lançadas foram zeradas. Produtos, lojas e fornecedores preservados.`;
          break;
        }
        case 'shipments': {
          const count = await clearShipments(currentUser, reason);
          message = `Sucesso: ${count} romaneios foram zerados. Numeração de romaneio reiniciada para 1.`;
          break;
        }
        case 'stock': {
          const count = await clearStockAndMovements(currentUser, reason);
          message = `Sucesso: Saldos e movimentações de estoque foram zerados. Produtos preservados.`;
          break;
        }
        case 'history': {
          const count = await clearOperationalHistory(currentUser, reason);
          message = `Sucesso: Histórico operacional de testes foi zerado. Trilha de auditoria mantida intacta.`;
          break;
        }
        case 'balance': {
          await clearBalanceData(currentUser, reason);
          message = `Sucesso: Dados de balanço e balanceamento operacional foram zerados.`;
          break;
        }
        case 'all': {
          const result = await clearAllOperationalData(currentUser, reason);
          message = `Sucesso: Limpeza Geral concluída! ${result.totalRecords} registros operacionais eliminados (${result.movementsCount} mov., ${result.invoicesCount} NF, ${result.shipmentsCount} romaneios). Cadastros de Produtos, Lojas e Fornecedores permanecem 100% intactos!`;
          break;
        }
      }

      setStatusMessage({ type: 'success', text: message });
      closeModal();
    } catch (err: any) {
      console.error(err);
      setStatusMessage({ 
        type: 'error', 
        text: err.message || 'Erro ao executar operação de limpeza. Verifique suas permissões de ADMIN GERAL.' 
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Guard: Exclusive to ADMIN GERAL
  if (!isUserAdmin) {
    return (
      <div className="p-8 max-w-3xl mx-auto text-center space-y-6">
        <div className="w-20 h-20 bg-rose-950/60 border border-rose-700/60 rounded-3xl mx-auto flex items-center justify-center text-rose-400 shadow-xl shadow-rose-950/50">
          <Lock className="w-10 h-10" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-black text-white">Acesso Exclusivo: ADMIN GERAL</h2>
          <p className="text-sm text-slate-400 max-w-lg mx-auto">
            A área de <strong className="text-amber-400">Manutenção / Limpeza do Sistema</strong> é reservada exclusivamente para o usuário administrador com perfil <strong className="text-amber-400">ADMIN GERAL</strong>.
          </p>
        </div>
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl text-xs text-slate-300 max-w-md mx-auto flex items-center gap-3 text-left">
          <ShieldAlert className="w-6 h-6 text-amber-400 shrink-0" />
          <span>
            Usuário atual: <strong>{currentUser?.name || 'Desconhecido'}</strong> ({currentUser?.role || 'Operador'}). Para executar manutenções, faça login com a conta <strong>Admin Geral</strong>.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-12">
      
      {/* Top Header */}
      <div className="border-b border-slate-800 pb-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40">
                ADMIN GERAL
              </span>
              <span className="text-xs text-slate-500 font-mono">• Testes, Homologação e Manutenção</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-3">
              <ShieldAlert className="w-7 h-7 text-amber-400" />
              Manutenção / Limpeza do Sistema
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Gerencie a limpeza controlada de dados operacionais gerados durante testes. Todas as operações são auditadas e protegidas.
            </p>
          </div>

          {onNavigateToAudit && (
            <button
              type="button"
              onClick={onNavigateToAudit}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer self-start md:self-auto"
            >
              <History className="w-4 h-4 text-amber-400" />
              <span>Ver Histórico de Auditoria</span>
            </button>
          )}
        </div>
      </div>

      {/* Status notification banner */}
      {statusMessage && (
        <div className={`p-4 rounded-2xl border flex items-start gap-3 animate-in fade-in ${
          statusMessage.type === 'success' 
            ? 'bg-emerald-950/40 border-emerald-500/60 text-emerald-200' 
            : 'bg-rose-950/40 border-rose-500/60 text-rose-200'
        }`}>
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 text-xs">
            <span className="font-bold block mb-0.5">
              {statusMessage.type === 'success' ? 'Operação Concluída com Sucesso' : 'Falha na Operação'}
            </span>
            <p className="leading-relaxed">{statusMessage.text}</p>
          </div>
          <button 
            type="button" 
            onClick={() => setStatusMessage(null)}
            className="text-xs opacity-60 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}

      {/* Requirement 12: Cadastros que NUNCA podem ser zerados */}
      <div className="bg-slate-900/90 border-2 border-emerald-500/50 rounded-2xl p-5 shadow-lg relative overflow-hidden">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-black uppercase tracking-wider text-emerald-400">
                  Cadastros-Base Protegidos Permanentemente
                </h2>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-mono font-bold px-2 py-0.5 rounded-full">
                  Imutáveis contra Limpeza
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
                Conforme as regras de governança do sistema, os três cadastros abaixo <strong>NUNCA</strong> são afetados por nenhuma função de limpeza, teste ou reset. Eles são preservados intactos em 100% das operações.
              </p>
            </div>
          </div>
        </div>

        {/* The 3 master entities */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mt-4 pt-4 border-t border-slate-800">
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <Package className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-black text-white">PRODUTOS</div>
              <div className="text-[10px] text-emerald-400 font-medium">● 100% Preservados</div>
            </div>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <StoreIcon className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-black text-white">LOJAS</div>
              <div className="text-[10px] text-emerald-400 font-medium">● 100% Preservadas</div>
            </div>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-black text-white">FORNECEDORES</div>
              <div className="text-[10px] text-emerald-400 font-medium">● 100% Preservados</div>
            </div>
          </div>
        </div>
      </div>

      {/* Requirement 13: ZERAR DADOS OPERACIONAIS (Bulk Wipe) */}
      <div className="bg-linear-to-br from-rose-950/40 via-slate-900 to-rose-950/30 border-2 border-rose-600/60 rounded-3xl p-6 sm:p-7 shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/40">
                Limpeza Geral de Testes
              </span>
              <span className="text-[11px] text-slate-400 font-mono">Dupla Confirmação Exigida</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
              <AlertTriangle className="w-6 h-6 text-rose-400 shrink-0" />
              ⚠️ ZERAR DADOS OPERACIONAIS
            </h2>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              Limpa de uma só vez todas as <strong>movimentações, notas lançadas, romaneios, distribuições, saldos de estoque e balanços</strong> gerados durante os testes. Deixa o sistema pronto para novas rodadas de homologação.
            </p>
            <div className="text-[11px] text-emerald-300 font-semibold flex items-center gap-1.5 pt-1">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Produtos, Lojas e Fornecedores NUNCA são excluídos nesta operação.
            </div>
          </div>

          <button
            type="button"
            onClick={() => openConfirmation({
              target: 'all',
              title: '⚠️ ZERAR TODOS OS DADOS OPERACIONAIS',
              description: 'Esta operação irá excluir de forma definitiva todas as movimentações, notas fiscais, romaneios e saldos de estoque gerados durante os testes.',
              affectedData: 'Movimentações, Notas lançadas, Romaneios, Distribuições, Estoque operacional e Balanços',
              isDangerousAll: true
            })}
            className="px-6 py-4 bg-linear-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-black text-sm rounded-2xl shadow-xl shadow-rose-950/60 transition cursor-pointer flex items-center gap-2.5 shrink-0 self-stretch sm:self-auto justify-center"
          >
            <Trash2 className="w-5 h-5" />
            <span>ZERAR DADOS OPERACIONAIS</span>
          </button>
        </div>
      </div>

      {/* Requirement 11: Opções de Limpeza Separadas */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-black text-white tracking-tight">
            Opções Independentes de Limpeza
          </h2>
          <p className="text-xs text-slate-400">
            Execute limpezas pontuais em categorias operacionais específicas sem afetar as demais áreas
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          
          {/* 1. Zerar movimentações */}
          <div className="bg-slate-900/70 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 flex flex-col justify-between space-y-4 transition">
            <div className="space-y-2">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                <Sliders className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-white text-sm">
                1. Zerar Movimentações
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Remove/zera as movimentações operacionais de entrada e saída. Não exclui os produtos cadastrados.
              </p>
            </div>
            <button
              type="button"
              onClick={() => openConfirmation({
                target: 'movements',
                title: 'Zerar Movimentações de Entrada e Saída',
                description: 'Esta ação removerá todas as movimentações registradas no estoque pelos operadores.',
                affectedData: 'Histórico operacional de movimentações de entrada e saída'
              })}
              className="w-full py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-blue-300 border border-blue-900/60 hover:border-blue-500 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Zerar Movimentações</span>
            </button>
          </div>

          {/* 2. Zerar notas lançadas */}
          <div className="bg-slate-900/70 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 flex flex-col justify-between space-y-4 transition">
            <div className="space-y-2">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <FileText className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-white text-sm">
                2. Zerar Notas Lançadas
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Remove/zera as notas fiscais lançadas no sistema. Não exclui o cadastro de produtos, lojas ou fornecedores.
              </p>
            </div>
            <button
              type="button"
              onClick={() => openConfirmation({
                target: 'invoices',
                title: 'Zerar Notas Fiscais Lançadas',
                description: 'Esta ação excluirá todas as notas fiscais de entrada cadastradas no sistema.',
                affectedData: 'Todas as notas fiscais de entrada registradas'
              })}
              className="w-full py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-900/60 hover:border-emerald-500 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Zerar Notas Lançadas</span>
            </button>
          </div>

          {/* 3. Zerar romaneios */}
          <div className="bg-slate-900/70 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 flex flex-col justify-between space-y-4 transition">
            <div className="space-y-2">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                <Truck className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-white text-sm">
                3. Zerar Romaneios
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Remove/zera os romaneios de saída e suas distribuições. Reinicia a numeração sequencial para novos testes.
              </p>
            </div>
            <button
              type="button"
              onClick={() => openConfirmation({
                target: 'shipments',
                title: 'Zerar Romaneios e Distribuições',
                description: 'Esta ação excluirá todos os romaneios de saída e reiniciará a numeração para o Romaneio 1.',
                affectedData: 'Todos os romaneios de saída e suas distribuições por loja'
              })}
              className="w-full py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-purple-300 border border-purple-900/60 hover:border-purple-500 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Zerar Romaneios</span>
            </button>
          </div>

          {/* 4. Zerar estoque operacional */}
          <div className="bg-slate-900/70 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 flex flex-col justify-between space-y-4 transition">
            <div className="space-y-2">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <Package className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-white text-sm">
                4. Zerar Estoque / Movimentação
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Zera os saldos e movimentações de estoque gerados nos testes, retornando o saldo para zero. Produtos preservados.
              </p>
            </div>
            <button
              type="button"
              onClick={() => openConfirmation({
                target: 'stock',
                title: 'Zerar Saldos de Estoque Operacional',
                description: 'Esta ação retornará todo o saldo de caixas e peso (kg) no CD Central para zero.',
                affectedData: 'Saldos de estoque e movimentações operacionais'
              })}
              className="w-full py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-900/60 hover:border-amber-500 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Zerar Estoque</span>
            </button>
          </div>

          {/* 5. Zerar histórico operacional */}
          <div className="bg-slate-900/70 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 flex flex-col justify-between space-y-4 transition">
            <div className="space-y-2">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                <History className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-white text-sm">
                5. Zerar Histórico Operacional
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Limpa os registros da aba Histórico gerados durante os testes. A trilha de auditoria administrativa é preservada.
              </p>
            </div>
            <button
              type="button"
              onClick={() => openConfirmation({
                target: 'history',
                title: 'Zerar Histórico Operacional',
                description: 'Esta ação limpará o histórico de movimentações operacionais exibido na aba Histórico.',
                affectedData: 'Histórico operacional de movimentações de estoque'
              })}
              className="w-full py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-900/60 hover:border-cyan-500 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Zerar Histórico</span>
            </button>
          </div>

          {/* 6. Zerar balanço / balanceamento */}
          <div className="bg-slate-900/70 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 flex flex-col justify-between space-y-4 transition">
            <div className="space-y-2">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                <PieChart className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-white text-sm">
                6. Zerar Balanço / Balanceamento
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Zera os dados de balanço, saldos e resultados operacionais calculados pelo sistema.
              </p>
            </div>
            <button
              type="button"
              onClick={() => openConfirmation({
                target: 'balance',
                title: 'Zerar Dados de Balanço e Balanceamento',
                description: 'Esta ação recalculará e zerará os saldos operacionais consolidados no balancete.',
                affectedData: 'Cálculos de balancete e saldos de fechamento'
              })}
              className="w-full py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-indigo-900/60 hover:border-indigo-500 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Zerar Balanço</span>
            </button>
          </div>

        </div>
      </div>

      {/* Confirmation Modal */}
      {activeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs">
          <div className="bg-slate-900 border-2 border-slate-700 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95">
            
            {/* Modal Header */}
            <div className={`p-6 border-b ${
              activeModal.isDangerousAll 
                ? 'bg-rose-950/60 border-rose-800/80' 
                : 'bg-slate-850 border-slate-800'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                  activeModal.isDangerousAll ? 'bg-rose-600 text-white' : 'bg-amber-500/20 text-amber-400'
                }`}>
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-white">
                    {activeModal.title}
                  </h3>
                  <span className="text-xs text-slate-400 font-mono">
                    Confirmação de Segurança • Admin Geral
                  </span>
                </div>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              
              {/* Alert notice */}
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-2 text-xs text-slate-300">
                <div className="font-bold text-amber-400 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" />
                  ATENÇÃO
                </div>
                <p className="leading-relaxed">
                  {activeModal.description}
                </p>
                <div className="pt-2 border-t border-slate-850 text-slate-400">
                  <strong>Dados Afetados:</strong> {activeModal.affectedData}
                </div>
              </div>

              {/* Requirement 12 reminder in modal */}
              <div className="p-3 bg-emerald-950/30 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 flex items-center gap-2.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  <strong>Garantia de Segurança:</strong> Produtos, Lojas e Fornecedores serão <strong>preservados intactos</strong>.
                </span>
              </div>

              {/* Reason input for audit trail */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">
                  Motivo da Limpeza (Registrado na Auditoria):
                </label>
                <input
                  type="text"
                  value={reasonInput}
                  onChange={(e) => setReasonInput(e.target.value)}
                  placeholder="Ex: Homologação de testes / Início de nova bateria de testes"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 font-medium"
                />
              </div>

              {/* Requirement 14: Double confirmation for ZERAR DADOS OPERACIONAIS */}
              {activeModal.isDangerousAll && confirmStep === 2 && (
                <div className="p-4 bg-rose-950/60 border border-rose-500/60 rounded-2xl space-y-2 text-xs">
                  <label className="block font-bold text-rose-300 uppercase tracking-wider text-[11px]">
                    Segunda Confirmação Obrigatória:
                  </label>
                  <p className="text-slate-300 text-[11px]">
                    Para evitar acionamento acidental, digite a palavra <strong className="text-white font-mono bg-rose-900/60 px-1 rounded">ZERAR</strong> abaixo:
                  </p>
                  <input
                    type="text"
                    value={typedConfirm}
                    onChange={(e) => setTypedConfirm(e.target.value)}
                    placeholder="Digite ZERAR"
                    className="w-full px-3 py-2 bg-slate-950 border border-rose-500/60 rounded-xl text-sm font-mono font-bold text-white text-center uppercase tracking-widest focus:outline-none focus:border-rose-400"
                    autoFocus
                  />
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={closeModal}
                disabled={isProcessing}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition cursor-pointer"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={handleExecuteCleanup}
                disabled={isProcessing || (activeModal.isDangerousAll && confirmStep === 2 && typedConfirm.trim().toUpperCase() !== 'ZERAR')}
                className={`px-5 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-lg disabled:opacity-50 ${
                  activeModal.isDangerousAll
                    ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-950/50'
                    : 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-950/50'
                }`}
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Executando Limpeza...</span>
                  </>
                ) : activeModal.isDangerousAll && confirmStep === 1 ? (
                  <>
                    <span>Avançar para Confirmação</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Confirmar e Executar Limpeza</span>
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
