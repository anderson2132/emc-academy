import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import type { AuthUser } from '../../common/auth/auth-user';
import type { EnrollmentStatus } from '../../generated/prisma/enums';
import { isMinor, paymentDeadline } from '../../common/access/course-access.policy';
import {
  decideEnrollmentRequest,
  ENROLLMENT_REQUEST_MESSAGES,
  EnrollmentRequestDenyReason,
} from '../../common/access/enrollment-request.policy';
import type { ApproveEnrollmentDto, RequestEnrollmentDto } from './dto';

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const soles = (cents: number) => `S/ ${(cents / 100).toFixed(2).replace(/\.00$/, '')}`;
const limaDate = (d: Date) => d.toLocaleDateString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: 'long', year: 'numeric' });

const CONFLICT_REASONS: EnrollmentRequestDenyReason[] = ['GROUP_FULL', 'ALREADY_REQUESTED', 'ALREADY_ENROLLED'];
const PENDING: EnrollmentStatus[] = ['REQUESTED', 'PENDING_GUARDIAN'];

/**
 * Solicitudes de matrícula (segunda aprobación del administrador).
 * Alumno adulto → admin. Menor → apoderado → admin. Apoderado para su hijo → admin.
 */
@Injectable()
export class EnrollmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  // ───────────── Alumno / apoderado ─────────────

  async request(user: AuthUser, dto: RequestEnrollmentDto, ip?: string) {
    const requester = dto.studentId && dto.studentId !== user.id ? 'GUARDIAN' : 'SELF';
    if (requester === 'GUARDIAN' && !user.roles.includes('GUARDIAN')) {
      throw new ForbiddenException({ code: 'NOT_YOUR_CHILD', message: ENROLLMENT_REQUEST_MESSAGES.NOT_YOUR_CHILD });
    }
    if (requester === 'SELF' && !user.roles.includes('STUDENT')) {
      throw new ForbiddenException({ code: 'NOT_A_STUDENT', message: 'Tu cuenta no es de alumno. Si eres apoderado, elige a cuál de tus hijos inscribir.' });
    }
    const studentId = dto.studentId ?? user.id;

    const [student, group, link, existing] = await Promise.all([
      this.loadStudent(studentId),
      this.prisma.academicGroup.findFirst({
        where: { id: dto.groupId, deletedAt: null },
        include: { course: { select: { name: true, priceCents: true } } },
      }),
      requester === 'GUARDIAN'
        ? this.prisma.studentGuardian.findUnique({ where: { studentId_guardianId: { studentId, guardianId: user.id } } })
        : null,
      this.prisma.enrollment.findUnique({ where: { studentId_groupId: { studentId, groupId: dto.groupId } } }),
    ]);
    if (!group) throw new NotFoundException({ code: 'GROUP_NOT_FOUND', message: 'Grupo no encontrado.' });
    const approvedCount = await this.prisma.enrollment.count({ where: { groupId: group.id, status: 'APPROVED' } });

    const decision = decideEnrollmentRequest({
      now: new Date(),
      requester,
      student: {
        isActiveStudent: !!student && student.status === 'ACTIVE' && student.roles.some((r) => r.role === 'STUDENT') && !!student.studentProfile,
        birthDate: student?.studentProfile?.birthDate ?? null,
        hasApprovedGuardian: !!student?.studentProfile?.guardians.length,
      },
      guardianLinkApproved: link?.status === 'APPROVED',
      group: { status: group.status, capacity: group.capacity, approvedCount },
      existing: existing?.status ?? null,
    });
    if (!decision.allowed) {
      const body = { code: decision.reason, message: ENROLLMENT_REQUEST_MESSAGES[decision.reason] };
      if (CONFLICT_REASONS.includes(decision.reason)) throw new ConflictException(body);
      throw new ForbiddenException(body);
    }

    const now = new Date();
    const data = {
      status: decision.status,
      requestedById: user.id,
      priceCents: group.course.priceCents,
      discountCents: 0,
      manualBlock: false,
      blockReason: null,
      approvedById: null,
      approvedAt: null,
      guardianApprovedById: requester === 'GUARDIAN' ? user.id : null,
      guardianApprovedAt: requester === 'GUARDIAN' ? now : null,
      reviewNotes: null,
    };
    const enrollment = await this.prisma.$transaction(async (tx) => {
      const e = existing
        ? await tx.enrollment.update({ where: { id: existing.id }, data })
        : await tx.enrollment.create({ data: { studentId, groupId: group.id, ...data } });
      await this.audit.log({
        actorId: user.id, action: 'enrollment.request', entity: 'enrollment', entityId: e.id,
        after: { groupId: group.id, studentId, status: decision.status, requester }, ip,
      }, tx);
      return e;
    });

    const studentName = student!.fullName;
    if (decision.status === 'PENDING_GUARDIAN') {
      await this.mail.notify(
        student!.studentProfile!.guardians.map((g) => g.guardian.user.email),
        `${studentName} quiere inscribirse en ${group.course.name}`,
        `${studentName} pidió inscribirse en ${group.course.name} (grupo ${group.code}, inicia el ${limaDate(group.startDate)}).\nIngresa al Campus Virtual para autorizar o rechazar la solicitud.`,
      );
    } else {
      await this.notifyAdmins(
        `Nueva solicitud de matrícula: ${group.course.name}`,
        `${studentName} pidió matrícula en ${group.course.name} (grupo ${group.code}). Revísala en el Campus Virtual.`,
      );
    }
    return { id: enrollment.id, status: enrollment.status };
  }

  /** Solicitudes propias y las hechas para los hijos (todas menos las ya aprobadas, que están en "Mis cursos"). */
  async mine(user: AuthUser) {
    const rows = await this.prisma.enrollment.findMany({
      where: {
        status: { not: 'APPROVED' },
        OR: [{ studentId: user.id }, { requestedById: user.id }],
        group: { deletedAt: null },
      },
      orderBy: { updatedAt: 'desc' },
      take: 30,
      include: {
        student: { select: { user: { select: { id: true, fullName: true } } } },
        group: { select: { code: true, startDate: true, course: { select: { name: true } } } },
      },
    });
    return rows.map((e) => ({
      id: e.id,
      status: e.status,
      reviewNotes: e.reviewNotes,
      createdAt: e.createdAt,
      student: e.student.user,
      forMe: e.studentId === user.id,
      course: e.group.course.name,
      group: { code: e.group.code, startDate: isoDay(e.group.startDate) },
    }));
  }

  async cancel(user: AuthUser, enrollmentId: string, ip?: string) {
    const e = await this.findEnrollment(enrollmentId);
    const isGuardian = await this.isApprovedGuardian(user.id, e.studentId);
    if (e.studentId !== user.id && e.requestedById !== user.id && !isGuardian) throw new NotFoundException();
    if (!PENDING.includes(e.status)) throw new ConflictException({ code: 'NOT_PENDING', message: 'Solo se pueden anular solicitudes en curso.' });
    await this.prisma.enrollment.update({ where: { id: e.id }, data: { status: 'CANCELLED' } });
    await this.audit.log({ actorId: user.id, action: 'enrollment.cancel_request', entity: 'enrollment', entityId: e.id, ip });
    return { ok: true };
  }

  /** El apoderado autoriza (o no) la solicitud que hizo su hijo menor. */
  async guardianDecision(user: AuthUser, enrollmentId: string, approve: boolean, ip?: string) {
    const e = await this.findEnrollment(enrollmentId);
    if (!(await this.isApprovedGuardian(user.id, e.studentId))) throw new NotFoundException();
    if (e.status !== 'PENDING_GUARDIAN') throw new ConflictException({ code: 'NOT_PENDING', message: 'Esta solicitud no espera tu autorización.' });

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.enrollment.update({
        where: { id: e.id },
        data: approve
          ? { status: 'REQUESTED', guardianApprovedById: user.id, guardianApprovedAt: now }
          : { status: 'REJECTED', reviewNotes: 'No autorizada por el apoderado.' },
      });
      await this.audit.log({
        actorId: user.id, action: approve ? 'enrollment.guardian_approve' : 'enrollment.guardian_reject',
        entity: 'enrollment', entityId: e.id, ip,
      }, tx);
    });

    const course = e.group.course.name;
    await this.mail.notify(
      [e.student.user.email],
      approve ? `Tu apoderado autorizó tu inscripción en ${course}` : `Tu inscripción en ${course} no fue autorizada`,
      approve
        ? `Hola ${e.student.user.fullName}, tu apoderado autorizó tu solicitud. Ahora la revisará el administrador.`
        : `Hola ${e.student.user.fullName}, tu apoderado no autorizó tu solicitud para ${course}.`,
    );
    if (approve) {
      await this.notifyAdmins(`Nueva solicitud de matrícula: ${course}`, `${e.student.user.fullName} (menor, autorizado por su apoderado) pidió matrícula en ${course}. Revísala en el Campus Virtual.`);
    }
    return { ok: true };
  }

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

  private async isApprovedGuardian(guardianId: string, studentId: string) {
    const link = await this.prisma.studentGuardian.findUnique({ where: { studentId_guardianId: { studentId, guardianId } } });
    return link?.status === 'APPROVED';
  }

  private async notifyAdmins(subject: string, text: string) {
    const admins = await this.prisma.user.findMany({
      where: { status: 'ACTIVE', deletedAt: null, roles: { some: { role: 'ADMIN' } } },
      select: { email: true },
    });
    await this.mail.notify(admins.map((a) => a.email), subject, text);
  }
}
