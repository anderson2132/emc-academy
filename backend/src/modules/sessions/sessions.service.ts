import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, PrismaTx } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../../common/auth/auth-user';
import { evaluateCourseAccess } from '../../common/access/course-access.policy';
import {
  canMarkAttendance,
  effectiveStatus,
  generateSchedule,
  limaDateTime,
  MARK_MESSAGES,
  toLima,
} from '../../common/access/attendance.policy';
import { loadGroupRoster, loadStudentSchedule } from './attendance.data';
import type { GenerateSessionsDto, SessionDto } from './dto';

const DEFAULT_DURATION = 120;
const DEFAULT_COUNT = 16;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Clases programadas y asistencia.
 *  - El ADMIN programa (genera las 16 clases o agrega/edita/cancela una suelta) y corrige asistencia con motivo.
 *  - El ALUMNO ve su calendario y marca asistencia (±10 min del inicio).
 *  - El DOCENTE ve el calendario de sus grupos y quién marcó.
 *  - El APODERADO ve el calendario y la asistencia de sus hijos (solo lectura).
 */
@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ───────────── Administrador: programación ─────────────

  async listForGroup(groupId: string) {
    await this.findGroup(groupId);
    return loadGroupRoster(this.prisma, groupId);
  }

  async generate(admin: AuthUser, groupId: string, dto: GenerateSessionsDto, ip?: string) {
    const g = await this.findGroup(groupId);
    const existing = await this.prisma.classSession.count({ where: { groupId } });
    if (existing) {
      throw new ConflictException({ code: 'HAS_SESSIONS', message: 'El grupo ya tiene clases programadas. Edita o agrega clases sueltas.' });
    }
    const plan = generateSchedule({
      fromDate: dto.fromDate ?? isoDay(g.startDate),
      weekdays: dto.weekdays,
      startTime: dto.startTime,
      durationMinutes: dto.durationMinutes ?? DEFAULT_DURATION,
      count: dto.count ?? DEFAULT_COUNT,
    });
    if (!plan.length) throw new BadRequestException('No se pudo generar ninguna clase con esos datos.');

    await this.prisma.$transaction(async (tx) => {
      await tx.classSession.createMany({
        data: plan.map((p, i) => ({ groupId, number: i + 1, startsAt: p.startsAt, endsAt: p.endsAt })),
      });
      const end = await this.syncGroupDates(tx, groupId);
      await this.audit.log({
        actorId: admin.id, action: 'sessions.generate', entity: 'academic_group', entityId: groupId,
        after: { ...dto, created: plan.length, endDate: end }, ip,
      }, tx);
    });
    return { created: plan.length };
  }

  async addOne(admin: AuthUser, groupId: string, dto: SessionDto, ip?: string) {
    await this.findGroup(groupId);
    const { startsAt, endsAt } = this.times(dto);
    await this.prisma.$transaction(async (tx) => {
      const last = await tx.classSession.aggregate({ where: { groupId }, _max: { number: true } });
      const s = await tx.classSession.create({ data: { groupId, number: (last._max.number ?? 0) + 1, startsAt, endsAt } });
      await this.syncGroupDates(tx, groupId);
      await this.audit.log({ actorId: admin.id, action: 'session.create', entity: 'class_session', entityId: s.id, after: { ...dto }, ip }, tx);
    });
    return { ok: true };
  }

  /** Reprogramar una clase (cambia fecha/hora; la ventana de asistencia se mueve con ella). */
  async update(admin: AuthUser, sessionId: string, dto: SessionDto, ip?: string) {
    const s = await this.findSession(sessionId);
    const { startsAt, endsAt } = this.times(dto);
    const before = { ...toLima(s.startsAt), status: s.status };
    await this.prisma.$transaction(async (tx) => {
      await tx.classSession.update({
        where: { id: sessionId },
        data: { startsAt, endsAt, status: s.status === 'CANCELLED' ? 'CANCELLED' : 'RESCHEDULED' },
      });
      await this.syncGroupDates(tx, s.groupId);
      await this.audit.log({ actorId: admin.id, action: 'session.reschedule', entity: 'class_session', entityId: sessionId, before, after: { ...dto }, ip }, tx);
    });
    return { ok: true };
  }

  async setCancelled(admin: AuthUser, sessionId: string, cancelled: boolean, reason: string, ip?: string) {
    const s = await this.findSession(sessionId);
    if (cancelled === (s.status === 'CANCELLED')) {
      throw new ConflictException({ code: 'NO_CHANGE', message: cancelled ? 'La clase ya está cancelada.' : 'La clase no está cancelada.' });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.classSession.update({ where: { id: sessionId }, data: { status: cancelled ? 'CANCELLED' : 'SCHEDULED' } });
      await this.syncGroupDates(tx, s.groupId);
      await this.audit.log({ actorId: admin.id, action: cancelled ? 'session.cancel' : 'session.restore', entity: 'class_session', entityId: sessionId, after: { reason }, ip }, tx);
    });
    return { ok: true };
  }

  /** Eliminar una clase: solo si nadie registró asistencia en ella (si no, se cancela). */
  async remove(admin: AuthUser, sessionId: string, ip?: string) {
    const s = await this.findSession(sessionId);
    const records = await this.prisma.attendanceRecord.count({ where: { sessionId } });
    if (records) throw new ConflictException({ code: 'HAS_ATTENDANCE', message: 'La clase ya tiene asistencia registrada. Cancélala en lugar de eliminarla.' });
    await this.prisma.$transaction(async (tx) => {
      await tx.classSession.delete({ where: { id: sessionId } });
      await this.syncGroupDates(tx, s.groupId);
      await this.audit.log({ actorId: admin.id, action: 'session.delete', entity: 'class_session', entityId: sessionId, before: toLima(s.startsAt), ip }, tx);
    });
    return { ok: true };
  }

  /** Corrección del admin (p. ej. justificar una falta), siempre con motivo y registro del cambio. */
  async setAttendance(admin: AuthUser, sessionId: string, studentId: string, status: 'PRESENT' | 'ABSENT' | 'JUSTIFIED', reason: string, ip?: string) {
    const s = await this.findSession(sessionId);
    if (s.status === 'CANCELLED') throw new BadRequestException('La clase está cancelada.');
    const enrollment = await this.prisma.enrollment.findUnique({ where: { studentId_groupId: { studentId, groupId: s.groupId } } });
    if (!enrollment || enrollment.status !== 'APPROVED') throw new NotFoundException('El alumno no está matriculado en este grupo.');

    const record = await this.prisma.attendanceRecord.findUnique({ where: { sessionId_studentId: { sessionId, studentId } } });
    const from = effectiveStatus(new Date(), s, record, enrollment.approvedAt ?? enrollment.createdAt);
    if (from === status) throw new ConflictException({ code: 'NO_CHANGE', message: 'La asistencia ya tiene ese estado.' });

    await this.prisma.$transaction(async (tx) => {
      const r = record
        ? await tx.attendanceRecord.update({ where: { id: record.id }, data: { status } })
        : await tx.attendanceRecord.create({ data: { sessionId, studentId, status, source: 'ADMIN' } });
      await tx.attendanceAdjustment.create({
        data: {
          recordId: r.id,
          fromStatus: from === 'PRESENT' || from === 'JUSTIFIED' ? from : 'ABSENT',
          toStatus: status,
          reason,
          changedById: admin.id,
        },
      });
      await this.audit.log({ actorId: admin.id, action: 'attendance.adjust', entity: 'attendance_record', entityId: r.id, before: { status: from }, after: { status, reason, studentId, sessionId }, ip }, tx);
    });
    return { ok: true };
  }

  // ───────────── Alumno ─────────────

  async studentCalendar(user: AuthUser) {
    if (!user.roles.includes('STUDENT')) return { courses: [] };
    return this.calendarFor(user.id, true);
  }

  async mark(user: AuthUser, sessionId: string, ip?: string) {
    const s = await this.findSession(sessionId);
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { studentId_groupId: { studentId: user.id, groupId: s.groupId } },
      include: { payments: { where: { voidedAt: null }, select: { amountCents: true } } },
    });
    if (!enrollment || enrollment.status !== 'APPROVED' || s.group.deletedAt) throw new NotFoundException();

    // Mismo acceso que para entrar a Zoom (cuenta activa, apoderado si es menor, pago al día, grupo vigente).
    const profile = await this.prisma.studentProfile.findUnique({
      where: { userId: user.id },
      include: { guardians: { where: { status: 'APPROVED' }, select: { guardianId: true } } },
    });
    const now = new Date();
    const access = evaluateCourseAccess({
      now,
      resource: 'LIVE',
      user: { status: user.status, isStudent: user.roles.includes('STUDENT'), birthDate: profile?.birthDate ?? null, hasApprovedGuardian: !!profile?.guardians.length },
      enrollment: {
        status: enrollment.status, manualBlock: enrollment.manualBlock, priceCents: enrollment.priceCents,
        discountCents: enrollment.discountCents, paidCents: enrollment.payments.reduce((a, p) => a + p.amountCents, 0),
      },
      group: { startDate: s.group.startDate, endDate: s.group.endDate },
    });
    if (!access.allowed) throw new ForbiddenException({ code: access.reason, message: 'No tienes acceso a esta clase en este momento.' });

    const existing = await this.prisma.attendanceRecord.findUnique({ where: { sessionId_studentId: { sessionId, studentId: user.id } } });
    const d = canMarkAttendance(now, s, !!existing, enrollment.approvedAt ?? enrollment.createdAt);
    if (!d.allowed) {
      const body = { code: d.reason, message: MARK_MESSAGES[d.reason] };
      throw d.reason === 'ALREADY_MARKED' ? new ConflictException(body) : new BadRequestException(body);
    }

    try {
      await this.prisma.attendanceRecord.create({ data: { sessionId, studentId: user.id, status: 'PRESENT', source: 'STUDENT', markedAt: now } });
    } catch {
      // Doble clic simultáneo: la restricción única deja un solo registro.
      throw new ConflictException({ code: 'ALREADY_MARKED', message: MARK_MESSAGES.ALREADY_MARKED });
    }
    await this.audit.log({ actorId: user.id, action: 'attendance.mark', entity: 'class_session', entityId: sessionId, ip });
    return { ok: true, markedAt: now.toISOString() };
  }

  // ───────────── Apoderado ─────────────

  async childCalendar(user: AuthUser, studentId: string) {
    const link = await this.prisma.studentGuardian.findUnique({ where: { studentId_guardianId: { studentId, guardianId: user.id } } });
    if (!link || link.status !== 'APPROVED') throw new NotFoundException();
    return this.calendarFor(studentId, false);
  }

  // ───────────── Docente ─────────────

  async teacherCalendar(user: AuthUser) {
    if (!user.roles.includes('TEACHER')) return { groups: [] };
    const rows = await this.prisma.groupTeacher.findMany({
      where: { teacherId: user.id, group: { deletedAt: null, status: { not: 'CANCELLED' } } },
      select: { group: { select: { id: true, code: true, zoomUrl: true, course: { select: { name: true } } } } },
    });
    const now = new Date();
    const groups = await Promise.all(rows.map(async ({ group: g }) => {
      const roster = await loadGroupRoster(this.prisma, g.id, now);
      return {
        id: g.id, code: g.code, course: g.course.name, zoomUrl: g.zoomUrl,
        sessions: roster.sessions.map((v) => ({
          ...v,
          summary: this.countFor(roster.students.map((st) => st.statuses[v.id])),
        })),
      };
    }));
    return { groups };
  }

  /** Lista de asistencia de una clase (solo docentes de ese grupo). */
  async sessionAttendanceForTeacher(user: AuthUser, sessionId: string) {
    const s = await this.findSession(sessionId);
    const isTeacher = await this.prisma.groupTeacher.findUnique({ where: { groupId_teacherId: { groupId: s.groupId, teacherId: user.id } } });
    if (!isTeacher) throw new NotFoundException();
    const roster = await loadGroupRoster(this.prisma, s.groupId);
    return {
      session: roster.sessions.find((v) => v.id === sessionId),
      students: roster.students.map((st) => ({ id: st.id, fullName: st.fullName, status: st.statuses[sessionId], stats: st.stats })),
    };
  }

  // ───────────── Internos ─────────────

  private async calendarFor(studentId: string, isStudentView: boolean) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { studentId, status: 'APPROVED', group: { deletedAt: null, status: { not: 'CANCELLED' } } },
      select: {
        approvedAt: true, createdAt: true,
        group: { select: { id: true, code: true, zoomUrl: true, startDate: true, endDate: true, course: { select: { name: true, slug: true } } } },
      },
    });
    const schedule = await loadStudentSchedule(
      this.prisma, studentId, enrollments.map((e) => ({ groupId: e.group.id, enrolledAt: e.approvedAt ?? e.createdAt })),
    );
    return {
      courses: enrollments.map((e) => {
        const sch = schedule.get(e.group.id)!;
        return {
          group: { id: e.group.id, code: e.group.code },
          course: e.group.course,
          // El enlace se entrega en "Mis cursos" según la regla de acceso; aquí no se repite.
          stats: sch.stats,
          sessions: sch.sessions.map((s) => ({ ...s, canMark: isStudentView && s.attendance === 'PENDING' && new Date() >= new Date(s.attendanceOpensAt) })),
        };
      }),
    };
  }

  private countFor(statuses: string[]) {
    const c = { present: 0, absent: 0, justified: 0, pending: 0 };
    for (const s of statuses) {
      if (s === 'PRESENT') c.present++;
      else if (s === 'ABSENT') c.absent++;
      else if (s === 'JUSTIFIED') c.justified++;
      else if (s === 'PENDING') c.pending++;
    }
    return c;
  }

  private times(dto: SessionDto) {
    const startsAt = limaDateTime(dto.date, dto.startTime);
    return { startsAt, endsAt: new Date(startsAt.getTime() + (dto.durationMinutes ?? DEFAULT_DURATION) * 60_000) };
  }

  /** La fecha de fin del grupo sigue a su última clase (define el acceso a Zoom y los 6 meses de grabaciones). */
  private async syncGroupDates(tx: PrismaTx, groupId: string) {
    const last = await tx.classSession.findFirst({ where: { groupId, status: { not: 'CANCELLED' } }, orderBy: { startsAt: 'desc' } });
    if (!last) return null;
    const endDate = toLima(last.startsAt).date;
    await tx.academicGroup.update({ where: { id: groupId }, data: { endDate: new Date(`${endDate}T00:00:00.000Z`) } });
    return endDate;
  }

  private async findGroup(groupId: string) {
    const g = await this.prisma.academicGroup.findFirst({ where: { id: groupId, deletedAt: null } });
    if (!g) throw new NotFoundException({ code: 'GROUP_NOT_FOUND', message: 'Grupo no encontrado.' });
    return g;
  }

  private async findSession(sessionId: string) {
    const s = await this.prisma.classSession.findUnique({
      where: { id: sessionId },
      include: { group: { select: { deletedAt: true, startDate: true, endDate: true } } },
    });
    if (!s || s.group.deletedAt) throw new NotFoundException({ code: 'SESSION_NOT_FOUND', message: 'Clase no encontrada.' });
    return s;
  }
}

