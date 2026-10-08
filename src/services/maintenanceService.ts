import { 
  collection, 
  getDocs, 
  writeBatch, 
  doc, 
  setDoc,
  getDoc
} from 'firebase/firestore';
import { firestore } from '../firebase/config';
import { UserAccount } from '../types';
import { assertAdminGeral } from './authPermissions';
import { logAuditEvent } from './auditService';

/**
 * Helper to delete all documents in a specified Firestore collection using write batches (max 400 per commit).
 */
async function wipeCollection(collectionName: string): Promise<number> {
  const colRef = collection(firestore, collectionName);
  const snapshot = await getDocs(colRef);
  
  if (snapshot.empty) {
    return 0;
  }

  let count = 0;
  let batch = writeBatch(firestore);
  let batchCount = 0;

  for (const docSnap of snapshot.docs) {
    batch.delete(docSnap.ref);
    count++;
    batchCount++;

    if (batchCount >= 400) {
      await batch.commit();
      batch = writeBatch(firestore);
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
  }

  return count;
}

/**
 * 1. Zerar movimentações operacionais (stockMovements)
 * Preserva: Produtos, Lojas e Fornecedores
 */
export async function clearMovements(currentUser?: UserAccount | null, reason?: string) {
  assertAdminGeral(currentUser, 'zerar movimentações operacionais');

  const count = await wipeCollection('stockMovements');

  await logAuditEvent({
    user: currentUser!,
    action: 'LIMPEZA_MOVIMENTACOES' as any,
    actionLabel: 'Zerar Movimentações Operacionais',
    targetType: 'ESTOQUE',
    targetId: 'all_movements',
    targetIdentifier: `${count} movimentação(ões) zerada(s)`,
    reason: reason || 'Manutenção do sistema / Homologação de testes',
    details: {
      deletedRecordsCount: count,
      preservedMasterData: ['products', 'stores', 'suppliers']
    }
  });

  return count;
}

/**
 * 2. Zerar notas fiscais lançadas (invoices)
 * Preserva: Produtos, Lojas e Fornecedores
 */
export async function clearInvoices(currentUser?: UserAccount | null, reason?: string) {
  assertAdminGeral(currentUser, 'zerar notas fiscais lançadas');

  const count = await wipeCollection('invoices');

  await logAuditEvent({
    user: currentUser!,
    action: 'LIMPEZA_NOTAS' as any,
    actionLabel: 'Zerar Notas Fiscais Lançadas',
    targetType: 'NOTA',
    targetId: 'all_invoices',
    targetIdentifier: `${count} nota(s) fiscal(is) zerada(s)`,
    reason: reason || 'Manutenção do sistema / Homologação de testes',
    details: {
      deletedRecordsCount: count,
      preservedMasterData: ['products', 'stores', 'suppliers']
    }
  });

  return count;
}

/**
 * 3. Zerar romaneios de saída (shipments)
 * Preserva: Produtos, Lojas e Fornecedores
 */
export async function clearShipments(currentUser?: UserAccount | null, reason?: string) {
  assertAdminGeral(currentUser, 'zerar romaneios de saída');

  const count = await wipeCollection('shipments');

  // Reset nextRomaneioNumber in system_settings doc
  try {
    const settingsDocRef = doc(firestore, 'system_settings', 'general');
    const snap = await getDoc(settingsDocRef);
    if (snap.exists()) {
      await setDoc(settingsDocRef, { nextRomaneioNumber: 1 }, { merge: true });
    }
  } catch (err) {
    console.warn('Could not reset romaneio counter:', err);
  }

  await logAuditEvent({
    user: currentUser!,
    action: 'LIMPEZA_ROMANEIOS' as any,
    actionLabel: 'Zerar Romaneios e Distribuições',
    targetType: 'ROMANEIO',
    targetId: 'all_shipments',
    targetIdentifier: `${count} romaneio(s) zerado(s) - Numeração reiniciada`,
    reason: reason || 'Manutenção do sistema / Homologação de testes',
    details: {
      deletedRecordsCount: count,
      nextRomaneioNumberResetTo: 1,
      preservedMasterData: ['products', 'stores', 'suppliers']
    }
  });

  return count;
}

/**
 * 4. Zerar estoque operacional / movimentações
 * Preserva: Produtos, Lojas e Fornecedores
 */
export async function clearStockAndMovements(currentUser?: UserAccount | null, reason?: string) {
  assertAdminGeral(currentUser, 'zerar estoque e movimentações');

  const count = await wipeCollection('stockMovements');

  await logAuditEvent({
    user: currentUser!,
    action: 'LIMPEZA_ESTOQUE' as any,
    actionLabel: 'Zerar Saldos e Movimentações de Estoque',
    targetType: 'ESTOQUE',
    targetId: 'stock_balance',
    targetIdentifier: `${count} registro(s) de estoque zerado(s) - Saldo operacional zerado`,
    reason: reason || 'Manutenção do sistema / Homologação de testes',
    details: {
      deletedRecordsCount: count,
      balanceResetToZero: true,
      preservedMasterData: ['products', 'stores', 'suppliers']
    }
  });

  return count;
}

/**
 * 5. Zerar histórico operacional
 * Preserva: Produtos, Lojas e Fornecedores (e preserva trilha de auditoria)
 */
export async function clearOperationalHistory(currentUser?: UserAccount | null, reason?: string) {
  assertAdminGeral(currentUser, 'zerar histórico operacional');

  const count = await wipeCollection('stockMovements');

  await logAuditEvent({
    user: currentUser!,
    action: 'LIMPEZA_HISTORICO' as any,
    actionLabel: 'Zerar Histórico Operacional de Movimentações',
    targetType: 'ESTOQUE',
    targetId: 'history_movements',
    targetIdentifier: `${count} registro(s) histórico(s) zerado(s)`,
    reason: reason || 'Manutenção do sistema / Homologação de testes',
    details: {
      deletedRecordsCount: count,
      preservedMasterData: ['products', 'stores', 'suppliers'],
      preservedAuditTrail: true
    }
  });

  return count;
}

/**
 * 6. Zerar balanço e balanceamento operacional
 */
export async function clearBalanceData(currentUser?: UserAccount | null, reason?: string) {
  assertAdminGeral(currentUser, 'zerar balanço operacional');

  // Balance is computed from stockMovements and operational docs
  const count = await wipeCollection('stockMovements');

  await logAuditEvent({
    user: currentUser!,
    action: 'LIMPEZA_BALANCO' as any,
    actionLabel: 'Zerar Dados de Balanço e Balanceamento',
    targetType: 'ESTOQUE',
    targetId: 'balancete_data',
    targetIdentifier: 'Cálculos e saldos de balancete zerados',
    reason: reason || 'Manutenção do sistema / Homologação de testes',
    details: {
      movementsWiped: count,
      preservedMasterData: ['products', 'stores', 'suppliers']
    }
  });

  return count;
}

/**
 * 13. ZERAR DADOS OPERACIONAIS (Wipe All Operational Data in ONE Click)
 *
 * Limpa:
 * - Movimentações de estoque (stockMovements)
 * - Notas fiscais (invoices)
 * - Romaneios e distribuições (shipments)
 * - Saldos e balanços
 * - Histórico operacional
 *
 * NUNCA INCLUI / NUNCA TOCA EM:
 * - Produtos (products)
 * - Lojas (stores)
 * - Fornecedores (suppliers)
 */
export async function clearAllOperationalData(currentUser?: UserAccount | null, reason?: string) {
  assertAdminGeral(currentUser, 'zerar todos os dados operacionais');

  const movementsCount = await wipeCollection('stockMovements');
  const invoicesCount = await wipeCollection('invoices');
  const shipmentsCount = await wipeCollection('shipments');

  // Reset nextRomaneioNumber in system_settings doc
  try {
    const settingsDocRef = doc(firestore, 'system_settings', 'general');
    await setDoc(settingsDocRef, { nextRomaneioNumber: 1 }, { merge: true });
  } catch (err) {
    console.warn('Could not reset romaneio counter:', err);
  }

  const totalRecords = movementsCount + invoicesCount + shipmentsCount;

  await logAuditEvent({
    user: currentUser!,
    action: 'LIMPEZA_DADOS_OPERACIONAIS' as any,
    actionLabel: 'ZERAR DADOS OPERACIONAIS (LIMPEZA GERAL)',
    targetType: 'CONFIGURACAO',
    targetId: 'all_operational_data',
    targetIdentifier: `${totalRecords} registros operacionais eliminados (${movementsCount} mov., ${invoicesCount} NF, ${shipmentsCount} romaneios)`,
    reason: reason || 'Zerar dados operacionais para nova fase de testes / homologação',
    details: {
      movementsDeleted: movementsCount,
      invoicesDeleted: invoicesCount,
      shipmentsDeleted: shipmentsCount,
      totalDeleted: totalRecords,
      nextRomaneioNumberResetTo: 1,
      preservedMasterData: {
        products: 'PRESERVADOS INTACTOS',
        stores: 'PRESERVADOS INTACTOS',
        suppliers: 'PRESERVADOS INTACTOS'
      },
      auditTrailPreserved: true
    }
  });

  return {
    movementsCount,
    invoicesCount,
    shipmentsCount,
    totalRecords
  };
}
