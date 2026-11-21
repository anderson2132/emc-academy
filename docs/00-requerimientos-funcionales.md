# 00 — Requerimientos funcionales (cerrados)

Decisiones tomadas con el responsable del proyecto el 2026-11-21. Donde difieren del prompt maestro, prevalece este documento.

## 1. Oferta académica
Formación tecnológica online en vivo por Zoom. **Catálogo completo (6 cursos), pago único de S/ 450 cada uno:**

| Curso | Línea | Nivel |
|---|---|---|
| Coding Explorers (Scratch) | Kids & Teens | 1 |
| Game Creators (GDevelop) | Kids & Teens | 2 |
| Young Developers (Python + Pygame) | Kids & Teens | 3 |
| Fundamento de IA | Programas | — |
| Ciberseguridad | Programas | — |
| Python | Programas | — |

- Duración: **32 horas = 16 clases de 2 h, 2 clases por semana (8 semanas)**.
- Un curso se dicta en uno o más **grupos** (ediciones), cada uno con fecha de inicio, horario, enlace Zoom y docente(s).
- SQL y Data Analytics (mencionados en el prompt) **no** forman parte del catálogo.

## 2. Portal público
- Visible para cualquiera: cursos, **precios**, docentes **con foto y perfil**, Kids & Teens, próximos inicios, contacto.
- **Solo usuarios registrados pueden inscribirse.** No hay formulario anónimo de inscripción.
- Contacto: WhatsApp y correo.

## 3. Cuentas y aprobaciones
- Todos (alumnos, apoderados, docentes) **se registran solos**: Google, Microsoft o correo/contraseña.
- **Doble aprobación del administrador:**
  1. Aprueba la **cuenta** (y asigna rol).
  2. Aprueba cada **matrícula** (solicitud de inscripción a un grupo).
- Autenticarse no da acceso a nada académico.

## 4. Menores y apoderados
- Al menor lo inscribe **el apoderado**, o el **propio menor con autorización del apoderado**.
- El menor tiene **cuenta propia**, vinculada al apoderado; la vinculación la autoriza el apoderado y la aprueba el admin.
- Un apoderado puede tener varios hijos; un menor, varios apoderados.
- El apoderado ve solo a sus hijos vinculados: cursos, horarios, asistencia, tareas, avisos y estado de pago. No modifica nada.

## 5. Pagos
- **Pago único por curso**, sin cuotas ni pasarela.
- El alumno/apoderado **envía el comprobante por WhatsApp**; el **admin registra el pago** manualmente en el campus.
- Plazo: **7 días desde el inicio del curso**. Vencido sin pago → **se bloquea el acceso a ese curso** (no a todo el campus).
- El admin puede **bloquear/desbloquear a demanda** (con motivo).
- Durante el plazo, el alumno y el apoderado ven un aviso de "pago pendiente".

## 6. Clases, grabaciones y materiales
- Se graban **todas** las clases (~2 h cada una).
- El alumno ve grabaciones y materiales hasta **6 meses después de terminar el curso**.
- Ver una grabación **no** cuenta como asistencia.

## 7. Asistencia (flexible)
- El alumno marca asistencia **en cualquier momento durante las 2 h de la clase**, una sola vez.
- Estados: **Presente**, **Falta** (automática al cerrar la clase si no marcó), **Justificado** (lo asigna el docente o admin).
- Sin tardanzas. Sin mínimo de asistencia para terminar. Se muestra el % al alumno, apoderado y admin.

## 8. Tareas
- En todos los cursos. El alumno entrega archivos; el docente revisa y deja **comentarios**.
- **Ningún curso lleva nota.**

## 9. Avisos
- Dentro del portal y por correo (automáticos).
- WhatsApp: **lo envía una persona manualmente**. La automatización queda para una fase posterior.

## 10. Volumen
- ~1000 alumnos.

## Fuera de alcance del MVP
Notas/calificaciones, certificados con QR, pasarela de pagos, integración automática con Zoom, WhatsApp automatizado, encuestas.
