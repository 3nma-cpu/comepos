// ============================================
// ComePOS — Portal de Funcionarios
// Consulta de Consumo en Tiempo Real
// Tema Minimalista Blanco y Negro (ComePOS)
// ============================================

const PORTAL_API = '/api/portal';
const SESSION_KEY = 'comepos_portal_session';

// ---- API Client ----
function getPortalToken() {
  const s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
  return s?.token || null;
}

async function portalFetch(endpoint, options = {}) {
  const token = getPortalToken();
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${PORTAL_API}${endpoint}`, { ...options, headers });

  if (res.status === 401) {
    localStorage.removeItem(SESSION_KEY);
    portalBoot();
    return null;
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error en la solicitud');
  return data;
}

// ---- Session ----
function getPortalSession() {
  return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
}

function savePortalSession(token, client) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ token, ...client }));
}

function portalLogout() {
  localStorage.removeItem(SESSION_KEY);
  portalBoot();
}

// ---- Theme ----
function initPortalTheme() {
  const theme = localStorage.getItem('comepos_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', theme);
}

function togglePortalTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('comepos_theme', next);
  updateThemeIcon();
}

function updateThemeIcon() {
  const theme = document.documentElement.getAttribute('data-theme') || 'dark';
  const btn = document.getElementById('portalThemeToggle');
  if (btn) {
    btn.innerHTML = theme === 'dark'
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
  }
}

// ---- Formatters ----
function fmtGs(amount) {
  return new Intl.NumberFormat('es-PY').format(amount) + ' Gs';
}

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('es-PY', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' });
}

function toLocalYMD(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function todayISO() {
  return toLocalYMD(new Date());
}

/**
 * Semana laboral de jueves a miércoles:
 * Desde el jueves más reciente (hace 0 a 6 días) hasta el próximo miércoles.
 */
function getWeekRange() {
  const now = new Date();
  const day = now.getDay(); // 0: Dom, 1: Lun, 2: Mar, 3: Mié, 4: Jue, 5: Vie, 6: Sáb
  const diffToThursday = (day - 4 + 7) % 7;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToThursday);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  return {
    from: toLocalYMD(start),
    to: toLocalYMD(end)
  };
}

/**
 * Quincena laboral:
 * - Del 01 al 15 si estamos entre el día 1 y 15.
 * - Del 16 al último día del mes si estamos en día 16 o posterior.
 */
function getFortnightRange() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const monthStr = String(month + 1).padStart(2, '0');
  const day = now.getDate();

  if (day <= 15) {
    return {
      from: `${year}-${monthStr}-01`,
      to: `${year}-${monthStr}-15`
    };
  } else {
    const lastDay = new Date(year, month + 1, 0).getDate();
    return {
      from: `${year}-${monthStr}-16`,
      to: `${year}-${monthStr}-${String(lastDay).padStart(2, '0')}`
    };
  }
}

function monthStartISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function fmtDateShort(ymd) {
  if (!ymd) return '';
  const parts = ymd.split('-');
  if (parts.length !== 3) return ymd;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

// ---- Componente PIN ----
function createPinInput(id = 'pinFields') {
  return `
    <div class="pin-input-group" id="${id}">
      <input type="password" class="pin-digit" maxlength="1" inputmode="numeric" pattern="[0-9]*" autocomplete="off" data-pin="0" />
      <input type="password" class="pin-digit" maxlength="1" inputmode="numeric" pattern="[0-9]*" autocomplete="off" data-pin="1" />
      <input type="password" class="pin-digit" maxlength="1" inputmode="numeric" pattern="[0-9]*" autocomplete="off" data-pin="2" />
      <input type="password" class="pin-digit" maxlength="1" inputmode="numeric" pattern="[0-9]*" autocomplete="off" data-pin="3" />
    </div>`;
}

function initPinInputListeners(containerId = 'pinFields') {
  const container = document.getElementById(containerId);
  if (!container) return;
  const digits = container.querySelectorAll('.pin-digit');

  digits.forEach((input, idx) => {
    input.addEventListener('input', (e) => {
      const val = e.target.value.replace(/\D/g, '');
      e.target.value = val ? val.slice(-1) : '';
      if (e.target.value && idx < digits.length - 1) digits[idx + 1].focus();
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !e.target.value && idx > 0) {
        digits[idx - 1].focus();
      }
    });

    input.addEventListener('paste', (e) => {
      e.preventDefault();
      const pasted = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 4);
      pasted.split('').forEach((ch, i) => {
        if (digits[i]) digits[i].value = ch;
      });
      if (digits[pasted.length - 1]) digits[pasted.length - 1].focus();
    });
  });

  if (digits[0]) setTimeout(() => digits[0].focus(), 150);
}

function getPinValue(containerId = 'pinFields') {
  const container = document.getElementById(containerId);
  if (!container) return '';
  const digits = container.querySelectorAll('.pin-digit');
  return Array.from(digits).map(d => d.value).join('');
}

// ====================================================
// Flow de Login y Autenticación
// ====================================================

let currentCedula = '';
let checkData = null;

// Pantalla de bienvenida: Registrarse o Iniciar Sesión
function renderWelcomeScreen(initialMsg = '') {
  const app = document.getElementById('portal-app');
  app.innerHTML = `
    <div class="portal-login-screen">
      <div class="portal-login-card">
        <div class="portal-login-header">
          <img src="/img/icon-512.png" alt="ComePOS" class="portal-login-icon" style="object-fit:cover;border-radius:12px;" />
          <h1>Mi Consumo</h1>
          <p>Comedor TTA S.A. — Portal de Funcionarios</p>
          <div class="portal-badge-system">Acceso Seguro</div>
        </div>

        ${initialMsg ? `<div class="portal-success" style="display:block">${initialMsg}</div>` : ''}

        <div class="portal-welcome-actions">
          <button class="p-btn p-btn-primary" id="btnGoLogin">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
            Iniciar Sesión
          </button>
          <button class="p-btn p-btn-outline-welcome" id="btnGoRegister">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
            Registrarse (primera vez)
          </button>
        </div>
      </div>
    </div>`;

  document.getElementById('btnGoLogin').addEventListener('click', () => renderLoginScreen());
  document.getElementById('btnGoRegister').addEventListener('click', () => renderRegisterScreen());
}

// Pantalla de Login: Cédula + PIN
function renderLoginScreen(infoMsg = '') {
  const app = document.getElementById('portal-app');
  app.innerHTML = `
    <div class="portal-login-screen">
      <div class="portal-login-card">
        <div class="portal-login-header">
          <div class="portal-login-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </div>
          <h1>Iniciar Sesión</h1>
          <p>Ingresa tu cédula y PIN de acceso</p>
        </div>

        <div class="portal-error" id="portalError"></div>
        ${infoMsg ? `<div class="portal-success" style="display:block">${infoMsg}</div>` : ''}

        <form id="loginForm">
          <div class="p-form-group">
            <label for="loginCedula">Número de Cédula de Identidad</label>
            <input type="text" id="loginCedula" class="p-form-control" placeholder="Ej: 4743230" value="${currentCedula}" autocomplete="username" required autofocus />
          </div>
          <div class="p-form-group" style="text-align:center">
            <label>PIN de 4 dígitos</label>
            ${createPinInput('loginPin')}
          </div>
          <button type="submit" class="p-btn p-btn-primary" id="btnLogin">Ingresar</button>
        </form>

        <div style="text-align:center;margin-top:1.25rem;display:flex;flex-direction:column;gap:0.5rem">
          <span class="portal-link" id="linkRecoverPin">¿Olvidaste tu PIN? Recuperar clave</span>
          <span class="portal-link" id="linkBackWelcome" style="color:var(--p-text-muted)">← Volver al inicio</span>
        </div>
      </div>
    </div>`;

  initPinInputListeners('loginPin');

  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const cedula = document.getElementById('loginCedula').value.trim();
    const pin = getPinValue('loginPin');
    const btn = document.getElementById('btnLogin');
    const errEl = document.getElementById('portalError');

    errEl.style.display = 'none';
    if (!cedula) { errEl.textContent = 'Ingresa tu número de cédula'; errEl.style.display = 'block'; return; }
    if (pin.length !== 4) { errEl.textContent = 'Ingresa los 4 dígitos de tu PIN'; errEl.style.display = 'block'; return; }

    btn.disabled = true;
    btn.textContent = 'Verificando...';

    try {
      currentCedula = cedula;
      const data = await portalFetch('/login', {
        method: 'POST',
        body: JSON.stringify({ cedula, pin })
      });

      savePortalSession(data.token, data.client);
      renderPortalApp();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Ingresar';
    }
  });

  document.getElementById('linkRecoverPin').addEventListener('click', () => {
    currentCedula = document.getElementById('loginCedula').value.trim();
    renderRecoverScreen();
  });
  document.getElementById('linkBackWelcome').addEventListener('click', () => renderWelcomeScreen());
}

// Pantalla de Registro: Cédula + Crear PIN (solo si la cédula existe en el sistema)
function renderRegisterScreen() {
  const app = document.getElementById('portal-app');
  app.innerHTML = `
    <div class="portal-login-screen">
      <div class="portal-login-card">
        <div class="portal-login-header">
          <div class="portal-login-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
          </div>
          <h1>Crear Cuenta</h1>
          <p>Primera vez en el portal</p>
        </div>

        <div class="portal-info-box">
          Ingresa tu número de cédula registrado en el sistema y crea un PIN de 4 dígitos para acceder al portal. Solo los funcionarios registrados pueden crear cuenta.
        </div>

        <div class="portal-error" id="portalError"></div>
        <div class="portal-success" id="portalSuccess"></div>

        <form id="registerForm">
          <div class="p-form-group">
            <label for="regCedula">Número de Cédula de Identidad</label>
            <input type="text" id="regCedula" class="p-form-control" placeholder="Ej: 4743230" value="${currentCedula}" autocomplete="username" required autofocus />
          </div>

          <div id="registerPinSection" style="display:none">
            <div class="portal-info-box" id="regWelcomeMsg" style="background:var(--p-accent-bg,rgba(59,130,246,0.1));border-color:var(--p-accent-border,rgba(59,130,246,0.2))"></div>
            <div class="p-form-group" style="text-align:center">
              <label>Crea tu PIN de 4 dígitos</label>
              ${createPinInput('regPin')}
            </div>
            <div class="p-form-group" style="text-align:center">
              <label>Confirma tu PIN</label>
              ${createPinInput('regConfirmPin')}
            </div>
          </div>

          <button type="submit" class="p-btn p-btn-primary" id="btnRegister">Verificar Cédula</button>
        </form>

        <div style="text-align:center;margin-top:1.25rem">
          <span class="portal-link" id="linkBackWelcome" style="color:var(--p-text-muted)">← Volver al inicio</span>
        </div>
      </div>
    </div>`;

  let cedulaVerified = false;

  document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const cedula = document.getElementById('regCedula').value.trim();
    const btn = document.getElementById('btnRegister');
    const errEl = document.getElementById('portalError');
    const successEl = document.getElementById('portalSuccess');

    errEl.style.display = 'none';
    successEl.style.display = 'none';

    if (!cedula) { errEl.textContent = 'Ingresa tu número de cédula'; errEl.style.display = 'block'; return; }

    // Paso 1: Verificar cédula
    if (!cedulaVerified) {
      btn.disabled = true;
      btn.textContent = 'Verificando...';

      try {
        currentCedula = cedula;
        checkData = await portalFetch('/check', {
          method: 'POST',
          body: JSON.stringify({ cedula })
        });

        if (checkData.hasPin) {
          errEl.textContent = 'Ya tienes una cuenta activa. Usa la opción de Iniciar Sesión.';
          errEl.style.display = 'block';
          btn.disabled = false;
          btn.textContent = 'Verificar Cédula';
          return;
        }

        // Mostrar la sección de PIN
        cedulaVerified = true;
        document.getElementById('regCedula').readOnly = true;
        document.getElementById('regCedula').style.opacity = '0.7';
        document.getElementById('regWelcomeMsg').innerHTML = `¡Hola <strong>${checkData.name}</strong>! Cédula verificada. Ahora crea tu PIN de acceso.`;
        document.getElementById('registerPinSection').style.display = 'block';
        btn.textContent = 'Crear Cuenta';
        btn.disabled = false;

        initPinInputListeners('regPin');
        initPinInputListeners('regConfirmPin');
      } catch (err) {
        errEl.textContent = err.message;
        errEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Verificar Cédula';
      }
      return;
    }

    // Paso 2: Crear PIN
    const pin = getPinValue('regPin');
    const confirmPin = getPinValue('regConfirmPin');

    if (pin.length !== 4) { errEl.textContent = 'El PIN debe ser exactamente de 4 dígitos'; errEl.style.display = 'block'; return; }
    if (pin !== confirmPin) { errEl.textContent = 'Los PINs ingresados no coinciden'; errEl.style.display = 'block'; return; }

    btn.disabled = true;
    btn.textContent = 'Creando cuenta...';

    try {
      const data = await portalFetch('/register', {
        method: 'POST',
        body: JSON.stringify({ cedula: currentCedula, pin })
      });

      savePortalSession(data.token, data.client);
      renderPortalApp();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Crear Cuenta';
    }
  });

  document.getElementById('linkBackWelcome').addEventListener('click', () => renderWelcomeScreen());
}

// Pantalla: Recuperar PIN olvidado (solo cédula + nuevo PIN)
function renderRecoverScreen() {
  const app = document.getElementById('portal-app');
  app.innerHTML = `
    <div class="portal-login-screen">
      <div class="portal-login-card">
        <div class="portal-login-header">
          <div class="portal-login-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><circle cx="12" cy="16" r="1"/></svg>
          </div>
          <h1>Recuperar PIN</h1>
          <p>Restablece tu clave de acceso</p>
        </div>

        <div class="portal-info-box">
          Ingresa tu número de cédula y define un nuevo PIN de 4 dígitos.
        </div>

        <div class="portal-error" id="portalError"></div>

        <form id="recoverForm">
          <div class="p-form-group">
            <label for="recoverCedula">Número de Cédula de Identidad</label>
            <input type="text" id="recoverCedula" class="p-form-control" placeholder="Ej: 4743230" value="${currentCedula}" autocomplete="username" required autofocus />
          </div>
          <div class="p-form-group" style="text-align:center">
            <label>Nuevo PIN (4 dígitos)</label>
            ${createPinInput('recPin')}
          </div>
          <div class="p-form-group" style="text-align:center">
            <label>Confirma el nuevo PIN</label>
            ${createPinInput('recConfirmPin')}
          </div>
          <button type="submit" class="p-btn p-btn-primary" id="btnRecover">Restablecer PIN y Acceder</button>
        </form>

        <div style="text-align:center;margin-top:1.25rem">
          <span class="portal-link" id="linkBackLogin" style="color:var(--p-text-muted)">← Volver a Iniciar Sesión</span>
        </div>
      </div>
    </div>`;

  initPinInputListeners('recPin');
  initPinInputListeners('recConfirmPin');

  document.getElementById('recoverForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const cedula = document.getElementById('recoverCedula').value.trim();
    const pin = getPinValue('recPin');
    const confirmPin = getPinValue('recConfirmPin');
    const btn = document.getElementById('btnRecover');
    const errEl = document.getElementById('portalError');

    errEl.style.display = 'none';
    if (!cedula) { errEl.textContent = 'Ingresa tu número de cédula'; errEl.style.display = 'block'; return; }
    if (pin.length !== 4) { errEl.textContent = 'El PIN debe ser exactamente de 4 dígitos'; errEl.style.display = 'block'; return; }
    if (pin !== confirmPin) { errEl.textContent = 'Los PINs ingresados no coinciden'; errEl.style.display = 'block'; return; }

    btn.disabled = true;
    btn.textContent = 'Restableciendo...';

    try {
      currentCedula = cedula;
      const data = await portalFetch('/recover', {
        method: 'POST',
        body: JSON.stringify({ cedula, pin })
      });

      savePortalSession(data.token, data.client);
      renderPortalApp();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Restablecer PIN y Acceder';
    }
  });

  document.getElementById('linkBackLogin').addEventListener('click', () => renderLoginScreen());
}

// Pantalla: Cambio voluntario de PIN desde el menú
function renderChangePinScreen() {
  const session = getPortalSession();
  const app = document.getElementById('portal-app');
  app.innerHTML = `
    <div class="portal-login-screen">
      <div class="portal-login-card">
        <div class="portal-login-header">
          <div class="portal-login-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </div>
          <h1>Cambiar mi PIN</h1>
          <p>${session?.name || 'Funcionario'}</p>
        </div>

        <div class="portal-error" id="portalError"></div>

        <form id="changePinForm">
          <div class="p-form-group" style="text-align:center">
            <label>Nuevo PIN (4 dígitos)</label>
            ${createPinInput('newPin')}
          </div>
          <div class="p-form-group" style="text-align:center">
            <label>Confirma nuevo PIN</label>
            ${createPinInput('confirmNewPin')}
          </div>
          <button type="submit" class="p-btn p-btn-primary" id="btnSaveNewPin">Guardar Nuevo PIN</button>
        </form>

        <div style="text-align:center;margin-top:1.25rem">
          <span class="portal-link" id="linkCancelChangePin" style="color:var(--p-text-muted)">← Cancelar y volver</span>
        </div>
      </div>
    </div>`;

  initPinInputListeners('newPin');
  initPinInputListeners('confirmNewPin');

  document.getElementById('changePinForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newPin = getPinValue('newPin');
    const confirmVal = getPinValue('confirmNewPin');
    const btn = document.getElementById('btnSaveNewPin');
    const errEl = document.getElementById('portalError');

    errEl.style.display = 'none';
    if (newPin.length !== 4) { errEl.textContent = 'El PIN debe ser de 4 dígitos'; errEl.style.display = 'block'; return; }
    if (newPin !== confirmVal) { errEl.textContent = 'Los PINs no coinciden'; errEl.style.display = 'block'; return; }

    btn.disabled = true;
    btn.textContent = 'Guardando...';

    try {
      await portalFetch('/change-pin', {
        method: 'POST',
        body: JSON.stringify({ newPin })
      });

      renderPortalApp();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Guardar Nuevo PIN';
    }
  });

  document.getElementById('linkCancelChangePin').addEventListener('click', () => renderPortalApp());
}

// ====================================================
// Pantalla Principal: Dashboard de Consumo
// ====================================================

let portalSalesCache = [];
let currentFilter = 'month';

async function renderPortalApp() {
  const session = getPortalSession();
  if (!session?.token) return renderWelcomeScreen();

  const app = document.getElementById('portal-app');
  app.innerHTML = `
    <header class="portal-header">
      <div class="portal-header-inner">
        <div class="portal-brand-wrap">
          <img src="/img/icon-512.png" alt="ComePOS" class="portal-brand-icon" />
          <div class="portal-welcome">
            <h1>${session.name || 'Funcionario'}</h1>
            <p>C.I. ${session.cedula || ''} ${session.department ? '• ' + session.department : ''}</p>
          </div>
        </div>
        <div class="portal-header-actions">
          <button class="portal-icon-btn" id="btnChangePinModal" title="Cambiar mi PIN">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </button>
          <button class="portal-icon-btn" id="portalThemeToggle" title="Cambiar tema"></button>
          <button class="portal-icon-btn" id="portalLogoutBtn" title="Cerrar sesión">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>
        </div>
      </div>
    </header>

    <main class="portal-container">
      <div class="portal-kpi-grid">
        <div class="portal-kpi">
          <div class="portal-kpi-label">Gasto del mes</div>
          <div class="portal-kpi-value" id="kpiMonthTotal">—</div>
        </div>
        <div class="portal-kpi">
          <div class="portal-kpi-label">Vales del mes</div>
          <div class="portal-kpi-value" id="kpiMonthCount">—</div>
        </div>
        <div class="portal-kpi">
          <div class="portal-kpi-label">Último vale</div>
          <div class="portal-kpi-value" id="kpiLastPurchase" style="font-size:0.9rem">—</div>
        </div>
      </div>

      <div class="portal-filters-wrap">
        <div class="portal-filters" id="portalFilters">
          <button class="p-btn-outline" data-filter="today">Hoy</button>
          <button class="p-btn-outline" data-filter="week">Esta semana</button>
          <button class="p-btn-outline" data-filter="fortnight">Esta quincena</button>
          <button class="p-btn-outline active" data-filter="month">Este mes</button>
          <button class="p-btn-outline" data-filter="all">Todo el historial</button>
          <button class="p-btn-outline" data-filter="custom">Personalizado</button>
        </div>
        <div class="portal-filters-date" id="customDateFilters" style="display:none">
          <input type="date" id="portalDateFrom" />
          <span style="color:var(--p-text-muted);font-size:0.8rem">hasta</span>
          <input type="date" id="portalDateTo" />
          <button class="p-btn p-btn-primary" style="width:auto;padding:0.4rem 0.85rem;font-size:0.8rem" id="btnApplyCustom">Filtrar</button>
        </div>
      </div>

      <div class="portal-period-total" id="portalPeriodTotal" style="display:none">
        <div>
          <span class="label">Total del período</span>
          <div id="periodDateRange" style="font-size:0.75rem;color:var(--p-text-muted);margin-top:2px"></div>
        </div>
        <span class="value" id="periodTotalValue">0 Gs</span>
      </div>

      <div class="portal-tickets" id="portalTickets">
        <div style="text-align:center;padding:2rem;color:var(--p-text-muted)">Cargando consumos...</div>
      </div>
    </main>`;

  updateThemeIcon();

  // Event Listeners
  document.getElementById('portalThemeToggle').addEventListener('click', togglePortalTheme);
  document.getElementById('portalLogoutBtn').addEventListener('click', portalLogout);
  document.getElementById('btnChangePinModal').addEventListener('click', () => renderChangePinScreen());

  // Filtros
  document.querySelectorAll('#portalFilters .p-btn-outline').forEach(btn => {
    btn.addEventListener('click', () => {
      currentFilter = btn.dataset.filter;
      document.querySelectorAll('#portalFilters .p-btn-outline').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const customDiv = document.getElementById('customDateFilters');
      if (currentFilter === 'custom') {
        customDiv.style.display = 'flex';
      } else {
        customDiv.style.display = 'none';
        loadSales(currentFilter);
      }
    });
  });

  document.getElementById('btnApplyCustom').addEventListener('click', () => {
    loadSales('custom');
  });

  // Carga inicial
  loadSummary();
  loadSales('month');
}

async function loadSummary() {
  try {
    const data = await portalFetch('/summary');
    if (!data) return;

    document.getElementById('kpiMonthTotal').textContent = fmtGs(data.monthlyTotal);
    document.getElementById('kpiMonthCount').textContent = data.monthlyCount;
    document.getElementById('kpiLastPurchase').textContent = data.lastPurchase
      ? fmtDate(data.lastPurchase)
      : 'Sin vales';
  } catch (err) {
    console.error('Error loading summary:', err);
  }
}

async function loadSales(filter) {
  const ticketsEl = document.getElementById('portalTickets');
  ticketsEl.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--p-text-muted)">Cargando vales...</div>';

  let from = '', to = '';
  const today = todayISO();

  switch (filter) {
    case 'today':
      from = today;
      to = today;
      break;
    case 'week': {
      const range = getWeekRange();
      from = range.from;
      to = range.to;
      break;
    }
    case 'fortnight': {
      const range = getFortnightRange();
      from = range.from;
      to = range.to;
      break;
    }
    case 'month':
      from = monthStartISO();
      to = today;
      break;
    case 'all':
      break;
    case 'custom':
      from = document.getElementById('portalDateFrom')?.value || '';
      to = document.getElementById('portalDateTo')?.value || '';
      break;
  }

  try {
    let url = '/sales';
    const params = [];
    if (from) params.push(`from=${from}`);
    if (to) params.push(`to=${to}`);
    if (params.length) url += '?' + params.join('&');

    const data = await portalFetch(url);
    if (!data) return;

    portalSalesCache = data.sales || [];

    let rangeLabel = '';
    if (from && to) {
      rangeLabel = from === to ? fmtDateShort(from) : `${fmtDateShort(from)} al ${fmtDateShort(to)}`;
    } else if (from) {
      rangeLabel = `Desde ${fmtDateShort(from)}`;
    } else if (to) {
      rangeLabel = `Hasta ${fmtDateShort(to)}`;
    }

    const periodTotalEl = document.getElementById('portalPeriodTotal');
    const periodTotalValue = document.getElementById('periodTotalValue');
    const periodDateRange = document.getElementById('periodDateRange');

    if (periodDateRange) {
      periodDateRange.textContent = rangeLabel;
    }

    if (portalSalesCache.length > 0) {
      periodTotalEl.style.display = 'flex';
      periodTotalValue.textContent = fmtGs(data.totalSpent);
    } else {
      periodTotalEl.style.display = 'none';
    }

    renderTickets(portalSalesCache, rangeLabel);
  } catch (err) {
    ticketsEl.innerHTML = `<div class="portal-empty"><p>Error al cargar: ${err.message}</p></div>`;
  }
}

function renderTickets(sales, rangeLabel = '') {
  const container = document.getElementById('portalTickets');

  if (!sales || sales.length === 0) {
    container.innerHTML = `
      <div class="portal-empty">
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
        <p style="font-size:0.9rem;font-weight:600;margin-bottom:0.25rem;color:var(--p-text)">Sin vales registrados</p>
        <p style="font-size:0.8rem">No se encontraron consumos en el período seleccionado${rangeLabel ? ` (${rangeLabel})` : ''}</p>
      </div>`;
    return;
  }

  // Traducción y formateo estricto: Vale de comedor en vez de Nómina
  const formatPaymentMethod = (m) => {
    const lower = (m || '').toLowerCase();
    if (lower.includes('nomina') || lower.includes('vale')) return 'Vale de comedor';
    if (lower.includes('transferencia')) return 'Transferencia';
    if (lower.includes('tarjeta')) return 'Tarjeta';
    return 'Efectivo';
  };

  container.innerHTML = sales.map(sale => `
    <div class="portal-ticket">
      <div class="portal-ticket-header">
        <div class="portal-ticket-date">
          <strong>${fmtDate(sale.date)}</strong>
          <span>${fmtTime(sale.date)}</span>
        </div>
        <div class="portal-ticket-total">${fmtGs(sale.total)}</div>
      </div>
      <div class="portal-ticket-items">
        ${sale.items.map(item => `
          <div class="portal-ticket-item">
            <div>
              <span class="item-name">${item.name}</span>
              <span class="item-qty"> × ${item.quantity}${item.unit !== 'UNI' ? ' ' + item.unit.toLowerCase() : ''}</span>
            </div>
            <span class="item-subtotal">${fmtGs(item.price * item.quantity)}</span>
          </div>
        `).join('')}
      </div>
      <div class="portal-ticket-footer">
        <span>Vendedor: ${sale.vendorName || 'Cajero'}</span>
        <span class="portal-badge-pay">${formatPaymentMethod(sale.paymentMethod)}</span>
      </div>
    </div>
  `).join('');
}

// ====================================================
// Boot
// ====================================================

function portalBoot() {
  initPortalTheme();
  const session = getPortalSession();
  if (session?.token) {
    renderPortalApp();
  } else {
    renderWelcomeScreen();
  }
}

portalBoot();
