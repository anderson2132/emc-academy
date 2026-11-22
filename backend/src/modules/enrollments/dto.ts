import { IsDateString, IsEmail, IsEnum, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { EnrollmentStatus, PaymentMethod, PreEnrollmentStatus } from '../../generated/prisma/enums';

export class ListEnrollmentsQuery {
  @IsOptional()
  @IsEnum(EnrollmentStatus)
  status?: EnrollmentStatus;
}

export class ApproveEnrollmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  /** Descuento en céntimos (opcional). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  discountCents?: number;
}

export class NotesDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class CreatePreEnrollmentDto {
  @IsUUID()
  groupId: string;

  @IsString()
  @MinLength(3)
  @MaxLength(120)
  fullName: string;

  /** Correo con el que la persona creará su cuenta (se usa para reconocer la prematrícula). */
  @IsEmail({}, { message: 'Correo inválido' })
  @MaxLength(254)
  email: string;

  @IsOptional()
  @Matches(/^[0-9 +]{9,15}$/, { message: 'Celular inválido' })
  phone?: string;

  @IsOptional()
  @IsDateString({ strict: true }, { message: 'Fecha de nacimiento inválida' })
  birthDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  discountCents?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class ListPreEnrollmentsQuery {
  @IsOptional()
  @IsEnum(PreEnrollmentStatus)
  status?: PreEnrollmentStatus;
}

export class LinkPreEnrollmentDto {
  @IsUUID()
  userId: string;
}

export class MarkPaidDto {
  @IsEnum(PaymentMethod, { message: 'Método de pago inválido' })
  method: PaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  operationNumber?: string;

  /** Fecha del pago (AAAA-MM-DD). Por defecto, hoy. */
  @IsOptional()
  @IsDateString({ strict: true }, { message: 'Fecha de pago inválida' })
  paidOn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class VoidPaymentDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}
