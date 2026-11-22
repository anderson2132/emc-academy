# 04 — Flujos principales

## 1. Registro y aprobación de cuenta

```mermaid
sequenceDiagram
  autonumber
  actor U as Usuario
  participant W as Frontend (Pages)
  participant A as API
  participant P as Google / Microsoft
  participant M as Correo (Brevo)
  actor AD as Admin

  alt Google o Microsoft
    U->>W: "Continuar con Google"
    W->>A: GET /auth/google
    A->>P: redirección (PKCE, state, nonce)
    P-->>A: callback con código
    A->>A: busca identidad por (proveedor, sub)
    A->>A: si no existe: crea usuario PENDING_APPROVAL
  else Correo y contraseña
    U->>W: formulario de registro
    W->>A: POST /auth/register
    A->>M: enlace de verificación (vence en 24 h)
    U->>A: abre enlace → estado PENDING_APPROVAL
  end
  A-->>W: cookie de sesión (solo ve "en revisión")
  U->>W: elige perfil (alumno / apoderado / docente) y completa datos
  W->>A: POST /account-requests
  A->>AD: aviso "nueva solicitud"
  AD->>A: aprueba y asigna rol
  A->>A: estado ACTIVE + auditoría
  A->>M: "tu cuenta fue aprobada"
```

**Vincular otra forma de ingreso** (p. ej. agregar Google a una cuenta de correo): solo desde el perfil, con la sesión iniciada. Nunca automático por coincidencia de correo.

## 2. Menor de edad y apoderado

```mermaid
sequenceDiagram
  autonumber
  actor G as Apoderado
  actor N as Menor
  participant A as API
  actor AD as Admin

  alt El apoderado registra al menor
    G->>A: (cuenta ACTIVE) "Agregar hijo": datos + consentimiento
    A->>A: crea cuenta del menor (correo o usuario) y vínculo PENDING_ADMIN
    A-->>N: credenciales / invitación
  else El menor se registra solo
    N->>A: registro + fecha de nacimiento + correo del apoderado
    A->>A: detecta menor → vínculo PENDING_GUARDIAN
    A-->>G: correo "autoriza a tu hijo" (el apoderado inicia sesión o se registra)
    G->>A: autoriza + consentimiento
    A->>A: vínculo PENDING_ADMIN
  end
  AD->>A: aprueba cuenta del menor y vínculo
  A->>A: vínculo APPROVED, cuenta ACTIVE, auditoría
```

El consentimiento guarda la versión del texto aceptado, la fecha y la IP.

## 3. Inscripción, pago y bloqueo

> **Cambio 2026-11-22:** solo el administrador matricula (grupo → "Matricular alumno", o prematrícula). El diagrama conserva el pago y el bloqueo; los pasos de "Inscribirme" y aprobación de solicitud ya no aplican.

```mermaid
sequenceDiagram
  autonumber
  actor S as Alumno o apoderado
  participant W as Frontend
  participant A as API
  actor AD as Admin

  S->>W: en /programas/[curso]: "Inscribirme"
  W->>W: si no hay sesión → login/registro y vuelve
  W->>A: POST /enrollments (grupo, alumno)
  A->>A: valida cuenta ACTIVE, vínculo si es menor, cupos
  A->>AD: aviso "nueva solicitud de matrícula"
  AD->>A: aprueba matrícula
  A-->>S: "matrícula aprobada — paga S/ 450 hasta inicio + 7 días"
  S-->>AD: envía comprobante por WhatsApp (fuera del sistema)
  AD->>A: POST /payments (monto, método, n° operación)
  A->>A: pagado = sí, auditoría
  Note over A: Si inicio + 7 días pasa sin pago, la regla de acceso<br/>devuelve PAYMENT_OVERDUE (sin job, calculado en cada petición)
  AD->>A: (opcional) bloquear/desbloquear con motivo
```

## 4. Asistencia

```mermaid
sequenceDiagram
  autonumber
  actor S as Alumno
  participant A as API
  participant J as Job (cada 5 min)
  actor D as Docente

  Note over A: ventana = starts_at → ends_at de la clase (2 h)
  S->>A: POST /sessions/{id}/attendance
  A->>A: AccessPolicy (live) + dentro de la ventana + no marcado antes
  A->>A: PRESENT con hora del servidor
  A-->>S: "asistencia registrada"
  J->>A: clases con ends_at pasado y no cerradas
  A->>A: crea ABSENT para matriculados sin registro, cierra la clase
  D->>A: PATCH asistencia → JUSTIFIED (motivo obligatorio)
  A->>A: attendance_adjustments + auditoría
```

## 5. Grabación: publicación y reproducción

```mermaid
sequenceDiagram
  autonumber
  actor D as Docente o admin
  participant A as API
  participant G as Google Drive
  actor S as Alumno

  D->>G: sube MP4 de Zoom a la carpeta privada del grupo
  D->>A: asocia archivo a la clase N y publica
  A->>G: valida que la cuenta de servicio lo puede leer y obtiene duración/tamaño
  A-->>S: aviso "nueva grabación disponible"
  S->>A: GET /recordings/{id}/stream (Range: bytes=…)
  A->>A: AccessPolicy (contenido, hasta fin + 6 meses)
  A->>G: descarga el rango con la cuenta de servicio
  G-->>A: bytes
  A-->>S: 206 Partial Content (el video se reproduce)
  S->>A: PUT progreso visto (cada 30 s)
```

## 6. Prematrícula (admin registra antes de que exista la cuenta)

```mermaid
sequenceDiagram
  autonumber
  actor AD as Admin
  participant A as API
  actor P as Persona
  AD->>A: POST /admin/pre-enrollments (grupo, nombre, correo, descuento)
  A-->>P: correo "crea tu cuenta con este correo"
  P->>A: registro + verificación de correo
  P->>A: GET /me/pre-enrollments (coincide su correo VERIFICADO)
  P->>A: POST /me/pre-enrollments/{id}/claim → CLAIMED
  AD->>A: approve-claim (o /link a una cuenta elegida a mano)
  A->>A: cuenta ACTIVE como alumno + matrícula APPROVED + auditoría
```

Nunca se vincula sola por coincidencia de correo: el admin siempre confirma. Para menores sin correo (cuenta con usuario creada por el apoderado), el admin usa "Vincular a otra cuenta…".

## 7. Solicitudes de matrícula (retiradas)

Desde 2026-11-22 alumnos y apoderados ya no pueden pedir matrícula (se quitaron `POST /enrollments` y la autorización del apoderado). Solo quedan `/admin/enrollments` para revisar o rechazar solicitudes hechas antes del cambio; el bloque del panel aparece solo si existe alguna.
