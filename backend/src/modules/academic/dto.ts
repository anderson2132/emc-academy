import { IsDateString, IsInt, IsOptional, IsString, IsUrl, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateGroupDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  courseSlug: string;

  /** Fecha de inicio (AAAA-MM-DD). */
  @IsDateString({ strict: true }, { message: 'Fecha de inicio inválida' })
  startDate: string;

  /** Fecha de fin (AAAA-MM-DD). Si no se indica: inicio + 8 semanas. */
  @IsOptional()
  @IsDateString({ strict: true }, { message: 'Fecha de fin inválida' })
  endDate?: string;

  /** Horario en texto, p. ej. "Martes y jueves 7:00–9:00 p. m.". */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  schedule?: string;

  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true }, { message: 'El enlace de Zoom debe empezar con https://' })
  @MaxLength(500)
  zoomUrl?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  capacity?: number;
}

export class AssignUserDto {
  @IsUUID()
  userId: string;
}
