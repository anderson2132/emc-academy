/**
 * REGLA PARA SOLICITAR UNA MATRÍCULA — ver docs/04-flujos.md §3
 *
 * Función pura (sin BD) para que sea fácil de probar.
 *  - Alumno adulto pide para sí              → REQUESTED (espera al admin).
 *  - Menor pide para sí                       → PENDING_GUARDIAN (espera a su apoderado y luego al admin).
 *    · sin apoderado aprobado                 → error GUARDIAN_REQUIRED.
 *  - Apoderado pide para un hijo vinculado    → REQUESTED (la solicitud ya trae su autorización).
 *    · vínculo no aprobado                    → error NOT_YOUR_CHILD.
 *  - Siempre: el grupo debe estar en inscripción y la matrícula no puede estar ya activa.
 */
import { isMinor } from './course-access.policy';

export type EnrollmentStatusValue = 'PENDING_GUARDIAN' | 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type GroupStatusValue = 'PLANNED' | 'ENROLLING' | 'IN_PROGRESS' | 'FINISHED' | 'CANCELLED';

export type EnrollmentRequestDenyReason =
  | 'GROUP_NOT_OPEN'
  | 'GROUP_FULL'
  | 'NOT_A_STUDENT'
  | 'GUARDIAN_REQUIRED'
  | 'NOT_YOUR_CHILD'
  | 'ALREADY_REQUESTED'
  | 'ALREADY_ENROLLED';

export interface EnrollmentRequestInput {
  now: Date;
  /** Quién pide: el propio alumno o un apoderado para su hijo. */
  requester: 'SELF' | 'GUARDIAN';
  student: {
    /** Cuenta ACTIVE con rol STUDENT. */
    isActiveStudent: boolean;
    birthDate: Date | null;
    /** Tiene al menos un vínculo APPROVED con un apoderado. */
    hasApprovedGuardian: boolean;
  };
  /** Solo para requester = GUARDIAN: el vínculo de quien pide con el alumno está APPROVED. */
  guardianLinkApproved?: boolean;
  group: { status: GroupStatusValue; capacity: number; approvedCount: number };
  /** Matrícula previa del alumno en el mismo grupo, si existe. */
  existing: EnrollmentStatusValue | null;
}

export type EnrollmentRequestResult =
  | { allowed: true; status: 'PENDING_GUARDIAN' | 'REQUESTED' }
  | { allowed: false; reason: EnrollmentRequestDenyReason };

export function decideEnrollmentRequest(input: EnrollmentRequestInput): EnrollmentRequestResult {
  const { now, requester, student, group, existing } = input;
  const deny = (reason: EnrollmentRequestDenyReason): EnrollmentRequestResult => ({ allowed: false, reason });

  if (requester === 'GUARDIAN' && !input.guardianLinkApproved) return deny('NOT_YOUR_CHILD');
  if (!student.isActiveStudent) return deny('NOT_A_STUDENT');

  if (existing === 'APPROVED') return deny('ALREADY_ENROLLED');
  if (existing === 'REQUESTED' || existing === 'PENDING_GUARDIAN') return deny('ALREADY_REQUESTED');

  if (group.status !== 'ENROLLING') return deny('GROUP_NOT_OPEN');
  if (group.approvedCount >= group.capacity) return deny('GROUP_FULL');

  if (requester === 'GUARDIAN') return { allowed: true, status: 'REQUESTED' };

  if (isMinor(student.birthDate, now)) {
    if (!student.hasApprovedGuardian) return deny('GUARDIAN_REQUIRED');
    return { allowed: true, status: 'PENDING_GUARDIAN' };
  }
  return { allowed: true, status: 'REQUESTED' };
}

export const ENROLLMENT_REQUEST_MESSAGES: Record<EnrollmentRequestDenyReason, string> = {
  GROUP_NOT_OPEN: 'Este grupo no está abierto a inscripciones.',
  GROUP_FULL: 'El grupo ya no tiene cupos disponibles.',
  NOT_A_STUDENT: 'La cuenta del alumno debe estar aprobada como alumno antes de inscribirse.',
  GUARDIAN_REQUIRED: 'Como eres menor de edad, primero debes vincular a tu apoderado y que el administrador apruebe el vínculo.',
  NOT_YOUR_CHILD: 'Solo puedes inscribir a tus hijos con vínculo aprobado.',
  ALREADY_REQUESTED: 'Ya existe una solicitud en curso para este grupo.',
  ALREADY_ENROLLED: 'El alumno ya está matriculado en este grupo.',
};
