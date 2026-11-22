import { decideEnrollmentRequest, EnrollmentRequestInput } from './enrollment-request.policy';

const NOW = new Date('2026-12-01T15:00:00Z');
const ADULT = new Date('1995-05-10T00:00:00Z');
const MINOR = new Date('2014-03-20T00:00:00Z');

function input(over: Partial<EnrollmentRequestInput> = {}): EnrollmentRequestInput {
  return {
    now: NOW,
    requester: 'SELF',
    student: { isActiveStudent: true, birthDate: ADULT, hasApprovedGuardian: false },
    group: { status: 'ENROLLING', capacity: 20, approvedCount: 5 },
    existing: null,
    ...over,
  };
}

describe('decideEnrollmentRequest', () => {
  it('adulto que pide para sí → REQUESTED', () => {
    expect(decideEnrollmentRequest(input())).toEqual({ allowed: true, status: 'REQUESTED' });
  });

  it('sin fecha de nacimiento se trata como adulto', () => {
    expect(decideEnrollmentRequest(input({ student: { isActiveStudent: true, birthDate: null, hasApprovedGuardian: false } })))
      .toEqual({ allowed: true, status: 'REQUESTED' });
  });

  it('menor con apoderado aprobado → PENDING_GUARDIAN', () => {
    expect(decideEnrollmentRequest(input({ student: { isActiveStudent: true, birthDate: MINOR, hasApprovedGuardian: true } })))
      .toEqual({ allowed: true, status: 'PENDING_GUARDIAN' });
  });

  it('menor sin apoderado aprobado → GUARDIAN_REQUIRED', () => {
    expect(decideEnrollmentRequest(input({ student: { isActiveStudent: true, birthDate: MINOR, hasApprovedGuardian: false } })))
      .toEqual({ allowed: false, reason: 'GUARDIAN_REQUIRED' });
  });

  it('apoderado con vínculo aprobado → REQUESTED (ya trae su autorización)', () => {
    expect(decideEnrollmentRequest(input({
      requester: 'GUARDIAN', guardianLinkApproved: true,
      student: { isActiveStudent: true, birthDate: MINOR, hasApprovedGuardian: true },
    }))).toEqual({ allowed: true, status: 'REQUESTED' });
  });

  it('apoderado sin vínculo aprobado → NOT_YOUR_CHILD', () => {
    expect(decideEnrollmentRequest(input({ requester: 'GUARDIAN', guardianLinkApproved: false })))
      .toEqual({ allowed: false, reason: 'NOT_YOUR_CHILD' });
  });

  it('alumno sin cuenta activa de alumno → NOT_A_STUDENT', () => {
    expect(decideEnrollmentRequest(input({ student: { isActiveStudent: false, birthDate: ADULT, hasApprovedGuardian: false } })))
      .toEqual({ allowed: false, reason: 'NOT_A_STUDENT' });
  });

  it.each(['PLANNED', 'IN_PROGRESS', 'FINISHED', 'CANCELLED'] as const)('grupo %s → GROUP_NOT_OPEN', (status) => {
    expect(decideEnrollmentRequest(input({ group: { status, capacity: 20, approvedCount: 0 } })))
      .toEqual({ allowed: false, reason: 'GROUP_NOT_OPEN' });
  });

  it('grupo lleno → GROUP_FULL', () => {
    expect(decideEnrollmentRequest(input({ group: { status: 'ENROLLING', capacity: 10, approvedCount: 10 } })))
      .toEqual({ allowed: false, reason: 'GROUP_FULL' });
  });

  it('ya matriculado → ALREADY_ENROLLED', () => {
    expect(decideEnrollmentRequest(input({ existing: 'APPROVED' }))).toEqual({ allowed: false, reason: 'ALREADY_ENROLLED' });
  });

  it.each(['REQUESTED', 'PENDING_GUARDIAN'] as const)('solicitud %s en curso → ALREADY_REQUESTED', (existing) => {
    expect(decideEnrollmentRequest(input({ existing }))).toEqual({ allowed: false, reason: 'ALREADY_REQUESTED' });
  });

  it.each(['REJECTED', 'CANCELLED'] as const)('solicitud anterior %s → se puede volver a pedir', (existing) => {
    expect(decideEnrollmentRequest(input({ existing }))).toEqual({ allowed: true, status: 'REQUESTED' });
  });
});
