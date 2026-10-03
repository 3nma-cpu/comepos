// ============================================
// Deudas Module — Deudas de Funcionarios
// Tabs: Motivos | Cargar Deuda | Deudores | Planilla
// ============================================

import { api } from '../api.js';
import { showToast, createModal, closeModal, escapeHTML, formatCurrency, formatDate, todayStr, exportExcel, debounce } from '../utils.js';
import { navigate } from '../router.js';

let currentTab = 'deudores';
let cachedMotivos = [];

// ============================================
// Formateo
// ============================================
function fmtGs(n) {
  return 'Gs. ' + Math.round(Number(n)).toLocaleString('es-PY');
}

function fmtGsPlain(n) {
  return Math.round(Number(n)).toLocaleString('es-PY');
}

function estadoBadge(estado) {
  const map = {
    ACTIVA: '<span class="badge badge-success">ACTIVA</span>',
    SALDADA: '<span class="badge badge-primary">SALDADA</span>',
    ANULADA: '<span class="badge badge-danger">ANULADA</span>'
  };
  return map[estado] || estado;
}

// ============================================
// Main render
// ============================================
export async function renderDeudas(subRoute) {
  const container = document.getElementById('module-content');

  // Si viene con subruta /deudas/funcionario/<id>
  if (subRoute && subRoute.startsWith('funcionario/')) {
    const funcId = subRoute.replace('funcionario/', '');
    await renderFichaFuncionario(funcId);
    return;
  }

  container.innerHTML = `
    <div class="fade-in">
      <div class="sp-tabs" id="deudaTabs">
        <button class="sp-tab${currentTab === 'deudores' ? ' active' : ''}" data-tab="deudores"><i data-lucide="users"></i>Deudores</button>
        <button class="sp-tab${currentTab === 'cargar' ? ' active' : ''}" data-tab="cargar"><i data-lucide="plus-circle"></i>Cargar Deuda</button>
        <button class="sp-tab${currentTab === 'planilla' ? ' active' : ''}" data-tab="planilla"><i data-lucide="calendar-check"></i>Planilla</button>
        <button class="sp-tab${currentTab === 'motivos' ? ' active' : ''}" data-tab="motivos"><i data-lucide="settings"></i>Motivos</button>
      </div>
      <div id="deudaContent"></div>
    </div>`;
  if (window.lucide) lucide.createIcons();

  // Preload motivos
  try {
    cachedMotivos = await api.get('/deudas/motivos');
  } catch { cachedMotivos = []; }

  document.getElementById('deudaTabs').addEventListener('click', e => {
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
    case 'motivos': renderMotivos(); break;
    case 'cargar': renderCargarDeuda(); break;
    case 'deudores': renderDeudores(); break;
    case 'planilla': renderPlanilla(); break;
  }
}

// ============================================
// Tab: Motivos de Deuda
// ============================================
async function renderMotivos() {
  const area = document.getElementById('deudaContent');
  try {
    cachedMotivos = await api.get('/deudas/motivos');
    area.innerHTML = `
    <div class="fade-in" style="margin-top:1rem">
      <div class="filters-bar">
        <div class="search-bar">
          <i data-lucide="search"></i>
          <input type="text" class="form-control" id="motivoSearch" placeholder="Buscar motivo..." />
        </div>
        <button class="btn btn-primary" id="btnAddMotivo"><i data-lucide="plus"></i>Nuevo Motivo</button>
      </div>
      <div class="table-container">
        <table>
          <thead><tr><th>Nombre</th><th>% Ganancia / Interés</th><th>Estado</th><th>Deudas</th><th>Acciones</th></tr></thead>
          <tbody id="motivoTableBody"></tbody>
        </table>
      </div>
    </div>`;
    if (window.lucide) lucide.createIcons();

    function applyFilter() {
      const q = document.getElementById('motivoSearch').value.toLowerCase();
      const filtered = cachedMotivos.filter(m => m.nombre.toLowerCase().includes(q));
      renderMotivoTable(filtered);
    }

    document.getElementById('motivoSearch').addEventListener('input', debounce(applyFilter));
    document.getElementById('btnAddMotivo').addEventListener('click', () => showMotivoModal());
    applyFilter();
  } catch (err) {
    area.innerHTML = `<div class="empty-state"><p>Error al cargar motivos</p></div>`;
  }
}

function renderMotivoTable(motivos) {
  const tbody = document.getElementById('motivoTableBody');
  if (!motivos.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:2rem">No se encontraron motivos</td></tr>`;
    return;
  }
  tbody.innerHTML = motivos.map(m => `
    <tr>
      <td><strong>${escapeHTML(m.nombre)}</strong></td>
      <td>
        <span class="badge ${m.porcentajeInteres > 0 ? 'badge-success' : 'badge-primary'}" style="font-weight:600">
          ${m.porcentajeInteres ?? 0}%
        </span>
      </td>
      <td>${m.activo ? '<span class="badge badge-success">Activo</span>' : '<span class="badge badge-danger">Inactivo</span>'}</td>
      <td>${m._count?.deudas || 0}</td>
      <td>
        <div style="display:flex;gap:.25rem">
          <button class="btn btn-ghost btn-sm" data-edit="${m.id}" title="Editar"><i data-lucide="pencil"></i></button>
          <button class="btn btn-ghost btn-sm" data-toggle="${m.id}" title="${m.activo ? 'Desactivar' : 'Activar'}">
            <i data-lucide="${m.activo ? 'toggle-right' : 'toggle-left'}"></i>
          </button>
        </div>
      </td>
    </tr>`).join('');
  if (window.lucide) lucide.createIcons();

  tbody.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => {
      const m = cachedMotivos.find(x => x.id === btn.dataset.edit);
      if (m) showMotivoModal(m);
    });
  });

  tbody.querySelectorAll('[data-toggle]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const m = cachedMotivos.find(x => x.id === btn.dataset.toggle);
      if (!m) return;
      try {
        await api.put(`/deudas/motivos/${m.id}`, { activo: !m.activo });
        showToast(`Motivo ${m.activo ? 'desactivado' : 'activado'}`);
        renderMotivos();
      } catch (err) {
        showToast(err.message || 'Error', 'error');
      }
    });
  });
}

function showMotivoModal(motivo = null) {
  const isEdit = !!motivo;
  const overlay = createModal(
    isEdit ? 'Editar Motivo' : 'Nuevo Motivo',
    `<div class="form-group" style="margin-bottom:1rem">
       <label for="motivoNombre">Nombre del motivo *</label>
       <input type="text" class="form-control" id="motivoNombre" value="${isEdit ? escapeHTML(motivo.nombre) : ''}" placeholder="Ej: Electrodomésticos / Préstamos / Uniformes" maxlength="100" />
     </div>
     <div class="form-group">
       <label for="motivoPorcentaje">Porcentaje de Ganancia / Interés (%) *</label>
       <div style="position:relative">
         <input type="number" class="form-control" id="motivoPorcentaje" value="${isEdit ? (motivo.porcentajeInteres ?? 0) : 0}" min="0" max="500" step="0.5" placeholder="Ej: 50" />
         <span style="position:absolute;right:12px;top:50%;transform:translateY(-50%);color:var(--text-muted);font-weight:600">%</span>
       </div>
       <small style="color:var(--text-muted);font-size:.8rem;display:block;margin-top:.35rem">
         Porcentaje que se calculará automáticamente al crear préstamos (ej: 50% préstamos, 40% electrodomésticos, 0% uniformes).
       </small>
     </div>`,
    `<button class="btn btn-secondary modal-close">Cancelar</button>
     <button class="btn btn-primary" id="btnSaveMotivo"><i data-lucide="save"></i>${isEdit ? 'Guardar' : 'Crear'}</button>`
  );

  document.getElementById('btnSaveMotivo').addEventListener('click', async () => {
    const nombre = document.getElementById('motivoNombre').value.trim();
    const porcentajeInteres = parseFloat(document.getElementById('motivoPorcentaje').value) || 0;
    if (!nombre) return showToast('Nombre es obligatorio', 'error');
    if (porcentajeInteres < 0) return showToast('El porcentaje no puede ser negativo', 'error');
    try {
      if (isEdit) {
        await api.put(`/deudas/motivos/${motivo.id}`, { nombre, porcentajeInteres });
      } else {
        await api.post('/deudas/motivos', { nombre, porcentajeInteres });
      }
      showToast(isEdit ? 'Motivo actualizado' : 'Motivo creado');
      closeModal(overlay);
      renderMotivos();
    } catch (err) {
      showToast(err.message || 'Error', 'error');
    }
  });
}

