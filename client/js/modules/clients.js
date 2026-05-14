// ============================================
// Clients Module
// ============================================

import { api } from '../api.js';
import { generateId, showToast, createModal, closeModal, escapeHTML, formatCurrency, formatDateTime, EMPLOYEE_CATEGORIES, CATEGORY_BADGE_COLORS } from '../utils.js';

export async function renderClients() {
    const container = document.getElementById('module-content');
    try {
        const clients = await api.get('/clients');

        container.innerHTML = `
        <div class="fade-in">
          <div class="filters-bar">
            <div class="search-bar">
              <i data-lucide="search"></i>
              <input type="text" class="form-control" id="searchClients" placeholder="Buscar por nombre o cédula..." />
            </div>
            <select class="form-control" id="filterCategory" style="width:auto;min-width:160px">
              <option value="">Todas las categorías</option>
              ${EMPLOYEE_CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('')}
            </select>
            <button class="btn btn-primary" id="btnAddClient"><i data-lucide="plus"></i>Nuevo Cliente</button>
          </div>
          <div class="table-container">
            <table>
              <thead><tr><th>Nombre</th><th>Cédula</th><th>Departamento</th><th>Cargo</th><th>Categoría</th><th>Acciones</th></tr></thead>
              <tbody id="clientsTableBody"></tbody>
            </table>
          </div>
        </div>`;

        if (window.lucide) lucide.createIcons();

        function applyFilters() {
            const q = document.getElementById('searchClients').value.toLowerCase();
            const cat = document.getElementById('filterCategory').value;
            const filtered = clients.filter(c => {
                const matchQ = !q || c.name.toLowerCase().includes(q) || c.cedula.includes(q);
                const matchCat = !cat || c.category === cat;
                return matchQ && matchCat;
            });
            renderTable(filtered, clients);
        }

        renderTable(clients, clients);
        document.getElementById('searchClients').addEventListener('input', applyFilters);
        document.getElementById('filterCategory').addEventListener('change', applyFilters);
        document.getElementById('btnAddClient').addEventListener('click', () => openClientModal(null, clients));
    } catch (err) {
        container.innerHTML = `<div class="empty-state"><p>Error al cargar clientes: ${err.message}</p></div>`;
    }
}

function renderTable(clients, allClients) {
    const tbody = document.getElementById('clientsTableBody');
    if (!tbody) return;
    tbody.innerHTML = clients.map(c => `
    <tr>
      <td><strong>${escapeHTML(c.name)}</strong></td>
      <td>${escapeHTML(c.cedula)}</td>
      <td style="color:var(--text-secondary)">${escapeHTML(c.department || '')}</td>
      <td style="color:var(--text-secondary)">${escapeHTML(c.position || '')}</td>
      <td><span class="badge ${CATEGORY_BADGE_COLORS[c.category] || 'badge-primary'}">${c.category}</span></td>
      <td>
        <button class="btn btn-ghost btn-sm btn-icon" data-history="${c.id}" title="Historial"><i data-lucide="history"></i></button>
        <button class="btn btn-ghost btn-sm btn-icon" data-edit="${c.id}" title="Editar"><i data-lucide="pencil"></i></button>
        <button class="btn btn-ghost btn-sm btn-icon" data-delete="${c.id}" title="Eliminar"><i data-lucide="trash-2"></i></button>
      </td>
    </tr>`).join('');
    if (window.lucide) lucide.createIcons();

    tbody.querySelectorAll('[data-edit]').forEach(btn => {
        btn.onclick = () => {
            const client = allClients.find(c => c.id === btn.dataset.edit);
            if (client) openClientModal(client, allClients);
        };
    });

    tbody.querySelectorAll('[data-delete]').forEach(btn => {
        btn.onclick = async () => {
            if (confirm('¿Eliminar este cliente?')) {
                try {
                    await api.delete(`/clients/${btn.dataset.delete}`);
                    showToast('Cliente eliminado');
                    renderClients();
                } catch (e) {
                    showToast(e.message, 'error');
                }
            }
        };
    });

    tbody.querySelectorAll('[data-history]').forEach(btn => {
        btn.onclick = () => showClientHistory(btn.dataset.history, allClients);
    });
}

