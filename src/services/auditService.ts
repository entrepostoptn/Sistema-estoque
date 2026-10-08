import { 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  orderBy, 
  limit, 
  onSnapshot, 
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { AuditLogEntry, AuditAction, UserAccount } from '../types';
import { 
  getStorageMode, 
  getLocalCollection, 
  saveLocalDoc, 
  setLocalCollection, 
  subscribeLocalCollection 
} from './localStorageAdapter';

export const logAuditEvent = async (params: {
  user: UserAccount;
  action: AuditAction;
  actionLabel: string;
  targetType: 'NOTA' | 'PRODUTO' | 'ROMANEIO' | 'LOJA' | 'FORNECEDOR' | 'ESTOQUE' | 'CONFIGURACAO';
  targetId: string;
  targetIdentifier: string;
  reason?: string;
  details?: any;
}): Promise<string> => {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const auditEntry = {
    userId: params.user.id || 'usr_unknown',
    userName: params.user.name || 'Usuário Desconhecido',
    userRole: params.user.role || 'Operador',
    action: params.action,
    actionLabel: params.actionLabel,
    targetType: params.targetType,
    targetId: params.targetId,
    targetIdentifier: params.targetIdentifier,
    reason: params.reason || '',
    details: params.details || null,
    date: dateStr,
    time: timeStr,
    createdAt: now.toISOString()
  };

  // Always save locally first
  const localId = saveLocalDoc('auditLogs', auditEntry);

  if (getStorageMode() === 'firebase') {
    try {
      await addDoc(collection(db, 'audit_logs'), {
        ...auditEntry,
        createdAt: serverTimestamp()
      });
    } catch (error) {
      console.warn('Registro de auditoria preservado localmente (aviso Firestore):', error);
    }
  }

  return localId;
};

export const subscribeAuditLogs = (
  callback: (logs: AuditLogEntry[]) => void,
  maxLogs: number = 300
) => {
  if (getStorageMode() === 'local') {
    return subscribeLocalCollection<AuditLogEntry>('auditLogs', (logs) => {
      const sorted = [...logs].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)).slice(0, maxLogs);
      callback(sorted);
    });
  }

  const q = query(
    collection(db, 'audit_logs'),
    orderBy('createdAt', 'desc'),
    limit(maxLogs)
  );

  return onSnapshot(q, (snapshot) => {
    const items: AuditLogEntry[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      items.push({
        id: docSnap.id,
        userId: data.userId || '',
        userName: data.userName || '',
        userRole: data.userRole || '',
        action: data.action,
        actionLabel: data.actionLabel || data.action,
        targetType: data.targetType || 'CONFIGURACAO',
        targetId: data.targetId || '',
        targetIdentifier: data.targetIdentifier || '',
        reason: data.reason || '',
        details: data.details || null,
        date: data.date || '',
        time: data.time || '',
        createdAt: data.createdAt
      });
    });
    setLocalCollection('auditLogs', items);
    callback(items);
  }, (err) => {
    console.warn('Erro no listener de auditoria Firestore, usando logs locais:', err);
    callback(getLocalCollection<AuditLogEntry>('auditLogs').slice(0, maxLogs));
  });
};

export const getAuditLogs = async (maxLogs: number = 300): Promise<AuditLogEntry[]> => {
  if (getStorageMode() === 'local') {
    return getLocalCollection<AuditLogEntry>('auditLogs').slice(0, maxLogs);
  }

  try {
    const q = query(
      collection(db, 'audit_logs'),
      orderBy('createdAt', 'desc'),
      limit(maxLogs)
    );
    const snapshot = await getDocs(q);
    const items: AuditLogEntry[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      items.push({
        id: docSnap.id,
        userId: data.userId || '',
        userName: data.userName || '',
        userRole: data.userRole || '',
        action: data.action,
        actionLabel: data.actionLabel || data.action,
        targetType: data.targetType || 'CONFIGURACAO',
        targetId: data.targetId || '',
        targetIdentifier: data.targetIdentifier || '',
        reason: data.reason || '',
        details: data.details || null,
        date: data.date || '',
        time: data.time || '',
        createdAt: data.createdAt
      });
    });
    return items;
  } catch (e) {
    console.warn('getAuditLogs fallback to local storage:', e);
    return getLocalCollection<AuditLogEntry>('auditLogs').slice(0, maxLogs);
  }
};
