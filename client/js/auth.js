// ============================================
// Auth — Authentication module
// ============================================

import { getCollection, setSession, getSession, clearSession } from './store.js';

export function login(username, password) {
    const users = getCollection('users');
    const user = users.find(u => u.username === username && u.password === password && u.active);
    if (!user) return null;
    const roles = getCollection('roles');
    const role = roles.find(r => r.id === user.roleId);
    const session = { ...user, roleName: role?.name || '', permissions: role?.permissions || [] };
    delete session.password;
    setSession(session);
    return session;
}

export function logout() {
    clearSession();
}

export function getCurrentUser() {
    return getSession();
}

export function hasPermission(module) {
    const user = getSession();
    if (!user) return false;
    return user.permissions.includes(module);
}

export function renderLoginScreen(onLogin) {
    const app = document.getElementById('app');
    app.innerHTML = `
    <div class="login-screen">
      <div class="login-card slide-up">
        <div class="login-logo">
          <h1>🍽️ ComePOS</h1>
          <p>Sistema POS — Comedor Empresarial</p>
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
          <button type="submit" class="btn btn-primary">Iniciar Sesión</button>
        </form>
        <div class="login-demo">
          <p>Usuarios de demostración:</p>
          <table>
            <tr><td><strong>admin</strong></td><td>admin123</td><td>Administrador</td></tr>
            <tr><td><strong>cajero</strong></td><td>cajero123</td><td>Cajero</td></tr>
            <tr><td><strong>almacen</strong></td><td>almacen123</td><td>Almacén</td></tr>
          </table>
        </div>
      </div>
    </div>`;

    document.getElementById('loginForm').addEventListener('submit', e => {
        e.preventDefault();
        const username = document.getElementById('loginUser').value.trim();
        const password = document.getElementById('loginPass').value;
        const user = login(username, password);
        if (user) {
            onLogin(user);
        } else {
            const err = document.getElementById('loginError');
            err.textContent = 'Usuario o contraseña incorrectos';
            err.style.display = 'block';
        }
    });
}
