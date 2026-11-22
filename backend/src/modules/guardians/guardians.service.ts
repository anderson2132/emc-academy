import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { AcademicService } from '../academic/academic.service';
import type { AuthUser } from '../../common/auth/auth-user';
import type { GuardianLinkStatus } from '../../generated/prisma/enums';
import { isMinor } from '../../common/access/course-access.policy';
import { hashPassword, normalizeLogin } from '../auth/crypto.util';
import { AuthorizeLinkDto, CONSENT_VERSION, CreateChildDto } from './dto';

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Vínculo apoderado ↔ alumno (docs/04-flujos.md §2).
 *  A) El apoderado registra a su hijo: se crea la cuenta del menor y el vínculo PENDING_ADMIN (ya con consentimiento).
 *  B) El alumno agrega a su apoderado por correo: vínculo PENDING_GUARDIAN → el apoderado autoriza → PENDING_ADMIN.
 *  El admin aprueba el vínculo (y, si la cuenta del menor seguía pendiente, también la cuenta).
 * El apoderado solo VE a sus hijos con vínculo APPROVED; no modifica nada académico.
 */
@Injectable()
export class GuardiansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly academic: AcademicService,
  ) {}

  // ───────────── Apoderado ─────────────

  async children(user: AuthUser) {
    const links = await this.prisma.studentGuardian.findMany({
      where: { guardianId: user.id, status: { not: 'REVOKED' } },
      orderBy: { createdAt: 'asc' },
      include: {
        student: {
          select: {
            birthDate: true,
            user: { select: { id: true, fullName: true, email: true, username: true, status: true } },
          },
        },
      },
    });

    const now = new Date();
    return Promise.all(links.map(async (l) => {
      const approved = l.status === 'APPROVED';
      const pending = approved
        ? await this.prisma.enrollment.findMany({
            where: { studentId: l.studentId, status: { in: ['PENDING_GUARDIAN', 'REQUESTED'] }, group: { deletedAt: null } },
            orderBy: { createdAt: 'asc' },
            include: { group: { select: { code: true, startDate: true, course: { select: { name: true } } } } },
          })
        : [];
      return {
        student: l.student.user,
        birthDate: l.student.birthDate ? isoDay(l.student.birthDate) : null,
        minor: isMinor(l.student.birthDate, now),
        relationship: l.relationship,
        linkStatus: l.status,
        // Solo con vínculo aprobado se muestra información académica.
        courses: approved ? await this.academic.studentCourses(l.studentId, { includeZoom: false }) : [],
        requests: pending.map((e) => ({
          id: e.id,
          status: e.status,
          course: e.group.course.name,
          group: { code: e.group.code, startDate: isoDay(e.group.startDate) },
        })),
      };
    }));
  }

  /** El apoderado registra a su hijo: cuenta del menor (correo o usuario) + vínculo con consentimiento. */
  async createChild(user: AuthUser, dto: CreateChildDto, ip?: string) {
    const email = dto.email ? normalizeLogin(dto.email) : null;
    const username = dto.username ? normalizeLogin(dto.username) : null;
    if (!email && !username) throw new BadRequestException('Indica un correo o un nombre de usuario para tu hijo.');
    const birthDate = new Date(`${dto.birthDate}T00:00:00.000Z`);
    if (birthDate > new Date()) throw new BadRequestException('Fecha de nacimiento inválida');

    if (email && (await this.prisma.user.findUnique({ where: { email } }))) {
      throw new ConflictException({
        code: 'EMAIL_IN_USE',
        message: 'Ese correo ya tiene una cuenta. Si es de tu hijo, pídele que te agregue como apoderado desde su panel.',
      });
    }
    if (username && (await this.prisma.user.findUnique({ where: { username } }))) {
      throw new ConflictException({ code: 'USERNAME_IN_USE', message: 'Ese nombre de usuario ya está en uso. Elige otro.' });
    }

    const passwordHash = await hashPassword(dto.password);
    const child = await this.prisma.$transaction(async (tx) => {
      const c = await tx.user.create({
        data: {
          email,
          username,
          fullName: dto.fullName.trim(),
          passwordHash,
          status: 'PENDING_APPROVAL',
          managedByGuardianId: user.id,
        },
      });
      await tx.studentProfile.create({ data: { userId: c.id, birthDate } });
      await tx.accountRequest.create({ data: { userId: c.id, requestedRole: 'STUDENT' } });
      await tx.studentGuardian.create({
        data: {
          studentId: c.id,
          guardianId: user.id,
          relationship: dto.relationship?.trim() || null,
          status: 'PENDING_ADMIN',
          consentAt: new Date(),
          consentVersion: CONSENT_VERSION,
          consentIp: ip ?? null,
        },
      });
      await this.audit.log({
        actorId: user.id, action: 'guardian.create_child', entity: 'user', entityId: c.id,
        after: { email, username, consentVersion: CONSENT_VERSION }, ip,
      }, tx);
      return c;
    });

    await this.notifyAdmins('Nuevo alumno registrado por su apoderado',
      `${user.fullName} registró a ${child.fullName}. Revisa el vínculo en el Campus Virtual.`);
    return { id: child.id, login: email ?? username };
  }

  /** El apoderado autoriza el vínculo que pidió su hijo. */
  async authorize(user: AuthUser, studentId: string, dto: AuthorizeLinkDto, ip?: string) {
    const link = await this.findLink(studentId, user.id);
    if (link.status !== 'PENDING_GUARDIAN') throw new ConflictException({ code: 'NOT_PENDING', message: 'Este vínculo no espera tu autorización.' });
    await this.prisma.$transaction(async (tx) => {
      await tx.studentGuardian.update({
        where: { studentId_guardianId: { studentId, guardianId: user.id } },
        data: {
          status: 'PENDING_ADMIN',
          relationship: dto.relationship?.trim() || link.relationship,
          consentAt: new Date(),
          consentVersion: CONSENT_VERSION,
          consentIp: ip ?? null,
        },
      });
      await this.audit.log({ actorId: user.id, action: 'guardian.authorize_link', entity: 'student_guardian', entityId: studentId, after: { consentVersion: CONSENT_VERSION }, ip }, tx);
    });
    await this.notifyAdmins('Vínculo apoderado–alumno por aprobar',
      `${user.fullName} autorizó su vínculo con ${link.student.user.fullName}. Revísalo en el Campus Virtual.`);
    return { ok: true };
  }

  async decline(user: AuthUser, studentId: string, ip?: string) {
    const link = await this.findLink(studentId, user.id);
    if (link.status !== 'PENDING_GUARDIAN') throw new ConflictException({ code: 'NOT_PENDING', message: 'Este vínculo no espera tu autorización.' });
    await this.prisma.studentGuardian.update({ where: { studentId_guardianId: { studentId, guardianId: user.id } }, data: { status: 'REVOKED' } });
    await this.audit.log({ actorId: user.id, action: 'guardian.decline_link', entity: 'student_guardian', entityId: studentId, ip });
    await this.mail.notify([link.student.user.email], 'Sobre tu apoderado en EMC Academy',
      `Hola ${link.student.user.fullName}, ${user.fullName} no confirmó el vínculo como tu apoderado.`);
    return { ok: true };
  }

  // ───────────── Alumno ─────────────

  async myGuardians(user: AuthUser) {
    const links = await this.prisma.studentGuardian.findMany({
      where: { studentId: user.id, status: { not: 'REVOKED' } },
      orderBy: { createdAt: 'asc' },
      include: { guardian: { select: { user: { select: { fullName: true, email: true } } } } },
    });
    return links.map((l) => ({ guardian: l.guardian.user, relationship: l.relationship, status: l.status }));
  }

  /** El alumno agrega a su apoderado por correo (el apoderado debe tener cuenta de apoderado). */
  async addGuardian(user: AuthUser, rawEmail: string, ip?: string) {
    const profile = await this.prisma.studentProfile.findUnique({ where: { userId: user.id } });
    if (!profile) {
      throw new ForbiddenException({ code: 'NOT_A_STUDENT', message: 'Primero completa tu solicitud de cuenta como alumno.' });
    }
    const email = normalizeLogin(rawEmail);
    const guardian = await this.prisma.user.findFirst({
      where: { email, deletedAt: null, status: { in: ['ACTIVE', 'PENDING_APPROVAL'] }, guardianProfile: { isNot: null } },
      select: { id: true, fullName: true, email: true },
    });
    if (!guardian) {
      throw new NotFoundException({
        code: 'GUARDIAN_NOT_FOUND',
        message: 'No encontramos una cuenta de apoderado con ese correo. Pídele que se registre en el campus como "Apoderado" y vuelve a intentarlo.',
      });
    }
    if (guardian.id === user.id) throw new BadRequestException('No puedes ser tu propio apoderado.');

    const key = { studentId_guardianId: { studentId: user.id, guardianId: guardian.id } };
    const existing = await this.prisma.studentGuardian.findUnique({ where: key });
    if (existing && existing.status !== 'REVOKED') {
      throw new ConflictException({ code: 'LINK_EXISTS', message: 'Ya enviaste una solicitud a ese apoderado.' });
    }
    const data = { status: 'PENDING_GUARDIAN' as const, consentAt: null, consentVersion: null, consentIp: null };
    await this.prisma.$transaction(async (tx) => {
      if (existing) await tx.studentGuardian.update({ where: key, data });
      else await tx.studentGuardian.create({ data: { studentId: user.id, guardianId: guardian.id, ...data } });
      await this.audit.log({ actorId: user.id, action: 'student.add_guardian', entity: 'student_guardian', entityId: user.id, after: { guardianId: guardian.id }, ip }, tx);
    });
    await this.mail.notify([guardian.email], `${user.fullName} te agregó como apoderado`,
      `Hola ${guardian.fullName}, ${user.fullName} te indicó como su apoderado en EMC Academy.\nIngresa al Campus Virtual para autorizarlo.`);
    return { ok: true, guardian: { fullName: guardian.fullName } };
  }

  // ───────────── Administrador ─────────────

  async listLinks(status: GuardianLinkStatus = 'PENDING_ADMIN') {
    const links = await this.prisma.studentGuardian.findMany({
      where: { status },
      orderBy: { updatedAt: 'asc' },
      take: 200,
      include: {
        student: { select: { birthDate: true, user: { select: { id: true, fullName: true, email: true, username: true, status: true } } } },
        guardian: {
          select: {
            documentType: true, documentNumber: true,
            user: { select: { id: true, fullName: true, email: true, phone: true, status: true, roles: { select: { role: true } } } },
          },
        },
      },
    });
    const now = new Date();
    return links.map((l) => ({
      student: { ...l.student.user, birthDate: l.student.birthDate ? isoDay(l.student.birthDate) : null, minor: isMinor(l.student.birthDate, now) },
      guardian: {
        id: l.guardian.user.id,
        fullName: l.guardian.user.fullName,
        email: l.guardian.user.email,
        phone: l.guardian.user.phone,
        status: l.guardian.user.status,
        isGuardian: l.guardian.user.roles.some((r) => r.role === 'GUARDIAN'),
        document: l.guardian.documentNumber ? `${l.guardian.documentType ?? ''} ${l.guardian.documentNumber}`.trim() : null,
      },
      relationship: l.relationship,
      status: l.status,
      consentAt: l.consentAt,
      createdAt: l.createdAt,
    }));
  }

  async approveLink(admin: AuthUser, studentId: string, guardianId: string, ip?: string) {
    const link = await this.findLink(studentId, guardianId);
    if (link.status !== 'PENDING_ADMIN') throw new ConflictException({ code: 'NOT_PENDING', message: 'El vínculo no está pendiente de aprobación.' });

    const guardian = await this.prisma.user.findUnique({ where: { id: guardianId }, include: { roles: true } });
    if (!guardian || guardian.status !== 'ACTIVE' || !guardian.roles.some((r) => r.role === 'GUARDIAN')) {
      throw new BadRequestException('Primero aprueba la cuenta del apoderado.');
    }
    const student = await this.prisma.user.findUnique({ where: { id: studentId }, include: { roles: true } });
    if (!student || (student.status !== 'ACTIVE' && student.status !== 'PENDING_APPROVAL')) {
      throw new BadRequestException('La cuenta del alumno no está activa ni pendiente de aprobación.');
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.studentGuardian.update({ where: { studentId_guardianId: { studentId, guardianId } }, data: { status: 'APPROVED' } });
      // Al aprobar el vínculo, el admin aprueba también la cuenta del menor que seguía pendiente.
      if (student.status === 'PENDING_APPROVAL') {
        await tx.user.update({ where: { id: studentId }, data: { status: 'ACTIVE' } });
        await tx.accountRequest.updateMany({
          where: { userId: studentId, status: 'PENDING', requestedRole: 'STUDENT' },
          data: { status: 'APPROVED', reviewedById: admin.id, reviewedAt: now, reviewNotes: 'Aprobada junto con el vínculo del apoderado.' },
        });
      }
      if (!student.roles.some((r) => r.role === 'STUDENT')) {
        await tx.userRole.create({ data: { userId: studentId, role: 'STUDENT' } });
      }
      await this.audit.log({
        actorId: admin.id, action: 'guardian_link.approve', entity: 'student_guardian', entityId: studentId,
        after: { guardianId, activatedStudent: student.status === 'PENDING_APPROVAL' }, ip,
      }, tx);
    });

    await this.mail.notify([guardian.email, student.email], 'Vínculo de apoderado aprobado',
      `El vínculo entre ${guardian.fullName} (apoderado) y ${student.fullName} (alumno) fue aprobado. Ya pueden verlo en el Campus Virtual.`);
    return { ok: true };
  }

  async revokeLink(admin: AuthUser, studentId: string, guardianId: string, reason: string | undefined, ip?: string) {
    const link = await this.findLink(studentId, guardianId);
    if (link.status === 'REVOKED') throw new ConflictException({ code: 'ALREADY_REVOKED', message: 'El vínculo ya está anulado.' });
    await this.prisma.$transaction(async (tx) => {
      await tx.studentGuardian.update({ where: { studentId_guardianId: { studentId, guardianId } }, data: { status: 'REVOKED' } });
      await this.audit.log({
        actorId: admin.id, action: link.status === 'APPROVED' ? 'guardian_link.revoke' : 'guardian_link.reject',
        entity: 'student_guardian', entityId: studentId, before: { status: link.status }, after: { guardianId, reason: reason ?? null }, ip,
      }, tx);
    });
    await this.mail.notify([link.guardian.user.email], 'Sobre el vínculo con tu hijo en EMC Academy',
      `No pudimos aprobar (o se anuló) el vínculo con ${link.student.user.fullName}.${reason ? `\nMotivo: ${reason}` : ''}\nEscríbenos por WhatsApp si necesitas ayuda.`);
    return { ok: true };
  }

  // ───────────── Internos ─────────────

  private async findLink(studentId: string, guardianId: string) {
    const link = await this.prisma.studentGuardian.findUnique({
      where: { studentId_guardianId: { studentId, guardianId } },
      include: {
        student: { select: { user: { select: { fullName: true, email: true } } } },
        guardian: { select: { user: { select: { fullName: true, email: true } } } },
      },
    });
    if (!link) throw new NotFoundException();
    return link;
  }

  private async notifyAdmins(subject: string, text: string) {
    const admins = await this.prisma.user.findMany({
      where: { status: 'ACTIVE', deletedAt: null, roles: { some: { role: 'ADMIN' } } },
      select: { email: true },
    });
    await this.mail.notify(admins.map((a) => a.email), subject, text);
  }
}
