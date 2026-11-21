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

    document.querySelectorAll('[data-soon]').forEach(b => b.addEventListener('click', () =>
      showMsg(msg, 'info', 'El ingreso con Google y Microsoft estará disponible cuando se configure el dominio. Por ahora usa tu correo.')));

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
    if (me.status === 'PENDING_APPROVAL') return renderPending(body);
    if (me.status !== 'ACTIVE') {
      body.innerHTML = `<div class="alert alert-danger"><i class="fa-solid fa-lock"></i><p>Tu cuenta está ${statusLabel.toLowerCase()}. Escríbenos por WhatsApp si necesitas ayuda.</p></div>`;
      return;
    }

    const blocks = [];
    if (me.roles.includes('ADMIN')) blocks.push(adminBlock());
    if (me.roles.includes('TEACHER')) blocks.push(placeholderBlock('fa-chalkboard-user', 'Mis grupos', 'Aún no tienes grupos asignados. Aquí verás tus clases, asistencia, grabaciones y tareas.'));
    if (me.roles.includes('STUDENT')) blocks.push(placeholderBlock('fa-book-open', 'Mis cursos', `Aún no tienes cursos matriculados. <a href="../programas.html">Ver catálogo</a>.`));
    if (me.roles.includes('GUARDIAN')) blocks.push(placeholderBlock('fa-people-roof', 'Mis hijos', 'Aquí verás los cursos, asistencia y avances de tus hijos vinculados.'));
    body.innerHTML = blocks.map(b => b.html).join('');
    blocks.forEach(b => b.init && b.init());
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
