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
import type { CreateGroupDto } from './dto';

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
    return groups.map((g) => ({
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
          where: { status: { in: ['APPROVED', 'REQUESTED'] } },
          orderBy: { createdAt: 'asc' },
          include: {
            student: { include: { user: { select: { id: true, fullName: true, email: true } } } },
            payments: { where: { voidedAt: null }, select: { amountCents: true } },
          },
        },
      },
    });
    if (!g) throw new NotFoundException({ code: 'GROUP_NOT_FOUND', message: 'Grupo no encontrado.' });

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

  // ───────────── Alumno ─────────────

  async myCourses(user: AuthUser) {
    if (!user.roles.includes('STUDENT')) return [];
    const profile = await this.prisma.studentProfile.findUnique({
      where: { userId: user.id },
      include: { guardians: { where: { status: 'APPROVED' }, select: { guardianId: true } } },
    });
    if (!profile) return [];

    const enrollments = await this.prisma.enrollment.findMany({
      where: { studentId: user.id, status: 'APPROVED', group: { deletedAt: null } },
      orderBy: { group: { startDate: 'asc' } },
      include: {
        group: {
          include: {
            course: { select: { slug: true, name: true, line: true, level: true } },
            teachers: { include: { teacher: { include: { user: { select: { fullName: true } } } } } },
          },
        },
        payments: { where: { voidedAt: null }, select: { amountCents: true } },
      },
    });

    const now = new Date();
    return enrollments.map((e) => {
      const paidCents = e.payments.reduce((s, p) => s + p.amountCents, 0);
      const base = {
        now,
        user: { status: user.status, isStudent: true, birthDate: profile.birthDate, hasApprovedGuardian: profile.guardians.length > 0 },
        enrollment: { status: e.status, manualBlock: e.manualBlock, priceCents: e.priceCents, discountCents: e.discountCents, paidCents },
        group: { startDate: e.group.startDate, endDate: e.group.endDate },
      };
      const live = evaluateCourseAccess({ ...base, resource: 'LIVE' });
      const content = evaluateCourseAccess({ ...base, resource: 'CONTENT' });
      return {
        course: e.group.course,
        group: {
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
        zoomUrl: live.allowed ? e.group.zoomUrl : null,
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
