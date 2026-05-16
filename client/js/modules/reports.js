// ============================================
// Reports Module
// ============================================

import { api } from '../api.js';
import { formatCurrency, formatDate, formatDateInput, todayStr, exportExcel, EMPLOYEE_CATEGORIES, PAYMENT_METHODS } from '../utils.js';

let activeChart = null;

function destroyChart() { if (activeChart) { activeChart.destroy(); activeChart = null; } }

const REPORT_TYPES = [
    { id: 'sales-period', name: 'Ventas por Período', icon: 'calendar' },
    { id: 'purchases-period', name: 'Compras por Período', icon: 'package-check' },
    { id: 'top-products', name: 'Productos Vendidos', icon: 'bar-chart-3' },
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

async function loadReport(type) {
    destroyChart();
    const area = document.getElementById('reportArea');
    area.innerHTML = '<div class="empty-state"><p>Cargando reporte...</p></div>';

    try {
        const [sales, purchases, providers] = await Promise.all([api.get('/sales'), api.get('/purchases'), api.get('/providers')]);
        
        // Normalizamos los nombres de variables del backend para compatibilidad con reportes anteriores
        const normalizedSales = sales.map(s => ({
            ...s,
            clientName: s.client?.name || s.clientName || 'Consumidor Final',
            clientCategory: s.client?.category || s.clientCategory || 'General',
            clientId: s.clientId || '1'
        }));

        switch (type) {
            case 'sales-period': reportSalesPeriod(area, normalizedSales); break;
            case 'purchases-period': reportPurchasesPeriod(area, purchases, providers); break;
            case 'top-products': reportTopProducts(area, normalizedSales); break;
            case 'client-consumption': reportClientConsumption(area, normalizedSales); break;
        }
    } catch (e) {
        area.innerHTML = `<div class="empty-state"><p>Error al cargar reporte: ${e.message}</p></div>`;
    }
}

function reportSalesPeriod(area, sales) {
    const d30 = new Date(); d30.setDate(d30.getDate() - 30);
    area.innerHTML = `
    <div class="report-filters">
      <div class="form-group"><label>Desde</label><input type="date" class="form-control" id="rpFrom" value="${formatDateInput(d30)}" /></div>
      <div class="form-group"><label>Hasta</label><input type="date" class="form-control" id="rpTo" value="${todayStr()}" /></div>
      <div class="form-group">
        <label>Categoría</label>
        <select class="form-control" id="rpCat">
          <option value="">Todas</option>
          ${EMPLOYEE_CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('')}
        </select>
      </div>
      <button class="btn btn-primary" id="rpApply" style="margin-top: auto;"><i data-lucide="filter"></i>Aplicar</button>
      <button class="btn btn-secondary" id="rpExport" style="margin-top: auto;"><i data-lucide="download"></i>Exportar Excel</button>
    </div>
    <div class="kpi-grid" id="rpKpis"></div>
    <div class="table-container" id="rpTable"></div>`;
    if (window.lucide) lucide.createIcons();

    function apply() {
        const from = document.getElementById('rpFrom').value;
        const to = document.getElementById('rpTo').value;
        const cat = document.getElementById('rpCat').value;
        
        const filtered = sales.filter(s => { 
            const d = s.date.split('T')[0]; 
            const dateMatch = d >= from && d <= to;
            const catMatch = !cat || s.clientCategory === cat;
            return dateMatch && catMatch; 
        });

        // Obtener fechas únicas en el rango seleccionado que tengan ventas
        const uniqueDates = [...new Set(filtered.map(s => s.date.split('T')[0]))].sort();

        // Agrupar por cliente
        const clientsData = {};
        let totalRev = 0;
        
        filtered.forEach(s => {
            const d = s.date.split('T')[0];
            const name = s.clientName || 'Consumidor Final';
            if(!clientsData[name]) clientsData[name] = { total: 0, category: s.clientCategory };
            if(!clientsData[name][d]) clientsData[name][d] = 0;
            
            clientsData[name][d] += s.total;
            clientsData[name].total += s.total;
            totalRev += s.total;
        });

        const sortedClients = Object.entries(clientsData).sort((a,b) => b[1].total - a[1].total);
        const avgTicket = filtered.length ? totalRev / filtered.length : 0;

        document.getElementById('rpKpis').innerHTML = `
      <div class="kpi-card"><div class="kpi-icon blue"><i data-lucide="shopping-bag"></i></div><div class="kpi-content"><div class="kpi-label">Total Transacciones</div><div class="kpi-value">${filtered.length}</div></div></div>
      <div class="kpi-card"><div class="kpi-icon green"><i data-lucide="trending-up"></i></div><div class="kpi-content"><div class="kpi-label">Ingresos Totales</div><div class="kpi-value">${formatCurrency(totalRev)}</div></div></div>
      <div class="kpi-card"><div class="kpi-icon purple"><i data-lucide="receipt"></i></div><div class="kpi-content"><div class="kpi-label">Ticket Promedio</div><div class="kpi-value">${formatCurrency(avgTicket)}</div></div></div>`;
        if (window.lucide) lucide.createIcons();

        if (uniqueDates.length === 0) {
            document.getElementById('rpTable').innerHTML = '<div class="empty-state"><p>No se encontraron ventas en este período.</p></div>';
            return;
        }

        const headers = `<th>Nombre del Cliente</th><th>Categoría</th>` + uniqueDates.map(d => `<th style="text-align:right">${formatDate(d)}</th>`).join('') + `<th style="text-align:right;background:rgba(99,102,241,0.1)">Total General</th>`;
        
        const rows = sortedClients.map(([name, data]) => {
            const cols = uniqueDates.map(d => `<td style="text-align:right">${data[d] ? formatCurrency(data[d]) : '<span style="color:var(--text-muted)">-</span>'}</td>`).join('');
            return `<tr><td><strong>${name}</strong></td><td><span class="badge badge-primary">${data.category}</span></td>${cols}<td style="text-align:right;background:rgba(99,102,241,0.05)"><strong>${formatCurrency(data.total)}</strong></td></tr>`;
        }).join('');

        document.getElementById('rpTable').innerHTML = `
        <div style="overflow-x:auto">
            <table style="min-width:max-content">
                <thead><tr>${headers}</tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;

        document.getElementById('rpExport').onclick = () => {
            const exportData = sortedClients.map(([name, data]) => {
                const rowData = [name, data.category];
                uniqueDates.forEach(d => rowData.push(data[d] || 0));
                rowData.push(data.total);
                return rowData;
            });
            const exportHeaders = ['Nombre del Cliente', 'Categoría', ...uniqueDates.map(d => formatDate(d)), 'Total General'];
            exportExcel(exportHeaders, exportData, 'reporte_ventas_pivot.xlsx');
            showToastLocal('Excel exportado');
        };
    }

    document.getElementById('rpApply').onclick = apply;
    apply();
}

function reportPurchasesPeriod(area, purchases, providers) {
    const d30 = new Date(); d30.setDate(d30.getDate() - 30);
    area.innerHTML = `
    <div class="report-filters" style="flex-wrap:wrap;gap:.75rem">
      <div class="form-group"><label>Desde</label><input type="date" class="form-control" id="rppFrom" value="${formatDateInput(d30)}" /></div>
      <div class="form-group"><label>Hasta</label><input type="date" class="form-control" id="rppTo" value="${todayStr()}" /></div>
      <div class="form-group">
        <label>Tipo de Filtro</label>
        <select class="form-control" id="rppFilterType">
          <option value="">Sin filtro adicional</option>
          <option value="proveedor">Por Proveedor</option>
          <option value="tipo">Por Tipo de Pago</option>
          <option value="factura">Por Factura</option>
        </select>
      </div>
      <!-- Filtro: Proveedor -->
      <div class="form-group" id="rppProvGroup" style="display:none">
        <label>Proveedor</label>
        <select class="form-control" id="rppProv">
          <option value="">Todos</option>
          ${providers.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
        </select>
      </div>
      <!-- Filtro: Tipo de Pago -->
      <div class="form-group" id="rppTipoGroup" style="display:none">
        <label>Tipo de Pago</label>
        <select class="form-control" id="rppTipo">
          <option value="">Todos</option>
          <option value="CONTADO">Contado</option>
          <option value="CREDITO">Crédito</option>
        </select>
      </div>
      <!-- Filtro: Factura -->
      <div class="form-group" id="rppFacturaGroup" style="display:none">
        <label>Número de Factura</label>
        <input type="text" class="form-control" id="rppFactura" placeholder="Ej: 001-001-0000123" />
      </div>
      <button class="btn btn-primary" id="rppApply" style="margin-top:auto"><i data-lucide="filter"></i>Aplicar</button>
      <button class="btn btn-secondary" id="rppExport" style="margin-top:auto"><i data-lucide="download"></i>Exportar Excel</button>
    </div>
    <div class="kpi-grid" id="rppKpis"></div>
    <div class="table-container" id="rppTable"></div>`;
    if (window.lucide) lucide.createIcons();

    // Mostrar/ocultar el sub-filtro dinámicamente
    document.getElementById('rppFilterType').addEventListener('change', () => {
        const val = document.getElementById('rppFilterType').value;
        document.getElementById('rppProvGroup').style.display    = val === 'proveedor' ? '' : 'none';
        document.getElementById('rppTipoGroup').style.display    = val === 'tipo'      ? '' : 'none';
        document.getElementById('rppFacturaGroup').style.display = val === 'factura'   ? '' : 'none';
    });

    function apply() {
        const from       = document.getElementById('rppFrom').value;
        const to         = document.getElementById('rppTo').value;
        const filterType = document.getElementById('rppFilterType').value;
        const provId     = document.getElementById('rppProv')?.value    || '';
        const tipo       = document.getElementById('rppTipo')?.value    || '';
        const factura    = (document.getElementById('rppFactura')?.value || '').toLowerCase().trim();

        const filtered = purchases.filter(p => {
            const d = p.date.split('T')[0];
            if (d < from || d > to) return false;
            if (filterType === 'proveedor' && provId && p.providerId !== provId) return false;
            if (filterType === 'tipo'      && tipo   && p.paymentMethod !== tipo) return false;
            if (filterType === 'factura'   && factura && !(p.invoiceNumber || '').toLowerCase().includes(factura)) return false;
            return true;
        }).sort((a, b) => new Date(b.date) - new Date(a.date));

        const totalCost = filtered.reduce((s, x) => s + x.total, 0);
        const totalContado = filtered.filter(p => p.paymentMethod !== 'CREDITO').reduce((s, x) => s + x.total, 0);
        const totalCredito = filtered.filter(p => p.paymentMethod === 'CREDITO').reduce((s, x) => s + x.total, 0);

        document.getElementById('rppKpis').innerHTML = `
      <div class="kpi-card"><div class="kpi-icon yellow"><i data-lucide="package"></i></div><div class="kpi-content"><div class="kpi-label">Total Compras</div><div class="kpi-value">${filtered.length}</div></div></div>
      <div class="kpi-card"><div class="kpi-icon danger"><i data-lucide="trending-down"></i></div><div class="kpi-content"><div class="kpi-label">Gastos Totales</div><div class="kpi-value">${formatCurrency(totalCost)}</div></div></div>
      <div class="kpi-card"><div class="kpi-icon green"><i data-lucide="banknote"></i></div><div class="kpi-content"><div class="kpi-label">Contado</div><div class="kpi-value">${formatCurrency(totalContado)}</div></div></div>
      <div class="kpi-card"><div class="kpi-icon purple"><i data-lucide="clock"></i></div><div class="kpi-content"><div class="kpi-label">Crédito</div><div class="kpi-value">${formatCurrency(totalCredito)}</div></div></div>`;
        if (window.lucide) lucide.createIcons();

        document.getElementById('rppTable').innerHTML = filtered.length === 0
          ? '<div class="empty-state"><p>No se encontraron compras con los filtros aplicados.</p></div>'
          : `<table><thead><tr><th>Fecha</th><th>Proveedor</th><th>Factura</th><th>Pago</th><th>Productos</th><th>Total</th></tr></thead>
          <tbody>${filtered.slice(0, 100).map(p => `<tr>
            <td>${formatDate(p.date)}</td>
            <td><strong>${p.providerName}</strong></td>
            <td><code>${p.invoiceNumber || '---'}</code></td>
            <td><span class="badge ${p.paymentMethod === 'CREDITO' ? 'badge-warning' : 'badge-success'}">${p.paymentMethod === 'CREDITO' ? 'Crédito' : 'Contado'}</span></td>
            <td style="font-size:.8rem;color:var(--text-secondary)">${p.items.map(i => `${i.name} (x${i.quantity})`).join(', ')}</td>
            <td><strong>${formatCurrency(p.total)}</strong></td>
          </tr>`).join('')}</tbody></table>`;

        document.getElementById('rppExport').onclick = () => {
            exportExcel(
                ['Fecha', 'Proveedor', 'Factura', 'Tipo Pago', 'Productos', 'Total'],
                filtered.map(p => [formatDate(p.date), p.providerName, p.invoiceNumber || '', p.paymentMethod, p.items.map(i => `${i.name} (x${i.quantity})`).join(', '), p.total]),
                'reporte_compras.xlsx'
            );
            showToastLocal('Excel exportado');
        };
    }

    document.getElementById('rppApply').onclick = apply;
    apply();
}


function reportTopProducts(area, sales) {
    const d30 = new Date(); d30.setDate(d30.getDate() - 30);
    area.innerHTML = `
    <div class="report-filters">
      <div class="form-group"><label>Desde</label><input type="date" class="form-control" id="rtpFrom" value="${formatDateInput(d30)}" /></div>
      <div class="form-group"><label>Hasta</label><input type="date" class="form-control" id="rtpTo" value="${todayStr()}" /></div>
      <button class="btn btn-primary" id="rtpApply" style="margin-top: auto;"><i data-lucide="filter"></i>Aplicar</button>
      <button class="btn btn-secondary" id="rtpExport" style="margin-top: auto;"><i data-lucide="download"></i>Exportar Excel</button>
    </div>
    <div class="table-container" id="rtpTable"></div>`;
    if (window.lucide) lucide.createIcons();

    function apply() {
        const from = document.getElementById('rtpFrom').value;
        const to = document.getElementById('rtpTo').value;

        const filteredSales = sales.filter(s => {
            const d = s.date.split('T')[0];
            return d >= from && d <= to;
        });

        const prodMap = {};
        filteredSales.forEach(s => s.items.forEach(it => {
            const name = it.product ? it.product.name : (it.name || 'Desconocido');
            if (!prodMap[name]) prodMap[name] = { qty: 0, revenue: 0, price: it.price || 0 };
            prodMap[name].qty += it.quantity;
            prodMap[name].revenue += (it.price || 0) * it.quantity;
        }));

        const sorted = Object.entries(prodMap).sort((a, b) => b[1].qty - a[1].qty);

        document.getElementById('rtpTable').innerHTML = `
        <table>
          <thead>
            <tr>
              <th>Producto</th>
              <th>Cantidad</th>
              <th>Precio Unitario</th>
              <th>Total Ventas</th>
            </tr>
          </thead>
          <tbody>
            ${sorted.map(([name, data]) => `
              <tr>
                <td><strong>${name}</strong></td>
                <td>${data.qty}</td>
                <td>${formatCurrency(data.price)}</td>
                <td><strong>${formatCurrency(data.revenue)}</strong></td>
              </tr>`).join('')}
          </tbody>
        </table>`;

        document.getElementById('rtpExport').onclick = () => {
            exportExcel(['Producto', 'Cantidad', 'Precio Unitario', 'Total Ventas'], sorted.map(([name, data]) => [name, data.qty, data.price, data.revenue]), 'reporte_productos.xlsx');
        };
    }

    document.getElementById('rtpApply').onclick = apply;
    apply();
}

function reportClientConsumption(area, sales) {
    const d30 = new Date(); d30.setDate(d30.getDate() - 30);
    area.innerHTML = `
    <div class="report-filters">
      <div class="form-group"><label>Desde</label><input type="date" class="form-control" id="rccFrom" value="${formatDateInput(d30)}" /></div>
      <div class="form-group"><label>Hasta</label><input type="date" class="form-control" id="rccTo" value="${todayStr()}" /></div>
      <div class="form-group">
        <label>Buscar Cliente</label>
        <input type="text" class="form-control" id="rccSearch" placeholder="Nombre o CI..." />
      </div>
      <button class="btn btn-primary" id="rccApply" style="margin-top: auto;"><i data-lucide="filter"></i>Filtrar</button>
      <button class="btn btn-secondary" id="rccExport" style="margin-top: auto;"><i data-lucide="download"></i>Exportar</button>
    </div>
    <div id="rccContent"></div>`;
    if (window.lucide) lucide.createIcons();

    function apply() {
        const from = document.getElementById('rccFrom').value;
        const to = document.getElementById('rccTo').value;
        const search = document.getElementById('rccSearch').value.toLowerCase();

        const filtered = sales.filter(s => {
            const d = s.date.split('T')[0];
            const dateMatch = d >= from && d <= to;
            const searchMatch = !search || s.clientName.toLowerCase().includes(search) || (s.client?.cedula && s.client.cedula.includes(search));
            return dateMatch && searchMatch;
        });

        const clientMap = {};
        filtered.forEach(s => {
            if (!clientMap[s.clientId]) {
                clientMap[s.clientId] = { id: s.clientId, name: s.clientName, category: s.clientCategory, count: 0, total: 0, days: {} };
            }
            const c = clientMap[s.clientId];
            const d = s.date.split('T')[0];
            c.count++;
            c.total += s.total;
            c.days[d] = (c.days[d] || 0) + s.total;
        });

        const sorted = Object.values(clientMap).sort((a, b) => b.total - a.total);

        document.getElementById('rccContent').innerHTML = `
        <div class="table-container">
          <table>
            <thead><tr><th>Cliente</th><th>Categoría</th><th>Compras</th><th>Total</th><th>Acción</th></tr></thead>
            <tbody>${sorted.map(c => `
              <tr>
                <td><strong>${c.name}</strong></td>
                <td><span class="badge badge-primary">${c.category}</span></td>
                <td>${c.count}</td>
                <td><strong>${formatCurrency(c.total)}</strong></td>
                <td><button class="btn btn-sm btn-ghost" data-detail="${c.id}">Ver Detalle</button></td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div id="rccDetail" style="margin-top:2rem"></div>`;

        document.querySelectorAll('[data-detail]').forEach(btn => {
            btn.onclick = () => {
                const client = clientMap[btn.dataset.detail];
                const sortedDays = Object.keys(client.days).sort().reverse();
                document.getElementById('rccDetail').innerHTML = `
                <div class="card fade-in">
                  <div class="card-header">
                    <h3 class="card-title">Detalle de Consumo: ${client.name}</h3>
                    <div class="badge badge-purple">${formatDate(from)} al ${formatDate(to)}</div>
                  </div>
                  <div class="table-container" style="border:none">
                    <table>
                      <thead><tr><th>Fecha</th><th>Total Diario</th></tr></thead>
                      <tbody>
                        ${sortedDays.map(d => `<tr><td>${formatDate(d)}</td><td><strong>${formatCurrency(client.days[d])}</strong></td></tr>`).join('')}
                      </tbody>
                      <tfoot>
                        <tr style="background:rgba(99,102,241,0.1);font-weight:700">
                          <td>TOTAL GENERAL</td>
                          <td>${formatCurrency(client.total)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>`;
                window.scrollTo({ top: document.getElementById('rccDetail').offsetTop - 100, behavior: 'smooth' });
            };
        });

        document.getElementById('rccExport').onclick = () => {
            exportExcel(['Cliente', 'Categoría', 'Compras', 'Total'], sorted.map(c => [c.name, c.category, c.count, c.total]), 'consumo_clientes.xlsx');
        };
    }

    document.getElementById('rccApply').onclick = apply;
    apply();
}

function showToastLocal(msg) {
    import('../utils.js').then(m => m.showToast(msg));
}
