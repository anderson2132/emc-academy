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
  const pill = ([label, type]) => `<span class="status-pill st-${type}">${label}</span>`;
  const ENROLL_STATUS = {
    PENDING_GUARDIAN: ['Espera autorización del apoderado', 'warning'],
    REQUESTED: ['En revisión', 'warning'],
    APPROVED: ['Aprobada', 'success'],
    REJECTED: ['Rechazada', 'danger'],
    CANCELLED: ['Anulada', 'muted']
  };
  const LINK_STATUS = {
    PENDING_GUARDIAN: ['Espera autorización del apoderado', 'warning'],
    PENDING_ADMIN: ['En revisión por administración', 'warning'],
    APPROVED: ['Vinculado', 'success'],
    REVOKED: ['Anulado', 'danger']
  };
  const GROUP_STATUS = {
    PLANNED: ['Planificado', 'info'],
    ENROLLING: ['Inscripciones abiertas', 'success'],
    IN_PROGRESS: ['En curso', 'info'],
    FINISHED: ['Terminado', 'muted'],
    CANCELLED: ['Cancelado', 'danger']
  };
  const COURSE_STATUS = { DRAFT: ['Borrador', 'warning'], PUBLISHED: ['Publicado', 'success'], ARCHIVED: ['Archivado', 'muted'] };
  const PRE_STATUS = { PENDING: ['Esperando cuenta', 'info'], CLAIMED: ['Reclamada: verificar', 'warning'], LINKED: ['Vinculada', 'success'], CANCELLED: ['Anulada', 'muted'] };
  const CONSENT_TEXT = 'Declaro ser padre, madre o tutor legal del menor y autorizo a EMC Academy a registrarlo y a tratar sus datos personales con fines académicos. <span class="muted">(Texto provisional.)</span>';
  /** Convierte "450" o "450.50" a céntimos; vacío → undefined. */
  const toCents = v => { const n = Number(String(v || '').replace(',', '.')); return v && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : undefined; };
  const isMinorDate = iso => { if (!iso) return false; const d = new Date(`${iso}T00:00:00`); d.setFullYear(d.getFullYear() + 18); return new Date() < d; };

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
      box.innerHTML = `<i class="fa-solid fa-circle-info" aria-hidden="true"></i><p>Para inscribirte en <strong>${esc(course.name)}</strong>, crea tu cuenta (o ingresa) y escríbenos por WhatsApp: el equipo académico te matricula.</p>`;
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
    if (me.roles.includes('ADMIN')) {
      blocks.push(adminRequestsBlock(), enrollmentRequestsBlock(), guardianLinksBlock(), preEnrollmentsBlock(), groupsBlock(), coursesBlock(), usersBlock());
    }
    if (me.roles.includes('TEACHER')) blocks.push(teacherBlock());
    // La matrícula la hace SOLO el administrador (grupo → "Matricular alumno", o prematrícula).
    if (me.roles.includes('STUDENT')) blocks.push(claimBlock(), studentBlock(), myGuardiansBlock());
    if (me.roles.includes('GUARDIAN')) blocks.push(childrenBlock(), createChildBlock());
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
          if (!list.length) { box.innerHTML = `<div class="empty-state"><p>Aún no tienes cursos matriculados. Para inscribirte, escríbenos por WhatsApp: el equipo académico te matricula. <a href="../programas.html">Ver catálogo</a>.</p></div>`; return; }
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
              ${temario(c.course.modules)}
              ${c.zoomUrl ?`<a class="btn btn-primary btn-sm" href="${esc(c.zoomUrl)}" target="_blank" rel="noopener"><i class="fa-solid fa-video" aria-hidden="true"></i> Entrar a la clase (Zoom)</a>` : ''}
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
    if (!box) return;
    try {
      const list = await api('/admin/groups');
      if (!list.length) { box.innerHTML = '<p class="muted">Aún no hay grupos. Crea uno con <strong>Nuevo grupo</strong> para asignar docentes y alumnos.</p>'; return; }
      box.innerHTML = `<div class="table-wrap"><table class="table">
        <thead><tr><th>Curso</th><th>Grupo</th><th>Fechas</th><th>Estado</th><th>Docentes</th><th>Alumnos</th><th></th></tr></thead>
        <tbody>${list.map(g => `<tr>
          <td><strong>${esc(g.course.name)}</strong>${g.schedule ? `<br><span class="muted">${esc(g.schedule)}</span>` : ''}</td>
          <td class="muted">${esc(g.code)}</td>
          <td class="muted">${fmtDay(g.startDate)} – ${fmtDay(g.endDate)}</td>
          <td>${pill(GROUP_STATUS[g.status] || [g.status, 'info'])}</td>
          <td>${g.teachers.length ? g.teachers.map(t => esc(t.fullName)).join(', ') : '<span class="muted">Sin docente</span>'}</td>
          <td>${g.students} / ${g.capacity}${g.pendingRequests ? `<br><span class="status-pill st-warning">${g.pendingRequests} por revisar</span>` : ''}</td>
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
          <p class="muted">${pill(GROUP_STATUS[g.status] || [g.status, 'info'])} ${fmtDay(g.startDate)} – ${fmtDay(g.endDate)}${g.schedule ? ' · ' + esc(g.schedule) : ''} · Pago hasta ${new Date(g.paymentDueDate).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })}${g.zoomUrl ? ` · <a href="${esc(g.zoomUrl)}" target="_blank" rel="noopener">Zoom</a>` : ''}</p>
          ${g.pendingRequests ? `<p class="small"><span class="status-pill st-warning">${g.pendingRequests} solicitud${g.pendingRequests === 1 ? '' : 'es'} de matrícula por revisar</span> (ver "Solicitudes de matrícula")</p>` : ''}

          <details class="edit-box">
            <summary><i class="fa-solid fa-pen" aria-hidden="true"></i> Editar grupo</summary>
            <form id="ge-form" class="form-grid" novalidate>
              <div class="field"><label for="ge-start">Inicio</label><input id="ge-start" name="startDate" type="date" value="${g.startDate}" required></div>
              <div class="field"><label for="ge-end">Fin</label><input id="ge-end" name="endDate" type="date" value="${g.endDate}" required></div>
              <div class="field"><label for="ge-cap">Cupo</label><input id="ge-cap" name="capacity" type="number" min="1" max="200" value="${g.capacity}" required></div>
              <div class="field"><label for="ge-status">Estado</label><select id="ge-status" name="status">${Object.entries(GROUP_STATUS).map(([v, [l]]) => `<option value="${v}" ${v === g.status ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
              <div class="field full"><label for="ge-sched">Horario</label><input id="ge-sched" name="schedule" maxlength="200" value="${esc(g.schedule || '')}"></div>
              <div class="field full"><label for="ge-zoom">Enlace de Zoom</label><input id="ge-zoom" name="zoomUrl" type="url" value="${esc(g.zoomUrl || '')}" placeholder="https://zoom.us/j/..."></div>
              <p class="full muted small">Solo reciben solicitudes los grupos con <strong>Inscripciones abiertas</strong>. Al pasar a Cancelado o Terminado se cierran las solicitudes y prematrículas en curso.</p>
              <div class="full"><button class="btn btn-primary btn-sm" type="submit">Guardar cambios</button>
                <button class="btn btn-ghost btn-sm" type="button" id="ge-delete"><i class="fa-solid fa-trash" aria-hidden="true"></i> Eliminar grupo</button></div>
            </form>
          </details>

          <h4><i class="fa-solid fa-chalkboard-user"></i> Docentes</h4>
          <ul class="chip-list">${g.teachers.map(t => `<li>${esc(t.fullName)} <button class="link-btn" data-rm-teacher="${t.id}" aria-label="Quitar ${esc(t.fullName)}">✕</button></li>`).join('') || '<li class="muted">Sin docentes asignados</li>'}</ul>
          <div class="assign-row">
            <select id="t-select" aria-label="Docente">${tOptions.length ? tOptions.map(opt).join('') : '<option value="">No hay más docentes activos</option>'}</select>
            <button class="btn btn-primary btn-xs" id="t-add" ${tOptions.length ? '' : 'disabled'}>Asignar docente</button>
          </div>

          <h4><i class="fa-solid fa-user-graduate"></i> Alumnos matriculados (${g.students.length}/${g.capacity})</h4>
          ${g.students.length ? `<div class="table-wrap"><table class="table">
            <thead><tr><th>Nombre</th><th>Correo</th><th>Pago</th><th></th></tr></thead>
            <tbody>${g.students.map(s => `<tr><td>${esc(s.fullName)}</td><td class="muted">${esc(s.email || s.username || '')}</td>
              <td>${s.paid ? '<span class="status-pill st-success">Pagado</span>' : `<span class="status-pill st-warning">Pendiente · ${soles(s.priceCents - s.paidCents)}</span>`}</td>
              <td class="actions"><button class="btn btn-ghost btn-xs" data-rm-student="${s.id}">Quitar</button></td></tr>`).join('')}</tbody></table></div>`
            : '<p class="muted">Aún no hay alumnos matriculados.</p>'}
          <div class="assign-row">
            <select id="s-select" aria-label="Alumno">${sOptions.length ? sOptions.map(opt).join('') : '<option value="">No hay más alumnos activos</option>'}</select>
            <button class="btn btn-primary btn-xs" id="s-add" ${sOptions.length ? '' : 'disabled'}>Matricular alumno</button>
          </div>
          <p class="muted small">Solo aparecen usuarios <strong>activos</strong> con el rol correspondiente. Aprueba primero su solicitud de cuenta.</p>

          <h4><i class="fa-solid fa-user-clock"></i> Prematrículas de este grupo (${g.preEnrollments.length})</h4>
          ${g.preEnrollments.length ? `<ul class="chip-list">${g.preEnrollments.map(p => `<li>${esc(p.fullName)} <span class="muted">${esc(p.email)}</span> ${pill(PRE_STATUS[p.status])}</li>`).join('')}</ul>` : '<p class="muted">Sin prematrículas. Regístralas en el bloque "Prematrículas".</p>'}
          <div class="alert" id="gd-msg" hidden></div>
        </div>`;

      const act = async (fn) => { try { await fn(); await loadGroups(); await openGroup(id); } catch (err) { showMsg($('#gd-msg'), 'danger', esc(err.message)); } };
      $('#close-group').addEventListener('click', () => { box.innerHTML = ''; });
      $('#ge-form').addEventListener('submit', e => {
        e.preventDefault();
        const f = e.target;
        if (!f.reportValidity()) return;
        if (f.status.value !== g.status && ['CANCELLED', 'FINISHED'].includes(f.status.value) &&
          !confirm('Al cancelar o terminar el grupo se rechazan las solicitudes y prematrículas en curso. ¿Continuar?')) return;
        act(() => api(`/admin/groups/${id}`, {
          method: 'PATCH',
          body: {
            startDate: f.startDate.value, endDate: f.endDate.value, capacity: Number(f.capacity.value),
            status: f.status.value, schedule: f.schedule.value.trim(), zoomUrl: f.zoomUrl.value.trim()
          }
        }));
      });
      $('#ge-delete').addEventListener('click', async () => {
        if (!confirm('¿Eliminar este grupo? Solo se puede si no tiene alumnos, solicitudes ni prematrículas.')) return;
        try {
          await api(`/admin/groups/${id}`, { method: 'DELETE' });
          box.innerHTML = '';
          loadGroups();
        } catch (err) { showMsg($('#gd-msg'), 'danger', esc(err.message)); }
      });
      $('#t-add').addEventListener('click', () => act(() => api(`/admin/groups/${id}/teachers`, { method: 'POST', body: { userId: $('#t-select').value } })));
      $('#s-add').addEventListener('click', () => act(() => api(`/admin/groups/${id}/students`, { method: 'POST', body: { userId: $('#s-select').value } })));
      box.querySelectorAll('[data-rm-teacher]').forEach(b => b.addEventListener('click', () => act(() => api(`/admin/groups/${id}/teachers/${b.dataset.rmTeacher}`, { method: 'DELETE' }))));
      box.querySelectorAll('[data-rm-student]').forEach(b => b.addEventListener('click', () => {
        if (confirm('¿Quitar a este alumno del grupo? Perderá el acceso al curso.')) act(() => api(`/admin/groups/${id}/students/${b.dataset.rmStudent}`, { method: 'DELETE' }));
      }));
      box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) { box.innerHTML = `<p class="text-danger">${esc(err.message)}</p>`; }
  }

  /* ----- Temario de un curso ----- */
  function temario(modules) {
    if (!modules || !modules.length) return '';
    return `<details class="students-list"><summary>Ver temario (${modules.length} módulos)</summary>
      <ol class="temario">${modules.map(m => `<li>${esc(m.title)}</li>`).join('')}</ol></details>`;
  }

  /* ----- Alumno: prematrículas por confirmar ----- */
  function claimBlock() {
    return {
      html: '<div id="claim-holder"></div>',
      init() { renderClaims($('#claim-holder')); }
    };
  }

  async function renderClaims(holder) {
    if (!holder) return;
    const list = await api('/me/pre-enrollments').catch(() => []);
    if (!list.length) { holder.innerHTML = ''; return; }
    holder.innerHTML = `<section class="panel-card highlight-card">
      <h2><i class="fa-solid fa-envelope-open-text" aria-hidden="true"></i> Tienes una matrícula registrada por EMC Academy</h2>
      <div class="course-list">${list.map(p => `<article class="my-course">
        <div class="my-course-head"><div><h3>${esc(p.course)}</h3><p class="muted">Grupo ${esc(p.group.code)} · a nombre de ${esc(p.fullName)}</p></div>
          ${p.status === 'CLAIMED' ? pill(['Confirmada: en verificación', 'warning']) : ''}</div>
        <ul class="my-course-meta"><li><i class="fa-regular fa-calendar"></i> Inicia ${fmtDay(p.group.startDate)}</li>
          ${p.group.schedule ? `<li><i class="fa-regular fa-clock"></i> ${esc(p.group.schedule)}</li>` : ''}</ul>
        ${p.status === 'PENDING' ? `<button class="btn btn-primary btn-sm" data-claim="${p.id}"><i class="fa-solid fa-check"></i> Sí, es mi matrícula</button>`
          : '<p class="muted small">El administrador verificará tus datos y la matrícula aparecerá en "Mis cursos".</p>'}
      </article>`).join('')}</div></section>`;
    holder.querySelectorAll('[data-claim]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('¿Confirmas que esta matrícula es tuya? El administrador verificará tus datos.')) return;
      try { await api(`/me/pre-enrollments/${b.dataset.claim}/claim`, { method: 'POST' }); location.reload(); }
      catch (err) { alert(err.message); }
    }));
  }

  /* ----- Alumno: mis apoderados ----- */
  function myGuardiansBlock() {
    return {
      html: '<section class="panel-card" id="my-guardians"></section>',
      init() { renderMyGuardians($('#my-guardians')); }
    };
  }

  async function renderMyGuardians(holder) {
    if (!holder) return;
    const list = await api('/me/guardians').catch(() => []);
    holder.innerHTML = `
      <h2><i class="fa-solid fa-people-roof" aria-hidden="true"></i> Mi apoderado</h2>
      ${list.length ? `<ul class="method-list">${list.map(l => `<li class="method-row"><span><strong>${esc(l.guardian.fullName)}</strong>
        <span class="muted">${esc(l.guardian.email || '')}</span></span>${pill(LINK_STATUS[l.status])}</li>`).join('')}</ul>`
        : '<p class="muted">Si eres <strong>menor de edad</strong>, necesitas un apoderado vinculado para acceder a tus cursos.</p>'}
      <form class="assign-row" id="add-guardian-form" novalidate>
        <input type="email" name="email" class="input-sm" placeholder="Correo de tu apoderado" required aria-label="Correo de tu apoderado">
        <button class="btn btn-primary btn-xs" type="submit">Agregar apoderado</button>
      </form>
      <p class="muted small">Tu apoderado debe tener una cuenta de <strong>Apoderado</strong> en el campus. Le pediremos que autorice el vínculo.</p>
      <div class="alert" id="add-guardian-msg" hidden></div>`;
    const f = $('#add-guardian-form');
    f.addEventListener('submit', async e => {
      e.preventDefault();
      if (!f.reportValidity()) return;
      setBusy(f, true);
      try {
        await api('/me/guardians', { method: 'POST', body: { email: f.email.value.trim() } });
        renderMyGuardians(holder);
      } catch (err) { showMsg($('#add-guardian-msg'), 'danger', esc(err.message)); setBusy(f, false); }
    });
  }

  /* ----- Apoderado: mis hijos ----- */
  function childrenBlock() {
    return {
      html: `<section class="panel-card"><div class="panel-card-head">
          <h2><i class="fa-solid fa-people-roof" aria-hidden="true"></i> Mis hijos</h2>
          <a class="btn btn-ghost btn-sm" href="#create-child-card"><i class="fa-solid fa-user-plus"></i> Registrar a mi hijo/a</a></div>
        <div id="children-box"><p class="muted">Cargando…</p></div></section>`,
      init: loadChildren
    };
  }

  async function loadChildren() {
    const box = $('#children-box');
    if (!box) return;
    try {
      const kids = await api('/me/children');
      if (!kids.length) {
        box.innerHTML = '<div class="empty-state"><p>Aún no tienes hijos vinculados. Regístralo con el formulario de abajo, o pídele que te agregue como apoderado desde su cuenta.</p></div>';
        return;
      }
      box.innerHTML = `<div class="course-list">${kids.map(k => `
        <article class="my-course">
          <div class="my-course-head">
            <div><h3>${esc(k.student.fullName)}</h3><p class="muted">${esc(k.student.email || 'Usuario: ' + (k.student.username || ''))}${k.relationship ? ' · ' + esc(k.relationship) : ''}</p></div>
            ${pill(k.linkStatus === 'PENDING_GUARDIAN' ? ['Espera tu autorización', 'warning'] : LINK_STATUS[k.linkStatus])}
          </div>
          ${k.linkStatus === 'PENDING_GUARDIAN' ? `
            <form class="authorize-form" data-student="${k.student.id}">
              <p class="muted small">${esc(k.student.fullName)} te indicó como su apoderado.</p>
              <div class="field"><label>Parentesco</label><input name="relationship" maxlength="40" placeholder="Madre, padre, tutor…"></div>
              <label class="field-check"><input type="checkbox" name="consent" required> <span>${CONSENT_TEXT}</span></label>
              <div><button class="btn btn-primary btn-xs" type="submit">Autorizar</button> <button class="btn btn-ghost btn-xs" type="button" data-decline="${k.student.id}">No soy su apoderado</button></div>
            </form>` : ''}
          ${k.linkStatus === 'PENDING_ADMIN' ? '<p class="muted small">El administrador está revisando el vínculo. Te avisaremos por correo.</p>' : ''}
          ${k.courses.length ? `<ul class="child-courses">${k.courses.map(c => {
            const pay = c.payment.paid ? pill(['Pagado', 'success'])
              : (c.access.live === 'PAYMENT_OVERDUE' || c.access.content === 'PAYMENT_OVERDUE') ? pill(['Pago vencido', 'danger'])
              : pill([`Pago pendiente · hasta ${new Date(c.payment.dueDate).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })}`, 'warning']);
            return `<li><strong>${esc(c.course.name)}</strong> ${pay}<br>
              <span class="muted">${fmtDay(c.group.startDate)} – ${fmtDay(c.group.endDate)}${c.group.schedule ? ' · ' + esc(c.group.schedule) : ''}${c.group.teachers.length ? ' · ' + c.group.teachers.map(esc).join(', ') : ''}</span>
              ${!c.payment.paid ? `<br><span class="muted">${soles(c.payment.amountCents - c.payment.paidCents)} por pagar</span>` : ''}</li>`;
          }).join('')}</ul>` : k.linkStatus === 'APPROVED' ? '<p class="muted small">Sin cursos matriculados todavía. Para inscribirlo, escríbenos por WhatsApp: el equipo académico lo matricula.</p>' : ''}
        </article>`).join('')}</div>`;

      box.querySelectorAll('.authorize-form').forEach(f => f.addEventListener('submit', async e => {
        e.preventDefault();
        if (!f.reportValidity()) return;
        try {
          await api(`/me/children/${f.dataset.student}/authorize`, { method: 'POST', body: { consent: true, relationship: f.relationship.value.trim() || undefined } });
          loadChildren();
        } catch (err) { alert(err.message); }
      }));
      box.querySelectorAll('[data-decline]').forEach(b => b.addEventListener('click', async () => {
        if (!confirm('¿Rechazar este vínculo?')) return;
        try { await api(`/me/children/${b.dataset.decline}/decline`, { method: 'POST' }); loadChildren(); } catch (err) { alert(err.message); }
      }));
    } catch (err) { box.innerHTML = `<p class="text-danger">${esc(err.message)}</p>`; }
  }

  function createChildBlock() {
    return {
      html: `
        <section class="panel-card" id="create-child-card">
          <h2><i class="fa-solid fa-user-plus" aria-hidden="true"></i> Registrar a mi hijo/a</h2>
          <p class="muted" style="margin-bottom:1rem">Creamos su cuenta del campus. Si no tiene correo, elige un nombre de usuario. El administrador revisará el registro.</p>
          <form id="child-form" class="form-grid" novalidate>
            <div class="field"><label for="ch-name">Nombres y apellidos</label><input id="ch-name" name="fullName" minlength="3" maxlength="120" required></div>
            <div class="field"><label for="ch-birth">Fecha de nacimiento</label><input id="ch-birth" name="birthDate" type="date" required></div>
            <div class="field"><label for="ch-email">Correo del menor <span class="muted">(opcional)</span></label><input id="ch-email" name="email" type="email"></div>
            <div class="field"><label for="ch-user">Usuario <span class="muted">(si no tiene correo)</span></label><input id="ch-user" name="username" pattern="[a-zA-Z0-9._\\-]{4,30}" placeholder="ej. sofia.perez"></div>
            <div class="field"><label for="ch-pass">Contraseña para su cuenta</label><input id="ch-pass" name="password" type="password" minlength="8" autocomplete="new-password" required></div>
            <div class="field"><label for="ch-rel">Parentesco</label><input id="ch-rel" name="relationship" maxlength="40" placeholder="Madre, padre, tutor…"></div>
            <label class="field-check full"><input type="checkbox" name="consent" required> <span>${CONSENT_TEXT}</span></label>
            <div class="full"><button class="btn btn-primary" type="submit">Registrar</button></div>
            <div class="alert full" id="child-msg" hidden></div>
          </form>
        </section>`,
      init() {
        const f = $('#child-form');
        f.addEventListener('submit', async e => {
          e.preventDefault();
          if (!f.reportValidity()) return;
          const email = f.email.value.trim(), username = f.username.value.trim();
          if (!email && !username) return showMsg($('#child-msg'), 'danger', 'Indica un correo o un nombre de usuario.');
          setBusy(f, true);
          try {
            const r = await api('/me/children', {
              method: 'POST',
              body: {
                fullName: f.fullName.value.trim(), birthDate: f.birthDate.value, password: f.password.value, consent: true,
                email: email || undefined, username: username || undefined, relationship: f.relationship.value.trim() || undefined
              }
            });
            f.reset();
            showMsg($('#child-msg'), 'success', `Listo. Cuando el administrador lo apruebe, podrá ingresar con <strong>${esc(r.login)}</strong> y la contraseña que elegiste.`);
            loadChildren();
          } catch (err) { showMsg($('#child-msg'), 'danger', esc(err.message)); }
          finally { setBusy(f, false); }
        });
      }
    };
  }

  /* ----- Admin: solicitudes de matrícula ANTERIORES -----
     Desde 2026-11-22 solo el admin matricula; este bloque aparece únicamente
     si quedan solicitudes hechas por alumnos/apoderados antes del cambio, para cerrarlas. */
  function enrollmentRequestsBlock() {
    return {
      html: `<section class="panel-card" id="enr-card" hidden><div class="panel-card-head">
          <h2><i class="fa-solid fa-file-signature" aria-hidden="true"></i> Solicitudes de matrícula anteriores</h2>
          <select id="enr-filter" class="input-sm" aria-label="Filtrar solicitudes">
            <option value="REQUESTED">Por revisar</option>
            <option value="PENDING_GUARDIAN">Esperando al apoderado</option>
            <option value="REJECTED">Rechazadas</option>
          </select></div>
        <div id="enr-box"><p class="muted">Cargando…</p></div></section>`,
      async init() {
        const [a, b] = await Promise.all(['REQUESTED', 'PENDING_GUARDIAN'].map(s => api(`/admin/enrollments?status=${s}`).catch(() => [])));
        if (!a.length && !b.length) { $('#enr-card').remove(); return; }
        $('#enr-card').hidden = false;
        if (!a.length) $('#enr-filter').value = 'PENDING_GUARDIAN';
        $('#enr-filter').addEventListener('change', loadEnrollmentRequests);
        loadEnrollmentRequests();
      }
    };
  }

  async function loadEnrollmentRequests() {
    const box = $('#enr-box');
    if (!box) return;
    const status = $('#enr-filter').value;
    try {
      const list = await api(`/admin/enrollments?status=${status}`);
      if (!list.length) { box.innerHTML = '<p class="muted">No hay solicitudes en este estado.</p>'; return; }
      box.innerHTML = `<div class="table-wrap"><table class="table">
        <thead><tr><th>Alumno</th><th>Curso / grupo</th><th>Cupos</th><th>Fecha</th><th></th></tr></thead>
        <tbody>${list.map(r => `<tr>
          <td><strong>${esc(r.student.fullName)}</strong> ${r.student.minor ? '<span class="badge">Menor</span>' : ''}<br>
            <span class="muted">${esc(r.student.email || r.student.username || '')}${r.student.phone ? ' · ' + esc(r.student.phone) : ''}</span>
            ${r.guardians.length ? `<br><span class="muted small">Apoderado: ${r.guardians.map(g => esc(g.fullName) + (g.phone ? ' (' + esc(g.phone) + ')' : '')).join(', ')}</span>` : ''}
            ${r.requestedBy ? `<br><span class="muted small">Pedida por: ${esc(r.requestedBy)}</span>` : ''}
            ${r.guardianApproved && r.student.minor ? '<br><span class="status-pill st-success">Autorizada por el apoderado</span>' : ''}</td>
          <td>${esc(r.course)}<br><span class="muted">${esc(r.group.code)} · inicia ${fmtDay(r.group.startDate)}</span></td>
          <td>${r.group.approved} / ${r.group.capacity}</td>
          <td class="muted">${fmtDate(r.createdAt)}${r.reviewNotes ? `<br>${esc(r.reviewNotes)}` : ''}</td>
          <td class="actions">${r.status === 'REQUESTED' ? `<button class="btn btn-primary btn-xs" data-enr-approve="${r.id}" data-price="${r.priceCents}">Aprobar</button>` : ''}
            ${['REQUESTED', 'PENDING_GUARDIAN'].includes(r.status) ? `<button class="btn btn-ghost btn-xs" data-enr-reject="${r.id}">Rechazar</button>` : ''}</td>
        </tr>`).join('')}</tbody></table></div>`;
      box.querySelectorAll('[data-enr-approve]').forEach(b => b.addEventListener('click', async () => {
        const d = prompt(`Precio: ${soles(Number(b.dataset.price))}. Descuento en soles (deja vacío si no hay):`, '');
        if (d === null) return;
        const discountCents = toCents(d.trim());
        if (d.trim() && discountCents === undefined) return alert('Descuento inválido.');
        try {
          await api(`/admin/enrollments/${b.dataset.enrApprove}/approve`, { method: 'POST', body: discountCents ? { discountCents } : {} });
          loadEnrollmentRequests(); loadGroups();
        } catch (err) { alert(err.message); }
      }));
      box.querySelectorAll('[data-enr-reject]').forEach(b => b.addEventListener('click', async () => {
        const notes = prompt('Motivo del rechazo (se enviará por correo):');
        if (notes === null) return;
        try { await api(`/admin/enrollments/${b.dataset.enrReject}/reject`, { method: 'POST', body: notes.trim() ? { notes: notes.trim() } : {} }); loadEnrollmentRequests(); loadGroups(); }
        catch (err) { alert(err.message); }
      }));
    } catch (err) { box.innerHTML = `<p class="text-danger">${esc(err.message)}</p>`; }
  }

  /* ----- Admin: vínculos apoderado–alumno ----- */
  function guardianLinksBlock() {
    return {
      html: `<section class="panel-card"><div class="panel-card-head">
          <h2><i class="fa-solid fa-people-roof" aria-hidden="true"></i> Vínculos apoderado–alumno</h2>
          <select id="links-filter" class="input-sm" aria-label="Filtrar vínculos">
            <option value="PENDING_ADMIN">Por aprobar</option>
            <option value="PENDING_GUARDIAN">Esperando al apoderado</option>
            <option value="APPROVED">Aprobados</option>
          </select></div>
        <div id="links-box"><p class="muted">Cargando…</p></div></section>`,
      init() {
        $('#links-filter').addEventListener('change', loadLinks);
        loadLinks();
      }
    };
  }

  async function loadLinks() {
    const box = $('#links-box');
    if (!box) return;
    const status = $('#links-filter').value;
    try {
      const list = await api(`/admin/guardian-links?status=${status}`);
      if (!list.length) { box.innerHTML = '<p class="muted">No hay vínculos en este estado.</p>'; return; }
      box.innerHTML = `<div class="table-wrap"><table class="table">
        <thead><tr><th>Alumno</th><th>Apoderado</th><th>Consentimiento</th><th></th></tr></thead>
        <tbody>${list.map(l => {
          const [sl, st] = STATUS_LABEL[l.student.status] || [l.student.status, 'info'];
          const guardianOk = l.guardian.status === 'ACTIVE' && l.guardian.isGuardian;
          return `<tr>
            <td><strong>${esc(l.student.fullName)}</strong> ${l.student.minor ? '<span class="badge">Menor</span>' : ''}<br>
              <span class="muted">${esc(l.student.email || 'Usuario: ' + (l.student.username || ''))}${l.student.birthDate ? ' · Nac. ' + fmtDay(l.student.birthDate) : ''}</span><br>
              <span class="status-pill st-${st}">Cuenta: ${sl}</span></td>
            <td><strong>${esc(l.guardian.fullName)}</strong>${l.relationship ? ` <span class="muted">(${esc(l.relationship)})</span>` : ''}<br>
              <span class="muted">${esc(l.guardian.email || '')}${l.guardian.phone ? ' · ' + esc(l.guardian.phone) : ''}${l.guardian.document ? ' · ' + esc(l.guardian.document) : ''}</span>
              ${guardianOk ? '' : '<br><span class="status-pill st-warning">Cuenta de apoderado sin aprobar</span>'}</td>
            <td class="muted">${l.consentAt ? fmtDate(l.consentAt) : '—'}</td>
            <td class="actions">${l.status === 'PENDING_ADMIN' ? `<button class="btn btn-primary btn-xs" data-link-ok="${l.student.id}|${l.guardian.id}" ${guardianOk ? '' : 'disabled title="Aprueba primero la cuenta del apoderado"'}>Aprobar</button>` : ''}
              <button class="btn btn-ghost btn-xs" data-link-no="${l.student.id}|${l.guardian.id}">${l.status === 'APPROVED' ? 'Anular' : 'Rechazar'}</button></td>
          </tr>`;
        }).join('')}</tbody></table></div>
        <p class="muted small">Al aprobar un vínculo, si la cuenta del menor sigue pendiente, también queda aprobada como alumno.</p>`;
      box.querySelectorAll('[data-link-ok]').forEach(b => b.addEventListener('click', async () => {
        const [s, g] = b.dataset.linkOk.split('|');
        try { await api(`/admin/guardian-links/${s}/${g}/approve`, { method: 'POST' }); loadLinks(); loadRequests(); }
        catch (err) { alert(err.message); }
      }));
      box.querySelectorAll('[data-link-no]').forEach(b => b.addEventListener('click', async () => {
        const reason = prompt('Motivo (se enviará al apoderado):');
        if (reason === null) return;
        const [s, g] = b.dataset.linkNo.split('|');
        try { await api(`/admin/guardian-links/${s}/${g}/revoke`, { method: 'POST', body: reason.trim() ? { reason: reason.trim() } : {} }); loadLinks(); }
        catch (err) { alert(err.message); }
      }));
    } catch (err) { box.innerHTML = `<p class="text-danger">${esc(err.message)}</p>`; }
  }

  /* ----- Admin: prematrículas ----- */
  function preEnrollmentsBlock() {
    return {
      html: `
        <section class="panel-card">
          <div class="panel-card-head">
            <h2><i class="fa-solid fa-user-clock" aria-hidden="true"></i> Prematrículas</h2>
            <button class="btn btn-primary btn-sm" id="new-pre-btn"><i class="fa-solid fa-plus"></i> Nueva prematrícula</button>
          </div>
          <p class="muted" style="margin-bottom:1rem">Registra a un alumno antes de que tenga cuenta. Le llegará un correo; al crear su cuenta con ese correo, la confirma y tú verificas la vinculación.</p>
          <form id="pre-form" class="form-grid group-form" hidden novalidate>
            <div class="field full"><label for="pre-group">Grupo</label><select id="pre-group" name="groupId" required></select></div>
            <div class="field"><label for="pre-name">Nombres y apellidos</label><input id="pre-name" name="fullName" minlength="3" maxlength="120" required></div>
            <div class="field"><label for="pre-email">Correo del alumno</label><input id="pre-email" name="email" type="email" required></div>
            <div class="field"><label for="pre-phone">Celular <span class="muted">(opcional)</span></label><input id="pre-phone" name="phone" type="tel" pattern="[0-9 +]{9,15}"></div>
            <div class="field"><label for="pre-birth">Fecha de nacimiento <span class="muted">(opcional)</span></label><input id="pre-birth" name="birthDate" type="date"></div>
            <div class="field"><label for="pre-disc">Descuento en soles <span class="muted">(opcional)</span></label><input id="pre-disc" name="discount" inputmode="decimal" placeholder="0"></div>
            <div class="field"><label for="pre-notes">Notas <span class="muted">(opcional)</span></label><input id="pre-notes" name="notes" maxlength="500"></div>
            <div class="full"><button class="btn btn-primary" type="submit">Registrar</button> <button class="btn btn-ghost" type="button" id="cancel-pre">Cancelar</button></div>
            <div class="alert full" id="pre-msg" hidden></div>
          </form>
          <div id="pre-box"><p class="muted">Cargando…</p></div>
        </section>`,
      init() {
        const f = $('#pre-form');
        $('#new-pre-btn').addEventListener('click', async () => {
          f.hidden = !f.hidden;
          if (!f.hidden) {
            const groups = (await api('/admin/groups').catch(() => [])).filter(g => !['CANCELLED', 'FINISHED'].includes(g.status));
            f.groupId.innerHTML = groups.length
              ? groups.map(g => `<option value="${g.id}">${esc(g.course.name)} · ${esc(g.code)} · inicia ${fmtDay(g.startDate)}</option>`).join('')
              : '<option value="">Primero crea un grupo</option>';
          }
        });
        $('#cancel-pre').addEventListener('click', () => { f.hidden = true; });
        f.addEventListener('submit', async e => {
          e.preventDefault();
          if (!f.reportValidity()) return;
          const discountCents = toCents(f.discount.value.trim());
          if (f.discount.value.trim() && discountCents === undefined) return showMsg($('#pre-msg'), 'danger', 'Descuento inválido.');
          const body = { groupId: f.groupId.value, fullName: f.fullName.value.trim(), email: f.email.value.trim() };
          if (f.phone.value.trim()) body.phone = f.phone.value.trim();
          if (f.birthDate.value) body.birthDate = f.birthDate.value;
          if (discountCents) body.discountCents = discountCents;
          if (f.notes.value.trim()) body.notes = f.notes.value.trim();
          setBusy(f, true);
          try {
            await api('/admin/pre-enrollments', { method: 'POST', body });
            f.reset(); f.hidden = true;
            loadPreEnrollments(); loadGroups();
          } catch (err) { showMsg($('#pre-msg'), 'danger', esc(err.message)); }
          finally { setBusy(f, false); }
        });
        loadPreEnrollments();
      }
    };
  }

  async function loadPreEnrollments() {
    const box = $('#pre-box');
    if (!box) return;
    try {
      const list = await api('/admin/pre-enrollments');
      if (!list.length) { box.innerHTML = '<p class="muted">No hay prematrículas en curso.</p>'; return; }
      box.innerHTML = `<div class="table-wrap"><table class="table">
        <thead><tr><th>Persona</th><th>Curso / grupo</th><th>Estado</th><th></th></tr></thead>
        <tbody>${list.map(p => `<tr>
          <td><strong>${esc(p.fullName)}</strong><br><span class="muted">${esc(p.email)}${p.phone ? ' · ' + esc(p.phone) : ''}</span>
            ${p.discountCents ? `<br><span class="muted small">Descuento ${soles(p.discountCents)}</span>` : ''}${p.notes ? `<br><span class="muted small">${esc(p.notes)}</span>` : ''}</td>
          <td>${esc(p.course)}<br><span class="muted">${esc(p.group.code)} · inicia ${fmtDay(p.group.startDate)}</span></td>
          <td>${pill(PRE_STATUS[p.status])}
            ${p.claimedBy ? `<br><span class="small">Por: ${esc(p.claimedBy.fullName)} (${esc(p.claimedBy.email || '')})</span>` : ''}
            ${p.existingAccount ? `<br><span class="small muted">Ya existe la cuenta: ${esc(p.existingAccount.fullName)}</span>` : ''}</td>
          <td class="actions">
            ${p.status === 'CLAIMED' ? `<button class="btn btn-primary btn-xs" data-pre-ok="${p.id}">Confirmar</button> <button class="btn btn-ghost btn-xs" data-pre-no="${p.id}">No es</button>` : ''}
            ${p.status === 'PENDING' && p.existingAccount ? `<button class="btn btn-primary btn-xs" data-pre-link="${p.id}" data-user="${p.existingAccount.id}" data-name="${esc(p.existingAccount.fullName)}">Vincular</button>` : ''}
            ${p.status === 'PENDING' ? `<button class="btn btn-ghost btn-xs" data-pre-search="${p.id}">Vincular a otra cuenta…</button>` : ''}
            <button class="btn btn-ghost btn-xs" data-pre-cancel="${p.id}">Anular</button></td>
        </tr>`).join('')}</tbody></table></div>
        <p class="muted small">"Vincular" crea la matrícula aprobada. Si la cuenta seguía pendiente, queda aprobada como alumno.</p>`;

      const run = async fn => { try { await fn(); loadPreEnrollments(); loadGroups(); loadRequests(); } catch (err) { alert(err.message); } };
      box.querySelectorAll('[data-pre-ok]').forEach(b => b.addEventListener('click', () => run(() => api(`/admin/pre-enrollments/${b.dataset.preOk}/approve-claim`, { method: 'POST' }))));
      box.querySelectorAll('[data-pre-no]').forEach(b => b.addEventListener('click', () => {
        const notes = prompt('Motivo (se enviará a quien la reclamó):');
        if (notes !== null) run(() => api(`/admin/pre-enrollments/${b.dataset.preNo}/reject-claim`, { method: 'POST', body: notes.trim() ? { notes: notes.trim() } : {} }));
      }));
      box.querySelectorAll('[data-pre-link]').forEach(b => b.addEventListener('click', () => {
        if (confirm(`¿Vincular a la cuenta de ${b.dataset.name} y crear la matrícula?`)) run(() => api(`/admin/pre-enrollments/${b.dataset.preLink}/link`, { method: 'POST', body: { userId: b.dataset.user } }));
      }));
      box.querySelectorAll('[data-pre-search]').forEach(b => b.addEventListener('click', async () => {
        const q = prompt('Escribe el correo, usuario o nombre de la cuenta a vincular:');
        if (!q || !q.trim()) return;
        const users = (await api(`/admin/users?q=${encodeURIComponent(q.trim())}`).catch(() => []))
          .filter(u => ['ACTIVE', 'PENDING_APPROVAL'].includes(u.status));
        if (!users.length) return alert('No hay cuentas activas o pendientes que coincidan.');
        if (users.length > 1) return alert(`Hay ${users.length} cuentas que coinciden. Escribe el correo completo.`);
        const u = users[0];
        if (confirm(`¿Vincular a ${u.fullName} (${u.email || u.username})?`)) run(() => api(`/admin/pre-enrollments/${b.dataset.preSearch}/link`, { method: 'POST', body: { userId: u.id } }));
      }));
      box.querySelectorAll('[data-pre-cancel]').forEach(b => b.addEventListener('click', () => {
        if (confirm('¿Anular esta prematrícula?')) run(() => api(`/admin/pre-enrollments/${b.dataset.preCancel}/cancel`, { method: 'POST' }));
      }));
    } catch (err) { box.innerHTML = `<p class="text-danger">${esc(err.message)}</p>`; }
  }

  /* ----- Admin: cursos y temario ----- */
  function coursesBlock() {
    return {
      html: `<section class="panel-card">
          <h2><i class="fa-solid fa-book" aria-hidden="true"></i> Cursos y temario</h2>
          <div id="courses-box"><p class="muted">Cargando…</p></div>
          <div id="course-edit"></div></section>`,
      init: loadCourses
    };
  }

  async function loadCourses() {
    const box = $('#courses-box');
    if (!box) return;
    try {
      const list = await api('/admin/courses');
      box.innerHTML = `<div class="table-wrap"><table class="table">
        <thead><tr><th>Curso</th><th>Línea</th><th>Precio</th><th>Estado</th><th></th></tr></thead>
        <tbody>${list.map(c => `<tr>
          <td><strong>${esc(c.name)}</strong></td>
          <td class="muted">${c.line === 'KIDS_TEENS' ? `Kids &amp; Teens · nivel ${c.level}` : 'Programa'}</td>
          <td>${soles(c.priceCents)}</td>
          <td>${pill(COURSE_STATUS[c.status] || [c.status, 'info'])}</td>
          <td class="actions"><button class="btn btn-ghost btn-xs" data-edit-course="${c.id}">Editar</button></td>
        </tr>`).join('')}</tbody></table></div>`;
      box.querySelectorAll('[data-edit-course]').forEach(b => b.addEventListener('click', () => editCourse(b.dataset.editCourse)));
    } catch (err) { box.innerHTML = `<p class="text-danger">${esc(err.message)}</p>`; }
  }

  async function editCourse(id) {
    const holder = $('#course-edit');
    holder.innerHTML = '<p class="muted">Cargando…</p>';
    try {
      const c = await api(`/admin/courses/${id}`);
      holder.innerHTML = `
        <form id="course-form" class="form-grid group-detail" novalidate>
          <div class="panel-card-head full"><h3>Editar: ${esc(c.name)}</h3><button class="btn btn-ghost btn-xs" type="button" id="close-course">Cerrar</button></div>
          <div class="field"><label for="cf-name">Nombre</label><input id="cf-name" name="name" value="${esc(c.name)}" minlength="2" maxlength="80" required></div>
          <div class="field"><label for="cf-price">Precio (S/)</label><input id="cf-price" name="price" inputmode="decimal" value="${(c.priceCents / 100).toFixed(2).replace(/\.00$/, '')}" required></div>
          <div class="field"><label for="cf-status">Estado</label><select id="cf-status" name="status">${Object.entries(COURSE_STATUS).map(([v, [l]]) => `<option value="${v}" ${v === c.status ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="field"><label>Duración</label><input value="${c.totalHours} horas" disabled></div>
          <div class="field full"><label for="cf-summary">Resumen</label><textarea id="cf-summary" name="summary" minlength="10" maxlength="400" required>${esc(c.summary)}</textarea></div>
          <div class="field full"><label for="cf-obj">Objetivo</label><textarea id="cf-obj" name="objective" maxlength="1000">${esc(c.objective || '')}</textarea></div>
          <div class="field full"><label for="cf-aud">Dirigido a</label><textarea id="cf-aud" name="audience" maxlength="1000">${esc(c.audience || '')}</textarea></div>
          <div class="field full"><label for="cf-req">Requisitos <span class="muted">(uno por línea)</span></label><textarea id="cf-req" name="requirements">${esc(c.requirements.join('\n'))}</textarea></div>
          <div class="field full"><label for="cf-mod">Temario: módulos <span class="muted">(uno por línea, en orden)</span></label><textarea id="cf-mod" name="modules" rows="8">${esc(c.modules.map(m => m.title).join('\n'))}</textarea></div>
          <p class="full muted small">El nuevo precio aplica solo a matrículas nuevas. Por ahora, la página pública del portal muestra su propio texto (se conectará a estos datos más adelante); el temario editado aquí se ve en el campus.</p>
          <div class="full"><button class="btn btn-primary" type="submit">Guardar curso</button></div>
          <div class="alert full" id="course-msg" hidden></div>
        </form>`;
      const f = $('#course-form');
      $('#close-course').addEventListener('click', () => { holder.innerHTML = ''; });
      f.addEventListener('submit', async e => {
        e.preventDefault();
        if (!f.reportValidity()) return;
        const priceCents = toCents(f.price.value.trim());
        if (priceCents === undefined) return showMsg($('#course-msg'), 'danger', 'Precio inválido.');
        const lines = v => v.split('\n').map(s => s.trim()).filter(Boolean);
        setBusy(f, true);
        try {
          await api(`/admin/courses/${id}`, {
            method: 'PATCH',
            body: {
              name: f.name.value.trim(), priceCents, status: f.status.value, summary: f.summary.value.trim(),
              objective: f.objective.value, audience: f.audience.value,
              requirements: lines(f.requirements.value), modules: lines(f.modules.value)
            }
          });
          showMsg($('#course-msg'), 'success', 'Curso guardado.');
          loadCourses();
        } catch (err) { showMsg($('#course-msg'), 'danger', esc(err.message)); }
        finally { setBusy(f, false); }
      });
      holder.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) { holder.innerHTML = `<p class="text-danger">${esc(err.message)}</p>`; }
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

  /* ----- Usuario pendiente: solicitar perfil ----- */
  async function renderPending(body) {
    let requests = [];
    try { requests = await api('/account-requests/mine'); } catch { /* ignore */ }
    const pending = requests.find(r => r.status === 'PENDING');
    const lastRejected = requests.find(r => r.status === 'REJECTED');

    if (pending) {
      body.innerHTML = `<div id="claim-holder"></div><section class="panel-card"><h2><i class="fa-solid fa-hourglass-half"></i> Solicitud en revisión</h2>
        <p class="muted">Pediste acceso como <strong>${ROLE_LABEL[pending.requestedRole]}</strong> el ${fmtDate(pending.createdAt)}.
        Te avisaremos por correo cuando sea aprobada.</p></section>
        ${pending.requestedRole === 'STUDENT' ? '<section class="panel-card" id="my-guardians"></section>' : ''}`;
      renderClaims($('#claim-holder'));
      if (pending.requestedRole === 'STUDENT') await renderMyGuardians($('#my-guardians'));
      return;
    }

    body.innerHTML = `
      <div id="claim-holder"></div>
      <section class="panel-card">
        <h2><i class="fa-solid fa-id-card" aria-hidden="true"></i> Completa tu solicitud</h2>
        ${lastRejected ? `<div class="alert alert-warning"><i class="fa-solid fa-triangle-exclamation"></i><p>Tu solicitud anterior fue rechazada.${lastRejected.reviewNotes ? ' Motivo: ' + esc(lastRejected.reviewNotes) : ''}</p></div>` : ''}
        <p class="muted" style="margin-bottom:1.25rem">Indica cómo usarás el campus. Un administrador revisará tu solicitud y te asignará el rol que corresponda.</p>
        <form id="request-form" class="form-grid" novalidate>
          <div class="field"><label for="rq-role">Me registro como</label>
            <select id="rq-role" name="role" required>
              <option value="STUDENT">Alumno</option>
              <option value="GUARDIAN">Apoderado (padre, madre o tutor)</option>
              <option value="TEACHER">Docente</option>
            </select></div>
          <div class="field"><label for="rq-phone">Celular</label><input id="rq-phone" name="phone" type="tel" pattern="[0-9 +]{9,15}" required></div>
          <div class="field" data-for="STUDENT"><label for="rq-birth">Fecha de nacimiento</label><input id="rq-birth" name="birthDate" type="date" required></div>
          <div class="field full" id="rq-guardian" hidden><label for="rq-gmail">Correo de tu apoderado <span class="muted">(eres menor de edad)</span></label>
            <input id="rq-gmail" name="guardianEmail" type="email" placeholder="Tu apoderado debe tener cuenta de Apoderado en el campus">
            <span class="muted small">Si aún no tiene cuenta, puedes agregarlo después desde tu panel.</span></div>
          <div class="field" data-for="GUARDIAN" hidden><label for="rq-doctype">Tipo de documento</label>
            <select id="rq-doctype" name="documentType"><option value="DNI">DNI</option><option value="CE">Carné de extranjería</option><option value="PASAPORTE">Pasaporte</option></select></div>
          <div class="field" data-for="GUARDIAN" hidden><label for="rq-docnum">Número de documento</label><input id="rq-docnum" name="documentNumber" maxlength="20"></div>
          <div class="full"><button class="btn btn-primary" type="submit">Enviar solicitud</button></div>
          <div class="alert full" id="rq-msg" hidden></div>
        </form>
      </section>`;

    renderClaims($('#claim-holder'));
    const f = $('#request-form');
    const sync = () => {
      const role = f.role.value;
      f.querySelectorAll('[data-for]').forEach(el => {
        const on = el.dataset.for === role;
        el.hidden = !on;
        el.querySelectorAll('input,select').forEach(i => { i.required = on && i.name !== 'documentType'; });
      });
      $('#rq-guardian').hidden = !(role === 'STUDENT' && isMinorDate(f.birthDate.value));
    };
    f.role.addEventListener('change', sync);
    f.birthDate.addEventListener('change', sync);
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
        const gmail = role === 'STUDENT' && !$('#rq-guardian').hidden && f.guardianEmail.value.trim();
        let warn = null;
        if (gmail) {
          try { await api('/me/guardians', { method: 'POST', body: { email: gmail } }); }
          catch (err) { warn = err.message; }
        }
        await renderPending(body);
        if (warn) {
          const holder = $('#my-guardians');
          if (holder) holder.insertAdjacentHTML('afterbegin', `<div class="alert alert-warning"><i class="fa-solid fa-triangle-exclamation"></i><p>Tu solicitud se envió, pero no pudimos agregar a tu apoderado: ${esc(warn)}</p></div>`);
        }
      } catch (err) {
        showMsg($('#rq-msg'), 'danger', esc(err.message));
        setBusy(f, false);
      }
    });
  }

  /* ----- Administrador ----- */
  function adminRequestsBlock() {
    return {
      html: `
        <section class="panel-card">
          <div class="panel-card-head">
            <h2><i class="fa-solid fa-user-check" aria-hidden="true"></i> Solicitudes de cuenta</h2>
            <button class="btn btn-ghost btn-sm" data-reload="requests"><i class="fa-solid fa-rotate"></i> Actualizar</button>
          </div>
          <div id="requests-box"><p class="muted">Cargando…</p></div>
        </section>`,
      init() {
        loadRequests();
        $('[data-reload="requests"]').addEventListener('click', loadRequests);
      }
    };
  }

  function usersBlock() {
    return {
      html: `
        <section class="panel-card">
          <div class="panel-card-head">
            <h2><i class="fa-solid fa-users" aria-hidden="true"></i> Usuarios</h2>
            <input type="search" id="users-q" class="input-sm" placeholder="Buscar por nombre o correo" aria-label="Buscar usuarios">
          </div>
          <div id="users-box"><p class="muted">Cargando…</p></div>
        </section>`,
      init() {
        loadUsers();
        let t;
        $('#users-q').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => loadUsers(e.target.value), 300); });
      }
    };
  }

  async function loadRequests() {
    const box = $('#requests-box');
    if (!box) return;
    try {
      const list = await api('/admin/account-requests?status=PENDING');
      if (!list.length) { box.innerHTML = '<p class="muted">No hay solicitudes pendientes.</p>'; return; }
      box.innerHTML = `<div class="table-wrap"><table class="table">
        <thead><tr><th>Nombre</th><th>Correo</th><th>Rol a asignar</th><th>Datos</th><th>Fecha</th><th></th></tr></thead>
        <tbody>${list.map(r => {
          const u = r.user;
          const birth = u.studentProfile && u.studentProfile.birthDate;
          const extra = r.requestedRole === 'STUDENT' && birth
            ? `Nac.: ${fmtDate(birth)}${isMinorDate(birth.slice(0, 10)) ? ' <span class="badge">Menor</span> <span class="muted">(se aprueba con el vínculo del apoderado)</span>' : ''}`
            : r.requestedRole === 'GUARDIAN' && u.guardianProfile && u.guardianProfile.documentNumber
              ? `${esc(u.guardianProfile.documentType)} ${esc(u.guardianProfile.documentNumber)}` : '';
          return `<tr>
            <td>${esc(u.fullName)}</td><td>${esc(u.email || u.username)}</td>
            <td><select class="input-sm role-select" data-role-for="${r.id}" aria-label="Rol a asignar">
              ${Object.entries(ROLE_LABEL).map(([v, l]) => `<option value="${v}" ${v === r.requestedRole ? 'selected' : ''}>${l}${v === r.requestedRole ? ' (pedido)' : ''}</option>`).join('')}
            </select></td>
            <td class="muted">${esc(u.phone || '')}${extra ? '<br>' + extra : ''}</td>
            <td class="muted">${fmtDate(r.createdAt)}</td>
            <td class="actions">
              <button class="btn btn-primary btn-xs" data-approve="${r.id}">Aprobar</button>
              <button class="btn btn-ghost btn-xs" data-reject="${r.id}">Rechazar</button>
            </td></tr>`;
        }).join('')}</tbody></table></div>`;

      box.querySelectorAll('[data-approve]').forEach(b => b.addEventListener('click', () => {
        const role = box.querySelector(`[data-role-for="${b.dataset.approve}"]`).value;
        if (role === 'ADMIN' && !confirm('¿Aprobar esta cuenta como ADMINISTRADOR? Tendrá acceso total al campus.')) return;
        review(b.dataset.approve, 'approve', undefined, role);
      }));
      box.querySelectorAll('[data-reject]').forEach(b => b.addEventListener('click', () => {
        const notes = prompt('Motivo del rechazo (se enviará al usuario):');
        if (notes !== null) review(b.dataset.reject, 'reject', notes.trim());
      }));
    } catch (err) {
      box.innerHTML = `<p class="text-danger">${esc(err.message)}</p>`;
    }
  }

  async function review(id, action, notes, role) {
    try {
      const body = {};
      if (notes) body.notes = notes;
      if (role) body.role = role;
      await api(`/admin/account-requests/${id}/${action}`, { method: 'POST', body });
      loadRequests();
      loadUsers($('#users-q').value);
      loadLinks();
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
          const has = new Set(u.roles.map(r => r.role));
          const addable = Object.keys(ROLE_LABEL).filter(r => !has.has(r));
          return `<tr><td>${esc(u.fullName)}</td><td>${esc(u.email || u.username)}</td>
            <td><span class="role-chips">${u.roles.map(r => `<span class="badge">${ROLE_LABEL[r.role]}${u.roles.length > 1 ? ` <button class="link-btn" data-rm-role="${u.id}|${r.role}" aria-label="Quitar rol ${ROLE_LABEL[r.role]}">✕</button>` : ''}</span>`).join(' ') || '<span class="muted">—</span>'}
              ${u.status === 'ACTIVE' && addable.length ? `<select class="input-sm role-add" data-add-role="${u.id}" aria-label="Agregar rol"><option value="">+ Rol</option>${addable.map(r => `<option value="${r}">${ROLE_LABEL[r]}</option>`).join('')}</select>` : ''}</span></td>
            <td><span class="status-pill st-${type}">${label}</span></td><td class="actions">${action}</td></tr>`;
        }).join('')}</tbody></table></div>
        <p class="muted small">Con <strong>+ Rol</strong> das un rol (incluido Administrador); con ✕ lo quitas. Siempre queda al menos un rol y al menos un administrador activo.</p>`;

      const changeRole = async (userId, role, add) => {
        const label = ROLE_LABEL[role];
        if (role === 'ADMIN' && add && !confirm('¿Dar el rol de ADMINISTRADOR? Tendrá acceso total al campus.')) return false;
        const reason = prompt(`${add ? 'Motivo para dar' : 'Motivo para quitar'} el rol de ${label}:`);
        if (!reason || reason.trim().length < 3) return false;
        try {
          await api(`/admin/users/${userId}/roles${add ? '' : '/remove'}`, { method: 'POST', body: { role, reason: reason.trim() } });
          return true;
        } catch (err) { alert(err.message); return false; }
      };
      box.querySelectorAll('[data-add-role]').forEach(s => s.addEventListener('change', async () => {
        if (s.value) await changeRole(s.dataset.addRole, s.value, true);
        loadUsers($('#users-q').value);
      }));
      box.querySelectorAll('[data-rm-role]').forEach(b => b.addEventListener('click', async () => {
        const [userId, role] = b.dataset.rmRole.split('|');
        if (await changeRole(userId, role, false)) loadUsers($('#users-q').value);
      }));

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
