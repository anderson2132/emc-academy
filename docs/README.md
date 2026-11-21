# EMC Academy — Documentación de arquitectura (Etapa 1)

Portal institucional + Campus Virtual. Versión 0.1 — 2026-11-21 — **borrador para revisión**.

| # | Documento | Contenido |
|---|---|---|
| 00 | [Requerimientos funcionales](00-requerimientos-funcionales.md) | Decisiones de negocio cerradas |
| 01 | [Arquitectura de solución](01-arquitectura.md) | Despliegue, componentes, frontend, backend, seguridad, ambientes, costos, riesgos, repositorio |
| 02 | [Modelo de datos](02-modelo-de-datos.md) | ERD y reglas de integridad |
| 03 | [Roles y permisos](03-roles-y-permisos.md) | Matriz RBAC y regla de acceso a cursos |
| 04 | [Flujos](04-flujos.md) | Registro/aprobación, menores, inscripción y pago, asistencia, video |
| 05 | [Decisiones (ADR)](05-decisiones-adr.md) | Registro de decisiones técnicas |
| 06 | [Pendientes](06-pendientes.md) | Lo que falta decidir antes de construir |

Fuente original: [Promt/EMC_Academy_Prompt_Maestro_V1.txt](../Promt/EMC_Academy_Prompt_Maestro_V1.txt).
Los cambios respecto del prompt (sin AWS, catálogo de 6 cursos, sin notas, etc.) están registrados en 00 y 05.

## Resumen en una línea
Next.js estático en **GitHub Pages** → API **NestJS** en **Railway** → **PostgreSQL**; videos en **Google Drive privado** transmitidos por el backend tras validar acceso; login propio (Google, Microsoft, correo).

## Próximas etapas (no iniciadas)
- Wireframes y design system (tokens de EMC INNOVATE).
- Contrato OpenAPI detallado.
- Etapas 2–7 del roadmap.
