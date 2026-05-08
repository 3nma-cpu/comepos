// ============================================
// Utils — Helper functions
// ============================================

export function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

export function formatCurrency(amount) {
    return '₲ ' + Math.round(amount).toLocaleString('es-PY');
}

export function formatDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateTime(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' +
        d.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' });
}

export function formatDateInput(date) {
    const d = new Date(date);
    return d.toISOString().split('T')[0];
}

export function todayStr() {
    return new Date().toISOString().split('T')[0];
}

export function daysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString();
}

export function showToast(message, type = 'success') {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icons = { success: 'check-circle', error: 'alert-circle', info: 'info' };
    toast.innerHTML = `<i data-lucide="${icons[type] || 'info'}"></i><span>${message}</span>`;
    container.appendChild(toast);
    if (window.lucide) lucide.createIcons();
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(100px)'; setTimeout(() => toast.remove(), 300); }, 3000);
}

export function createModal(title, bodyHTML, footerHTML = '') {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h3>${title}</h3>
        <button class="btn btn-ghost btn-icon modal-close"><i data-lucide="x"></i></button>
      </div>
      <div class="modal-body">${bodyHTML}</div>
      ${footerHTML ? `<div class="modal-footer">${footerHTML}</div>` : ''}
    </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('active'));
    overlay.querySelector('.modal-close').onclick = () => closeModal(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(overlay); });
    if (window.lucide) lucide.createIcons();
    return overlay;
}

export function closeModal(overlay) {
    if (!overlay) return;
    overlay.classList.remove('active');
    setTimeout(() => overlay.remove(), 300);
}

export function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

export function debounce(fn, ms = 300) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export function exportCSV(headers, rows, filename) {
    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
}

export const EMPLOYEE_CATEGORIES = [
    'Directivo', 'Gerente', 'Jefe de Área', 'Analista',
    'Asistente', 'Operario', 'Practicante', 'Contratista'
];

export const PRODUCT_CATEGORIES = [
    'Platos Principales', 'Bebidas', 'Postres', 'Entradas', 'Extras'
];

export const PAYMENT_METHODS = [
    { id: 'efectivo', name: 'Efectivo' },
    { id: 'tarjeta', name: 'Tarjeta' },
    { id: 'nomina', name: 'Descuento por Nómina' }
];

export const CATEGORY_BADGE_COLORS = {
    'Directivo': 'badge-purple',
    'Gerente': 'badge-primary',
    'Jefe de Área': 'badge-info',
    'Analista': 'badge-success',
    'Asistente': 'badge-warning',
    'Operario': 'badge-danger',
    'Practicante': 'badge-info',
    'Contratista': 'badge-warning'
};
