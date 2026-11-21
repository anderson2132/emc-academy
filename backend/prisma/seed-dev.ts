/**
 * Usuarios de PRUEBA para desarrollo local: administrador, docente y alumno.
 * Idempotente. Se niega a correr con NODE_ENV=production.
 *
 *   npm run db:seed:dev
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
];

async function main() {
  console.log('Usuarios de prueba (solo desarrollo)');
  for (const u of TEST_USERS) {
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
    console.log(`  ✓ ${u.role.padEnd(7)} ${u.email}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
