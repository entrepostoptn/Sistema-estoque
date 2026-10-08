import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { 
  getFirestore, 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager,
  Firestore 
} from 'firebase/firestore';
import firebaseConfigData from '../../firebase-applet-config.json';

export interface FirebaseCustomConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  firestoreDatabaseId?: string;
}

const CUSTOM_CONFIG_KEY = 'ptn_custom_firebase_config';

/**
 * Resolves Firebase configuration with priority:
 * 1. Environment variables (VITE_FIREBASE_*) - standard for external hosts (Vercel, Netlify, Docker)
 * 2. Custom configuration stored in localStorage (user pasted via UI in Settings)
 * 3. Default embedded configuration (firebase-applet-config.json)
 */
export const getEffectiveFirebaseConfig = (): FirebaseCustomConfig => {
  // 1. Check custom UI config first
  try {
    const custom = localStorage.getItem(CUSTOM_CONFIG_KEY);
    if (custom) {
      const parsed = JSON.parse(custom);
      if (parsed.projectId && parsed.apiKey) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Error reading custom firebase config:', e);
  }

  // 2. Check standard VITE environment variables (used outside Google environment)
  const envApiKey = import.meta.env.VITE_FIREBASE_API_KEY;
  const envProjectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  if (envApiKey && envProjectId) {
    return {
      apiKey: envApiKey,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || `${envProjectId}.firebaseapp.com`,
      projectId: envProjectId,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || `${envProjectId}.appspot.com`,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
      appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
      firestoreDatabaseId: import.meta.env.VITE_FIREBASE_DATABASE_ID || ''
    };
  }

  // 3. Fallback to embedded json
  return {
    apiKey: firebaseConfigData.apiKey || '',
    authDomain: firebaseConfigData.authDomain || '',
    projectId: firebaseConfigData.projectId || '',
    storageBucket: firebaseConfigData.storageBucket || '',
    messagingSenderId: firebaseConfigData.messagingSenderId || '',
    appId: firebaseConfigData.appId || '',
    firestoreDatabaseId: firebaseConfigData.firestoreDatabaseId || ''
  };
};

export const isFirebaseConfigured = (): boolean => {
  const conf = getEffectiveFirebaseConfig();
  return Boolean(conf.apiKey && conf.projectId && conf.projectId !== 'placeholder');
};

export const saveCustomFirebaseConfig = (config: FirebaseCustomConfig): void => {
  localStorage.setItem(CUSTOM_CONFIG_KEY, JSON.stringify(config));
  window.location.reload();
};

export const clearCustomFirebaseConfig = (): void => {
  localStorage.removeItem(CUSTOM_CONFIG_KEY);
  window.location.reload();
};

const activeConfig = getEffectiveFirebaseConfig();

const firebaseAppConfig = {
  apiKey: activeConfig.apiKey || 'dummy-api-key',
  authDomain: activeConfig.authDomain || 'dummy.firebaseapp.com',
  projectId: activeConfig.projectId || 'dummy-project',
  storageBucket: activeConfig.storageBucket || '',
  messagingSenderId: activeConfig.messagingSenderId || '',
  appId: activeConfig.appId || '',
};

// Initialize Firebase App
export const app: FirebaseApp = getApps().length === 0 
  ? initializeApp(firebaseAppConfig) 
  : getApp();

// Initialize Auth
export const auth: Auth = getAuth(app);

// Initialize Firestore with modern persistent local cache (IndexedDB)
// This enables automatic offline resilience outside Google environment!
let firestoreInstance: Firestore;

try {
  const dbId = activeConfig.firestoreDatabaseId && activeConfig.firestoreDatabaseId !== '(default)'
    ? activeConfig.firestoreDatabaseId
    : undefined;

  // Initialize with persistent local cache
  if (dbId) {
    firestoreInstance = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
      })
    }, dbId);
  } else {
    firestoreInstance = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
      })
    });
  }
} catch (cacheErr) {
  // If initializeFirestore already ran or failed, fallback to getFirestore
  try {
    firestoreInstance = activeConfig.firestoreDatabaseId && activeConfig.firestoreDatabaseId !== '(default)'
      ? getFirestore(app, activeConfig.firestoreDatabaseId)
      : getFirestore(app);
  } catch (fbErr) {
    console.warn('Firestore initialization warning (app will use local fallback):', fbErr);
    firestoreInstance = getFirestore(app);
  }
}

export const db: Firestore = firestoreInstance;
export const firestore: Firestore = db;
