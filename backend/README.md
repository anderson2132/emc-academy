# EMC Academy — API (backend)

NestJS 12 · PostgreSQL 18 · Prisma 7 · Node.js 26. Arquitectura en [../docs/01-arquitectura.md](../docs/01-arquitectura.md).

## Base de datos en línea (Neon) — la que usa hoy la API
- Proyecto Neon **EMC-ACADEMY** (`restless-shape-96734696`), rama `production`, base `neondb`, PostgreSQL 18, región AWS us-east-1. Cuenta: la personal de Anderson.
- `backend/neon.ts` declara los servicios (solo Postgres) y `backend/.neon` vincula la carpeta (excluido de git).
- `neon deploy` escribe en `.env`:
  - `DATABASE_URL` → conexión **pooled** (`-pooler`), la usa la API.
  - `DATABASE_URL_UNPOOLED` → conexión **directa**, la usan las migraciones (`prisma.config.ts`).
- Driver: `pg` (node-postgres) vía `@prisma/adapter-pg`, adecuado para una API de larga duración.
- Primera carga o nueva BD: `npm run db:setup` (migraciones + cursos + admin + usuarios de prueba).
- Requiere sesión del CLI: `neon login` (con la cuenta personal, **nunca** la del trabajo).
- Si `neon deploy` vuelve a escribir `sslmode=require`, cambiarlo a `sslmode=verify-full` (mismo nivel de seguridad, sin el aviso de `pg`).

## Ingreso con Google y Microsoft
Rutas: `GET /auth/oidc/{google|microsoft}` (inicia; `?mode=link` para vincular desde el panel) y `GET /auth/oidc/{proveedor}/callback`.
Reglas (ADR-006, `src/modules/auth/oidc/oidc-decision.ts`, con pruebas): no se vinculan cuentas por coincidencia de correo; las cuentas nuevas quedan **pendientes de aprobación**; vincular exige sesión iniciada.
Sin credenciales configuradas, el proveedor queda desactivado (`GET /auth/providers`).

**Direcciones de retorno a registrar** (una por entorno):
- Local: `http://localhost:3000/auth/oidc/google/callback` y `http://localhost:3000/auth/oidc/microsoft/callback`
- Producción: `https://api.emcacademy.pe/auth/oidc/google/callback` y `https://api.emcacademy.pe/auth/oidc/microsoft/callback`

