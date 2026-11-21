import { defineConfig } from 'prisma/config';

// Carga backend/.env (Node 20.12+). En Railway las variables vienen del entorno.
try {
  process.loadEnvFile();
} catch {
  /* sin .env: se usan las variables del entorno */
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  // Migraciones por conexión DIRECTA: en Neon, la pooled (PgBouncer, modo transacción)
  // rompe Prisma Migrate. La app usa DATABASE_URL (pooled) desde PrismaService.
  // En local no hay pooler: se usa DATABASE_URL.
  datasource: {
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? '',
  },
});
