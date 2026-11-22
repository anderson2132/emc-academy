/* =========================================================
   EMC Academy — Datos del portal (prototipo)
   En la versión final estos datos vendrán de la API.
   Los textos marcados como BORRADOR deben ser validados.
========================================================= */

const CONFIG = {
  brand: 'EMC Academy',
  // POR CONFIRMAR: contacto tomado de EMC INNOVATE
  whatsapp: '51983859873',
  whatsappLabel: '+51 983 859 873',
  email: 'contacto@emcinnovate.com',
  location: 'Perú · Clases 100% online en vivo',
  social: {
    facebook: '#',
    instagram: '#',
    tiktok: '#',
    linkedin: '#'
  }
};

/* Datos comunes a todos los cursos (definidos por el negocio) */
const COURSE_FORMAT = {
  price: 450,
  currency: 'S/',
  totalHours: 32,
  sessions: 16,
  sessionHours: 2,
  perWeek: 2,
  weeks: 8,
  modality: 'Online en vivo (Zoom)',
  recordingsMonths: 6,
  paymentDays: 7
};

const AREAS = {
  programacion: { label: 'Programación', icon: 'fa-solid fa-code' },
  ia: { label: 'Inteligencia Artificial', icon: 'fa-solid fa-brain' },
  ciberseguridad: { label: 'Ciberseguridad', icon: 'fa-solid fa-shield-halved' },
  kids: { label: 'Kids & Teens', icon: 'fa-solid fa-rocket' }
};

/* BORRADOR: resúmenes, objetivos y temarios son referenciales */
const COURSES = [
  {
    slug: 'python',
    name: 'Python',
    line: 'programas',
    area: 'programacion',
    icon: 'fa-brands fa-python',
    tag: 'Programación',
    summary: 'Aprende a programar desde cero con el lenguaje más usado en datos, automatización e inteligencia artificial.',
    objective: 'Que el participante escriba programas en Python para resolver problemas reales y automatizar tareas.',
    audience: 'Estudiantes, profesionales y personas que quieren iniciarse en la programación.',
    requirements: ['Computadora con conexión a internet', 'No se requiere experiencia previa'],
    syllabus: [
      'Fundamentos: variables, tipos de datos y operadores',
      'Estructuras de control y funciones',
      'Listas, diccionarios y manejo de archivos',
      'Programación orientada a objetos',
      'Librerías y automatización de tareas',
      'Proyecto final'
    ]
  },
  {
    slug: 'fundamento-de-ia',
    name: 'Fundamento de IA',
    line: 'programas',
    area: 'ia',
    icon: 'fa-solid fa-brain',
    tag: 'Inteligencia Artificial',
    summary: 'Comprende cómo funciona la inteligencia artificial y aplícala de forma práctica y responsable en tu trabajo.',
    objective: 'Que el participante entienda los conceptos clave de la IA y use herramientas de IA generativa en casos reales.',
    audience: 'Profesionales, emprendedores y estudiantes interesados en la IA.',
    requirements: ['Computadora con conexión a internet', 'No se requiere saber programar'],
    syllabus: [
      'Qué es la IA: conceptos e historia',
      'Machine learning en términos simples',
      'IA generativa y prompts efectivos',
      'Herramientas de IA para productividad',
      'Ética, riesgos y uso responsable',
      'Proyecto final'
    ]
  },
  {
    slug: 'ciberseguridad',
    name: 'Ciberseguridad',
    line: 'programas',
    area: 'ciberseguridad',
    icon: 'fa-solid fa-shield-halved',
    tag: 'Ciberseguridad',
    summary: 'Conoce las amenazas más comunes y aprende a proteger personas, equipos y organizaciones.',
    objective: 'Que el participante identifique riesgos y aplique buenas prácticas de seguridad de la información.',
    audience: 'Estudiantes y profesionales de TI o de cualquier área que manejen información.',
    requirements: ['Computadora con conexión a internet', 'Conocimientos básicos de informática'],
    syllabus: [
      'Fundamentos de la seguridad de la información',
      'Amenazas: malware, phishing e ingeniería social',
      'Seguridad en redes y contraseñas',
      'Protección de equipos y datos',
      'Respuesta ante incidentes',
      'Proyecto final'
    ]
  },
  {
    slug: 'coding-explorers',
    name: 'Coding Explorers',
    line: 'kids',
    area: 'kids',
    level: 1,
    tool: 'Scratch',
    icon: 'fa-solid fa-puzzle-piece',
    tag: 'Kids & Teens · Nivel 1',
    summary: 'El primer paso en la programación: crea animaciones, historias y juegos con bloques en Scratch.',
    objective: 'Que el estudiante desarrolle pensamiento lógico y creatividad programando sus propios proyectos.',
    audience: 'Niños y niñas que se inician en la programación.',
    requirements: ['Computadora con conexión a internet', 'Autorización del apoderado', 'No requiere experiencia previa'],
    syllabus: [
      'Conociendo Scratch: escenario y objetos',
      'Movimiento, apariencia y sonido',
      'Eventos y bucles',
      'Condicionales y variables',
      'Creando mi primer videojuego',
      'Proyecto final'
    ]
  },
  {
    slug: 'game-creators',
    name: 'Game Creators',
    line: 'kids',
    area: 'kids',
    level: 2,
    tool: 'GDevelop',
    icon: 'fa-solid fa-gamepad',
    tag: 'Kids & Teens · Nivel 2',
    summary: 'Diseña y publica tus propios videojuegos 2D con GDevelop, sin necesidad de escribir código complejo.',
    objective: 'Que el estudiante diseñe videojuegos completos aplicando lógica de eventos, física y diseño de niveles.',
    audience: 'Niños y adolescentes que completaron el nivel 1 o tienen nociones de programación.',
    requirements: ['Computadora con conexión a internet', 'Autorización del apoderado', 'Recomendado: nivel 1'],
    syllabus: [
      'Introducción a GDevelop',
      'Objetos, escenas y comportamientos',
      'Eventos y lógica del juego',
      'Física, colisiones y puntajes',
      'Diseño de niveles y sonido',
      'Proyecto final: mi videojuego'
    ]
  },
  {
    slug: 'young-developers',
    name: 'Young Developers',
    line: 'kids',
    area: 'kids',
    level: 3,
    tool: 'Python + Pygame',
    icon: 'fa-solid fa-rocket',
    tag: 'Kids & Teens · Nivel 3',
    summary: 'Da el salto a la programación real: aprende Python y crea videojuegos con Pygame.',
    objective: 'Que el estudiante programe en Python y construya un videojuego funcional con Pygame.',
    audience: 'Adolescentes que completaron el nivel 2 o tienen bases de programación.',
    requirements: ['Computadora con conexión a internet', 'Autorización del apoderado', 'Recomendado: nivel 2'],
    syllabus: [
      'Python básico: variables y condiciones',
      'Bucles y funciones',
      'Introducción a Pygame',
      'Sprites, movimiento y colisiones',
      'Puntajes, niveles y sonido',
      'Proyecto final: videojuego en Python'
    ]
  }
];

