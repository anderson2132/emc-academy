import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { Public } from '../../common/auth/decorators';

const PUBLIC_COURSE = {
  slug: true, name: true, line: true, level: true, tool: true, summary: true, description: true,
  objective: true, audience: true, requirements: true, priceCents: true, currency: true, totalHours: true,
  modules: { select: { position: true, title: true }, orderBy: { position: 'asc' } },
} as const;

/** Catálogo público (lo consume el portal al construirse). */
@ApiTags('cursos')
@Public()
@Controller('courses')
export class CoursesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.course.findMany({
      where: { status: 'PUBLISHED', deletedAt: null },
      orderBy: [{ line: 'asc' }, { level: 'asc' }, { name: 'asc' }],
      select: PUBLIC_COURSE,
    });
  }

  @Get(':slug')
  async detail(@Param('slug') slug: string) {
    const course = await this.prisma.course.findFirst({
      where: { slug, status: 'PUBLISHED', deletedAt: null },
      select: PUBLIC_COURSE,
    });
    if (!course) throw new NotFoundException({ code: 'COURSE_NOT_FOUND', message: 'Curso no encontrado.' });
    return course;
  }
}