function openClientModal(client, allClients) {
    const isEdit = !!client;
    const c = client || {};
    
    // Get unique departments and positions for suggestions
    const depts = [...new Set(allClients.map(cl => cl.department).filter(Boolean))].sort();
    const positions = [...new Set(allClients.map(cl => cl.position).filter(Boolean))].sort();

    const body = `
    <div class="form-row">
      <div class="form-group"><label>Nombre Completo</label><input type="text" class="form-control" id="mCliName" value="${isEdit ? escapeHTML(c.name) : ''}" required /></div>
      <div class="form-group"><label>Cédula de Identidad</label><input type="text" class="form-control" id="mCliCedula" value="${isEdit ? escapeHTML(c.cedula) : ''}" required /></div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Departamento</label>
        <input type="text" class="form-control" id="mCliDept" value="${isEdit ? escapeHTML(c.department || '') : ''}" list="dlDepts" />
        <datalist id="dlDepts">
          ${depts.map(d => `<option value="${escapeHTML(d)}">`).join('')}
        </datalist>
      </div>
      <div class="form-group">
        <label>Cargo</label>
        <input type="text" class="form-control" id="mCliPosition" value="${isEdit ? escapeHTML(c.position || '') : ''}" list="dlPositions" />
        <datalist id="dlPositions">
          ${positions.map(p => `<option value="${escapeHTML(p)}">`).join('')}
        </datalist>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Categoría de Funcionario</label>
        <select class="form-control" id="mCliCategory">
          ${EMPLOYEE_CATEGORIES.map(cat => `<option value="${cat}" ${isEdit && c.category === cat ? 'selected' : ''}>${cat}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label>Email</label><input type="email" class="form-control" id="mCliEmail" value="${isEdit ? escapeHTML(c.email || '') : ''}" /></div>
    </div>
    <div class="form-group"><label>Teléfono</label><input type="text" class="form-control" id="mCliPhone" value="${isEdit ? escapeHTML(c.phone || '') : ''}" /></div>`;
    const footer = `<button class="btn btn-secondary modal-close">Cancelar</button><button class="btn btn-primary" id="btnSaveClient">${isEdit ? 'Guardar' : 'Crear'}</button>`;
    const overlay = createModal(isEdit ? 'Editar Cliente' : 'Nuevo Cliente', body, footer);

    const btnSave = document.getElementById('btnSaveClient');
    btnSave.onclick = async () => {
        const data = {
            name: document.getElementById('mCliName').value.trim(),
            cedula: document.getElementById('mCliCedula').value.trim(),
            department: document.getElementById('mCliDept').value.trim(),
            position: document.getElementById('mCliPosition').value.trim(),
            category: document.getElementById('mCliCategory').value,
            email: document.getElementById('mCliEmail').value.trim(),
            phone: document.getElementById('mCliPhone').value.trim()
        };
        if (!data.name || !data.cedula) return showToast('Nombre y cédula son obligatorios', 'error');

        btnSave.disabled = true;
        btnSave.innerHTML = '<i data-lucide="loader"></i> Guardando...';
        if (window.lucide) lucide.createIcons();

        try {
            if (isEdit) {
                await api.put(`/clients/${client.id}`, data);
                showToast('Cliente actualizado');
            } else {
                await api.post('/clients', data);
                showToast('Cliente registrado');
            }
            closeModal(overlay);
            renderClients();
        } catch (err) {
            showToast(err.message, 'error');
            btnSave.disabled = false;
            btnSave.innerHTML = isEdit ? 'Guardar' : 'Crear';
            if (window.lucide) lucide.createIcons();
        }
    };
}

async function showClientHistory(clientId, allClients) {
    const client = allClients.find(c => c.id === clientId);
    try {
        const data = await api.get(`/clients/${clientId}/history`);
        const sales = data.sales;

        const body = `
        <div style="margin-bottom:1rem;display:flex;gap:1rem">
          <div class="card" style="flex:1;padding:1rem"><div class="kpi-label">Total Compras</div><div style="font-size:1.2rem;font-weight:700">${data.totalSales}</div></div>
          <div class="card" style="flex:1;padding:1rem"><div class="kpi-label">Total Gastado</div><div style="font-size:1.2rem;font-weight:700;color:var(--primary-light)">${formatCurrency(data.totalSpent)}</div></div>
        </div>
        ${sales.length > 0 ? `
        <div class="table-container" style="max-height:300px;overflow-y:auto">
          <table>
            <thead><tr><th>Fecha</th><th>Productos</th><th>Total</th><th>Pago</th></tr></thead>
            <tbody>${sales.map(s => `
              <tr>
                <td style="font-size:.8rem">${formatDateTime(s.date)}</td>
                <td style="font-size:.8rem">${s.items.map(i => i.name).join(', ')}</td>
                <td><strong>${formatCurrency(s.total)}</strong></td>
                <td><span class="badge badge-${s.paymentMethod === 'efectivo' ? 'success' : s.paymentMethod === 'tarjeta' ? 'info' : 'purple'}">${s.paymentMethod}</span></td>
              </tr>`).join('')}</tbody>
          </table>
        </div>` : '<div class="empty-state"><p>Sin compras registradas</p></div>'}`;
        createModal(`Historial — ${client?.name || ''}`, body);
    } catch (err) {
        showToast('Error al cargar historial', 'error');
    }
}