/* Próximos inicios: aún sin fechas confirmadas */
const UPCOMING = COURSES.map(c => ({ slug: c.slug, date: null, schedule: null }));

/* Docentes: pendientes de confirmar (nombre, foto y perfil) */
const TEACHERS = [
  { name: 'Docente por confirmar', role: 'Programación y Python', bio: 'Perfil en preparación.', photo: null },
  { name: 'Docente por confirmar', role: 'Inteligencia Artificial', bio: 'Perfil en preparación.', photo: null },
  { name: 'Docente por confirmar', role: 'Ciberseguridad', bio: 'Perfil en preparación.', photo: null },
  { name: 'Docente por confirmar', role: 'Kids & Teens', bio: 'Perfil en preparación.', photo: null }
];

const FAQ = [
  {
    q: '¿Cómo son las clases?',
    a: 'Son 100% online y en vivo por Zoom. Cada curso tiene 16 clases de 2 horas, dos veces por semana (32 horas en 8 semanas).'
  },
  {
    q: '¿Cuánto cuesta cada curso?',
    a: 'Cada curso cuesta S/ 450 en un solo pago.'
  },
  {
    q: '¿Cómo me inscribo?',
    a: 'Escríbenos por WhatsApp indicando el curso que te interesa. Nuestro equipo te matricula y te ayuda a crear tu cuenta en el Campus Virtual (con Google, Microsoft o tu correo), donde verás tus clases y grabaciones.'
  },
  {
    q: '¿Cómo y cuándo pago?',
    a: 'Una vez confirmada tu matrícula, envía tu comprobante (Yape, Plin o transferencia) por WhatsApp. Tienes hasta 7 días desde el inicio del curso para completar el pago.'
  },
  {
    q: '¿Y si no puedo asistir a una clase?',
    a: 'Todas las clases se graban. Tendrás acceso a las grabaciones y materiales en el Campus Virtual hasta 6 meses después de terminar el curso.'
  },
  {
    q: '¿Cómo inscribo a mi hijo o hija en Kids & Teens?',
    a: 'Escríbenos por WhatsApp y nuestro equipo lo matricula. Como apoderado, crea tu cuenta en el Campus Virtual y registra a tu hijo o hija (o autoriza su cuenta); desde ahí verás sus horarios, pagos y avances.'
  }
];
