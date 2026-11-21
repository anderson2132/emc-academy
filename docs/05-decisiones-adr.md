# 05 — Registro de decisiones (ADR)

Formato: contexto → decisión → consecuencias. Estado: **Aceptada** (confirmada por el responsable) o **Propuesta** (pendiente de confirmación).

---

## ADR-001 · Monolito modular con frontend y backend separados — Aceptada
**Contexto:** ~1000 alumnos, un solo mantenedor apoyado en IA, reglas de acceso no triviales.
**Decisión:** un frontend Next.js y un backend NestJS separados, comunicados por API REST. El backend es un solo servicio dividido en módulos.
**Consecuencias:** + reglas centralizadas y probables; + frontend estático barato. − dos despliegues; − requiere mismo dominio para la cookie.

## ADR-002 · Sin AWS — Aceptada
**Contexto:** el prompt maestro asumía AWS (Cognito, S3, CloudFront, Terraform). El responsable decidió no usar AWS.
**Decisión:** reemplazar por GitHub Pages, Railway, Google Drive y login propio (ADR-003 a 007). Terraform no aplica en el MVP; la configuración de Railway se documenta en el repo.
**Consecuencias:** costo menor y menos piezas; se pierde CDN de video y URLs firmadas nativas.

## ADR-003 · Frontend en GitHub Pages con Next.js exportado — Aceptada
**Decisión:** `output: 'export'`. Portal generado en build; campus como SPA en cliente. Reconstrucción por `repository_dispatch` al publicar cambios desde el admin.
**Consecuencias:** + hosting gratuito, rápido y con buen SEO. − sin SSR/middleware; rutas del campus con query params; cambios del catálogo tardan ~2 min en verse.

## ADR-004 · Backend NestJS en Railway — Propuesta
**Alternativas:** Render Starter (similar), VPS Hetzner/Contabo (más barato, más operación), planes gratuitos (se duermen: descartados por la marca de asistencia simultánea).
**Decisión:** Railway (plan Hobby), contenedor Docker, despliegue automático desde `main`, entornos staging y production.
**Consecuencias:** + operación mínima, rollback en un clic. − el tráfico de video se paga por GB.

## ADR-005 · PostgreSQL + Prisma — Propuesta
**Decisión:** PostgreSQL 16 (open source) en Railway, Prisma como ORM y migraciones versionadas. Respaldo diario propio a Drive además del de Railway.
**Alternativa:** Neon (gratuito hasta 0.5 GB).
**Consecuencias:** + tipado de punta a punta, migraciones simples. − Prisma limita algunas consultas avanzadas (se usa SQL crudo cuando haga falta).

## ADR-006 · Login propio en el backend — Aceptada
**Decisión:** Google y Microsoft vía OIDC (Authorization Code + PKCE) y correo/contraseña (Argon2id), con sesión en cookies httpOnly (JWT de 15 min + refresh rotativo). Identidades externas en `user_identities`; vinculación solo explícita.
**Consecuencias:** + sin costo ni dependencia de terceros. − verificación de correo, recuperación y protección contra fuerza bruta las implementamos nosotros.

## ADR-007 · Video en Google Drive privado, servido por el backend — Aceptada
**Contexto:** el responsable eligió Google Drive. Compartir enlaces de Drive rompería el bloqueo por pago y el límite de 6 meses.
**Decisión:** carpetas privadas accesibles solo por una cuenta de servicio; la API valida acceso y transmite el video por rangos. El acceso a Drive está aislado en el módulo `files`.
**Consecuencias:** + control total del acceso, costo bajo de almacenamiento. − el tráfico pasa por Railway (~US$ 15–20/mes); sin calidad adaptativa; posibles límites de Drive. Plan B: cambiar el adaptador a Bunny Stream o Cloudflare R2.

## ADR-008 · Correo transaccional con Brevo — Propuesta
**Decisión:** Brevo, plan gratuito (300 correos/día), SPF/DKIM en el dominio.
**Consecuencias:** suficiente para ~10 grupos simultáneos; si se supera, plan pago o Resend.

## ADR-009 · Monorepo privado con GitHub Pro — Propuesta
**Contexto:** Pages desde repositorio privado requiere plan pago; un monorepo facilita el trabajo con IA.
**Decisión:** un repositorio privado (`frontend/`, `backend/`, `docs/`) con GitHub Pro (~US$ 4/mes).
**Alternativa:** repo público (gratis) o dos repos (frontend público, backend privado).

## ADR-010 · Estado de pago y acceso calculados, no almacenados — Aceptada
**Decisión:** "pagado", "vencido" y "acceso vigente" se calculan en cada petición a partir de pagos y fechas. Solo se guarda el bloqueo manual.
**Consecuencias:** + nunca hay estados desfasados ni jobs de bloqueo que fallen. − consultas algo más costosas (irrelevante al volumen actual).

## ADR-011 · Asistencia flexible — Aceptada
**Decisión:** ventana = duración de la clase; estados PRESENT / ABSENT / JUSTIFIED; sin tardanza ni mínimo.
**Consecuencias:** simple para alumnos y docentes; la marca no prueba permanencia en Zoom (riesgo aceptado).