// ============================================
// Tab: Cargar Deuda
// ============================================
async function renderCargarDeuda() {
  const area = document.getElementById('deudaContent');
  const motivosActivos = cachedMotivos.filter(m => m.activo);

  area.innerHTML = `
  <div class="fade-in" style="margin-top:1rem;max-width:760px">
    <div class="card" style="padding:1.5rem">
      <h3 style="margin-bottom:1rem;display:flex;align-items:center;gap:.5rem"><i data-lucide="file-plus"></i>Cargar nuevo préstamo / deuda</h3>

      <div class="form-group">
        <label>Funcionario *</label>
        <div style="position:relative">
          <input type="text" class="form-control" id="deudaFuncSearch" placeholder="Buscar por CI o nombre..." autocomplete="off" />
          <div id="deudaFuncResults" class="deuda-search-results" style="display:none"></div>
        </div>
        <div id="deudaFuncSelected" style="display:none" class="deuda-selected-func"></div>
        <input type="hidden" id="deudaFuncId" />
      </div>

      <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
        <div class="form-group">
          <label>Motivo del Préstamo / Deuda *</label>
          <div style="display:flex;gap:.5rem">
            <select class="form-control" id="deudaMotivo" style="flex:1">
              <option value="">Seleccionar...</option>
              ${motivosActivos.map(m => `<option value="${m.id}" data-pct="${m.porcentajeInteres ?? 0}">${escapeHTML(m.nombre)} (${m.porcentajeInteres ?? 0}%)</option>`).join('')}
            </select>
            <button class="btn btn-ghost btn-icon" id="btnNuevoMotivoInline" title="Crear nuevo motivo"><i data-lucide="plus"></i></button>
          </div>
        </div>
        <div class="form-group">
          <label>Fecha *</label>
          <input type="date" class="form-control" id="deudaFecha" value="${todayStr()}" />
        </div>
      </div>

      <div class="form-group">
        <label>Descripción *</label>
        <input type="text" class="form-control" id="deudaDesc" placeholder="Ej: Préstamo personal / Heladera Philco 320L / Uniforme institucional" maxlength="200" />
      </div>

      <div class="card" style="background:var(--bg-secondary);border:1px solid var(--border);padding:1.15rem;margin-bottom:1.25rem;border-radius:var(--radius)">
        <div style="font-weight:600;font-size:.9rem;margin-bottom:.85rem;display:flex;align-items:center;gap:.5rem">
          <i data-lucide="calculator"></i>Cálculo de Préstamo Bruto y Ganancia / Interés
        </div>

        <div class="form-row" style="display:grid;grid-template-columns:1.5fr 1fr 1.5fr;gap:1rem;align-items:flex-start">
          <div class="form-group">
            <label>Préstamo Bruto / Capital (Gs.) *</label>
            <input type="text" class="form-control" id="deudaMontoBruto" placeholder="1.000.000" />
            <small style="color:var(--text-muted);font-size:.78rem">Capital o valor neto entregado</small>
          </div>
          <div class="form-group">
            <label>% Ganancia / Interés</label>
            <div style="position:relative">
              <input type="number" class="form-control" id="deudaPorcentaje" placeholder="50" min="0" max="500" step="0.5" />
              <span style="position:absolute;right:10px;top:50%;transform:translateY(-50%);color:var(--text-muted);font-weight:600">%</span>
            </div>
            <small style="color:var(--text-muted);font-size:.78rem" id="lblMotivoSug">Sugerido por motivo (modificable)</small>
          </div>
          <div class="form-group">
            <label>Monto Interés / Utilidad (Gs.)</label>
            <input type="text" class="form-control" id="deudaMontoInteres" placeholder="500.000" />
            <small style="color:var(--text-muted);font-size:.78rem">Ganancia calculada (modificable)</small>
          </div>
        </div>

        <div class="deuda-calc-box" style="margin-top:.75rem">
          <div class="calc-stat">
            <span>Capital Bruto</span>
            <strong id="resumenBruto">Gs. 0</strong>
          </div>
          <div style="font-size:1.25rem;color:var(--text-muted);font-weight:600">+</div>
          <div class="calc-stat">
            <span>Utilidad Ganada (<span id="resumenPct">0</span>%)</span>
            <strong id="resumenInteres" style="color:var(--success)">Gs. 0</strong>
          </div>
          <div style="font-size:1.25rem;color:var(--text-muted);font-weight:600">=</div>
          <div class="calc-stat total">
            <span>Total Deuda a Cobrar</span>
            <strong id="resumenTotal" style="color:var(--primary)">Gs. 0</strong>
          </div>
        </div>
      </div>

      <div style="border-top:1px solid var(--border);padding-top:1rem;margin-top:.5rem">
        <h4 style="margin-bottom:.75rem;display:flex;align-items:center;gap:.5rem;font-size:.92rem"><i data-lucide="calendar-range"></i>Plan de Descuento (opcional)</h4>
        <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem">
          <div class="form-group">
            <label>Monto por descuento (Gs.)</label>
            <input type="text" class="form-control" id="planMonto" placeholder="150.000" />
          </div>
          <div class="form-group">
            <label>Frecuencia</label>
            <select class="form-control" id="planFrecuencia">
              <option value="">Seleccionar...</option>
              <option value="SEMANAL">Semanal</option>
              <option value="QUINCENAL">Quincenal</option>
            </select>
          </div>
          <div class="form-group">
            <label>Fecha inicio</label>
            <input type="date" class="form-control" id="planFechaInicio" value="${todayStr()}" />
          </div>
        </div>
        <div id="planEstimacion" style="display:none" class="deuda-plan-preview"></div>
      </div>

      <div style="margin-top:1.25rem;display:flex;justify-content:flex-end;gap:.5rem">
        <button class="btn btn-primary btn-lg" id="btnGuardarDeuda"><i data-lucide="save"></i>Guardar Préstamo</button>
      </div>
    </div>
  </div>`;
  if (window.lucide) lucide.createIcons();

  // === Búsqueda de funcionario ===
  const searchInput = document.getElementById('deudaFuncSearch');
  const resultsDiv = document.getElementById('deudaFuncResults');
  let searchTimeout;

  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    const q = searchInput.value.trim();
    if (q.length < 2) { resultsDiv.style.display = 'none'; return; }
    searchTimeout = setTimeout(async () => {
      try {
        const results = await api.get(`/deudas/buscar-funcionarios?q=${encodeURIComponent(q)}`);
        if (!results.length) {
          resultsDiv.innerHTML = `<div class="deuda-search-item" style="color:var(--text-muted)">No se encontraron resultados</div>`;
        } else {
          resultsDiv.innerHTML = results.map(f => `
            <div class="deuda-search-item" data-id="${f.id}" data-name="${escapeHTML(f.name)}" data-cedula="${escapeHTML(f.cedula)}" data-dept="${escapeHTML(f.department || '')}" data-cat="${escapeHTML(f.category || 'ADM')}">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <div>
                  <strong>${escapeHTML(f.name)}</strong>
                  <span style="color:var(--text-muted);font-size:.82rem;margin-left:.5rem">CI: ${escapeHTML(f.cedula)}${f.department ? ` — ${escapeHTML(f.department)}` : ''}</span>
                </div>
                <span class="badge ${f.category === 'CHOFER' ? 'badge-warning' : 'badge-primary'}">${escapeHTML(f.category || 'GENERAL')}</span>
              </div>
            </div>`).join('');
        }
        resultsDiv.style.display = 'block';
      } catch { resultsDiv.style.display = 'none'; }
    }, 300);
  });

  resultsDiv.addEventListener('click', e => {
    const item = e.target.closest('.deuda-search-item');
    if (!item || !item.dataset.id) return;
    document.getElementById('deudaFuncId').value = item.dataset.id;
    searchInput.style.display = 'none';
    resultsDiv.style.display = 'none';
    const selectedDiv = document.getElementById('deudaFuncSelected');
    selectedDiv.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div>
          <strong>${item.dataset.name}</strong>
          <span class="badge ${item.dataset.cat === 'CHOFER' ? 'badge-warning' : 'badge-primary'}" style="margin-left:.5rem">${item.dataset.cat || 'GENERAL'}</span>
          <span style="color:var(--text-muted);font-size:.82rem;margin-left:.5rem">CI: ${item.dataset.cedula}${item.dataset.dept ? ` — ${item.dataset.dept}` : ''}</span>
        </div>
        <button class="btn btn-ghost btn-sm" id="btnClearFunc"><i data-lucide="x"></i></button>
      </div>`;
    selectedDiv.style.display = 'block';
    if (window.lucide) lucide.createIcons();
    document.getElementById('btnClearFunc').addEventListener('click', () => {
      document.getElementById('deudaFuncId').value = '';
      searchInput.style.display = '';
      searchInput.value = '';
      selectedDiv.style.display = 'none';
      searchInput.focus();
    });
  });

  // Click fuera cierra resultados
  document.addEventListener('click', e => {
    if (!e.target.closest('#deudaFuncSearch') && !e.target.closest('#deudaFuncResults')) {
      resultsDiv.style.display = 'none';
    }
  });

  // === Crear motivo inline ===
  document.getElementById('btnNuevoMotivoInline').addEventListener('click', () => {
    showMotivoModal();
    // Refresh motivos después de cerrar
    const observer = new MutationObserver(async () => {
      if (!document.querySelector('.modal-overlay')) {
        observer.disconnect();
        try {
          cachedMotivos = await api.get('/deudas/motivos');
          const sel = document.getElementById('deudaMotivo');
          if (sel) {
            const currentVal = sel.value;
            sel.innerHTML = `<option value="">Seleccionar...</option>${cachedMotivos.filter(m => m.activo).map(m => `<option value="${m.id}" data-pct="${m.porcentajeInteres ?? 0}">${escapeHTML(m.nombre)} (${m.porcentajeInteres ?? 0}%)</option>`).join('')}`;
            sel.value = currentVal || cachedMotivos[cachedMotivos.length - 1]?.id || '';
            sel.dispatchEvent(new Event('change'));
          }
        } catch { }
      }
    });
    observer.observe(document.body, { childList: true });
  });

  // === Formateo y cálculo dinámico de préstamos / intereses ===
  function parseDigits(val) {
    return parseInt((val || '').replace(/\D/g, '')) || 0;
  }

  function formatMonto(val) {
    return val ? Number(val).toLocaleString('es-PY') : '';
  }

  function updateCalcDisplay(bruto, pct, interes, total) {
    document.getElementById('resumenBruto').textContent = fmtGs(bruto);
    document.getElementById('resumenPct').textContent = pct;
    document.getElementById('resumenInteres').textContent = fmtGs(interes);
    document.getElementById('resumenTotal').textContent = fmtGs(total);
    updateEstimacion();
  }

  function recalcFromBrutoAndPct() {
    const bruto = parseDigits(document.getElementById('deudaMontoBruto').value);
    const pct = parseFloat(document.getElementById('deudaPorcentaje').value) || 0;
    const interes = Math.round(bruto * (pct / 100));
    const total = bruto + interes;
    document.getElementById('deudaMontoInteres').value = interes ? formatMonto(interes) : (bruto > 0 && pct === 0 ? '0' : '');
    updateCalcDisplay(bruto, pct, interes, total);
  }

  function recalcFromInteresManual() {
    const bruto = parseDigits(document.getElementById('deudaMontoBruto').value);
    const interes = parseDigits(document.getElementById('deudaMontoInteres').value);
    const pct = bruto > 0 ? Number(((interes / bruto) * 100).toFixed(1)) : 0;
    document.getElementById('deudaPorcentaje').value = pct;
    const total = bruto + interes;
    updateCalcDisplay(bruto, pct, interes, total);
  }

  // Eventos de inputs
  const inputBruto = document.getElementById('deudaMontoBruto');
  inputBruto.addEventListener('input', () => {
    const raw = parseDigits(inputBruto.value);
    inputBruto.value = formatMonto(raw);
    recalcFromBrutoAndPct();
  });

  const inputPct = document.getElementById('deudaPorcentaje');
  inputPct.addEventListener('input', recalcFromBrutoAndPct);

  const inputInteres = document.getElementById('deudaMontoInteres');
  inputInteres.addEventListener('input', () => {
    const raw = parseDigits(inputInteres.value);
    inputInteres.value = formatMonto(raw);
    recalcFromInteresManual();
  });

  // Cambio de motivo aplica automáticamente el porcentaje configurado
  document.getElementById('deudaMotivo').addEventListener('change', () => {
    const sel = document.getElementById('deudaMotivo');
    const opt = sel.options[sel.selectedIndex];
    if (opt && opt.value) {
      const pct = parseFloat(opt.dataset.pct) || 0;
      document.getElementById('deudaPorcentaje').value = pct;
      document.getElementById('lblMotivoSug').textContent = `Sugerido por motivo: ${pct}% (modificable)`;
      recalcFromBrutoAndPct();
    }
  });

  // Formato miles para plan
  const planInput = document.getElementById('planMonto');
  planInput.addEventListener('input', () => {
    const raw = parseDigits(planInput.value);
    planInput.value = formatMonto(raw);
  });

  // === Estimación del plan ===
  function updateEstimacion() {
    const bruto = parseDigits(document.getElementById('deudaMontoBruto').value);
    const interes = parseDigits(document.getElementById('deudaMontoInteres').value);
    const totalDeuda = bruto + interes;

    const montoPlan = parseDigits(document.getElementById('planMonto').value);
    const frecuencia = document.getElementById('planFrecuencia').value;
    const fechaInicio = document.getElementById('planFechaInicio').value;
    const preview = document.getElementById('planEstimacion');

    if (!totalDeuda || !montoPlan || !frecuencia || !fechaInicio) {
      preview.style.display = 'none';
      return;
    }

    const cuotas = Math.ceil(totalDeuda / montoPlan);
    const diasPorPeriodo = frecuencia === 'SEMANAL' ? 7 : 15;
    const fechaFin = new Date(fechaInicio);
    fechaFin.setDate(fechaFin.getDate() + (cuotas * diasPorPeriodo));

    preview.innerHTML = `
      <div style="display:flex;gap:1.5rem;flex-wrap:wrap">
        <div><span style="color:var(--text-muted);font-size:.8rem">Cuotas estimadas</span><br/><strong>${cuotas}</strong></div>
        <div><span style="color:var(--text-muted);font-size:.8rem">Fecha est. cancelación</span><br/><strong>${fechaFin.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' })}</strong></div>
        <div><span style="color:var(--text-muted);font-size:.8rem">Última cuota</span><br/><strong>${fmtGs(totalDeuda % montoPlan === 0 ? montoPlan : totalDeuda % montoPlan)}</strong></div>
      </div>`;
    preview.style.display = 'block';
  }

  ['planMonto', 'planFrecuencia', 'planFechaInicio'].forEach(id => {
    document.getElementById(id).addEventListener('input', updateEstimacion);
    document.getElementById(id).addEventListener('change', updateEstimacion);
  });

  // === Guardar préstamo / deuda ===
  document.getElementById('btnGuardarDeuda').addEventListener('click', async () => {
    const funcionarioId = document.getElementById('deudaFuncId').value;
    const motivoId = document.getElementById('deudaMotivo').value;
    const descripcion = document.getElementById('deudaDesc').value.trim();
    const fecha = document.getElementById('deudaFecha').value;
    const montoBruto = parseDigits(document.getElementById('deudaMontoBruto').value);
    const porcentajeInteres = parseFloat(document.getElementById('deudaPorcentaje').value) || 0;
    const montoInteres = parseDigits(document.getElementById('deudaMontoInteres').value);
    const montoOriginal = montoBruto + montoInteres;

    if (!funcionarioId) return showToast('Seleccione un funcionario', 'error');
    if (!motivoId) return showToast('Seleccione un motivo', 'error');
    if (!descripcion) return showToast('Ingrese una descripción', 'error');
    if (!fecha) return showToast('Ingrese la fecha', 'error');
    if (montoBruto <= 0) return showToast('Ingrese un monto bruto válido', 'error');

    const body = {
      funcionarioId,
      motivoId,
      descripcion,
      fecha,
      montoBruto,
      porcentajeInteres,
      montoInteres,
      montoOriginal
    };

    // Plan opcional
    const planMonto = parseDigits(document.getElementById('planMonto').value);
    const planFrec = document.getElementById('planFrecuencia').value;
    const planFecha = document.getElementById('planFechaInicio').value;
    if (planMonto > 0 && planFrec && planFecha) {
      body.plan = { montoPorDescuento: planMonto, frecuencia: planFrec, fechaInicio: planFecha };
    }

    try {
      const btn = document.getElementById('btnGuardarDeuda');
      btn.disabled = true;
      btn.innerHTML = '<i data-lucide="loader"></i>Guardando...';
      if (window.lucide) lucide.createIcons();

      await api.post('/deudas', body);
      showToast('Préstamo registrado correctamente');

      // Ir a la ficha del funcionario
      navigate(`deudas/funcionario/${funcionarioId}`);
    } catch (err) {
      showToast(err.message || 'Error al guardar', 'error');
      const btn = document.getElementById('btnGuardarDeuda');
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="save"></i>Guardar Préstamo';
      if (window.lucide) lucide.createIcons();
    }
  });
}

// ============================================
// Tab: Deudores (Listado general)
// ============================================
async function renderDeudores() {
  const area = document.getElementById('deudaContent');
  area.innerHTML = `
  <div class="fade-in" style="margin-top:1rem">
    <div class="filters-bar" style="flex-wrap:wrap;gap:.75rem">
      <div class="search-bar" style="flex:1;min-width:200px">
        <i data-lucide="search"></i>
        <input type="text" class="form-control" id="deudoresSearch" placeholder="Buscar por CI o nombre..." />
      </div>
      <select class="form-control" id="deudoresCategoria" style="width:auto;min-width:130px">
        <option value="">Todas las categorías</option>
        <option value="CHOFER">CHOFER</option>
        <option value="ADM">ADM</option>
      </select>
      <select class="form-control" id="deudoresEstado" style="width:auto;min-width:140px">
        <option value="">Todos los estados</option>
        <option value="ACTIVA" selected>Activas</option>
        <option value="SALDADA">Saldadas</option>
        <option value="ANULADA">Anuladas</option>
      </select>
      <select class="form-control" id="deudoresMotivo" style="width:auto;min-width:140px">
        <option value="">Todos los motivos</option>
        ${cachedMotivos.map(m => `<option value="${m.id}">${escapeHTML(m.nombre)}</option>`).join('')}
      </select>
      <button class="btn btn-secondary" id="btnExportDeudas"><i data-lucide="download"></i>Excel</button>
    </div>
    <div id="deudoresTotals" class="deuda-totals-bar"></div>
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Funcionario</th>
            <th>Cat</th>
            <th>CI</th>
            <th>Motivo</th>
            <th>Descripción</th>
            <th>Fecha</th>
            <th style="text-align:right">Préstamo Bruto</th>
            <th style="text-align:right">Ganancia / Utilidad</th>
            <th style="text-align:right">Total Deuda</th>
            <th style="text-align:right">Descontado</th>
            <th style="text-align:right">Saldo</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody id="deudoresTableBody"></tbody>
      </table>
    </div>
  </div>`;
  if (window.lucide) lucide.createIcons();

  let allDeudas = [];

  async function loadDeudores() {
    const search = document.getElementById('deudoresSearch').value.trim();
    const categoria = document.getElementById('deudoresCategoria').value;
    const estado = document.getElementById('deudoresEstado').value;
    const motivoId = document.getElementById('deudoresMotivo').value;

    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (categoria) params.set('categoria', categoria);
    if (estado) params.set('estado', estado);
    if (motivoId) params.set('motivoId', motivoId);

    try {
      allDeudas = await api.get(`/deudas/deudores?${params.toString()}`);
      renderDeudoresTable(allDeudas);
    } catch (err) {
      showToast('Error al cargar deudores', 'error');
    }
  }

  function renderDeudoresTable(deudas) {
    const tbody = document.getElementById('deudoresTableBody');
    const totalsDiv = document.getElementById('deudoresTotals');

    if (!deudas.length) {
      tbody.innerHTML = `<tr><td colspan="13" style="text-align:center;color:var(--text-muted);padding:2rem">No se encontraron deudas</td></tr>`;
      totalsDiv.innerHTML = '';
      return;
    }

    // Totales
    const totalBruto = deudas.reduce((s, d) => s + (d.montoBruto ?? d.montoOriginal), 0);
    const totalUtilidad = deudas.reduce((s, d) => s + (d.montoInteres ?? 0), 0);
    const totalMonto = deudas.reduce((s, d) => s + d.montoOriginal, 0);
    const totalDesc = deudas.reduce((s, d) => s + d.totalDescontado, 0);
    const totalSaldo = deudas.filter(d => d.estado !== 'ANULADA').reduce((s, d) => s + d.saldo, 0);

    totalsDiv.innerHTML = `
      <div class="deuda-stat"><span>Total deudas</span><strong>${deudas.length}</strong></div>
      <div class="deuda-stat"><span>Capital Bruto</span><strong>${fmtGs(totalBruto)}</strong></div>
      <div class="deuda-stat"><span>Utilidad Ganada</span><strong style="color:var(--success)">+${fmtGs(totalUtilidad)}</strong></div>
      <div class="deuda-stat"><span>Total a Cobrar</span><strong>${fmtGs(totalMonto)}</strong></div>
      <div class="deuda-stat"><span>Ya Descontado</span><strong style="color:var(--success)">${fmtGs(totalDesc)}</strong></div>
      <div class="deuda-stat"><span>Saldo Pendiente</span><strong style="color:var(--danger)">${fmtGs(totalSaldo)}</strong></div>`;

    tbody.innerHTML = deudas.map(d => {
      const bruto = d.montoBruto ?? d.montoOriginal;
      const interes = d.montoInteres ?? Math.max(0, d.montoOriginal - bruto);
      const pct = d.porcentajeInteres ?? 0;
      const cat = d.funcionario?.category || 'ADM';
      return `
      <tr>
        <td><a href="javascript:void(0)" class="deuda-func-link" data-func="${d.funcionarioId}" style="color:var(--text);font-weight:600">${escapeHTML(d.funcionario?.name || '')}</a></td>
        <td><span class="badge ${cat === 'CHOFER' ? 'badge-warning' : 'badge-primary'}">${cat}</span></td>
        <td>${escapeHTML(d.funcionario?.cedula || '')}</td>
        <td>${escapeHTML(d.motivo?.nombre || '')}</td>
        <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHTML(d.descripcion)}">${escapeHTML(d.descripcion)}</td>
        <td>${formatDate(d.fecha)}</td>
        <td style="text-align:right;font-weight:500">${fmtGsPlain(bruto)}</td>
        <td style="text-align:right">
          <span style="color:var(--success);font-weight:600">+${fmtGsPlain(interes)}</span>
          <small style="color:var(--text-muted);display:block;font-size:.72rem">(${pct}%)</small>
        </td>
        <td style="text-align:right;font-weight:600">${fmtGsPlain(d.montoOriginal)}</td>
        <td style="text-align:right;color:var(--success)">${fmtGsPlain(d.totalDescontado)}</td>
        <td style="text-align:right;font-weight:600;color:${d.saldo > 0 ? 'var(--danger)' : 'var(--success)'}">${fmtGsPlain(d.saldo)}</td>
        <td>${estadoBadge(d.estado)}</td>
        <td>
          <button class="btn btn-ghost btn-sm deuda-func-link" data-func="${d.funcionarioId}" title="Ver ficha"><i data-lucide="eye"></i></button>
        </td>
      </tr>`;
    }).join('');
    if (window.lucide) lucide.createIcons();

    tbody.querySelectorAll('.deuda-func-link').forEach(el => {
      el.addEventListener('click', () => navigate(`deudas/funcionario/${el.dataset.func}`));
    });
  }

  document.getElementById('deudoresSearch').addEventListener('input', debounce(loadDeudores, 400));
  document.getElementById('deudoresCategoria').addEventListener('change', loadDeudores);
  document.getElementById('deudoresEstado').addEventListener('change', loadDeudores);
  document.getElementById('deudoresMotivo').addEventListener('change', loadDeudores);

  document.getElementById('btnExportDeudas').addEventListener('click', () => {
    if (!allDeudas.length) return showToast('No hay datos para exportar', 'info');
    const headers = ['Funcionario', 'Categoría', 'CI', 'Motivo', 'Descripción', 'Fecha', 'Préstamo Bruto', '% Ganancia', 'Utilidad Ganada', 'Total a Cobrar', 'Descontado', 'Saldo', 'Estado'];
    const rows = allDeudas.map(d => {
      const bruto = d.montoBruto ?? d.montoOriginal;
      const interes = d.montoInteres ?? Math.max(0, d.montoOriginal - bruto);
      return [
        d.funcionario?.name, d.funcionario?.category || 'ADM', d.funcionario?.cedula, d.motivo?.nombre, d.descripcion,
        formatDate(d.fecha), bruto, `${d.porcentajeInteres ?? 0}%`, interes, d.montoOriginal, d.totalDescontado, d.saldo, d.estado
      ];
    });
    exportExcel(headers, rows, 'Deudas_Funcionarios.xlsx', 'Deudas');
  });

  loadDeudores();
}

// ============================================
// Tab: Planilla (Reporte General de Deudas)
// ============================================
async function renderPlanilla() {
  const area = document.getElementById('deudaContent');
  area.innerHTML = `
  <div class="fade-in" style="margin-top:1rem">
    <div class="filters-bar" style="flex-wrap:wrap;gap:.75rem">
      <div class="search-bar" style="flex:1;min-width:200px">
        <i data-lucide="search"></i>
        <input type="text" class="form-control" id="planillaSearch" placeholder="Buscar funcionario por CI o nombre..." />
      </div>
      <select class="form-control" id="planillaCategoria" style="width:auto;min-width:130px">
        <option value="">Todas las categorías</option>
        <option value="CHOFER">CHOFER</option>
        <option value="ADM">ADM</option>
      </select>
      <select class="form-control" id="planillaEstado" style="width:auto;min-width:130px">
        <option value="ACTIVA" selected>Solo Activas</option>
        <option value="">Todos los estados</option>
        <option value="SALDADA">Saldadas</option>
        <option value="ANULADA">Anuladas</option>
      </select>
      <select class="form-control" id="planillaMotivo" style="width:auto;min-width:130px">
        <option value="">Todos los motivos</option>
        ${cachedMotivos.map(m => `<option value="${m.id}">${escapeHTML(m.nombre)}</option>`).join('')}
      </select>
      <select class="form-control" id="planillaFrec" style="width:auto;min-width:130px">
        <option value="">Todas las frecuencias</option>
        <option value="QUINCENAL">Quincenal</option>
        <option value="SEMANAL">Semanal</option>
        <option value="SIN_PLAN">Sin plan</option>
      </select>
      <button class="btn btn-secondary" id="btnExportPlanilla" title="Exportar a Excel"><i data-lucide="download"></i>Excel</button>
      <button class="btn btn-ghost" id="btnPrintPlanilla" title="Imprimir reporte"><i data-lucide="printer"></i>Imprimir</button>
    </div>
    <div id="planillaTotals" class="deuda-totals-bar" style="margin-bottom:1rem"></div>
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Funcionario</th>
            <th>Cat</th>
            <th>CI</th>
            <th>Fecha Entrega</th>
            <th>Motivo</th>
            <th>Descripción</th>
            <th style="text-align:right">Capital Bruto</th>
            <th style="text-align:right">Utilidad Ganada</th>
            <th style="text-align:right">Deuda Total</th>
            <th style="text-align:right">Ya Descontado</th>
            <th style="text-align:right">Saldo Pendiente</th>
            <th>Plan Descuento</th>
            <th>Estado</th>
            <th style="text-align:center">Acción</th>
          </tr>
        </thead>
        <tbody id="planillaTableBody"></tbody>
        <tfoot id="planillaTableFoot"></tfoot>
      </table>
    </div>
  </div>`;
  if (window.lucide) lucide.createIcons();

  let planillaData = [];

  async function loadPlanilla() {
    const search = document.getElementById('planillaSearch').value.trim();
    const categoria = document.getElementById('planillaCategoria').value;
    const estado = document.getElementById('planillaEstado').value;
    const motivoId = document.getElementById('planillaMotivo').value;
    const frecuencia = document.getElementById('planillaFrec').value;

    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (categoria) params.set('categoria', categoria);
    if (estado) params.set('estado', estado);
    if (motivoId) params.set('motivoId', motivoId);
    if (frecuencia) params.set('frecuencia', frecuencia);

    const tbody = document.getElementById('planillaTableBody');
    const tfoot = document.getElementById('planillaTableFoot');
    const totalsDiv = document.getElementById('planillaTotals');

    try {
      planillaData = await api.get(`/deudas/planilla?${params.toString()}`);

      if (!planillaData.length) {
        tbody.innerHTML = `<tr><td colspan="14" style="text-align:center;color:var(--text-muted);padding:2.5rem"><i data-lucide="inbox" style="display:block;margin:0 auto .5rem;opacity:.5"></i>No se encontraron deudas para los filtros seleccionados</td></tr>`;
        tfoot.innerHTML = '';
        totalsDiv.innerHTML = '';
        if (window.lucide) lucide.createIcons();
        return;
      }

      // Totales
      const funcionariosUnicos = new Set(planillaData.map(d => d.funcionarioId)).size;
      const totalBruto = planillaData.reduce((s, d) => s + (d.montoBruto ?? d.montoOriginal), 0);
      const totalUtilidad = planillaData.reduce((s, d) => s + (d.montoInteres ?? 0), 0);
      const totalMonto = planillaData.reduce((s, d) => s + d.montoOriginal, 0);
      const totalDesc = planillaData.reduce((s, d) => s + d.totalDescontado, 0);
      const totalSaldo = planillaData.filter(d => d.estado !== 'ANULADA').reduce((s, d) => s + d.saldo, 0);

      totalsDiv.innerHTML = `
        <div class="deuda-stat"><span>Funcionarios</span><strong>${funcionariosUnicos}</strong></div>
        <div class="deuda-stat"><span>Total Deudas</span><strong>${planillaData.length}</strong></div>
        <div class="deuda-stat"><span>Capital Bruto Total</span><strong>${fmtGs(totalBruto)}</strong></div>
        <div class="deuda-stat"><span>Utilidad Total Ganada</span><strong style="color:var(--success)">+${fmtGs(totalUtilidad)}</strong></div>
        <div class="deuda-stat"><span>Deuda Total a Cobrar</span><strong>${fmtGs(totalMonto)}</strong></div>
        <div class="deuda-stat"><span>Total Descontado</span><strong style="color:var(--success)">${fmtGs(totalDesc)}</strong></div>
        <div class="deuda-stat"><span>Saldo Pendiente</span><strong style="color:var(--danger)">${fmtGs(totalSaldo)}</strong></div>`;

      tbody.innerHTML = planillaData.map(d => {
        const bruto = d.montoBruto ?? d.montoOriginal;
        const interes = d.montoInteres ?? Math.max(0, d.montoOriginal - bruto);
        const pct = d.porcentajeInteres ?? 0;
        const cat = d.funcionario?.category || 'ADM';
        return `
        <tr>
          <td>
            <a href="javascript:void(0)" class="deuda-func-link" data-func="${d.funcionarioId}" style="color:var(--text);font-weight:600">${escapeHTML(d.funcionario?.name || '')}</a>
            ${d.funcionario?.department ? `<div style="color:var(--text-muted);font-size:.78rem">${escapeHTML(d.funcionario.department)}</div>` : ''}
          </td>
          <td><span class="badge ${cat === 'CHOFER' ? 'badge-warning' : 'badge-primary'}">${cat}</span></td>
          <td style="font-family:monospace;font-size:.9rem">${escapeHTML(d.funcionario?.cedula || '')}</td>
          <td>${formatDate(d.fecha)}</td>
          <td><span style="font-weight:500">${escapeHTML(d.motivo?.nombre || '')}</span></td>
          <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHTML(d.descripcion)}">${escapeHTML(d.descripcion)}</td>
          <td style="text-align:right;font-weight:500">${fmtGsPlain(bruto)}</td>
          <td style="text-align:right">
            <span style="color:var(--success);font-weight:600">+${fmtGsPlain(interes)}</span>
            <small style="color:var(--text-muted);display:block;font-size:.72rem">(${pct}%)</small>
          </td>
          <td style="text-align:right;font-weight:600">${fmtGsPlain(d.montoOriginal)}</td>
          <td style="text-align:right;font-weight:600;color:var(--success)">${fmtGsPlain(d.totalDescontado)}</td>
          <td style="text-align:right;font-weight:700;color:${d.saldo > 0 ? 'var(--danger)' : 'var(--success)'}">${fmtGsPlain(d.saldo)}</td>
          <td style="font-size:.85rem">
            ${d.planDescuento ? `<strong>${fmtGsPlain(d.planDescuento.montoPorDescuento)}</strong> <span style="color:var(--text-muted)">(${d.planDescuento.frecuencia === 'SEMANAL' ? 'Sem' : 'Quinc'})</span>` : '<span style="color:var(--text-muted)">Sin plan</span>'}
          </td>
          <td>${estadoBadge(d.estado)}</td>
          <td style="text-align:center">
            <button class="btn btn-ghost btn-sm deuda-func-link" data-func="${d.funcionarioId}" title="Ver ficha individual"><i data-lucide="eye"></i></button>
          </td>
        </tr>`;
      }).join('');

      tfoot.innerHTML = `
        <tr style="font-weight:700;font-size:.95rem;background:var(--bg-card-hover, rgba(255,255,255,0.03))">
          <td colspan="6" style="text-align:right;padding-right:1rem">TOTALES:</td>
          <td style="text-align:right">${fmtGsPlain(totalBruto)}</td>
          <td style="text-align:right;color:var(--success)">+${fmtGsPlain(totalUtilidad)}</td>
          <td style="text-align:right">${fmtGsPlain(totalMonto)}</td>
          <td style="text-align:right;color:var(--success)">${fmtGsPlain(totalDesc)}</td>
          <td style="text-align:right;color:var(--danger)">${fmtGsPlain(totalSaldo)}</td>
          <td colspan="3"></td>
        </tr>`;

      if (window.lucide) lucide.createIcons();

      tbody.querySelectorAll('.deuda-func-link').forEach(el => {
        el.addEventListener('click', () => navigate(`deudas/funcionario/${el.dataset.func}`));
      });
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="14" style="text-align:center;color:var(--danger);padding:2rem">Error al cargar la planilla de deudas</td></tr>`;
    }
  }

  document.getElementById('planillaSearch').addEventListener('input', debounce(loadPlanilla, 400));
  document.getElementById('planillaCategoria').addEventListener('change', loadPlanilla);
  document.getElementById('planillaEstado').addEventListener('change', loadPlanilla);
  document.getElementById('planillaMotivo').addEventListener('change', loadPlanilla);
  document.getElementById('planillaFrec').addEventListener('change', loadPlanilla);

  document.getElementById('btnExportPlanilla').addEventListener('click', () => {
    if (!planillaData.length) return showToast('No hay datos para exportar', 'info');
    const headers = ['Funcionario', 'Categoría', 'CI', 'Departamento', 'Fecha Entrega', 'Motivo', 'Descripción', 'Capital Bruto', '% Ganancia', 'Utilidad Ganada', 'Deuda Total', 'Ya Descontado', 'Saldo Pendiente', 'Plan Cuota', 'Frecuencia', 'Estado'];
    const rows = planillaData.map(d => {
      const bruto = d.montoBruto ?? d.montoOriginal;
      const interes = d.montoInteres ?? Math.max(0, d.montoOriginal - bruto);
      return [
        d.funcionario?.name || '',
        d.funcionario?.category || 'ADM',
        d.funcionario?.cedula || '',
        d.funcionario?.department || '',
        formatDate(d.fecha),
        d.motivo?.nombre || '',
        d.descripcion || '',
        bruto,
        `${d.porcentajeInteres ?? 0}%`,
        interes,
        d.montoOriginal,
        d.totalDescontado,
        d.saldo,
        d.planDescuento ? d.planDescuento.montoPorDescuento : 0,
        d.planDescuento ? d.planDescuento.frecuencia : 'Sin plan',
        d.estado
      ];
    });
    exportExcel(headers, rows, 'Planilla_General_Deudas.xlsx', 'Planilla Deudas');
  });

  document.getElementById('btnPrintPlanilla').addEventListener('click', () => {
    if (!planillaData.length) return showToast('No hay datos para imprimir', 'info');
    printPlanillaReport(planillaData);
  });

  loadPlanilla();
}

