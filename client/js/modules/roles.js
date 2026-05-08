// ============================================
// Roles Module
// ============================================

import { getCollection, addItem, updateItem, deleteItem } from '../store.js';
import { generateId, showToast, createModal, closeModal, escapeHTML } from '../utils.js';

const ALL_PERMISSIONS = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'users', label: 'Usuarios' },
    { id: 'roles', label: 'Roles' },
    { id: 'clients', label: 'Clientes' },
    { id: 'purchases', label: 'Compras' },
    { id: 'sales', label: 'Ventas' },
    { id: 'reports', label: 'Reportes' }
];

export function renderRoles() {
    const container = document.getElementById('module-content');
    const roles = getCollection('roles');

    container.innerHTML = `
    <div class="fade-in">
      <div class="filters-bar">
        <div style="flex:1"></div>
        <button class="btn btn-primary" id="btnAddRole"><i data-lucide="plus"></i>Nuevo Rol</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:1rem" id="rolesGrid"></div>
    </div>`;

    if (window.lucide) lucide.createIcons();
    renderRolesGrid(roles);
    document.getElementById('btnAddRole').addEventListener('click', () => openRoleModal(null));
}

function renderRolesGrid(roles) {
    const grid = document.getElementById('rolesGrid');
    if (!grid) return;
    grid.innerHTML = roles.map(r => `
    <div class="card">
      <div class="card-header">
        <div>
          <h3 class="card-title">${escapeHTML(r.name)}</h3>
          <p class="card-subtitle">${escapeHTML(r.description || '')}</p>
        </div>
        <div style="display:flex;gap:.25rem">
          <button class="btn btn-ghost btn-sm btn-icon" data-edit="${r.id}" title="Editar"><i data-lucide="pencil"></i></button>
          ${!r.protected ? `<button class="btn btn-ghost btn-sm btn-icon" data-delete="${r.id}" title="Eliminar"><i data-lucide="trash-2"></i></button>` : ''}
        </div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:.35rem">
        ${r.permissions.map(p => `<span class="badge badge-primary">${ALL_PERMISSIONS.find(ap => ap.id === p)?.label || p}</span>`).join('')}
      </div>
    </div>`).join('');
    if (window.lucide) lucide.createIcons();

    grid.querySelectorAll('[data-edit]').forEach(btn => {
        btn.onclick = () => {
            const role = getCollection('roles').find(r => r.id === btn.dataset.edit);
            if (role) openRoleModal(role);
        };
    });

    grid.querySelectorAll('[data-delete]').forEach(btn => {
        btn.onclick = () => {
            if (confirm('¿Eliminar este rol?')) {
                deleteItem('roles', btn.dataset.delete);
                showToast('Rol eliminado');
                renderRoles();
            }
        };
    });
}

function openRoleModal(role) {
    const isEdit = !!role;
    const body = `
    <div class="form-group"><label>Nombre del Rol</label><input type="text" class="form-control" id="mRoleName" value="${isEdit ? escapeHTML(role.name) : ''}" ${isEdit && role.protected ? 'disabled' : ''} /></div>
    <div class="form-group"><label>Descripción</label><input type="text" class="form-control" id="mRoleDesc" value="${isEdit ? escapeHTML(role.description || '') : ''}" /></div>
    <div class="form-group"><label>Permisos</label>
      <div class="permissions-grid">
        ${ALL_PERMISSIONS.map(p => `
          <label class="permission-item">
            <input type="checkbox" value="${p.id}" ${isEdit && role.permissions.includes(p.id) ? 'checked' : ''} />
            ${p.label}
          </label>`).join('')}
      </div>
    </div>`;
    const footer = `<button class="btn btn-secondary modal-close">Cancelar</button><button class="btn btn-primary" id="btnSaveRole">${isEdit ? 'Guardar' : 'Crear'}</button>`;
    const overlay = createModal(isEdit ? 'Editar Rol' : 'Nuevo Rol', body, footer);

    document.getElementById('btnSaveRole').onclick = () => {
        const name = document.getElementById('mRoleName').value.trim();
        const description = document.getElementById('mRoleDesc').value.trim();
        const permissions = [...overlay.querySelectorAll('.permission-item input:checked')].map(cb => cb.value);
        if (!name) return showToast('Ingrese un nombre', 'error');
        if (permissions.length === 0) return showToast('Seleccione al menos un permiso', 'error');

        if (isEdit) {
            updateItem('roles', role.id, { name: role.protected ? role.name : name, description, permissions });
            showToast('Rol actualizado');
        } else {
            addItem('roles', { id: generateId(), name, description, permissions, protected: false });
            showToast('Rol creado');
        }
        closeModal(overlay);
        renderRoles();
    };
}
