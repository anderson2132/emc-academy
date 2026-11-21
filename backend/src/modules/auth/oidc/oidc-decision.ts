/**
 * Qué hacer cuando un proveedor (Google/Microsoft) devuelve una identidad.
 * Función pura para poder probar las reglas (ADR-006):
 *  - Nunca se vincula una cuenta existente solo porque coincida el correo.
 *  - Vincular requiere estar con sesión iniciada y pedirlo explícitamente.
 */
export type OidcMode = 'login' | 'link';

export type OidcErrorCode =
  | 'EMAIL_IN_USE'
  | 'IDENTITY_IN_USE'
  | 'LINK_REQUIRES_SESSION'
  | 'ALREADY_LINKED';

export type OidcDecision =
  | { action: 'LOGIN'; userId: string }
  | { action: 'LINK'; userId: string }
  | { action: 'CREATE' }
  | { action: 'ERROR'; code: OidcErrorCode };

export interface OidcDecisionInput {
  mode: OidcMode;
  /** Usuario dueño de esa identidad (proveedor + sub), si ya existe. */
  identityOwnerId: string | null;
  /** Usuario con sesión iniciada (solo en modo vincular). */
  currentUserId: string | null;
  /** Usuario que ya usa el correo que trae el proveedor, si existe. */
  emailOwnerId: string | null;
  /** El usuario actual ya tiene otra identidad de este mismo proveedor. */
  currentHasProvider?: boolean;
}

export function decideOidc(i: OidcDecisionInput): OidcDecision {
  if (i.mode === 'link') {
    if (!i.currentUserId) return { action: 'ERROR', code: 'LINK_REQUIRES_SESSION' };
    if (i.identityOwnerId === i.currentUserId) return { action: 'ERROR', code: 'ALREADY_LINKED' };
    if (i.identityOwnerId) return { action: 'ERROR', code: 'IDENTITY_IN_USE' };
    if (i.currentHasProvider) return { action: 'ERROR', code: 'ALREADY_LINKED' };
    return { action: 'LINK', userId: i.currentUserId };
  }

  if (i.identityOwnerId) return { action: 'LOGIN', userId: i.identityOwnerId };
  if (i.emailOwnerId) return { action: 'ERROR', code: 'EMAIL_IN_USE' };
  return { action: 'CREATE' };
}
