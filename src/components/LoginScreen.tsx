import React, { useState } from 'react';
import { 
  Lock, 
  User as UserIcon, 
  Eye, 
  EyeOff, 
  ShieldCheck, 
  Layers, 
  CheckCircle2, 
  AlertCircle,
  ArrowRight,
  KeyRound,
  ShieldAlert
} from 'lucide-react';
import { useAuth } from '../firebase/authContext';
import { UserAccount } from '../types';
import { getStorageMode } from '../services/localStorageAdapter';

interface LoginScreenProps {
  onLoginSuccess?: (user: UserAccount) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const { loginWithCredentials } = useAuth();

  const [username, setUsername] = useState<'admin' | 'paloma' | 'user' | string>('admin');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // User select handler
  const handleSelectUser = (selectedUsername: 'admin' | 'paloma' | 'user') => {
    setUsername(selectedUsername);
    setPassword('');
    setErrorMessage(null);
  };

  const handleFormSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    const pwdToTry = password.trim();
    if (!pwdToTry) {
      setErrorMessage('Por favor, informe a senha de acesso para continuar.');
      return;
    }

    setIsAuthenticating(true);
    setErrorMessage(null);

    try {
      const user = await loginWithCredentials(username, pwdToTry, rememberMe);
      if (onLoginSuccess) {
        onLoginSuccess(user);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Senha incorreta. Verifique suas credenciais.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const getUserDisplayName = () => {
    if (username === 'admin') return 'Admin Geral';
    if (username === 'paloma') return 'Paloma';
    return 'User';
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-950 via-slate-900 to-slate-950 text-white flex flex-col justify-between p-4 sm:p-6 lg:p-8 font-sans">
      
      {/* Top Header */}
      <header className="max-w-5xl w-full mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 py-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-linear-to-tr from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
              ESTOQUE & ROMANEIOS
              <span className="text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Lock className="w-3 h-3" />
                ACESSO RESTRITO
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              Central de Distribuição e Carnes • Pata Negra
            </p>
          </div>
        </div>

        {getStorageMode() === 'local' ? (
          <div className="flex items-center gap-2 bg-blue-950/70 border border-blue-700/50 text-blue-300 px-3 py-1 rounded-full text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-blue-400"></span>
            <span>Modo Local Autônomo (Offline / Sem Google)</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 bg-emerald-950/70 border border-emerald-700/50 text-emerald-400 px-3 py-1 rounded-full text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Nuvem Firebase Conectada</span>
          </div>
        )}
      </header>

      {/* Main Container */}
      <main className="max-w-4xl w-full mx-auto py-8 sm:py-12 flex flex-col items-center justify-center flex-1">
        
        <div className="w-full max-w-md bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
          
          {/* Card Title */}
          <div className="text-center space-y-1.5">
            <div className="w-12 h-12 bg-linear-to-tr from-blue-600 to-indigo-500 rounded-2xl mx-auto flex items-center justify-center text-white shadow-lg shadow-blue-600/30 mb-2">
              <KeyRound className="w-6 h-6" />
            </div>
            <h2 className="text-2xl font-black text-white tracking-tight">
              Acesso ao Sistema
            </h2>
            <p className="text-xs text-slate-400">
              Informe seu usuário e senha autorizados para desbloquear o acesso
            </p>
          </div>

          {/* User Selector Cards */}
          <div className="space-y-3">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 text-center">
              Selecione seu Perfil de Usuário:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* Admin Geral */}
              <button
                type="button"
                onClick={() => handleSelectUser('admin')}
                className={`p-3.5 rounded-2xl border transition-all duration-200 text-left relative flex flex-col justify-between cursor-pointer ${
                  username.toLowerCase() === 'admin'
                    ? 'bg-amber-950/60 border-amber-500 ring-2 ring-amber-500/40 text-white shadow-lg shadow-amber-950/50'
                    : 'bg-slate-800/60 hover:bg-slate-800 border-slate-700 text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="w-9 h-9 rounded-xl bg-amber-600 flex items-center justify-center text-white font-black text-sm shadow-sm">
                    AG
                  </div>
                  {username.toLowerCase() === 'admin' && (
                    <CheckCircle2 className="w-4 h-4 text-amber-400" />
                  )}
                </div>
                <div>
                  <div className="font-black text-sm text-white">Admin Geral</div>
                  <div className="text-[10px] text-amber-300 font-bold mt-0.5">ADMIN GERAL</div>
                  <div className="text-[10px] text-slate-400 mt-1">Diretoria</div>
                </div>
              </button>

              {/* Paloma */}
              <button
                type="button"
                onClick={() => handleSelectUser('paloma')}
                className={`p-3.5 rounded-2xl border transition-all duration-200 text-left relative flex flex-col justify-between cursor-pointer ${
                  username.toLowerCase() === 'paloma'
                    ? 'bg-rose-950/60 border-rose-500 ring-2 ring-rose-500/40 text-white shadow-lg shadow-rose-950/50'
                    : 'bg-slate-800/60 hover:bg-slate-800 border-slate-700 text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="w-9 h-9 rounded-xl bg-rose-600 flex items-center justify-center text-white font-black text-sm shadow-sm">
                    PA
                  </div>
                  {username.toLowerCase() === 'paloma' && (
                    <CheckCircle2 className="w-4 h-4 text-rose-400" />
                  )}
                </div>
                <div>
                  <div className="font-black text-sm text-white">Paloma</div>
                  <div className="text-[10px] text-rose-300 font-bold mt-0.5">Operador</div>
                  <div className="text-[10px] text-slate-400 mt-1">Estoque/Romaneio</div>
                </div>
              </button>

              {/* User */}
              <button
                type="button"
                onClick={() => handleSelectUser('user')}
                className={`p-3.5 rounded-2xl border transition-all duration-200 text-left relative flex flex-col justify-between cursor-pointer ${
                  username.toLowerCase() === 'user'
                    ? 'bg-blue-950/60 border-blue-500 ring-2 ring-blue-500/40 text-white shadow-lg shadow-blue-950/50'
                    : 'bg-slate-800/60 hover:bg-slate-800 border-slate-700 text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white font-black text-sm shadow-sm">
                    US
                  </div>
                  {username.toLowerCase() === 'user' && (
                    <CheckCircle2 className="w-4 h-4 text-blue-400" />
                  )}
                </div>
                <div>
                  <div className="font-black text-sm text-white">User</div>
                  <div className="text-[10px] text-blue-300 font-bold mt-0.5">Operador</div>
                  <div className="text-[10px] text-slate-400 mt-1">Expedição</div>
                </div>
              </button>
            </div>
          </div>

          {/* Error Notice */}
          {errorMessage && (
            <div className="p-3.5 bg-rose-950/80 border border-rose-500/80 rounded-xl text-rose-200 text-xs flex items-center gap-2.5 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span className="font-medium">{errorMessage}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleFormSubmit} className="space-y-4">
            
            {/* Password Input */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-300 uppercase">
                  Senha de Acesso ({getUserDisplayName()})
                </label>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoFocus
                  required
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setErrorMessage(null);
                  }}
                  placeholder={`Digite a senha de ${getUserDisplayName()}`}
                  className="w-full pl-10 pr-10 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition font-mono tracking-wider"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-white cursor-pointer"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Remember Me */}
            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <span>Manter conectado neste navegador</span>
              </label>
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isAuthenticating}
                className="w-full py-3 px-4 bg-linear-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white rounded-xl font-bold text-sm transition shadow-lg shadow-blue-600/25 flex items-center justify-center gap-2 cursor-pointer"
              >
                {isAuthenticating ? (
                  <span>Validando credenciais...</span>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>Entrar no Sistema</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Security Notice */}
          <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl text-[11px] text-slate-400 flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>
              <strong>Segurança Ativa:</strong> O acesso requer autenticação individual obrigatória por senha. Operações de exclusão e configurações críticas são restritas ao <strong>Admin Geral</strong>.
            </span>
          </div>

        </div>

      </main>

      {/* Footer */}
      <footer className="max-w-5xl w-full mx-auto py-3 text-center text-xs text-slate-500 border-t border-slate-800/80">
        Sistema de Controle de Estoque e Romaneios • Pata Negra • Firebase Cloud Firestore
      </footer>

    </div>
  );
};
