// ============================================
// App — Main entry point
// ============================================

import { initStore, isSeeded } from './store.js';
import { seedData } from './seed.js';
import { getCurrentUser, renderLoginScreen, logout, hasPermission } from './auth.js';
import { registerRoute, initRouter, navigate } from './router.js';
import { renderDashboard } from './modules/dashboard.js';
import { renderUsers } from './modules/users.js';
import { renderRoles } from './modules/roles.js';
import { renderClients } from './modules/clients.js';
import { renderPurchases } from './modules/purchases.js';
import { renderSales } from './modules/sales.js';
import { renderReports } from './modules/reports.js';

// Initialize store and seed data
initStore();
if (!isSeeded()) seedData();

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
            { route: 'clients', label: 'Clientes', icon: 'contact', perm: 'clients' }
        ]
    },
    {
        section: 'Operaciones', items: [
            { route: 'purchases', label: 'Compras', icon: 'package', perm: 'purchases' },
            { route: 'sales', label: 'Punto de Venta', icon: 'shopping-cart', perm: 'sales' }
        ]
    },
    {
        section: 'Análisis', items: [
            { route: 'reports', label: 'Reportes', icon: 'bar-chart-3', perm: 'reports' }
        ]
    }
];

const ROUTE_TITLES = {
    dashboard: 'Dashboard',
    users: 'Gestión de Usuarios',
    roles: 'Gestión de Roles',
    clients: 'Clientes / Funcionarios',
    purchases: 'Compras e Inventario',
    sales: 'Punto de Venta',
    reports: 'Reportes'
};

const ROUTE_HANDLERS = {
    dashboard: renderDashboard,
    users: renderUsers,
    roles: renderRoles,
    clients: renderClients,
    purchases: renderPurchases,
    sales: renderSales,
    reports: renderReports
};

// Boot
function boot() {
    const user = getCurrentUser();
    if (!user) {
        renderLoginScreen(onLogin);
    } else {
        renderApp(user);
    }
}

function onLogin(user) {
    renderApp(user);
}

function renderApp(user) {
    const app = document.getElementById('app');
    const visibleNav = NAV_ITEMS.map(section => ({
        ...section,
        items: section.items.filter(item => hasPermission(item.perm))
    })).filter(s => s.items.length > 0);

    app.innerHTML = `
    <div class="app-layout">
      <aside class="sidebar">
        <div class="sidebar-header">
          <span class="logo-text">🍽️ ComePOS</span>
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
          <h2 id="pageTitle">Dashboard</h2>
          <div class="content-header-actions">
            <span style="color:var(--text-muted);font-size:.82rem" id="currentDateTime"></span>
          </div>
        </header>
        <div class="content-body" id="module-content"></div>
      </main>
    </div>`;

    if (window.lucide) lucide.createIcons();

    // Update datetime
    function updateClock() {
        const el = document.getElementById('currentDateTime');
        if (el) el.textContent = new Date().toLocaleString('es-PY', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
    updateClock();
    setInterval(updateClock, 30000);

    // Logout
    document.getElementById('btnLogout').addEventListener('click', () => {
        logout();
        boot();
    });

    // Nav clicks
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => navigate(item.dataset.route));
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

    initRouter('dashboard');
}

boot();
