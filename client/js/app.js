// ============================================
// App — Main entry point
// ============================================

import { getCurrentUser, refreshCurrentUser, renderLoginScreen, logout, hasPermission } from './auth.js';
import { registerRoute, initRouter, navigate } from './router.js';
import { renderDashboard } from './modules/dashboard.js';
import { renderUsers } from './modules/users.js';
import { renderRoles } from './modules/roles.js';
import { renderClients } from './modules/clients.js';
import { renderPurchases } from './modules/purchases.js';
import { renderProducts } from './modules/products.js';
import { renderSales } from './modules/sales.js';
import { renderReports } from './modules/reports.js';
import { renderCashRegister } from './modules/cashregister.js';
import { renderSupplierPayments } from './modules/supplier-payments.js';

// Navigation items
const NAV_ITEMS = [
    {
        section: 'Principal', items: [
            { route: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard', perm: 'dashboard' }
        ]
    },
    {
        section: 'Gestión', items: [
            { route: 'users', label: 'Usuarios', icon: 'users', perm: 'users' },
            { route: 'roles', label: 'Roles', icon: 'shield', perm: 'roles' },
            { route: 'clients', label: 'Clientes', icon: 'contact', perm: 'clients' },
            { route: 'products', label: 'Productos', icon: 'box', perm: 'products' }
        ]
    },
    {
        section: 'Operaciones', items: [
            { route: 'purchases', label: 'Compras', icon: 'package', perm: 'purchases' },
            { route: 'cashregister', label: 'Caja', icon: 'landmark', perm: 'cashregister' },
            { route: 'sales', label: 'Punto de Venta', icon: 'shopping-cart', perm: 'sales' }
        ]
    },
    {
        section: 'Análisis', items: [
            { route: 'reports', label: 'Reportes', icon: 'bar-chart-3', perm: 'reports' }
        ]
    },
    {
        section: 'Finanzas', items: [
            { route: 'pagos-proveedores', label: 'Pagos a Proveedores', icon: 'receipt', perm: 'supplier-payments' }
        ]
    }
];

const ROUTE_TITLES = {
    dashboard: 'Dashboard',
    users: 'Gestión de Usuarios',
    roles: 'Gestión de Roles',
    clients: 'Clientes / Funcionarios',
    products: 'Catálogo de Productos',
    purchases: 'Compras e Inventario',
    cashregister: 'Caja',
    sales: 'Punto de Venta',
    reports: 'Reportes',
    'pagos-proveedores': 'Pagos a Proveedores',
    'supplier-payments': 'Pagos a Proveedores'
};

const ROUTE_HANDLERS = {
    dashboard: renderDashboard,
    users: renderUsers,
    roles: renderRoles,
    clients: renderClients,
    products: renderProducts,
    purchases: renderPurchases,
    cashregister: renderCashRegister,
    sales: renderSales,
    reports: renderReports,
    'pagos-proveedores': renderSupplierPayments,
    'supplier-payments': renderSupplierPayments
};

// ============================================
// Inactivity Timeout (10 minutes)
// ============================================
const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const INACTIVITY_WARNING_MS = 60 * 1000;       // warn 1 minute before

let inactivityTimer = null;
let inactivityWarningTimer = null;
let inactivityWarningEl = null;

function clearInactivityTimers() {
    clearTimeout(inactivityTimer);
    clearTimeout(inactivityWarningTimer);
    if (inactivityWarningEl) {
        inactivityWarningEl.remove();
        inactivityWarningEl = null;
    }
}

function showInactivityWarning() {
    if (inactivityWarningEl) return;
    inactivityWarningEl = document.createElement('div');
    inactivityWarningEl.id = 'inactivity-warning';
    inactivityWarningEl.innerHTML = `
      <div style="
        position:fixed; bottom:1.5rem; right:1.5rem; z-index:9999;
        background:linear-gradient(135deg,rgba(245,158,11,.15),rgba(239,68,68,.1));
        border:1px solid rgba(245,158,11,.4);
        backdrop-filter:blur(16px);
        border-radius:12px; padding:1rem 1.25rem;
        display:flex; align-items:center; gap:.75rem;
        box-shadow:0 8px 32px rgba(0,0,0,.4);
        animation:slide-up .3s ease;
        max-width:340px;
      ">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <div style="flex:1">
          <div style="font-weight:600;font-size:.88rem;color:#f59e0b">Sesión por expirar</div>
          <div style="font-size:.78rem;color:#94a3b8;margin-top:.1rem">Su sesión se cerrará en 1 minuto por inactividad.</div>
        </div>
        <button id="btnKeepAlive" style="
          background:rgba(245,158,11,.2); border:1px solid rgba(245,158,11,.3);
          color:#f59e0b; border-radius:8px; padding:.35rem .7rem;
          font-size:.78rem; font-weight:600; cursor:pointer; white-space:nowrap;
        ">Mantener</button>
      </div>`;
    document.body.appendChild(inactivityWarningEl);
    document.getElementById('btnKeepAlive')?.addEventListener('click', () => {
        resetInactivityTimer();
    });
}

function forceSessionExpire(reason = 'inactividad') {
    clearInactivityTimers();
    logout();
    showSessionExpiredScreen(reason);
}

function showSessionExpiredScreen(reason) {
    const app = document.getElementById('app');
    app.innerHTML = `
      <div class="login-screen">
        <div class="login-card slide-up" style="text-align:center">
          <div style="width:64px;height:64px;border-radius:50%;background:rgba(239,68,68,.15);display:flex;align-items:center;justify-content:center;margin:0 auto 1.25rem">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </div>
          <h2 style="font-size:1.4rem;font-weight:700;margin-bottom:.5rem">Sesión cerrada</h2>
          <p style="color:var(--text-secondary);font-size:.9rem;margin-bottom:1.5rem">Su sesión fue cerrada por ${reason}. Por favor inicie sesión nuevamente.</p>
          <button class="btn btn-primary" id="btnGoLogin" style="width:100%">Iniciar Sesión</button>
        </div>
      </div>`;
    document.getElementById('btnGoLogin')?.addEventListener('click', () => boot());
}

function resetInactivityTimer() {
    clearInactivityTimers();
    // Only activate when user is logged in
    if (!getCurrentUser()) return;

    // Warning timer: fire 1 min before logout
    inactivityWarningTimer = setTimeout(() => {
        showInactivityWarning();
    }, INACTIVITY_TIMEOUT_MS - INACTIVITY_WARNING_MS);

    // Logout timer
    inactivityTimer = setTimeout(() => {
        forceSessionExpire('inactividad (10 minutos)');
    }, INACTIVITY_TIMEOUT_MS);
}

function startInactivityWatcher() {
    const events = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll', 'click'];
    events.forEach(evt => {
        document.addEventListener(evt, () => resetInactivityTimer(), { passive: true });
    });
    resetInactivityTimer();
}

function stopInactivityWatcher() {
    clearInactivityTimers();
}

// ============================================
// Logout Confirmation Modal
// ============================================
function confirmLogout() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:400px">
        <div class="modal-header">
          <h3 style="display:flex;align-items:center;gap:.5rem">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Cerrar Sesión
          </h3>
        </div>
        <div class="modal-body" style="text-align:center;padding:1.5rem 1rem">
          <p style="color:var(--text-secondary);font-size:.95rem">¿Está seguro de que desea cerrar la sesión?</p>
          <p style="color:var(--text-muted);font-size:.82rem;margin-top:.4rem">Deberá ingresar sus credenciales nuevamente.</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="btnCancelLogout">Cancelar</button>
          <button class="btn btn-danger" id="btnConfirmLogout">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Cerrar Sesión
          </button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('active'));

    document.getElementById('btnCancelLogout')?.addEventListener('click', () => {
        overlay.classList.remove('active');
        setTimeout(() => overlay.remove(), 300);
    });
    document.getElementById('btnConfirmLogout')?.addEventListener('click', () => {
        overlay.classList.remove('active');
        setTimeout(() => {
            overlay.remove();
            stopInactivityWatcher();
            logout();
            if (window.history && window.history.replaceState) {
                window.history.replaceState(null, '', '/');
            }
            boot();
        }, 200);
    });
    overlay.addEventListener('click', e => {
        if (e.target === overlay) {
            overlay.classList.remove('active');
            setTimeout(() => overlay.remove(), 300);
        }
    });
}

