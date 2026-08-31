// ============================================
// Supplier Payments Module — Pagos a Proveedores
// Tabs: Proveedores | Pagos | Reporte
// ============================================

import { api } from '../api.js';
import { showToast, createModal, closeModal, escapeHTML, formatCurrency, formatDate, todayStr, exportExcel, debounce } from '../utils.js';

let currentTab = 'proveedores';
let cachedProveedores = [];
let cachedFormasPago = [];

// ============================================
// Main render
// ============================================
export async function renderSupplierPayments() {
    const container = document.getElementById('module-content');
    container.innerHTML = `
    <div class="fade-in">
      <div class="sp-tabs" id="spTabs">
        <button class="sp-tab active" data-tab="proveedores"><i data-lucide="building-2"></i>Proveedores</button>
        <button class="sp-tab" data-tab="pagos"><i data-lucide="banknote"></i>Registro de Pagos</button>
        <button class="sp-tab" data-tab="reporte"><i data-lucide="bar-chart-3"></i>Reporte Comparativo</button>
      </div>
      <div id="spContent"></div>
    </div>`;
    if (window.lucide) lucide.createIcons();

    // Preload data
    try {
        [cachedProveedores, cachedFormasPago] = await Promise.all([
            api.get('/supplier-payments/proveedores'),
            api.get('/supplier-payments/formas-pago')
        ]);
    } catch (e) {
        cachedProveedores = [];
        cachedFormasPago = [];
    }

    document.getElementById('spTabs').addEventListener('click', e => {
        const tab = e.target.closest('.sp-tab');
        if (!tab) return;
        document.querySelectorAll('.sp-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentTab = tab.dataset.tab;
        loadTab(currentTab);
    });

    loadTab(currentTab);
}

function loadTab(tab) {
    switch (tab) {
        case 'proveedores': renderProveedores(); break;
        case 'pagos': renderPagos(); break;
        case 'reporte': renderReporte(); break;
    }
}

// ============================================
// Tab 1: Proveedores
// ============================================
async function renderProveedores() {
    const area = document.getElementById('spContent');
    try {
        cachedProveedores = await api.get('/supplier-payments/proveedores');
        area.innerHTML = `
        <div class="fade-in" style="margin-top:1rem">
          <div class="filters-bar">
            <div class="search-bar">
              <i data-lucide="search"></i>
              <input type="text" class="form-control" id="spSearchProv" placeholder="Buscar proveedor..." />
            </div>
            <select class="form-control" id="spFilterEstado" style="width:auto;min-width:150px">
              <option value="">Todos</option>
              <option value="true">Activos</option>
              <option value="false">Inactivos</option>
            </select>
            <button class="btn btn-primary" id="btnAddProv"><i data-lucide="plus"></i>Nuevo Proveedor</button>
          </div>
          <div class="table-container">
            <table>
              <thead><tr><th>Nombre</th><th>RUC</th><th>Estado</th><th>Pagos</th><th>Acciones</th></tr></thead>
              <tbody id="provTableBody"></tbody>
            </table>
          </div>
        </div>`;
        if (window.lucide) lucide.createIcons();

        function applyFilters() {
            const q = document.getElementById('spSearchProv').value.toLowerCase();
            const estado = document.getElementById('spFilterEstado').value;
            const filtered = cachedProveedores.filter(p => {
                const matchQ = !q || p.nombre.toLowerCase().includes(q) || (p.ruc || '').toLowerCase().includes(q);
                const matchEstado = !estado || String(p.activo) === estado;
                return matchQ && matchEstado;
            });
            renderProvTable(filtered);
        }

        renderProvTable(cachedProveedores);
        document.getElementById('spSearchProv').addEventListener('input', debounce(applyFilters, 200));
        document.getElementById('spFilterEstado').addEventListener('change', applyFilters);
        document.getElementById('btnAddProv').addEventListener('click', () => openProvModal(null));
    } catch (err) {
        area.innerHTML = `<div class="empty-state"><p>Error: ${err.message}</p></div>`;
    }
}

function renderProvTable(proveedores) {
    const tbody = document.getElementById('provTableBody');
    if (!tbody) return;
    if (proveedores.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:2rem">Sin proveedores registrados</td></tr>';
        return;
    }
    tbody.innerHTML = proveedores.map(p => `
    <tr>
      <td><strong>${escapeHTML(p.nombre)}</strong></td>
      <td style="color:var(--text-secondary)">${escapeHTML(p.ruc || '—')}</td>
      <td>
        <span class="badge ${p.activo ? 'badge-success' : 'badge-secondary'}">${p.activo ? 'Activo' : 'Inactivo'}</span>
      </td>
      <td style="color:var(--text-secondary);font-weight:600">${p._count?.pagos || 0}</td>
      <td>
        <button class="btn btn-ghost btn-sm btn-icon" data-edit-prov="${p.id}" title="Editar"><i data-lucide="pencil"></i></button>
        <button class="btn btn-ghost btn-sm btn-icon" data-toggle-prov="${p.id}" data-activo="${p.activo}" title="${p.activo ? 'Desactivar' : 'Activar'}">
          <i data-lucide="${p.activo ? 'toggle-right' : 'toggle-left'}"></i>
        </button>
        <button class="btn btn-ghost btn-sm btn-icon" data-delete-prov="${p.id}" title="Eliminar"><i data-lucide="trash-2"></i></button>
      </td>
    </tr>`).join('');
    if (window.lucide) lucide.createIcons();

    tbody.querySelectorAll('[data-edit-prov]').forEach(btn => {
        btn.onclick = () => {
            const prov = cachedProveedores.find(p => p.id === btn.dataset.editProv);
            if (prov) openProvModal(prov);
        };
    });

    tbody.querySelectorAll('[data-toggle-prov]').forEach(btn => {
        btn.onclick = async () => {
            const activo = btn.dataset.activo === 'true';
            try {
                await api.put(`/supplier-payments/proveedores/${btn.dataset.toggleProv}`, { activo: !activo });
                showToast(activo ? 'Proveedor desactivado' : 'Proveedor activado');
                await renderProveedores();
            } catch (e) {
                showToast(e.message, 'error');
            }
        };
    });

    tbody.querySelectorAll('[data-delete-prov]').forEach(btn => {
        btn.onclick = async () => {
            const prov = cachedProveedores.find(p => p.id === btn.dataset.deleteProv);
            const provName = prov ? prov.nombre : 'este proveedor';
            if (!confirm(`¿Está seguro de que desea eliminar al proveedor "${provName}"?`)) return;
            try {
                const res = await api.delete(`/supplier-payments/proveedores/${btn.dataset.deleteProv}`);
                showToast(res?.message || 'Proveedor eliminado');
                await renderProveedores();
            } catch (e) {
                showToast(e.message || 'Error al eliminar proveedor', 'error');
            }
        };
    });
}

function openProvModal(prov) {
    const isEdit = !!prov;
    const body = `
    <div class="form-group"><label>Nombre *</label><input type="text" class="form-control" id="mProvNombre" value="${isEdit ? escapeHTML(prov.nombre) : ''}" required /></div>
    <div class="form-group"><label>RUC</label><input type="text" class="form-control" id="mProvRuc" value="${isEdit ? escapeHTML(prov.ruc || '') : ''}" /></div>`;
    const footer = `<button class="btn btn-secondary modal-close">Cancelar</button><button class="btn btn-primary" id="btnSaveProv">${isEdit ? 'Guardar' : 'Crear'}</button>`;
    const overlay = createModal(isEdit ? 'Editar Proveedor' : 'Nuevo Proveedor', body, footer);

    document.getElementById('btnSaveProv').onclick = async () => {
        const nombre = document.getElementById('mProvNombre').value.trim();
        const ruc = document.getElementById('mProvRuc').value.trim();
        if (!nombre) return showToast('Nombre es obligatorio', 'error');

        const btn = document.getElementById('btnSaveProv');
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader"></i> Guardando...';
        if (window.lucide) lucide.createIcons();

        try {
            if (isEdit) {
                await api.put(`/supplier-payments/proveedores/${prov.id}`, { nombre, ruc });
                showToast('Proveedor actualizado');
            } else {
                await api.post('/supplier-payments/proveedores', { nombre, ruc });
                showToast('Proveedor creado');
            }
            closeModal(overlay);
            renderProveedores();
        } catch (err) {
            showToast(err.message, 'error');
            btn.disabled = false;
            btn.innerHTML = isEdit ? 'Guardar' : 'Crear';
        }
    };
}

// ============================================
// ============================================
// Tab 2: Pagos
// ============================================
async function renderPagos() {
    const area = document.getElementById('spContent');
    try {
        const [pagos] = await Promise.all([
            api.get('/supplier-payments/pagos'),
            refreshCaches()
        ]);

        const hoy = new Date();
        const currentYearMonth = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
        const provActivos = cachedProveedores.filter(p => p.activo);

        area.innerHTML = `
        <div class="fade-in" style="margin-top:1rem">
          <div class="card" style="padding:1.25rem;margin-bottom:1.25rem">
            <h3 style="font-size:.95rem;font-weight:700;margin-bottom:1rem;display:flex;align-items:center;gap:.5rem">
              <i data-lucide="plus-circle"></i>Registrar Pago a Proveedor
            </h3>
            <div class="form-row">
              <div class="form-group" style="flex:2">
                <label>Proveedor *</label>
                <select class="form-control" id="spPayProv">
                  <option value="">Seleccionar proveedor...</option>
                  ${provActivos.map(p => `<option value="${p.id}">${escapeHTML(p.nombre)}</option>`).join('')}
                </select>
              </div>
              <div class="form-group" style="flex:1">
                <label>Mes que se Paga *</label>
                <input type="month" class="form-control" id="spPayMes" value="${currentYearMonth}" title="Mes correspondiente al gasto o servicio" />
              </div>
              <div class="form-group" style="flex:1">
                <label>Fecha de Cobro / Emisión *</label>
                <input type="date" class="form-control" id="spPayFecha" value="${todayStr()}" title="Fecha real de entrega o cobro del cheque" />
              </div>
              <div class="form-group" style="flex:1">
                <label>Forma de Pago *</label>
                <select class="form-control" id="spPayForma">
                  ${cachedFormasPago.map(f => `<option value="${f.id}">${escapeHTML(f.nombre)}</option>`).join('')}
                </select>
              </div>
              <div class="form-group" style="flex:1">
                <label>Monto (₲) *</label>
                <input type="number" class="form-control" id="spPayMonto" min="1" step="1" placeholder="0" />
              </div>
            </div>
            <div class="form-row">
              <div class="form-group" style="flex:3">
                <label>Observación (ej: Cheque N° 123456 / Factura N°)</label>
                <input type="text" class="form-control" id="spPayObs" placeholder="Opcional..." />
              </div>
              <div class="form-group" style="flex:0 0 auto;display:flex;align-items:flex-end">
                <button class="btn btn-primary" id="btnRegistrarPago" style="white-space:nowrap"><i data-lucide="save"></i>Registrar Pago</button>
              </div>
            </div>
          </div>
          <div class="filters-bar" style="margin-bottom:.75rem">
            <div class="search-bar">
              <i data-lucide="search"></i>
              <input type="text" class="form-control" id="spSearchPago" placeholder="Buscar por proveedor, mes u observación..." />
            </div>
            <span style="color:var(--text-muted);font-size:.82rem">${pagos.length} pagos registrados</span>
          </div>
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>Mes Pagado</th>
                  <th>Fecha Pago/Cobro</th>
                  <th>Proveedor</th>
                  <th>Forma de Pago</th>
                  <th style="text-align:right">Monto</th>
                  <th>Observación</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody id="pagosTableBody"></tbody>
            </table>
          </div>
        </div>`;
        if (window.lucide) lucide.createIcons();

        function formatMesLabel(mesStr) {
            if (!mesStr || mesStr.length < 7) return mesStr || '—';
            const [y, m] = mesStr.split('-').map(Number);
            const d = new Date(y, m - 1, 1);
            return d.toLocaleDateString('es-PY', { month: 'short', year: 'numeric' }).toUpperCase();
        }

        // Render pagos table
        function renderPagosTable(data) {
            const tbody = document.getElementById('pagosTableBody');
            if (!tbody) return;
            if (data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:2rem">Sin pagos registrados</td></tr>';
                return;
            }
            tbody.innerHTML = data.map(p => `
            <tr>
              <td><span class="badge badge-primary" style="font-weight:600">${formatMesLabel(p.mesPago)}</span></td>
              <td style="color:var(--text-secondary)">${formatDate(p.fechaPago)}</td>
              <td><strong>${escapeHTML(p.proveedorNombre)}</strong></td>
              <td><span class="badge badge-info">${escapeHTML(p.formaPagoNombre)}</span></td>
              <td style="text-align:right;font-weight:700;font-variant-numeric:tabular-nums">${formatCurrency(p.monto)}</td>
              <td style="color:var(--text-secondary);font-size:.82rem;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHTML(p.observacion || '—')}</td>
              <td>
                <button class="btn btn-ghost btn-sm btn-icon" data-edit-pago="${p.id}" title="Editar"><i data-lucide="pencil"></i></button>
                <button class="btn btn-ghost btn-sm btn-icon" data-del-pago="${p.id}" title="Eliminar"><i data-lucide="trash-2"></i></button>
              </td>
            </tr>`).join('');
            if (window.lucide) lucide.createIcons();

            tbody.querySelectorAll('[data-edit-pago]').forEach(btn => {
                btn.onclick = () => {
                    const pago = pagos.find(p => p.id === btn.dataset.editPago);
                    if (pago) openEditPagoModal(pago);
                };
            });
            tbody.querySelectorAll('[data-del-pago]').forEach(btn => {
                btn.onclick = async () => {
                    if (!confirm('¿Eliminar este pago?')) return;
                    try {
                        await api.delete(`/supplier-payments/pagos/${btn.dataset.delPago}`);
                        showToast('Pago eliminado');
                        renderPagos();
                    } catch (e) {
                        showToast(e.message, 'error');
                    }
                };
            });
        }

        renderPagosTable(pagos);

        // Search
        document.getElementById('spSearchPago').addEventListener('input', debounce(() => {
            const q = document.getElementById('spSearchPago').value.toLowerCase();
            const filtered = pagos.filter(p =>
                p.proveedorNombre.toLowerCase().includes(q) ||
                (p.mesPago || '').toLowerCase().includes(q) ||
                (p.observacion || '').toLowerCase().includes(q)
            );
            renderPagosTable(filtered);
        }, 200));

        // Register payment
        document.getElementById('btnRegistrarPago').addEventListener('click', async () => {
            const proveedorId = document.getElementById('spPayProv').value;
            const mesPago = document.getElementById('spPayMes').value;
            const fechaPago = document.getElementById('spPayFecha').value;
            const formaPagoId = document.getElementById('spPayForma').value;
            const monto = document.getElementById('spPayMonto').value;
            const observacion = document.getElementById('spPayObs').value;

            if (!proveedorId) return showToast('Seleccione un proveedor', 'error');
            if (!mesPago) return showToast('Seleccione el mes que se paga', 'error');
            if (!fechaPago) return showToast('Seleccione la fecha de cobro o emisión', 'error');
            if (!monto || parseFloat(monto) <= 0) return showToast('Monto debe ser mayor a 0', 'error');

            const btn = document.getElementById('btnRegistrarPago');
            btn.disabled = true;
            btn.innerHTML = '<i data-lucide="loader"></i> Guardando...';
            if (window.lucide) lucide.createIcons();

            try {
                await api.post('/supplier-payments/pagos', {
                    proveedorId, mesPago, fechaPago, formaPagoId, monto: parseFloat(monto), observacion
                });
                showToast('Pago registrado exitosamente');
                renderPagos();
            } catch (err) {
                showToast(err.message, 'error');
                btn.disabled = false;
                btn.innerHTML = '<i data-lucide="save"></i>Registrar Pago';
                if (window.lucide) lucide.createIcons();
            }
        });
    } catch (err) {
        area.innerHTML = `<div class="empty-state"><p>Error: ${err.message}</p></div>`;
    }
}

function openEditPagoModal(pago) {
    const provActivos = cachedProveedores.filter(p => p.activo || p.id === pago.proveedorId);
    const fechaVal = pago.fechaPago.substring(0, 10);
    const mesVal = pago.mesPago || fechaVal.substring(0, 7);

    const body = `
    <div class="form-row">
      <div class="form-group" style="flex:2">
        <label>Proveedor *</label>
        <select class="form-control" id="mEditProv">
          ${provActivos.map(p => `<option value="${p.id}" ${p.id === pago.proveedorId ? 'selected' : ''}>${escapeHTML(p.nombre)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group" style="flex:1">
        <label>Mes que se Paga *</label>
        <input type="month" class="form-control" id="mEditMes" value="${mesVal}" />
      </div>
    </div>
    <div class="form-row">
      <div class="form-group" style="flex:1">
        <label>Fecha de Cobro / Emisión *</label>
        <input type="date" class="form-control" id="mEditFecha" value="${fechaVal}" />
      </div>
      <div class="form-group" style="flex:1">
        <label>Forma de Pago *</label>
        <select class="form-control" id="mEditForma">
          ${cachedFormasPago.map(f => `<option value="${f.id}" ${f.id === pago.formaPagoId ? 'selected' : ''}>${escapeHTML(f.nombre)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group" style="flex:1">
        <label>Monto (₲) *</label>
        <input type="number" class="form-control" id="mEditMonto" min="1" step="1" value="${pago.monto}" />
      </div>
    </div>
    <div class="form-group"><label>Observación</label><input type="text" class="form-control" id="mEditObs" value="${escapeHTML(pago.observacion || '')}" /></div>`;
    const footer = `<button class="btn btn-secondary modal-close">Cancelar</button><button class="btn btn-primary" id="btnUpdatePago">Guardar</button>`;
    const overlay = createModal('Editar Pago', body, footer);

    document.getElementById('btnUpdatePago').onclick = async () => {
        const data = {
            proveedorId: document.getElementById('mEditProv').value,
            mesPago: document.getElementById('mEditMes').value,
            fechaPago: document.getElementById('mEditFecha').value,
            formaPagoId: document.getElementById('mEditForma').value,
            monto: parseFloat(document.getElementById('mEditMonto').value),
            observacion: document.getElementById('mEditObs').value
        };
        if (!data.mesPago) return showToast('Mes que se paga es obligatorio', 'error');
        if (!data.fechaPago) return showToast('Fecha es obligatoria', 'error');
        if (!data.monto || data.monto <= 0) return showToast('Monto inválido', 'error');

        const btn = document.getElementById('btnUpdatePago');
        btn.disabled = true;
        try {
            await api.put(`/supplier-payments/pagos/${pago.id}`, data);
            showToast('Pago actualizado');
            closeModal(overlay);
            renderPagos();
        } catch (err) {
            showToast(err.message, 'error');
            btn.disabled = false;
        }
    };
}

// ============================================
// ============================================
// Tab 3: Reporte comparativo mensual
// ============================================
async function renderReporte() {
    const area = document.getElementById('spContent');
    await refreshCaches();

    const hoy = new Date();
    const currentYearMonth = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
    const hace6 = new Date(hoy.getFullYear(), hoy.getMonth() - 5, 1);
    const hace6YearMonth = `${hace6.getFullYear()}-${String(hace6.getMonth() + 1).padStart(2, '0')}`;
    const desdeDefault = `${hace6.getFullYear()}-${String(hace6.getMonth() + 1).padStart(2, '0')}-01`;

    area.innerHTML = `
    <div class="fade-in" style="margin-top:1rem">
      <div class="report-filters" style="align-items:flex-end">
        <div class="form-group" style="min-width:160px">
          <label>Tipo de Período</label>
          <select class="form-control" id="rpPeriodType">
            <option value="single-month" selected>Por Mes (Mes único)</option>
            <option value="month-range">Rango de Meses</option>
            <option value="date-range">Rango de Fechas (Días)</option>
          </select>
        </div>

        <!-- Single Month Inputs -->
        <div class="form-group period-input-group" id="groupSingleMonth" style="min-width:180px">
          <label>Mes</label>
          <div style="display:flex;gap:0.35rem">
            <input type="month" class="form-control" id="rpSingleMonth" value="${currentYearMonth}" />
          </div>
        </div>

        <!-- Month Range Inputs -->
        <div class="form-group period-input-group" id="groupMonthFrom" style="display:none;min-width:150px">
          <label>Mes Desde</label>
          <input type="month" class="form-control" id="rpMonthFrom" value="${hace6YearMonth}" />
        </div>
        <div class="form-group period-input-group" id="groupMonthTo" style="display:none;min-width:150px">
          <label>Mes Hasta</label>
          <input type="month" class="form-control" id="rpMonthTo" value="${currentYearMonth}" />
        </div>

        <!-- Date Range Inputs -->
        <div class="form-group period-input-group" id="groupDateFrom" style="display:none;min-width:140px">
          <label>Desde</label>
          <input type="date" class="form-control" id="rpDesde" value="${desdeDefault}" />
        </div>
        <div class="form-group period-input-group" id="groupDateTo" style="display:none;min-width:140px">
          <label>Hasta</label>
          <input type="date" class="form-control" id="rpHasta" value="${todayStr()}" />
        </div>

        <div class="form-group">
          <label>Proveedor</label>
          <select class="form-control" id="rpProv">
            <option value="">Todos</option>
            ${cachedProveedores.map(p => `<option value="${p.id}">${escapeHTML(p.nombre)}${!p.activo ? ' (Inactivo)' : ''}</option>`).join('')}
          </select>
        </div>

        <div class="form-group">
          <label>Forma de Pago</label>
          <select class="form-control" id="rpForma">
            <option value="">Todas</option>
            ${cachedFormasPago.map(f => `<option value="${f.id}">${escapeHTML(f.nombre)}</option>`).join('')}
          </select>
        </div>

        <button class="btn btn-primary" id="rpApply" style="white-space:nowrap"><i data-lucide="filter"></i>Consultar</button>
        <button class="btn btn-secondary" id="rpExport" style="white-space:nowrap"><i data-lucide="download"></i>Exportar Excel</button>
      </div>

      <div id="rpKpis" class="kpi-grid" style="margin-bottom:1rem"></div>
      <div id="rpTable"></div>
    </div>`;
    if (window.lucide) lucide.createIcons();

    // Toggle input visibility based on period type
    const periodSelect = document.getElementById('rpPeriodType');
    function updatePeriodInputs() {
        const type = periodSelect.value;
        document.getElementById('groupSingleMonth').style.display = type === 'single-month' ? 'block' : 'none';
        document.getElementById('groupMonthFrom').style.display = type === 'month-range' ? 'block' : 'none';
        document.getElementById('groupMonthTo').style.display = type === 'month-range' ? 'block' : 'none';
        document.getElementById('groupDateFrom').style.display = type === 'date-range' ? 'block' : 'none';
        document.getElementById('groupDateTo').style.display = type === 'date-range' ? 'block' : 'none';
    }
    periodSelect.addEventListener('change', updatePeriodInputs);

    async function loadReport() {
        const periodType = periodSelect.value;
        const proveedorId = document.getElementById('rpProv').value;
        const formaPagoId = document.getElementById('rpForma').value;

        let desde = '';
        let hasta = '';
        let isSingleMonth = false;
        let singleMonthLabel = '';

        if (periodType === 'single-month') {
            const singleMonth = document.getElementById('rpSingleMonth').value;
            if (!singleMonth) return showToast('Seleccione un mes', 'error');
            isSingleMonth = true;
            const [y, m] = singleMonth.split('-').map(Number);
            const start = new Date(y, m - 1, 1);
            const end = new Date(y, m, 0); // last day of month
            desde = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01`;
            hasta = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;

            const monthDate = new Date(y, m - 1, 1);
            singleMonthLabel = monthDate.toLocaleDateString('es-PY', { month: 'long', year: 'numeric' });
        } else if (periodType === 'month-range') {
            const mFrom = document.getElementById('rpMonthFrom').value;
            const mTo = document.getElementById('rpMonthTo').value;
            if (!mFrom || !mTo) return showToast('Seleccione los meses del rango', 'error');
            const [y1, mo1] = mFrom.split('-').map(Number);
            const [y2, mo2] = mTo.split('-').map(Number);
            const start = new Date(y1, mo1 - 1, 1);
            const end = new Date(y2, mo2, 0);
            desde = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01`;
            hasta = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
        } else {
            desde = document.getElementById('rpDesde').value;
            hasta = document.getElementById('rpHasta').value;
            if (!desde || !hasta) return showToast('Seleccione rango de fechas', 'error');
        }

        const rpTable = document.getElementById('rpTable');
        rpTable.innerHTML = '<div class="empty-state"><p>Cargando reporte...</p></div>';

        try {
            let url = `/supplier-payments/reporte?desde=${desde}&hasta=${hasta}`;
            if (proveedorId) url += `&proveedorId=${proveedorId}`;
            if (formaPagoId) url += `&formaPagoId=${formaPagoId}`;

            const result = await api.get(url);
            renderReportTable(result, { isSingleMonth, singleMonthLabel, desde, hasta });
        } catch (err) {
            rpTable.innerHTML = `<div class="empty-state"><p>Error: ${err.message}</p></div>`;
        }
    }

    document.getElementById('rpApply').addEventListener('click', loadReport);
    document.getElementById('rpExport').addEventListener('click', () => exportReport());

    loadReport();
}

let lastReportData = null;
let lastReportMeta = null;

function renderReportTable(result, meta = {}) {
    lastReportData = result;
    lastReportMeta = meta;
    const { meses, data } = result;
    const kpisEl = document.getElementById('rpKpis');
    const tableEl = document.getElementById('rpTable');

    if (data.length === 0) {
        kpisEl.innerHTML = '';
        tableEl.innerHTML = '<div class="empty-state" style="padding:3rem"><i data-lucide="file-x"></i><h3>Sin datos</h3><p>No se encontraron pagos a proveedores en el período seleccionado.</p></div>';
        if (window.lucide) lucide.createIcons();
        return;
    }

    // KPIs
    const totalGeneral = data.reduce((s, r) => s + r.total, 0);
    const totalProveedores = data.length;
    const promedioMensual = meses.length > 0 ? totalGeneral / meses.length : 0;
    const mayorPago = data.reduce((a, b) => a.total > b.total ? a : b, { total: 0, proveedor: '—' });

    kpisEl.innerHTML = `
      <div class="card kpi-card">
        <div class="kpi-label">Total Pagado</div>
        <div class="kpi-value">${formatCurrency(totalGeneral)}</div>
        <div class="kpi-sub">${meta.isSingleMonth ? (meta.singleMonthLabel || meses[0]) : `${meses.length} mes(es)`}</div>
      </div>
      <div class="card kpi-card">
        <div class="kpi-label">Proveedores Pagados</div>
        <div class="kpi-value">${totalProveedores}</div>
        <div class="kpi-sub">${data.filter(d => d.total > 0).length} con movimiento</div>
      </div>
      <div class="card kpi-card">
        <div class="kpi-label">${meta.isSingleMonth ? 'Promedio por Proveedor' : 'Promedio Mensual'}</div>
        <div class="kpi-value">${formatCurrency(meta.isSingleMonth ? (totalProveedores ? totalGeneral / totalProveedores : 0) : promedioMensual)}</div>
      </div>
      <div class="card kpi-card">
        <div class="kpi-label">Mayor Proveedor</div>
        <div class="kpi-value">${formatCurrency(mayorPago.total)}</div>
        <div class="kpi-sub" style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin:0 auto">${escapeHTML(mayorPago.proveedor)}</div>
      </div>
    `;

    // Month headers
    const monthLabels = meses.map(m => {
        const [y, mo] = m.split('-');
        const date = new Date(parseInt(y), parseInt(mo) - 1);
        return date.toLocaleDateString('es-PY', { month: 'short', year: '2-digit' }).toUpperCase();
    });

    const totalsPorMes = meses.map(m => data.reduce((s, r) => s + (r.meses[m] || 0), 0));

    tableEl.innerHTML = `
    <div class="table-container sp-report-table-wrap">
      <table class="sp-report-table">
        <thead>
          <tr>
            <th class="sp-sticky-col">Proveedor</th>
            ${meses.map((m, i) => `<th class="sp-month-col">${monthLabels[i]}</th>`).join('')}
            ${meta.isSingleMonth ? '<th style="text-align:right">% Participación</th>' : ''}
            <th class="sp-total-col">Total Pagado</th>
          </tr>
        </thead>
        <tbody>
          ${data.map(row => {
              const cells = meses.map((m, i) => {
                  const val = row.meses[m] || 0;
                  let variacion = '';
                  if (i > 0) {
                      const prev = row.meses[meses[i - 1]] || 0;
                      if (prev > 0) {
                          const pct = ((val - prev) / prev * 100).toFixed(1);
                          const cls = parseFloat(pct) > 0 ? 'sp-var-up' : parseFloat(pct) < 0 ? 'sp-var-down' : 'sp-var-neutral';
                          const arrow = parseFloat(pct) > 0 ? '↑' : parseFloat(pct) < 0 ? '↓' : '→';
                          variacion = `<span class="${cls}">${arrow}${Math.abs(parseFloat(pct))}%</span>`;
                      } else if (val > 0) {
                          variacion = '<span class="sp-var-up">↑ nuevo</span>';
                      }
                  }
                  return `<td class="sp-month-col"><div class="sp-cell-val">${val > 0 ? formatCurrency(val) : '<span style="color:var(--text-muted)">—</span>'}</div>${variacion ? `<div class="sp-cell-var">${variacion}</div>` : ''}</td>`;
              }).join('');

              const participacion = meta.isSingleMonth && totalGeneral > 0
                  ? `<td style="text-align:right;color:var(--text-secondary);font-size:.82rem;font-variant-numeric:tabular-nums">${((row.total / totalGeneral) * 100).toFixed(1)}%</td>`
                  : '';

              return `<tr>
                <td class="sp-sticky-col"><strong>${escapeHTML(row.proveedor)}</strong></td>
                ${cells}
                ${participacion}
                <td class="sp-total-col"><strong>${formatCurrency(row.total)}</strong></td>
              </tr>`;
          }).join('')}
        </tbody>
        <tfoot>
          <tr class="sp-totals-row">
            <td class="sp-sticky-col"><strong>TOTAL</strong></td>
            ${totalsPorMes.map(t => `<td class="sp-month-col"><strong>${formatCurrency(t)}</strong></td>`).join('')}
            ${meta.isSingleMonth ? '<td style="text-align:right;font-weight:700">100.0%</td>' : ''}
            <td class="sp-total-col"><strong>${formatCurrency(totalGeneral)}</strong></td>
          </tr>
        </tfoot>
      </table>
    </div>`;
    if (window.lucide) lucide.createIcons();
}

function exportReport() {
    if (!lastReportData || !lastReportData.data.length) return showToast('No hay datos para exportar', 'error');
    const { meses, data } = lastReportData;
    const meta = lastReportMeta || {};

    const monthLabels = meses.map(m => {
        const [y, mo] = m.split('-');
        const date = new Date(parseInt(y), parseInt(mo) - 1);
        return date.toLocaleDateString('es-PY', { month: 'long', year: 'numeric' });
    });

    const totalGeneral = data.reduce((s, r) => s + r.total, 0);

    let headers = [];
    let rows = [];

    if (meta.isSingleMonth) {
        headers = ['Proveedor', `Monto Pagado (${monthLabels[0] || 'Mes'})`, '% Participación', 'Total'];
        rows = data.map(row => [
            row.proveedor,
            row.total,
            totalGeneral > 0 ? `${((row.total / totalGeneral) * 100).toFixed(1)}%` : '0%',
            row.total
        ]);
        rows.push(['TOTAL', totalGeneral, '100.0%', totalGeneral]);
    } else {
        headers = ['Proveedor', ...monthLabels, 'Total Pagado'];
        rows = data.map(row => [
            row.proveedor,
            ...meses.map(m => row.meses[m] || 0),
            row.total
        ]);
        const totalRow = ['TOTAL', ...meses.map(m => data.reduce((s, r) => s + (r.meses[m] || 0), 0)), totalGeneral];
        rows.push(totalRow);
    }

    let filename = 'Reporte_Pagos_Proveedores.xlsx';
    if (meta.isSingleMonth && meses[0]) {
        const [y, mo] = meses[0].split('-');
        const date = new Date(parseInt(y), parseInt(mo) - 1, 1);
        const monthName = date.toLocaleDateString('es-PY', { month: 'long' });
        const cleanMonthName = monthName.charAt(0).toUpperCase() + monthName.slice(1);
        filename = `Reporte_Pagos_Proveedores_${cleanMonthName}_${y}.xlsx`;
    } else if (meses.length > 1) {
        filename = `Reporte_Pagos_Proveedores_${meses[0]}_a_${meses[meses.length - 1]}.xlsx`;
    } else {
        filename = `Reporte_Pagos_Proveedores_${todayStr()}.xlsx`;
    }

    exportExcel(headers, rows, filename, 'Pagos Proveedores');
    showToast('Reporte exportado exitosamente a Excel');
}

// ============================================
// Helpers
// ============================================
async function refreshCaches() {
    try {
        [cachedProveedores, cachedFormasPago] = await Promise.all([
            api.get('/supplier-payments/proveedores'),
            api.get('/supplier-payments/formas-pago')
        ]);
    } catch (e) { /* keep previous cache */ }
}
