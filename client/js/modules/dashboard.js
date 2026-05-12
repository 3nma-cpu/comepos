// ============================================
// Dashboard Module
// ============================================

import { api } from '../api.js';
import { formatCurrency, formatDateTime } from '../utils.js';

let charts = [];

function destroyCharts() {
    charts.forEach(c => c.destroy());
    charts = [];
}

export async function renderDashboard() {
    destroyCharts();
    const container = document.getElementById('module-content');

    // Loading state
    container.innerHTML = '<div class="fade-in"><div class="empty-state"><p>Cargando dashboard...</p></div></div>';

    try {
        const today = new Date().toISOString().split('T')[0];
        
        // 7 days ago
        const date7 = new Date();
        date7.setDate(date7.getDate() - 6);
        const from7d = date7.toISOString().split('T')[0];

        // Fetch data
        const [todayReport, weekReport, catReport, topProducts, recentSales] = await Promise.all([
            api.get(`/reports/sales-period?from=${today}&to=${today}`),
            api.get(`/reports/sales-period?from=${from7d}&to=${today}`),
            api.get('/reports/sales-category'),
            api.get('/reports/top-products'),
            api.get('/sales?limit=8')
        ]);

        const todayClients = new Set(todayReport.sales.map(s => s.clientName)).size;

        container.innerHTML = `
        <div class="fade-in">
          <div class="kpi-grid">
            <div class="kpi-card">
              <div class="kpi-icon blue"><i data-lucide="shopping-bag"></i></div>
              <div class="kpi-content">
                <div class="kpi-label">Ventas Hoy</div>
                <div class="kpi-value">${todayReport.totalSales}</div>
              </div>
            </div>
            <div class="kpi-card">
              <div class="kpi-icon green"><i data-lucide="trending-up"></i></div>
              <div class="kpi-content">
                <div class="kpi-label">Ingresos Hoy</div>
                <div class="kpi-value">${formatCurrency(todayReport.totalRevenue)}</div>
              </div>
            </div>
            <div class="kpi-card">
              <div class="kpi-icon yellow"><i data-lucide="users"></i></div>
              <div class="kpi-content">
                <div class="kpi-label">Clientes Atendidos</div>
                <div class="kpi-value">${todayClients}</div>
              </div>
            </div>
            <div class="kpi-card">
              <div class="kpi-icon purple"><i data-lucide="receipt"></i></div>
              <div class="kpi-content">
                <div class="kpi-label">Ticket Promedio</div>
                <div class="kpi-value">${formatCurrency(todayReport.avgTicket)}</div>
              </div>
            </div>
          </div>

          <div class="charts-grid">
            <div class="card">
              <div class="card-header"><h3 class="card-title">Ventas — Últimos 7 Días</h3></div>
              <div class="chart-container"><canvas id="chartSales7d"></canvas></div>
            </div>
            <div class="card">
              <div class="card-header"><h3 class="card-title">Por Categoría</h3></div>
              <div class="chart-container"><canvas id="chartCategory"></canvas></div>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:1rem">
            <div class="card">
              <div class="card-header"><h3 class="card-title">Ventas Recientes</h3></div>
              <div class="table-container" style="border:none">
                <table>
                  <thead><tr><th>Cliente</th><th>Total</th><th>Pago</th><th>Fecha</th></tr></thead>
                  <tbody id="recentSalesBody"></tbody>
                </table>
              </div>
            </div>
            <div class="card">
              <div class="card-header"><h3 class="card-title">Productos Top</h3></div>
              <div id="topProductsContainer"></div>
            </div>
          </div>
        </div>`;

        if (window.lucide) lucide.createIcons();
        renderCharts(weekReport.daily, catReport.categories);
        renderRecentSales(recentSales);
        renderTopProducts(topProducts.products);

    } catch (err) {
        container.innerHTML = `<div class="empty-state"><p>Error al cargar dashboard: ${err.message}</p></div>`;
    }
}

function renderCharts(daily, categories) {
    // Fill missing days for the last 7 days
    const labels = [];
    const dataMap = {};
    daily.forEach(d => dataMap[d.date] = d.total);
    
    const data = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const key = d.toISOString().split('T')[0];
        const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
        labels.push(dayNames[d.getDay()]);
        data.push(dataMap[key] || 0);
    }

    const ctx1 = document.getElementById('chartSales7d');
    if (ctx1) {
        const c1 = new Chart(ctx1, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Ventas (₲)',
                    data,
                    backgroundColor: 'rgba(99,102,241,0.6)',
                    borderColor: '#6366f1',
                    borderWidth: 1,
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { display: false }, ticks: { color: '#94a3b8' } },
                    y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', callback: v => '₲' + (v / 1000).toFixed(0) + 'k' } }
                }
            }
        });
        charts.push(c1);
    }

    // Category pie
    const catLabels = categories.map(c => c.category);
    const catData = categories.map(c => c.amount);
    const catColors = ['#6366f1', '#8b5cf6', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6', '#ec4899', '#14b8a6'];

    const ctx2 = document.getElementById('chartCategory');
    if (ctx2) {
        const c2 = new Chart(ctx2, {
            type: 'doughnut',
            data: {
                labels: catLabels,
                datasets: [{ data: catData, backgroundColor: catColors.slice(0, catLabels.length), borderWidth: 0 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', padding: 12, font: { size: 11 } } } }
            }
        });
        charts.push(c2);
    }
}

function renderRecentSales(recentSales) {
    const tbody = document.getElementById('recentSalesBody');
    if (!tbody) return;
    const payLabels = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', nomina: 'Nómina' };
    tbody.innerHTML = recentSales.map(s => `
    <tr>
      <td>${s.clientName}</td>
      <td><strong>${formatCurrency(s.total)}</strong></td>
      <td><span class="badge badge-${s.paymentMethod === 'efectivo' ? 'success' : s.paymentMethod === 'tarjeta' ? 'info' : 'purple'}">${payLabels[s.paymentMethod] || s.paymentMethod}</span></td>
      <td style="color:var(--text-secondary);font-size:.8rem">${formatDateTime(s.date)}</td>
    </tr>`).join('');
}

function renderTopProducts(products) {
    const container = document.getElementById('topProductsContainer');
    if (!container) return;
    
    container.innerHTML = products.slice(0, 6).map((p, i) => `
      <div style="display:flex;align-items:center;gap:.75rem;padding:.5rem 0;${i < 5 ? 'border-bottom:1px solid var(--border)' : ''}">
        <div style="flex:1">
          <div style="font-weight:600;font-size:.85rem">${p.name}</div>
          <div style="font-size:.75rem;color:var(--text-secondary)">${p.qty} vendidos</div>
        </div>
        <div style="font-weight:700;color:var(--primary-light);font-size:.85rem">${formatCurrency(p.revenue / (p.qty || 1))}</div>
      </div>`).join('');
}