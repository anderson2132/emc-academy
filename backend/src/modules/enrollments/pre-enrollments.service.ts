import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import type { AuthUser } from '../../common/auth/auth-user';
import type { PreEnrollmentStatus } from '../../generated/prisma/enums';
import { normalizeLogin } from '../auth/crypto.util';
import type { CreatePreEnrollmentDto } from './dto';

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const scheduleText = (s: unknown) =>
  s && typeof s === 'object' && 'text' in s ? String((s as { text: unknown }).text) : null;

/**
 * Prematrículas: el admin registra a un alumno antes de que tenga cuenta.
 *  1. Admin crea la prematrícula con el correo de la persona.
 *  2. La persona crea su cuenta con ese correo; al estar VERIFICADO, ve la prematrícula y la reclama.
 *  3. Admin confirma la vinculación (o vincula a mano una cuenta existente) → se crea la matrícula aprobada.
 * Nunca se vincula sola por coincidencia de correo: siempre la confirma el admin.
 */
@Injectable()
export class PreEnrollmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  // ───────────── Administrador ─────────────

  async create(admin: AuthUser, dto: CreatePreEnrollmentDto, ip?: string) {
    const group = await this.prisma.academicGroup.findFirst({
      where: { id: dto.groupId, deletedAt: null },
      include: { course: { select: { name: true, priceCents: true } } },
    });
    if (!group) throw new NotFoundException({ code: 'GROUP_NOT_FOUND', message: 'Grupo no encontrado.' });
    if (group.status === 'CANCELLED' || group.status === 'FINISHED') {
      throw new BadRequestException('El grupo está cancelado o terminado.');
    }
    const email = normalizeLogin(dto.email);
    const dup = await this.prisma.preEnrollment.findFirst({ where: { groupId: group.id, email, status: { in: ['PENDING', 'CLAIMED'] } } });
    if (dup) throw new ConflictException({ code: 'ALREADY_EXISTS', message: 'Ya hay una prematrícula con ese correo en este grupo.' });

    const pre = await this.prisma.$transaction(async (tx) => {
      const p = await tx.preEnrollment.create({
        data: {
          groupId: group.id,
          fullName: dto.fullName.trim(),
          email,
          phone: dto.phone ?? null,
          birthDate: dto.birthDate ? new Date(`${dto.birthDate}T00:00:00.000Z`) : null,
          discountCents: Math.min(dto.discountCents ?? 0, group.course.priceCents),
          notes: dto.notes?.trim() || null,
          createdById: admin.id,
        },
      });
      await this.audit.log({ actorId: admin.id, action: 'pre_enrollment.create', entity: 'pre_enrollment', entityId: p.id, after: { groupId: group.id, email }, ip }, tx);
      return p;
    });

    const base = this.config.getOrThrow<string>('FRONTEND_URL').replace(/\/$/, '');
    await this.mail.notify(
      [email],
      `Tu matrícula en ${group.course.name} — EMC Academy`,
      `Hola ${pre.fullName}, te registramos en ${group.course.name} (grupo ${group.code}).\n` +
        `Para confirmarla, crea tu cuenta en ${base}/campus/login.html usando ESTE correo (${email}) y, desde tu panel, confirma la matrícula.`,
    );
    return { id: pre.id };
  }

  async list(status?: PreEnrollmentStatus) {
    const rows = await this.prisma.preEnrollment.findMany({
      where: status ? { status } : { status: { in: ['PENDING', 'CLAIMED'] } },
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
      take: 300,
      include: { group: { select: { id: true, code: true, startDate: true, course: { select: { name: true } } } } },
    });
    const claimerIds = [...new Set(rows.map((r) => r.claimedById ?? r.linkedUserId).filter((x): x is string => !!x))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: claimerIds } },
      select: { id: true, fullName: true, email: true, status: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    // Cuentas ya existentes con el mismo correo: ayudan al admin a vincular a mano.
    const sameEmail = await this.prisma.user.findMany({
      where: { email: { in: rows.filter((r) => r.status === 'PENDING').map((r) => r.email) }, deletedAt: null },
      select: { id: true, email: true, fullName: true, status: true },
    });
    const byEmail = new Map(sameEmail.map((u) => [u.email, u]));

    return rows.map((p) => ({
      id: p.id,
      status: p.status,
      fullName: p.fullName,
      email: p.email,
      phone: p.phone,
      birthDate: p.birthDate ? isoDay(p.birthDate) : null,
      discountCents: p.discountCents,
      notes: p.notes,
      createdAt: p.createdAt,
      course: p.group.course.name,
      group: { id: p.group.id, code: p.group.code, startDate: isoDay(p.group.startDate) },
      claimedBy: p.claimedById ? byId.get(p.claimedById) ?? null : null,
      linkedUser: p.linkedUserId ? byId.get(p.linkedUserId) ?? null : null,
      existingAccount: p.status === 'PENDING' ? byEmail.get(p.email) ?? null : null,
    }));
  }

  async cancel(admin: AuthUser, id: string, ip?: string) {
    const p = await this.find(id);
    if (p.status === 'LINKED' || p.status === 'CANCELLED') throw new ConflictException({ code: 'NOT_PENDING', message: 'La prematrícula ya fue cerrada.' });
    await this.prisma.preEnrollment.update({ where: { id }, data: { status: 'CANCELLED' } });
    await this.audit.log({ actorId: admin.id, action: 'pre_enrollment.cancel', entity: 'pre_enrollment', entityId: id, ip });
    return { ok: true };
  }

  async approveClaim(admin: AuthUser, id: string, ip?: string) {
    const p = await this.find(id);
    if (p.status !== 'CLAIMED' || !p.claimedById) throw new ConflictException({ code: 'NOT_CLAIMED', message: 'Nadie reclamó esta prematrícula todavía.' });
    return this.link(admin, p, p.claimedById, 'pre_enrollment.approve_claim', ip);
  }

  async rejectClaim(admin: AuthUser, id: string, notes: string | undefined, ip?: string) {
    const p = await this.find(id);
    if (p.status !== 'CLAIMED' || !p.claimedById) throw new ConflictException({ code: 'NOT_CLAIMED', message: 'Nadie reclamó esta prematrícula todavía.' });
    const claimer = await this.prisma.user.findUnique({ where: { id: p.claimedById }, select: { email: true, fullName: true } });
    await this.prisma.$transaction(async (tx) => {
      await tx.preEnrollment.update({ where: { id }, data: { status: 'PENDING', claimedById: null, claimedAt: null } });
      await this.audit.log({ actorId: admin.id, action: 'pre_enrollment.reject_claim', entity: 'pre_enrollment', entityId: id, after: { claimedById: p.claimedById, notes: notes ?? null }, ip }, tx);
    });
    await this.mail.notify([claimer?.email], 'Sobre tu matrícula en EMC Academy',
      `Hola ${claimer?.fullName ?? ''}, no pudimos confirmar la matrícula que reclamaste.${notes ? `\nMotivo: ${notes}` : ''}\nEscríbenos por WhatsApp si necesitas ayuda.`);
    return { ok: true };
  }

  /** El admin vincula a mano la prematrícula a una cuenta existente (p. ej. un menor creado por su apoderado). */
  async linkManually(admin: AuthUser, id: string, userId: string, ip?: string) {
    const p = await this.find(id);
    if (p.status !== 'PENDING' && p.status !== 'CLAIMED') throw new ConflictException({ code: 'NOT_PENDING', message: 'La prematrícula ya fue cerrada.' });
    return this.link(admin, p, userId, 'pre_enrollment.link_manual', ip);
  }

  // ───────────── Usuario ─────────────

  /** Prematrículas que coinciden con el correo VERIFICADO del usuario, más las que ya reclamó. */
  async mine(user: AuthUser) {
    const email = await this.verifiedEmail(user.id);
    const rows = await this.prisma.preEnrollment.findMany({
      where: {
        group: { deletedAt: null },
        OR: [
          ...(email ? [{ email, status: 'PENDING' as const }] : []),
          { claimedById: user.id, status: 'CLAIMED' as const },
        ],
      },
      orderBy: { createdAt: 'asc' },
      include: { group: { select: { code: true, startDate: true, schedule: true, course: { select: { name: true } } } } },
    });
    return rows.map((p) => ({
      id: p.id,
      status: p.status,
      fullName: p.fullName,
      course: p.group.course.name,
      group: { code: p.group.code, startDate: isoDay(p.group.startDate), schedule: scheduleText(p.group.schedule) },
    }));
  }

  async claim(user: AuthUser, id: string, ip?: string) {
    const p = await this.find(id);
    const email = await this.verifiedEmail(user.id);
    if (!email || p.email !== email) throw new NotFoundException();
    if (p.status !== 'PENDING') throw new ConflictException({ code: 'NOT_PENDING', message: 'Esta matrícula ya no está disponible para confirmar.' });
    if (user.status !== 'ACTIVE' && user.status !== 'PENDING_APPROVAL') {
      throw new ForbiddenException({ code: 'INVALID_STATE', message: 'Tu cuenta no puede reclamar matrículas.' });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.preEnrollment.update({ where: { id }, data: { status: 'CLAIMED', claimedById: user.id, claimedAt: new Date() } });
      // Si la cuenta aún no pidió perfil, la prematrícula cuenta como solicitud de alumno.
      if (user.status === 'PENDING_APPROVAL') {
        const pending = await tx.accountRequest.findFirst({ where: { userId: user.id, status: 'PENDING' } });
        if (!pending) {
          await tx.studentProfile.upsert({
            where: { userId: user.id },
            create: { userId: user.id, birthDate: p.birthDate },
            update: {},
          });
          if (p.phone) await tx.user.update({ where: { id: user.id }, data: { phone: p.phone } });
          await tx.accountRequest.create({ data: { userId: user.id, requestedRole: 'STUDENT' } });
        }
      }
      await this.audit.log({ actorId: user.id, action: 'pre_enrollment.claim', entity: 'pre_enrollment', entityId: id, ip }, tx);
    });
    const admins = await this.prisma.user.findMany({ where: { status: 'ACTIVE', deletedAt: null, roles: { some: { role: 'ADMIN' } } }, select: { email: true } });
    await this.mail.notify(admins.map((a) => a.email), 'Prematrícula reclamada',
      `${user.fullName} (${email}) confirmó la prematrícula de ${p.fullName} en ${p.group.course.name}. Verifícala en el Campus Virtual.`);
    return { ok: true };
  }

  // ───────────── Internos ─────────────

  private async find(id: string) {
    const p = await this.prisma.preEnrollment.findUnique({
      where: { id },
      include: { group: { select: { id: true, code: true, capacity: true, deletedAt: true, course: { select: { name: true, priceCents: true } } } } },
    });
    if (!p || p.group.deletedAt) throw new NotFoundException();
    return p;
  }

  private async verifiedEmail(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true, emailVerifiedAt: true } });
    return u?.email && u.emailVerifiedAt ? u.email : null;
  }

  /**
   * Crea la matrícula APROBADA para la cuenta. Si la cuenta seguía pendiente de aprobación,
   * el admin la aprueba en el mismo paso como alumno (está verificando a esa persona).
   */
  private async link(admin: AuthUser, p: Awaited<ReturnType<PreEnrollmentsService['find']>>, userId: string, action: string, ip?: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null }, include: { roles: true } });
    if (!user) throw new NotFoundException('Usuario no encontrado.');
    if (user.status !== 'ACTIVE' && user.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException(`La cuenta de ${user.fullName} no está activa ni pendiente de aprobación.`);
    }

    const [approved, existing] = await Promise.all([
      this.prisma.enrollment.count({ where: { groupId: p.groupId, status: 'APPROVED' } }),
      this.prisma.enrollment.findUnique({ where: { studentId_groupId: { studentId: userId, groupId: p.groupId } } }),
    ]);
    const alreadyIn = existing?.status === 'APPROVED';
    if (!alreadyIn && approved >= p.group.capacity) throw new ConflictException({ code: 'GROUP_FULL', message: 'El grupo no tiene cupos disponibles.' });

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      if (user.status === 'PENDING_APPROVAL') {
        await tx.user.update({ where: { id: userId }, data: { status: 'ACTIVE' } });
        await tx.accountRequest.updateMany({
          where: { userId, status: 'PENDING', requestedRole: 'STUDENT' },
          data: { status: 'APPROVED', reviewedById: admin.id, reviewedAt: now, reviewNotes: 'Aprobada al vincular la prematrícula.' },
        });
      }
      if (!user.roles.some((r) => r.role === 'STUDENT')) {
        await tx.userRole.create({ data: { userId, role: 'STUDENT' } });
      }
      const profile = await tx.studentProfile.upsert({ where: { userId }, create: { userId, birthDate: p.birthDate }, update: {} });
      if (!profile.birthDate && p.birthDate) await tx.studentProfile.update({ where: { userId }, data: { birthDate: p.birthDate } });

      if (!alreadyIn) {
        const data = {
          status: 'APPROVED' as const,
          requestedById: admin.id,
          approvedById: admin.id,
          approvedAt: now,
          priceCents: p.group.course.priceCents,
          discountCents: p.discountCents,
          manualBlock: false,
          blockReason: null,
          reviewNotes: 'Prematrícula registrada por administración.',
        };
        if (existing) await tx.enrollment.update({ where: { id: existing.id }, data });
        else await tx.enrollment.create({ data: { studentId: userId, groupId: p.groupId, ...data } });
      }
      await tx.preEnrollment.update({ where: { id: p.id }, data: { status: 'LINKED', linkedUserId: userId, linkedAt: now } });
      await this.audit.log({
        actorId: admin.id, action, entity: 'pre_enrollment', entityId: p.id,
        after: { userId, groupId: p.groupId, activatedAccount: user.status === 'PENDING_APPROVAL' }, ip,
      }, tx);
    });

    await this.mail.notify([user.email], `Matrícula confirmada: ${p.group.course.name}`,
      `Hola ${user.fullName}, tu matrícula en ${p.group.course.name} (grupo ${p.group.code}) quedó confirmada. Ya puedes verla en tu Campus Virtual.`);
    return { ok: true };
  }
}
