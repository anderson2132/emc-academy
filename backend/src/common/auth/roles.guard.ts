import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '../../generated/prisma/enums';
import { IS_PUBLIC, ROLES } from './decorators';
import type { AuthRequest } from './auth-user';

/** Guard global: aplica @Roles(...). Sin @Roles, cualquier usuario autenticado pasa. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const required = this.reflector.getAllAndOverride<Role[]>(ROLES, targets);
    if (!required?.length) return true;

    const user = ctx.switchToHttp().getRequest<AuthRequest>().user;
    if (user && required.some((r) => user.roles.includes(r))) return true;
    throw new ForbiddenException({ code: 'FORBIDDEN_ROLE', message: 'No tienes permisos para esta acción.' });
  }
}
