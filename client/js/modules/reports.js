// ============================================
// Reports Module
// ============================================

import { api } from '../api.js';
import { formatCurrency, formatDate, formatDateTime, formatDateInput, todayStr, toLocalYMD, exportExcel, showToast, EMPLOYEE_CATEGORIES, PAYMENT_METHODS } from '../utils.js';
import { showTicket } from './sales.js';

let activeChart = null;

function destroyChart() { if (activeChart) { activeChart.destroy(); activeChart = null; } }

const REPORT_TYPES = [
    { id: 'sales-period', name: 'Ventas por Período', icon: 'calendar' },
    { id: 'purchases-period', name: 'Compras por Período', icon: 'package-check' },
    { id: 'top-products', name: 'Productos Vendidos', icon: 'bar-chart-3' },
    { id: 'client-consumption', name: 'Consumo por Cliente', icon: 'users' },
    { id: 'cash-registers', name: 'Sesiones de Caja', icon: 'landmark' }
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
        const [sales, purchases, providers, cashRegisters] = await Promise.all([
            api.get('/sales'),
            api.get('/purchases'),
            api.get('/providers'),
            api.get('/cashregister').catch(() => [])
        ]);
        
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
            case 'cash-registers': reportCashRegisters(area, cashRegisters); break;
        }
    } catch (e) {
        area.innerHTML = `<div class="empty-state"><p>Error al cargar reporte: ${e.message}</p></div>`;
    }
}

