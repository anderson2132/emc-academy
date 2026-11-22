import { IsDateString, IsEnum, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { DocumentType, RequestStatus, Role, UserStatus } from '../../generated/prisma/enums';

export const REQUESTABLE_ROLES = ['STUDENT', 'GUARDIAN', 'TEACHER'] as const;
export type RequestableRole = (typeof REQUESTABLE_ROLES)[number];

export class CreateAccountRequestDto {
  @IsIn(REQUESTABLE_ROLES, { message: 'Rol inválido' })
  role: RequestableRole;

  @IsOptional()
  @Matches(/^[0-9 +]{9,15}$/, { message: 'Celular inválido' })
  phone?: string;

  /** Alumno: fecha de nacimiento (AAAA-MM-DD). Define si es menor de edad. */
  @IsOptional()
  @IsDateString({ strict: true }, { message: 'Fecha de nacimiento inválida' })
  birthDate?: string;

  /** Apoderado: documento de identidad. */
  @IsOptional()
  @IsEnum(DocumentType)
  documentType?: DocumentType;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  documentNumber?: string;
}

export class ListRequestsQuery {
  @IsOptional()
  @IsEnum(RequestStatus)
  status?: RequestStatus;
}

export class ReviewDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class ReasonDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}

export class ListUsersQuery {
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

export class ApproveRequestDto extends ReviewDto {
  /** Rol a otorgar. Si se omite, el que pidió el usuario. El admin decide el rol final. */
  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}

export class ChangeRoleDto {
  @IsEnum(Role)
  role: Role;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}
