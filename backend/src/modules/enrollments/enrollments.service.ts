import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import type { AuthUser } from '../../common/auth/auth-user';
import type { EnrollmentStatus } from '../../generated/prisma/enums';
import { isMinor, paymentDeadline } from '../../common/access/course-access.policy';
import type { ApproveEnrollmentDto } from './dto';

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const soles = (cents: number) => `S/ ${(cents / 100).toFixed(2).replace(/\.00$/, '')}`;
const limaDate = (d: Date) => d.toLocaleDateString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: 'long', year: 'numeric' });

const PENDING: EnrollmentStatus[] = ['REQUESTED', 'PENDING_GUARDIAN'];

/**
 * Solicitudes de matrícula ANTERIORES.
 * Desde 2026-11-22 solo el administrador matricula (grupo → "Matricular alumno", o prematrícula);
 * los alumnos y apoderados ya no pueden pedir matrícula. Este servicio queda solo para que el admin
 * revise o cierre las solicitudes que se hicieron antes del cambio.
 */
@Injectable()
export class EnrollmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  // ───────────── Administrador ─────────────

  async list(status: EnrollmentStatus = 'REQUESTED') {
    const rows = await this.prisma.enrollment.findMany({
      where: { status, group: { deletedAt: null } },
      orderBy: { createdAt: 'asc' },
      take: 200,
      include: {
        student: {
          select: {
            birthDate: true,
            user: { select: { id: true, fullName: true, email: true, username: true, phone: true } },
            guardians: {
              where: { status: 'APPROVED' },
              select: { guardian: { select: { user: { select: { fullName: true, email: true, phone: true } } } } },
            },
          },
        },
        group: {
          select: {
            id: true, code: true, startDate: true, capacity: true,
            course: { select: { name: true, priceCents: true } },
            _count: { select: { enrollments: { where: { status: 'APPROVED' } } } },
          },
        },
      },
    });
    const requesterIds = [...new Set(rows.map((r) => r.requestedById))];
    const requesters = await this.prisma.user.findMany({ where: { id: { in: requesterIds } }, select: { id: true, fullName: true } });
    const nameOf = new Map(requesters.map((u) => [u.id, u.fullName]));
    const now = new Date();

    return rows.map((e) => ({
      id: e.id,
      status: e.status,
      createdAt: e.createdAt,
      reviewNotes: e.reviewNotes,
      student: { ...e.student.user, minor: isMinor(e.student.birthDate, now) },
      guardians: e.student.guardians.map((g) => g.guardian.user),
      requestedBy: e.requestedById === e.studentId ? null : nameOf.get(e.requestedById) ?? null,
      guardianApproved: !!e.guardianApprovedAt,
      course: e.group.course.name,
      priceCents: e.group.course.priceCents,
      group: { id: e.group.id, code: e.group.code, startDate: isoDay(e.group.startDate), capacity: e.group.capacity, approved: e.group._count.enrollments },
    }));
  }

  async approve(admin: AuthUser, enrollmentId: string, dto: ApproveEnrollmentDto, ip?: string) {
    const e = await this.findEnrollment(enrollmentId);
    if (e.status === 'PENDING_GUARDIAN') {
      throw new ConflictException({ code: 'GUARDIAN_PENDING', message: 'Falta la autorización del apoderado.' });
    }
    if (e.status !== 'REQUESTED') throw new ConflictException({ code: 'NOT_PENDING', message: 'La solicitud ya fue revisada.' });

    const student = await this.loadStudent(e.studentId);
    if (!student || student.status !== 'ACTIVE' || !student.roles.some((r) => r.role === 'STUDENT')) {
      throw new BadRequestException('La cuenta del alumno no está activa como alumno.');
    }
    if (isMinor(student.studentProfile?.birthDate ?? null, new Date()) && !student.studentProfile?.guardians.length) {
      throw new BadRequestException('El alumno es menor de edad y no tiene un apoderado aprobado. Aprueba primero el vínculo.');
    }
    const approved = await this.prisma.enrollment.count({ where: { groupId: e.groupId, status: 'APPROVED' } });
    if (approved >= e.group.capacity) throw new ConflictException({ code: 'GROUP_FULL', message: 'El grupo no tiene cupos disponibles.' });

    const priceCents = e.group.course.priceCents;
    const discountCents = Math.min(dto.discountCents ?? 0, priceCents);
    await this.prisma.$transaction(async (tx) => {
      await tx.enrollment.update({
        where: { id: e.id },
        data: { status: 'APPROVED', approvedById: admin.id, approvedAt: new Date(), priceCents, discountCents, reviewNotes: dto.notes ?? null },
      });
      await this.audit.log({
        actorId: admin.id, action: 'enrollment.approve', entity: 'enrollment', entityId: e.id,
        after: { groupId: e.groupId, studentId: e.studentId, priceCents, discountCents }, ip,
      }, tx);
    });

    const course = e.group.course.name;
    await this.mail.notify(
      [student.email, ...student.studentProfile!.guardians.map((g) => g.guardian.user.email)],
      `Matrícula aprobada: ${course}`,
      `La matrícula de ${student.fullName} en ${course} (grupo ${e.group.code}) fue aprobada.\n` +
        `Monto: ${soles(priceCents - discountCents)}. Plazo de pago: hasta el ${limaDate(paymentDeadline(e.group.startDate))}.\n` +
        'Envía tu comprobante por WhatsApp. Si el plazo vence sin pago, el acceso al curso se bloquea.',
    );
    return { ok: true };
  }

  async reject(admin: AuthUser, enrollmentId: string, notes: string | undefined, ip?: string) {
    const e = await this.findEnrollment(enrollmentId);
    if (!PENDING.includes(e.status)) throw new ConflictException({ code: 'NOT_PENDING', message: 'La solicitud ya fue revisada.' });
    await this.prisma.$transaction(async (tx) => {
      await tx.enrollment.update({ where: { id: e.id }, data: { status: 'REJECTED', reviewNotes: notes ?? null } });
      await this.audit.log({ actorId: admin.id, action: 'enrollment.reject', entity: 'enrollment', entityId: e.id, after: { notes: notes ?? null }, ip }, tx);
    });
    const student = await this.loadStudent(e.studentId);
    await this.mail.notify(
      [student?.email, ...(student?.studentProfile?.guardians.map((g) => g.guardian.user.email) ?? [])],
      `Sobre la matrícula en ${e.group.course.name}`,
      `No pudimos aprobar la matrícula de ${e.student.user.fullName} en ${e.group.course.name}.${notes ? `\nMotivo: ${notes}` : ''}\nEscríbenos por WhatsApp si necesitas ayuda.`,
    );
    return { ok: true };
  }

  // ───────────── Internos ─────────────

  private loadStudent(userId: string) {
    return this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        id: true, fullName: true, email: true, status: true,
        roles: { select: { role: true } },
        studentProfile: {
          select: {
            birthDate: true,
            guardians: { where: { status: 'APPROVED' }, select: { guardian: { select: { user: { select: { email: true } } } } } },
          },
        },
      },
    });
  }

  private async findEnrollment(id: string) {
    const e = await this.prisma.enrollment.findUnique({
      where: { id },
      include: {
        student: { select: { user: { select: { fullName: true, email: true } } } },
        group: { select: { code: true, startDate: true, capacity: true, course: { select: { name: true, priceCents: true } } } },
      },
    });
    if (!e) throw new NotFoundException();
    return e;
  }

  private async notifyAdmins(subject: string, text: string) {
    const admins = await this.prisma.user.findMany({
      where: { status: 'ACTIVE', deletedAt: null, roles: { some: { role: 'ADMIN' } } },
      select: { email: true },
    });
    await this.mail.notify(admins.map((a) => a.email), subject, text);
  }
}
