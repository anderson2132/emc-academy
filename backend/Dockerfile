# API EMC Academy + campus (frontend estático en el mismo origen)
# Contexto de construcción: RAÍZ del repositorio (ver /railway.json).

# ---------- Etapa 1: dependencias y compilación ----------
FROM node:26-slim AS build
WORKDIR /app
# openssl: requerido por el motor de migraciones de Prisma
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY backend/package.json backend/package-lock.json ./
COPY backend/prisma ./prisma
COPY backend/prisma.config.ts backend/tsconfig.json backend/tsconfig.build.json backend/nest-cli.json ./
# postinstall ejecuta `prisma generate` (allowScripts en package.json)
RUN npm ci

COPY backend/src ./src
RUN npm run build

# ---------- Etapa 2: ejecución ----------
FROM node:26-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production

# Se conserva node_modules completo: el CLI de Prisma aplica las migraciones al arrancar.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json /app/prisma.config.ts ./
COPY --from=build /app/prisma ./prisma
# Sitio estático: la API lo sirve desde /app/public (main.ts)
COPY frontend ./public

USER node
EXPOSE 3000
# Aplica migraciones pendientes (conexión directa) y levanta la API.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
