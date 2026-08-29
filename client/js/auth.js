// ============================================
// Auth — Authentication module
// ============================================

import { api } from './api.js';

export async function login(username, password) {
  try {
    return await api.login(username, password);
  } catch (err) {
    console.error('Login error:', err);
    return null;
  }
}

export function logout() {
  api.logout();
}

export function getCurrentUser() {
  return api.getCurrentUser();
}

export async function refreshCurrentUser() {
  try {
    const user = getCurrentUser();
    if (!user || !user.token) return null;
    const res = await api.get('/auth/me');
    if (res && res.user && res.token) {
      const sessionData = { ...res.user, token: res.token };
      localStorage.setItem('comepos_session', JSON.stringify(sessionData));
      return sessionData;
    }
  } catch (err) {
    console.warn('Could not refresh session:', err);
  }
  return getCurrentUser();
}

export function hasPermission(module) {
  const user = getCurrentUser();
  if (!user) return false;
  return user.permissions && user.permissions.includes(module);
}

export function renderLoginScreen(onLogin) {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="login-screen">
      <div class="login-card slide-up">
        <div class="login-logo">
          <h1>Comedor TTA S.A.</h1>
          <p>Sistema de Gestión - Comedor Empresarial</p>
        </div>
        <div class="login-error" id="loginError"></div>
        <form id="loginForm">
          <div class="form-group">
            <label for="loginUser">Usuario</label>
            <input type="text" id="loginUser" class="form-control" placeholder="Ingrese su usuario" autocomplete="username" required />
          </div>
          <div class="form-group">
            <label for="loginPass">Contraseña</label>
            <input type="password" id="loginPass" class="form-control" placeholder="Ingrese su contraseña" autocomplete="current-password" required />
          </div>
          <button type="submit" class="btn btn-primary" id="btnLogin">Iniciar Sesión</button>
        </form>
      </div>
    </div>`;

  document.getElementById('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const username = document.getElementById('loginUser').value.trim();
    const password = document.getElementById('loginPass').value;
    const btn = document.getElementById('btnLogin');
    const err = document.getElementById('loginError');

    btn.disabled = true;
    btn.textContent = 'Verificando...';
    err.style.display = 'none';

    const user = await login(username, password);

    if (user) {
      onLogin(user);
    } else {
      err.textContent = 'Usuario o contraseña incorrectos';
      err.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Iniciar Sesión';
    }
  });
}
