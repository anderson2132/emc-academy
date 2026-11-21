/* =========================================================
   EMC Academy — Header, footer y elementos comunes
   Cada página define <body data-page="..." data-root="">
   (data-root="../" en subcarpetas como /campus).
========================================================= */
(function () {
  const R = document.body.dataset.root || '';
  const page = document.body.dataset.page || '';

  const programas = COURSES.filter(c => c.line === 'programas');
  const kids = COURSES.filter(c => c.line === 'kids');

  const NAV = [
    { id: 'inicio', label: 'Inicio', href: 'index.html' },
    { id: 'nosotros', label: 'Nosotros', href: 'nosotros.html' },
    {
      id: 'programas', label: 'Programas', href: 'programas.html',
      children: programas.map(c => ({ label: c.name, href: `programa.html?c=${c.slug}`, icon: c.icon }))
        .concat([{ label: 'Ver todos los programas', href: 'programas.html', icon: 'fa-solid fa-arrow-right' }])
    },
    {
      id: 'kids', label: 'Kids & Teens', href: 'kids-teens.html',
      children: kids.map(c => ({ label: `Nivel ${c.level} · ${c.name}`, href: `programa.html?c=${c.slug}`, icon: c.icon }))
    },
    { id: 'inicios', label: 'Próximos inicios', href: 'proximos-inicios.html' },
    { id: 'contacto', label: 'Contacto', href: 'contacto.html' }
  ];

  const logo = `
    <a href="${R}index.html" class="logo" aria-label="EMC Academy — Inicio">
      <span class="logo-mark">
        <img src="${R}assets/img/emc-white.png" alt="" width="84" height="32">
        <svg class="logo-arrows" viewBox="0 0 40 40" aria-hidden="true">
          <path d="M4 14 L20 20 L20 34" fill="none" stroke="#f4f7fc" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M16 6 L34 13 L34 30" fill="none" stroke="#1e6bff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </span>
      <span class="logo-text">ACADEMY</span>
    </a>`;

  const navItems = NAV.map(item => {
    const active = item.id === page ? ' aria-current="page"' : '';
    if (!item.children) {
      return `<li><a href="${R}${item.href}" class="nav-link"${active}>${item.label}</a></li>`;
    }
    const sub = item.children.map(ch =>
      `<li><a href="${R}${ch.href}"><i class="${ch.icon}" aria-hidden="true"></i>${ch.label}</a></li>`
    ).join('');
    return `
      <li class="has-dropdown">
        <a href="${R}${item.href}" class="nav-link"${active}>${item.label}
          <i class="fa-solid fa-chevron-down caret" aria-hidden="true"></i></a>
        <ul class="dropdown">${sub}</ul>
      </li>`;
  }).join('');

  const header = `
    <a href="#main" class="skip-link">Saltar al contenido</a>
    <header class="site-header">
      <div class="container header-inner">
        ${logo}
        <nav class="main-nav" id="main-nav" aria-label="Principal">
          <ul class="nav-list">${navItems}</ul>
          <a href="${R}campus/login.html" class="btn btn-primary btn-sm nav-cta">
            <i class="fa-solid fa-graduation-cap" aria-hidden="true"></i> Campus Virtual
          </a>
        </nav>
        <button class="nav-toggle" aria-controls="main-nav" aria-expanded="false" aria-label="Abrir menú">
          <span></span><span></span><span></span>
        </button>
      </div>
    </header>`;

  const footerCol = (title, links) => `
    <div class="footer-col">
      <h3>${title}</h3>
      <ul>${links.map(l => `<li><a href="${R}${l.href}">${l.label}</a></li>`).join('')}</ul>
    </div>`;

  const year = new Date().getFullYear();
  const footer = `
    <footer class="site-footer">
      <div class="container footer-grid">
        <div class="footer-brand">
          ${logo}
          <p>Formación tecnológica práctica, online y en vivo, para estudiantes, profesionales, niños y adolescentes.</p>
          <div class="social">
            <a href="${CONFIG.social.facebook}" aria-label="Facebook"><i class="fa-brands fa-facebook-f"></i></a>
            <a href="${CONFIG.social.instagram}" aria-label="Instagram"><i class="fa-brands fa-instagram"></i></a>
            <a href="${CONFIG.social.tiktok}" aria-label="TikTok"><i class="fa-brands fa-tiktok"></i></a>
            <a href="${CONFIG.social.linkedin}" aria-label="LinkedIn"><i class="fa-brands fa-linkedin-in"></i></a>
          </div>
        </div>
        ${footerCol('Programas', programas.map(c => ({ label: c.name, href: `programa.html?c=${c.slug}` })))}
        ${footerCol('Kids & Teens', kids.map(c => ({ label: c.name, href: `programa.html?c=${c.slug}` })))}
        ${footerCol('Academia', [
          { label: 'Nosotros', href: 'nosotros.html' },
          { label: 'Docentes', href: 'docentes.html' },
          { label: 'Próximos inicios', href: 'proximos-inicios.html' },
          { label: 'Contacto', href: 'contacto.html' },
          { label: 'Campus Virtual', href: 'campus/login.html' }
        ])}
        ${footerCol('Legal', [
          { label: 'Política de privacidad', href: '#' },
          { label: 'Términos y condiciones', href: '#' },
          { label: 'Libro de reclamaciones', href: '#' }
        ])}
      </div>
      <div class="container footer-bottom">
        <p>© ${year} EMC Academy. Todos los derechos reservados.</p>
        <p><i class="fa-solid fa-location-dot" aria-hidden="true"></i> ${CONFIG.location}</p>
      </div>
    </footer>
    <a class="whatsapp-float" href="https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent('Hola, quiero información sobre los cursos de EMC Academy')}"
       target="_blank" rel="noopener" aria-label="Escríbenos por WhatsApp">
      <i class="fa-brands fa-whatsapp" aria-hidden="true"></i>
    </a>`;

  document.body.insertAdjacentHTML('afterbegin', header);
  document.body.insertAdjacentHTML('beforeend', footer);

  /* Menú móvil */
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.getElementById('main-nav');
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!open));
    toggle.setAttribute('aria-label', open ? 'Abrir menú' : 'Cerrar menú');
    nav.classList.toggle('open', !open);
    document.body.classList.toggle('menu-open', !open);
  });

  /* Sombra del header al hacer scroll */
  const headerEl = document.querySelector('.site-header');
  const onScroll = () => headerEl.classList.toggle('scrolled', window.scrollY > 10);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();
