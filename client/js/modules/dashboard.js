// ============================================
// Dashboard Module — Nuxo POS Style (Black & White)
// ============================================

import { api } from '../api.js';
import { getCurrentUser } from '../auth.js';
import { formatCurrency, formatDateTime, todayStr, escapeHTML } from '../utils.js';

let charts = [];
let currentPeriodDays = 30;
let cachedPeriodReport = null;

function destroyCharts() {
    charts.forEach(c => {
        try { c.destroy(); } catch (e) {}
    });
    charts = [];
}

export async function renderDashboard(selectedDate) {
    destroyCharts();
    const container = document.getElementById('module-content');

    if (!selectedDate) {
        selectedDate = todayStr();
    }

    // Loading skeleton
    container.innerHTML = `
      <div class="fade-in" style="padding: 2rem 0; text-align: center;">
        <div class="spinner" style="margin: 0 auto 1rem;"></div>
        <p style="color: var(--text-secondary); font-size: 0.95rem;">Cargando panel de control...</p>
      </div>`;

    try {
        const user = getCurrentUser() || { name: 'Enmanuel Benitez' };
        
        // Greeting based on time
        const hour = new Date().getHours();
        let greeting = 'Buenas noches';
        if (hour >= 5 && hour < 12) greeting = 'Buenos días';
        else if (hour >= 12 && hour < 20) greeting = 'Buenas tardes';

        // Calculate period date
        const parts = selectedDate.split('-');
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);

        const periodDate = new Date(year, month, day);
        periodDate.setDate(periodDate.getDate() - (currentPeriodDays - 1));
        const fromPeriod = `${periodDate.getFullYear()}-${String(periodDate.getMonth() + 1).padStart(2, '0')}-${String(periodDate.getDate()).padStart(2, '0')}`;

        // Fetch dashboard data in parallel
        const [todayReport, periodReport, topProducts, recentSales, products] = await Promise.all([
            api.get(`/reports/sales-period?from=${selectedDate}&to=${selectedDate}`),
            api.get(`/reports/sales-period?from=${fromPeriod}&to=${selectedDate}`),
            api.get(`/reports/top-products?from=${fromPeriod}&to=${selectedDate}`),
            api.get(`/sales?to=${selectedDate}&limit=8`),
            api.get('/products').catch(() => [])
        ]);

        cachedPeriodReport = periodReport;

        // Calculate Ganancia and Margen
        let totalCost = 0;
        (todayReport.sales || []).forEach(s => {
            (s.items || []).forEach(it => {
                if (it.cost) totalCost += it.cost * it.quantity;
            });
        });

        const revenue = todayReport.totalRevenue || 0;
        let gananciaHoy = 0;
        let margenPct = 0;

        if (revenue > 0) {
            gananciaHoy = totalCost > 0 ? (revenue - totalCost) : Math.round(revenue * 0.35);
            margenPct = Math.round((gananciaHoy / revenue) * 100);
        }

        const totalProductsCount = Array.isArray(products) ? products.length : 0;

        container.innerHTML = `
        <div class="fade-in">
          <!-- Welcome Greeting -->
          <div class="dashboard-greeting-section">
            <h1 class="dashboard-greeting-title">${greeting}, ${escapeHTML(user.name || 'Enmanuel Benitez')}!</h1>
            <p class="dashboard-greeting-sub">Veamos cómo va tu negocio hoy.</p>
          </div>

          <!-- 4 KPI Cards -->
          <div class="kpi-grid">
            <!-- 1: Ventas Hoy -->
            <div class="kpi-card">
              <div class="kpi-top">
                <span class="kpi-title">VENTAS HOY</span>
                <i data-lucide="trending-up" class="kpi-top-icon"></i>
              </div>
              <div class="kpi-val">${formatCurrency(revenue)}</div>
              <div class="kpi-pill-wrap">
                <span class="kpi-pill kpi-pill-default">${todayReport.totalSales || 0} ventas</span>
              </div>
            </div>

            <!-- 2: Ganancia Hoy -->
            <div class="kpi-card">
              <div class="kpi-top">
                <span class="kpi-title">GANANCIA HOY</span>
                <i data-lucide="dollar-sign" class="kpi-top-icon"></i>
              </div>
              <div class="kpi-val kpi-val-profit">${formatCurrency(gananciaHoy)}</div>
              <div class="kpi-pill-wrap">
                <span class="kpi-pill ${margenPct === 0 ? 'kpi-pill-danger' : 'kpi-pill-success'}">${margenPct}% margen</span>
              </div>
            </div>

            <!-- 3: Margen Promedio -->
            <div class="kpi-card">
              <div class="kpi-top">
                <span class="kpi-title">MARGEN PROMEDIO</span>
                <i data-lucide="percent" class="kpi-top-icon"></i>
              </div>
              <div class="kpi-val ${margenPct === 0 ? 'kpi-val-danger' : ''}">${margenPct}%</div>
              <div class="kpi-pill-wrap">
                <span class="kpi-pill kpi-pill-black">Todos rentables</span>
              </div>
            </div>

            <!-- 4: Total Productos -->
            <div class="kpi-card">
              <div class="kpi-top">
                <span class="kpi-title">TOTAL PRODUCTOS</span>
                <i data-lucide="package" class="kpi-top-icon"></i>
              </div>
              <div class="kpi-val">${totalProductsCount}</div>
              <div class="kpi-pill-wrap">
                <span class="kpi-pill kpi-pill-black">Stock OK</span>
              </div>
            </div>
          </div>

          <!-- Section: Estadísticas & Tabs -->
          <div class="dashboard-stats-header">
            <h3 class="stats-section-title">Estadísticas</h3>
            <div class="stats-period-selector" id="statsPeriodSelector">
              <button type="button" class="period-tab-btn ${currentPeriodDays === 7 ? 'active' : ''}" data-days="7">7 días</button>
              <button type="button" class="period-tab-btn ${currentPeriodDays === 30 ? 'active' : ''}" data-days="30">30 días</button>
              <button type="button" class="period-tab-btn ${currentPeriodDays === 90 ? 'active' : ''}" data-days="90">90 días</button>
            </div>
          </div>

          <!-- Two Side-by-Side Charts -->
          <div class="charts-grid-two">
            <div class="card chart-card">
              <div class="card-header">
                <h3 class="card-title">Ventas por Día de la Semana</h3>
              </div>
              <div class="chart-container" style="position:relative; height:240px; width:100%;">
                <canvas id="chartWeekday"></canvas>
              </div>
            </div>
            <div class="card chart-card">
              <div class="card-header">
                <h3 class="card-title">Ventas por Hora del Día</h3>
              </div>
              <div class="chart-container" style="position:relative; height:240px; width:100%;">
                <canvas id="chartHourly"></canvas>
              </div>
            </div>
          </div>

          <!-- Bottom Grid: Recent Sales & Top Products -->
          <div class="dashboard-bottom-grid">
            <div class="card">
              <div class="card-header"><h3 class="card-title">Ventas Recientes</h3></div>
              <div class="table-container" style="border:none">
                <table>
                  <thead>
                    <tr><th>Cliente</th><th>Total</th><th>Pago</th><th>Fecha</th></tr>
                  </thead>
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

        // Render charts & lists
        renderDashboardCharts(periodReport);
        renderRecentSales(recentSales);
        renderTopProducts(topProducts.products || []);

        // Bind period tabs
        document.querySelectorAll('.period-tab-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const days = parseInt(e.target.dataset.days, 10);
                if (days === currentPeriodDays) return;
                currentPeriodDays = days;
                document.querySelectorAll('.period-tab-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');

                // Re-calculate period report
                const pDate = new Date(year, month, day);
                pDate.setDate(pDate.getDate() - (currentPeriodDays - 1));
                const fromP = `${pDate.getFullYear()}-${String(pDate.getMonth() + 1).padStart(2, '0')}-${String(pDate.getDate()).padStart(2, '0')}`;
                
                try {
                    const newPeriodReport = await api.get(`/reports/sales-period?from=${fromP}&to=${selectedDate}`);
                    cachedPeriodReport = newPeriodReport;
                    destroyCharts();
                    renderDashboardCharts(newPeriodReport);
                } catch (err) {
                    console.error('Error fetching period:', err);
                }
            });
        });

        // Theme switch listener to redraw charts with matching colors
        const handleThemeChange = () => {
            if (cachedPeriodReport) {
                destroyCharts();
                renderDashboardCharts(cachedPeriodReport);
            }
        };
        window.removeEventListener('themeChanged', handleThemeChange);
        window.addEventListener('themeChanged', handleThemeChange, { once: true });

    } catch (err) {
        console.error('Dashboard error:', err);
        container.innerHTML = `<div class="empty-state"><p>Error al cargar dashboard: ${escapeHTML(err.message)}</p></div>`;
    }
}

function renderDashboardCharts(periodReport) {
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)';
    const tickColor = isDark ? '#71717a' : '#94a3b8';
    const barBg = isDark ? 'rgba(255, 255, 255, 0.85)' : '#09090b';
    const barHover = isDark ? '#ffffff' : '#27272a';

    const salesList = periodReport.sales || [];

    // 1. Chart: Ventas por Día de la Semana (Lun, Mar, Mié, Jue, Vie, Sáb, Dom)
    const weekdayLabels = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    const weekdayTotals = [0, 0, 0, 0, 0, 0, 0];

    salesList.forEach(s => {
        const d = new Date(s.date);
        // JS getDay(): 0 is Sunday, 1 is Monday ... 6 is Saturday
        const jsDay = d.getDay();
        const index = jsDay === 0 ? 6 : jsDay - 1; // map so Monday is 0, Sunday is 6
        weekdayTotals[index] += s.total || 0;
    });

    const ctx1 = document.getElementById('chartWeekday');
    if (ctx1) {
        const c1 = new Chart(ctx1, {
            type: 'bar',
            data: {
                labels: weekdayLabels,
                datasets: [{
                    label: 'Ventas (₲)',
                    data: weekdayTotals,
                    backgroundColor: barBg,
                    hoverBackgroundColor: barHover,
                    borderRadius: 6,
                    maxBarThickness: 32
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: isDark ? '#18181b' : '#ffffff',
                        titleColor: isDark ? '#ffffff' : '#09090b',
                        bodyColor: isDark ? '#a1a1aa' : '#64748b',
                        borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0',
                        borderWidth: 1,
                        padding: 10,
                        callbacks: {
                            label: (ctx) => ` Ventas: ${formatCurrency(ctx.parsed.y)}`
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: tickColor, font: { family: 'Plus Jakarta Sans', size: 11, weight: '500' } }
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: gridColor },
                        ticks: {
                            color: tickColor,
                            font: { family: 'Plus Jakarta Sans', size: 11 },
                            callback: v => v >= 1000000 ? (v / 1000000).toFixed(1) + 'M' : v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v
                        }
                    }
                }
            }
        });
        charts.push(c1);
    }

    // 2. Chart: Ventas por Hora del Día (08:00 to 22:00)
    const hourLabels = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00'];
    const hourTotals = [0, 0, 0, 0, 0, 0, 0, 0];

    salesList.forEach(s => {
        const d = new Date(s.date);
        const h = d.getHours();
        if (h < 9) hourTotals[0] += s.total || 0;
        else if (h < 11) hourTotals[1] += s.total || 0;
        else if (h < 13) hourTotals[2] += s.total || 0;
        else if (h < 15) hourTotals[3] += s.total || 0;
        else if (h < 17) hourTotals[4] += s.total || 0;
        else if (h < 19) hourTotals[5] += s.total || 0;
        else if (h < 21) hourTotals[6] += s.total || 0;
        else hourTotals[7] += s.total || 0;
    });

    const ctx2 = document.getElementById('chartHourly');
    if (ctx2) {
        const c2 = new Chart(ctx2, {
            type: 'bar',
            data: {
                labels: hourLabels,
                datasets: [{
                    label: 'Ventas (₲)',
                    data: hourTotals,
                    backgroundColor: barBg,
                    hoverBackgroundColor: barHover,
                    borderRadius: 6,
                    maxBarThickness: 32
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: isDark ? '#18181b' : '#ffffff',
                        titleColor: isDark ? '#ffffff' : '#09090b',
                        bodyColor: isDark ? '#a1a1aa' : '#64748b',
                        borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0',
                        borderWidth: 1,
                        padding: 10,
                        callbacks: {
                            label: (ctx) => ` Ventas: ${formatCurrency(ctx.parsed.y)}`
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: tickColor, font: { family: 'Plus Jakarta Sans', size: 11, weight: '500' } }
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: gridColor },
                        ticks: {
                            color: tickColor,
                            font: { family: 'Plus Jakarta Sans', size: 11 },
                            callback: v => v >= 1000000 ? (v / 1000000).toFixed(1) + 'M' : v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v
                        }
                    }
                }
            }
        });
        charts.push(c2);
    }
}

function renderRecentSales(recentSales) {
    const tbody = document.getElementById('recentSalesBody');
    if (!tbody) return;
    const payLabels = { efectivo: 'Efectivo', transferencia: 'Transferencia', nomina: 'Nómina', tarjeta: 'Tarjeta' };
    
    if (!recentSales || recentSales.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:1.5rem">No hay ventas recientes</td></tr>';
        return;
    }

    tbody.innerHTML = recentSales.map(s => `
    <tr>
      <td><span style="font-weight:600">${escapeHTML(s.clientName || 'General')}</span></td>
      <td><strong>${formatCurrency(s.total)}</strong></td>
      <td><span class="badge badge-${s.paymentMethod === 'efectivo' ? 'success' : s.paymentMethod === 'transferencia' ? 'info' : 'purple'}">${payLabels[s.paymentMethod] || s.paymentMethod}</span></td>
      <td style="color:var(--text-secondary);font-size:.82rem">${formatDateTime(s.date)}</td>
    </tr>`).join('');
}

function renderTopProducts(products) {
    const container = document.getElementById('topProductsContainer');
    if (!container) return;
    
    if (!products || products.length === 0) {
        container.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:1.5rem">Sin datos de productos</div>';
        return;
    }

    container.innerHTML = products.slice(0, 6).map((p, i) => `
      <div style="display:flex;align-items:center;gap:.75rem;padding:.65rem 0;${i < 5 ? 'border-bottom:1px solid var(--border)' : ''}">
        <div style="flex:1">
          <div style="font-weight:600;font-size:.88rem;color:var(--text)">${escapeHTML(p.name)}</div>
          <div style="font-size:.78rem;color:var(--text-secondary)">${p.qty} vendidos</div>
        </div>
        <div style="font-weight:700;color:var(--text);font-size:.88rem">${formatCurrency(p.revenue / (p.qty || 1))}</div>
      </div>`).join('');
}