// ============================================
// Session expired via 401 from API
// ============================================
window.addEventListener('comepos:session-expired', () => {
    stopInactivityWatcher();
    showSessionExpiredScreen('sesión inválida o expirada');
});

// Calculate default route for user:
// 1. Dashboard (if has permission)
// 2. Punto de Venta / Sales (if has permission)
// 3. First available module
export function getDefaultRoute(user) {
    if (!user) return 'dashboard';
    if (hasPermission('dashboard')) return 'dashboard';
    if (hasPermission('sales')) return 'sales';
    
    for (const section of NAV_ITEMS) {
        for (const item of section.items) {
            if (hasPermission(item.perm)) {
                return item.route;
            }
        }
    }
    return 'dashboard';
}

// Boot
async function boot() {
    initTheme();
    stopInactivityWatcher();
    let user = getCurrentUser();
    if (!user) {
        renderLoginScreen(onLogin);
    } else {
        // Sync permissions from backend so role/permission updates reflect immediately
        try {
            const freshUser = await refreshCurrentUser();
            if (freshUser) user = freshUser;
        } catch (e) {
            console.warn('Could not sync user profile:', e);
        }
        const defaultRoute = getDefaultRoute(user);
        renderApp(user, defaultRoute);
    }
}

function initTheme() {
    const theme = localStorage.getItem('comepos_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('comepos_theme', next);

    const icon = document.getElementById('themeIcon');
    if (icon) {
        icon.setAttribute('data-lucide', next === 'dark' ? 'sun' : 'moon');
        if (window.lucide) lucide.createIcons();
    }
}

function onLogin(user) {
    const targetRoute = getDefaultRoute(user);
    renderApp(user, targetRoute);
    navigate(targetRoute, { replace: true, trigger: true });
}

function renderApp(user, defaultRoute = null) {
    const app = document.getElementById('app');
    const userDefaultRoute = defaultRoute || getDefaultRoute(user);

    const visibleNav = NAV_ITEMS.map(section => ({
        ...section,
        items: section.items.filter(item => hasPermission(item.perm))
    })).filter(s => s.items.length > 0);

    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';

    app.innerHTML = `
    <div class="app-layout">
      <div class="sidebar-overlay" id="sidebarOverlay"></div>
      <aside class="sidebar" id="mainSidebar">
        <div class="sidebar-header">
          <span class="logo-text">Comedor TTA S.A.</span>
        </div>
        <nav class="sidebar-nav">
          ${visibleNav.map(section => `
            <div class="nav-section">
              <div class="nav-section-title">${section.section}</div>
              ${section.items.map(item => `
                <div class="nav-item" data-route="${item.route}">
                  <i data-lucide="${item.icon}"></i>
                  <span>${item.label}</span>
                </div>`).join('')}
            </div>`).join('')}
        </nav>
        <div class="sidebar-footer">
          <div class="sidebar-user">
            <div class="sidebar-user-avatar">${user.name.split(' ').map(w => w[0]).join('').slice(0, 2)}</div>
            <div class="sidebar-user-info">
              <div class="name">${user.name}</div>
              <div class="role">${user.roleName}</div>
            </div>
            <button class="btn-logout" id="btnLogout" title="Cerrar sesión"><i data-lucide="log-out"></i></button>
          </div>
        </div>
      </aside>
      <main class="main-content">
        <header class="content-header">
          <div style="display:flex;align-items:center;gap:0.5rem">
            <button class="btn-menu-toggle" id="btnMenuToggle">
              <i data-lucide="menu"></i>
            </button>
            <h2 id="pageTitle">Dashboard</h2>
          </div>
          <div class="content-header-actions">
            <button class="btn btn-ghost btn-icon" id="btnThemeToggle" title="Cambiar tema">
              <i data-lucide="${currentTheme === 'dark' ? 'sun' : 'moon'}" id="themeIcon"></i>
            </button>
            <span style="color:var(--text-muted);font-size:.82rem" id="currentDateTime"></span>
          </div>
        </header>
        <div class="content-body" id="module-content"></div>
      </main>
    </div>`;

    // Sidebar Mobile Toggle
    const sidebar = document.getElementById('mainSidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const btnMenu = document.getElementById('btnMenuToggle');

    function toggleMobileSidebar() {
        sidebar.classList.toggle('active');
        overlay.classList.toggle('active');
    }

    btnMenu.addEventListener('click', toggleMobileSidebar);
    overlay.addEventListener('click', toggleMobileSidebar);

    // Theme toggle
    document.getElementById('btnThemeToggle').addEventListener('click', toggleTheme);

    // Update datetime
    function updateClock() {
        const el = document.getElementById('currentDateTime');
        if (el) el.textContent = new Date().toLocaleString('es-PY', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
    updateClock();
    setInterval(updateClock, 30000);

    // Logout — now with confirmation modal
    document.getElementById('btnLogout').addEventListener('click', () => {
        confirmLogout();
    });

    // Nav clicks
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            navigate(item.dataset.route);
            if (window.innerWidth <= 768) {
                toggleMobileSidebar();
            }
        });
    });

    // Register routes
    Object.entries(ROUTE_HANDLERS).forEach(([path, handler]) => {
        registerRoute(path, () => {
            document.getElementById('pageTitle').textContent = ROUTE_TITLES[path] || path;
            if (hasPermission(path)) {
                handler();
            } else {
                document.getElementById('module-content').innerHTML = `
          <div class="empty-state" style="padding:4rem"><i data-lucide="lock"></i><h3>Acceso Denegado</h3><p>No tiene permisos para acceder a este módulo.</p></div>`;
                if (window.lucide) lucide.createIcons();
            }
        });
    });

    initRouter(userDefaultRoute);

    // Start inactivity watcher after app is rendered
    startInactivityWatcher();
}

boot();
