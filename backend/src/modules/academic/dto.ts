import { ArrayMaxSize, IsArray, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUrl, IsUUID, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { CourseStatus, GroupStatus } from '../../generated/prisma/enums';
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

export class UpdateGroupDto {
  @IsOptional()
  @IsDateString({ strict: true }, { message: 'Fecha de inicio inválida' })
  startDate?: string;

  @IsOptional()
  @IsDateString({ strict: true }, { message: 'Fecha de fin inválida' })
  endDate?: string;

  /** Texto vacío = sin horario. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  schedule?: string;

  /** Texto vacío = sin enlace. */
  @IsOptional()
  @ValidateIf((o: UpdateGroupDto) => !!o.zoomUrl)
  @IsUrl({ protocols: ['https'], require_protocol: true }, { message: 'El enlace de Zoom debe empezar con https://' })
  @MaxLength(500)
  zoomUrl?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  capacity?: number;

  @IsOptional()
  @IsEnum(GroupStatus)
  status?: GroupStatus;
}

export class UpdateCourseDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(400)
  summary?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  objective?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  audience?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  requirements?: string[];

  /** Precio en céntimos (S/ 450 = 45000). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  priceCents?: number;

  @IsOptional()
  @IsEnum(CourseStatus)
  status?: CourseStatus;

  /** Temario: títulos de los módulos en orden. Reemplaza el temario completo. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  modules?: string[];
}

/** Confirmación de borrado: escribir el código del grupo o el nombre del curso, más un motivo. */
export class DeleteDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  confirm: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}
