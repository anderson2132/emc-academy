/**
 * Usuarios de PRUEBA: administrador, docente, alumno y apoderado (vinculado al alumno).
 * Idempotente. Se niega a correr con NODE_ENV=production.
 *
 *   npm run db:seed:dev
 *   npm run db:seed:dev -- --only=GUARDIAN   # solo ese rol (no toca las demás contraseñas)
 *
 * La contraseña del apoderado se toma de TEST_GUARDIAN_PASSWORD si existe.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '../src/generated/prisma/client';
import type { Role } from '../src/generated/prisma/enums';

try {
  process.loadEnvFile();
} catch {
  /* sin .env */
}

if (process.env.NODE_ENV === 'production') {
  console.error('seed-dev no se ejecuta en producción.');
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

/** Contraseñas solo para pruebas locales. */
const TEST_USERS: { email: string; password: string; fullName: string; role: Role }[] = [
  { email: 'admin.prueba@emcacademy.local', password: 'AdminPrueba2026!', fullName: 'Admin de Prueba', role: 'ADMIN' },
  { email: 'docente.prueba@emcacademy.local', password: 'DocentePrueba2026!', fullName: 'Docente de Prueba', role: 'TEACHER' },
  { email: 'alumno.prueba@emcacademy.local', password: 'AlumnoPrueba2026!', fullName: 'Alumno de Prueba', role: 'STUDENT' },
  {
    email: 'apoderado.prueba@emcacademy.local',
    password: process.env.TEST_GUARDIAN_PASSWORD || 'ApoderadoPrueba2026!',
    fullName: 'Apoderado de Prueba',
    role: 'GUARDIAN',
  },
];

const ONLY = process.argv.find((a) => a.startsWith('--only='))?.slice('--only='.length).toUpperCase();

async function main() {
  console.log('Usuarios de prueba (solo desarrollo)');
  for (const u of TEST_USERS.filter((t) => !ONLY || t.role === ONLY)) {
    const data = {
      fullName: u.fullName,
      passwordHash: await hash(u.password),
      status: 'ACTIVE' as const,
      emailVerifiedAt: new Date(),
      failedLoginCount: 0,
      lockedUntil: null,
    };
    const user = await prisma.user.upsert({ where: { email: u.email }, create: { email: u.email, ...data }, update: data });
    await prisma.userRole.upsert({
      where: { userId_role: { userId: user.id, role: u.role } },
      create: { userId: user.id, role: u.role },
      update: {},
    });

    if (u.role === 'TEACHER') {
      await prisma.teacherProfile.upsert({
        where: { userId: user.id },
        create: { userId: user.id, slug: 'docente-de-prueba', bio: 'Perfil de prueba.', specialties: 'Python, IA', isPublic: false },
        update: {},
      });
    }
    if (u.role === 'STUDENT') {
      // Adulto: no requiere apoderado.
      await prisma.studentProfile.upsert({
        where: { userId: user.id },
        create: { userId: user.id, birthDate: new Date('2000-01-15T00:00:00Z') },
        update: {},
      });
    }
    if (u.role === 'GUARDIAN') {
      await prisma.guardianProfile.upsert({ where: { userId: user.id }, create: { userId: user.id }, update: {} });
      // Vínculo aprobado con el alumno de prueba, para ver "Mis hijos" y su calendario.
      const student = await prisma.user.findUnique({
        where: { email: 'alumno.prueba@emcacademy.local' },
        select: { studentProfile: { select: { userId: true } } },
      });
      if (student?.studentProfile) {
        const link = {
          relationship: 'Padre/Madre',
          status: 'APPROVED' as const,
          consentAt: new Date(),
          consentVersion: 'apoderado-v0-borrador',
        };
        await prisma.studentGuardian.upsert({
          where: { studentId_guardianId: { studentId: student.studentProfile.userId, guardianId: user.id } },
          create: { studentId: student.studentProfile.userId, guardianId: user.id, ...link },
          update: link,
        });
      } else {
        console.log('    (sin alumno de prueba: apoderado creado sin hijo vinculado)');
      }
    }
    console.log(`  ✓ ${u.role.padEnd(8)} ${u.email}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
