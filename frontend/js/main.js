/* =========================================================
   EMC Academy — Lógica de páginas (prototipo sin backend)
========================================================= */
(function () {
  const R = document.body.dataset.root || '';
  const page = document.body.dataset.page || '';
  const F = COURSE_FORMAT;
  const $ = (sel, ctx = document) => ctx.querySelector(sel);

  const esc = s => String(s).replace(/[&<>"']/g, ch =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  const price = () => `${F.currency} ${F.price}`;
  const findCourse = slug => COURSES.find(c => c.slug === slug);
  const waHref = text => `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(text)}`;
  // La matrícula la hace el equipo (admin): el botón "Inscribirme" abre WhatsApp con el curso ya indicado.
  const enrollHref = c => waHref(`Hola, quiero inscribirme en el curso ${c.name}${c.line === 'kids' ? ' para mi hijo/a' : ''}.`);
  const startLabel = slug => {
    const u = UPCOMING.find(x => x.slug === slug);
    return u && u.date ? u.date : 'Por anunciar';
  };

  /* ---------- Componentes ---------- */
  function courseCard(c) {
    const level = c.level ? `<span class="level-pill">Nivel ${c.level}</span>` : '';
    return `
      <article class="course-card area-${c.area}">
        <div class="course-visual">
          <i class="${c.icon}" aria-hidden="true"></i>
          ${level}
        </div>
        <div class="course-body">
          <span class="badge">${esc(c.tag)}</span>
          <h3><a href="${R}programa.html?c=${c.slug}">${esc(c.name)}</a></h3>
          ${c.tool ? `<p class="course-tool"><i class="fa-solid fa-toolbox" aria-hidden="true"></i> ${esc(c.tool)}</p>` : ''}
          <p class="course-summary">${esc(c.summary)}</p>
          <ul class="course-meta">
            <li><i class="fa-regular fa-clock" aria-hidden="true"></i> ${F.totalHours} h · ${F.weeks} semanas</li>
            <li><i class="fa-solid fa-video" aria-hidden="true"></i> Online en vivo</li>
            <li><i class="fa-regular fa-calendar" aria-hidden="true"></i> Inicio: ${startLabel(c.slug)}</li>
          </ul>
          <div class="course-footer">
            <span class="price">${price()}<small>pago único</small></span>
            <span class="status status-soon">Inscripciones próximamente</span>
          </div>
          <div class="course-actions">
            <a href="${R}programa.html?c=${c.slug}" class="btn btn-ghost btn-sm">Ver programa</a>
            <a href="${enrollHref(c)}" class="btn btn-primary btn-sm" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i> Inscribirme</a>
          </div>
        </div>
      </article>`;
  }

  function teacherCard(t) {
    const initials = t.photo ? '' : '<i class="fa-solid fa-user" aria-hidden="true"></i>';
    const photo = t.photo ? `<img src="${esc(t.photo)}" alt="${esc(t.name)}">` : initials;
    return `
      <article class="teacher-card">
        <div class="teacher-photo">${photo}</div>
        <h3>${esc(t.name)}</h3>
        <p class="teacher-role">${esc(t.role)}</p>
        <p class="teacher-bio">${esc(t.bio)}</p>
      </article>`;
  }

  function faqList(items) {
    return items.map(f => `
      <details class="faq-item">
        <summary>${esc(f.q)}<i class="fa-solid fa-plus" aria-hidden="true"></i></summary>
        <p>${esc(f.a)}</p>
      </details>`).join('');
  }

  function upcomingRow(c) {
    return `
      <li class="upcoming-row">
        <div class="upcoming-icon area-${c.area}"><i class="${c.icon}" aria-hidden="true"></i></div>
        <div class="upcoming-info">
          <h3>${esc(c.name)}</h3>
          <p>${esc(c.tag)} · ${F.sessions} clases de ${F.sessionHours} h · ${F.perWeek} por semana</p>
        </div>
        <div class="upcoming-date">
          <span>Inicio</span>
          <strong>${startLabel(c.slug)}</strong>
        </div>
        <a class="btn btn-ghost btn-sm" href="${waHref(`Hola, quiero que me avisen cuando inicie el curso ${c.name}.`)}" target="_blank" rel="noopener">
          <i class="fa-brands fa-whatsapp" aria-hidden="true"></i> Avísame
        </a>
      </li>`;
  }

  const fill = (sel, html) => { const el = $(sel); if (el) el.innerHTML = html; };

  /* ---------- Búsqueda (home y catálogo) ---------- */
  function bindSearchForm() {
    const form = $('#course-search');
    if (!form) return;
    form.addEventListener('submit', e => {
      e.preventDefault();
      const q = $('#course-search-input').value.trim();
      window.location.href = `${R}programas.html${q ? `?q=${encodeURIComponent(q)}` : ''}`;
    });
  }

  /* ---------- Páginas ---------- */
  const pages = {
    inicio() {
      bindSearchForm();
      fill('#featured-grid', COURSES.filter(c => c.line === 'programas').map(courseCard).join(''));
      fill('#kids-grid', COURSES.filter(c => c.line === 'kids').map(courseCard).join(''));
      fill('#upcoming-list', COURSES.slice(0, 4).map(upcomingRow).join(''));
      fill('#teachers-grid', TEACHERS.map(teacherCard).join(''));
      fill('#faq-list', faqList(FAQ));
      document.querySelectorAll('[data-count-courses]').forEach(el => { el.textContent = COURSES.length; });
    },

    programas() {
      const params = new URLSearchParams(location.search);
      const input = $('#catalog-search');
      const chips = document.querySelectorAll('.chip');
      let area = params.get('cat') || 'todos';
      input.value = params.get('q') || '';

      const normalize = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

      function render() {
        const q = normalize(input.value.trim());
        const list = COURSES.filter(c =>
          (area === 'todos' || c.area === area) &&
          (!q || normalize(`${c.name} ${c.tag} ${c.summary} ${c.tool || ''}`).includes(q)));
        fill('#catalog-grid', list.length ? list.map(courseCard).join('') :
          `<div class="empty"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
             <p>No encontramos cursos para tu búsqueda.</p></div>`);
        $('#catalog-count').textContent = `${list.length} ${list.length === 1 ? 'curso' : 'cursos'}`;
        chips.forEach(ch => ch.setAttribute('aria-pressed', String(ch.dataset.area === area)));
      }

      chips.forEach(ch => ch.addEventListener('click', () => { area = ch.dataset.area; render(); }));
      input.addEventListener('input', render);
      $('#catalog-form').addEventListener('submit', e => e.preventDefault());
      render();
    },

    programa() {
      const c = findCourse(new URLSearchParams(location.search).get('c'));
      const root = $('#program');
      if (!c) {
        root.innerHTML = `<section class="section"><div class="container empty">
          <i class="fa-solid fa-circle-question" aria-hidden="true"></i>
          <p>No encontramos este programa.</p>
          <a href="${R}programas.html" class="btn btn-primary">Ver todos los programas</a></div></section>`;
        return;
      }
      document.title = `${c.name} | EMC Academy`;
      const back = c.line === 'kids'
        ? `<a href="${R}kids-teens.html">Kids & Teens</a>`
        : `<a href="${R}programas.html">Programas</a>`;

      root.innerHTML = `
        <section class="page-hero program-hero area-${c.area}">
          <div class="container">
            <nav class="breadcrumb" aria-label="Ruta"><a href="${R}index.html">Inicio</a><span>/</span>${back}<span>/</span><span>${esc(c.name)}</span></nav>
            <div class="program-hero-inner">
              <div class="program-hero-icon"><i class="${c.icon}" aria-hidden="true"></i></div>
              <div>
                <span class="eyebrow">${esc(c.tag)}</span>
                <h1>${esc(c.name)}</h1>
                <p class="lead">${esc(c.summary)}</p>
              </div>
            </div>
          </div>
        </section>

        <section class="section">
          <div class="container program-layout">
            <div class="program-main">
              <div class="info-block">
                <h2><i class="fa-solid fa-bullseye" aria-hidden="true"></i> Objetivo</h2>
                <p>${esc(c.objective)}</p>
              </div>
              <div class="info-block">
                <h2><i class="fa-solid fa-users" aria-hidden="true"></i> ¿A quién va dirigido?</h2>
                <p>${esc(c.audience)}</p>
              </div>
              <div class="info-block">
                <h2><i class="fa-solid fa-list-check" aria-hidden="true"></i> Requisitos</h2>
                <ul class="check-list">${c.requirements.map(r => `<li>${esc(r)}</li>`).join('')}</ul>
              </div>
              <div class="info-block">
                <h2><i class="fa-solid fa-book-open" aria-hidden="true"></i> Temario <span class="badge badge-muted">Referencial</span></h2>
                <ol class="syllabus">${c.syllabus.map((m, i) =>
                  `<li><span class="syllabus-n">${String(i + 1).padStart(2, '0')}</span>${esc(m)}</li>`).join('')}</ol>
              </div>
              <div class="info-block">
                <h2><i class="fa-solid fa-chalkboard-user" aria-hidden="true"></i> Metodología</h2>
                <p>Clases 100% en vivo por Zoom, prácticas desde la primera sesión y un proyecto final. Todas las clases se graban
                  y quedan disponibles en el Campus Virtual hasta ${F.recordingsMonths} meses después de terminar el curso.</p>
              </div>
              <div class="info-block">
                <h2><i class="fa-solid fa-user-tie" aria-hidden="true"></i> Docente</h2>
                <p>Por confirmar.</p>
              </div>
              <div class="info-block">
                <h2><i class="fa-solid fa-circle-question" aria-hidden="true"></i> Preguntas frecuentes</h2>
                <div class="faq">${faqList(FAQ.slice(0, 5))}</div>
              </div>
            </div>

            <aside class="program-aside">
              <div class="enroll-card">
                <p class="enroll-price">${price()}</p>
                <p class="enroll-note">Pago único</p>
                <ul class="enroll-facts">
                  <li><i class="fa-regular fa-calendar" aria-hidden="true"></i><span>Inicio</span><strong>${startLabel(c.slug)}</strong></li>
                  <li><i class="fa-regular fa-clock" aria-hidden="true"></i><span>Duración</span><strong>${F.totalHours} h · ${F.weeks} semanas</strong></li>
                  <li><i class="fa-solid fa-layer-group" aria-hidden="true"></i><span>Clases</span><strong>${F.sessions} de ${F.sessionHours} h</strong></li>
                  <li><i class="fa-solid fa-repeat" aria-hidden="true"></i><span>Frecuencia</span><strong>${F.perWeek} por semana</strong></li>
                  <li><i class="fa-solid fa-video" aria-hidden="true"></i><span>Modalidad</span><strong>${F.modality}</strong></li>
                  <li><i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i><span>Grabaciones</span><strong>${F.recordingsMonths} meses</strong></li>
                </ul>
                <a href="${enrollHref(c)}" class="btn btn-primary btn-block" target="_blank" rel="noopener">
                  <i class="fa-brands fa-whatsapp" aria-hidden="true"></i> Inscribirme por WhatsApp
                </a>
                <a href="${R}campus/login.html" class="btn btn-ghost btn-block">Crear mi cuenta del Campus</a>
                <p class="enroll-small">Escríbenos y nuestro equipo te matricula. Tus clases, grabaciones y materiales estarán en tu cuenta del Campus Virtual.${c.line === 'kids' ? ' Los menores usan una cuenta vinculada a su apoderado.' : ''}</p>
              </div>
            </aside>
          </div>
        </section>`;
    },

    kids() {
      fill('#kids-grid', COURSES.filter(c => c.line === 'kids').map(courseCard).join(''));
      fill('#faq-list', faqList(FAQ.filter((_, i) => [0, 1, 4, 5].includes(i))));
    },

    inicios() {
      fill('#upcoming-list', COURSES.map(upcomingRow).join(''));
    },

    docentes() {
      fill('#teachers-grid', TEACHERS.map(teacherCard).join(''));
    },

    nosotros() {},

    contacto() {
      $('#ci-wa').href = `https://wa.me/${CONFIG.whatsapp}`;
      $('#ci-wa-label').textContent = CONFIG.whatsappLabel;
      $('#ci-mail').href = `mailto:${CONFIG.email}`;
      $('#ci-mail-label').textContent = CONFIG.email;
      $('#ci-loc').textContent = CONFIG.location;
      const select = $('#cf-course');
      select.insertAdjacentHTML('beforeend', COURSES.map(c => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join(''));
      const minor = $('#cf-minor');
      const guardian = $('#guardian-fields');
      minor.addEventListener('change', () => {
        guardian.hidden = !minor.checked;
        guardian.querySelectorAll('input').forEach(i => { i.required = minor.checked; });
      });
      $('#contact-form').addEventListener('submit', e => {
        e.preventDefault();
        const f = e.target;
        if (!f.reportValidity()) return;
        const d = Object.fromEntries(new FormData(f));
        let msg = `Hola, soy ${d.nombres} ${d.apellidos}.\nCorreo: ${d.email}\nCelular: ${d.celular}\nCurso de interés: ${d.curso}`;
        if (minor.checked) msg += `\nApoderado: ${d.apoderado} (${d.apoderado_celular})`;
        if (d.mensaje) msg += `\nMensaje: ${d.mensaje}`;
        window.open(waHref(msg), '_blank', 'noopener');
        $('#contact-ok').hidden = false;
        f.reset();
        guardian.hidden = true;
      });
    }
  };

  if (pages[page]) pages[page]();
})();
