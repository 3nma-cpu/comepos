// ============================================
// Reports Module
// ============================================

import { getCollection } from '../store.js';
import { formatCurrency, formatDate, formatDateInput, todayStr, exportCSV, EMPLOYEE_CATEGORIES, PAYMENT_METHODS } from '../utils.js';

let activeChart = null;

function destroyChart() { if (activeChart) { activeChart.destroy(); activeChart = null; } }

const REPORT_TYPES = [
    { id: 'sales-period', name: 'Ventas por Período', icon: 'calendar' },
    { id: 'sales-category', name: 'Por Categoría', icon: 'pie-chart' },
    { id: 'top-products', name: 'Productos Top', icon: 'bar-chart-3' },
    { id: 'payment-methods', name: 'Métodos de Pago', icon: 'credit-card' },
    { id: 'purchases-vs-sales', name: 'Compras vs Ventas', icon: 'git-compare' },
    { id: 'client-consumption', name: 'Consumo por Cliente', icon: 'users' }
];

export function renderReports() {
    destroyChart();
    const container = document.getElementById('module-content');
    container.innerHTML = `
    <div class="fade-in">
      <div class="report-selector" id="reportSelector">
        ${REPORT_TYPES.map((r, i) => `
          <div class="report-type-card ${i === 0 ? 'active' : ''}" data-report="${r.id}">
            <i data-lucide="${r.icon}"></i>
            <div class="report-name">${r.name}</div>
          </div>`).join('')}
      </div>
      <div id="reportArea"></div>
    </div>`;
    if (window.lucide) lucide.createIcons();

    document.getElementById('reportSelector').addEventListener('click', e => {
        const card = e.target.closest('.report-type-card');
        if (!card) return;
        document.querySelectorAll('.report-type-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        loadReport(card.dataset.report);
    });

    loadReport('sales-period');
}

function loadReport(type) {
    destroyChart();
    const area = document.getElementById('reportArea');
    const sales = getCollection('sales');
    const purchases = getCollection('purchases');

    switch (type) {
        case 'sales-period': reportSalesPeriod(area, sales); break;
        case 'sales-category': reportSalesCategory(area, sales); break;
        case 'top-products': reportTopProducts(area, sales); break;
        case 'payment-methods': reportPaymentMethods(area, sales); break;
        case 'purchases-vs-sales': reportPurchasesVsSales(area, purchases, sales); break;
        case 'client-consumption': reportClientConsumption(area, sales); break;
    }
}

function reportSalesPeriod(area, sales) {
    const d30 = new Date(); d30.setDate(d30.getDate() - 30);
    area.innerHTML = `
    <div class="report-filters">
      <div class="form-group"><label>Desde</label><input type="date" class="form-control" id="rpFrom" value="${formatDateInput(d30)}" /></div>
      <div class="form-group"><label>Hasta</label><input type="date" class="form-control" id="rpTo" value="${todayStr()}" /></div>
      <button class="btn btn-primary" id="rpApply"><i data-lucide="filter"></i>Aplicar</button>
      <button class="btn btn-secondary" id="rpExport"><i data-lucide="download"></i>Exportar CSV</button>
    </div>
    <div class="card" style="margin-bottom:1rem"><div class="chart-container"><canvas id="rpChart"></canvas></div></div>
    <div class="kpi-grid" id="rpKpis"></div>
    <div class="table-container" id="rpTable"></div>`;
    if (window.lucide) lucide.createIcons();

    function apply() {
        const from = document.getElementById('rpFrom').value;
        const to = document.getElementById('rpTo').value;
        const filtered = sales.filter(s => { const d = s.date.split('T')[0]; return d >= from && d <= to; }).sort((a, b) => new Date(b.date) - new Date(a.date));
        const totalRev = filtered.reduce((s, x) => s + x.total, 0);
        const avgTicket = filtered.length ? totalRev / filtered.length : 0;

        document.getElementById('rpKpis').innerHTML = `
      <div class="kpi-card"><div class="kpi-icon blue"><i data-lucide="shopping-bag"></i></div><div class="kpi-content"><div class="kpi-label">Total Ventas</div><div class="kpi-value">${filtered.length}</div></div></div>
      <div class="kpi-card"><div class="kpi-icon green"><i data-lucide="trending-up"></i></div><div class="kpi-content"><div class="kpi-label">Ingresos Totales</div><div class="kpi-value">${formatCurrency(totalRev)}</div></div></div>
      <div class="kpi-card"><div class="kpi-icon purple"><i data-lucide="receipt"></i></div><div class="kpi-content"><div class="kpi-label">Ticket Promedio</div><div class="kpi-value">${formatCurrency(avgTicket)}</div></div></div>`;
        if (window.lucide) lucide.createIcons();

        // Chart: daily totals
        const dayMap = {};
        filtered.forEach(s => { const d = s.date.split('T')[0]; dayMap[d] = (dayMap[d] || 0) + s.total; });
        const sortedDays = Object.keys(dayMap).sort();
        destroyChart();
        const ctx = document.getElementById('rpChart');
        if (ctx) {
            activeChart = new Chart(ctx, {
                type: 'line', data: { labels: sortedDays.map(d => formatDate(d)), datasets: [{ label: 'Ventas (₲)', data: sortedDays.map(d => dayMap[d]), borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.1)', fill: true, tension: .4 }] },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#94a3b8', maxTicksLimit: 10 }, grid: { display: false } }, y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,.05)' } } } }
            });
        }

        document.getElementById('rpTable').innerHTML = `<table><thead><tr><th>Fecha</th><th>Cliente</th><th>Categoría</th><th>Productos</th><th>Pago</th><th>Total</th></tr></thead>
      <tbody>${filtered.slice(0, 50).map(s => `<tr><td>${formatDate(s.date)}</td><td>${s.clientName}</td><td><span class="badge badge-primary">${s.clientCategory}</span></td><td style="font-size:.8rem;color:var(--text-secondary)">${s.items.map(i => i.name).join(', ')}</td><td>${s.paymentMethod}</td><td><strong>${formatCurrency(s.total)}</strong></td></tr>`).join('')}</tbody></table>`;

        document.getElementById('rpExport').onclick = () => {
            exportCSV(['Fecha', 'Cliente', 'Categoría', 'Total', 'Pago'], filtered.map(s => [formatDate(s.date), s.clientName, s.clientCategory, s.total, s.paymentMethod]), 'ventas_reporte.csv');
            showToastLocal('CSV exportado');
        };
    }

    document.getElementById('rpApply').onclick = apply;
    apply();
}

