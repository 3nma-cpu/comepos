// ============================================
// Utils — Helper functions
// ============================================

export function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

export function formatCurrency(amount) {
    return '₲ ' + Math.round(amount).toLocaleString('es-PY');
}

function adjustDateStr(dateStr) {
    if (typeof dateStr === 'string') {
        if (dateStr.endsWith('T00:00:00.000Z')) return dateStr.replace('T00:00:00.000Z', 'T12:00:00.000Z');
        if (dateStr.length === 10) return dateStr + 'T12:00:00.000Z';
    }
    return dateStr;
}

export function formatDate(dateStr) {
    const d = new Date(adjustDateStr(dateStr));
    return d.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateTime(dateStr) {
    const d = new Date(adjustDateStr(dateStr));
    return d.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' +
        d.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' });
}

export function toLocalYMD(dateStr) {
    const d = new Date(adjustDateStr(dateStr));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formatDateInput(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function daysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
    
    // Attach close handler to all close buttons (header X and footer buttons)
    overlay.querySelectorAll('.modal-close').forEach(btn => {
        btn.onclick = () => closeModal(overlay);
    });

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

export function exportExcel(headers, rows, filename) {
    const ws_data = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Reporte");
    
    // Check if filename already has .xlsx, otherwise append it
    const finalFilename = filename.endsWith('.xlsx') ? filename : filename.replace('.csv', '.xlsx') + (!filename.includes('.') ? '.xlsx' : '');
    XLSX.writeFile(wb, finalFilename);
}

export const EMPLOYEE_CATEGORIES = [
    'ADM', 'CHOFER'
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
    'ADM': 'badge-primary',
    'CHOFER': 'badge-warning'
};
