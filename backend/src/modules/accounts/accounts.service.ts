import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService, PrismaTx } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { AuthService } from '../auth/auth.service';
import type { AuthUser } from '../../common/auth/auth-user';
import type { RequestStatus, Role, UserStatus } from '../../generated/prisma/enums';
import type { CreateAccountRequestDto } from './dto';
import { decideRoleChange, ROLE_CHANGE_MESSAGES } from '../../common/access/role-change.policy';

const ROLE_LABEL = { STUDENT: 'alumno', GUARDIAN: 'apoderado', TEACHER: 'docente', ADMIN: 'administrador' } as const;

function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}

/**
 * Cuentas: el usuario solicita un perfil (alumno, apoderado o docente)
 * y el administrador la aprueba o rechaza (primera de las dos aprobaciones).
 */
@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly auth: AuthService,
  ) {}

  // ───────────── Lado del usuario ─────────────

  async createRequest(user: AuthUser, dto: CreateAccountRequestDto) {
    if (user.status !== 'PENDING_APPROVAL') {
      throw new ForbiddenException({ code: 'INVALID_STATE', message: 'Tu cuenta no está pendiente de aprobación.' });
    }
    const pending = await this.prisma.accountRequest.findFirst({ where: { userId: user.id, status: 'PENDING' } });
    if (pending) throw new ConflictException({ code: 'REQUEST_EXISTS', message: 'Ya tienes una solicitud en revisión.' });

    if (dto.role === 'STUDENT' && dto.birthDate && new Date(dto.birthDate) > new Date()) {
      throw new BadRequestException('Fecha de nacimiento inválida');
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.phone) await tx.user.update({ where: { id: user.id }, data: { phone: dto.phone } });
      await this.upsertProfile(tx, user, dto);
      const request = await tx.accountRequest.create({ data: { userId: user.id, requestedRole: dto.role } });
      await this.audit.log({ actorId: user.id, action: 'account_request.create', entity: 'account_request', entityId: request.id, after: { role: dto.role } }, tx);
      return request;
    });
  }

  myRequests(userId: string) {
    return this.prisma.accountRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, requestedRole: true, status: true, reviewNotes: true, createdAt: true, reviewedAt: true },
    });
  }

  // ───────────── Lado del administrador ─────────────

  listRequests(status: RequestStatus = 'PENDING') {
    return this.prisma.accountRequest.findMany({
      where: { status },
      orderBy: { createdAt: 'asc' },
      include: {
        user: {
          select: {
            id: true, email: true, username: true, fullName: true, phone: true, status: true, createdAt: true,
            studentProfile: { select: { birthDate: true } },
            guardianProfile: { select: { documentType: true, documentNumber: true } },
          },
        },
      },
    });
  }

  /** Aprueba la cuenta. El admin decide el rol final (puede ser distinto al que pidió el usuario). */
  async approve(admin: AuthUser, requestId: string, notes: string | undefined, role: Role | undefined, ip?: string) {
    const request = await this.findPending(requestId);
    const granted = role ?? request.requestedRole;

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.accountRequest.update({
        where: { id: request.id },
        data: { status: 'APPROVED', reviewedById: admin.id, reviewedAt: new Date(), reviewNotes: notes },
      });
      await tx.userRole.upsert({
        where: { userId_role: { userId: request.userId, role: granted } },
        create: { userId: request.userId, role: granted },
        update: {},
      });
      await this.ensureProfile(tx, request.userId, request.user.fullName, granted);
      await tx.user.update({ where: { id: request.userId }, data: { status: 'ACTIVE' } });
      await this.audit.log({
        actorId: admin.id, action: 'account_request.approve', entity: 'account_request', entityId: request.id,
        after: { userId: request.userId, requestedRole: request.requestedRole, grantedRole: granted }, ip,
      }, tx);
      return updated;
    });

    if (request.user.email) {
      await this.mail.send({
        to: request.user.email,
        subject: 'Tu cuenta de EMC Academy fue aprobada',
        text: `Hola ${request.user.fullName}, tu cuenta fue aprobada con el rol de ${ROLE_LABEL[granted]}. Ya puedes ingresar al Campus Virtual.`,
      });
    }
    return result;
  }

  /** Dar un rol a una cuenta activa (incluido ADMIN). */
  async addRole(admin: AuthUser, userId: string, role: Role, reason: string, ip?: string) {
    const target = await this.loadForRoleChange(userId);
    await this.checkRoleChange(admin, target, 'ADD', role);
    await this.prisma.$transaction(async (tx) => {
      await tx.userRole.create({ data: { userId, role } });
      await this.ensureProfile(tx, userId, target.fullName, role);
      await this.audit.log({ actorId: admin.id, action: 'user.add_role', entity: 'user', entityId: userId, before: { roles: target.roles }, after: { role, reason }, ip }, tx);
    });
    await this.mail.notify([target.email], 'Cambio de rol en EMC Academy',
      `Hola ${target.fullName}, ahora tienes el rol de ${ROLE_LABEL[role]} en el Campus Virtual.`);
    return { ok: true };
  }

  /** Quitar un rol. Los datos (perfil, matrículas, grupos) se conservan; solo deja de tener acceso por ese rol. */
  async removeRole(admin: AuthUser, userId: string, role: Role, reason: string, ip?: string) {
    const target = await this.loadForRoleChange(userId);
    await this.checkRoleChange(admin, target, 'REMOVE', role);
    await this.prisma.$transaction(async (tx) => {
      await tx.userRole.delete({ where: { userId_role: { userId, role } } });
      await this.audit.log({ actorId: admin.id, action: 'user.remove_role', entity: 'user', entityId: userId, before: { roles: target.roles }, after: { removed: role, reason }, ip }, tx);
    });
    // Quitar ADMIN cierra sus sesiones para que el cambio no dependa de que cierre el navegador.
    if (role === 'ADMIN') await this.auth.revokeAllSessions(userId);
    await this.mail.notify([target.email], 'Cambio de rol en EMC Academy',
      `Hola ${target.fullName}, ya no tienes el rol de ${ROLE_LABEL[role]} en el Campus Virtual.`);
    return { ok: true };
  }

  async reject(admin: AuthUser, requestId: string, notes: string | undefined, ip?: string) {
    const request = await this.findPending(requestId);

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.accountRequest.update({
        where: { id: request.id },
        data: { status: 'REJECTED', reviewedById: admin.id, reviewedAt: new Date(), reviewNotes: notes },
      });
      // Vuelve a PENDING_APPROVAL para que pueda corregir y enviar otra solicitud.
      await this.audit.log({ actorId: admin.id, action: 'account_request.reject', entity: 'account_request', entityId: request.id, after: { notes: notes ?? null }, ip }, tx);
      return updated;
    });

    if (request.user.email) {
      await this.mail.send({
        to: request.user.email,
        subject: 'Sobre tu solicitud en EMC Academy',
        text: `Hola ${request.user.fullName}, no pudimos aprobar tu solicitud.${notes ? `\nMotivo: ${notes}` : ''}\nPuedes escribirnos por WhatsApp para ayudarte.`,
      });
    }
    return result;
  }

  listUsers(status?: UserStatus, q?: string, role?: Role) {
    const term = q?.trim();
    return this.prisma.user.findMany({
      where: {
        deletedAt: null,
        status,
        ...(role ? { roles: { some: { role } } } : {}),
        ...(term ? { OR: [{ email: { contains: term, mode: 'insensitive' } }, { fullName: { contains: term, mode: 'insensitive' } }] } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: { id: true, email: true, username: true, fullName: true, phone: true, status: true, createdAt: true, roles: { select: { role: true } } },
    });
  }

  async suspend(admin: AuthUser, userId: string, reason: string, ip?: string) {
    if (userId === admin.id) throw new BadRequestException('No puedes suspender tu propia cuenta.');
    const user = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!user) throw new NotFoundException();
    if (user.status !== 'ACTIVE') throw new BadRequestException('Solo se pueden suspender cuentas activas.');

    await this.prisma.user.update({ where: { id: userId }, data: { status: 'SUSPENDED' } });
    await this.auth.revokeAllSessions(userId);
    await this.audit.log({ actorId: admin.id, action: 'user.suspend', entity: 'user', entityId: userId, after: { reason }, ip });
    return { ok: true };
  }

  async reactivate(admin: AuthUser, userId: string, reason: string, ip?: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!user) throw new NotFoundException();
    if (user.status !== 'SUSPENDED') throw new BadRequestException('La cuenta no está suspendida.');

    await this.prisma.user.update({ where: { id: userId }, data: { status: 'ACTIVE' } });
    await this.audit.log({ actorId: admin.id, action: 'user.reactivate', entity: 'user', entityId: userId, after: { reason }, ip });
    return { ok: true };
  }

  // ───────────── Internos ─────────────

  private async loadForRoleChange(userId: string) {
    const u = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null }, include: { roles: true } });
    if (!u) throw new NotFoundException('Usuario no encontrado.');
    return { id: u.id, email: u.email, fullName: u.fullName, status: u.status, roles: u.roles.map((r) => r.role) };
  }

  private async checkRoleChange(admin: AuthUser, target: Awaited<ReturnType<AccountsService['loadForRoleChange']>>, action: 'ADD' | 'REMOVE', role: Role) {
    const activeAdminCount = await this.prisma.user.count({ where: { status: 'ACTIVE', deletedAt: null, roles: { some: { role: 'ADMIN' } } } });
    const d = decideRoleChange({ action, role, actorId: admin.id, target, activeAdminCount });
    if (!d.allowed) {
      const body = { code: d.reason, message: ROLE_CHANGE_MESSAGES[d.reason] };
      throw d.reason === 'ALREADY_HAS_ROLE' || d.reason === 'ROLE_NOT_ASSIGNED' ? new ConflictException(body) : new BadRequestException(body);
    }
  }

  /** Perfil mínimo para el rol, si no existe (el admin puede dar un rol distinto al solicitado). */
  private async ensureProfile(tx: PrismaTx, userId: string, fullName: string, role: Role): Promise<void> {
    if (role === 'STUDENT') await tx.studentProfile.upsert({ where: { userId }, create: { userId }, update: {} });
    if (role === 'GUARDIAN') await tx.guardianProfile.upsert({ where: { userId }, create: { userId }, update: {} });
    if (role === 'TEACHER') {
      const slug = `${slugify(fullName) || 'docente'}-${randomBytes(3).toString('hex')}`;
      await tx.teacherProfile.upsert({ where: { userId }, create: { userId, slug }, update: {} });
    }
  }

  private async findPending(requestId: string) {
    const request = await this.prisma.accountRequest.findUnique({
      where: { id: requestId },
      include: { user: { select: { email: true, fullName: true, status: true } } },
    });
    if (!request) throw new NotFoundException();
    if (request.status !== 'PENDING') throw new ConflictException({ code: 'ALREADY_REVIEWED', message: 'La solicitud ya fue revisada.' });
    return request;
  }

  /** Crea o actualiza el perfil solicitado. Tener perfil no da acceso: eso lo da el rol + ACTIVE. */
  private async upsertProfile(tx: PrismaTx, user: AuthUser, dto: CreateAccountRequestDto): Promise<void> {
    const userId = user.id;
    switch (dto.role) {
      case 'STUDENT': {
        const data = { birthDate: dto.birthDate ? new Date(dto.birthDate) : null };
        await tx.studentProfile.upsert({ where: { userId }, create: { userId, ...data }, update: data });
        return;
      }
      case 'GUARDIAN': {
        const data = { documentType: dto.documentType ?? null, documentNumber: dto.documentNumber ?? null };
        await tx.guardianProfile.upsert({ where: { userId }, create: { userId, ...data }, update: data });
        return;
      }
      case 'TEACHER': {
        const slug = `${slugify(user.fullName) || 'docente'}-${randomBytes(3).toString('hex')}`;
        await tx.teacherProfile.upsert({ where: { userId }, create: { userId, slug }, update: {} });
        return;
      }
    }
  }
}
