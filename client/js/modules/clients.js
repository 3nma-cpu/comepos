// ============================================
// Clients Module
// ============================================

import { getCollection, addItem, updateItem, deleteItem } from '../store.js';
import { generateId, showToast, createModal, closeModal, escapeHTML, formatCurrency, formatDateTime, EMPLOYEE_CATEGORIES, CATEGORY_BADGE_COLORS } from '../utils.js';

export function renderClients() {
    const container = document.getElementById('module-content');
    const clients = getCollection('clients');

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
        renderTable(filtered);
    }

    renderTable(clients);
    document.getElementById('searchClients').addEventListener('input', applyFilters);
    document.getElementById('filterCategory').addEventListener('change', applyFilters);
    document.getElementById('btnAddClient').addEventListener('click', () => openClientModal(null));
}

function renderTable(clients) {
    const tbody = document.getElementById('clientsTableBody');
    if (!tbody) return;
    tbody.innerHTML = clients.map(c => `
    <tr>
      <td><strong>${escapeHTML(c.name)}</strong></td>
      <td>${escapeHTML(c.cedula)}</td>
      <td style="color:var(--text-secondary)">${escapeHTML(c.department)}</td>
      <td style="color:var(--text-secondary)">${escapeHTML(c.position)}</td>
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
            const client = getCollection('clients').find(c => c.id === btn.dataset.edit);
            if (client) openClientModal(client);
        };
    });

    tbody.querySelectorAll('[data-delete]').forEach(btn => {
        btn.onclick = () => {
            if (confirm('¿Eliminar este cliente?')) {
                deleteItem('clients', btn.dataset.delete);
                showToast('Cliente eliminado');
                renderClients();
            }
        };
    });

    tbody.querySelectorAll('[data-history]').forEach(btn => {
        btn.onclick = () => showClientHistory(btn.dataset.history);
    });
}

function openClientModal(client) {
    const isEdit = !!client;
    const c = client || {};
    const body = `
    <div class="form-row">
      <div class="form-group"><label>Nombre Completo</label><input type="text" class="form-control" id="mCliName" value="${isEdit ? escapeHTML(c.name) : ''}" required /></div>
      <div class="form-group"><label>Cédula de Identidad</label><input type="text" class="form-control" id="mCliCedula" value="${isEdit ? escapeHTML(c.cedula) : ''}" required /></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Departamento</label><input type="text" class="form-control" id="mCliDept" value="${isEdit ? escapeHTML(c.department) : ''}" /></div>
      <div class="form-group"><label>Cargo</label><input type="text" class="form-control" id="mCliPosition" value="${isEdit ? escapeHTML(c.position) : ''}" /></div>
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

    document.getElementById('btnSaveClient').onclick = () => {
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

        if (isEdit) {
            updateItem('clients', client.id, data);
            showToast('Cliente actualizado');
        } else {
            addItem('clients', { id: generateId(), ...data });
            showToast('Cliente registrado');
        }
        closeModal(overlay);
        renderClients();
    };
}

function showClientHistory(clientId) {
    const client = getCollection('clients').find(c => c.id === clientId);
    const sales = getCollection('sales').filter(s => s.clientId === clientId).sort((a, b) => new Date(b.date) - new Date(a.date));
    const totalSpent = sales.reduce((sum, s) => sum + s.total, 0);

    const body = `
    <div style="margin-bottom:1rem;display:flex;gap:1rem">
      <div class="card" style="flex:1;padding:1rem"><div class="kpi-label">Total Compras</div><div style="font-size:1.2rem;font-weight:700">${sales.length}</div></div>
      <div class="card" style="flex:1;padding:1rem"><div class="kpi-label">Total Gastado</div><div style="font-size:1.2rem;font-weight:700;color:var(--primary-light)">${formatCurrency(totalSpent)}</div></div>
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
}
