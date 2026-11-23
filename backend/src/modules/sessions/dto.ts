import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export class GenerateSessionsDto {
  /** Días de la semana: 1 = lunes … 7 = domingo. */
  @IsArray()
  @ArrayMinSize(1, { message: 'Elige al menos un día' })
  @ArrayMaxSize(7)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  weekdays: number[];

  @Matches(TIME, { message: 'Hora inválida (HH:MM)' })
  startTime: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(30)
  @Max(300)
  durationMinutes?: number;

  /** Cantidad de clases (por defecto 16). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  count?: number;

  /** Desde qué fecha (por defecto, el inicio del grupo). */
  @IsOptional()
  @IsDateString({ strict: true }, { message: 'Fecha inválida' })
  fromDate?: string;
}

export class SessionDto {
  @IsDateString({ strict: true }, { message: 'Fecha inválida' })
  date: string;

  @Matches(TIME, { message: 'Hora inválida (HH:MM)' })
  startTime: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(30)
  @Max(300)
  durationMinutes?: number;
}

export class ReasonDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}

export class SetAttendanceDto extends ReasonDto {
  @IsIn(['PRESENT', 'ABSENT', 'JUSTIFIED'], { message: 'Estado inválido' })
  status: 'PRESENT' | 'ABSENT' | 'JUSTIFIED';
}
