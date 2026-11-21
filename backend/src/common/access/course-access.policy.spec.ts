import {
  CourseAccessInput,
  contentDeadline,
  evaluateCourseAccess,
  isMinor,
  paymentDeadline,
} from './course-access.policy';

/** Fecha calendario como la guarda PostgreSQL (@db.Date → UTC 00:00). */
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
/** Instante en hora de Lima (UTC-5). */
const lima = (iso: string) => new Date(`${iso}-05:00`);

function base(overrides: Partial<CourseAccessInput> = {}): CourseAccessInput {
  return {
    now: lima('2027-03-03T10:00:00'),
    resource: 'LIVE',
    user: { status: 'ACTIVE', isStudent: true, birthDate: day('1995-05-10'), hasApprovedGuardian: false },
    enrollment: { status: 'APPROVED', manualBlock: false, priceCents: 45000, discountCents: 0, paidCents: 45000 },
    group: { startDate: day('2027-03-01'), endDate: day('2027-04-23') },
    ...overrides,
  };
}

const unpaid = { status: 'APPROVED' as const, manualBlock: false, priceCents: 45000, discountCents: 0, paidCents: 0 };

describe('evaluateCourseAccess', () => {
  it('permite a un alumno activo, matriculado y con pago completo', () => {
    expect(evaluateCourseAccess(base())).toEqual(expect.objectContaining({ allowed: true, paymentPending: false }));
  });

  it.each([
    ['PENDING_APPROVAL'],
    ['SUSPENDED'],
    ['REJECTED'],
    ['PENDING_VERIFICATION'],
  ] as const)('niega si la cuenta está %s', (status) => {
    const r = evaluateCourseAccess(base({ user: { ...base().user, status } }));
    expect(r).toEqual({ allowed: false, reason: 'ACCOUNT_NOT_ACTIVE' });
  });

  it('niega si el usuario no tiene rol de alumno', () => {
    expect(evaluateCourseAccess(base({ user: { ...base().user, isStudent: false } }))).toEqual({ allowed: false, reason: 'NOT_A_STUDENT' });
  });

  describe('menores de edad', () => {
    const minor = { status: 'ACTIVE' as const, isStudent: true, birthDate: day('2016-06-01') };

    it('niega a un menor sin apoderado aprobado', () => {
      const r = evaluateCourseAccess(base({ user: { ...minor, hasApprovedGuardian: false } }));
      expect(r).toEqual({ allowed: false, reason: 'GUARDIAN_NOT_APPROVED' });
    });

    it('permite a un menor con apoderado aprobado', () => {
      const r = evaluateCourseAccess(base({ user: { ...minor, hasApprovedGuardian: true } }));
      expect(r.allowed).toBe(true);
    });

    it('calcula la mayoría de edad exacta (18 años)', () => {
      expect(isMinor(day('2009-03-04'), lima('2027-03-03T10:00:00'))).toBe(true);
      expect(isMinor(day('2009-03-03'), lima('2027-03-03T10:00:00'))).toBe(false);
      expect(isMinor(null, lima('2027-03-03T10:00:00'))).toBe(false);
    });
  });

  it.each([['REQUESTED'], ['REJECTED'], ['CANCELLED']] as const)('niega si la matrícula está %s', (status) => {
    const r = evaluateCourseAccess(base({ enrollment: { ...base().enrollment!, status } }));
    expect(r).toEqual({ allowed: false, reason: 'ENROLLMENT_NOT_APPROVED' });
  });

  it('niega si no hay matrícula', () => {
    expect(evaluateCourseAccess(base({ enrollment: null }))).toEqual({ allowed: false, reason: 'ENROLLMENT_NOT_APPROVED' });
  });

  it('niega si el admin bloqueó manualmente, aunque esté pagado', () => {
    const r = evaluateCourseAccess(base({ enrollment: { ...base().enrollment!, manualBlock: true } }));
    expect(r).toEqual({ allowed: false, reason: 'MANUAL_BLOCK' });
  });

  describe('pago (7 días desde el inicio, hora de Lima)', () => {
    it('el plazo vence al final del día inicio + 7 en Lima', () => {
      expect(paymentDeadline(day('2027-03-01')).toISOString()).toBe('2027-03-09T04:59:59.999Z'); // 08/03 23:59:59.999 Lima
    });

    it('permite sin pago dentro del plazo y avisa que está pendiente', () => {
      const r = evaluateCourseAccess(base({ enrollment: unpaid, now: lima('2027-03-08T23:59:00') }));
      expect(r).toEqual(expect.objectContaining({ allowed: true, paymentPending: true }));
    });

    it('bloquea sin pago al día siguiente del plazo', () => {
      const r = evaluateCourseAccess(base({ enrollment: unpaid, now: lima('2027-03-09T00:00:01') }));
      expect(r).toEqual({ allowed: false, reason: 'PAYMENT_OVERDUE' });
    });

    it('bloquea con pago parcial vencido', () => {
      const r = evaluateCourseAccess(base({ enrollment: { ...unpaid, paidCents: 20000 }, now: lima('2027-03-15T10:00:00') }));
      expect(r).toEqual({ allowed: false, reason: 'PAYMENT_OVERDUE' });
    });

    it('considera el descuento al calcular si está pagado', () => {
      const r = evaluateCourseAccess(base({ enrollment: { ...unpaid, discountCents: 5000, paidCents: 40000 }, now: lima('2027-03-15T10:00:00') }));
      expect(r.allowed).toBe(true);
    });

    it('desbloquea apenas se registra el pago', () => {
      const r = evaluateCourseAccess(base({ now: lima('2027-03-20T10:00:00') }));
      expect(r.allowed).toBe(true);
    });
  });

  describe('clase en vivo vs. contenido', () => {
    it('niega la clase en vivo cuando el grupo terminó', () => {
      const r = evaluateCourseAccess(base({ now: lima('2027-04-24T09:00:00') }));
      expect(r).toEqual({ allowed: false, reason: 'GROUP_FINISHED' });
    });

    it('permite grabaciones hasta 6 meses después del fin', () => {
      expect(contentDeadline(day('2027-04-23')).toISOString()).toBe('2027-10-24T04:59:59.999Z');
      const r = evaluateCourseAccess(base({ resource: 'CONTENT', now: lima('2027-10-23T22:00:00') }));
      expect(r.allowed).toBe(true);
    });

    it('niega grabaciones pasados los 6 meses', () => {
      const r = evaluateCourseAccess(base({ resource: 'CONTENT', now: lima('2027-10-24T00:00:01') }));
      expect(r).toEqual({ allowed: false, reason: 'ACCESS_EXPIRED' });
    });

    it('un pago vencido también bloquea las grabaciones', () => {
      const r = evaluateCourseAccess(base({ resource: 'CONTENT', enrollment: unpaid, now: lima('2027-05-01T10:00:00') }));
      expect(r).toEqual({ allowed: false, reason: 'PAYMENT_OVERDUE' });
    });
  });
});