function reportSalesCategory(area, sales) {
    area.innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem"><div class="card"><div class="chart-container"><canvas id="rcChart"></canvas></div></div><div class="card"><div class="table-container" style="border:none" id="rcTable"></div></div></div>`;
    const catMap = {};
    sales.forEach(s => { catMap[s.clientCategory] = (catMap[s.clientCategory] || 0) + s.total; });
    const sorted = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
    const total = sorted.reduce((s, [, v]) => s + v, 0);
    const colors = ['#6366f1', '#8b5cf6', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6', '#ec4899', '#14b8a6'];

    destroyChart();
    const ctx = document.getElementById('rcChart');
    if (ctx) {
        activeChart = new Chart(ctx, {
            type: 'pie', data: { labels: sorted.map(s => s[0]), datasets: [{ data: sorted.map(s => s[1]), backgroundColor: colors }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8' } } } }
        });
    }

    document.getElementById('rcTable').innerHTML = `<table><thead><tr><th>Categoría</th><th>Ventas (₲)</th><th>% del Total</th></tr></thead>
    <tbody>${sorted.map(([cat, val]) => `<tr><td><strong>${cat}</strong></td><td>${formatCurrency(val)}</td><td>${((val / total) * 100).toFixed(1)}%</td></tr>`).join('')}</tbody></table>`;
}

function reportTopProducts(area, sales) {
    area.innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem"><div class="card"><div class="chart-container"><canvas id="rtpChart"></canvas></div></div><div class="card"><div class="table-container" style="border:none" id="rtpTable"></div></div></div>`;
    const prodMap = {};
    sales.forEach(s => s.items.forEach(it => {
        if (!prodMap[it.name]) prodMap[it.name] = { qty: 0, revenue: 0 };
        prodMap[it.name].qty += it.quantity;
        prodMap[it.name].revenue += it.price * it.quantity;
    }));
    const sorted = Object.entries(prodMap).sort((a, b) => b[1].qty - a[1].qty).slice(0, 10);
    const colors = ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6', '#ec4899', '#14b8a6'];

    destroyChart();
    const ctx = document.getElementById('rtpChart');
    if (ctx) {
        activeChart = new Chart(ctx, {
            type: 'bar', data: { labels: sorted.map(s => s[0]), datasets: [{ label: 'Cantidad', data: sorted.map(s => s[1].qty), backgroundColor: colors }] },
            options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,.05)' } }, y: { ticks: { color: '#94a3b8' }, grid: { display: false } } } }
        });
    }

    document.getElementById('rtpTable').innerHTML = `<table><thead><tr><th>#</th><th>Producto</th><th>Cantidad</th><th>Ingresos</th></tr></thead>
    <tbody>${sorted.map(([name, data], i) => `<tr><td>${i + 1}</td><td><strong>${name}</strong></td><td>${data.qty}</td><td>${formatCurrency(data.revenue)}</td></tr>`).join('')}</tbody></table>`;
}

function reportPaymentMethods(area, sales) {
    area.innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem"><div class="card"><div class="chart-container"><canvas id="rpmChart"></canvas></div></div><div class="card"><div class="table-container" style="border:none" id="rpmTable"></div></div></div>`;
    const payMap = {};
    const payLabels = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', nomina: 'Desc. Nómina' };
    sales.forEach(s => { const k = payLabels[s.paymentMethod] || s.paymentMethod; payMap[k] = (payMap[k] || 0) + s.total; });
    const sorted = Object.entries(payMap).sort((a, b) => b[1] - a[1]);
    const total = sorted.reduce((s, [, v]) => s + v, 0);
    const colors = ['#22c55e', '#3b82f6', '#8b5cf6'];

    destroyChart();
    const ctx = document.getElementById('rpmChart');
    if (ctx) {
        activeChart = new Chart(ctx, {
            type: 'doughnut', data: { labels: sorted.map(s => s[0]), datasets: [{ data: sorted.map(s => s[1]), backgroundColor: colors, borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8' } } } }
        });
    }

    document.getElementById('rpmTable').innerHTML = `<table><thead><tr><th>Método</th><th>Monto (₲)</th><th>Transacciones</th><th>%</th></tr></thead>
    <tbody>${sorted.map(([method, val]) => {
        const count = sales.filter(s => (payLabels[s.paymentMethod] || s.paymentMethod) === method).length;
        return `<tr><td><strong>${method}</strong></td><td>${formatCurrency(val)}</td><td>${count}</td><td>${((val / total) * 100).toFixed(1)}%</td></tr>`;
    }).join('')}</tbody></table>`;
}

function reportPurchasesVsSales(area, purchases, sales) {
    area.innerHTML = `<div class="card" style="margin-bottom:1rem"><div class="chart-container"><canvas id="rpvsChart"></canvas></div></div>
    <div class="kpi-grid" id="rpvsKpis"></div>`;
    const totalSales = sales.reduce((s, x) => s + x.total, 0);
    const totalPurchases = purchases.reduce((s, x) => s + x.total, 0);
    const margin = totalSales - totalPurchases;

    document.getElementById('rpvsKpis').innerHTML = `
    <div class="kpi-card"><div class="kpi-icon green"><i data-lucide="trending-up"></i></div><div class="kpi-content"><div class="kpi-label">Total Ventas</div><div class="kpi-value">${formatCurrency(totalSales)}</div></div></div>
    <div class="kpi-card"><div class="kpi-icon yellow"><i data-lucide="trending-down"></i></div><div class="kpi-content"><div class="kpi-label">Total Compras</div><div class="kpi-value">${formatCurrency(totalPurchases)}</div></div></div>
    <div class="kpi-card"><div class="kpi-icon ${margin >= 0 ? 'blue' : 'danger'}"><i data-lucide="coins"></i></div><div class="kpi-content"><div class="kpi-label">Margen</div><div class="kpi-value">${formatCurrency(margin)}</div></div></div>`;
    if (window.lucide) lucide.createIcons();

    // Monthly comparison
    const months = {};
    sales.forEach(s => { const m = s.date.slice(0, 7); if (!months[m]) months[m] = { sales: 0, purchases: 0 }; months[m].sales += s.total; });
    purchases.forEach(p => { const m = p.date.slice(0, 7); if (!months[m]) months[m] = { sales: 0, purchases: 0 }; months[m].purchases += p.total; });
    const sortedMonths = Object.keys(months).sort();

    destroyChart();
    const ctx = document.getElementById('rpvsChart');
    if (ctx) {
        activeChart = new Chart(ctx, {
            type: 'bar', data: {
                labels: sortedMonths,
                datasets: [
                    { label: 'Ventas', data: sortedMonths.map(m => months[m].sales), backgroundColor: 'rgba(34,197,94,0.6)', borderRadius: 4 },
                    { label: 'Compras', data: sortedMonths.map(m => months[m].purchases), backgroundColor: 'rgba(245,158,11,0.6)', borderRadius: 4 }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#94a3b8' } } }, scales: { x: { ticks: { color: '#94a3b8' }, grid: { display: false } }, y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,.05)' } } } }
        });
    }
}

function reportClientConsumption(area, sales) {
    area.innerHTML = `
    <div class="filters-bar">
      <div class="search-bar"><i data-lucide="search"></i><input type="text" class="form-control" id="rccSearch" placeholder="Buscar cliente..." /></div>
      <button class="btn btn-secondary" id="rccExport"><i data-lucide="download"></i>Exportar CSV</button>
    </div>
    <div class="table-container" id="rccTable"></div>`;
    if (window.lucide) lucide.createIcons();

    const clientMap = {};
    sales.forEach(s => {
        if (!clientMap[s.clientId]) clientMap[s.clientId] = { name: s.clientName, category: s.clientCategory, count: 0, total: 0 };
        clientMap[s.clientId].count++;
        clientMap[s.clientId].total += s.total;
    });
    const sorted = Object.values(clientMap).sort((a, b) => b.total - a.total);

    function renderTable(data) {
        document.getElementById('rccTable').innerHTML = `<table><thead><tr><th>Cliente</th><th>Categoría</th><th>Compras</th><th>Total Consumido</th><th>Promedio</th></tr></thead>
      <tbody>${data.map(c => `<tr><td><strong>${c.name}</strong></td><td><span class="badge badge-primary">${c.category}</span></td><td>${c.count}</td><td><strong>${formatCurrency(c.total)}</strong></td><td>${formatCurrency(c.total / c.count)}</td></tr>`).join('')}</tbody></table>`;
    }

    renderTable(sorted);
    document.getElementById('rccSearch').addEventListener('input', e => {
        const q = e.target.value.toLowerCase();
        renderTable(sorted.filter(c => c.name.toLowerCase().includes(q)));
    });
    document.getElementById('rccExport').onclick = () => {
        exportCSV(['Cliente', 'Categoría', 'Compras', 'Total', 'Promedio'], sorted.map(c => [c.name, c.category, c.count, c.total, Math.round(c.total / c.count)]), 'consumo_clientes.csv');
    };
}

function showToastLocal(msg) {
    import('../utils.js').then(m => m.showToast(msg));
}
