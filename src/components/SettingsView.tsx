import React, { useState, useRef } from 'react';
import { 
  Settings, 
  Building2, 
  ShieldAlert, 
  Database, 
  Save, 
  Trash2, 
  Sparkles, 
  CheckCircle2, 
  AlertTriangle,
  RotateCcw,
  Users,
  LogOut,
  Download,
  Code2,
  HardDrive,
  Cloud,
  Server,
  Upload,
  FileJson,
  Terminal,
  Check,
  Globe,
  Sliders,
  Barcode
} from 'lucide-react';
import { SystemSettings, UserAccount } from '../types';
import { updateSystemSettings } from '../services/storeService';
import { seedSampleData, clearAllData } from '../services/seedService';
import { useAuth } from '../firebase/authContext';
import { 
  getStorageMode, 
  setStorageMode, 
  exportDatabaseBackup, 
  importDatabaseBackup, 
  StorageMode 
} from '../services/localStorageAdapter';
import { 
  getEffectiveFirebaseConfig, 
  saveCustomFirebaseConfig, 
  clearCustomFirebaseConfig 
} from '../firebase/config';

interface SettingsViewProps {
  settings: SystemSettings;
  currentUser: UserAccount | null;
  onRefreshData?: () => void;
  onOpenLoginScreen?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ 
  settings, 
  currentUser,
  onRefreshData,
  onOpenLoginScreen
}) => {
  const { logout } = useAuth();
  const [currentMode, setCurrentMode] = useState<StorageMode>(getStorageMode());

  // Company settings
  const [allowNegativeStock, setAllowNegativeStock] = useState(settings.allowNegativeStock);
  const [companyName, setCompanyName] = useState(settings.companyName || 'CENTRAL DE DISTRIBUIÇÃO E CARNES');
  const [companyCnpj, setCompanyCnpj] = useState(settings.companyCnpj || '00.000.000/0001-00');
  const [companyPhone, setCompanyPhone] = useState(settings.companyPhone || '(11) 3344-5566');
  const [companyAddress, setCompanyAddress] = useState(settings.companyAddress || 'Av. Logística, 1000 - Galpão 4 - Centro Logístico');

  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [clearing, setClearing] = useState(false);

  // Custom Firebase configuration modal/state
  const [showCustomFirebase, setShowCustomFirebase] = useState(false);
  const activeFbConfig = getEffectiveFirebaseConfig();
  const [customApiKey, setCustomApiKey] = useState(activeFbConfig.apiKey || '');
  const [customProjectId, setCustomProjectId] = useState(activeFbConfig.projectId || '');
  const [customAuthDomain, setCustomAuthDomain] = useState(activeFbConfig.authDomain || '');
  const [customDatabaseId, setCustomDatabaseId] = useState(activeFbConfig.firestoreDatabaseId || '');

  // NF-e External API configuration (Optional commercial gateway)
  const [nfeApiUrl, setNfeApiUrl] = useState(() => localStorage.getItem('ptn_nfe_api_url') || '');
  const [nfeApiToken, setNfeApiToken] = useState(() => localStorage.getItem('ptn_nfe_api_token') || '');
  const [savingNfeApi, setSavingNfeApi] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateSystemSettings({
        allowNegativeStock,
        companyName: companyName.trim(),
        companyCnpj: companyCnpj.trim(),
        companyPhone: companyPhone.trim(),
        companyAddress: companyAddress.trim()
      });
      setSuccessMsg('Configurações do sistema salvas com sucesso!');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      setErrorMsg('Erro ao salvar configurações.');
      setTimeout(() => setErrorMsg(null), 4000);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStorageMode = (newMode: StorageMode) => {
    if (newMode === currentMode) return;
    setStorageMode(newMode);
    setCurrentMode(newMode);
    setSuccessMsg(
      newMode === 'local' 
        ? 'Modo Local Autônomo Ativado! O sistema operará 100% offline no navegador, sem fazer requisições para o Google.' 
        : 'Modo Nuvem Firebase Ativado! O sistema sincronizará os dados com a nuvem.'
    );
    if (onRefreshData) onRefreshData();
    setTimeout(() => setSuccessMsg(null), 5000);
  };

  const handleExportBackup = () => {
    try {
      const { filename, json } = exportDatabaseBackup();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setSuccessMsg(`Backup exportado com sucesso: ${filename}`);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setErrorMsg(`Erro ao exportar backup: ${err.message}`);
      setTimeout(() => setErrorMsg(null), 4000);
    }
  };

  const handleTriggerImport = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content) return;

      const result = importDatabaseBackup(content);
      if (result.success) {
        setSuccessMsg(result.message);
        if (onRefreshData) onRefreshData();
      } else {
        setErrorMsg(result.message);
      }
      setTimeout(() => {
        setSuccessMsg(null);
        setErrorMsg(null);
      }, 5000);
    };
    reader.readAsText(file);
    // reset input
    e.target.value = '';
  };

  const handleSaveCustomFirebase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customProjectId.trim() || !customApiKey.trim()) {
      alert('Informe ao menos a API Key e o Project ID do seu projeto Firebase.');
      return;
    }
    saveCustomFirebaseConfig({
      apiKey: customApiKey.trim(),
      projectId: customProjectId.trim(),
      authDomain: customAuthDomain.trim() || `${customProjectId.trim()}.firebaseapp.com`,
      firestoreDatabaseId: customDatabaseId.trim()
    });
  };

  const handleSaveNfeApiConfig = (e: React.FormEvent) => {
    e.preventDefault();
    setSavingNfeApi(true);
    try {
      if (nfeApiUrl.trim()) {
        localStorage.setItem('ptn_nfe_api_url', nfeApiUrl.trim());
      } else {
        localStorage.removeItem('ptn_nfe_api_url');
      }

      if (nfeApiToken.trim()) {
        localStorage.setItem('ptn_nfe_api_token', nfeApiToken.trim());
      } else {
        localStorage.removeItem('ptn_nfe_api_token');
      }

      setSuccessMsg('Configurações de integração NF-e salvas com sucesso!');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setErrorMsg('Erro ao salvar configurações de NF-e.');
      setTimeout(() => setErrorMsg(null), 4000);
    } finally {
      setSavingNfeApi(false);
    }
  };

  const handleSeed = async () => {
    if (!currentUser) return;
    setSeeding(true);
    try {
      await seedSampleData(currentUser);
      setSuccessMsg('Dados de exemplo carregados (Contrafilé, Coração, Picanha, Bacon, Lojas 01/02/03, NF 1234 e Romaneio 000123).');
      if (onRefreshData) onRefreshData();
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      setErrorMsg('Erro ao carregar dados de exemplo: ' + (err.message || ''));
      setTimeout(() => setErrorMsg(null), 5000);
    } finally {
      setSeeding(false);
    }
  };

  const handleClear = async () => {
    if (confirm('ATENÇÃO: Deseja apagar todas as movimentações, romaneios, notas fiscais e produtos? Esta ação é irreversível.')) {
      setClearing(true);
      try {
        await clearAllData();
        setSuccessMsg('Banco de dados limpo com sucesso.');
        if (onRefreshData) onRefreshData();
        setTimeout(() => setSuccessMsg(null), 4000);
      } catch (err: any) {
        setErrorMsg('Erro ao limpar dados: ' + (err.message || ''));
        setTimeout(() => setErrorMsg(null), 4000);
      } finally {
        setClearing(false);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Settings className="w-6 h-6 text-slate-700" />
            Configurações e Portabilidade do Sistema
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Parâmetros operacionais, modo autônomo offline (sem Google), backup de dados e exportação de código
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={logout}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold transition shadow-xs cursor-pointer"
          >
            <LogOut className="w-4 h-4 text-rose-400" />
            <span>Sair / Trocar Usuário</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-800 text-sm flex items-center gap-3 animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span className="font-semibold">{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-300 rounded-xl text-rose-800 text-sm flex items-center gap-3 animate-in fade-in">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
          <span className="font-semibold">{errorMsg}</span>
        </div>
      )}

      {/* User Information Card */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-white font-black text-base shadow-sm ${
              currentUser?.avatarColor || 'bg-blue-600'
            }`}>
              {currentUser?.name ? currentUser.name.slice(0, 2).toUpperCase() : 'AD'}
            </div>
            <div>
              <div className="font-bold text-slate-900 text-sm">{currentUser?.name || 'Não selecionado'}</div>
              <div className="text-xs text-slate-500">{currentUser?.department || 'Operações'} • {currentUser?.email}</div>
            </div>
          </div>

          <div className="text-xs text-slate-500 sm:text-right">
            <span className={`inline-block px-2.5 py-1 rounded font-bold mb-1 ${
              currentUser?.role === 'ADMIN GERAL' 
                ? 'bg-amber-100 text-amber-900 border border-amber-300' 
                : 'bg-blue-100 text-blue-900 border border-blue-300'
            }`}>
              {currentUser?.role === 'ADMIN GERAL' ? 'ADMIN GERAL (Acesso Total)' : 'Operador Autorizado'}
            </span>
            <p className="text-[11px] text-slate-400">
              {currentUser?.role === 'ADMIN GERAL' 
                ? 'Acesso irrestrito a exclusões definitivas, auditoria e configurações.'
                : 'Acesso operacional a estoque, notas de entrada e romaneios.'}
            </p>
          </div>
        </div>
      </div>

      {/* SECTION 0: Modo de Operação (Fora do Google / Nuvem) */}
      <div className="bg-linear-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-6 rounded-2xl border border-slate-700 shadow-xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-700 pb-4">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider bg-blue-500/20 text-blue-300 px-2.5 py-0.5 rounded-full border border-blue-400/30">
              Ambiente e Arquitetura de Dados
            </span>
            <h2 className="text-base sm:text-lg font-black text-white tracking-tight flex items-center gap-2 mt-1">
              <Server className="w-5 h-5 text-blue-400" />
              Execução Fora do Ambiente do Google
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Escolha como o sistema deve persistir os dados e operar em sua infraestrutura
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-2 ${
              currentMode === 'local' 
                ? 'bg-blue-600/30 text-blue-300 border border-blue-500/50' 
                : 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/50'
            }`}>
              <span className={`w-2 h-2 rounded-full ${currentMode === 'local' ? 'bg-blue-400' : 'bg-emerald-400 animate-pulse'}`}></span>
              <span>{currentMode === 'local' ? 'Modo Local Ativo' : 'Nuvem Firebase Ativa'}</span>
            </span>
          </div>
        </div>

        {/* Mode Selector Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Option A: Local Autonomous */}
          <div 
            onClick={() => handleToggleStorageMode('local')}
            className={`p-4 rounded-xl border-2 transition-all cursor-pointer text-left ${
              currentMode === 'local'
                ? 'bg-blue-950/70 border-blue-500 ring-2 ring-blue-500/30'
                : 'bg-slate-800/50 border-slate-700 hover:bg-slate-800 hover:border-slate-600'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-white font-bold text-sm">
                <HardDrive className="w-5 h-5 text-blue-400" />
                <span>Modo Local Autônomo (100% Offline / Sem Google)</span>
              </div>
              {currentMode === 'local' && (
                <Check className="w-4 h-4 text-blue-400" />
              )}
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Armazena todos os produtos, notas, romaneios e saldos de estoque <strong>diretamente no navegador do dispositivo (LocalStorage / Cache)</strong>.
            </p>
            <ul className="text-[11px] text-slate-400 space-y-1 mt-2.5 list-disc list-inside">
              <li>Funciona 100% sem internet ou rede externa</li>
              <li>Não faz nenhuma requisição para os servidores do Google</li>
              <li>Ideal para uso local em depósitos, galpões ou intranet</li>
            </ul>
          </div>

          {/* Option B: Firebase Cloud */}
          <div 
            onClick={() => handleToggleStorageMode('firebase')}
            className={`p-4 rounded-xl border-2 transition-all cursor-pointer text-left ${
              currentMode === 'firebase'
                ? 'bg-emerald-950/70 border-emerald-500 ring-2 ring-emerald-500/30'
                : 'bg-slate-800/50 border-slate-700 hover:bg-slate-800 hover:border-slate-600'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-white font-bold text-sm">
                <Cloud className="w-5 h-5 text-emerald-400" />
                <span>Nuvem Firebase (Google Firestore)</span>
              </div>
              {currentMode === 'firebase' && (
                <Check className="w-4 h-4 text-emerald-400" />
              )}
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Sincroniza os dados em tempo real na nuvem Firestore, mantendo múltiplos computadores e celulares conectados simultaneamente.
            </p>
            <ul className="text-[11px] text-slate-400 space-y-1 mt-2.5 list-disc list-inside">
              <li>Sincronização em tempo real entre várias máquinas</li>
              <li>Com cache offline automático ativado para quedas de internet</li>
              <li>Compatível com seu próprio projeto Firebase</li>
            </ul>
          </div>
        </div>

        {/* Data Backup & Portability Actions */}
        <div className="pt-2 border-t border-slate-800">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <FileJson className="w-4 h-4 text-amber-400" />
                Portabilidade e Backup Completo de Dados (JSON)
              </h3>
              <p className="text-[11px] text-slate-400">
                Transfira todos os registros entre computadores, servidores ou ambientes sem depender do Google
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleExportBackup}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition shadow-xs cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Exportar Backup (JSON)</span>
              </button>

              <button
                type="button"
                onClick={handleTriggerImport}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white font-bold text-xs rounded-lg transition shadow-xs cursor-pointer border border-slate-600"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Restaurar Backup (JSON)</span>
              </button>
              <input 
                ref={fileInputRef} 
                type="file" 
                accept=".json" 
                onChange={handleFileChange} 
                className="hidden" 
              />
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 1: Stock Validation Policy */}
      <form onSubmit={handleSaveSettings} className="space-y-6">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 border-b pb-3">
            <ShieldAlert className="w-4 h-4 text-amber-600" />
            1. Política de Validação de Estoque
          </h2>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={allowNegativeStock}
                onChange={(e) => setAllowNegativeStock(e.target.checked)}
                className="w-5 h-5 text-blue-600 rounded border-slate-300 focus:ring-blue-500 mt-0.5 cursor-pointer"
              />
              <div>
                <span className="text-sm font-bold text-slate-900 block">
                  Permitir Saída com Estoque Negativo (Opção Administrativa)
                </span>
                <p className="text-xs text-slate-500 mt-0.5">
                  Quando <strong>desmarcado (padrão)</strong>, o sistema bloqueia qualquer emissão de romaneio caso não exista estoque suficiente de caixas ou peso em quilogramas.
                  Marque apenas se for necessário liberar saídas emergenciais antes da conferência da nota fiscal de entrada.
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* SECTION 2: Company Data for Romaneio Printing */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 border-b pb-3">
            <Building2 className="w-4 h-4 text-blue-600" />
            2. Dados da Empresa (Impressão do Romaneio)
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Razão Social / Nome de Cabeçalho
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none font-bold text-slate-900"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">CNPJ</label>
              <input
                type="text"
                value={companyCnpj}
                onChange={(e) => setCompanyCnpj(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Telefone</label>
              <input
                type="text"
                value={companyPhone}
                onChange={(e) => setCompanyPhone(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Endereço do Centro de Distribuição
              </label>
              <input
                type="text"
                value={companyAddress}
                onChange={(e) => setCompanyAddress(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-sm rounded-lg transition shadow-xs cursor-pointer"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Gravando...' : 'Salvar Alterações'}
            </button>
          </div>
        </div>
      </form>

      {/* SECTION 3: Sample Data Management */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
        <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 border-b pb-3">
          <Database className="w-4 h-4 text-purple-600" />
          3. Gerenciamento de Dados do Sistema
        </h2>
        <p className="text-xs text-slate-500">
          Você pode carregar a base com os produtos e movimentações de exemplo (Contrafilé 101, Coração 102, Picanha 103, Bacon 104, Lojas 01, 02 e 03, Nota Fiscal 1234 e Romaneio 000123) ou limpar todos os dados para início do uso real em produção.
        </p>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            type="button"
            onClick={handleSeed}
            disabled={seeding}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition shadow-xs cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            {seeding ? 'Carregando Exemplos...' : 'Carregar Dados de Exemplo do Briefing'}
          </button>

          <button
            type="button"
            onClick={handleClear}
            disabled={clearing}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold rounded-lg transition cursor-pointer"
          >
            <Trash2 className="w-4 h-4 text-rose-600" />
            {clearing ? 'Limpando...' : 'Limpar Todos os Dados'}
          </button>
        </div>
      </div>

      {/* SECTION 4: Configuração de Integração NF-e (Opcional) */}
      <form onSubmit={handleSaveNfeApiConfig} className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-3">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <Barcode className="w-4 h-4 text-emerald-600" />
            4. Integração e Consulta de NF-e por Chave (Opcional)
          </h2>
          <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full">
            Pronto para Leitor de Código de Barras e XML
          </span>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed">
          O sistema já possui decodificador interno de chaves de 44 dígitos da SEFAZ e importador de arquivos XML 100% autônomo. Se a sua empresa possuir um gateway comercial ou endpoint próprio (Focus NFe, Nuvem Fiscal, etc.), você pode cadastrar a URL e o Token abaixo:
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              URL da API de NF-e (Gateway / Proxy)
            </label>
            <input
              type="url"
              value={nfeApiUrl}
              onChange={(e) => setNfeApiUrl(e.target.value)}
              placeholder="Ex: https://api.focusnfe.com.br/v2"
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg outline-none font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Token de Autorização (Bearer Token)
            </label>
            <input
              type="password"
              value={nfeApiToken}
              onChange={(e) => setNfeApiToken(e.target.value)}
              placeholder="Cole seu token de API aqui..."
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg outline-none font-mono"
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
          <span className="text-[11px] text-slate-400">
            * Se deixar vazio, o sistema operará com o decodificador inteligente e importador de XML nativo.
          </span>
          <button
            type="submit"
            disabled={savingNfeApi}
            className="inline-flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-lg transition shadow-xs cursor-pointer self-end"
          >
            <Save className="w-3.5 h-3.5" />
            {savingNfeApi ? 'Salvando...' : 'Salvar Configurações NF-e'}
          </button>
        </div>
      </form>

      {/* SECTION 5: Como Rodar Fora do Google (Guia Rápido) */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
        <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 border-b pb-3">
          <Terminal className="w-4 h-4 text-indigo-600" />
          4. Como Rodar esta Aplicação Fora do Ambiente Google
        </h2>
        <div className="text-xs text-slate-600 space-y-3 leading-relaxed">
          <p>
            Esta aplicação foi ajustada para funcionar de forma independente em qualquer computador, servidor Linux/Windows, Docker, Vercel, Netlify ou rede interna da sua empresa:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
              <span className="font-bold text-slate-800 flex items-center gap-1.5">
                <Server className="w-4 h-4 text-blue-600" />
                Opção 1: Servidor Local / PC
              </span>
              <p className="text-[11px] text-slate-500">
                Extraia o arquivo .ZIP baixado abaixo e execute no terminal:
              </p>
              <pre className="p-2 bg-slate-900 text-emerald-400 rounded text-[10px] font-mono overflow-x-auto">
npm install{'\n'}npm run dev
              </pre>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
              <span className="font-bold text-slate-800 flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-emerald-600" />
                Opção 2: Hostinger (public_html)
              </span>
              <p className="text-[11px] text-slate-500">
                Execute o build e envie o conteúdo da pasta <strong>dist/</strong> diretamente para a <code>public_html</code> (o <code>.htaccess</code> já está configurado):
              </p>
              <pre className="p-2 bg-slate-900 text-emerald-400 rounded text-[10px] font-mono overflow-x-auto">
npm run build{'\n'}# Ou Node.js: npm start (server.js)
              </pre>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
              <span className="font-bold text-slate-800 flex items-center gap-1.5">
                <HardDrive className="w-4 h-4 text-purple-600" />
                Opção 3: 100% Offline
              </span>
              <p className="text-[11px] text-slate-500">
                Basta selecionar o <strong>Modo Local Autônomo</strong> acima. O sistema não precisa de internet, nem de credenciais do Google, salvando tudo no navegador.
              </p>
            </div>
          </div>
        </div>

        {/* Source Code Download Button */}
        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-3">
          <a
            href="/codigo-fonte-sistema-romaneio.zip"
            download="codigo-fonte-sistema-romaneio.zip"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition shadow-xs"
          >
            <Download className="w-4 h-4" />
            Baixar Código-Fonte Completo (.ZIP)
          </a>

          <button
            type="button"
            onClick={() => setShowCustomFirebase(!showCustomFirebase)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition border border-slate-300 cursor-pointer"
          >
            <Sliders className="w-4 h-4 text-slate-500" />
            <span>{showCustomFirebase ? 'Ocultar Chaves do Firebase' : 'Configurar Chaves do Firebase Próprio (Opcional)'}</span>
          </button>
        </div>

        {/* Optional Custom Firebase Config Form */}
        {showCustomFirebase && (
          <form onSubmit={handleSaveCustomFirebase} className="mt-4 p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Conectar ao Seu Próprio Projeto Firebase (Opcional)
            </h3>
            <p className="text-[11px] text-slate-500">
              Se você possui uma conta do Firebase própria fora do Google AI Studio, informe as credenciais abaixo:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Firebase Project ID</label>
                <input
                  type="text"
                  value={customProjectId}
                  onChange={(e) => setCustomProjectId(e.target.value)}
                  placeholder="ex: meu-projeto-estoque"
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg outline-none font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Firebase API Key</label>
                <input
                  type="text"
                  value={customApiKey}
                  onChange={(e) => setCustomApiKey(e.target.value)}
                  placeholder="ex: AIzaSy..."
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg outline-none font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Auth Domain (Opcional)</label>
                <input
                  type="text"
                  value={customAuthDomain}
                  onChange={(e) => setCustomAuthDomain(e.target.value)}
                  placeholder="ex: meu-projeto.firebaseapp.com"
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Firestore Database ID (Opcional)</label>
                <input
                  type="text"
                  value={customDatabaseId}
                  onChange={(e) => setCustomDatabaseId(e.target.value)}
                  placeholder="(default) ou ID do banco"
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg outline-none font-mono"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg transition"
              >
                Salvar Chaves e Reiniciar
              </button>

              <button
                type="button"
                onClick={() => {
                  clearCustomFirebaseConfig();
                }}
                className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs rounded-lg transition"
              >
                Restaurar Padrão
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
