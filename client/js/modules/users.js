// ============================================
// Users Module
// ============================================

import { getCollection, addItem, updateItem, deleteItem } from '../store.js';
import { generateId, showToast, createModal, closeModal, escapeHTML } from '../utils.js';

export function renderUsers() {
    const container = document.getElementById('module-content');
    const users = getCollection('users');
    const roles = getCollection('roles');
    const roleMap = {};
    roles.forEach(r => roleMap[r.id] = r.name);

    container.innerHTML = `
    <div class="fade-in">
      <div class="filters-bar">
        <div class="search-bar">
          <i data-lucide="search"></i>
          <input type="text" class="form-control" id="searchUsers" placeholder="Buscar usuarios..." />
        </div>
        <button class="btn btn-primary" id="btnAddUser"><i data-lucide="plus"></i>Nuevo Usuario</button>
      </div>
      <div class="table-container">
        <table>
          <thead><tr><th>Nombre</th><th>Usuario</th><th>Email</th><th>Rol</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody id="usersTableBody"></tbody>
        </table>
      </div>
    </div>`;

    if (window.lucide) lucide.createIcons();
    renderTable(users, roleMap);

    document.getElementById('searchUsers').addEventListener('input', e => {
        const q = e.target.value.toLowerCase();
        const filtered = users.filter(u => u.name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q));
        renderTable(filtered, roleMap);
    });

    document.getElementById('btnAddUser').addEventListener('click', () => openUserModal(null, roles));
}

function renderTable(users, roleMap) {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;
    tbody.innerHTML = users.map(u => `
    <tr>
      <td><strong>${escapeHTML(u.name)}</strong></td>
      <td>${escapeHTML(u.username)}</td>
      <td style="color:var(--text-secondary)">${escapeHTML(u.email)}</td>
      <td><span class="badge badge-primary">${roleMap[u.roleId] || 'Sin rol'}</span></td>
      <td><span class="badge ${u.active ? 'badge-success' : 'badge-danger'}">${u.active ? 'Activo' : 'Inactivo'}</span></td>
      <td>
        <button class="btn btn-ghost btn-sm btn-icon" data-edit="${u.id}" title="Editar"><i data-lucide="pencil"></i></button>
        <button class="btn btn-ghost btn-sm btn-icon" data-toggle="${u.id}" title="${u.active ? 'Desactivar' : 'Activar'}"><i data-lucide="${u.active ? 'user-x' : 'user-check'}"></i></button>
      </td>
    </tr>`).join('');
    if (window.lucide) lucide.createIcons();

    tbody.querySelectorAll('[data-edit]').forEach(btn => {
        btn.onclick = () => {
            const user = getCollection('users').find(u => u.id === btn.dataset.edit);
            if (user) openUserModal(user, getCollection('roles'));
        };
    });

    tbody.querySelectorAll('[data-toggle]').forEach(btn => {
        btn.onclick = () => {
            const user = getCollection('users').find(u => u.id === btn.dataset.toggle);
            if (user) {
                updateItem('users', user.id, { active: !user.active });
                showToast(`Usuario ${user.active ? 'desactivado' : 'activado'}`);
                renderUsers();
            }
        };
    });
}

function openUserModal(user, roles) {
    const isEdit = !!user;
    const body = `
    <div class="form-row">
      <div class="form-group"><label>Nombre Completo</label><input type="text" class="form-control" id="mUserName" value="${isEdit ? escapeHTML(user.name) : ''}" required /></div>
      <div class="form-group"><label>Usuario</label><input type="text" class="form-control" id="mUserUsername" value="${isEdit ? escapeHTML(user.username) : ''}" required /></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Email</label><input type="email" class="form-control" id="mUserEmail" value="${isEdit ? escapeHTML(user.email) : ''}" required /></div>
      <div class="form-group"><label>Contraseña${isEdit ? ' (dejar vacío para mantener)' : ''}</label><input type="password" class="form-control" id="mUserPass" ${isEdit ? '' : 'required'} /></div>
    </div>
    <div class="form-group">
      <label>Rol</label>
      <select class="form-control" id="mUserRole">
        ${roles.map(r => `<option value="${r.id}" ${isEdit && user.roleId === r.id ? 'selected' : ''}>${r.name}</option>`).join('')}
      </select>
    </div>`;
    const footer = `<button class="btn btn-secondary modal-close">Cancelar</button><button class="btn btn-primary" id="btnSaveUser">${isEdit ? 'Guardar' : 'Crear'}</button>`;
    const overlay = createModal(isEdit ? 'Editar Usuario' : 'Nuevo Usuario', body, footer);

    document.getElementById('btnSaveUser').onclick = () => {
        const name = document.getElementById('mUserName').value.trim();
        const username = document.getElementById('mUserUsername').value.trim();
        const email = document.getElementById('mUserEmail').value.trim();
        const password = document.getElementById('mUserPass').value;
        const roleId = document.getElementById('mUserRole').value;
        if (!name || !username || !email) return showToast('Complete todos los campos', 'error');
        if (!isEdit && !password) return showToast('Ingrese una contraseña', 'error');

        if (isEdit) {
            const updates = { name, username, email, roleId };
            if (password) updates.password = password;
            updateItem('users', user.id, updates);
            showToast('Usuario actualizado');
        } else {
            addItem('users', { id: generateId(), name, username, email, password, roleId, active: true });
            showToast('Usuario creado');
        }
        closeModal(overlay);
        renderUsers();
    };
}
