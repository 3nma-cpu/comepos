// ============================================
// Reports Module
// ============================================

import { api } from '../api.js';
import { formatCurrency, formatDate, formatDateTime, formatDateInput, todayStr, toLocalYMD, exportExcel, showToast, escapeHTML, EMPLOYEE_CATEGORIES, PAYMENT_METHODS } from '../utils.js';
import { showTicket, promptCancellationReason } from './sales.js';
import { openEditValeModal } from './clients.js';

let activeChart = null;

function destroyChart() { if (activeChart) { activeChart.destroy(); activeChart = null; } }

const REPORT_TYPES = [
    { id: 'sales-period', name: 'Ventas por Período', icon: 'calendar' },
    { id: 'purchases-period', name: 'Compras por Período', icon: 'package-check' },
    { id: 'top-products', name: 'Productos Vendidos', icon: 'bar-chart-3' },
    { id: 'client-consumption', name: 'Consumo por Cliente', icon: 'users' },
    { id: 'cash-registers', name: 'Sesiones de Caja', icon: 'landmark' },
    { id: 'cancelled-sales', name: 'Ventas Anuladas', icon: 'ban' }
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

        if (type === 'cancelled-sales') {
            await reportCancelledSales(area);
            return;
        }

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
        <label>Formato</label>
        <select class="form-control" id="rppViewMode">
          <option value="detalles">Por Detalle</option>
          <option value="totales">Totales</option>
        </select>
      </div>
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
          ${providers.map(p => `<option value="${p.id}">${escapeHTML(p.name)}</option>`).join('')}
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

    document.getElementById('rppViewMode').addEventListener('change', apply);

    function apply() {
        const from       = document.getElementById('rppFrom').value;
        const to         = document.getElementById('rppTo').value;
        const viewMode   = document.getElementById('rppViewMode').value;
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
        });

        const totalCost = filtered.reduce((s, x) => s + x.total, 0);
        const totalContado = filtered.filter(p => p.paymentMethod !== 'CREDITO').reduce((s, x) => s + x.total, 0);
        const totalCredito = filtered.filter(p => p.paymentMethod === 'CREDITO').reduce((s, x) => s + x.total, 0);

        document.getElementById('rppKpis').innerHTML = `
      <div class="kpi-card"><div class="kpi-icon yellow"><i data-lucide="package"></i></div><div class="kpi-content"><div class="kpi-label">Total Transacciones</div><div class="kpi-value">${filtered.length}</div></div></div>
      <div class="kpi-card"><div class="kpi-icon danger"><i data-lucide="trending-down"></i></div><div class="kpi-content"><div class="kpi-label">Gastos Totales Filtrados</div><div class="kpi-value">${formatCurrency(totalCost)}</div></div></div>
      <div class="kpi-card"><div class="kpi-icon green"><i data-lucide="banknote"></i></div><div class="kpi-content"><div class="kpi-label">Contado (Filtrado)</div><div class="kpi-value">${formatCurrency(totalContado)}</div></div></div>
      <div class="kpi-card"><div class="kpi-icon purple"><i data-lucide="clock"></i></div><div class="kpi-content"><div class="kpi-label">Crédito (Filtrado)</div><div class="kpi-value">${formatCurrency(totalCredito)}</div></div></div>`;
        if (window.lucide) lucide.createIcons();

        if (filtered.length === 0) {
            document.getElementById('rppTable').innerHTML = '<div class="empty-state"><p>No se encontraron compras con los filtros aplicados.</p></div>';
            document.getElementById('rppExport').onclick = () => showToast('No hay datos para exportar', 'warning');
            return;
        }

        // Agrupación por proveedor para calcular subtotales
        const providerMap = new Map();
        filtered.forEach(p => {
            const provName = p.providerName || 'Sin proveedor';
            if (!providerMap.has(provName)) {
                providerMap.set(provName, {
                    providerName: provName,
                    purchases: [],
                    subtotal: 0
                });
            }
            const group = providerMap.get(provName);
            group.purchases.push(p);
            group.subtotal += p.total;
        });

        const sortedGroups = Array.from(providerMap.values()).sort((a, b) => 
            a.providerName.localeCompare(b.providerName, 'es', { sensitivity: 'base' })
        );

        sortedGroups.forEach(g => {
            g.purchases.sort((a, b) => new Date(b.date) - new Date(a.date));
        });

        if (viewMode === 'totales') {
            let tableHtml = `
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Proveedor</th>
                  <th>Factura</th>
                  <th>Condición</th>
                  <th style="text-align:right">Total Factura</th>
                </tr>
              </thead>
              <tbody>`;

            sortedGroups.forEach(group => {
                group.purchases.forEach(p => {
                    const factText = p.invoiceNumber 
                        ? `FACT Nº ${escapeHTML(p.invoiceNumber)}` 
                        : (p.noInvoice ? 'Sin Factura' : '---');

                    tableHtml += `
                    <tr>
                      <td>${formatDate(p.date)}</td>
                      <td><strong>${escapeHTML(p.providerName || 'Sin proveedor')}</strong></td>
                      <td><code>${factText}</code></td>
                      <td><span class="badge ${p.paymentMethod === 'CREDITO' ? 'badge-warning' : 'badge-success'}">${p.paymentMethod === 'CREDITO' ? 'Crédito' : 'Contado'}</span></td>
                      <td style="text-align:right"><strong>${formatCurrency(p.total)}</strong></td>
                    </tr>`;
                });

                // Fila de subtotal por proveedor
                tableHtml += `
                <tr style="background:rgba(128,128,128,0.08); font-weight:700; border-top:1px solid var(--border); border-bottom:2px solid var(--border);">
                  <td colspan="4" style="text-align:right; padding:0.65rem 0.85rem;">
                    <span style="color:var(--text-secondary); text-transform:uppercase; font-size:0.75rem; letter-spacing:0.05em">Subtotal Proveedor:</span>
                    <strong style="margin-left:0.5rem; color:var(--text)">${escapeHTML(group.providerName)}</strong>
                  </td>
                  <td style="text-align:right; padding:0.65rem 0.85rem;">
                    <strong style="color:var(--text); font-size:0.95rem;">${formatCurrency(group.subtotal)}</strong>
                  </td>
                </tr>`;
            });

            tableHtml += `
              </tbody>
              <tfoot>
                <tr style="background:rgba(128,128,128,0.15); font-weight:800; font-size:0.95rem;">
                  <td colspan="4" style="text-align:right; padding:0.85rem;">TOTAL GENERAL:</td>
                  <td style="text-align:right; padding:0.85rem; color:var(--text)">${formatCurrency(totalCost)}</td>
                </tr>
              </tfoot>
            </table>`;

            document.getElementById('rppTable').innerHTML = tableHtml;

            document.getElementById('rppExport').onclick = () => {
                const rows = [];
                sortedGroups.forEach(group => {
                    group.purchases.forEach(p => {
                        rows.push([
                            p.providerName || 'Sin proveedor',
                            p.invoiceNumber ? `FACT Nº ${p.invoiceNumber}` : (p.noInvoice ? 'Sin Factura' : '---'),
                            formatDate(p.date),
                            p.paymentMethod === 'CREDITO' ? 'Crédito' : 'Contado',
                            p.total
                        ]);
                    });
                    rows.push([
                        `Subtotal ${group.providerName}`,
                        '',
                        '',
                        '',
                        group.subtotal
                    ]);
                });
                rows.push([
                    'TOTAL GENERAL',
                    '',
                    '',
                    '',
                    totalCost
                ]);

                exportExcel(
                    ['Proveedor', 'Nº Factura', 'Fecha', 'Condición / Pago', 'Total Factura'],
                    rows,
                    'reporte_compras_totales.xlsx'
                );
                showToast('Excel exportado');
            };
        } else {
            // Modo "detalles"
            let tableHtml = `
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Proveedor</th>
                  <th>Factura</th>
                  <th>Condición</th>
                  <th>Detalle de Productos</th>
                  <th style="text-align:right">Total Factura</th>
                </tr>
              </thead>
              <tbody>`;

            sortedGroups.forEach(group => {
                group.purchases.forEach(p => {
                    const factText = p.invoiceNumber 
                        ? `FACT Nº ${escapeHTML(p.invoiceNumber)}` 
                        : (p.noInvoice ? 'Sin Factura' : '---');

                    const itemsHtml = p.items.map(i => {
                        const tag = i.forResale !== false 
                            ? '<span style="color:#2d8a4e;font-weight:600;font-size:.72rem">(Venta)</span>' 
                            : '<span style="color:#b8860b;font-weight:600;font-size:.72rem">(Uso Interno)</span>';
                        const itemSubtotal = Math.round(i.cost * i.quantity);
                        return `
                        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; padding:2px 0; border-bottom:1px dashed rgba(128,128,128,0.12); font-size:0.82rem;">
                          <div>
                            <strong>${escapeHTML(i.name)}</strong> ${tag}
                          </div>
                          <div style="white-space:nowrap; color:var(--text-secondary); font-size:0.8rem;">
                            ${i.quantity} × ${formatCurrency(i.cost)} = <strong style="color:var(--text)">${formatCurrency(itemSubtotal)}</strong>
                          </div>
                        </div>`;
                    }).join('');

                    tableHtml += `
                    <tr>
                      <td style="vertical-align:top">${formatDate(p.date)}</td>
                      <td style="vertical-align:top"><strong>${escapeHTML(p.providerName || 'Sin proveedor')}</strong></td>
                      <td style="vertical-align:top"><code>${factText}</code></td>
                      <td style="vertical-align:top"><span class="badge ${p.paymentMethod === 'CREDITO' ? 'badge-warning' : 'badge-success'}">${p.paymentMethod === 'CREDITO' ? 'Crédito' : 'Contado'}</span></td>
                      <td style="vertical-align:top">
                        <div style="display:flex; flex-direction:column; gap:3px;">${itemsHtml}</div>
                      </td>
                      <td style="vertical-align:top; text-align:right"><strong>${formatCurrency(p.total)}</strong></td>
                    </tr>`;
                });

                // Fila de subtotal por proveedor
                tableHtml += `
                <tr style="background:rgba(128,128,128,0.08); font-weight:700; border-top:1px solid var(--border); border-bottom:2px solid var(--border);">
                  <td colspan="5" style="text-align:right; padding:0.65rem 0.85rem;">
                    <span style="color:var(--text-secondary); text-transform:uppercase; font-size:0.75rem; letter-spacing:0.05em">Subtotal Proveedor:</span>
                    <strong style="margin-left:0.5rem; color:var(--text)">${escapeHTML(group.providerName)}</strong>
                  </td>
                  <td style="text-align:right; padding:0.65rem 0.85rem;">
                    <strong style="color:var(--text); font-size:0.95rem;">${formatCurrency(group.subtotal)}</strong>
                  </td>
                </tr>`;
            });

            tableHtml += `
              </tbody>
              <tfoot>
                <tr style="background:rgba(128,128,128,0.15); font-weight:800; font-size:0.95rem;">
                  <td colspan="5" style="text-align:right; padding:0.85rem;">TOTAL GENERAL:</td>
                  <td style="text-align:right; padding:0.85rem; color:var(--text)">${formatCurrency(totalCost)}</td>
                </tr>
              </tfoot>
            </table>`;

            document.getElementById('rppTable').innerHTML = tableHtml;

            document.getElementById('rppExport').onclick = () => {
                const rows = [];
                sortedGroups.forEach(group => {
                    group.purchases.forEach(p => {
                        p.items.forEach(i => {
                            rows.push([
                                p.providerName || 'Sin proveedor',
                                p.invoiceNumber ? `FACT Nº ${p.invoiceNumber}` : (p.noInvoice ? 'Sin Factura' : '---'),
                                formatDate(p.date),
                                p.paymentMethod === 'CREDITO' ? 'Crédito' : 'Contado',
                                i.name,
                                i.forResale !== false ? 'Venta' : 'Uso Interno',
                                i.quantity,
                                i.cost,
                                Math.round(i.cost * i.quantity)
                            ]);
                        });
                    });
                    rows.push([
                        `Subtotal ${group.providerName}`,
                        '',
                        '',
                        '',
                        '',
                        '',
                        '',
                        '',
                        group.subtotal
                    ]);
                });
                rows.push([
                    'TOTAL GENERAL',
                    '',
                    '',
                    '',
                    '',
                    '',
                    '',
                    '',
                    totalCost
                ]);

                exportExcel(
                    ['Proveedor', 'Nº Factura', 'Fecha', 'Condición / Pago', 'Producto', 'Propósito', 'Cantidad', 'Precio Unitario', 'Total'],
                    rows,
                    'reporte_compras_detallado.xlsx'
                );
                showToast('Excel exportado');
            };
        }
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

    let currentlyOpenClientId = null;

    function apply() {
        currentlyOpenClientId = null;
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

        if (sorted.length === 0) {
            document.getElementById('rccContent').innerHTML = '<div class="empty-state"><p>No se encontraron registros de consumo en este período.</p></div>';
            return;
        }

        document.getElementById('rccContent').innerHTML = `
        <div class="table-container">
          <table>
            <thead><tr><th>Cliente</th><th>Categoría</th><th>Compras</th><th>Total</th><th>Acción</th></tr></thead>
            <tbody>${sorted.map(c => `
              <tr id="rcc-row-${c.id}">
                <td><strong>${escapeHTML(c.name)}</strong></td>
                <td><span class="badge badge-primary">${escapeHTML(c.category)}</span></td>
                <td class="rcc-count">${c.count}</td>
                <td class="rcc-total"><strong>${formatCurrency(c.total)}</strong></td>
                <td>
                  <button class="btn btn-sm btn-ghost btn-toggle-detail" data-detail="${c.id}">
                    <i data-lucide="chevron-down" style="width:14px;height:14px;margin-right:4px;vertical-align:middle"></i>Ver Detalle
                  </button>
                </td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>`;

        if (window.lucide) lucide.createIcons();

        const payLabels = { efectivo: 'Efectivo', transferencia: 'Transferencia', nomina: 'VALE DE COMEDOR' };

        function renderClientSalesRows(clientSales) {
            const sortedSales = [...clientSales].sort((a, b) => new Date(b.date) - new Date(a.date));
            return sortedSales.map(sale => `
              <tr>
                <td>${formatDateTime(sale.date)}</td>
                <td><span class="badge ${sale.paymentMethod === 'nomina' ? 'badge-purple' : 'badge-success'}">${payLabels[sale.paymentMethod] || sale.paymentMethod}</span></td>
                <td style="font-size:.8rem;color:var(--text-secondary)">${sale.items.map(i => `${escapeHTML(i.name)} (x${i.quantity})`).join(', ')}</td>
                <td style="text-align:right"><strong>${formatCurrency(sale.total)}</strong></td>
                <td style="text-align:center;white-space:nowrap">
                  <button class="btn btn-sm btn-ghost btn-reprint" data-sale-id="${sale.id}"><i data-lucide="printer" style="width:14px;height:14px;vertical-align:middle;margin-right:4px"></i>Ticket</button>
                  <button class="btn btn-sm btn-ghost btn-edit-sale" data-sale-id="${sale.id}" title="Editar vale"><i data-lucide="pencil" style="width:14px;height:14px;vertical-align:middle"></i></button>
                  <button class="btn btn-sm btn-ghost text-danger btn-delete-sale" data-sale-id="${sale.id}" title="Eliminar venta"><i data-lucide="trash-2" style="width:14px;height:14px;vertical-align:middle"></i></button>
                </td>
              </tr>`).join('');
        }

        function closeDetail(clientId) {
            const detailRow = document.getElementById(`rcc-detail-row-${clientId}`);
            if (detailRow) detailRow.remove();

            const btn = document.querySelector(`[data-detail="${clientId}"]`);
            if (btn) {
                btn.className = 'btn btn-sm btn-ghost btn-toggle-detail';
                btn.innerHTML = '<i data-lucide="chevron-down" style="width:14px;height:14px;margin-right:4px;vertical-align:middle"></i>Ver Detalle';
            }
            if (currentlyOpenClientId === clientId) {
                currentlyOpenClientId = null;
            }
            if (window.lucide) lucide.createIcons();
        }

        function bindDetailRowEvents(clientId) {
            const detailRow = document.getElementById(`rcc-detail-row-${clientId}`);
            if (!detailRow) return;

            const client = clientMap[clientId];
            if (!client) return;

            const closeBtn = detailRow.querySelector('.btn-close-rcc-detail');
            if (closeBtn) {
                closeBtn.onclick = () => closeDetail(clientId);
            }

            detailRow.querySelectorAll('.btn-reprint').forEach(reprintBtn => {
                reprintBtn.onclick = () => {
                    const saleId = reprintBtn.dataset.saleId;
                    const sale = client.sales.find(s => s.id === saleId);
                    if (sale) {
                        showTicket(sale, (deletedId) => handleDeletedSale(deletedId, clientId));
                    }
                };
            });

            detailRow.querySelectorAll('.btn-edit-sale').forEach(editBtn => {
                editBtn.onclick = () => {
                    const saleId = editBtn.dataset.saleId;
                    const sale = client.sales.find(s => s.id === saleId);
                    if (!sale) return;
                    openEditValeModal(sale, client, (updatedSale) => {
                        sale.items = updatedSale.items;
                        sale.total = updatedSale.total;

                        const gSale = sales.find(s => s.id === saleId);
                        if (gSale) {
                            gSale.items = updatedSale.items;
                            gSale.total = updatedSale.total;
                        }

                        client.total = client.sales.reduce((sum, s) => sum + s.total, 0);

                        const clientRow = document.getElementById(`rcc-row-${clientId}`);
                        if (clientRow) {
                            const totalEl = clientRow.querySelector('.rcc-total');
                            if (totalEl) totalEl.innerHTML = `<strong>${formatCurrency(client.total)}</strong>`;
                        }

                        const tbody = document.getElementById(`rcc-detail-tbody-${clientId}`);
                        const totalFooter = document.getElementById(`rcc-detail-total-${clientId}`);
                        if (tbody) tbody.innerHTML = renderClientSalesRows(client.sales);
                        if (totalFooter) totalFooter.innerHTML = `<strong>${formatCurrency(client.total)}</strong>`;
                        bindDetailRowEvents(clientId);
                        if (window.lucide) lucide.createIcons();
                    });
                };
            });

            detailRow.querySelectorAll('.btn-delete-sale').forEach(delBtn => {
                delBtn.onclick = () => {
                    const saleId = delBtn.dataset.saleId;
                    const sale = client.sales.find(s => s.id === saleId);
                    if (!sale) return;
                    promptCancellationReason(sale.total, async (reason) => {
                        try {
                            await api.delete(`/sales/${saleId}`, { reason });
                            showToast('Venta anulada y stock devuelto', 'success');
                            handleDeletedSale(saleId, clientId);
                        } catch (err) {
                            showToast('Error al anular venta: ' + err.message, 'error');
                            throw err;
                        }
                    });
                };
            });
        }

        function handleDeletedSale(saleId, clientId) {
            const sIdx = sales.findIndex(s => s.id === saleId);
            if (sIdx >= 0) sales.splice(sIdx, 1);

            const client = clientMap[clientId];
            if (!client) return;

            const cIdx = client.sales.findIndex(s => s.id === saleId);
            if (cIdx >= 0) {
                client.total -= client.sales[cIdx].total;
                client.count -= 1;
                client.sales.splice(cIdx, 1);
            }

            const clientRow = document.getElementById(`rcc-row-${clientId}`);
            if (clientRow) {
                const countEl = clientRow.querySelector('.rcc-count');
                const totalEl = clientRow.querySelector('.rcc-total');
                if (countEl) countEl.textContent = client.count;
                if (totalEl) totalEl.innerHTML = `<strong>${formatCurrency(client.total)}</strong>`;
            }

            if (client.sales.length > 0) {
                const tbody = document.getElementById(`rcc-detail-tbody-${clientId}`);
                const totalFooter = document.getElementById(`rcc-detail-total-${clientId}`);
                if (tbody) tbody.innerHTML = renderClientSalesRows(client.sales);
                if (totalFooter) totalFooter.innerHTML = `<strong>${formatCurrency(client.total)}</strong>`;
                bindDetailRowEvents(clientId);
                if (window.lucide) lucide.createIcons();
            } else {
                closeDetail(clientId);
            }
        }

        function openDetail(clientId) {
            if (currentlyOpenClientId && currentlyOpenClientId !== clientId) {
                closeDetail(currentlyOpenClientId);
            }

            const client = clientMap[clientId];
            if (!client) return;

            const clientRow = document.getElementById(`rcc-row-${clientId}`);
            if (!clientRow) return;

            const btn = document.querySelector(`[data-detail="${clientId}"]`);
            if (btn) {
                btn.className = 'btn btn-sm btn-secondary btn-toggle-detail';
                btn.innerHTML = '<i data-lucide="chevron-up" style="width:14px;height:14px;margin-right:4px;vertical-align:middle"></i>Cerrar Detalle';
            }

            const detailTr = document.createElement('tr');
            detailTr.id = `rcc-detail-row-${clientId}`;
            detailTr.className = 'rcc-detail-row';
            detailTr.innerHTML = `
              <td colspan="5" style="padding: 0.75rem 1rem; background: rgba(128, 128, 128, 0.04); border-top: 1px dashed var(--border); border-bottom: 1px solid var(--border);">
                <div class="card fade-in" style="margin: 0; background: var(--bg-card); border: 1px solid var(--border); box-shadow: var(--shadow);">
                  <div class="card-header" style="padding: 0.6rem 0.85rem; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; background: rgba(128, 128, 128, 0.03);">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                      <i data-lucide="receipt" style="width: 16px; height: 16px; color: var(--primary-light);"></i>
                      <h3 class="card-title" style="font-size: 0.92rem; margin: 0;">Detalle de Salidas / Consumo: <strong>${escapeHTML(client.name)}</strong></h3>
                    </div>
                    <div style="display: flex; align-items: center; gap: 0.75rem;">
                      <span class="badge badge-purple" style="font-size: 0.75rem;">${formatDate(from)} al ${formatDate(to)}</span>
                      <button class="btn btn-sm btn-ghost btn-close-rcc-detail" title="Cerrar detalle" style="padding: 2px 6px; font-size: 0.8rem;">
                        <i data-lucide="x" style="width: 14px; height: 14px;"></i>
                      </button>
                    </div>
                  </div>
                  <div class="table-container" style="border: none; max-height: 360px; overflow-y: auto;">
                    <table style="width: 100%; font-size: 0.85rem;">
                      <thead>
                        <tr>
                          <th>Fecha y Hora</th>
                          <th>Método Pago</th>
                          <th>Productos</th>
                          <th style="text-align:right">Total</th>
                          <th style="text-align:center">Acción</th>
                        </tr>
                      </thead>
                      <tbody id="rcc-detail-tbody-${clientId}">
                        ${renderClientSalesRows(client.sales)}
                      </tbody>
                      <tfoot>
                        <tr style="background:rgba(128,128,128,0.08);font-weight:700">
                          <td colspan="3">TOTAL GENERAL</td>
                          <td style="text-align:right" id="rcc-detail-total-${clientId}"><strong>${formatCurrency(client.total)}</strong></td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </td>
            `;

            clientRow.insertAdjacentElement('afterend', detailTr);
            currentlyOpenClientId = clientId;

            bindDetailRowEvents(clientId);
            if (window.lucide) lucide.createIcons();
        }

        document.querySelectorAll('.btn-toggle-detail').forEach(btn => {
            btn.onclick = () => {
                const cId = btn.dataset.detail;
                if (currentlyOpenClientId === cId) {
                    closeDetail(cId);
                } else {
                    openDetail(cId);
                }
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

async function reportCancelledSales(area) {
    const d30 = new Date(); d30.setDate(d30.getDate() - 30);
    area.innerHTML = `
    <div class="report-filters" style="flex-wrap:wrap;gap:.75rem;align-items:flex-end">
      <div class="form-group"><label>Desde</label><input type="date" class="form-control" id="rcanFrom" value="${formatDateInput(d30)}" /></div>
      <div class="form-group"><label>Hasta</label><input type="date" class="form-control" id="rcanTo" value="${todayStr()}" /></div>
      <div class="form-group" style="flex:1;min-width:200px">
        <label>Buscar</label>
        <input type="text" class="form-control" id="rcanSearch" placeholder="Ticket #, cliente, motivo o usuario..." />
      </div>
      <button class="btn btn-primary" id="rcanApply"><i data-lucide="filter"></i> Filtrar</button>
      <button class="btn btn-secondary" id="rcanExport"><i data-lucide="download"></i> Excel</button>
    </div>
    <div class="kpi-grid" id="rcanKpis" style="margin-bottom:1.5rem"></div>
    <div class="table-container" id="rcanTable"></div>`;
    if (window.lucide) lucide.createIcons();

    let allCancelled = [];

    async function loadData() {
        const from = document.getElementById('rcanFrom')?.value;
        const to = document.getElementById('rcanTo')?.value;
        const params = new URLSearchParams();
        if (from) params.set('from', from);
        if (to) params.set('to', to);

        try {
            allCancelled = await api.get(`/reports/cancelled-sales?${params.toString()}`);
            renderTable();
        } catch (err) {
            const tableEl = document.getElementById('rcanTable');
            if (tableEl) tableEl.innerHTML = `<div class="empty-state"><p>Error al cargar ventas anuladas: ${err.message}</p></div>`;
        }
    }

    function renderTable() {
        const search = (document.getElementById('rcanSearch')?.value || '').toLowerCase().trim();

        const filtered = allCancelled.filter(s => {
            if (!search) return true;
            const matchTicket = (s.id || '').toLowerCase().includes(search);
            const matchClient = (s.clientName || '').toLowerCase().includes(search);
            const matchUser = (s.userName || '').toLowerCase().includes(search);
            const matchCancelledBy = (s.cancelledByName || '').toLowerCase().includes(search);
            const matchReason = (s.cancellationReason || '').toLowerCase().includes(search);
            return matchTicket || matchClient || matchUser || matchCancelledBy || matchReason;
        });

        const totalAmount = filtered.reduce((sum, s) => sum + s.total, 0);
        const totalUnitsReturned = filtered.reduce((sum, s) => {
            return sum + (s.items || []).reduce((isum, item) => isum + (item.quantity || 0), 0);
        }, 0);

        const kpisEl = document.getElementById('rcanKpis');
        if (kpisEl) {
            kpisEl.innerHTML = `
            <div class="kpi-card">
              <div class="kpi-icon red" style="background:rgba(239,68,68,0.15);color:var(--danger)"><i data-lucide="ban"></i></div>
              <div class="kpi-content"><div class="kpi-label">Ventas Anuladas</div><div class="kpi-value">${filtered.length}</div></div>
            </div>
            <div class="kpi-card">
              <div class="kpi-icon yellow" style="background:rgba(245,158,11,0.15);color:var(--warning)"><i data-lucide="alert-triangle"></i></div>
              <div class="kpi-content"><div class="kpi-label">Monto Total Anulado</div><div class="kpi-value">${formatCurrency(totalAmount)}</div></div>
            </div>
            <div class="kpi-card">
              <div class="kpi-icon blue" style="background:rgba(59,130,246,0.15);color:#3b82f6"><i data-lucide="package"></i></div>
              <div class="kpi-content"><div class="kpi-label">Unidades Reintegradas al Stock</div><div class="kpi-value">${totalUnitsReturned}</div></div>
            </div>`;
            if (window.lucide) lucide.createIcons();
        }

        const tableEl = document.getElementById('rcanTable');
        if (!tableEl) return;

        if (filtered.length === 0) {
            tableEl.innerHTML = '<div class="empty-state"><p>No se registraron ventas anuladas en el período seleccionado.</p></div>';
            return;
        }

        tableEl.innerHTML = `
        <table>
          <thead>
            <tr>
              <th>Fecha Venta</th>
              <th>Fecha Anulación</th>
              <th>Ticket #</th>
              <th>Cliente</th>
              <th>Total Anulado</th>
              <th>Pago</th>
              <th>Anulado Por</th>
              <th>Motivo de Anulación</th>
              <th style="text-align:center">Acción</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map(s => {
                const ticketId = (s.id || '').slice(-6).toUpperCase();
                return `
                <tr style="background:rgba(239,68,68,0.03)">
                  <td style="font-size:.82rem">${formatDateTime(s.date)}</td>
                  <td style="font-size:.82rem;font-weight:600;color:var(--danger)">${formatDateTime(s.cancelledAt)}</td>
                  <td><code>${ticketId}</code></td>
                  <td><strong>${escapeHTML(s.clientName)}</strong></td>
                  <td><strong style="color:var(--danger)">${formatCurrency(s.total)}</strong></td>
                  <td><span class="badge badge-${s.paymentMethod === 'efectivo' ? 'success' : s.paymentMethod === 'transferencia' ? 'info' : 'purple'}">${s.paymentMethod}</span></td>
                  <td><strong>${escapeHTML(s.cancelledByName || 'Desconocido')}</strong></td>
                  <td style="max-width:240px;word-break:break-word"><span class="badge badge-secondary" style="font-weight:normal;text-align:left;display:inline-block">${escapeHTML(s.cancellationReason || 'Sin motivo')}</span></td>
                  <td style="text-align:center">
                    <button class="btn btn-sm btn-ghost btn-view-cancelled-ticket" data-sale-id="${s.id}" title="Ver Ticket Anulado">
                      <i data-lucide="eye" style="width:14px;height:14px"></i> Ver
                    </button>
                  </td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>`;
        if (window.lucide) lucide.createIcons();

        tableEl.querySelectorAll('.btn-view-cancelled-ticket').forEach(btn => {
            btn.onclick = () => {
                const sale = filtered.find(x => x.id === btn.dataset.saleId);
                if (sale) {
                    showTicket({ ...sale, status: 'CANCELLED' });
                }
            };
        });
    }

    const applyBtn = document.getElementById('rcanApply');
    if (applyBtn) applyBtn.onclick = loadData;

    const searchInput = document.getElementById('rcanSearch');
    if (searchInput) {
        searchInput.oninput = () => renderTable();
    }

    const exportBtn = document.getElementById('rcanExport');
    if (exportBtn) {
        exportBtn.onclick = () => {
            const rows = allCancelled.map(s => [
                formatDateTime(s.date),
                formatDateTime(s.cancelledAt),
                (s.id || '').slice(-6).toUpperCase(),
                s.clientName,
                s.clientCategory || 'General',
                s.total,
                s.paymentMethod,
                s.cancelledByName || 'Desconocido',
                s.cancellationReason || 'Sin motivo',
                s.userName || 'Cajero',
                (s.items || []).map(i => `${i.name} (x${i.quantity})`).join(', ')
            ]);
            exportExcel(
                ['Fecha Venta', 'Fecha Anulación', 'Ticket', 'Cliente', 'Categoría', 'Total Anulado', 'Método Pago', 'Anulado Por', 'Motivo', 'Cajero Original', 'Productos'],
                rows,
                'reporte_ventas_anuladas.xlsx'
            );
            showToast('Excel exportado', 'success');
        };
    }

    await loadData();
}
