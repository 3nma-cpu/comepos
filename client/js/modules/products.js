// ============================================
// Products Module
// ============================================

import { api } from '../api.js';
import { formatCurrency, createModal, closeModal, escapeHTML, PRODUCT_CATEGORIES } from '../utils.js';

export async function renderProducts() {
    const container = document.getElementById('module-content');
    container.innerHTML = '<div class="empty-state"><p>Cargando productos...</p></div>';

    try {
        const products = await api.get('/products');
        renderProductList(container, products);
    } catch (e) {
        container.innerHTML = `<div class="empty-state"><p>Error al cargar: ${e.message}</p></div>`;
    }
}

function renderProductList(container, products) {
    container.innerHTML = `
    <div class="fade-in">
        <div class="filters-bar">
            <div class="search-bar">
                <i data-lucide="search"></i>
                <input type="text" class="form-control" id="searchProduct" placeholder="Buscar producto..." />
            </div>
            <button class="btn btn-primary" id="btnAddProduct"><i data-lucide="plus"></i>Nuevo Producto</button>
        </div>
        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th>Nombre</th>
                        <th>Categoría</th>
                        <th>Costo (Compra)</th>
                        <th>Precio (Venta)</th>
                        <th>Stock</th>
                        <th>Acciones</th>
                    </tr>
                </thead>
                <tbody id="productTableBody">
                    <!-- Populated via JS -->
                </tbody>
            </table>
        </div>
    </div>`;

    if (window.lucide) lucide.createIcons();

    const tbody = document.getElementById('productTableBody');

    function renderRows(data) {
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center">No se encontraron productos.</td></tr>';
            return;
        }
        tbody.innerHTML = data.map(p => `
            <tr>
                <td><strong>${escapeHTML(p.name)}</strong></td>
                <td><span class="badge badge-info">${p.category}</span></td>
                <td>${formatCurrency(p.cost || 0)}</td>
                <td><strong>${formatCurrency(p.price)}</strong></td>
                <td>
                    <span class="badge ${p.stock > 10 ? 'badge-success' : p.stock > 0 ? 'badge-warning' : 'badge-danger'}">
                        ${p.stock} ${p.unit || 'UNI'}
                    </span>
                </td>
                <td>
                    <button class="btn btn-ghost btn-icon" data-edit="${p.id}"><i data-lucide="edit-2"></i></button>
                    <button class="btn btn-ghost btn-icon text-danger" data-delete="${p.id}"><i data-lucide="trash-2"></i></button>
                </td>
            </tr>
        `).join('');
        if (window.lucide) lucide.createIcons();
    }

    renderRows(products);

    document.getElementById('searchProduct').addEventListener('input', e => {
        const q = e.target.value.toLowerCase();
        renderRows(products.filter(p => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)));
    });

    document.getElementById('btnAddProduct').addEventListener('click', () => showProductModal(null));
    
    tbody.addEventListener('click', e => {
        const editBtn = e.target.closest('[data-edit]');
        const delBtn = e.target.closest('[data-delete]');
        if (editBtn) showProductModal(products.find(p => p.id === editBtn.dataset.edit));
        if (delBtn) deleteProduct(delBtn.dataset.delete);
    });
}

function showProductModal(product = null) {
    const isEdit = !!product;
    const p = product || { name: '', category: 'Platos Principales', price: '', cost: '', stock: 0, emoji: '🍽️' };

    const body = `
    <form id="frmProduct">
        <div class="form-row">
            <div class="form-group" style="flex: 2">
                <label>Nombre del Producto</label>
                <input type="text" class="form-control" id="mpName" value="${isEdit ? escapeHTML(p.name) : ''}" required />
            </div>
            <div class="form-group" style="flex: 1">
                <label>Medida</label>
                <select class="form-control" id="mpUnit">
                    <option value="UNI" ${p.unit === 'UNI' ? 'selected' : ''}>UNI</option>
                    <option value="KG" ${p.unit === 'KG' ? 'selected' : ''}>KG</option>
                    <option value="LTS" ${p.unit === 'LTS' ? 'selected' : ''}>LTS</option>
                </select>
            </div>
        </div>
        <div class="form-group">
            <label>Categoría</label>
            <select class="form-control" id="mpCategory">
                ${PRODUCT_CATEGORIES.map(c => `<option value="${c}" ${p.category === c ? 'selected' : ''}>${c}</option>`).join('')}
            </select>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>Precio de Compra (Costo ₲)</label>
                <input type="number" class="form-control" id="mpCost" value="${p.cost}" required min="0" />
            </div>
            <div class="form-group">
                <label>Precio de Venta (₲)</label>
                <input type="number" class="form-control" id="mpPrice" value="${p.price}" required min="0" />
            </div>
        </div>
        <div class="form-group">
            <label>Stock Inicial</label>
            <input type="number" step="any" class="form-control" id="mpStock" value="${p.stock}" ${isEdit ? 'disabled' : 'required min="0"'} />
            ${isEdit ? '<small style="color:var(--text-muted)">El stock se gestiona mediante compras y ventas.</small>' : ''}
        </div>
    </form>`;

    const footer = `
    <button class="btn btn-secondary" onclick="closeModal(this.closest('.modal-overlay'))">Cancelar</button>
    <button class="btn btn-primary" id="btnSaveProduct">${isEdit ? 'Guardar Cambios' : 'Crear Producto'}</button>`;

    const modal = createModal(isEdit ? 'Editar Producto' : 'Nuevo Producto', body, footer);

    const markup = parseFloat(localStorage.getItem('purchMarkup')) || 30;
    const costInput = document.getElementById('mpCost');
    const priceInput = document.getElementById('mpPrice');

    costInput.addEventListener('input', () => {
        const cost = parseFloat(costInput.value) || 0;
        priceInput.value = Math.round(cost * (1 + markup / 100));
    });

    document.getElementById('btnSaveProduct').onclick = async () => {
        const frm = document.getElementById('frmProduct');
        if (!frm.checkValidity()) { frm.reportValidity(); return; }

        const data = {
            name: document.getElementById('mpName').value,
            unit: document.getElementById('mpUnit').value,
            category: document.getElementById('mpCategory').value,
            cost: parseInt(document.getElementById('mpCost').value) || 0,
            price: parseInt(document.getElementById('mpPrice').value) || 0,
            stock: parseFloat(document.getElementById('mpStock').value) || 0
        };

        const btnSave = document.getElementById('btnSaveProduct');
        btnSave.disabled = true;
        btnSave.innerHTML = '<i data-lucide="loader"></i> Guardando...';
        if (window.lucide) lucide.createIcons();

        try {
            if (isEdit) {
                delete data.stock; // No se puede editar el stock manualmente
                await api.put(`/products/${p.id}`, data);
            } else {
                await api.post('/products', data);
            }
            closeModal(modal);
            import('../utils.js').then(m => m.showToast(isEdit ? 'Producto actualizado' : 'Producto creado'));
            renderProducts();
        } catch (err) {
            import('../utils.js').then(m => m.showToast(err.message, 'error'));
            btnSave.disabled = false;
            btnSave.innerHTML = isEdit ? 'Guardar Cambios' : 'Crear Producto';
            if (window.lucide) lucide.createIcons();
        }
    };
}

async function deleteProduct(id) {
    if (!confirm('¿Está seguro de eliminar este producto? Esto lo desactivará y no podrá ser usado en nuevas ventas.')) return;
    try {
        await api.delete(`/products/${id}`);
        import('../utils.js').then(m => m.showToast('Producto eliminado'));
        renderProducts();
    } catch (err) {
        alert('Error al eliminar: ' + err.message);
    }
}
