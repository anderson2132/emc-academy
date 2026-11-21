import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Role } from '../../generated/prisma/enums';
import type { AuthRequest, AuthUser } from './auth-user';

export const IS_PUBLIC = 'isPublic';
export const ALLOW_INACTIVE = 'allowInactive';
export const ROLES = 'roles';

/** Ruta accesible sin sesión. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/**
 * Ruta accesible con sesión aunque la cuenta no esté ACTIVE
 * (p. ej. ver el estado de la solicitud). Por defecto se exige ACTIVE.
 */
export const AllowInactive = () => SetMetadata(ALLOW_INACTIVE, true);

/** Restringe la ruta a uno o más roles. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<AuthRequest>();
  return req.user as AuthUser;
});
