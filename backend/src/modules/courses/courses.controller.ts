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

  /** Grupos abiertos a inscripción de un curso (sin enlace de Zoom). */
  @Get(':slug/groups')
  async openGroups(@Param('slug') slug: string) {
    const groups = await this.prisma.academicGroup.findMany({
      where: { deletedAt: null, status: 'ENROLLING', course: { slug, status: 'PUBLISHED', deletedAt: null } },
      orderBy: { startDate: 'asc' },
      select: {
        id: true, code: true, startDate: true, endDate: true, schedule: true, capacity: true,
        teachers: { select: { teacher: { select: { user: { select: { fullName: true } } } } } },
        _count: { select: { enrollments: { where: { status: 'APPROVED' } } } },
      },
    });
    return groups.map((g) => ({
      id: g.id,
      code: g.code,
      startDate: g.startDate.toISOString().slice(0, 10),
      endDate: g.endDate.toISOString().slice(0, 10),
      schedule: g.schedule && typeof g.schedule === 'object' && 'text' in g.schedule ? String((g.schedule as { text: unknown }).text) : null,
      seatsLeft: Math.max(0, g.capacity - g._count.enrollments),
      teachers: g.teachers.map((t) => t.teacher.user.fullName),
    }));
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
