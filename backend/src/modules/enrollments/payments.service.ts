import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import type { AuthUser } from '../../common/auth/auth-user';
import type { PaymentMethod } from '../../generated/prisma/enums';

const soles = (cents: number) => `S/ ${(cents / 100).toFixed(2).replace(/\.00$/, '')}`;
/** Hoy en Lima (AAAA-MM-DD). */
const limaToday = () => new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);

export interface MarkPaidInput {
  method: PaymentMethod;
  operationNumber?: string;
  /** AAAA-MM-DD; por defecto, hoy (Lima). */
  paidOn?: string;
  notes?: string;
}

/**
 * Pagos manuales (pago único por curso, sin cuotas).
 * "Pago realizado" = un pago por el saldo completo. "Pendiente" = se anulan los pagos (quedan en el historial).
 * El acceso NO se guarda: la regla de acceso lo calcula con la suma de pagos no anulados (ADR-010).
 */
@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  async markPaid(admin: AuthUser, enrollmentId: string, input: MarkPaidInput, ip?: string) {
    const e = await this.load(enrollmentId);
    const due = Math.max(0, e.priceCents - e.discountCents);
    const paid = e.payments.reduce((s, p) => s + p.amountCents, 0);
    if (paid >= due) throw new ConflictException({ code: 'ALREADY_PAID', message: 'Esta matrícula ya figura como pagada.' });

    const paidOn = input.paidOn ?? limaToday();
    if (paidOn > limaToday()) throw new BadRequestException('La fecha de pago no puede ser futura.');

    const amountCents = due - paid;
    await this.prisma.$transaction(async (tx) => {
      const p = await tx.payment.create({
        data: {
          enrollmentId: e.id,
          amountCents,
          method: input.method,
          operationNumber: input.operationNumber?.trim() || null,
          paidOn: new Date(`${paidOn}T00:00:00.000Z`),
          registeredById: admin.id,
          notes: input.notes?.trim() || null,
        },
      });
      await this.audit.log({
        actorId: admin.id, action: 'payment.register', entity: 'payment', entityId: p.id,
        after: { enrollmentId: e.id, amountCents, method: input.method, operationNumber: p.operationNumber, paidOn }, ip,
      }, tx);
    });

    await this.mail.notify(
      [e.student.user.email, ...e.student.guardians.map((g) => g.guardian.user.email)],
      `Pago confirmado: ${e.group.course.name}`,
      `Registramos el pago de ${soles(amountCents)} de ${e.student.user.fullName} para ${e.group.course.name} (grupo ${e.group.code}). ¡Gracias! El acceso al curso queda habilitado sin restricciones.`,
    );
    return { ok: true };
  }

  /** Vuelve la matrícula a "pendiente de pago": anula los pagos vigentes, con motivo. */
  async markPending(admin: AuthUser, enrollmentId: string, reason: string, ip?: string) {
    const e = await this.load(enrollmentId);
    if (!e.payments.length) throw new ConflictException({ code: 'NOT_PAID', message: 'Esta matrícula no tiene pagos registrados.' });
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.payment.updateMany({
        where: { enrollmentId: e.id, voidedAt: null },
        data: { voidedAt: now, voidReason: reason.trim() },
      });
      await this.audit.log({
        actorId: admin.id, action: 'payment.void', entity: 'enrollment', entityId: e.id,
        before: { payments: e.payments.map((p) => ({ id: p.id, amountCents: p.amountCents })) }, after: { reason }, ip,
      }, tx);
    });
    return { ok: true };
  }

  private async load(enrollmentId: string) {
    const e = await this.prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      include: {
        payments: { where: { voidedAt: null }, select: { id: true, amountCents: true } },
        group: { select: { code: true, course: { select: { name: true } } } },
        student: {
          select: {
            user: { select: { fullName: true, email: true } },
            guardians: { where: { status: 'APPROVED' }, select: { guardian: { select: { user: { select: { email: true } } } } } },
          },
        },
      },
    });
    if (!e) throw new NotFoundException();
    if (e.status !== 'APPROVED') throw new BadRequestException('Solo se registran pagos de matrículas aprobadas.');
    return e;
  }
}
