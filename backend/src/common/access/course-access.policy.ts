/**
 * REGLA DE ACCESO A UN CURSO — ver docs/03-roles-y-permisos.md §2
 *
 * Función pura (sin BD) para que sea fácil de probar. El servicio que carga
 * los datos y la invoca vive en el módulo de matrículas (Etapa 3).
 *
 * El estado de pago NO se guarda: se calcula aquí a partir de pagos y fechas
 * (ADR-010), así nunca queda desfasado.
 */

export const PAYMENT_GRACE_DAYS = 7;
export const CONTENT_ACCESS_MONTHS = 6;

export type CourseResource =
  /** Clase en vivo: enlace Zoom y marcar asistencia. */
  | 'LIVE'
  /** Grabaciones, materiales y tareas. */
  | 'CONTENT';

export type AccessDenyReason =
  | 'ACCOUNT_NOT_ACTIVE'
  | 'NOT_A_STUDENT'
  | 'GUARDIAN_NOT_APPROVED'
  | 'ENROLLMENT_NOT_APPROVED'
  | 'MANUAL_BLOCK'
  | 'PAYMENT_OVERDUE'
  | 'GROUP_FINISHED'
  | 'ACCESS_EXPIRED';

export interface CourseAccessInput {
  now: Date;
  resource: CourseResource;
  user: {
    status: 'PENDING_VERIFICATION' | 'PENDING_APPROVAL' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED';
    isStudent: boolean;
    /** Fecha de nacimiento; null si no se registró (se trata como adulto). */
    birthDate: Date | null;
    /** true si tiene al menos un vínculo APPROVED con un apoderado. */
    hasApprovedGuardian: boolean;
  };
  enrollment: {
    status: 'PENDING_GUARDIAN' | 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
    manualBlock: boolean;
    priceCents: number;
    discountCents: number;
    /** Suma de pagos no anulados. */
    paidCents: number;
  } | null;
  group: {
    /** Fecha de inicio (día calendario, en UTC 00:00). */
    startDate: Date;
    /** Fecha de fin (día calendario, en UTC 00:00). */
    endDate: Date;
  };
}

export type CourseAccessResult =
  | { allowed: true; paymentPending: boolean; paymentDueDate: Date }
  | { allowed: false; reason: AccessDenyReason };

const DAY_MS = 24 * 60 * 60 * 1000;
/** Perú: UTC-5 todo el año (sin horario de verano). */
const LIMA_OFFSET_MS = 5 * 60 * 60 * 1000;

/**
 * Último milisegundo del día `date + plusDays` en hora de Lima.
 * `date` es una fecha calendario guardada como UTC 00:00 (columna @db.Date).
 */
export function endOfLimaDay(date: Date, plusDays = 0): Date {
  return new Date(date.getTime() + (plusDays + 1) * DAY_MS + LIMA_OFFSET_MS - 1);
}

export function isMinor(birthDate: Date | null, now: Date): boolean {
  if (!birthDate) return false;
  const adult = new Date(birthDate);
  adult.setUTCFullYear(adult.getUTCFullYear() + 18);
  return now < adult;
}

export function isPaid(e: { priceCents: number; discountCents: number; paidCents: number }): boolean {
  return e.paidCents >= Math.max(0, e.priceCents - e.discountCents);
}

/** Último instante para pagar: fin del día (inicio + 7 días), hora de Lima. */
export function paymentDeadline(startDate: Date): Date {
  return endOfLimaDay(startDate, PAYMENT_GRACE_DAYS);
}

/** Último instante de acceso a grabaciones/materiales: fin del día (fin + 6 meses), hora de Lima. */
export function contentDeadline(endDate: Date): Date {
  const d = new Date(endDate);
  d.setUTCMonth(d.getUTCMonth() + CONTENT_ACCESS_MONTHS);
  return endOfLimaDay(d);
}

/** Fin del día de la última clase, hora de Lima. */
function groupEnd(endDate: Date): Date {
  return endOfLimaDay(endDate);
}

export function evaluateCourseAccess(input: CourseAccessInput): CourseAccessResult {
  const { now, resource, user, enrollment, group } = input;
  const deny = (reason: AccessDenyReason): CourseAccessResult => ({ allowed: false, reason });

  if (user.status !== 'ACTIVE') return deny('ACCOUNT_NOT_ACTIVE');
  if (!user.isStudent) return deny('NOT_A_STUDENT');
  if (isMinor(user.birthDate, now) && !user.hasApprovedGuardian) return deny('GUARDIAN_NOT_APPROVED');
  if (!enrollment || enrollment.status !== 'APPROVED') return deny('ENROLLMENT_NOT_APPROVED');
  if (enrollment.manualBlock) return deny('MANUAL_BLOCK');

  const dueDate = paymentDeadline(group.startDate);
  const paid = isPaid(enrollment);
  if (!paid && now > dueDate) return deny('PAYMENT_OVERDUE');

  if (resource === 'LIVE' && now > groupEnd(group.endDate)) return deny('GROUP_FINISHED');
  if (resource === 'CONTENT' && now > contentDeadline(group.endDate)) return deny('ACCESS_EXPIRED');

  return { allowed: true, paymentPending: !paid, paymentDueDate: dueDate };
}