**Google** (https://console.cloud.google.com, con la cuenta personal):
1. Crear proyecto `EMC Academy` → *APIs y servicios → Pantalla de consentimiento de OAuth*: tipo **Externo**, nombre "EMC Academy", correo de soporte, ámbitos `openid`, `email`, `profile`.
2. *Credenciales → Crear credenciales → ID de cliente de OAuth* → **Aplicación web** → agregar las direcciones de retorno.
3. Copiar el ID y el secreto en `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`.
4. Mientras la app esté "en pruebas", solo pueden ingresar los usuarios de prueba que agregues allí; para abrirlo a todos, *Publicar app*.

**Microsoft** (https://entra.microsoft.com, con la cuenta personal, nunca la del trabajo):
1. *Registros de aplicaciones → Nuevo registro*: nombre "EMC Academy"; tipos de cuenta: **cuentas de cualquier directorio y cuentas personales de Microsoft**; retorno: plataforma **Web** con la dirección local.
2. *Autenticación*: agregar también la dirección de producción.
3. *Certificados y secretos → Nuevo secreto de cliente* (anotar el **valor**, se muestra una sola vez; vence, renovarlo antes).
4. *Configuración del token → Agregar notificación opcional* → ID token → `email`.
5. Copiar el *Id. de aplicación (cliente)* en `MICROSOFT_CLIENT_ID` y el valor del secreto en `MICROSOFT_CLIENT_SECRET`; `MICROSOFT_TENANT=common`.

## Base de datos local (respaldo)
Para volver a la base local, copiar el valor de `DATABASE_URL_LOCAL` en `DATABASE_URL` y quitar `DATABASE_URL_UNPOOLED`.
El proyecto usa **su propia instancia de PostgreSQL 18** (no la del servicio de Windows):
- Puerto **5433**, usuario `emc`, base `emc_academy`. La conexión está en `backend/.env`.
- Datos en `%LOCALAPPDATA%\emc-academy\pgdata` (fuera de OneDrive a propósito: la sincronización puede dañar una base en uso).
- **No arranca sola al reiniciar la PC.** Encenderla con `npm run db:start` (y `npm run db:stop` / `npm run db:status`).

## Uso diario
```powershell
npm run db:start      # 1. base de datos
npm run start:dev     # 2. API en http://localhost:3000  (Swagger: /docs)
```
Y en otra terminal, el frontend: `cd ..\frontend; python -m http.server 8080` → http://localhost:8080

## Usuarios de prueba (solo desarrollo)
Creados con `npm run db:seed:dev`:

| Rol | Correo | Contraseña |
|---|---|---|
| Administrador | admin.prueba@emcacademy.local | AdminPrueba2026! |
| Docente | docente.prueba@emcacademy.local | DocentePrueba2026! |
| Alumno | alumno.prueba@emcacademy.local | AlumnoPrueba2026! |

## Desde cero (otra PC)
1. Copiar `.env.example` a `.env` y completar `DATABASE_URL` y `JWT_ACCESS_SECRET`.
2. `npm install`, luego `npm run db:migrate`, `npm run db:seed` y `npm run db:seed:dev`.

## Scripts
| Comando | Qué hace |
|---|---|
| `npm run start:dev` | API con recarga automática |
| `npm test` | Pruebas unitarias |
| `npm run typecheck` | Verificación de tipos |
| `npm run build` / `npm run start:prod` | Compilar y ejecutar como en producción |
| `npm run db:migrate -- --name <cambio>` | Nueva migración tras editar `prisma/schema.prisma` |
| `npm run db:seed` | Datos iniciales (idempotente) |
| `npm run db:studio` | Explorador visual de la BD |

## Qué está implementado (Etapa 2 inicial)
- **Modelo de datos completo** (`prisma/schema.prisma`): las 26 tablas del ERD.
- **Registro con correo**, verificación de correo, login, renovación de sesión con rotación y detección de reuso, logout, recuperación de contraseña, bloqueo tras 5 intentos fallidos.
- **Sesión en cookies httpOnly** (`emc_at` 15 min, `emc_rt` 30 días), CORS restringido, verificación de `Origin`, `helmet`, límite de peticiones.
- **Solicitud de cuenta** (alumno, apoderado, docente) y **aprobación/rechazo por el admin**; suspensión y reactivación de usuarios. Todo auditado.
- **Catálogo público**: `GET /courses`, `GET /courses/:slug`.
- **Regla de acceso a cursos** (`src/common/access/course-access.policy.ts`) con 24 pruebas: cuenta activa, apoderado aprobado para menores, matrícula aprobada, bloqueo manual, pago a 7 días del inicio y acceso a grabaciones hasta 6 meses (hora de Lima).

## Pendiente
- Login con Google y Microsoft (requiere dominio y credenciales).
- Envío real de correos (Brevo). Hoy los correos se **muestran en la consola** de la API: ahí aparecen los enlaces de verificación y recuperación.
- Etapas 3–7: apoderados, grupos, matrículas y pagos, clases, asistencia, grabaciones (Drive), materiales, tareas, avisos y reportes.

## Reglas para quien mantenga el código
- Toda ruta exige sesión y cuenta `ACTIVE`, salvo `@Public()` o `@AllowInactive()`.
- Restringir por rol con `@Roles('ADMIN')`, etc. El frontend nunca decide permisos.
- Todo acceso a contenido de un curso pasa por `evaluateCourseAccess`.
- Los cambios críticos se registran con `AuditService.log`.
- Montos en céntimos (`45000` = S/ 450). Fechas en UTC; "fin del día" en hora de Lima.
