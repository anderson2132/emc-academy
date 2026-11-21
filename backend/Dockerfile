# API EMC Academy — imagen para Railway (o cualquier plataforma con Docker)

# ---------- Etapa 1: dependencias y compilación ----------
FROM node:26-slim AS build
WORKDIR /app
# openssl: requerido por el motor de migraciones de Prisma
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts tsconfig.json tsconfig.build.json nest-cli.json ./
# postinstall ejecuta `prisma generate` (allowScripts en package.json)
RUN npm ci

COPY src ./src
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

USER node
EXPOSE 3000
# Aplica migraciones pendientes (conexión directa) y levanta la API.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
