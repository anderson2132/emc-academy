import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../../common/auth/auth-user';
import {
  evaluateCourseAccess,
  isPaid,
  paymentDeadline,
  contentDeadline,
} from '../../common/access/course-access.policy';
import { Prisma } from '../../generated/prisma/client';
import type { CreateGroupDto, DeleteDto, UpdateCourseDto, UpdateGroupDto } from './dto';
import type { PrismaTx } from '../../prisma/prisma.service';

const DAY_MS = 24 * 60 * 60 * 1000;
/** 16 clases, 2 por semana → 8 semanas. */
const DEFAULT_DURATION_DAYS = 8 * 7 - 1;

const toDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

function scheduleText(schedule: unknown): string | null {
  if (schedule && typeof schedule === 'object' && 'text' in schedule && typeof (schedule as { text: unknown }).text === 'string') {
    return (schedule as { text: string }).text;
  }
  return null;
}

/**
 * Etapa 3 (inicial): grupos de un curso, docentes asignados y matrículas hechas por el administrador.
 * El acceso del alumno a cada curso se calcula con evaluateCourseAccess (pago, plazos, menores).
 */
@Injectable()
export class AcademicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ───────────── Administración ─────────────

  listCourses() {
    return this.prisma.course.findMany({
      where: { deletedAt: null },
      orderBy: [{ line: 'asc' }, { level: 'asc' }, { name: 'asc' }],
      select: { id: true, slug: true, name: true, line: true, level: true, priceCents: true, status: true },
    });
  }

  async listGroups() {
    const groups = await this.prisma.academicGroup.findMany({
      where: { deletedAt: null },
      orderBy: [{ startDate: 'desc' }, { code: 'asc' }],
      include: {
        course: { select: { slug: true, name: true } },
        teachers: { include: { teacher: { include: { user: { select: { id: true, fullName: true, email: true } } } } } },
        _count: { select: { enrollments: { where: { status: 'APPROVED' } } } },
      },
    });
    const pending = await this.prisma.enrollment.groupBy({
      by: ['groupId'],
      where: { status: { in: ['REQUESTED', 'PENDING_GUARDIAN'] }, groupId: { in: groups.map((g) => g.id) } },
      _count: { _all: true },
    });
    const pendingBy = new Map(pending.map((p) => [p.groupId, p._count._all]));
    return groups.map((g) => ({
      pendingRequests: pendingBy.get(g.id) ?? 0,
      id: g.id,
      code: g.code,
      course: g.course,
      startDate: isoDay(g.startDate),
      endDate: isoDay(g.endDate),
      schedule: scheduleText(g.schedule),
      zoomUrl: g.zoomUrl,
      capacity: g.capacity,
      status: g.status,
      teachers: g.teachers.map((t) => t.teacher.user),
      students: g._count.enrollments,
    }));
  }

  async createGroup(admin: AuthUser, dto: CreateGroupDto, ip?: string) {
    const course = await this.prisma.course.findFirst({ where: { slug: dto.courseSlug, deletedAt: null } });
    if (!course) throw new NotFoundException({ code: 'COURSE_NOT_FOUND', message: 'Curso no encontrado.' });

    const startDate = toDate(dto.startDate);
    const endDate = dto.endDate ? toDate(dto.endDate) : new Date(startDate.getTime() + DEFAULT_DURATION_DAYS * DAY_MS);
    if (endDate < startDate) throw new BadRequestException('La fecha de fin no puede ser anterior al inicio.');

    const prefix = course.slug.split('-').map((p) => p[0]).join('').toUpperCase().slice(0, 4);
    const code = `${prefix}-${dto.startDate}-${randomBytes(2).toString('hex').toUpperCase()}`;

    const group = await this.prisma.academicGroup.create({
      data: {
        courseId: course.id,
        code,
        startDate,
        endDate,
        schedule: dto.schedule ? { text: dto.schedule } : undefined,
        zoomUrl: dto.zoomUrl ?? null,
        capacity: dto.capacity ?? 20,
        status: 'ENROLLING',
      },
    });
    await this.audit.log({ actorId: admin.id, action: 'group.create', entity: 'academic_group', entityId: group.id, after: { code, course: course.slug, startDate: dto.startDate }, ip });
    return { id: group.id, code };
  }

  async groupDetail(groupId: string) {
    const g = await this.prisma.academicGroup.findFirst({
      where: { id: groupId, deletedAt: null },
      include: {
        course: { select: { slug: true, name: true, priceCents: true } },
        teachers: { include: { teacher: { include: { user: { select: { id: true, fullName: true, email: true } } } } } },
        enrollments: {
          where: { status: 'APPROVED' },
          orderBy: { createdAt: 'asc' },
          include: {
            student: { include: { user: { select: { id: true, fullName: true, email: true, username: true } } } },
            payments: {
              where: { voidedAt: null },
              orderBy: { paidOn: 'desc' },
              select: { amountCents: true, method: true, operationNumber: true, paidOn: true },
            },
          },
        },
        preEnrollments: {
          where: { status: { in: ['PENDING', 'CLAIMED'] } },
          orderBy: { createdAt: 'asc' },
          select: { id: true, fullName: true, email: true, status: true },
        },
      },
    });
    if (!g) throw new NotFoundException({ code: 'GROUP_NOT_FOUND', message: 'Grupo no encontrado.' });
    const pendingRequests = await this.prisma.enrollment.count({ where: { groupId, status: { in: ['REQUESTED', 'PENDING_GUARDIAN'] } } });

    const due = paymentDeadline(g.startDate);
    return {
      id: g.id,
      code: g.code,
      course: g.course,
      startDate: isoDay(g.startDate),
      endDate: isoDay(g.endDate),
      schedule: scheduleText(g.schedule),
      zoomUrl: g.zoomUrl,
      capacity: g.capacity,
      status: g.status,
      paymentDueDate: due.toISOString(),
      pendingRequests,
      preEnrollments: g.preEnrollments,
      teachers: g.teachers.map((t) => t.teacher.user),
      students: g.enrollments.map((e) => {
        const paidCents = e.payments.reduce((s, p) => s + p.amountCents, 0);
        return {
          enrollmentId: e.id,
          ...e.student.user,
          status: e.status,
          manualBlock: e.manualBlock,
          priceCents: e.priceCents - e.discountCents,
          paidCents,
          paid: isPaid({ priceCents: e.priceCents, discountCents: e.discountCents, paidCents }),
          lastPayment: e.payments[0]
            ? { method: e.payments[0].method, operationNumber: e.payments[0].operationNumber, paidOn: isoDay(e.payments[0].paidOn) }
            : null,
        };
      }),
    };
  }

  async assignTeacher(admin: AuthUser, groupId: string, userId: string, ip?: string) {
    await this.findGroup(groupId);
    const user = await this.findActiveWithRole(userId, 'TEACHER', 'docente');

    await this.prisma.$transaction(async (tx) => {
      const profile = await tx.teacherProfile.findUnique({ where: { userId } });
      if (!profile) {
        const slug = `${user.fullName.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'docente'}-${randomBytes(3).toString('hex')}`;
        await tx.teacherProfile.create({ data: { userId, slug } });
      }
      await tx.groupTeacher.upsert({
        where: { groupId_teacherId: { groupId, teacherId: userId } },
        create: { groupId, teacherId: userId },
        update: {},
      });
      await this.audit.log({ actorId: admin.id, action: 'group.assign_teacher', entity: 'academic_group', entityId: groupId, after: { userId }, ip }, tx);
    });
    return { ok: true };
  }

  async removeTeacher(admin: AuthUser, groupId: string, userId: string, ip?: string) {
    const deleted = await this.prisma.groupTeacher.deleteMany({ where: { groupId, teacherId: userId } });
    if (!deleted.count) throw new NotFoundException('El docente no está asignado a este grupo.');
    await this.audit.log({ actorId: admin.id, action: 'group.remove_teacher', entity: 'academic_group', entityId: groupId, after: { userId }, ip });
    return { ok: true };
  }

  /** El administrador matricula directamente: la matrícula queda APROBADA (pendiente de pago). */
  async enrollStudent(admin: AuthUser, groupId: string, userId: string, ip?: string) {
    const group = await this.findGroup(groupId);
    await this.findActiveWithRole(userId, 'STUDENT', 'alumno');

    const active = await this.prisma.enrollment.count({ where: { groupId, status: 'APPROVED' } });
    if (active >= group.capacity) throw new ConflictException({ code: 'GROUP_FULL', message: 'El grupo no tiene cupos disponibles.' });

    const existing = await this.prisma.enrollment.findUnique({ where: { studentId_groupId: { studentId: userId, groupId } } });
    if (existing && existing.status === 'APPROVED') throw new ConflictException({ code: 'ALREADY_ENROLLED', message: 'El alumno ya está matriculado en este grupo.' });

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.studentProfile.upsert({ where: { userId }, create: { userId }, update: {} });
      const data = {
        status: 'APPROVED' as const,
        approvedById: admin.id,
        approvedAt: now,
        priceCents: group.course.priceCents,
        manualBlock: false,
        blockReason: null,
      };
      const enrollment = existing
        ? await tx.enrollment.update({ where: { id: existing.id }, data })
        : await tx.enrollment.create({ data: { studentId: userId, groupId, requestedById: admin.id, ...data } });
      await this.audit.log({ actorId: admin.id, action: 'enrollment.create_by_admin', entity: 'enrollment', entityId: enrollment.id, after: { groupId, userId }, ip }, tx);
    });
    return { ok: true };
  }

  async unenrollStudent(admin: AuthUser, groupId: string, userId: string, ip?: string) {
    const e = await this.prisma.enrollment.findUnique({ where: { studentId_groupId: { studentId: userId, groupId } } });
    if (!e || e.status !== 'APPROVED') throw new NotFoundException('El alumno no está matriculado en este grupo.');
    await this.prisma.enrollment.update({ where: { id: e.id }, data: { status: 'CANCELLED' } });
    await this.audit.log({ actorId: admin.id, action: 'enrollment.cancel', entity: 'enrollment', entityId: e.id, after: { groupId, userId }, ip });
    return { ok: true };
  }

  /** Editar fechas, horario, Zoom, cupo o estado del grupo. */
  async updateGroup(admin: AuthUser, groupId: string, dto: UpdateGroupDto, ip?: string) {
    const g = await this.findGroup(groupId);
    const startDate = dto.startDate ? toDate(dto.startDate) : g.startDate;
    const endDate = dto.endDate ? toDate(dto.endDate) : g.endDate;
    if (endDate < startDate) throw new BadRequestException('La fecha de fin no puede ser anterior al inicio.');

    if (dto.capacity !== undefined) {
      const approved = await this.prisma.enrollment.count({ where: { groupId, status: 'APPROVED' } });
      if (dto.capacity < approved) {
        throw new BadRequestException(`El cupo no puede ser menor que los ${approved} alumnos ya matriculados.`);
      }
    }

    const data = {
      startDate,
      endDate,
      ...(dto.schedule !== undefined ? { schedule: dto.schedule.trim() ? { text: dto.schedule.trim() } : Prisma.DbNull } : {}),
      ...(dto.zoomUrl !== undefined ? { zoomUrl: dto.zoomUrl.trim() || null } : {}),
      ...(dto.capacity !== undefined ? { capacity: dto.capacity } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
    };
    const before = { startDate: isoDay(g.startDate), endDate: isoDay(g.endDate), schedule: scheduleText(g.schedule), zoomUrl: g.zoomUrl, capacity: g.capacity, status: g.status };

    await this.prisma.$transaction(async (tx) => {
      await tx.academicGroup.update({ where: { id: groupId }, data });
      // Un grupo cancelado o terminado ya no recibe alumnos: se cierran las solicitudes en curso.
      if (dto.status === 'CANCELLED' || dto.status === 'FINISHED') {
        await tx.enrollment.updateMany({
          where: { groupId, status: { in: ['REQUESTED', 'PENDING_GUARDIAN'] } },
          data: { status: 'REJECTED', reviewNotes: dto.status === 'CANCELLED' ? 'El grupo fue cancelado.' : 'El grupo ya terminó.' },
        });
        await tx.preEnrollment.updateMany({ where: { groupId, status: { in: ['PENDING', 'CLAIMED'] } }, data: { status: 'CANCELLED' } });
      }
      await this.audit.log({
        actorId: admin.id, action: 'group.update', entity: 'academic_group', entityId: groupId,
        before, after: { ...dto }, ip,
      }, tx);
    });
    return { ok: true };
  }

  /** Eliminar (borrado lógico) solo si el grupo no tiene alumnos ni solicitudes; si los tiene, se cancela. */
  /** Lo que se perdería al eliminar: para mostrarlo antes de confirmar. */
  async deletionImpact(groupIds: string[]) {
    const [students, paid] = await Promise.all([
      this.prisma.enrollment.count({ where: { groupId: { in: groupIds }, status: 'APPROVED' } }),
      this.prisma.enrollment.count({ where: { groupId: { in: groupIds }, status: 'APPROVED', payments: { some: { voidedAt: null } } } }),
    ]);
    return { groups: groupIds.length, students, paid };
  }

  async groupDeletionImpact(groupId: string) {
    await this.findGroup(groupId);
    return this.deletionImpact([groupId]);
  }

  /**
   * Eliminar grupo (borrado lógico), aunque tenga alumnos. Hay que escribir su código para confirmar.
   * Los alumnos pierden el acceso; matrículas, pagos y auditoría se conservan.
   */
  async deleteGroup(admin: AuthUser, groupId: string, dto: DeleteDto, ip?: string) {
    const g = await this.findGroup(groupId);
    if (dto.confirm.trim().toUpperCase() !== g.code.toUpperCase()) {
      throw new BadRequestException({ code: 'CONFIRM_MISMATCH', message: `Para confirmar escribe exactamente el código del grupo: ${g.code}` });
    }
    const impact = await this.deletionImpact([groupId]);
    await this.prisma.$transaction(async (tx) => {
      await this.softDeleteGroups(tx, [groupId]);
      await this.audit.log({
        actorId: admin.id, action: 'group.delete', entity: 'academic_group', entityId: groupId,
        before: { code: g.code, ...impact }, after: { reason: dto.reason }, ip,
      }, tx);
    });
    return { ok: true, ...impact };
  }

  async courseDeletionImpact(courseId: string) {
    const c = await this.prisma.course.findFirst({ where: { id: courseId, deletedAt: null }, include: { groups: { where: { deletedAt: null }, select: { id: true } } } });
    if (!c) throw new NotFoundException({ code: 'COURSE_NOT_FOUND', message: 'Curso no encontrado.' });
    return this.deletionImpact(c.groups.map((x) => x.id));
  }

  /** Eliminar curso junto con todos sus grupos (borrado lógico). Hay que escribir su nombre para confirmar. */
  async deleteCourse(admin: AuthUser, courseId: string, dto: DeleteDto, ip?: string) {
    const c = await this.prisma.course.findFirst({ where: { id: courseId, deletedAt: null }, include: { groups: { where: { deletedAt: null }, select: { id: true } } } });
    if (!c) throw new NotFoundException({ code: 'COURSE_NOT_FOUND', message: 'Curso no encontrado.' });
    if (dto.confirm.trim().toLowerCase() !== c.name.trim().toLowerCase()) {
      throw new BadRequestException({ code: 'CONFIRM_MISMATCH', message: `Para confirmar escribe exactamente el nombre del curso: ${c.name}` });
    }
    const groupIds = c.groups.map((x) => x.id);
    const impact = await this.deletionImpact(groupIds);
    await this.prisma.$transaction(async (tx) => {
      await this.softDeleteGroups(tx, groupIds);
      await tx.course.update({ where: { id: courseId }, data: { deletedAt: new Date(), status: 'ARCHIVED' } });
      await this.audit.log({
        actorId: admin.id, action: 'course.delete', entity: 'course', entityId: courseId,
        before: { name: c.name, slug: c.slug, ...impact }, after: { reason: dto.reason }, ip,
      }, tx);
    });
    return { ok: true, ...impact };
  }

  /** Oculta los grupos y cierra lo que estaba en curso (solicitudes y prematrículas). */
  private async softDeleteGroups(tx: PrismaTx, groupIds: string[]) {
    if (!groupIds.length) return;
    const now = new Date();
    await tx.academicGroup.updateMany({ where: { id: { in: groupIds } }, data: { deletedAt: now } });
    await tx.enrollment.updateMany({
      where: { groupId: { in: groupIds }, status: { in: ['REQUESTED', 'PENDING_GUARDIAN'] } },
      data: { status: 'REJECTED', reviewNotes: 'El grupo fue eliminado.' },
    });
    await tx.preEnrollment.updateMany({ where: { groupId: { in: groupIds }, status: { in: ['PENDING', 'CLAIMED'] } }, data: { status: 'CANCELLED' } });
  }

  // ───────────── Cursos y temario (admin) ─────────────

  async courseDetail(courseId: string) {
    const c = await this.prisma.course.findFirst({
      where: { id: courseId, deletedAt: null },
      include: { modules: { select: { position: true, title: true }, orderBy: { position: 'asc' } } },
    });
    if (!c) throw new NotFoundException({ code: 'COURSE_NOT_FOUND', message: 'Curso no encontrado.' });
    return {
      id: c.id, slug: c.slug, name: c.name, line: c.line, level: c.level, tool: c.tool,
      summary: c.summary, description: c.description, objective: c.objective, audience: c.audience,
      requirements: c.requirements, priceCents: c.priceCents, totalHours: c.totalHours, status: c.status,
      modules: c.modules,
    };
  }

  /** El precio nuevo solo aplica a matrículas nuevas: cada matrícula guarda el precio con que se aprobó. */
  async updateCourse(admin: AuthUser, courseId: string, dto: UpdateCourseDto, ip?: string) {
    const before = await this.courseDetail(courseId);
    const trimOrNull = (v: string | undefined) => (v === undefined ? undefined : v.trim() || null);
    await this.prisma.$transaction(async (tx) => {
      await tx.course.update({
        where: { id: courseId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.summary !== undefined ? { summary: dto.summary.trim() } : {}),
          description: trimOrNull(dto.description),
          objective: trimOrNull(dto.objective),
          audience: trimOrNull(dto.audience),
          ...(dto.requirements !== undefined ? { requirements: dto.requirements.map((r) => r.trim()).filter(Boolean) } : {}),
          ...(dto.priceCents !== undefined ? { priceCents: dto.priceCents } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
        },
      });
      if (dto.modules !== undefined) {
        const titles = dto.modules.map((t) => t.trim()).filter(Boolean);
        await tx.courseModule.deleteMany({ where: { courseId } });
        if (titles.length) {
          await tx.courseModule.createMany({ data: titles.map((title, i) => ({ courseId, position: i + 1, title })) });
        }
      }
      const { modules: _m, ...rest } = before;
      await this.audit.log({
        actorId: admin.id, action: 'course.update', entity: 'course', entityId: courseId,
        before: { ...rest, modules: before.modules.map((m) => m.title) }, after: { ...dto }, ip,
      }, tx);
    });
    return this.courseDetail(courseId);
  }

  // ───────────── Alumno ─────────────

  async myCourses(user: AuthUser) {
    if (!user.roles.includes('STUDENT')) return [];
    return this.studentCourses(user.id, { includeZoom: true });
  }

  /**
   * Cursos matriculados (APPROVED) de un alumno, con su acceso calculado por la regla.
   * Lo usan el alumno (con Zoom) y el apoderado (sin Zoom: el enlace es solo del alumno).
   */
  async studentCourses(studentId: string, opts: { includeZoom: boolean }) {
    const student = await this.prisma.user.findFirst({
      where: { id: studentId, deletedAt: null },
      select: {
        status: true,
        roles: { select: { role: true } },
        studentProfile: { include: { guardians: { where: { status: 'APPROVED' }, select: { guardianId: true } } } },
      },
    });
    const profile = student?.studentProfile;
    if (!student || !profile) return [];

    const enrollments = await this.prisma.enrollment.findMany({
      where: { studentId, status: 'APPROVED', group: { deletedAt: null } },
      orderBy: { group: { startDate: 'asc' } },
      include: {
        group: {
          include: {
            course: {
              select: {
                slug: true, name: true, line: true, level: true,
                modules: { select: { position: true, title: true }, orderBy: { position: 'asc' } },
              },
            },
            teachers: { include: { teacher: { include: { user: { select: { fullName: true } } } } } },
          },
        },
        payments: { where: { voidedAt: null }, select: { amountCents: true } },
      },
    });

    const now = new Date();
    const isStudent = student.roles.some((r) => r.role === 'STUDENT');
    return enrollments.map((e) => {
      const paidCents = e.payments.reduce((s, p) => s + p.amountCents, 0);
      const base = {
        now,
        user: { status: student.status, isStudent, birthDate: profile.birthDate, hasApprovedGuardian: profile.guardians.length > 0 },
        enrollment: { status: e.status, manualBlock: e.manualBlock, priceCents: e.priceCents, discountCents: e.discountCents, paidCents },
        group: { startDate: e.group.startDate, endDate: e.group.endDate },
      };
      const live = evaluateCourseAccess({ ...base, resource: 'LIVE' });
      const content = evaluateCourseAccess({ ...base, resource: 'CONTENT' });
      return {
        course: e.group.course,
        group: {
          id: e.group.id,
          code: e.group.code,
          startDate: isoDay(e.group.startDate),
          endDate: isoDay(e.group.endDate),
          schedule: scheduleText(e.group.schedule),
          teachers: e.group.teachers.map((t) => t.teacher.user.fullName),
        },
        access: {
          live: live.allowed ? 'OK' : live.reason,
          content: content.allowed ? 'OK' : content.reason,
        },
        payment: {
          paid: isPaid(base.enrollment),
          amountCents: e.priceCents - e.discountCents,
          paidCents,
          dueDate: paymentDeadline(e.group.startDate).toISOString(),
        },
        contentUntil: contentDeadline(e.group.endDate).toISOString(),
        // El enlace de Zoom solo se entrega si la regla de acceso lo permite.
        zoomUrl: opts.includeZoom && live.allowed ? e.group.zoomUrl : null,
      };
    });
  }

  // ───────────── Docente ─────────────

  async myGroups(user: AuthUser) {
    if (!user.roles.includes('TEACHER')) return [];
    const rows = await this.prisma.groupTeacher.findMany({
      where: { teacherId: user.id, group: { deletedAt: null } },
      orderBy: { group: { startDate: 'asc' } },
      include: {
        group: {
          include: {
            course: { select: { slug: true, name: true } },
            enrollments: {
              where: { status: 'APPROVED' },
              orderBy: { createdAt: 'asc' },
              include: { student: { include: { user: { select: { fullName: true, email: true } } } } },
            },
          },
        },
      },
    });
    return rows.map(({ group: g }) => ({
      code: g.code,
      course: g.course,
      startDate: isoDay(g.startDate),
      endDate: isoDay(g.endDate),
      schedule: scheduleText(g.schedule),
      zoomUrl: g.zoomUrl,
      students: g.enrollments.map((e) => e.student.user),
    }));
  }

  // ───────────── Internos ─────────────

  private async findGroup(groupId: string) {
    const g = await this.prisma.academicGroup.findFirst({
      where: { id: groupId, deletedAt: null },
      include: { course: { select: { priceCents: true } } },
    });
    if (!g) throw new NotFoundException({ code: 'GROUP_NOT_FOUND', message: 'Grupo no encontrado.' });
    return g;
  }

  private async findActiveWithRole(userId: string, role: 'TEACHER' | 'STUDENT', label: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: { roles: true },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado.');
    if (user.status !== 'ACTIVE') throw new BadRequestException(`La cuenta de ${user.fullName} no está activa.`);
    if (!user.roles.some((r) => r.role === role)) throw new BadRequestException(`${user.fullName} no tiene el rol de ${label}.`);
    return user;
  }
}
