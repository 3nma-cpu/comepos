// ============================================
// Profile — User profile modal
// ============================================

import { api } from '../api.js';
import { createModal, closeModal, showToast, escapeHTML } from '../utils.js';

/**
 * Resize an image file to a max dimension and return as data URL.
 */
function resizeImage(file, maxSize = 128) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; }
        else { w = Math.round(w * maxSize / h); h = maxSize; }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/webp', 0.85));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function getInitials(name) {
  return (name || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

/**
 * Opens the profile modal. Call refreshSidebar() after save to update the sidebar.
 * @param {Function} refreshSidebar - callback to refresh sidebar user area after changes
 */
export async function showProfileModal(refreshSidebar) {
  let profile;
  try {
    profile = await api.get('/profile');
  } catch (err) {
    showToast('Error al cargar perfil: ' + err.message, 'error');
    return;
  }

  let pendingAvatarUrl = profile.avatarUrl || null;
  let avatarChanged = false;

  const avatarDisplay = pendingAvatarUrl
    ? `<img src="${pendingAvatarUrl}" alt="Avatar" />`
    : `<span class="profile-avatar-initials">${getInitials(profile.name)}</span>`;

  const body = `
    <div class="profile-modal-content">
      <div class="profile-avatar-section">
        <div class="profile-avatar-wrapper" id="profileAvatarWrapper">
          <div class="profile-avatar" id="profileAvatarDisplay">
            ${avatarDisplay}
          </div>
          <div class="profile-avatar-overlay" id="profileAvatarOverlay">
            <i data-lucide="camera"></i>
          </div>
        </div>
        <input type="file" id="profileAvatarInput" accept="image/*" style="display:none" />
        ${pendingAvatarUrl ? '<button class="btn btn-ghost btn-sm" id="profileRemoveAvatar" style="margin-top:6px;font-size:.75rem;color:var(--danger)">Quitar foto</button>' : ''}
      </div>

      <div class="profile-form">
        <div class="form-group">
          <label for="profileName">Nombre Completo</label>
          <input type="text" class="form-control" id="profileName" value="${escapeHTML(profile.name)}" required />
        </div>
        <div class="form-group">
          <label for="profileUsername">Usuario</label>
          <input type="text" class="form-control" id="profileUsername" value="${escapeHTML(profile.username)}" required />
        </div>
        <div class="form-group">
          <label for="profileEmail">Correo Electrónico</label>
          <input type="email" class="form-control" id="profileEmail" value="${escapeHTML(profile.email)}" required />
        </div>
        <div class="form-group">
          <label>Rol</label>
          <input type="text" class="form-control" value="${escapeHTML(profile.roleName)}" disabled style="opacity:0.6;cursor:not-allowed" />
        </div>

        <div class="profile-password-section">
          <button class="btn btn-ghost btn-sm" id="profileTogglePassword" type="button" style="width:100%;justify-content:flex-start;gap:6px;font-weight:600">
            <i data-lucide="lock"></i> Cambiar Contraseña
            <i data-lucide="chevron-down" style="margin-left:auto"></i>
          </button>
          <div class="profile-password-fields" id="profilePasswordFields" style="display:none">
            <div class="form-group">
              <label for="profileCurrentPass">Contraseña Actual</label>
              <input type="password" class="form-control" id="profileCurrentPass" placeholder="Ingrese su contraseña actual" autocomplete="current-password" />
            </div>
            <div class="form-group">
              <label for="profileNewPass">Nueva Contraseña</label>
              <input type="password" class="form-control" id="profileNewPass" placeholder="Mínimo 6 caracteres" autocomplete="new-password" />
            </div>
            <div class="form-group">
              <label for="profileConfirmPass">Confirmar Nueva Contraseña</label>
              <input type="password" class="form-control" id="profileConfirmPass" placeholder="Repita la nueva contraseña" autocomplete="new-password" />
            </div>
          </div>
        </div>
      </div>
    </div>`;

  const footer = `
    <button class="btn btn-ghost modal-close">Cancelar</button>
    <button class="btn btn-primary" id="profileSaveBtn">
      <i data-lucide="save"></i> Guardar Cambios
    </button>`;

  const modal = createModal('Mi Perfil', body, footer);
  if (window.lucide) lucide.createIcons();

  // Avatar click → open file picker
  const avatarWrapper = document.getElementById('profileAvatarWrapper');
  const avatarInput = document.getElementById('profileAvatarInput');
  avatarWrapper.addEventListener('click', () => avatarInput.click());

  avatarInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Seleccione un archivo de imagen válido', 'error');
      return;
    }
    try {
      pendingAvatarUrl = await resizeImage(file, 128);
      avatarChanged = true;
      const avatarEl = document.getElementById('profileAvatarDisplay');
      avatarEl.innerHTML = `<img src="${pendingAvatarUrl}" alt="Avatar" />`;
      // Add remove button if not present
      if (!document.getElementById('profileRemoveAvatar')) {
        const removeBtn = document.createElement('button');
        removeBtn.className = 'btn btn-ghost btn-sm';
        removeBtn.id = 'profileRemoveAvatar';
        removeBtn.style.cssText = 'margin-top:6px;font-size:.75rem;color:var(--danger)';
        removeBtn.textContent = 'Quitar foto';
        removeBtn.onclick = () => {
          pendingAvatarUrl = null;
          avatarChanged = true;
          avatarEl.innerHTML = `<span class="profile-avatar-initials">${getInitials(document.getElementById('profileName').value || profile.name)}</span>`;
          removeBtn.remove();
        };
        document.querySelector('.profile-avatar-section').appendChild(removeBtn);
      }
    } catch (err) {
      showToast('Error al procesar la imagen', 'error');
    }
  });

  // Remove avatar button (if exists on initial render)
  const removeBtn = document.getElementById('profileRemoveAvatar');
  if (removeBtn) {
    removeBtn.addEventListener('click', () => {
      pendingAvatarUrl = null;
      avatarChanged = true;
      const avatarEl = document.getElementById('profileAvatarDisplay');
      avatarEl.innerHTML = `<span class="profile-avatar-initials">${getInitials(document.getElementById('profileName').value || profile.name)}</span>`;
      removeBtn.remove();
    });
  }

  // Toggle password section
  document.getElementById('profileTogglePassword').addEventListener('click', () => {
    const fields = document.getElementById('profilePasswordFields');
    const isHidden = fields.style.display === 'none';
    fields.style.display = isHidden ? 'block' : 'none';
  });

  // Save
  document.getElementById('profileSaveBtn').addEventListener('click', async () => {
    const btn = document.getElementById('profileSaveBtn');
    const name = document.getElementById('profileName').value.trim();
    const username = document.getElementById('profileUsername').value.trim();
    const email = document.getElementById('profileEmail').value.trim();
    const currentPassword = document.getElementById('profileCurrentPass').value;
    const newPassword = document.getElementById('profileNewPass').value;
    const confirmPassword = document.getElementById('profileConfirmPass').value;

    if (!name || !username || !email) {
      showToast('Complete todos los campos obligatorios', 'error');
      return;
    }

    // Validate password fields if user is trying to change password
    if (newPassword || confirmPassword || currentPassword) {
      if (!currentPassword) {
        showToast('Ingrese su contraseña actual', 'error');
        return;
      }
      if (!newPassword) {
        showToast('Ingrese la nueva contraseña', 'error');
        return;
      }
      if (newPassword.length < 6) {
        showToast('La nueva contraseña debe tener al menos 6 caracteres', 'error');
        return;
      }
      if (newPassword !== confirmPassword) {
        showToast('Las contraseñas no coinciden', 'error');
        return;
      }
    }

    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Guardando...';
    if (window.lucide) lucide.createIcons();

    try {
      // Save avatar if changed
      if (avatarChanged) {
        await api.put('/profile/avatar', { avatarUrl: pendingAvatarUrl });
      }

      // Build profile update payload
      const payload = { name, username, email };
      if (newPassword) {
        payload.currentPassword = currentPassword;
        payload.newPassword = newPassword;
      }

      const updated = await api.put('/profile', payload);

      // Update local session
      const session = JSON.parse(localStorage.getItem('comepos_session') || '{}');
      session.name = updated.name;
      session.username = updated.username;
      session.email = updated.email;
      session.avatarUrl = avatarChanged ? pendingAvatarUrl : (updated.avatarUrl || session.avatarUrl);
      localStorage.setItem('comepos_session', JSON.stringify(session));

      showToast('Perfil actualizado correctamente', 'success');
      closeModal(modal);

      // Refresh sidebar
      if (typeof refreshSidebar === 'function') {
        refreshSidebar();
      }
    } catch (err) {
      showToast(err.message || 'Error al guardar', 'error');
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="save"></i> Guardar Cambios';
      if (window.lucide) lucide.createIcons();
    }
  });
}
