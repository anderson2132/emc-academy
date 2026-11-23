import { ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { ACCESS_TTL_SECONDS, REFRESH_TTL_SECONDS } from '../../common/auth/cookies';
import { hashPassword, normalizeLogin, randomToken, sha256, verifyPassword } from './crypto.util';
import type { EmailTokenType } from '../../generated/prisma/enums';
import { decideOidc, OidcMode } from './oidc/oidc-decision';
import { OidcError, OidcIdentity } from './oidc/oidc.service';

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
/** Reusar un refresh token ya rotado dentro de este margen no cierra todas las sesiones. */
const REFRESH_REUSE_GRACE_MS = 60_000;
const VERIFY_TTL_HOURS = 24;
const RESET_TTL_HOURS = 1;

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

export interface ClientInfo {
  ip?: string;
  userAgent?: string;
}

const GENERIC_REGISTER_MSG = 'Si el correo es válido, te enviamos un enlace para verificar tu cuenta.';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
  ) {}

  // ───────────── Registro y verificación ─────────────

  /** Responde siempre lo mismo para no revelar qué correos existen. */
  async register(input: { email: string; password: string; fullName: string }): Promise<{ message: string }> {
    const email = normalizeLogin(input.email);
    const existing = await this.prisma.user.findUnique({ where: { email } });

    if (existing) {
      await this.mail.send({
        to: email,
        subject: 'Intento de registro en EMC Academy',
        text: 'Alguien intentó crear una cuenta con tu correo. Si fuiste tú, inicia sesión o recupera tu contraseña.',
      });
      return { message: GENERIC_REGISTER_MSG };
    }

    const user = await this.prisma.user.create({
      data: {
        email,
        fullName: input.fullName.trim(),
        passwordHash: await hashPassword(input.password),
        status: 'PENDING_VERIFICATION',
      },
    });
    await this.audit.log({ actorId: user.id, action: 'user.register', entity: 'user', entityId: user.id });
    await this.sendVerification(user.id, email);
    return { message: GENERIC_REGISTER_MSG };
  }

  async resendVerification(rawEmail: string): Promise<{ message: string }> {
    const email = normalizeLogin(rawEmail);
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user && user.status === 'PENDING_VERIFICATION') await this.sendVerification(user.id, email);
    return { message: GENERIC_REGISTER_MSG };
  }

  async verifyEmail(token: string): Promise<{ message: string }> {
    const record = await this.consumeEmailToken(token, 'VERIFY_EMAIL');
    await this.prisma.user.updateMany({
      where: { id: record.userId, status: 'PENDING_VERIFICATION' },
      data: { status: 'PENDING_APPROVAL', emailVerifiedAt: new Date() },
    });
    await this.audit.log({ actorId: record.userId, action: 'user.verify_email', entity: 'user', entityId: record.userId });
    return { message: 'Correo verificado. Ya puedes iniciar sesión y completar tu solicitud.' };
  }

  // ───────────── Login y sesiones ─────────────

  async login(loginInput: string, password: string, client: ClientInfo): Promise<SessionTokens> {
    const login = normalizeLogin(loginInput);
    const user = await this.prisma.user.findFirst({
      where: { deletedAt: null, OR: [{ email: login }, { username: login }] },
    });
    const invalid = new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Correo o contraseña incorrectos.' });

    if (!user || !user.passwordHash) {
      // Igualar el tiempo de respuesta aunque el usuario no exista.
      await hashPassword(password);
      throw invalid;
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new ForbiddenException({ code: 'ACCOUNT_LOCKED', message: 'Demasiados intentos. Intenta nuevamente en unos minutos.' });
    }

    if (!(await verifyPassword(user.passwordHash, password))) {
      const failed = user.failedLoginCount + 1;
      const lock = failed >= MAX_FAILED_LOGINS;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: lock ? 0 : failed,
          lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
        },
      });
      if (lock) await this.audit.log({ actorId: null, action: 'user.locked', entity: 'user', entityId: user.id, ip: client.ip });
      throw invalid;
    }

    if (user.status === 'PENDING_VERIFICATION') {
      throw new ForbiddenException({ code: 'EMAIL_NOT_VERIFIED', message: 'Primero verifica tu correo.' });
    }

    if (user.failedLoginCount || user.lockedUntil) {
      await this.prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null } });
    }
    return this.createSession(user.id, client);
  }

  /**
   * Rota el refresh token. Si llega un token ya revocado (posible robo),
   * se cierran todas las sesiones del usuario.
   */
  async refresh(refreshToken: string | undefined, client: ClientInfo): Promise<SessionTokens> {
    const expired = new UnauthorizedException({ code: 'SESSION_EXPIRED' });
    if (!refreshToken) throw expired;

    const session = await this.prisma.authSession.findUnique({ where: { refreshTokenHash: sha256(refreshToken) } });
    if (!session) throw expired;

    if (session.revokedAt) {
      // Carrera benigna: otra pestaña/petición acaba de rotar este mismo token.
      // Solo se rechaza; no se trata como robo.
      if (Date.now() - session.revokedAt.getTime() < REFRESH_REUSE_GRACE_MS) throw expired;
      await this.revokeAllSessions(session.userId);
      this.logger.warn(`Reutilización de refresh token detectada (usuario ${session.userId})`);
      await this.audit.log({ actorId: null, action: 'session.reuse_detected', entity: 'user', entityId: session.userId, ip: client.ip });
      throw expired;
    }
    if (session.expiresAt < new Date()) throw expired;

    await this.prisma.authSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    return this.createSession(session.userId, client);
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    await this.prisma.authSession.updateMany({
      where: { refreshTokenHash: sha256(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllSessions(userId: string): Promise<void> {
    await this.prisma.authSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  // ───────────── Google / Microsoft (OIDC) ─────────────

  /**
   * Aplica las reglas de vinculación (oidc-decision.ts) y devuelve una sesión
   * nueva (login o cuenta creada) o null si solo se vinculó a la sesión actual.
   */
  async signInWithOidc(
    identity: OidcIdentity,
    mode: OidcMode,
    currentUserId: string | null,
    client: ClientInfo,
  ): Promise<{ result: 'LOGIN' | 'CREATED' | 'LINKED'; tokens: SessionTokens | null }> {
    const provider = identity.provider === 'google' ? 'GOOGLE' : 'MICROSOFT';

    const existing = await this.prisma.userIdentity.findUnique({
      where: { provider_providerSubject: { provider, providerSubject: identity.subject } },
      include: { user: { select: { deletedAt: true } } },
    });
    const identityOwnerId = existing && !existing.user.deletedAt ? existing.userId : null;
    const emailOwner = identity.email
      ? await this.prisma.user.findUnique({ where: { email: identity.email }, select: { id: true } })
      : null;
    const currentHasProvider = currentUserId
      ? !!(await this.prisma.userIdentity.findFirst({ where: { userId: currentUserId, provider } }))
      : false;

    const decision = decideOidc({ mode, identityOwnerId, currentUserId, emailOwnerId: emailOwner?.id ?? null, currentHasProvider });

    switch (decision.action) {
      case 'ERROR':
        throw new OidcError(decision.code);

      case 'LOGIN':
        await this.audit.log({ actorId: decision.userId, action: 'user.login_oidc', entity: 'user', entityId: decision.userId, after: { provider }, ip: client.ip });
        return { result: 'LOGIN', tokens: await this.createSession(decision.userId, client) };

      case 'LINK':
        await this.prisma.userIdentity.create({
          data: { userId: decision.userId, provider, providerSubject: identity.subject, providerEmail: identity.email },
        });
        await this.audit.log({ actorId: decision.userId, action: 'identity.link', entity: 'user', entityId: decision.userId, after: { provider }, ip: client.ip });
        return { result: 'LINKED', tokens: null };

      case 'CREATE': {
        const user = await this.prisma.$transaction(async (tx) => {
          const u = await tx.user.create({
            data: {
              email: identity.email,
              fullName: identity.name ?? identity.email?.split('@')[0] ?? 'Usuario',
              status: 'PENDING_APPROVAL',
              emailVerifiedAt: identity.emailVerified ? new Date() : null,
            },
          });
          await tx.userIdentity.create({
            data: { userId: u.id, provider, providerSubject: identity.subject, providerEmail: identity.email },
          });
          await this.audit.log({ actorId: u.id, action: 'user.register_oidc', entity: 'user', entityId: u.id, after: { provider }, ip: client.ip }, tx);
          return u;
        });
        return { result: 'CREATED', tokens: await this.createSession(user.id, client) };
      }
    }
  }

  /** Formas de ingreso de la cuenta (para el panel). */
  async listLoginMethods(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { passwordHash: true, identities: { select: { provider: true, providerEmail: true, createdAt: true } } },
    });
    return { password: !!user.passwordHash, identities: user.identities };
  }

  // ───────────── Recuperación de contraseña ─────────────

  async forgotPassword(rawEmail: string): Promise<{ message: string }> {
    const email = normalizeLogin(rawEmail);
    const user = await this.prisma.user.findFirst({ where: { email, deletedAt: null } });
    if (user) {
      const token = await this.issueEmailToken(user.id, 'RESET_PASSWORD', RESET_TTL_HOURS);
      await this.mail.send({
        to: email,
        subject: 'Recupera tu contraseña de EMC Academy',
        text: `Para crear una nueva contraseña abre este enlace (vence en 1 hora):\n${this.frontendUrl()}/campus/restablecer.html?token=${token}\n\nSi no lo solicitaste, ignora este correo.`,
      });
    }
    return { message: 'Si el correo está registrado, te enviamos instrucciones.' };
  }

  async resetPassword(token: string, password: string): Promise<{ message: string }> {
    const record = await this.consumeEmailToken(token, 'RESET_PASSWORD');
    await this.prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash: await hashPassword(password), failedLoginCount: 0, lockedUntil: null },
    });
    await this.revokeAllSessions(record.userId);
    await this.audit.log({ actorId: record.userId, action: 'user.reset_password', entity: 'user', entityId: record.userId });
    return { message: 'Contraseña actualizada. Inicia sesión nuevamente.' };
  }

  // ───────────── Internos ─────────────

  private async createSession(userId: string, client: ClientInfo): Promise<SessionTokens> {
    const refreshToken = randomToken();
    await this.prisma.authSession.create({
      data: {
        userId,
        refreshTokenHash: sha256(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000),
        ip: client.ip,
        userAgent: client.userAgent?.slice(0, 300),
      },
    });
    const accessToken = await this.jwt.signAsync(
      { sub: userId },
      { secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'), expiresIn: ACCESS_TTL_SECONDS },
    );
    return { accessToken, refreshToken };
  }

  private async sendVerification(userId: string, email: string): Promise<void> {
    const token = await this.issueEmailToken(userId, 'VERIFY_EMAIL', VERIFY_TTL_HOURS);
    await this.mail.send({
      to: email,
      subject: 'Verifica tu correo en EMC Academy',
      text: `Bienvenido a EMC Academy. Verifica tu correo con este enlace (vence en 24 horas):\n${this.frontendUrl()}/campus/verificar.html?token=${token}`,
    });
  }

  private async issueEmailToken(userId: string, type: EmailTokenType, ttlHours: number): Promise<string> {
    const token = randomToken();
    // Un solo token vigente por tipo: invalida los anteriores.
    await this.prisma.emailToken.updateMany({ where: { userId, type, usedAt: null }, data: { usedAt: new Date() } });
    await this.prisma.emailToken.create({
      data: { userId, type, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttlHours * 3_600_000) },
    });
    return token;
  }

  private async consumeEmailToken(token: string, type: EmailTokenType) {
    const invalid = new UnauthorizedException({ code: 'INVALID_TOKEN', message: 'El enlace no es válido o ya venció.' });
    const record = await this.prisma.emailToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (!record || record.type !== type || record.usedAt || record.expiresAt < new Date()) throw invalid;
    const updated = await this.prisma.emailToken.updateMany({ where: { id: record.id, usedAt: null }, data: { usedAt: new Date() } });
    if (updated.count !== 1) throw invalid;
    return record;
  }

  private frontendUrl(): string {
    return this.config.getOrThrow<string>('FRONTEND_URL').replace(/\/$/, '');
  }
}