function reportSalesPeriod(area, sales) {
    const d30 = new Date(); d30.setDate(d30.getDate() - 30);
    area.innerHTML = `
    <div class="report-filters" style="flex-wrap:wrap;gap:.75rem;align-items:flex-end">
      <div class="form-group"><label>Desde</label><input type="date" class="form-control" id="rpFrom" value="${formatDateInput(d30)}" /></div>
      <div class="form-group"><label>Hasta</label><input type="date" class="form-control" id="rpTo" value="${todayStr()}" /></div>
      <div class="form-group">
        <label>Forma de Pago</label>
        <select class="form-control" id="rpPayMethod">
          <option value="">Todas</option>
          <option value="nomina">Vale</option>
          <option value="efectivo">Efectivo</option>
          <option value="transferencia">Transferencia</option>
        </select>
      </div>
      <div class="form-group">
        <label>Categoría</label>
        <select class="form-control" id="rpCat">
          <option value="">Todas</option>
          ${EMPLOYEE_CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('')}
        </select>
      </div>
      <button class="btn btn-primary" id="rpApply"><i data-lucide="filter"></i>Aplicar</button>
      <button class="btn btn-secondary" id="rpExport"><i data-lucide="download"></i>Exportar Excel</button>
    </div>
    <div class="kpi-grid" id="rpKpis"></div>
    <div class="table-container" id="rpTable"></div>`;
    if (window.lucide) lucide.createIcons();

    function apply() {
        const from = document.getElementById('rpFrom').value;
        const to = document.getElementById('rpTo').value;
        const cat = document.getElementById('rpCat').value;
        const payMethod = document.getElementById('rpPayMethod').value;
        
        const filtered = sales.filter(s => { 
            const d = toLocalYMD(s.date); 
            const dateMatch = d >= from && d <= to;
            const catMatch = !cat || s.clientCategory === cat;
            const payMatch = !payMethod || (s.paymentMethod || '').toLowerCase() === payMethod.toLowerCase();
            return dateMatch && catMatch && payMatch; 
        });

        // Obtener fechas únicas en el rango seleccionado que tengan ventas
        const uniqueDates = [...new Set(filtered.map(s => toLocalYMD(s.date)))].sort();

        // Agrupar por cliente
        const clientsData = {};
        let totalRev = 0;
        
        filtered.forEach(s => {
            const d = toLocalYMD(s.date);
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
            document.getElementById('rpTable').innerHTML = '<div class="empty-state"><p>No se encontraron ventas en este período con los filtros seleccionados.</p></div>';
            return;
        }

        const headers = `<th>Nombre del Cliente</th><th>Categoría</th>` + uniqueDates.map(d => `<th style="text-align:right">${formatDate(d)}</th>`).join('') + `<th style="text-align:right;background:rgba(128,128,128,0.08)">Total General</th>`;
        
        const rows = sortedClients.map(([name, data]) => {
            const cols = uniqueDates.map(d => `<td style="text-align:right">${data[d] ? formatCurrency(data[d]) : '<span style="color:var(--text-muted)">-</span>'}</td>`).join('');
            return `<tr><td><strong>${name}</strong></td><td><span class="badge badge-primary">${data.category}</span></td>${cols}<td style="text-align:right;background:rgba(128,128,128,0.04)"><strong>${formatCurrency(data.total)}</strong></td></tr>`;
        }).join('');

        document.getElementById('rpTable').innerHTML = `
        <table class="table-pivot" style="min-width:max-content;width:100%">
            <thead><tr>${headers}</tr></thead>
            <tbody>${rows}</tbody>
        </table>`;

        document.getElementById('rpExport').onclick = () => {
            const exportData = sortedClients.map(([name, data]) => {
                const rowData = [name, data.category];
                uniqueDates.forEach(d => rowData.push(data[d] || 0));
                rowData.push(data.total);
                return rowData;
            });
            const exportHeaders = ['Nombre del Cliente', 'Categoría', ...uniqueDates.map(d => formatDate(d)), 'Total General'];
            exportExcel(exportHeaders, exportData, 'reporte_ventas_pivot.xlsx');
            showToast('Excel exportado');
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
        <label>Propósito</label>
        <select class="form-control" id="rppPurpose">
          <option value="todos">Todos</option>
          <option value="venta">Para Venta</option>
          <option value="interno">Uso Interno</option>
        </select>
      </div>
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
        const purpose    = document.getElementById('rppPurpose').value;
        const filterType = document.getElementById('rppFilterType').value;
        const provId     = document.getElementById('rppProv')?.value    || '';
        const tipo       = document.getElementById('rppTipo')?.value    || '';
        const factura    = (document.getElementById('rppFactura')?.value || '').toLowerCase().trim();

        const filtered = purchases.map(p => {
            const itemsMatching = p.items.filter(i => {
                if (purpose === 'venta') return i.forResale !== false;
                if (purpose === 'interno') return i.forResale === false;
                return true;
            });
            if (itemsMatching.length === 0) return null;
            const filteredTotal = itemsMatching.reduce((s, x) => s + x.cost * x.quantity, 0);
            return {
                ...p,
                items: itemsMatching,
                total: filteredTotal
            };
        }).filter(p => p !== null && p.total > 0)
        .filter(p => {
            const d = toLocalYMD(p.date);
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
      <div class="kpi-card"><div class="kpi-icon yellow"><i data-lucide="package"></i></div><div class="kpi-content"><div class="kpi-label">Total Transacciones</div><div class="kpi-value">${filtered.length}</div></div></div>
      <div class="kpi-card"><div class="kpi-icon danger"><i data-lucide="trending-down"></i></div><div class="kpi-content"><div class="kpi-label">Gastos Totales Filtrados</div><div class="kpi-value">${formatCurrency(totalCost)}</div></div></div>
      <div class="kpi-card"><div class="kpi-icon green"><i data-lucide="banknote"></i></div><div class="kpi-content"><div class="kpi-label">Contado (Filtrado)</div><div class="kpi-value">${formatCurrency(totalContado)}</div></div></div>
      <div class="kpi-card"><div class="kpi-icon purple"><i data-lucide="clock"></i></div><div class="kpi-content"><div class="kpi-label">Crédito (Filtrado)</div><div class="kpi-value">${formatCurrency(totalCredito)}</div></div></div>`;
        if (window.lucide) lucide.createIcons();

        document.getElementById('rppTable').innerHTML = filtered.length === 0
          ? '<div class="empty-state"><p>No se encontraron compras con los filtros aplicados.</p></div>'
          : `<table><thead><tr><th>Fecha</th><th>Proveedor</th><th>Factura</th><th>Pago</th><th>Productos</th><th>Total Segmentado</th></tr></thead>
          <tbody>${filtered.slice(0, 100).map(p => `<tr>
            <td>${formatDate(p.date)}</td>
            <td><strong>${p.providerName}</strong></td>
            <td><code>${p.invoiceNumber || '---'}</code></td>
            <td><span class="badge ${p.paymentMethod === 'CREDITO' ? 'badge-warning' : 'badge-success'}">${p.paymentMethod === 'CREDITO' ? 'Crédito' : 'Contado'}</span></td>
            <td style="font-size:.8rem;color:var(--text-secondary)">${p.items.map(i => `${i.name} (x${i.quantity}) ${i.forResale !== false ? '<span style="color:#2d8a4e;font-weight:600;font-size:.7rem">(Venta)</span>' : '<span style="color:#b8860b;font-weight:600;font-size:.7rem">(Uso Interno)</span>'}`).join(', ')}</td>
            <td><strong>${formatCurrency(p.total)}</strong></td>
          </tr>`).join('')}</tbody></table>`;

        document.getElementById('rppExport').onclick = () => {
            const rows = [];
            filtered.forEach(p => {
                p.items.forEach(i => {
                    rows.push([
                        p.providerName || 'Sin proveedor',
                        p.invoiceNumber || '---',
                        i.name,
                        i.quantity,
                        i.cost,
                        Math.round(i.cost * i.quantity),
                        p.paymentMethod === 'CREDITO' ? 'Crédito' : 'Contado',
                        formatDate(p.date)
                    ]);
                });
            });
            exportExcel(
                ['Proveedor', 'Nº Factura', 'Producto', 'Cantidad', 'Precio Unitario', 'Total', 'Tipo de Pago', 'Fecha de Compra'],
                rows,
                'reporte_compras_segmentado.xlsx'
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
            const d = toLocalYMD(s.date);
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
            const d = toLocalYMD(s.date);
            const dateMatch = d >= from && d <= to;
            const searchMatch = !search || s.clientName.toLowerCase().includes(search) || (s.clientCedula && s.clientCedula.includes(search));
            return dateMatch && searchMatch;
        });

        const clientMap = {};
        filtered.forEach(s => {
            if (!clientMap[s.clientId]) {
                clientMap[s.clientId] = { id: s.clientId, name: s.clientName, category: s.clientCategory, count: 0, total: 0, sales: [] };
            }
            const c = clientMap[s.clientId];
            c.count++;
            c.total += s.total;
            c.sales.push(s);
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
                const sortedSales = [...client.sales].sort((a, b) => new Date(b.date) - new Date(a.date));
                const payLabels = { efectivo: 'Efectivo', transferencia: 'Transferencia', nomina: 'VALE DE COMEDOR' };
                document.getElementById('rccDetail').innerHTML = `
                <div class="card fade-in">
                  <div class="card-header">
                    <h3 class="card-title">Detalle de Consumo: ${client.name}</h3>
                    <div class="badge badge-purple">${formatDate(from)} al ${formatDate(to)}</div>
                  </div>
                  <div class="table-container" style="border:none">
                    <table>
                      <thead><tr><th>Fecha y Hora</th><th>Método Pago</th><th>Productos</th><th style="text-align:right">Total</th><th style="text-align:center">Acción</th></tr></thead>
                      <tbody>
                        ${sortedSales.map(sale => `
                          <tr>
                            <td>${formatDateTime(sale.date)}</td>
                            <td><span class="badge ${sale.paymentMethod === 'nomina' ? 'badge-purple' : 'badge-success'}">${payLabels[sale.paymentMethod] || sale.paymentMethod}</span></td>
                            <td style="font-size:.8rem;color:var(--text-secondary)">${sale.items.map(i => `${i.name} (x${i.quantity})`).join(', ')}</td>
                            <td style="text-align:right"><strong>${formatCurrency(sale.total)}</strong></td>
                            <td style="text-align:center"><button class="btn btn-sm btn-ghost btn-reprint" data-sale-id="${sale.id}"><i data-lucide="printer" style="width:14px;height:14px;vertical-align:middle;margin-right:4px"></i>Ticket</button></td>
                          </tr>`).join('')}
                      </tbody>
                      <tfoot>
                        <tr style="background:rgba(128,128,128,0.08);font-weight:700">
                          <td colspan="3">TOTAL GENERAL</td>
                          <td style="text-align:right">${formatCurrency(client.total)}</td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>`;
                if (window.lucide) lucide.createIcons();

                document.getElementById('rccDetail').querySelectorAll('.btn-reprint').forEach(reprintBtn => {
                    reprintBtn.onclick = () => {
                        const saleId = reprintBtn.dataset.saleId;
                        const sale = client.sales.find(s => s.id === saleId);
                        if (sale) {
                            showTicket(sale);
                        }
                    };
                });

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

function reportCashRegisters(area, cashRegisters) {
    const d30 = new Date(); d30.setDate(d30.getDate() - 30);
    area.innerHTML = `
    <div class="report-filters" style="flex-wrap:wrap;gap:.75rem">
      <div class="form-group"><label>Desde</label><input type="date" class="form-control" id="rcrFrom" value="${formatDateInput(d30)}" /></div>
      <div class="form-group"><label>Hasta</label><input type="date" class="form-control" id="rcrTo" value="${todayStr()}" /></div>
      <div class="form-group">
        <label>Estado</label>
        <select class="form-control" id="rcrStatus">
          <option value="">Todas</option>
          <option value="OPEN">Abiertas</option>
          <option value="CLOSED">Cerradas</option>
        </select>
      </div>
      <button class="btn btn-primary" id="rcrApply" style="margin-top:auto"><i data-lucide="filter"></i>Aplicar</button>
      <button class="btn btn-secondary" id="rcrExport" style="margin-top:auto"><i data-lucide="download"></i>Exportar Excel</button>
    </div>
    <div class="kpi-grid" id="rcrKpis"></div>
    <div class="table-container" id="rcrTable"></div>`;
    if (window.lucide) lucide.createIcons();

    function apply() {
        const from = document.getElementById('rcrFrom').value;
        const to = document.getElementById('rcrTo').value;
        const status = document.getElementById('rcrStatus').value;

        const filtered = cashRegisters.filter(r => {
            const d = toLocalYMD(r.openedAt);
            const dateMatch = d >= from && d <= to;
            const statusMatch = !status || r.status === status;
            return dateMatch && statusMatch;
        });

        const totalSales = filtered.reduce((s, r) => s + (r.totalSales || 0), 0);
        const totalEfectivo = filtered.reduce((s, r) => s + (r.totalEfectivo || 0), 0);
        const totalNomina = filtered.reduce((s, r) => s + (r.totalNomina || 0), 0);
        const totalTransferencia = filtered.reduce((s, r) => s + (r.totalTransferencia || 0), 0);

        document.getElementById('rcrKpis').innerHTML = `
      <div class="kpi-card"><div class="kpi-icon blue"><i data-lucide="landmark"></i></div><div class="kpi-content"><div class="kpi-label">Sesiones de Caja</div><div class="kpi-value">${filtered.length}</div></div></div>
      <div class="kpi-card"><div class="kpi-icon green"><i data-lucide="trending-up"></i></div><div class="kpi-content"><div class="kpi-label">Total Ventas en Cajas</div><div class="kpi-value">${formatCurrency(totalSales)}</div></div></div>
      <div class="kpi-card"><div class="kpi-icon green"><i data-lucide="banknote"></i></div><div class="kpi-content"><div class="kpi-label">Efectivo Total</div><div class="kpi-value">${formatCurrency(totalEfectivo)}</div></div></div>
      <div class="kpi-card"><div class="kpi-icon purple"><i data-lucide="receipt"></i></div><div class="kpi-content"><div class="kpi-label">Vales (Nómina)</div><div class="kpi-value">${formatCurrency(totalNomina)}</div></div></div>
      <div class="kpi-card"><div class="kpi-icon yellow"><i data-lucide="arrow-right-left"></i></div><div class="kpi-content"><div class="kpi-label">Transferencia Total</div><div class="kpi-value">${formatCurrency(totalTransferencia)}</div></div></div>`;
        if (window.lucide) lucide.createIcons();

        document.getElementById('rcrTable').innerHTML = filtered.length === 0
          ? '<div class="empty-state"><p>No se encontraron cajas en este período.</p></div>'
          : `<table><thead><tr><th>Apertura</th><th>Cierre</th><th>Cajero</th><th>Fondo (₲)</th><th>Efectivo</th><th>Nómina</th><th>Transferencia</th><th>Total Ventas</th><th>Contado (₲)</th><th>Diferencia</th><th>Estado</th></tr></thead>
          <tbody>${filtered.map(r => {
            const expected = (r.initialAmount || 0) + (r.totalEfectivo || 0);
            const diff = r.finalAmount !== null ? r.finalAmount - expected : null;
            const diffBadge = diff !== null
              ? (diff === 0 ? '<span class="badge badge-success">Cuadra</span>' : diff > 0 ? `<span class="badge badge-warning">+${formatCurrency(diff)}</span>` : `<span class="badge badge-danger">${formatCurrency(diff)}</span>`)
              : '—';
            return `<tr>
              <td style="font-size:.82rem">${formatDateTime(r.openedAt)}</td>
              <td style="font-size:.82rem">${r.closedAt ? formatDateTime(r.closedAt) : '—'}</td>
              <td><strong>${escapeHTML(r.openedByName)}</strong></td>
              <td>${formatCurrency(r.initialAmount)}</td>
              <td>${formatCurrency(r.totalEfectivo)}</td>
              <td>${formatCurrency(r.totalNomina)}</td>
              <td>${formatCurrency(r.totalTransferencia)}</td>
              <td><strong>${formatCurrency(r.totalSales)}</strong></td>
              <td>${r.finalAmount !== null ? formatCurrency(r.finalAmount) : '—'}</td>
              <td>${diffBadge}</td>
              <td><span class="badge ${r.status === 'OPEN' ? 'badge-success' : 'badge-secondary'}">${r.status === 'OPEN' ? 'Abierta' : 'Cerrada'}</span></td>
            </tr>`;
          }).join('')}</tbody></table>`;

        document.getElementById('rcrExport').onclick = () => {
            const rows = filtered.map(r => {
                const expected = (r.initialAmount || 0) + (r.totalEfectivo || 0);
                const diff = r.finalAmount !== null ? r.finalAmount - expected : 0;
                return [
                    formatDate(r.openedAt),
                    r.closedAt ? formatDate(r.closedAt) : 'Abierta',
                    r.openedByName,
                    r.initialAmount,
                    r.totalEfectivo,
                    r.totalNomina,
                    r.totalTransferencia,
                    r.totalSales,
                    r.finalAmount !== null ? r.finalAmount : '—',
                    diff,
                    r.status === 'OPEN' ? 'Abierta' : 'Cerrada'
                ];
            });
            exportExcel(
                ['Fecha Apertura', 'Fecha Cierre', 'Cajero', 'Fondo Inicial', 'Efectivo', 'Nómina', 'Transferencia', 'Total Ventas', 'Efectivo Contado', 'Diferencia', 'Estado'],
                rows,
                'reporte_sesiones_caja.xlsx'
            );
            showToastLocal('Excel exportado');
        };
    }

    document.getElementById('rcrApply').onclick = apply;
    apply();
}

function showToastLocal(msg) {
    import('../utils.js').then(m => m.showToast(msg));
}
