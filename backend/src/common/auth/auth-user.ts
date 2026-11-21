import type { Request } from 'express';
import type { Role, UserStatus } from '../../generated/prisma/enums';

/** Usuario autenticado que los guards adjuntan a la petición. */
export interface AuthUser {
  id: string;
  email: string | null;
  fullName: string;
  status: UserStatus;
  roles: Role[];
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}
