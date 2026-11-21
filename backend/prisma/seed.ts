/**
 * Datos iniciales: los 6 cursos del catálogo y el administrador.
 * Idempotente: se puede ejecutar varias veces (npm run db:seed).
 * Temarios y textos: BORRADOR, igual que frontend/js/data.js.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '../src/generated/prisma/client';
import type { CourseLine } from '../src/generated/prisma/enums';

try {
  process.loadEnvFile();
} catch {
  /* sin .env */
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

interface SeedCourse {
  slug: string;
  name: string;
  line: CourseLine;
  level?: number;
  tool?: string;
  summary: string;
  objective: string;
  audience: string;
  requirements: string[];
  modules: string[];
}

const COURSES: SeedCourse[] = [
  {
    slug: 'python', name: 'Python', line: 'PROGRAM',
    summary: 'Aprende a programar desde cero con el lenguaje más usado en datos, automatización e inteligencia artificial.',
    objective: 'Que el participante escriba programas en Python para resolver problemas reales y automatizar tareas.',
    audience: 'Estudiantes, profesionales y personas que quieren iniciarse en la programación.',
    requirements: ['Computadora con conexión a internet', 'No se requiere experiencia previa'],
    modules: ['Fundamentos: variables, tipos de datos y operadores', 'Estructuras de control y funciones', 'Listas, diccionarios y manejo de archivos', 'Programación orientada a objetos', 'Librerías y automatización de tareas', 'Proyecto final'],
  },
  {
    slug: 'fundamento-de-ia', name: 'Fundamento de IA', line: 'PROGRAM',
    summary: 'Comprende cómo funciona la inteligencia artificial y aplícala de forma práctica y responsable en tu trabajo.',
    objective: 'Que el participante entienda los conceptos clave de la IA y use herramientas de IA generativa en casos reales.',
    audience: 'Profesionales, emprendedores y estudiantes interesados en la IA.',
    requirements: ['Computadora con conexión a internet', 'No se requiere saber programar'],
    modules: ['Qué es la IA: conceptos e historia', 'Machine learning en términos simples', 'IA generativa y prompts efectivos', 'Herramientas de IA para productividad', 'Ética, riesgos y uso responsable', 'Proyecto final'],
  },
  {
    slug: 'ciberseguridad', name: 'Ciberseguridad', line: 'PROGRAM',
    summary: 'Conoce las amenazas más comunes y aprende a proteger personas, equipos y organizaciones.',
    objective: 'Que el participante identifique riesgos y aplique buenas prácticas de seguridad de la información.',
    audience: 'Estudiantes y profesionales de TI o de cualquier área que manejen información.',
    requirements: ['Computadora con conexión a internet', 'Conocimientos básicos de informática'],
    modules: ['Fundamentos de la seguridad de la información', 'Amenazas: malware, phishing e ingeniería social', 'Seguridad en redes y contraseñas', 'Protección de equipos y datos', 'Respuesta ante incidentes', 'Proyecto final'],
  },
  {
    slug: 'coding-explorers', name: 'Coding Explorers', line: 'KIDS_TEENS', level: 1, tool: 'Scratch',
    summary: 'El primer paso en la programación: crea animaciones, historias y juegos con bloques en Scratch.',
    objective: 'Que el estudiante desarrolle pensamiento lógico y creatividad programando sus propios proyectos.',
    audience: 'Niños y niñas que se inician en la programación.',
    requirements: ['Computadora con conexión a internet', 'Autorización del apoderado', 'No requiere experiencia previa'],
    modules: ['Conociendo Scratch: escenario y objetos', 'Movimiento, apariencia y sonido', 'Eventos y bucles', 'Condicionales y variables', 'Creando mi primer videojuego', 'Proyecto final'],
  },
  {
    slug: 'game-creators', name: 'Game Creators', line: 'KIDS_TEENS', level: 2, tool: 'GDevelop',
    summary: 'Diseña y publica tus propios videojuegos 2D con GDevelop, sin necesidad de escribir código complejo.',
    objective: 'Que el estudiante diseñe videojuegos completos aplicando lógica de eventos, física y diseño de niveles.',
    audience: 'Niños y adolescentes que completaron el nivel 1 o tienen nociones de programación.',
    requirements: ['Computadora con conexión a internet', 'Autorización del apoderado', 'Recomendado: nivel 1'],
    modules: ['Introducción a GDevelop', 'Objetos, escenas y comportamientos', 'Eventos y lógica del juego', 'Física, colisiones y puntajes', 'Diseño de niveles y sonido', 'Proyecto final: mi videojuego'],
  },
  {
    slug: 'young-developers', name: 'Young Developers', line: 'KIDS_TEENS', level: 3, tool: 'Python + Pygame',
    summary: 'Da el salto a la programación real: aprende Python y crea videojuegos con Pygame.',
    objective: 'Que el estudiante programe en Python y construya un videojuego funcional con Pygame.',
    audience: 'Adolescentes que completaron el nivel 2 o tienen bases de programación.',
    requirements: ['Computadora con conexión a internet', 'Autorización del apoderado', 'Recomendado: nivel 2'],
    modules: ['Python básico: variables y condiciones', 'Bucles y funciones', 'Introducción a Pygame', 'Sprites, movimiento y colisiones', 'Puntajes, niveles y sonido', 'Proyecto final: videojuego en Python'],
  },
];

async function seedCourses() {
  for (const c of COURSES) {
    const data = {
      name: c.name, line: c.line, level: c.level ?? null, tool: c.tool ?? null,
      summary: c.summary, objective: c.objective, audience: c.audience, requirements: c.requirements,
      priceCents: 45000, currency: 'PEN', totalHours: 32, status: 'PUBLISHED' as const,
    };
    const course = await prisma.course.upsert({ where: { slug: c.slug }, create: { slug: c.slug, ...data }, update: data });
    await prisma.courseModule.deleteMany({ where: { courseId: course.id } });
    await prisma.courseModule.createMany({ data: c.modules.map((title, i) => ({ courseId: course.id, position: i + 1, title })) });
    console.log(`  ✓ curso ${c.name}`);
  }
}

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.log('  · ADMIN_EMAIL / ADMIN_PASSWORD no definidos: no se crea administrador');
    return;
  }
  if (password.length < 8) throw new Error('ADMIN_PASSWORD debe tener al menos 8 caracteres');

  const existing = await prisma.user.findUnique({ where: { email } });
  const user = existing ?? await prisma.user.create({
    data: {
      email,
      fullName: process.env.ADMIN_NAME ?? 'Administrador',
      passwordHash: await hash(password),
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
  });
  await prisma.userRole.upsert({
    where: { userId_role: { userId: user.id, role: 'ADMIN' } },
    create: { userId: user.id, role: 'ADMIN' },
    update: {},
  });
  console.log(`  ✓ administrador ${email}${existing ? ' (ya existía; contraseña sin cambios)' : ''}`);
}

async function main() {
  console.log('Seed EMC Academy');
  await seedCourses();
  await seedAdmin();
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
