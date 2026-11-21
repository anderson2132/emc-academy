# EMC Academy — Portal institucional + Campus Virtual

| Carpeta | Contenido |
|---|---|
| [docs/](docs/) | Arquitectura y decisiones (Etapa 1) |
| [frontend/](frontend/) | **Prototipo** del portal público en HTML/CSS/JS puro |
| [backend/](backend/) | API NestJS + PostgreSQL + Prisma (ver su [README](backend/README.md)) |
| [Promt/](Promt/) | Prompt maestro original |
| [información/](información/) | Logos originales |

## Ver el portal localmente
Opción 1: abrir `frontend/index.html` con doble clic.

Opción 2 (recomendada, simula un servidor real):
```powershell
cd frontend
python -m http.server 8080
```
y abrir http://localhost:8080

## Estado del prototipo
- Portal público completo: inicio, programas (con buscador y filtros), detalle de programa, Kids & Teens, próximos inicios, docentes, nosotros, contacto.
- Campus Virtual: solo la pantalla de acceso (sin funcionalidad; requiere backend).
- Datos en [frontend/js/data.js](frontend/js/data.js): editar ahí cursos, docentes, FAQ y contacto.
- Pendiente de contenido real: temarios (hoy referenciales), docentes, fechas de inicio, contacto oficial, textos legales.

Según la arquitectura ([docs/01-arquitectura.md](docs/01-arquitectura.md)), este prototipo se migrará a Next.js cuando se instale Node.js.
