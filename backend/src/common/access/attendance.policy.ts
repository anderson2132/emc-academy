/**
 * ASISTENCIA Y PROGRAMACIÓN DE CLASES — reglas puras (sin BD) para poder probarlas.
 *
 *  - El alumno marca asistencia desde 10 min ANTES hasta 10 min DESPUÉS del INICIO de la clase (hora del servidor).
 *  - Si no marcó y la ventana ya cerró → Falta (se calcula; no hace falta un proceso programado).
 *  - Justificada (la asigna el admin con motivo) NO cuenta como falta ni entra en el %.
 *  - Clases canceladas o anteriores a la matrícula del alumno no cuentan.
 *  - % = asistencias / (asistencias + faltas), solo sobre clases con ventana ya cerrada.
 */

export const ATTENDANCE_WINDOW_MINUTES = 10;
const MIN_MS = 60_000;
const DAY_MS = 24 * 60 * MIN_MS;
/** Perú: UTC-5 todo el año (sin horario de verano). */
const LIMA_OFFSET_MS = 5 * 60 * MIN_MS;

export type RecordStatus = 'PRESENT' | 'ABSENT' | 'JUSTIFIED';
export type SessionStatusValue = 'SCHEDULED' | 'RESCHEDULED' | 'DONE' | 'CANCELLED';
/** Estado de asistencia de un alumno en una clase, tal como se muestra. */
export type EffectiveStatus = RecordStatus | 'PENDING' | 'NOT_ENROLLED' | 'CANCELLED';

export interface SessionLike {
  startsAt: Date;
  status: SessionStatusValue;
}

export function attendanceWindow(startsAt: Date): { opensAt: Date; closesAt: Date } {
  return {
    opensAt: new Date(startsAt.getTime() - ATTENDANCE_WINDOW_MINUTES * MIN_MS),
    closesAt: new Date(startsAt.getTime() + ATTENDANCE_WINDOW_MINUTES * MIN_MS),
  };
}

/**
 * Estado de un alumno en una clase.
 * @param enrolledAt cuándo se aprobó su matrícula (null = desde siempre).
 */
export function effectiveStatus(now: Date, session: SessionLike, record: { status: RecordStatus } | null, enrolledAt: Date | null): EffectiveStatus {
  if (session.status === 'CANCELLED') return 'CANCELLED';
  const { closesAt } = attendanceWindow(session.startsAt);
  if (record) return record.status;
  if (enrolledAt && closesAt <= enrolledAt) return 'NOT_ENROLLED';
  return now > closesAt ? 'ABSENT' : 'PENDING';
}

export interface AttendanceStats {
  present: number;
  absent: number;
  justified: number;
  /** Clases que cuentan para el % (asistencias + faltas). */
  counted: number;
  /** null si todavía no hay clases que cuenten. */
  presentPct: number | null;
  absentPct: number | null;
}

export function attendanceStats(statuses: EffectiveStatus[]): AttendanceStats {
  const present = statuses.filter((s) => s === 'PRESENT').length;
  const absent = statuses.filter((s) => s === 'ABSENT').length;
  const justified = statuses.filter((s) => s === 'JUSTIFIED').length;
  const counted = present + absent;
  const pct = (n: number) => (counted ? Math.round((n / counted) * 1000) / 10 : null);
  return { present, absent, justified, counted, presentPct: pct(present), absentPct: pct(absent) };
}

export type MarkDenyReason = 'SESSION_CANCELLED' | 'WINDOW_NOT_OPEN' | 'WINDOW_CLOSED' | 'ALREADY_MARKED' | 'NOT_ENROLLED_YET';

export function canMarkAttendance(now: Date, session: SessionLike, alreadyMarked: boolean, enrolledAt: Date | null):
  { allowed: true } | { allowed: false; reason: MarkDenyReason } {
  const deny = (reason: MarkDenyReason) => ({ allowed: false as const, reason });
  if (session.status === 'CANCELLED') return deny('SESSION_CANCELLED');
  if (alreadyMarked) return deny('ALREADY_MARKED');
  const { opensAt, closesAt } = attendanceWindow(session.startsAt);
  if (enrolledAt && closesAt <= enrolledAt) return deny('NOT_ENROLLED_YET');
  if (now < opensAt) return deny('WINDOW_NOT_OPEN');
  if (now > closesAt) return deny('WINDOW_CLOSED');
  return { allowed: true };
}

export const MARK_MESSAGES: Record<MarkDenyReason, string> = {
  SESSION_CANCELLED: 'Esta clase fue cancelada.',
  WINDOW_NOT_OPEN: `La asistencia se marca desde ${ATTENDANCE_WINDOW_MINUTES} minutos antes del inicio de la clase.`,
  WINDOW_CLOSED: `El tiempo para marcar asistencia terminó (hasta ${ATTENDANCE_WINDOW_MINUTES} minutos después del inicio).`,
  ALREADY_MARKED: 'Ya registraste tu asistencia en esta clase.',
  NOT_ENROLLED_YET: 'Esta clase fue antes de tu matrícula.',
};

// ───────────── Programación de clases ─────────────

/** "AAAA-MM-DD" + "HH:MM" en hora de Lima → instante UTC. */
export function limaDateTime(date: string, time: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh, mm) + LIMA_OFFSET_MS);
}

/** Instante UTC → { date: "AAAA-MM-DD", time: "HH:MM" } en hora de Lima. */
export function toLima(instant: Date): { date: string; time: string } {
  const iso = new Date(instant.getTime() - LIMA_OFFSET_MS).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

export interface ScheduleInput {
  /** Primer día posible (AAAA-MM-DD, hora de Lima). */
  fromDate: string;
  /** Días de la semana: 1 = lunes … 7 = domingo. */
  weekdays: number[];
  /** Hora de inicio "HH:MM" (Lima). */
  startTime: string;
  durationMinutes: number;
  count: number;
}

/** Genera `count` clases en los días indicados, desde `fromDate` inclusive, en orden. */
export function generateSchedule(input: ScheduleInput): { startsAt: Date; endsAt: Date }[] {
  const days = new Set(input.weekdays.map((w) => w % 7)); // 7 (domingo) → 0, como getUTCDay()
  if (!days.size || input.count < 1) return [];
  const out: { startsAt: Date; endsAt: Date }[] = [];
  const [y, m, d] = input.fromDate.split('-').map(Number);
  let day = Date.UTC(y, m - 1, d);
  // Tope de seguridad: un año.
  for (let i = 0; i < 366 && out.length < input.count; i++, day += DAY_MS) {
    if (!days.has(new Date(day).getUTCDay())) continue;
    const date = new Date(day).toISOString().slice(0, 10);
    const startsAt = limaDateTime(date, input.startTime);
    out.push({ startsAt, endsAt: new Date(startsAt.getTime() + input.durationMinutes * MIN_MS) });
  }
  return out;
}
