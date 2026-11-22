import { Equals, IsDateString, IsEmail, IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { GuardianLinkStatus } from '../../generated/prisma/enums';

/** Versión del texto de consentimiento que aceptó el apoderado (BORRADOR hasta tener los textos legales). */
export const CONSENT_VERSION = 'apoderado-v0-borrador';

export class CreateChildDto {
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  fullName: string;

  /** Correo del menor (opcional). Si no tiene, se usa un nombre de usuario. */
  @IsOptional()
  @IsEmail({}, { message: 'Correo inválido' })
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @Matches(/^[a-zA-Z0-9._-]{4,30}$/, { message: 'El usuario debe tener de 4 a 30 caracteres: letras, números, punto, guion o guion bajo' })
  username?: string;

  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @MaxLength(128)
  password: string;

  @IsDateString({ strict: true }, { message: 'Fecha de nacimiento inválida' })
  birthDate: string;

  /** Parentesco: madre, padre, tutor, etc. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  relationship?: string;

  @Equals(true, { message: 'Debes aceptar el consentimiento del apoderado' })
  consent: boolean;
}

export class AuthorizeLinkDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  relationship?: string;

  @Equals(true, { message: 'Debes aceptar el consentimiento del apoderado' })
  consent: boolean;
}

export class AddGuardianDto {
  @IsEmail({}, { message: 'Correo inválido' })
  @MaxLength(254)
  email: string;
}

export class ListLinksQuery {
  @IsOptional()
  @IsEnum(GuardianLinkStatus)
  status?: GuardianLinkStatus;
}

export class LinkReasonDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
