# EMC Academy — API (backend)

NestJS 12 · PostgreSQL 18 · Prisma 7 · Node.js 26. Arquitectura en [../docs/01-arquitectura.md](../docs/01-arquitectura.md).

## Base de datos local
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
