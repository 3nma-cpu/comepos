// ============================================
// Dashboard Module
// ============================================

import { api } from '../api.js';
import { getCurrentUser } from '../auth.js';
import { formatCurrency, formatDateTime, todayStr, escapeHTML } from '../utils.js';

let charts = [];
let lastChartData = null;

function destroyCharts() {
    charts.forEach(c => { try { c.destroy(); } catch (e) {} });
    charts = [];
}

window.addEventListener('themeChanged', () => {
    if (lastChartData && document.getElementById('chartSales7d')) {
        destroyCharts();
        renderCharts(lastChartData.daily, lastChartData.selectedDate);
    }
});

export async function renderDashboard(selectedDate) {
    destroyCharts();
    const container = document.getElementById('module-content');

    if (!selectedDate) {
        selectedDate = todayStr();
    }

    // Loading state
    container.innerHTML = '<div class="fade-in"><div class="empty-state"><p>Cargando dashboard...</p></div></div>';

    try {
        // Calculate 10 days ago based on selectedDate
        const parts = selectedDate.split('-');
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);

        const date10 = new Date(year, month, day);
        date10.setDate(date10.getDate() - 9);
        const from10d = `${date10.getFullYear()}-${String(date10.getMonth() + 1).padStart(2, '0')}-${String(date10.getDate()).padStart(2, '0')}`;

        // Fetch data
        const [todayReport, weekReport, topProducts, recentSales] = await Promise.all([
            api.get(`/reports/sales-period?from=${selectedDate}&to=${selectedDate}`),
            api.get(`/reports/sales-period?from=${from10d}&to=${selectedDate}`),
            api.get(`/reports/top-products?from=${selectedDate}&to=${selectedDate}`),
            api.get(`/sales?to=${selectedDate}&limit=8`)
        ]);

        const todayClients = new Set(todayReport.sales.map(s => s.clientName)).size;

        const user = getCurrentUser() || {};
        const hour = new Date().getHours();
        const greeting = hour >= 5 && hour < 12 ? 'Buenos días' : hour >= 12 && hour < 20 ? 'Buenas tardes' : 'Buenas noches';
        const greetName = user.name ? `, ${escapeHTML(user.name)}` : '';

        container.innerHTML = `
        <div class="fade-in">
          <div class="dashboard-stats-header" style="margin-top:0;margin-bottom:1.5rem">
            <div>
              <h1 class="dashboard-greeting-title">${greeting}${greetName}!</h1>
              <p class="dashboard-greeting-sub">Veamos cómo va el comedor hoy.</p>
            </div>
            <div style="display:flex;align-items:center;gap:.5rem">
              <label for="dbAnalysisDate" style="font-size:.85rem;color:var(--text-secondary);font-weight:500">Fecha de Análisis:</label>
              <input type="date" class="form-control" id="dbAnalysisDate" value="${selectedDate}" max="${todayStr()}" style="width:160px" />
            </div>
          </div>

          <div class="kpi-grid">
            <div class="kpi-card">
              <span class="kpi-title">Ventas del Día</span>
              <div class="kpi-val">${todayReport.totalSales}</div>
            </div>
            <div class="kpi-card">
              <span class="kpi-title">Ingresos del Día</span>
              <div class="kpi-val">${formatCurrency(todayReport.totalRevenue)}</div>
            </div>
            <div class="kpi-card">
              <span class="kpi-title">Clientes Atendidos</span>
              <div class="kpi-val">${todayClients}</div>
            </div>
            <div class="kpi-card">
              <span class="kpi-title">Ticket Promedio</span>
              <div class="kpi-val">${formatCurrency(todayReport.avgTicket)}</div>
            </div>
          </div>

          <div class="dashboard-stats-header">
            <h3 class="stats-section-title">Estadísticas</h3>
          </div>

          <div class="card chart-card" style="margin-bottom:1.5rem">
            <div class="card-header"><h3 class="card-title">Ventas — Últimos 10 Días</h3></div>
            <div class="chart-container" style="position:relative;height:240px"><canvas id="chartSales7d"></canvas></div>
          </div>

          <div class="dashboard-bottom-grid">
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
        lastChartData = { daily: weekReport.daily, selectedDate };
        renderCharts(weekReport.daily, selectedDate);
        renderRecentSales(recentSales);
        renderTopProducts(topProducts.products);

        // Bind events
        const dateInput = document.getElementById('dbAnalysisDate');
        if (dateInput) {
            dateInput.addEventListener('change', (e) => {
                renderDashboard(e.target.value);
            });
        }

    } catch (err) {
        container.innerHTML = `<div class="empty-state"><p>Error al cargar dashboard: ${err.message}</p></div>`;
    }
}

function renderCharts(daily, selectedDate) {
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const tickColor = isDark ? '#71717a' : '#94a3b8';
    const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
    const barColor = isDark ? 'rgba(255,255,255,0.85)' : '#09090b';
    const font = { family: 'Plus Jakarta Sans', size: 11 };

    // Fill missing days for the last 7 days ending on selectedDate
    const labels = [];
    const fullDates = [];
    const dataMap = {};
    daily.forEach(d => dataMap[d.date] = d.total);

    if (!selectedDate) {
        selectedDate = todayStr();
    }
    const parts = selectedDate.split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);

    const data = [];
    for (let i = 9; i >= 0; i--) {
        const d = new Date(year, month, day);
        d.setDate(d.getDate() - i);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
        labels.push(dayNames[d.getDay()]);
        fullDates.push(`${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`);
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
                    backgroundColor: barColor,
                    borderRadius: 6,
                    barPercentage: 0.7,
                    categoryPercentage: 0.8
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { 
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            title: function(context) {
                                const index = context[0].dataIndex;
                                return `${labels[index]} (${fullDates[index]})`;
                            }
                        }
                    }
                },
                scales: {
                    x: { grid: { display: false }, ticks: { color: tickColor, font } },
                    y: { grid: { color: gridColor }, ticks: { color: tickColor, font, callback: v => '₲' + (v / 1000).toFixed(0) + 'k' } }
                }
            }
        });
        charts.push(c1);
    }
}

function renderRecentSales(recentSales) {
    const tbody = document.getElementById('recentSalesBody');
    if (!tbody) return;
    const payLabels = { efectivo: 'Efectivo', transferencia: 'Transferencia', nomina: 'Nómina' };
    tbody.innerHTML = recentSales.map(s => `
    <tr>
      <td>${s.clientName}</td>
      <td><strong>${formatCurrency(s.total)}</strong></td>
      <td><span class="badge badge-${s.paymentMethod === 'efectivo' ? 'success' : s.paymentMethod === 'transferencia' ? 'info' : 'purple'}">${payLabels[s.paymentMethod] || s.paymentMethod}</span></td>
      <td style="color:var(--text-secondary);font-size:.8rem">${formatDateTime(s.date)}</td>
    </tr>`).join('');
}

function renderTopProducts(products) {
    const container = document.getElementById('topProductsContainer');
    if (!container) return;

    if (!products || products.length === 0) {
        container.innerHTML = '<div style="padding:1.5rem;text-align:center;color:var(--text-secondary);font-size:.85rem">No hay productos vendidos en esta fecha</div>';
        return;
    }

    container.innerHTML = products.slice(0, 6).map((p, i) => `
      <div style="display:flex;align-items:center;gap:.75rem;padding:.5rem 0;${i < 5 ? 'border-bottom:1px solid var(--border)' : ''}">
        <div style="flex:1">
          <div style="font-weight:600;font-size:.85rem">${escapeHTML(p.name)}</div>
          <div style="font-size:.75rem;color:var(--text-secondary)">${p.qty} vendidos</div>
        </div>
        <div style="font-weight:700;color:var(--text);font-size:.85rem">${formatCurrency(p.revenue / (p.qty || 1))}</div>
      </div>`).join('');
}