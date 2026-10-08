import { UserAccount } from '../types';

/**
 * Checks if the given user has the 'ADMIN GERAL' role or master admin account.
 */
export const isAdminGeral = (user?: UserAccount | null): boolean => {
  if (!user) return false;
  return user.role === 'ADMIN GERAL' || (user.username || '').toLowerCase() === 'admin';
};

/**
 * Asserts that the current user has ADMIN GERAL permissions.
 * Throws a descriptive security error if unauthorized.
 */
export const assertAdminGeral = (user: UserAccount | null | undefined, actionDescription: string): void => {
  if (!isAdminGeral(user)) {
    throw new Error(
      `Permissão negada: Apenas o usuário ADMIN GERAL tem autorização para ${actionDescription}. Usuários comuns não possuem essa prerrogativa.`
    );
  }
};

/**
 * Checks if a user has permission to cancel documents (with motive).
 * Regular users (Paloma, User, Admin) can cancel according to standard operational rules.
 */
export const canCancelRecords = (user?: UserAccount | null): boolean => {
  return !!user;
};

/**
 * Checks if a user has permission to permanently delete documents/records from the system.
 * ONLY Admin Geral can permanently delete.
 */
export const canPermanentlyDelete = (user?: UserAccount | null): boolean => {
  return isAdminGeral(user);
};
