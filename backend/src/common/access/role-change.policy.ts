/**
 * REGLAS PARA DAR O QUITAR ROLES (solo el administrador).
 * Función pura (sin BD) para que sea fácil de probar.
 *  - Dar: la cuenta debe estar ACTIVE y no tener ya ese rol.
 *  - Quitar: la cuenta debe tener el rol; no puede quedar sin roles (para quitar el acceso, se suspende);
 *    un admin no se quita a sí mismo el rol ADMIN; nunca puede quedar la plataforma sin administradores activos.
 */
export type RoleValue = 'ADMIN' | 'TEACHER' | 'STUDENT' | 'GUARDIAN';

export type RoleChangeDenyReason =
  | 'ACCOUNT_NOT_ACTIVE'
  | 'ALREADY_HAS_ROLE'
  | 'ROLE_NOT_ASSIGNED'
  | 'LAST_ROLE'
  | 'SELF_ADMIN_REMOVAL'
  | 'LAST_ADMIN';

export type RoleChangeResult = { allowed: true } | { allowed: false; reason: RoleChangeDenyReason };

export interface RoleChangeInput {
  action: 'ADD' | 'REMOVE';
  role: RoleValue;
  actorId: string;
  target: { id: string; status: string; roles: RoleValue[] };
  /** Administradores con cuenta ACTIVE en toda la plataforma (incluido el destino si lo es). */
  activeAdminCount: number;
}

export function decideRoleChange(input: RoleChangeInput): RoleChangeResult {
  const { action, role, actorId, target, activeAdminCount } = input;
  const deny = (reason: RoleChangeDenyReason): RoleChangeResult => ({ allowed: false, reason });
  const has = target.roles.includes(role);

  if (action === 'ADD') {
    if (target.status !== 'ACTIVE') return deny('ACCOUNT_NOT_ACTIVE');
    if (has) return deny('ALREADY_HAS_ROLE');
    return { allowed: true };
  }

  if (!has) return deny('ROLE_NOT_ASSIGNED');
  if (target.roles.length === 1) return deny('LAST_ROLE');
  if (role === 'ADMIN') {
    if (target.id === actorId) return deny('SELF_ADMIN_REMOVAL');
    if (target.status === 'ACTIVE' && activeAdminCount <= 1) return deny('LAST_ADMIN');
  }
  return { allowed: true };
}

export const ROLE_CHANGE_MESSAGES: Record<RoleChangeDenyReason, string> = {
  ACCOUNT_NOT_ACTIVE: 'Solo se pueden dar roles a cuentas activas. Aprueba o reactiva primero la cuenta.',
  ALREADY_HAS_ROLE: 'La cuenta ya tiene ese rol.',
  ROLE_NOT_ASSIGNED: 'La cuenta no tiene ese rol.',
  LAST_ROLE: 'La cuenta debe conservar al menos un rol. Para quitarle el acceso, suspéndela.',
  SELF_ADMIN_REMOVAL: 'No puedes quitarte a ti mismo el rol de administrador.',
  LAST_ADMIN: 'Debe quedar al menos un administrador activo.',
};
