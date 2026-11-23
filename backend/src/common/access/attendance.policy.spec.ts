import {
  attendanceStats,
  attendanceWindow,
  canMarkAttendance,
  effectiveStatus,
  generateSchedule,
  limaDateTime,
  toLima,
} from './attendance.policy';

// Clase el lunes 7 dic. 2026 a las 7:00 p. m. (Lima) = 8 dic. 00:00 UTC.
const START = limaDateTime('2026-12-07', '19:00');
const session = { startsAt: START, status: 'SCHEDULED' as const };
const at = (hhmm: string, date = '2026-12-07') => limaDateTime(date, hhmm);

describe('hora de Lima', () => {
  it('7:00 p. m. Lima = 00:00 UTC del día siguiente', () => {
    expect(START.toISOString()).toBe('2026-12-08T00:00:00.000Z');
    expect(toLima(START)).toEqual({ date: '2026-12-07', time: '19:00' });
  });
});

describe('ventana de asistencia (±10 min del inicio)', () => {
  it('abre 6:50 y cierra 7:10', () => {
    const w = attendanceWindow(START);
    expect(toLima(w.opensAt).time).toBe('18:50');
    expect(toLima(w.closesAt).time).toBe('19:10');
  });

  it.each([['18:50'], ['19:00'], ['19:10']])('a las %s se puede marcar', (t) => {
    expect(canMarkAttendance(at(t), session, false, null)).toEqual({ allowed: true });
  });

  it('a las 6:49 todavía no → WINDOW_NOT_OPEN', () => {
    expect(canMarkAttendance(at('18:49'), session, false, null)).toEqual({ allowed: false, reason: 'WINDOW_NOT_OPEN' });
  });

  it('a las 7:11 ya no → WINDOW_CLOSED', () => {
    expect(canMarkAttendance(at('19:11'), session, false, null)).toEqual({ allowed: false, reason: 'WINDOW_CLOSED' });
  });

  it('dos veces no → ALREADY_MARKED', () => {
    expect(canMarkAttendance(at('19:00'), session, true, null)).toEqual({ allowed: false, reason: 'ALREADY_MARKED' });
  });

  it('clase cancelada → SESSION_CANCELLED', () => {
    expect(canMarkAttendance(at('19:00'), { ...session, status: 'CANCELLED' }, false, null))
      .toEqual({ allowed: false, reason: 'SESSION_CANCELLED' });
  });
});

describe('estado efectivo', () => {
  it('sin marcar y ventana abierta → PENDING', () => {
    expect(effectiveStatus(at('19:05'), session, null, null)).toBe('PENDING');
  });
  it('sin marcar y ventana cerrada → ABSENT (falta automática)', () => {
    expect(effectiveStatus(at('19:11'), session, null, null)).toBe('ABSENT');
  });
  it('con registro → el del registro', () => {
    expect(effectiveStatus(at('21:00'), session, { status: 'JUSTIFIED' }, null)).toBe('JUSTIFIED');
  });
  it('clase anterior a la matrícula → NOT_ENROLLED (no cuenta)', () => {
    expect(effectiveStatus(at('10:00', '2026-12-20'), session, null, at('08:00', '2026-12-10'))).toBe('NOT_ENROLLED');
  });
  it('cancelada → CANCELLED', () => {
    expect(effectiveStatus(at('21:00'), { ...session, status: 'CANCELLED' }, null, null)).toBe('CANCELLED');
  });
});

describe('porcentajes', () => {
  it('3 asistencias y 1 falta → 75% / 25%', () => {
    expect(attendanceStats(['PRESENT', 'PRESENT', 'ABSENT', 'PRESENT']))
      .toEqual({ present: 3, absent: 1, justified: 0, counted: 4, presentPct: 75, absentPct: 25 });
  });
  it('justificadas, pendientes, canceladas y previas a la matrícula no cuentan', () => {
    expect(attendanceStats(['PRESENT', 'JUSTIFIED', 'PENDING', 'CANCELLED', 'NOT_ENROLLED', 'ABSENT']))
      .toEqual({ present: 1, absent: 1, justified: 1, counted: 2, presentPct: 50, absentPct: 50 });
  });
  it('sin clases dictadas → % null', () => {
    expect(attendanceStats(['PENDING'])).toMatchObject({ counted: 0, presentPct: null, absentPct: null });
  });
  it('redondea a un decimal (2 de 3 → 66.7%)', () => {
    expect(attendanceStats(['PRESENT', 'PRESENT', 'ABSENT'])).toMatchObject({ presentPct: 66.7, absentPct: 33.3 });
  });
});

describe('generar horario', () => {
  it('lunes y miércoles 7 p. m., 16 clases de 2 h desde un lunes', () => {
    const s = generateSchedule({ fromDate: '2026-12-07', weekdays: [1, 3], startTime: '19:00', durationMinutes: 120, count: 16 });
    expect(s).toHaveLength(16);
    expect(toLima(s[0].startsAt)).toEqual({ date: '2026-12-07', time: '19:00' });
    expect(toLima(s[1].startsAt)).toEqual({ date: '2026-12-09', time: '19:00' });
    expect(toLima(s[15].startsAt).date).toBe('2027-01-27');
    expect(toLima(s[0].endsAt).time).toBe('21:00');
  });
  it('si el inicio no cae en un día elegido, empieza en el siguiente', () => {
    const s = generateSchedule({ fromDate: '2026-12-08', weekdays: [1, 3], startTime: '19:00', durationMinutes: 120, count: 2 });
    expect(s.map((x) => toLima(x.startsAt).date)).toEqual(['2026-12-09', '2026-12-14']);
  });
  it('domingo = 7', () => {
    const s = generateSchedule({ fromDate: '2026-12-07', weekdays: [7], startTime: '10:00', durationMinutes: 120, count: 1 });
    expect(toLima(s[0].startsAt).date).toBe('2026-12-13');
  });
  it('sin días → vacío', () => {
    expect(generateSchedule({ fromDate: '2026-12-07', weekdays: [], startTime: '10:00', durationMinutes: 120, count: 16 })).toEqual([]);
  });
});
