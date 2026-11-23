import type { PrismaService } from '../../prisma/prisma.service';
import {
  attendanceStats,
  AttendanceStats,
  attendanceWindow,
  effectiveStatus,
  EffectiveStatus,
  toLima,
} from '../../common/access/attendance.policy';

/** Clase tal como la ven las pantallas (con número correlativo y hora de Lima). */
export interface SessionView {
  id: string;
  /** N° de clase en orden cronológico (las canceladas no llevan número). */
  index: number | null;
  date: string;
  startTime: string;
  endTime: string;
  startsAt: string;
  endsAt: string;
  status: 'SCHEDULED' | 'RESCHEDULED' | 'DONE' | 'CANCELLED';
  attendanceOpensAt: string;
  attendanceClosesAt: string;
}

type SessionRow = { id: string; startsAt: Date; endsAt: Date; status: SessionView['status'] };

/** Ordena por fecha y numera solo las clases no canceladas. */
export function toSessionViews(rows: SessionRow[]): SessionView[] {
  let n = 0;
  return [...rows]
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .map((s) => {
      const start = toLima(s.startsAt);
      const w = attendanceWindow(s.startsAt);
      return {
        id: s.id,
        index: s.status === 'CANCELLED' ? null : ++n,
        date: start.date,
        startTime: start.time,
        endTime: toLima(s.endsAt).time,
        startsAt: s.startsAt.toISOString(),
        endsAt: s.endsAt.toISOString(),
        status: s.status,
        attendanceOpensAt: w.opensAt.toISOString(),
        attendanceClosesAt: w.closesAt.toISOString(),
      };
    });
}

export interface RosterStudent {
  id: string;
  fullName: string;
  email: string | null;
  username: string | null;
  enrolledAt: string | null;
  stats: AttendanceStats;
  /** sessionId → estado efectivo. */
  statuses: Record<string, EffectiveStatus>;
}

/** Asistencia de todo el grupo: clases × alumnos matriculados (APPROVED). */
export async function loadGroupRoster(prisma: PrismaService, groupId: string, now = new Date()) {
  const [sessions, enrollments, records] = await Promise.all([
    prisma.classSession.findMany({ where: { groupId }, select: { id: true, startsAt: true, endsAt: true, status: true } }),
    prisma.enrollment.findMany({
      where: { groupId, status: 'APPROVED' },
      orderBy: { createdAt: 'asc' },
      select: { approvedAt: true, createdAt: true, student: { select: { user: { select: { id: true, fullName: true, email: true, username: true } } } } },
    }),
    prisma.attendanceRecord.findMany({ where: { session: { groupId } }, select: { sessionId: true, studentId: true, status: true } }),
  ]);
  const views = toSessionViews(sessions);
  const byId = new Map(sessions.map((s) => [s.id, s]));
  const recordOf = new Map(records.map((r) => [`${r.sessionId}:${r.studentId}`, r]));

  const students: RosterStudent[] = enrollments.map((e) => {
    const u = e.student.user;
    const enrolledAt = e.approvedAt ?? e.createdAt;
    const statuses: Record<string, EffectiveStatus> = {};
    for (const v of views) {
      const s = byId.get(v.id)!;
      statuses[v.id] = effectiveStatus(now, s, recordOf.get(`${v.id}:${u.id}`) ?? null, enrolledAt);
    }
    return {
      id: u.id, fullName: u.fullName, email: u.email, username: u.username,
      enrolledAt: enrolledAt.toISOString(),
      stats: attendanceStats(Object.values(statuses)),
      statuses,
    };
  });
  return { sessions: views, students };
}

/** Clases y asistencia de UN alumno en varios grupos (vista del alumno o de su apoderado). */
export async function loadStudentSchedule(
  prisma: PrismaService,
  studentId: string,
  enrollments: { groupId: string; enrolledAt: Date }[],
  now = new Date(),
) {
  const groupIds = enrollments.map((e) => e.groupId);
  const [sessions, records] = await Promise.all([
    prisma.classSession.findMany({ where: { groupId: { in: groupIds } }, select: { id: true, groupId: true, startsAt: true, endsAt: true, status: true } }),
    prisma.attendanceRecord.findMany({ where: { studentId, session: { groupId: { in: groupIds } } }, select: { sessionId: true, status: true, markedAt: true } }),
  ]);
  const recordOf = new Map(records.map((r) => [r.sessionId, r]));
  const result = new Map<string, { sessions: (SessionView & { attendance: EffectiveStatus; markedAt: string | null })[]; stats: AttendanceStats }>();
  for (const e of enrollments) {
    const rows = sessions.filter((s) => s.groupId === e.groupId);
    const views = toSessionViews(rows).map((v) => {
      const r = recordOf.get(v.id) ?? null;
      return { ...v, attendance: effectiveStatus(now, rows.find((s) => s.id === v.id)!, r, e.enrolledAt), markedAt: r ? r.markedAt.toISOString() : null };
    });
    result.set(e.groupId, { sessions: views, stats: attendanceStats(views.map((v) => v.attendance)) });
  }
  return result;
}
