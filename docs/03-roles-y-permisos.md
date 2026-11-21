# 03 — Roles, permisos y regla de acceso

Toda verificación ocurre en el **backend**. El frontend oculta botones solo por comodidad.

## 1. Estados de cuenta
```mermaid
stateDiagram-v2
  [*] --> PENDING_VERIFICATION: registro con correo
  [*] --> PENDING_APPROVAL: registro con Google / Microsoft
  PENDING_VERIFICATION --> PENDING_APPROVAL: verifica correo
  PENDING_APPROVAL --> ACTIVE: admin aprueba y asigna rol
  PENDING_APPROVAL --> REJECTED: admin rechaza
  ACTIVE --> SUSPENDED: admin suspende
  SUSPENDED --> ACTIVE: admin reactiva
```
Solo `ACTIVE` puede usar el campus. Los demás estados ven únicamente una pantalla de "solicitud en revisión".

## 2. Regla de acceso al contenido de un curso
Implementada una sola vez en `AccessPolicyService` y cubierta por pruebas automáticas.

```mermaid
flowchart TD
  A["Petición del alumno a un recurso del grupo G"] --> B{"Cuenta ACTIVE<br/>con rol STUDENT?"}
  B -- no --> X["403"]
  B -- sí --> C{"¿Es menor?"}
  C -- sí --> C2{"Vínculo con apoderado<br/>APPROVED?"}
  C2 -- no --> X
  C2 -- sí --> D
  C -- no --> D{"Matrícula en G<br/>APPROVED?"}
  D -- no --> X
  D -- sí --> E{"¿Bloqueo manual<br/>del admin?"}
  E -- sí --> XB["403 · acceso bloqueado"]
  E -- no --> F{"¿Pagado?"}
  F -- sí --> H
  F -- no --> G{"Hoy ≤ inicio + 7 días?"}
  G -- no --> XP["403 · pago pendiente vencido"]
  G -- sí --> H{"Tipo de recurso"}
  H -- "clase en vivo, Zoom,<br/>marcar asistencia" --> I{"Grupo no terminado?"}
  H -- "grabaciones, materiales,<br/>tareas" --> J{"Hoy ≤ fin + 6 meses?"}
  I -- sí --> OK["Permitido"]
  I -- no --> X
  J -- sí --> OK
  J -- no --> XV["403 · acceso vencido"]
```

Las respuestas 403 incluyen un código (`ACCOUNT_NOT_ACTIVE`, `GUARDIAN_NOT_APPROVED`, `ENROLLMENT_NOT_APPROVED`, `MANUAL_BLOCK`, `PAYMENT_OVERDUE`, `ACCESS_EXPIRED`) para que el frontend muestre el mensaje correcto.

## 3. Matriz de permisos

Leyenda: ✅ total · 👁 solo lectura · 🔒 solo lo suyo · ➖ sin acceso

| Recurso / acción | Admin | Docente | Alumno | Apoderado |
|---|---|---|---|---|
| Aprobar/rechazar cuentas, asignar roles | ✅ | ➖ | ➖ | ➖ |
| Suspender/reactivar usuarios | ✅ | ➖ | ➖ | ➖ |
| Cursos y módulos (crear/editar) | ✅ | ➖ | ➖ | ➖ |
| Grupos (crear, horario, Zoom, asignar docente) | ✅ | 👁 sus grupos | ➖ | ➖ |
| Publicar portal (reconstruir sitio) | ✅ | ➖ | ➖ | ➖ |
| Solicitar matrícula | ✅ | ➖ | 🔒 para sí | 🔒 para sus hijos |
| Aprobar/rechazar matrícula | ✅ | ➖ | ➖ | ➖ |
| Bloquear/desbloquear matrícula | ✅ | ➖ | ➖ | ➖ |
| Registrar/anular pagos | ✅ | ➖ | ➖ | ➖ |
| Ver estado de pago | ✅ | ➖ | 🔒 | 🔒 de sus hijos |
| Ver alumnos de un grupo | ✅ | 🔒 sus grupos | ➖ | ➖ |
| Enlace Zoom | ✅ | 🔒 sus grupos | 🔒 con acceso | ➖ |
| Marcar asistencia propia | ➖ | ➖ | 🔒 durante la clase | ➖ |
| Justificar / corregir asistencia (con motivo) | ✅ | 🔒 sus grupos | ➖ | ➖ |
| Ver asistencia | ✅ | 🔒 sus grupos | 🔒 | 🔒 de sus hijos |
| Publicar grabaciones y materiales | ✅ | 🔒 sus grupos | ➖ | ➖ |
| Ver grabaciones y materiales | ✅ | 🔒 sus grupos | 🔒 con acceso | ➖ |
| Publicar tareas y dar comentarios | ✅ | 🔒 sus grupos | ➖ | ➖ |
| Entregar tareas | ➖ | ➖ | 🔒 con acceso | ➖ |
| Ver tareas y comentarios | ✅ | 🔒 sus grupos | 🔒 | 🔒 de sus hijos |
| Autorizar vínculo con un menor | ✅ aprueba | ➖ | ➖ | 🔒 autoriza |
| Reportes y exportación (Excel/PDF) | ✅ | 🔒 sus grupos | ➖ | ➖ |
| Auditoría | 👁 | ➖ | ➖ | ➖ |
| Perfil propio | ✅ | ✅ (+ perfil público) | ✅ | ✅ |

El apoderado no ve grabaciones ni materiales: son para el alumno. Ve el avance (asistencia, tareas entregadas y comentarios).

## 4. Pruebas obligatorias de autorización
Cada fila con 🔒 tiene al menos una prueba que demuestra que **otro** usuario del mismo rol recibe 403. Ejemplos: un docente intenta ver la asistencia de un grupo ajeno; un apoderado intenta ver a un menor no vinculado; un alumno pide el stream de una grabación de otro grupo; un alumno con pago vencido pide el enlace de Zoom.