// Helper para impresión de la planilla general
function printPlanillaReport(data) {
  const printWin = window.open('', '_blank', 'width=1050,height=750');
  if (!printWin) {
    showToast('Permita las ventanas emergentes para imprimir', 'warning');
    return;
  }

  const totalBruto = data.reduce((s, d) => s + (d.montoBruto ?? d.montoOriginal), 0);
  const totalUtilidad = data.reduce((s, d) => s + (d.montoInteres ?? 0), 0);
  const totalMonto = data.reduce((s, d) => s + d.montoOriginal, 0);
  const totalDesc = data.reduce((s, d) => s + d.totalDescontado, 0);
  const totalSaldo = data.filter(d => d.estado !== 'ANULADA').reduce((s, d) => s + d.saldo, 0);
  const funcionariosUnicos = new Set(data.map(d => d.funcionarioId)).size;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Planilla General de Deudas y Préstamos</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; }
    body { padding: 10mm; font-size: 9pt; color: #111; }
    .header { text-align: center; border-bottom: 2px solid #222; padding-bottom: 8px; margin-bottom: 12px; }
    .header h1 { font-size: 15pt; font-weight: 700; margin-bottom: 3px; }
    .header p { font-size: 9.5pt; color: #555; }
    .summary-box { display: flex; justify-content: space-between; background: #f4f4f4; padding: 8px 12px; border-radius: 4px; margin-bottom: 12px; font-size: 8.5pt; flex-wrap: wrap; gap: 8px; }
    .summary-box strong { font-size: 9.5pt; color: #000; }
    table { width: 100%; border-collapse: collapse; font-size: 8pt; }
    th, td { border: 1px solid #ddd; padding: 4px 6px; text-align: left; }
    th { background: #f0f0f0; font-weight: 700; font-size: 7.5pt; text-transform: uppercase; }
    .num { text-align: right; }
    .cat-badge { padding: 2px 6px; border-radius: 4px; font-size: 7.5pt; font-weight: 700; background: #e0e7ef; }
    .tfoot-total { font-weight: 700; background: #fafafa; font-size: 8.5pt; }
    .footer { margin-top: 20px; display: flex; justify-content: space-between; font-size: 8pt; color: #777; }
    @media print {
      body { padding: 6mm; }
      @page { size: landscape; margin: 6mm; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>PLANILLA GENERAL DE PRÉSTAMOS Y DEUDAS</h1>
    <p>Comedor TTA S.A. — Reporte Consolidado con Utilidades</p>
  </div>
  <div class="summary-box">
    <div>Funcionarios: <strong>${funcionariosUnicos}</strong></div>
    <div>Total Préstamos: <strong>${data.length}</strong></div>
    <div>Capital Bruto: <strong>Gs. ${fmtGsPlain(totalBruto)}</strong></div>
    <div>Utilidad Ganada: <strong>Gs. ${fmtGsPlain(totalUtilidad)}</strong></div>
    <div>Deuda Total a Cobrar: <strong>Gs. ${fmtGsPlain(totalMonto)}</strong></div>
    <div>Total Descontado: <strong>Gs. ${fmtGsPlain(totalDesc)}</strong></div>
    <div>Saldo Pendiente: <strong>Gs. ${fmtGsPlain(totalSaldo)}</strong></div>
  </div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Funcionario</th>
        <th>Cat</th>
        <th>CI</th>
        <th>Fecha</th>
        <th>Motivo</th>
        <th>Descripción</th>
        <th class="num">Capital Bruto</th>
        <th class="num">Utilidad (%)</th>
        <th class="num">Deuda Total</th>
        <th class="num">Descontado</th>
        <th class="num">Saldo</th>
        <th>Plan</th>
        <th>Estado</th>
      </tr>
    </thead>
    <tbody>
      ${data.map((d, i) => {
        const bruto = d.montoBruto ?? d.montoOriginal;
        const interes = d.montoInteres ?? Math.max(0, d.montoOriginal - bruto);
        const pct = d.porcentajeInteres ?? 0;
        return `
        <tr>
          <td>${i + 1}</td>
          <td><strong>${escapeHTML(d.funcionario?.name || '')}</strong></td>
          <td><span class="cat-badge">${escapeHTML(d.funcionario?.category || 'ADM')}</span></td>
          <td>${escapeHTML(d.funcionario?.cedula || '')}</td>
          <td>${formatDate(d.fecha)}</td>
          <td>${escapeHTML(d.motivo?.nombre || '')}</td>
          <td>${escapeHTML(d.descripcion || '')}</td>
          <td class="num">${fmtGsPlain(bruto)}</td>
          <td class="num">+${fmtGsPlain(interes)} (${pct}%)</td>
          <td class="num">${fmtGsPlain(d.montoOriginal)}</td>
          <td class="num">${fmtGsPlain(d.totalDescontado)}</td>
          <td class="num"><strong>${fmtGsPlain(d.saldo)}</strong></td>
          <td>${d.planDescuento ? `${fmtGsPlain(d.planDescuento.montoPorDescuento)} (${d.planDescuento.frecuencia === 'SEMANAL' ? 'Sem' : 'Quinc'})` : 'Sin plan'}</td>
          <td>${d.estado}</td>
        </tr>`;
      }).join('')}
    </tbody>
    <tfoot>
      <tr class="tfoot-total">
        <td colspan="7" style="text-align:right">TOTALES:</td>
        <td class="num">Gs. ${fmtGsPlain(totalBruto)}</td>
        <td class="num">Gs. ${fmtGsPlain(totalUtilidad)}</td>
        <td class="num">Gs. ${fmtGsPlain(totalMonto)}</td>
        <td class="num">Gs. ${fmtGsPlain(totalDesc)}</td>
        <td class="num">Gs. ${fmtGsPlain(totalSaldo)}</td>
        <td colspan="2"></td>
      </tr>
    </tfoot>
  </table>
  <div class="footer">
    <span>Generado por sistema ComePOS</span>
    <span>Fecha: ${new Date().toLocaleString('es-PY')}</span>
  </div>
</body>
</html>`;

  printWin.document.write(html);
  printWin.document.close();
  printWin.focus();
  setTimeout(() => {
    printWin.print();
  }, 400);
}

// ============================================
// Ficha del funcionario (vista detallada)
// ============================================
async function renderFichaFuncionario(funcId) {
  const container = document.getElementById('module-content');
  container.innerHTML = `<div class="fade-in" style="padding:1rem"><div class="empty-state"><i data-lucide="loader" class="spin"></i><p>Cargando ficha...</p></div></div>`;
  if (window.lucide) lucide.createIcons();

  try {
    const data = await api.get(`/deudas/funcionario/${funcId}`);
    const { funcionario, deudas, totalBruto, totalUtilidad, totalDeuda, totalDescontado, saldoTotal } = data;
    // Excluir deudas anuladas de la vista de la ficha
    const deudasValidas = (deudas || []).filter(d => d.estado !== 'ANULADA');

    container.innerHTML = `
    <div class="fade-in">
      <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1.25rem;flex-wrap:wrap">
        <button class="btn btn-ghost" id="btnVolverDeudas"><i data-lucide="arrow-left"></i>Volver</button>
        <div style="flex:1">
          <div style="display:flex;align-items:center;gap:.5rem">
            <h3 style="margin:0">${escapeHTML(funcionario.name)}</h3>
            <span class="badge ${funcionario.category === 'CHOFER' ? 'badge-warning' : 'badge-primary'}">${funcionario.category || 'GENERAL'}</span>
          </div>
          <span style="color:var(--text-muted);font-size:.85rem">CI: ${escapeHTML(funcionario.cedula)}${funcionario.department ? ` — ${escapeHTML(funcionario.department)}` : ''}</span>
        </div>
        <button class="btn btn-secondary" id="btnTarjeta"><i data-lucide="printer"></i>Tarjeta PDF</button>
        <button class="btn btn-primary" id="btnNuevaDeudaFunc"><i data-lucide="plus"></i>Nuevo Préstamo</button>
      </div>

      <div class="deuda-totals-bar" style="margin-bottom:1.25rem">
        <div class="deuda-stat"><span>Capital Bruto</span><strong>${fmtGs(totalBruto ?? totalDeuda)}</strong></div>
        <div class="deuda-stat"><span>Utilidad Ganada</span><strong style="color:var(--success)">+${fmtGs(totalUtilidad ?? 0)}</strong></div>
        <div class="deuda-stat"><span>Total a Cobrar</span><strong>${fmtGs(totalDeuda)}</strong></div>
        <div class="deuda-stat"><span>Total Descontado</span><strong style="color:var(--success)">${fmtGs(totalDescontado)}</strong></div>
        <div class="deuda-stat"><span>Saldo Actual</span><strong style="color:${saldoTotal > 0 ? 'var(--danger)' : 'var(--success)'}">${fmtGs(saldoTotal)}</strong></div>
      </div>

      <div id="fichaDeudas">
        ${deudasValidas.length === 0 ? '<div class="empty-state" style="padding:2rem"><i data-lucide="check-circle"></i><h3>Sin préstamos / deudas</h3><p>Este funcionario no tiene deudas activas o pagadas.</p></div>' :
        deudasValidas.map(d => renderDeudaCard(d, funcionario)).join('')}
      </div>
    </div>`;
    if (window.lucide) lucide.createIcons();

    // Event handlers
    document.getElementById('btnVolverDeudas').addEventListener('click', () => {
      navigate('deudas');
    });

    document.getElementById('btnNuevaDeudaFunc').addEventListener('click', () => {
      currentTab = 'cargar';
      navigate('deudas');
      // Pre-fill after render
      setTimeout(() => {
        const funcIdInput = document.getElementById('deudaFuncId');
        if (funcIdInput) {
          funcIdInput.value = funcId;
          const searchInput = document.getElementById('deudaFuncSearch');
          if (searchInput) searchInput.style.display = 'none';
          const selected = document.getElementById('deudaFuncSelected');
          if (selected) {
            selected.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between"><div><strong>${escapeHTML(funcionario.name)}</strong><span class="badge ${funcionario.category === 'CHOFER' ? 'badge-warning' : 'badge-primary'}" style="margin-left:.5rem">${funcionario.category || 'GENERAL'}</span><span style="color:var(--text-muted);font-size:.82rem;margin-left:.5rem">CI: ${escapeHTML(funcionario.cedula)}</span></div></div>`;
            selected.style.display = 'block';
          }
        }
      }, 100);
    });

    document.getElementById('btnTarjeta').addEventListener('click', () => {
      openTarjetaPDF(funcId);
    });

    // Botones dentro de cada card de deuda
    setupDeudaCardEvents(funcId);

  } catch (err) {
    container.innerHTML = `<div class="empty-state"><i data-lucide="alert-circle"></i><h3>Error</h3><p>${escapeHTML(err.message || 'Error al cargar ficha')}</p><button class="btn btn-primary" id="btnVolverErr">Volver</button></div>`;
    if (window.lucide) lucide.createIcons();
    document.getElementById('btnVolverErr')?.addEventListener('click', () => navigate('deudas'));
  }
}

function renderDeudaCard(deuda, funcionario) {
  const saldo = deuda.saldo;
  const descontado = deuda.totalDescontado;
  const porcentaje = deuda.montoOriginal > 0 ? Math.round((descontado / deuda.montoOriginal) * 100) : 0;
  const descuentosValidos = deuda.descuentos.filter(d => !d.anulado);
  const bruto = deuda.montoBruto ?? deuda.montoOriginal;
  const interes = deuda.montoInteres ?? Math.max(0, deuda.montoOriginal - bruto);
  const pct = deuda.porcentajeInteres ?? 0;

  return `
  <div class="card deuda-card" data-deuda-id="${deuda.id}" style="margin-bottom:1rem;padding:0;overflow:hidden">
    <div class="deuda-card-header">
      <div style="flex:1">
        <div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap">
          <strong style="font-size:.95rem">${escapeHTML(deuda.motivo?.nombre || '')}</strong>
          <span style="color:var(--text-muted)">—</span>
          <span>${escapeHTML(deuda.descripcion)}</span>
          ${estadoBadge(deuda.estado)}
        </div>
        <div style="color:var(--text-muted);font-size:.82rem;margin-top:.35rem;display:flex;gap:1rem;flex-wrap:wrap">
          <span>Fecha: <strong>${formatDate(deuda.fecha)}</strong></span>
          <span>Capital Bruto: <strong>${fmtGs(bruto)}</strong></span>
          <span>Utilidad (+${pct}%): <strong style="color:var(--success)">+${fmtGs(interes)}</strong></span>
          <span>Total Deuda: <strong>${fmtGs(deuda.montoOriginal)}</strong></span>
          ${deuda.planDescuento ? `<span>Plan: <strong>${fmtGs(deuda.planDescuento.montoPorDescuento)} ${deuda.planDescuento.frecuencia.toLowerCase()}</strong></span>` : ''}
        </div>
      </div>
    </div>

    <div style="padding:0 1rem">
      <div class="deuda-progress-bar">
        <div class="deuda-progress-fill" style="width:${Math.min(porcentaje, 100)}%"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:.8rem;color:var(--text-muted);margin-top:.25rem;margin-bottom:.5rem">
        <span>Descontado: ${fmtGs(descontado)} (${porcentaje}%)</span>
        <span>Saldo: <strong style="color:${saldo > 0 ? 'var(--danger)' : 'var(--success)'}">${fmtGs(saldo)}</strong></span>
      </div>
    </div>

    ${deuda.descuentos.length > 0 ? `
    <div class="deuda-descuentos-list">
      <div style="padding:.5rem 1rem;font-size:.82rem;font-weight:600;color:var(--text-secondary);border-bottom:1px solid var(--border)">
        Descuentos (${descuentosValidos.length}/${deuda.descuentos.length})
      </div>
      ${deuda.descuentos.map(desc => `
      <div class="deuda-descuento-row${desc.anulado ? ' anulado' : ''}" data-desc-id="${desc.id}">
        <div style="flex:1;display:flex;align-items:center;gap:.5rem;flex-wrap:wrap">
          <span>${formatDate(desc.fecha)}</span>
          <strong>${fmtGs(desc.monto)}</strong>
          ${desc.nota ? `<span style="color:var(--text-muted);font-size:.8rem">${escapeHTML(desc.nota)}</span>` : ''}
          ${desc.anulado ? `<span class="badge badge-danger" style="font-size:.7rem">ANULADO${desc.motivoAnulacion ? ': ' + escapeHTML(desc.motivoAnulacion) : ''}</span>` : ''}
        </div>
        ${!desc.anulado && deuda.estado !== 'ANULADA' ? `<button class="btn btn-ghost btn-sm btn-anular-desc" data-desc-id="${desc.id}" title="Anular descuento"><i data-lucide="x-circle"></i></button>` : ''}
      </div>`).join('')}
    </div>` : ''}

    <div class="deuda-card-actions">
      ${deuda.estado === 'ACTIVA' ? `
      <button class="btn btn-primary btn-sm btn-reg-desc" data-deuda-id="${deuda.id}" data-saldo="${saldo}" data-plan-monto="${deuda.planDescuento?.montoPorDescuento || ''}">
        <i data-lucide="minus-circle"></i>Registrar Descuento
      </button>
      <button class="btn btn-ghost btn-sm btn-edit-plan" data-deuda-id="${deuda.id}" data-monto="${deuda.montoOriginal}" data-saldo="${saldo}">
        <i data-lucide="calendar-range"></i>${deuda.planDescuento ? 'Editar Plan' : 'Asignar Plan'}
      </button>` : ''}
      <button class="btn btn-ghost btn-sm btn-tarjeta-deuda" data-deuda-id="${deuda.id}">
        <i data-lucide="printer"></i>Tarjeta
      </button>
      ${deuda.estado === 'ACTIVA' ? `
      <button class="btn btn-danger btn-sm btn-anular-deuda" data-deuda-id="${deuda.id}" style="margin-left:auto">
        <i data-lucide="ban"></i>Anular Deuda
      </button>` : ''}
    </div>
  </div>`;
}

function setupDeudaCardEvents(funcId) {
  // Registrar descuento
  document.querySelectorAll('.btn-reg-desc').forEach(btn => {
    btn.addEventListener('click', () => {
      showRegistrarDescuentoModal(btn.dataset.deudaId, parseInt(btn.dataset.saldo), parseInt(btn.dataset.planMonto) || null, funcId);
    });
  });

  // Anular descuento
  document.querySelectorAll('.btn-anular-desc').forEach(btn => {
    btn.addEventListener('click', () => {
      showAnularDescuentoModal(btn.dataset.descId, funcId);
    });
  });

  // Anular deuda
  document.querySelectorAll('.btn-anular-deuda').forEach(btn => {
    btn.addEventListener('click', () => {
      showAnularDeudaModal(btn.dataset.deudaId, funcId);
    });
  });

  // Editar plan
  document.querySelectorAll('.btn-edit-plan').forEach(btn => {
    btn.addEventListener('click', () => {
      showPlanModal(btn.dataset.deudaId, parseInt(btn.dataset.monto), parseInt(btn.dataset.saldo), funcId);
    });
  });

  // Tarjeta individual
  document.querySelectorAll('.btn-tarjeta-deuda').forEach(btn => {
    btn.addEventListener('click', () => {
      openTarjetaPDF(funcId, btn.dataset.deudaId);
    });
  });
}

// ============================================
// Modales
// ============================================

function showRegistrarDescuentoModal(deudaId, saldo, planMonto, funcId) {
  const defaultMonto = planMonto ? Math.min(planMonto, saldo) : '';
  const overlay = createModal(
    'Registrar Descuento',
    `<div class="form-group">
       <label>Monto a descontar (Gs.) *</label>
       <input type="text" class="form-control" id="descMonto" value="${defaultMonto ? Number(defaultMonto).toLocaleString('es-PY') : ''}" placeholder="Monto" />
       <small style="color:var(--text-muted)">Saldo disponible: ${fmtGs(saldo)}</small>
     </div>
     <div class="form-group">
       <label>Fecha *</label>
       <input type="date" class="form-control" id="descFecha" value="${todayStr()}" />
     </div>
     <div class="form-group">
       <label>Nota (opcional)</label>
       <input type="text" class="form-control" id="descNota" placeholder="Observación..." maxlength="200" />
     </div>`,
    `<button class="btn btn-secondary modal-close">Cancelar</button>
     <button class="btn btn-primary" id="btnSaveDesc"><i data-lucide="save"></i>Registrar</button>`
  );

  // Formateo
  const montoInput = document.getElementById('descMonto');
  montoInput.addEventListener('input', () => {
    const raw = montoInput.value.replace(/\D/g, '');
    montoInput.value = raw ? Number(raw).toLocaleString('es-PY') : '';
  });

  document.getElementById('btnSaveDesc').addEventListener('click', async () => {
    const monto = parseInt((montoInput.value || '').replace(/\D/g, '')) || 0;
    const fecha = document.getElementById('descFecha').value;
    const nota = document.getElementById('descNota').value.trim();

    if (monto <= 0) return showToast('Ingrese un monto válido', 'error');
    if (monto > saldo) return showToast(`El monto supera el saldo (${fmtGs(saldo)})`, 'error');
    if (!fecha) return showToast('Ingrese la fecha', 'error');

    try {
      await api.post(`/deudas/${deudaId}/descuentos`, { fecha, monto, nota: nota || null });
      showToast('Descuento registrado');
      closeModal(overlay);
      renderFichaFuncionario(funcId);
    } catch (err) {
      showToast(err.message || 'Error', 'error');
    }
  });
}

function showAnularDescuentoModal(descId, funcId) {
  const overlay = createModal(
    'Anular Descuento',
    `<p style="color:var(--text-secondary);margin-bottom:1rem">Esta acción no se puede deshacer. El monto del descuento se sumará al saldo pendiente de la deuda.</p>
     <div class="form-group">
       <label>Motivo de anulación *</label>
       <textarea class="form-control" id="anulDescMotivo" rows="2" placeholder="Ingrese el motivo..." maxlength="300"></textarea>
     </div>`,
    `<button class="btn btn-secondary modal-close">Cancelar</button>
     <button class="btn btn-danger" id="btnConfAnulDesc"><i data-lucide="x-circle"></i>Anular Descuento</button>`
  );

  document.getElementById('btnConfAnulDesc').addEventListener('click', async () => {
    const motivo = document.getElementById('anulDescMotivo').value.trim();
    if (!motivo) return showToast('Ingrese el motivo de anulación', 'error');
    try {
      await api.put(`/deudas/descuentos/${descId}/anular`, { motivoAnulacion: motivo });
      showToast('Descuento anulado');
      closeModal(overlay);
      renderFichaFuncionario(funcId);
    } catch (err) {
      showToast(err.message || 'Error', 'error');
    }
  });
}

function showAnularDeudaModal(deudaId, funcId) {
  const overlay = createModal(
    'Anular Deuda',
    `<p style="color:var(--danger);font-weight:600;margin-bottom:1rem">⚠️ ¿Está seguro de que desea anular esta deuda?</p>
     <p style="color:var(--text-secondary);margin-bottom:1rem;font-size:.9rem">La deuda será anulada y ya no aparecerá en la ficha del cliente.</p>
     <div class="form-group">
       <label>Motivo de anulación *</label>
       <textarea class="form-control" id="anulDeudaMotivo" rows="2" placeholder="Ingrese el motivo..." maxlength="300"></textarea>
     </div>`,
    `<button class="btn btn-secondary modal-close">Cancelar</button>
     <button class="btn btn-danger" id="btnConfAnulDeuda"><i data-lucide="ban"></i>Anular Deuda</button>`
  );

  document.getElementById('btnConfAnulDeuda').addEventListener('click', async () => {
    const motivo = document.getElementById('anulDeudaMotivo').value.trim();
    if (!motivo) return showToast('Ingrese el motivo de anulación', 'error');
    try {
      await api.put(`/deudas/${deudaId}/anular`, { motivoAnulacion: motivo });
      showToast('Deuda anulada');
      closeModal(overlay);
      renderFichaFuncionario(funcId);
    } catch (err) {
      showToast(err.message || 'Error', 'error');
    }
  });
}

function showPlanModal(deudaId, montoOriginal, saldo, funcId) {
  const overlay = createModal(
    'Plan de Descuento',
    `<div class="form-group">
       <label>Monto por descuento (Gs.) *</label>
       <input type="text" class="form-control" id="planModalMonto" placeholder="150.000" />
     </div>
     <div class="form-group">
       <label>Frecuencia *</label>
       <select class="form-control" id="planModalFrec">
         <option value="SEMANAL">Semanal</option>
         <option value="QUINCENAL">Quincenal</option>
       </select>
     </div>
     <div class="form-group">
       <label>Fecha de inicio *</label>
       <input type="date" class="form-control" id="planModalFecha" value="${todayStr()}" />
     </div>
     <div id="planModalPreview" class="deuda-plan-preview" style="display:none"></div>`,
    `<button class="btn btn-secondary modal-close">Cancelar</button>
     <button class="btn btn-primary" id="btnSavePlan"><i data-lucide="save"></i>Guardar Plan</button>`
  );

  const montoInput = document.getElementById('planModalMonto');
  montoInput.addEventListener('input', () => {
    const raw = montoInput.value.replace(/\D/g, '');
    montoInput.value = raw ? Number(raw).toLocaleString('es-PY') : '';
    updatePlanPreview();
  });

  function updatePlanPreview() {
    const montoPlan = parseInt((montoInput.value || '').replace(/\D/g, '')) || 0;
    const frecuencia = document.getElementById('planModalFrec').value;
    const fechaInicio = document.getElementById('planModalFecha').value;
    const preview = document.getElementById('planModalPreview');

    if (!montoPlan || !frecuencia || !fechaInicio || saldo <= 0) {
      preview.style.display = 'none';
      return;
    }

    const cuotas = Math.ceil(saldo / montoPlan);
    const diasPorPeriodo = frecuencia === 'SEMANAL' ? 7 : 15;
    const fechaFin = new Date(fechaInicio);
    fechaFin.setDate(fechaFin.getDate() + (cuotas * diasPorPeriodo));

    preview.innerHTML = `
      <div style="display:flex;gap:1.5rem;flex-wrap:wrap">
        <div><span style="color:var(--text-muted);font-size:.8rem">Saldo actual</span><br/><strong>${fmtGs(saldo)}</strong></div>
        <div><span style="color:var(--text-muted);font-size:.8rem">Cuotas estimadas</span><br/><strong>${cuotas}</strong></div>
        <div><span style="color:var(--text-muted);font-size:.8rem">Fecha est. cancelación</span><br/><strong>${fechaFin.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' })}</strong></div>
      </div>`;
    preview.style.display = 'block';
  }

  document.getElementById('planModalFrec').addEventListener('change', updatePlanPreview);
  document.getElementById('planModalFecha').addEventListener('change', updatePlanPreview);

  document.getElementById('btnSavePlan').addEventListener('click', async () => {
    const montoPorDescuento = parseInt((montoInput.value || '').replace(/\D/g, '')) || 0;
    const frecuencia = document.getElementById('planModalFrec').value;
    const fechaInicio = document.getElementById('planModalFecha').value;

    if (montoPorDescuento <= 0) return showToast('Ingrese un monto válido', 'error');
    if (!fechaInicio) return showToast('Ingrese fecha de inicio', 'error');

    try {
      await api.put(`/deudas/${deudaId}/plan`, { montoPorDescuento, frecuencia, fechaInicio });
      showToast('Plan guardado');
      closeModal(overlay);
      renderFichaFuncionario(funcId);
    } catch (err) {
      showToast(err.message || 'Error', 'error');
    }
  });
}

// ============================================
// Tarjeta PDF
// ============================================
function openTarjetaPDF(funcId, deudaId = null) {
  let url = `/api/deudas/tarjeta/${funcId}`;
  if (deudaId) url += `?deudaId=${deudaId}`;

  // Agregar token como query param para la petición directa
  const user = JSON.parse(localStorage.getItem('comepos_session') || 'null');
  if (user?.token) url += `${deudaId ? '&' : '?'}token=${user.token}`;

  window.open(url, '_blank');
}
