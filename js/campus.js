/* =========================================================
   EMC Academy — Campus Virtual (login, verificación, panel)
   Los permisos los decide la API; aquí solo se muestra lo que devuelve.
========================================================= */
(function () {
  const page = document.body.dataset.page;
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, ch =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const params = new URLSearchParams(location.search);

  const ROLE_LABEL = { ADMIN: 'Administrador', TEACHER: 'Docente', STUDENT: 'Alumno', GUARDIAN: 'Apoderado' };
  const STATUS_LABEL = {
    PENDING_VERIFICATION: ['Correo sin verificar', 'warning'],
    PENDING_APPROVAL: ['Pendiente de aprobación', 'warning'],
    ACTIVE: ['Activa', 'success'],
    SUSPENDED: ['Suspendida', 'danger'],
    REJECTED: ['Rechazada', 'danger']
  };
  const fmtDate = iso => new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });

  const PROVIDER_LABEL = { google: 'Google', microsoft: 'Microsoft', GOOGLE: 'Google', MICROSOFT: 'Microsoft' };
  /** Mensajes para los códigos que devuelve el ingreso con Google/Microsoft. */
  const OIDC_ERRORS = {
    EMAIL_IN_USE: 'Ya existe una cuenta con ese correo. Ingresa con tu correo y contraseña, y luego vincula {p} desde tu panel.',
    IDENTITY_IN_USE: 'Esa cuenta de {p} ya está vinculada a otro usuario.',
    ALREADY_LINKED: 'Tu cuenta ya tiene {p} vinculado.',
    LINK_REQUIRES_SESSION: 'Tu sesión venció. Ingresa de nuevo y vuelve a intentar la vinculación.',
    CANCELLED: 'Cancelaste el ingreso con {p}.',
    PROVIDER_DISABLED: 'El ingreso con {p} aún no está disponible.',
    FLOW_EXPIRED: 'El proceso tardó demasiado. Inténtalo de nuevo.',
    INVALID_FLOW: 'No se pudo completar el ingreso. Inténtalo de nuevo.',
    TOKEN_EXCHANGE_FAILED: 'No se pudo verificar tu cuenta de {p}. Inténtalo de nuevo.',
    INVALID_TOKEN: 'No se pudo verificar tu cuenta de {p}. Inténtalo de nuevo.',
    PROVIDER_ERROR: '{p} devolvió un error. Inténtalo de nuevo.',
    UNEXPECTED: 'Ocurrió un error inesperado. Inténtalo de nuevo.'
  };
  const oidcMessage = (code, provider) =>
    (OIDC_ERRORS[code] || OIDC_ERRORS.UNEXPECTED).replace('{p}', PROVIDER_LABEL[provider] || 'el proveedor');
  const oidcUrl = (provider, mode) => `${API_BASE}/auth/oidc/${provider}${mode === 'link' ? '?mode=link' : ''}`;

  function showMsg(el, type, html) {
    const icon = { success: 'fa-circle-check', warning: 'fa-triangle-exclamation', danger: 'fa-circle-xmark', info: 'fa-circle-info' }[type];
    el.className = `alert alert-${type}`;
    el.innerHTML = `<i class="fa-solid ${icon}" aria-hidden="true"></i><p>${html}</p>`;
    el.hidden = false;
    el.focus && el.focus();
  }

  function setBusy(form, busy) {
    form.querySelectorAll('button, input, select').forEach(el => { el.disabled = busy; });
  }

  /* ───────────── Login y registro ───────────── */
  function initLogin() {
    const msg = $('#auth-msg');

    const course = typeof COURSES !== 'undefined' && COURSES.find(c => c.slug === params.get('inscribir'));
    if (course) {
      const box = $('#enroll-context');
      box.hidden = false;
      box.innerHTML = `<i class="fa-solid fa-circle-info" aria-hidden="true"></i><p>Para inscribirte en <strong>${esc(course.name)}</strong>, ingresa o crea tu cuenta.</p>`;
    }

    // Si ya hay sesión, ir directo al panel.
    api('/auth/me').then(() => { location.href = 'panel.html'; }).catch(() => {});

    const tabs = document.querySelectorAll('[role="tab"]');
    tabs.forEach(tab => tab.addEventListener('click', () => {
      tabs.forEach(t => {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        $(`#${t.getAttribute('aria-controls')}`).hidden = !on;
      });
      msg.hidden = true;
    }));

    if (params.get('error')) showMsg(msg, 'danger', esc(oidcMessage(params.get('error'), params.get('provider'))));

    // Botones de Google/Microsoft: solo se activan los proveedores configurados en la API.
    const ssoButtons = document.querySelectorAll('[data-provider]');
    let enabled = {};
    api('/auth/providers').then(r => { enabled = r || {}; }).catch(() => {}).finally(() => {
      ssoButtons.forEach(b => b.addEventListener('click', () => {
        const p = b.dataset.provider;
        if (!API_BASE) return showMsg(msg, 'info', 'El Campus Virtual estará disponible próximamente.');
        if (!enabled[p]) return showMsg(msg, 'info', esc(oidcMessage('PROVIDER_DISABLED', p)));
        location.href = oidcUrl(p, 'login');
      }));
    });

    $('#login-form').addEventListener('submit', async e => {
      e.preventDefault();
      const f = e.target;
      if (!f.reportValidity()) return;
      setBusy(f, true);
      try {
        await api('/auth/login', { method: 'POST', body: { login: f.login.value.trim(), password: f.password.value } });
        location.href = 'panel.html';
      } catch (err) {
        showMsg(msg, 'danger', esc(err.message));
        setBusy(f, false);
      }
    });

    $('#register-form').addEventListener('submit', async e => {
      e.preventDefault();
      const f = e.target;
      if (!f.reportValidity()) return;
      setBusy(f, true);
      try {
        const r = await api('/auth/register', {
          method: 'POST',
          body: { fullName: f.fullName.value.trim(), email: f.email.value.trim(), password: f.password.value }
        });
        f.reset();
        showMsg(msg, 'success', `${esc(r.message)}<br><small>Entorno de desarrollo: el enlace aparece en la consola de la API.</small>`);
      } catch (err) {
        showMsg(msg, 'danger', esc(err.message));
      } finally {
        setBusy(f, false);
      }
    });

    $('#forgot-link').addEventListener('click', async e => {
      e.preventDefault();
      const email = prompt('Escribe el correo de tu cuenta:');
      if (!email) return;
      try {
        const r = await api('/auth/forgot-password', { method: 'POST', body: { email: email.trim() } });
        showMsg(msg, 'info', `${esc(r.message)}<br><small>Entorno de desarrollo: el enlace aparece en la consola de la API.</small>`);
      } catch (err) {
        showMsg(msg, 'danger', esc(err.message));
      }
    });
  }

  /* ───────────── Verificación de correo ───────────── */
  async function initVerify() {
    const msg = $('#verify-msg');
    const token = params.get('token');
    if (!token) return showMsg(msg, 'danger', 'El enlace no es válido.');
    try {
      const r = await api('/auth/verify-email', { method: 'POST', body: { token } });
      showMsg(msg, 'success', esc(r.message));
    } catch (err) {
      showMsg(msg, 'danger', esc(err.message));
    }
  }

  /* ───────────── Restablecer contraseña ───────────── */
  function initReset() {
    const msg = $('#reset-msg');
    $('#reset-form').addEventListener('submit', async e => {
      e.preventDefault();
      const f = e.target;
      if (!f.reportValidity()) return;
      if (f.password.value !== f.password2.value) return showMsg(msg, 'danger', 'Las contraseñas no coinciden.');
      setBusy(f, true);
      try {
        const r = await api('/auth/reset-password', { method: 'POST', body: { token: params.get('token') || '', password: f.password.value } });
        f.hidden = true;
        showMsg(msg, 'success', esc(r.message));
      } catch (err) {
        showMsg(msg, 'danger', esc(err.message));
        setBusy(f, false);
      }
    });
  }

  /* ───────────── Panel ───────────── */
  const root = () => $('#panel-root');

  async function initPanel() {
    let me;
    try {
      me = await api('/auth/me');
    } catch (err) {
      if (err.status === 401) { location.href = 'login.html'; return; }
      root().innerHTML = `<div class="alert alert-danger"><i class="fa-solid fa-circle-xmark"></i><p>${esc(err.message)}</p></div>`;
      return;
    }

    const [statusLabel, statusType] = STATUS_LABEL[me.status] || [me.status, 'info'];
    const roles = me.roles.length ? me.roles.map(r => `<span class="badge">${ROLE_LABEL[r] || r}</span>`).join(' ') : '<span class="badge badge-muted">Sin rol asignado</span>';

    root().innerHTML = `
      <div class="panel-head">
        <div>
          <span class="eyebrow">Campus Virtual</span>
          <h1>Hola, ${esc(me.fullName.split(' ')[0])}</h1>
          <p class="muted">${esc(me.email || '')}</p>
          <div class="panel-tags">${roles} <span class="status-pill st-${statusType}">${statusLabel}</span></div>
        </div>
        <button class="btn btn-ghost btn-sm" id="logout"><i class="fa-solid fa-right-from-bracket" aria-hidden="true"></i> Cerrar sesión</button>
      </div>
      <div id="panel-body"></div>`;

    $('#logout').addEventListener('click', async () => {
      await api('/auth/logout', { method: 'POST' }).catch(() => {});
      location.href = 'login.html';
    });

    const body = $('#panel-body');

    // Avisos que llegan tras volver de Google/Microsoft.
    const notice = document.createElement('div');
    notice.className = 'alert';
    notice.hidden = true;
    body.before(notice);
    if (params.get('error')) showMsg(notice, 'danger', esc(oidcMessage(params.get('error'), params.get('provider'))));
    else if (params.get('linked')) showMsg(notice, 'success', `Listo: ahora también puedes ingresar con ${PROVIDER_LABEL[params.get('linked')] || 'esa cuenta'}.`);
    else if (params.get('welcome')) showMsg(notice, 'success', 'Tu cuenta fue creada. Completa tu solicitud para que un administrador la apruebe.');
    if ([...params.keys()].length) history.replaceState(null, '', location.pathname);

    renderLoginMethods(body);
    if (me.status === 'PENDING_APPROVAL') return renderPending(body);
    if (me.status !== 'ACTIVE') {
      body.innerHTML = `<div class="alert alert-danger"><i class="fa-solid fa-lock"></i><p>Tu cuenta está ${statusLabel.toLowerCase()}. Escríbenos por WhatsApp si necesitas ayuda.</p></div>`;
      return;
    }

    const blocks = [];
    if (me.roles.includes('ADMIN')) blocks.push(adminBlock(), groupsBlock());
    if (me.roles.includes('TEACHER')) blocks.push(teacherBlock());
    if (me.roles.includes('STUDENT')) blocks.push(studentBlock());
    if (me.roles.includes('GUARDIAN')) blocks.push(placeholderBlock('fa-people-roof', 'Mis hijos', 'Aquí verás los cursos, asistencia y avances de tus hijos vinculados.'));
    body.insertAdjacentHTML('afterbegin', blocks.map(b => b.html).join(''));
    blocks.forEach(b => b.init && b.init());
  }

  /* ----- Alumno: Mis cursos ----- */
  const ACCESS_MSG = {
    PAYMENT_OVERDUE: 'Acceso bloqueado: el plazo de pago venció. Envía tu comprobante por WhatsApp para reactivarlo.',
    MANUAL_BLOCK: 'Acceso bloqueado por administración. Escríbenos por WhatsApp.',
    GUARDIAN_NOT_APPROVED: 'Falta la autorización de tu apoderado.',
    GROUP_FINISHED: 'El curso terminó. Puedes revisar las grabaciones y materiales.',
    ACCESS_EXPIRED: 'El acceso a las grabaciones de este curso ya venció.',
    ENROLLMENT_NOT_APPROVED: 'Tu matrícula aún no está aprobada.',
    ACCOUNT_NOT_ACTIVE: 'Tu cuenta no está activa.'
  };
  const fmtDay = iso => new Date(`${iso}T12:00:00`).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
  const soles = cents => `S/ ${(cents / 100).toFixed(2).replace(/\.00$/, '')}`;

  function studentBlock() {
    return {
      html: `<section class="panel-card"><h2><i class="fa-solid fa-book-open" aria-hidden="true"></i> Mis cursos</h2><div id="my-courses"><p class="muted">Cargando…</p></div></section>`,
      async init() {
        const box = $('#my-courses');
        try {
          const list = await api('/me/courses');
          if (!list.length) { box.innerHTML = `<div class="empty-state"><p>Aún no tienes cursos matriculados. <a href="../programas.html">Ver catálogo</a>.</p></div>`; return; }
          box.innerHTML = `<div class="course-list">${list.map(c => {
            const pay = c.payment.paid
              ? '<span class="status-pill st-success">Pagado</span>'
              : c.access.live === 'PAYMENT_OVERDUE' || c.access.content === 'PAYMENT_OVERDUE'
                ? '<span class="status-pill st-danger">Pago vencido</span>'
                : `<span class="status-pill st-warning">Pago pendiente · hasta ${new Date(c.payment.dueDate).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })}</span>`;
            const blocked = c.access.live !== 'OK' && c.access.live !== 'GROUP_FINISHED' ? c.access.live : (c.access.content !== 'OK' ? c.access.content : null);
            return `<article class="my-course">
              <div class="my-course-head">
                <div><h3>${esc(c.course.name)}</h3><p class="muted">Grupo ${esc(c.group.code)}</p></div>
                ${pay}
              </div>
              <ul class="my-course-meta">
                <li><i class="fa-regular fa-calendar" aria-hidden="true"></i> ${fmtDay(c.group.startDate)} – ${fmtDay(c.group.endDate)}</li>
                ${c.group.schedule ? `<li><i class="fa-regular fa-clock" aria-hidden="true"></i> ${esc(c.group.schedule)}</li>` : ''}
                ${c.group.teachers.length ? `<li><i class="fa-solid fa-chalkboard-user" aria-hidden="true"></i> ${c.group.teachers.map(esc).join(', ')}</li>` : ''}
                ${!c.payment.paid ? `<li><i class="fa-solid fa-tag" aria-hidden="true"></i> ${soles(c.payment.amountCents - c.payment.paidCents)} por pagar</li>` : ''}
              </ul>
              ${blocked && ACCESS_MSG[blocked] ? `<div class="alert alert-${blocked === 'GROUP_FINISHED' ? 'info' : 'warning'}"><i class="fa-solid fa-circle-info"></i><p>${ACCESS_MSG[blocked]}</p></div>` : ''}
              ${c.zoomUrl ? `<a class="btn btn-primary btn-sm" href="${esc(c.zoomUrl)}" target="_blank" rel="noopener"><i class="fa-solid fa-video" aria-hidden="true"></i> Entrar a la clase (Zoom)</a>` : ''}
            </article>`;
          }).join('')}</div>`;
        } catch (err) { box.innerHTML = `<p class="text-danger">${esc(err.message)}</p>`; }
      }
    };
  }

  /* ----- Docente: Mis grupos ----- */
  function teacherBlock() {
    return {
      html: `<section class="panel-card"><h2><i class="fa-solid fa-chalkboard-user" aria-hidden="true"></i> Mis grupos</h2><div id="my-groups"><p class="muted">Cargando…</p></div></section>`,
      async init() {
        const box = $('#my-groups');
        try {
          const list = await api('/me/groups');
          if (!list.length) { box.innerHTML = '<div class="empty-state"><p>Aún no tienes grupos asignados.</p></div>'; return; }
          box.innerHTML = `<div class="course-list">${list.map(g => `
            <article class="my-course">
              <div class="my-course-head">
                <div><h3>${esc(g.course.name)}</h3><p class="muted">Grupo ${esc(g.code)}</p></div>
                <span class="status-pill st-info">${g.students.length} alumno${g.students.length === 1 ? '' : 's'}</span>
              </div>
              <ul class="my-course-meta">
                <li><i class="fa-regular fa-calendar" aria-hidden="true"></i> ${fmtDay(g.startDate)} – ${fmtDay(g.endDate)}</li>
                ${g.schedule ? `<li><i class="fa-regular fa-clock" aria-hidden="true"></i> ${esc(g.schedule)}</li>` : ''}
              </ul>
              ${g.students.length ? `<details class="students-list"><summary>Ver alumnos</summary><ul>${g.students.map(s => `<li>${esc(s.fullName)} <span class="muted">${esc(s.email || '')}</span></li>`).join('')}</ul></details>` : ''}
              ${g.zoomUrl ? `<a class="btn btn-primary btn-sm" href="${esc(g.zoomUrl)}" target="_blank" rel="noopener"><i class="fa-solid fa-video" aria-hidden="true"></i> Abrir Zoom</a>` : ''}
            </article>`).join('')}</div>`;
        } catch (err) { box.innerHTML = `<p class="text-danger">${esc(err.message)}</p>`; }
      }
    };
  }

  /* ----- Administrador: Cursos y grupos ----- */
  function groupsBlock() {
    return {
      html: `
        <section class="panel-card">
          <div class="panel-card-head">
            <h2><i class="fa-solid fa-layer-group" aria-hidden="true"></i> Cursos y grupos</h2>
            <button class="btn btn-primary btn-sm" id="new-group-btn"><i class="fa-solid fa-plus"></i> Nuevo grupo</button>
          </div>
          <form id="group-form" class="form-grid group-form" hidden novalidate>
            <div class="field"><label for="g-course">Curso</label><select id="g-course" name="courseSlug" required></select></div>
            <div class="field"><label for="g-start">Fecha de inicio</label><input id="g-start" name="startDate" type="date" required></div>
            <div class="field"><label for="g-end">Fecha de fin <span class="muted">(opcional: inicio + 8 semanas)</span></label><input id="g-end" name="endDate" type="date"></div>
            <div class="field"><label for="g-cap">Cupo</label><input id="g-cap" name="capacity" type="number" min="1" max="200" value="20"></div>
            <div class="field full"><label for="g-sched">Horario</label><input id="g-sched" name="schedule" maxlength="200" placeholder="Ej.: Martes y jueves de 7:00 a 9:00 p. m."></div>
            <div class="field full"><label for="g-zoom">Enlace de Zoom <span class="muted">(opcional)</span></label><input id="g-zoom" name="zoomUrl" type="url" placeholder="https://zoom.us/j/..."></div>
            <div class="full"><button class="btn btn-primary" type="submit">Crear grupo</button> <button class="btn btn-ghost" type="button" id="cancel-group">Cancelar</button></div>
            <div class="alert full" id="group-msg" hidden></div>
          </form>
          <div id="groups-box"><p class="muted">Cargando…</p></div>
          <div id="group-detail"></div>
        </section>`,
      init() {
        const form = $('#group-form');
        $('#new-group-btn').addEventListener('click', async () => {
          form.hidden = !form.hidden;
          if (!form.hidden && !form.courseSlug.options.length) {
            const courses = await api('/admin/courses').catch(() => []);
            form.courseSlug.innerHTML = courses.map(c => `<option value="${esc(c.slug)}">${esc(c.name)}${c.level ? ` (nivel ${c.level})` : ''}</option>`).join('');
          }
        });
        $('#cancel-group').addEventListener('click', () => { form.hidden = true; });
        form.addEventListener('submit', async e => {
          e.preventDefault();
          if (!form.reportValidity()) return;
          const body = { courseSlug: form.courseSlug.value, startDate: form.startDate.value, capacity: Number(form.capacity.value) || 20 };
          if (form.endDate.value) body.endDate = form.endDate.value;
          if (form.schedule.value.trim()) body.schedule = form.schedule.value.trim();
          if (form.zoomUrl.value.trim()) body.zoomUrl = form.zoomUrl.value.trim();
          setBusy(form, true);
          try {
            const g = await api('/admin/groups', { method: 'POST', body });
            form.reset(); form.hidden = true;
            await loadGroups();
            openGroup(g.id);
          } catch (err) { showMsg($('#group-msg'), 'danger', esc(err.message)); }
          finally { setBusy(form, false); }
        });
        loadGroups();
      }
    };
  }

  async function loadGroups() {
    const box = $('#groups-box');
    try {
      const list = await api('/admin/groups');
      if (!list.length) { box.innerHTML = '<p class="muted">Aún no hay grupos. Crea uno con <strong>Nuevo grupo</strong> para asignar docentes y alumnos.</p>'; return; }
      box.innerHTML = `<div class="table-wrap"><table class="table">
        <thead><tr><th>Curso</th><th>Grupo</th><th>Fechas</th><th>Docentes</th><th>Alumnos</th><th></th></tr></thead>
        <tbody>${list.map(g => `<tr>
          <td><strong>${esc(g.course.name)}</strong>${g.schedule ? `<br><span class="muted">${esc(g.schedule)}</span>` : ''}</td>
          <td class="muted">${esc(g.code)}</td>
          <td class="muted">${fmtDay(g.startDate)} – ${fmtDay(g.endDate)}</td>
          <td>${g.teachers.length ? g.teachers.map(t => esc(t.fullName)).join(', ') : '<span class="muted">Sin docente</span>'}</td>
          <td>${g.students} / ${g.capacity}</td>
          <td class="actions"><button class="btn btn-ghost btn-xs" data-open-group="${g.id}">Gestionar</button></td>
        </tr>`).join('')}</tbody></table></div>`;
      box.querySelectorAll('[data-open-group]').forEach(b => b.addEventListener('click', () => openGroup(b.dataset.openGroup)));
    } catch (err) { box.innerHTML = `<p class="text-danger">${esc(err.message)}</p>`; }
  }

  async function openGroup(id) {
    const box = $('#group-detail');
    box.innerHTML = '<p class="muted">Cargando grupo…</p>';
    try {
      const [g, teachers, students] = await Promise.all([
        api(`/admin/groups/${id}`),
        api('/admin/users?role=TEACHER&status=ACTIVE'),
        api('/admin/users?role=STUDENT&status=ACTIVE')
      ]);
      const assignedT = new Set(g.teachers.map(t => t.id));
      const enrolledS = new Set(g.students.map(s => s.id));
      const tOptions = teachers.filter(u => !assignedT.has(u.id));
      const sOptions = students.filter(u => !enrolledS.has(u.id));
      const opt = u => `<option value="${u.id}">${esc(u.fullName)} — ${esc(u.email || u.username || '')}</option>`;

      box.innerHTML = `
        <div class="group-detail">
          <div class="panel-card-head">
            <h3>${esc(g.course.name)} · <span class="muted">${esc(g.code)}</span></h3>
            <button class="btn btn-ghost btn-xs" id="close-group">Cerrar</button>
          </div>
          <p class="muted">${fmtDay(g.startDate)} – ${fmtDay(g.endDate)}${g.schedule ? ' · ' + esc(g.schedule) : ''} · Pago hasta ${new Date(g.paymentDueDate).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })}${g.zoomUrl ? ` · <a href="${esc(g.zoomUrl)}" target="_blank" rel="noopener">Zoom</a>` : ''}</p>

          <h4><i class="fa-solid fa-chalkboard-user"></i> Docentes</h4>
          <ul class="chip-list">${g.teachers.map(t => `<li>${esc(t.fullName)} <button class="link-btn" data-rm-teacher="${t.id}" aria-label="Quitar ${esc(t.fullName)}">✕</button></li>`).join('') || '<li class="muted">Sin docentes asignados</li>'}</ul>
          <div class="assign-row">
            <select id="t-select" aria-label="Docente">${tOptions.length ? tOptions.map(opt).join('') : '<option value="">No hay más docentes activos</option>'}</select>
            <button class="btn btn-primary btn-xs" id="t-add" ${tOptions.length ? '' : 'disabled'}>Asignar docente</button>
          </div>

          <h4><i class="fa-solid fa-user-graduate"></i> Alumnos matriculados (${g.students.length}/${g.capacity})</h4>
          ${g.students.length ? `<div class="table-wrap"><table class="table">
            <thead><tr><th>Nombre</th><th>Correo</th><th>Pago</th><th></th></tr></thead>
            <tbody>${g.students.map(s => `<tr><td>${esc(s.fullName)}</td><td class="muted">${esc(s.email || '')}</td>
              <td>${s.paid ? '<span class="status-pill st-success">Pagado</span>' : `<span class="status-pill st-warning">Pendiente · ${soles(s.priceCents - s.paidCents)}</span>`}</td>
              <td class="actions"><button class="btn btn-ghost btn-xs" data-rm-student="${s.id}">Quitar</button></td></tr>`).join('')}</tbody></table></div>`
            : '<p class="muted">Aún no hay alumnos matriculados.</p>'}
          <div class="assign-row">
            <select id="s-select" aria-label="Alumno">${sOptions.length ? sOptions.map(opt).join('') : '<option value="">No hay más alumnos activos</option>'}</select>
            <button class="btn btn-primary btn-xs" id="s-add" ${sOptions.length ? '' : 'disabled'}>Matricular alumno</button>
          </div>
          <p class="muted small">Solo aparecen usuarios <strong>activos</strong> con el rol correspondiente. Aprueba primero su solicitud de cuenta.</p>
          <div class="alert" id="gd-msg" hidden></div>
        </div>`;

      const act = async (fn) => { try { await fn(); await loadGroups(); await openGroup(id); } catch (err) { showMsg($('#gd-msg'), 'danger', esc(err.message)); } };
      $('#close-group').addEventListener('click', () => { box.innerHTML = ''; });
      $('#t-add').addEventListener('click', () => act(() => api(`/admin/groups/${id}/teachers`, { method: 'POST', body: { userId: $('#t-select').value } })));
      $('#s-add').addEventListener('click', () => act(() => api(`/admin/groups/${id}/students`, { method: 'POST', body: { userId: $('#s-select').value } })));
      box.querySelectorAll('[data-rm-teacher]').forEach(b => b.addEventListener('click', () => act(() => api(`/admin/groups/${id}/teachers/${b.dataset.rmTeacher}`, { method: 'DELETE' }))));
      box.querySelectorAll('[data-rm-student]').forEach(b => b.addEventListener('click', () => {
        if (confirm('¿Quitar a este alumno del grupo? Perderá el acceso al curso.')) act(() => api(`/admin/groups/${id}/students/${b.dataset.rmStudent}`, { method: 'DELETE' }));
      }));
      box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) { box.innerHTML = `<p class="text-danger">${esc(err.message)}</p>`; }
  }

  /* ----- Formas de ingreso (vincular Google / Microsoft) ----- */
  async function renderLoginMethods(body) {
    const holder = document.createElement('section');
    holder.className = 'panel-card';
    body.after(holder);
    let methods, enabled;
    try {
      [methods, enabled] = await Promise.all([api('/auth/login-methods'), api('/auth/providers')]);
    } catch { holder.remove(); return; }

    const linked = new Set(methods.identities.map(i => i.provider.toLowerCase()));
    const row = (icon, label, detail, action) => `
      <li class="method-row"><span><i class="${icon}" aria-hidden="true"></i> <strong>${label}</strong>
        <span class="muted">${detail}</span></span>${action}</li>`;

    const rows = [row('fa-solid fa-envelope', 'Correo y contraseña', methods.password ? 'Configurado' : 'No configurado', '')];
    ['google', 'microsoft'].forEach(p => {
      const icon = `fa-brands fa-${p}`;
      if (linked.has(p)) {
        const id = methods.identities.find(i => i.provider.toLowerCase() === p);
        rows.push(row(icon, PROVIDER_LABEL[p], `Vinculado${id.providerEmail ? ' · ' + esc(id.providerEmail) : ''}`, '<span class="status-pill st-success">Activo</span>'));
      } else if (enabled[p]) {
        rows.push(row(icon, PROVIDER_LABEL[p], 'No vinculado', `<a class="btn btn-ghost btn-xs" href="${oidcUrl(p, 'link')}">Vincular</a>`));
      }
    });

    holder.innerHTML = `<h2><i class="fa-solid fa-key" aria-hidden="true"></i> Formas de ingreso</h2><ul class="method-list">${rows.join('')}</ul>`;
  }

  function placeholderBlock(icon, title, text) {
    return {
      html: `<section class="panel-card"><h2><i class="fa-solid ${icon}" aria-hidden="true"></i> ${title}</h2>
        <div class="empty-state"><p>${text}</p><span class="badge badge-muted">Próxima etapa</span></div></section>`
    };
  }

  /* ----- Usuario pendiente: solicitar perfil ----- */
  async function renderPending(body) {
    let requests = [];
    try { requests = await api('/account-requests/mine'); } catch { /* ignore */ }
    const pending = requests.find(r => r.status === 'PENDING');
    const lastRejected = requests.find(r => r.status === 'REJECTED');

    if (pending) {
      body.innerHTML = `<section class="panel-card"><h2><i class="fa-solid fa-hourglass-half"></i> Solicitud en revisión</h2>
        <p class="muted">Pediste acceso como <strong>${ROLE_LABEL[pending.requestedRole]}</strong> el ${fmtDate(pending.createdAt)}.
        Te avisaremos por correo cuando sea aprobada.</p></section>`;
      return;
    }

    body.innerHTML = `
      <section class="panel-card">
        <h2><i class="fa-solid fa-id-card" aria-hidden="true"></i> Completa tu solicitud</h2>
        ${lastRejected ? `<div class="alert alert-warning"><i class="fa-solid fa-triangle-exclamation"></i><p>Tu solicitud anterior fue rechazada.${lastRejected.reviewNotes ? ' Motivo: ' + esc(lastRejected.reviewNotes) : ''}</p></div>` : ''}
        <p class="muted" style="margin-bottom:1.25rem">Indica cómo usarás el campus. Un administrador revisará tu solicitud.</p>
        <form id="request-form" class="form-grid" novalidate>
          <div class="field"><label for="rq-role">Me registro como</label>
            <select id="rq-role" name="role" required>
              <option value="STUDENT">Alumno</option>
              <option value="GUARDIAN">Apoderado (padre, madre o tutor)</option>
              <option value="TEACHER">Docente</option>
            </select></div>
          <div class="field"><label for="rq-phone">Celular</label><input id="rq-phone" name="phone" type="tel" pattern="[0-9 +]{9,15}" required></div>
          <div class="field" data-for="STUDENT"><label for="rq-birth">Fecha de nacimiento</label><input id="rq-birth" name="birthDate" type="date" required></div>
          <div class="field" data-for="GUARDIAN" hidden><label for="rq-doctype">Tipo de documento</label>
            <select id="rq-doctype" name="documentType"><option value="DNI">DNI</option><option value="CE">Carné de extranjería</option><option value="PASAPORTE">Pasaporte</option></select></div>
          <div class="field" data-for="GUARDIAN" hidden><label for="rq-docnum">Número de documento</label><input id="rq-docnum" name="documentNumber" maxlength="20"></div>
          <div class="full"><button class="btn btn-primary" type="submit">Enviar solicitud</button></div>
          <div class="alert full" id="rq-msg" hidden></div>
        </form>
      </section>`;

    const f = $('#request-form');
    const sync = () => {
      const role = f.role.value;
      f.querySelectorAll('[data-for]').forEach(el => {
        const on = el.dataset.for === role;
        el.hidden = !on;
        el.querySelectorAll('input,select').forEach(i => { i.required = on && i.name !== 'documentType'; });
      });
    };
    f.role.addEventListener('change', sync);
    sync();

    f.addEventListener('submit', async e => {
      e.preventDefault();
      if (!f.reportValidity()) return;
      const role = f.role.value;
      const payload = { role, phone: f.phone.value.trim() };
      if (role === 'STUDENT') payload.birthDate = f.birthDate.value;
      if (role === 'GUARDIAN') { payload.documentType = f.documentType.value; payload.documentNumber = f.documentNumber.value.trim(); }
      setBusy(f, true);
      try {
        await api('/account-requests', { method: 'POST', body: payload });
        renderPending(body);
      } catch (err) {
        showMsg($('#rq-msg'), 'danger', esc(err.message));
        setBusy(f, false);
      }
    });
  }

  /* ----- Administrador ----- */
  function adminBlock() {
    return {
      html: `
        <section class="panel-card">
          <div class="panel-card-head">
            <h2><i class="fa-solid fa-user-check" aria-hidden="true"></i> Solicitudes de cuenta</h2>
            <button class="btn btn-ghost btn-sm" data-reload="requests"><i class="fa-solid fa-rotate"></i> Actualizar</button>
          </div>
          <div id="requests-box"><p class="muted">Cargando…</p></div>
        </section>
        <section class="panel-card">
          <div class="panel-card-head">
            <h2><i class="fa-solid fa-users" aria-hidden="true"></i> Usuarios</h2>
            <input type="search" id="users-q" class="input-sm" placeholder="Buscar por nombre o correo" aria-label="Buscar usuarios">
          </div>
          <div id="users-box"><p class="muted">Cargando…</p></div>
        </section>`,
      init() {
        loadRequests();
        loadUsers();
        $('[data-reload="requests"]').addEventListener('click', loadRequests);
        let t;
        $('#users-q').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => loadUsers(e.target.value), 300); });
      }
    };
  }

  async function loadRequests() {
    const box = $('#requests-box');
    try {
      const list = await api('/admin/account-requests?status=PENDING');
      if (!list.length) { box.innerHTML = '<p class="muted">No hay solicitudes pendientes.</p>'; return; }
      box.innerHTML = `<div class="table-wrap"><table class="table">
        <thead><tr><th>Nombre</th><th>Correo</th><th>Solicita</th><th>Datos</th><th>Fecha</th><th></th></tr></thead>
        <tbody>${list.map(r => {
          const u = r.user;
          const extra = r.requestedRole === 'STUDENT' && u.studentProfile && u.studentProfile.birthDate
            ? `Nac.: ${fmtDate(u.studentProfile.birthDate)}`
            : r.requestedRole === 'GUARDIAN' && u.guardianProfile && u.guardianProfile.documentNumber
              ? `${esc(u.guardianProfile.documentType)} ${esc(u.guardianProfile.documentNumber)}` : '';
          return `<tr>
            <td>${esc(u.fullName)}</td><td>${esc(u.email || u.username)}</td>
            <td><span class="badge">${ROLE_LABEL[r.requestedRole]}</span></td>
            <td class="muted">${esc(u.phone || '')}${extra ? '<br>' + extra : ''}</td>
            <td class="muted">${fmtDate(r.createdAt)}</td>
            <td class="actions">
              <button class="btn btn-primary btn-xs" data-approve="${r.id}">Aprobar</button>
              <button class="btn btn-ghost btn-xs" data-reject="${r.id}">Rechazar</button>
            </td></tr>`;
        }).join('')}</tbody></table></div>`;

      box.querySelectorAll('[data-approve]').forEach(b => b.addEventListener('click', () => review(b.dataset.approve, 'approve')));
      box.querySelectorAll('[data-reject]').forEach(b => b.addEventListener('click', () => {
        const notes = prompt('Motivo del rechazo (se enviará al usuario):');
        if (notes !== null) review(b.dataset.reject, 'reject', notes.trim());
      }));
    } catch (err) {
      box.innerHTML = `<p class="text-danger">${esc(err.message)}</p>`;
    }
  }

  async function review(id, action, notes) {
    try {
      await api(`/admin/account-requests/${id}/${action}`, { method: 'POST', body: notes ? { notes } : {} });
      loadRequests();
      loadUsers($('#users-q').value);
    } catch (err) {
      alert(err.message);
    }
  }

  async function loadUsers(q = '') {
    const box = $('#users-box');
    try {
      const list = await api(`/admin/users${q ? `?q=${encodeURIComponent(q)}` : ''}`);
      if (!list.length) { box.innerHTML = '<p class="muted">Sin resultados.</p>'; return; }
      box.innerHTML = `<div class="table-wrap"><table class="table">
        <thead><tr><th>Nombre</th><th>Correo</th><th>Roles</th><th>Estado</th><th></th></tr></thead>
        <tbody>${list.map(u => {
          const [label, type] = STATUS_LABEL[u.status] || [u.status, 'info'];
          const action = u.status === 'ACTIVE'
            ? `<button class="btn btn-ghost btn-xs" data-suspend="${u.id}">Suspender</button>`
            : u.status === 'SUSPENDED' ? `<button class="btn btn-ghost btn-xs" data-reactivate="${u.id}">Reactivar</button>` : '';
          return `<tr><td>${esc(u.fullName)}</td><td>${esc(u.email || u.username)}</td>
            <td>${u.roles.map(r => `<span class="badge">${ROLE_LABEL[r.role]}</span>`).join(' ') || '<span class="muted">—</span>'}</td>
            <td><span class="status-pill st-${type}">${label}</span></td><td class="actions">${action}</td></tr>`;
        }).join('')}</tbody></table></div>`;

      const act = async (id, kind) => {
        const reason = prompt(kind === 'suspend' ? 'Motivo de la suspensión:' : 'Motivo de la reactivación:');
        if (!reason || reason.trim().length < 3) return;
        try {
          await api(`/admin/users/${id}/${kind}`, { method: 'POST', body: { reason: reason.trim() } });
          loadUsers($('#users-q').value);
        } catch (err) { alert(err.message); }
      };
      box.querySelectorAll('[data-suspend]').forEach(b => b.addEventListener('click', () => act(b.dataset.suspend, 'suspend')));
      box.querySelectorAll('[data-reactivate]').forEach(b => b.addEventListener('click', () => act(b.dataset.reactivate, 'reactivate')));
    } catch (err) {
      box.innerHTML = `<p class="text-danger">${esc(err.message)}</p>`;
    }
  }

  const inits = { login: initLogin, verificar: initVerify, restablecer: initReset, panel: initPanel };
  if (inits[page]) inits[page]();
})();
