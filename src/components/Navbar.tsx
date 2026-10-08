import React, { useState } from 'react';
import { 
  Package, 
  ArrowDownToLine, 
  ArrowUpFromLine, 
  Layers, 
  History, 
  BarChart3, 
  PieChart, 
  Settings, 
  Menu, 
  X, 
  CheckCircle2, 
  ArrowRightLeft,
  Store as StoreIcon,
  LogOut,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Trash2,
  Barcode
} from 'lucide-react';
import { useAuth } from '../firebase/authContext';
import { isAdminGeral } from '../services/authPermissions';
import { getStorageMode } from '../services/localStorageAdapter';

export type NavTab = 
  | 'dashboard' 
  | 'products' 
  | 'entries' 
  | 'nfe-entry'
  | 'shipments' 
  | 'stock' 
  | 'history' 
  | 'reports' 
  | 'balancete' 
  | 'stores' 
  | 'settings'
  | 'maintenance'
  | 'audit';

interface NavbarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  onOpenLoginScreen?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentTab, onSelectTab, onOpenLoginScreen }) => {
  const { currentUser, availableUsers, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  const isUserAdmin = isAdminGeral(currentUser);

  const navItems: Array<{ id: NavTab; label: string; icon: React.ReactNode; adminOnly?: boolean }> = [
    { id: 'dashboard', label: 'Dashboard', icon: <Layers className="w-4 h-4" /> },
    { id: 'products', label: 'Produtos', icon: <Package className="w-4 h-4" /> },
    { id: 'entries', label: 'Entradas (NF)', icon: <ArrowDownToLine className="w-4 h-4" /> },
    { id: 'nfe-entry', label: 'Entrada por NF-e', icon: <Barcode className="w-4 h-4 text-emerald-400" /> },
    { id: 'shipments', label: 'Saídas / Romaneios', icon: <ArrowUpFromLine className="w-4 h-4" /> },
    { id: 'stock', label: 'Estoque', icon: <Package className="w-4 h-4" /> },
    { id: 'history', label: 'Histórico', icon: <History className="w-4 h-4" /> },
    { id: 'reports', label: 'Relatórios', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'balancete', label: 'Balancete', icon: <PieChart className="w-4 h-4" /> },
    { id: 'stores', label: 'Lojas & Fornec.', icon: <StoreIcon className="w-4 h-4" /> },
    { id: 'settings', label: 'Configurações', icon: <Settings className="w-4 h-4" /> },
    { 
      id: 'maintenance', 
      label: 'Manutenção / Limpeza', 
      icon: <Trash2 className={`w-4 h-4 ${isUserAdmin ? 'text-rose-400' : 'text-slate-400'}`} />,
      adminOnly: true 
    },
    { 
      id: 'audit', 
      label: 'Histórico de Auditoria', 
      icon: <ShieldAlert className={`w-4 h-4 ${isUserAdmin ? 'text-amber-400' : 'text-slate-400'}`} />,
      adminOnly: true 
    },
  ];

  const handleSelect = (tab: NavTab) => {
    onSelectTab(tab);
    setMobileMenuOpen(false);
  };

  const handleLogoutOrSwitch = async () => {
    setUserDropdownOpen(false);
    setMobileMenuOpen(false);
    await logout();
    if (onOpenLoginScreen) {
      onOpenLoginScreen();
    }
  };

  const getAvatarInitials = (name?: string) => {
    if (!name) return 'AD';
    if (name.toLowerCase().includes('paloma')) return 'PA';
    if (name.toLowerCase().includes('user')) return 'US';
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <header className="bg-slate-900 text-white sticky top-0 z-40 border-b border-slate-800 shadow-md">
      {/* Top Header Row */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <button 
              onClick={() => handleSelect('dashboard')}
              className="flex items-center gap-2.5 text-left group"
            >
              <div className="bg-blue-600 group-hover:bg-blue-500 text-white p-2 rounded-lg shadow-sm transition">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <span className="font-bold text-base sm:text-lg tracking-tight text-white flex items-center gap-2">
                  ESTOQUE & ROMANEIOS
                  <span className="hidden md:inline-flex items-center gap-1 text-[11px] font-medium bg-emerald-950/80 text-emerald-400 border border-emerald-700/60 px-2 py-0.5 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    Pata Negra
                  </span>
                </span>
                <p className="text-[11px] text-slate-400 hidden sm:block">Controle de Estoque por Caixas e Peso (kg)</p>
              </div>
            </button>
          </div>

          {/* User selector & Mobile trigger */}
          <div className="flex items-center gap-2.5">
            {/* Storage Mode Badge */}
            <button
              onClick={() => handleSelect('settings')}
              className={`hidden md:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition cursor-pointer ${
                getStorageMode() === 'local'
                  ? 'bg-blue-950/80 border-blue-700/60 text-blue-300 hover:bg-blue-900/60'
                  : 'bg-emerald-950/80 border-emerald-700/60 text-emerald-400 hover:bg-emerald-900/60'
              }`}
              title="Clique para ver detalhes do armazenamento nas Configurações"
            >
              <span className={`w-2 h-2 rounded-full ${getStorageMode() === 'local' ? 'bg-blue-400' : 'bg-emerald-400 animate-pulse'}`}></span>
              <span>{getStorageMode() === 'local' ? 'Modo Local (Sem Google)' : 'Nuvem Firebase'}</span>
            </button>

            {/* Active User Button */}
            <div className="relative">
              <button
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700/80 border border-slate-700 text-sm font-medium transition shadow-xs"
                title="Clique para trocar de usuário ou ver detalhes"
              >
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black text-white ${
                  currentUser?.avatarColor || 'bg-blue-600'
                }`}>
                  {getAvatarInitials(currentUser?.name)}
                </div>
                <div className="text-left hidden sm:block">
                  <div className="text-xs font-bold text-slate-200 line-clamp-1 max-w-[140px]">
                    {currentUser?.name || 'ADMINISTRADOR'}
                  </div>
                  <div className="text-[10px] text-slate-400 flex items-center gap-1.5">
                    {isUserAdmin ? (
                      <span className="px-1.5 py-0.2 bg-amber-950 text-amber-300 border border-amber-800/60 rounded text-[9px] font-black uppercase">
                        ADMIN GERAL
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.2 bg-blue-950 text-blue-300 border border-blue-800/60 rounded text-[9px] font-bold uppercase">
                        Operador
                      </span>
                    )}
                  </div>
                </div>
                <ArrowRightLeft className="w-3.5 h-3.5 text-slate-400 hidden sm:block ml-1" />
              </button>

              {/* User Dropdown */}
              {userDropdownOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl py-2 z-50 animate-in fade-in zoom-in-95">
                  <div className="px-4 py-2.5 border-b border-slate-800">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-slate-300 uppercase tracking-wider">Usuário Autenticado</p>
                      {isUserAdmin ? (
                        <span className="text-[10px] bg-amber-950 text-amber-300 border border-amber-800/60 px-2 py-0.5 rounded font-mono font-black">
                          ADMIN GERAL
                        </span>
                      ) : (
                        <span className="text-[10px] bg-blue-950 text-blue-300 border border-blue-800/60 px-2 py-0.5 rounded font-mono font-bold">
                          Operador
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Conectado como: <strong className="text-white">{currentUser?.name}</strong> ({currentUser?.department}).
                    </p>
                  </div>

                  <div className="p-2 space-y-1.5">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase px-2 pt-1">
                      Usuários do Sistema ({availableUsers.length} Contas):
                    </p>
                    {availableUsers.map((u) => {
                      const isActive = currentUser?.id === u.id || currentUser?.name === u.name;
                      const isUAdmin = u.role === 'ADMIN GERAL';
                      return (
                        <div
                          key={u.id}
                          className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left text-sm ${
                            isActive 
                              ? 'bg-blue-950/60 text-blue-200 border border-blue-600/60 font-semibold' 
                              : 'bg-slate-800/40 text-slate-300 border border-slate-800'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black text-white shrink-0 ${u.avatarColor || 'bg-slate-700'}`}>
                              {getAvatarInitials(u.name)}
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-xs text-white truncate flex items-center gap-1.5">
                                {u.name}
                                {isUAdmin ? (
                                  <span className="text-[9px] text-amber-400 font-bold bg-amber-950/80 px-1 rounded">ADMIN</span>
                                ) : (
                                  <span className="text-[9px] text-blue-400 font-normal">Op.</span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-400 truncate">{u.role} • {u.username}</div>
                            </div>
                          </div>
                          {isActive ? (
                            <span className="text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded-md font-bold">Ativo</span>
                          ) : (
                            <button
                              onClick={handleLogoutOrSwitch}
                              className="text-[11px] text-blue-400 hover:text-blue-300 font-bold bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded-lg border border-slate-700 transition"
                            >
                              Entrar
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Actions in Dropdown Footer */}
                  <div className="p-2 border-t border-slate-800 space-y-1 bg-slate-950/40 rounded-b-2xl">
                    <button
                      onClick={handleLogoutOrSwitch}
                      className="w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-bold text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 rounded-xl transition"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Sair / Trocar de Usuário</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Direct Logout / Switch Button */}
            <button
              onClick={handleLogoutOrSwitch}
              className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-rose-950/40 hover:text-rose-300 hover:border-rose-800/60 border border-slate-700 text-slate-300 text-xs font-semibold transition"
              title="Trocar de usuário ou sair"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Trocar Usuário</span>
            </button>

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 border border-slate-700"
              aria-label="Menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Desktop Navigation Tabs Bar */}
      <div className="hidden lg:block bg-slate-950/70 border-t border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-1 overflow-x-auto py-2 scrollbar-thin">
            {navItems.map((item) => {
              const active = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleSelect(item.id)}
                  className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
                    active
                      ? 'bg-blue-600 text-white shadow-xs font-bold'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                  }`}
                >
                  {item.icon}
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-slate-900 border-t border-slate-800 px-4 pt-3 pb-5 space-y-2 shadow-2xl animate-in fade-in">
          <div className="p-3 bg-slate-800/80 rounded-xl text-xs text-slate-300 flex items-center justify-between border border-slate-700">
            <div>
              <span className="text-[10px] text-slate-400 block uppercase">Usuário Atual:</span>
              <strong className="text-white text-sm">{currentUser?.name}</strong>
              <div className="text-[10px] text-emerald-400 font-semibold mt-0.5">Permissão Total</div>
            </div>
            <button
              onClick={handleLogoutOrSwitch}
              className="px-3 py-1.5 bg-rose-600/20 text-rose-300 border border-rose-600/40 rounded-lg text-xs font-bold flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Trocar</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-1.5 pt-1">
            {navItems.map((item) => {
              const active = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleSelect(item.id)}
                  className={`flex items-center gap-2 px-3 py-2.5 text-xs font-medium rounded-xl text-left transition ${
                    active
                      ? 'bg-blue-600 text-white font-bold shadow-xs'
                      : 'text-slate-300 hover:bg-slate-800 bg-slate-800/40'
                  }`}
                >
                  {item.icon}
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </header>
  );
};
