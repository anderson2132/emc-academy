import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { ACCESS_COOKIE } from './cookies';
import { ALLOW_INACTIVE, IS_PUBLIC } from './decorators';
import type { AuthRequest } from './auth-user';

/**
 * Guard global: exige una sesión válida salvo en rutas @Public().
 * El usuario se relee de la BD en cada petición para que una suspensión
 * o un cambio de rol tenga efecto inmediato (volumen bajo: ~1000 alumnos).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest<AuthRequest>();
    const token: unknown = req.cookies?.[ACCESS_COOKIE];
    if (typeof token !== 'string' || !token) throw new UnauthorizedException({ code: 'NO_SESSION' });

    let sub: string;
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
      sub = payload.sub;
    } catch {
      throw new UnauthorizedException({ code: 'SESSION_EXPIRED' });
    }

    const user = await this.prisma.user.findFirst({
      where: { id: sub, deletedAt: null },
      select: { id: true, email: true, fullName: true, status: true, roles: { select: { role: true } } },
    });
    if (!user) throw new UnauthorizedException({ code: 'NO_SESSION' });

    req.user = { id: user.id, email: user.email, fullName: user.fullName, status: user.status, roles: user.roles.map((r) => r.role) };

    const allowInactive = this.reflector.getAllAndOverride<boolean>(ALLOW_INACTIVE, targets);
    if (!allowInactive && user.status !== 'ACTIVE') {
      throw new ForbiddenException({ code: 'ACCOUNT_NOT_ACTIVE', message: 'Tu cuenta aún no está activa.' });
    }
    return true;
  }
}
