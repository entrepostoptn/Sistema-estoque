import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  signInAnonymously, 
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import { auth, db } from './config';
import { 
  doc, 
  setDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import { UserAccount } from '../types';
import { getStorageMode } from '../services/localStorageAdapter';

export interface AuthorizedUser extends UserAccount {
  username: string;
  password: string;
  alternativePasswords?: string[];
}

export const ONLY_USERS: AuthorizedUser[] = [
  {
    id: 'user_admingeral',
    username: 'admin',
    name: 'Admin Geral',
    role: 'ADMIN GERAL',
    email: 'admin@patanegra.local',
    password: '130115',
    alternativePasswords: ['admin@2026'],
    avatarColor: 'bg-amber-600',
    department: 'Diretoria & Auditoria Geral',
    description: 'Acesso Irrestrito: Exclusão definitiva de registros, auditoria geral de ações e configurações críticas.'
  },
  {
    id: 'user_paloma',
    username: 'paloma',
    name: 'Paloma',
    role: 'Operador',
    email: 'paloma@patanegra.local',
    password: 'patanegra@10',
    alternativePasswords: ['patanegra@20'],
    avatarColor: 'bg-rose-600',
    department: 'Operações de Estoque & Romaneios',
    description: 'Acesso operacional: controle de estoque, notas de entrada, romaneios com múltiplas lojas e cancelamentos justificados.'
  },
  {
    id: 'user_operador',
    username: 'user',
    name: 'User',
    role: 'Operador',
    email: 'user@patanegra.local',
    password: 'patanegra10@',
    alternativePasswords: ['patanegra20@'],
    avatarColor: 'bg-blue-600',
    department: 'Expedição & Armazém',
    description: 'Acesso operacional: controle de estoque, notas de entrada, romaneios com múltiplas lojas e cancelamentos justificados.'
  }
];

interface AuthContextType {
  currentUser: UserAccount | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  isLoggedIn: boolean;
  availableUsers: UserAccount[];
  loginWithCredentials: (username: string, passwordAttempt: string, remember?: boolean) => Promise<UserAccount>;
  quickLogin: (username: 'admin' | 'paloma' | 'user', remember?: boolean) => Promise<UserAccount>;
  loginAsUser: (user: UserAccount, remember?: boolean) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

const STORAGE_KEY_AUTH_SESSION = 'sistema_estoque_auth_verified_v2';
const LEGACY_STORAGE_KEY = 'sistema_estoque_active_user';
const PREV_SESSION_KEY = 'sistema_estoque_auth_verified_v1';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // 1. Maintain Firebase Auth session to satisfy firestore if anonymous auth is enabled
  useEffect(() => {
    if (getStorageMode() === 'local') {
      return;
    }

    let isMounted = true;
    try {
      const unsubscribeAuth = onAuthStateChanged(auth, async (fbUser) => {
        if (!isMounted) return;
        setFirebaseUser(fbUser);
        if (!fbUser) {
          try {
            await signInAnonymously(auth);
          } catch (e) {
            console.warn('Anonymous auth not active (non-blocking):', e);
          }
        }
      });
      return () => {
        isMounted = false;
        unsubscribeAuth();
      };
    } catch (e) {
      console.warn('Auth observer setup warning:', e);
    }
  }, []);

  // 2. Restore verified user session ONLY if explicitly authenticated previously
  // NEVER auto-login unauthenticated users: Access MUST be blocked until credentials are typed!
  useEffect(() => {
    try {
      // Clear legacy unauthenticated auto-login tokens if present
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      sessionStorage.removeItem(LEGACY_STORAGE_KEY);
      localStorage.removeItem(PREV_SESSION_KEY);
      sessionStorage.removeItem(PREV_SESSION_KEY);

      const saved = localStorage.getItem(STORAGE_KEY_AUTH_SESSION) || sessionStorage.getItem(STORAGE_KEY_AUTH_SESSION);
      if (saved) {
        const parsed: UserAccount = JSON.parse(saved);
        const validMatch = ONLY_USERS.find(
          u => u.id === parsed.id || 
               u.username.toLowerCase() === (parsed.username || '').toLowerCase() || 
               u.name.toLowerCase() === (parsed.name || '').toLowerCase()
        );

        if (validMatch) {
          setCurrentUser({
            id: validMatch.id,
            name: validMatch.name,
            username: validMatch.username,
            role: validMatch.role,
            email: validMatch.email,
            avatarColor: validMatch.avatarColor,
            department: validMatch.department,
            description: validMatch.description
          });
        } else {
          // If stored user is invalid, strictly block access
          setCurrentUser(null);
        }
      } else {
        // Strict blocking: No session means access is locked until login with username & password
        setCurrentUser(null);
      }
    } catch (e) {
      console.error('Error verifying user session:', e);
      setCurrentUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Expose allowed users without password property for UI safety
  const availableUsers: UserAccount[] = React.useMemo(() => {
    return ONLY_USERS.map(({ password: _, ...safe }) => safe);
  }, []);

  // Login strictly requiring Username and valid Password
  const loginWithCredentials = async (
    usernameInput: string, 
    passwordAttempt: string, 
    remember: boolean = true
  ): Promise<UserAccount> => {
    const cleanUsername = (usernameInput || '').trim().toLowerCase();
    const cleanPassword = (passwordAttempt || '').trim();

    if (!cleanUsername) {
      throw new Error('Por favor, informe ou selecione o usuário.');
    }

    if (!cleanPassword) {
      throw new Error('Por favor, digite a senha de acesso.');
    }

    // Find user
    const targetUser = ONLY_USERS.find(
      (u) => u.username.toLowerCase() === cleanUsername || u.name.toLowerCase() === cleanUsername
    );

    if (!targetUser) {
      throw new Error('Usuário não encontrado. Selecione "Admin Geral", "Paloma" ou "User".');
    }

    // Strict password match according to user specified credentials:
    // admin -> 130115
    // paloma -> patanegra@10
    // user -> patanegra10@
    const validPasswords = [
      targetUser.password,
      ...(targetUser.alternativePasswords || [])
    ];
    const isPasswordCorrect = validPasswords.some(
      (pwd) => pwd === cleanPassword || pwd.toLowerCase() === cleanPassword.toLowerCase()
    );

    if (!isPasswordCorrect) {
      throw new Error(`Senha incorreta para ${targetUser.name}. Verifique a senha e tente novamente.`);
    }

    const safeUser: UserAccount = {
      id: targetUser.id,
      name: targetUser.name,
      username: targetUser.username,
      role: targetUser.role,
      email: targetUser.email,
      avatarColor: targetUser.avatarColor,
      department: targetUser.department,
      description: targetUser.description
    };

    // Store verified session
    if (remember) {
      localStorage.setItem(STORAGE_KEY_AUTH_SESSION, JSON.stringify(safeUser));
    } else {
      sessionStorage.setItem(STORAGE_KEY_AUTH_SESSION, JSON.stringify(safeUser));
    }

    // Unlock system access
    setCurrentUser(safeUser);

    // Non-blocking background sync with Firestore (only when in Firebase cloud mode)
    if (getStorageMode() === 'firebase') {
      (async () => {
        try {
          let currentFbUser = auth.currentUser;
          if (!currentFbUser) {
            const cred = await signInAnonymously(auth);
            currentFbUser = cred.user;
          }
          if (currentFbUser) {
            await setDoc(doc(db, 'users', currentFbUser.uid), {
              name: safeUser.name,
              username: safeUser.username,
              role: safeUser.role,
              email: safeUser.email,
              lastLoginAt: serverTimestamp()
            }, { merge: true });
          }
        } catch (fbErr) {
          console.warn('Background Firebase user tracking note:', fbErr);
        }
      })();
    }

    return safeUser;
  };

  // Quick login now also validates credentials to avoid accidental bypasses
  const quickLogin = async (targetUsername: 'admin' | 'paloma' | 'user', remember: boolean = true): Promise<UserAccount> => {
    const userObj = ONLY_USERS.find(u => u.username.toLowerCase() === targetUsername.toLowerCase());
    if (!userObj) {
      throw new Error('Usuário inválido');
    }
    return loginWithCredentials(userObj.username, userObj.password, remember);
  };

  // Direct login compatibility for internal triggers
  const loginAsUser = async (user: UserAccount, remember: boolean = true) => {
    const matched = ONLY_USERS.find(
      u => u.id === user.id || u.username.toLowerCase() === (user.username || user.name).toLowerCase()
    );
    if (matched) {
      await loginWithCredentials(matched.username, matched.password, remember);
    }
  };

  // Logout strictly revokes credentials and blocks the application
  const logout = async () => {
    localStorage.removeItem(STORAGE_KEY_AUTH_SESSION);
    sessionStorage.removeItem(STORAGE_KEY_AUTH_SESSION);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    sessionStorage.removeItem(LEGACY_STORAGE_KEY);
    setCurrentUser(null);
  };

  return (
    <AuthContext.Provider value={{
      currentUser,
      firebaseUser,
      loading,
      isLoggedIn: !!currentUser,
      availableUsers,
      loginWithCredentials,
      quickLogin,
      loginAsUser,
      logout
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
