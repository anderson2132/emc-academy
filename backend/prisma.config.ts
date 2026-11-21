import { defineConfig, env } from 'prisma/config';

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
  datasource: {
    url: env('DATABASE_URL'),
  },
});
