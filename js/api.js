/* =========================================================
   EMC Academy — Cliente de la API
   La sesión viaja en cookies httpOnly (el JS nunca ve los tokens).
========================================================= */
// En local, la API usa el mismo host que la página (localhost o 127.0.0.1) para que
// la cookie de sesión se comparta. En producción se define window.EMC_API_BASE
// (p. ej. https://api.{dominio}). Sin API configurada, el campus muestra "próximamente".
const IS_LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
const IS_PROD_DOMAIN = /(^|\.)emcacademy\.pe$/.test(location.hostname);
const IS_RAILWAY = location.hostname.endsWith('.up.railway.app');
const IS_GITHUB_PAGES = location.hostname === 'anderson2132.github.io';

// TEMPORAL hasta tener emcacademy.pe: el campus vive en el mismo origen que la API (Railway),
// para que la cookie de sesión sea de primera parte en todos los navegadores.
// Si alguien abre el campus desde GitHub Pages, se lo envía a la misma página en Railway.
const RAILWAY_ORIGIN = 'https://api-production-b6e1d251.up.railway.app';
if (IS_GITHUB_PAGES && location.pathname.includes('/campus/')) {
  location.replace(RAILWAY_ORIGIN + location.pathname.replace(/^\/emc-academy/, '') + location.search + location.hash);
}

const API_BASE = window.EMC_API_BASE ||
  (IS_LOCAL ? `http://${location.hostname}:3000`
    : IS_PROD_DOMAIN ? 'https://api.emcacademy.pe'
    : IS_RAILWAY ? location.origin
    : null);

const NO_REFRESH = new Set(['/auth/login', '/auth/refresh', '/auth/logout', '/auth/register']);

class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function api(path, { method = 'GET', body } = {}, retry = true) {
  if (!API_BASE) {
    throw new ApiError('El Campus Virtual estará disponible próximamente. Mientras tanto, escríbenos por WhatsApp.', 0, 'NO_API');
  }
  let res;
  try {
    res = await fetch(API_BASE + path, {
      method,
      credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined
    });
  } catch {
    throw new ApiError('No se pudo conectar con el servidor. ¿Está encendida la API (http://localhost:3000)?', 0, 'NETWORK');
  }

  // Sesión vencida: intenta renovarla una vez y repite la petición.
  if (res.status === 401 && retry && !NO_REFRESH.has(path)) {
    const r = await fetch(API_BASE + '/auth/refresh', { method: 'POST', credentials: 'include' }).catch(() => null);
    if (r && r.ok) return api(path, { method, body }, false);
  }

  let data = null;
  try { data = await res.json(); } catch { /* sin cuerpo */ }

  if (!res.ok) {
    const raw = data && data.message;
    const msg = Array.isArray(raw) ? raw.join('. ') : (raw || 'Ocurrió un error inesperado.');
    throw new ApiError(msg, res.status, data && data.code);
  }
  return data;
}
