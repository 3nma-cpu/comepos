// ============================================
// Products Module
// ============================================

import { api } from '../api.js';
import { formatCurrency, createModal, closeModal, showToast, escapeHTML, PRODUCT_CATEGORIES } from '../utils.js';

const UNITS = ['UNI', 'KG', 'LTS'];
const UNIT_LABELS = { UNI: 'Unidades', KG: 'Kilogramos', LTS: 'Litros' };

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
                        <th>Código Barra</th>
                        <th>Categoría</th>
                        <th>Unidad</th>
                        <th>Costo (Compra)</th>
                        <th>Precio (Venta)</th>
                        <th>Stock</th>
                        <th>Acciones</th>
                    </tr>
                </thead>
                <tbody id="productTableBody"></tbody>
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
        tbody.innerHTML = data.map(p => {
            const unit = p.unit || 'UNI';
            const stockBadge = p.stock > 10 ? 'badge-success' : p.stock > 0 ? 'badge-warning' : 'badge-danger';
            return `
            <tr>
                <td><strong>${escapeHTML(p.name)}</strong>${p.forResale === false ? ' <span class="badge badge-warning" style="font-size:.65rem;margin-left:.35rem">Uso Interno</span>' : ''}</td>
                <td><code>${escapeHTML(p.barcode || '---')}</code></td>
                <td><span class="badge badge-info">${p.category}</span></td>
                <td><span class="badge badge-secondary">${unit}</span></td>
                <td>${formatCurrency(p.cost || 0)}</td>
                <td><strong>${formatCurrency(p.price)}</strong></td>
                <td>
                    <span class="badge ${stockBadge}">
                        ${Number(p.stock).toFixed(unit === 'UNI' ? 0 : 2)} ${unit}
                    </span>
                </td>
                <td>
                    <button class="btn btn-ghost btn-icon" data-edit="${p.id}"><i data-lucide="edit-2"></i></button>
                    <button class="btn btn-ghost btn-icon text-danger" data-delete="${p.id}"><i data-lucide="trash-2"></i></button>
                </td>
            </tr>`;
        }).join('');
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

export function showProductModal(product = null, onSuccess = null) {
    const isEdit = !!(product && product.id);
    const p = product || { name: '', category: 'Platos Principales', unit: 'UNI', price: '', cost: '', stock: 0 };

    const body = `
    <form id="frmProduct">
        <div class="form-row" style="gap:0.75rem">
            <div class="form-group" style="flex:2">
                <label>Nombre del Producto</label>
                <input type="text" class="form-control" id="mpName" value="${isEdit ? escapeHTML(p.name) : ''}" required />
            </div>
            <div class="form-group" style="flex:1">
                <label>Unidad de Medida</label>
                <select class="form-control" id="mpUnit">
                    ${UNITS.map(u => `<option value="${u}" ${(p.unit || 'UNI') === u ? 'selected' : ''}>${u} — ${UNIT_LABELS[u]}</option>`).join('')}
                </select>
            </div>
        </div>
        <div class="form-group">
            <label style="display:flex;justify-content:space-between">
                <span>Código de Barras</span>
                <label class="checkbox-container" style="margin:0;font-size:0.7rem;font-weight:normal">
                    <input type="checkbox" id="mpAutoBarcode" ${(!isEdit && !p.barcode) ? 'checked' : ''} />
                    <span class="checkmark" style="width:14px;height:14px"></span> Generar Automático
                </label>
            </label>
            <input type="text" class="form-control" id="mpBarcode" value="${escapeHTML(p.barcode || '')}" placeholder="Ej. 1000000001" ${(!isEdit && !p.barcode) ? 'disabled' : ''} />
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
                <input type="number" class="form-control" id="mpCost" value="${p.cost !== undefined ? p.cost : ''}" required min="0" step="any" />
            </div>
            <div class="form-group">
                <label>Precio de Venta (₲)</label>
                <input type="number" class="form-control" id="mpPrice" value="${p.price !== undefined ? p.price : ''}" required min="0" step="any" />
            </div>
        </div>
        <div class="form-group">
            <label>Stock</label>
            <input type="number" class="form-control" id="mpStock" value="${p.stock !== undefined ? p.stock : 0}" required min="${isEdit ? p.stock : 0}" step="any" />
            ${isEdit ? `<small style="color:var(--text-muted)">El stock no puede ser menor a ${p.stock} desde esta pantalla.</small>` : ''}
        </div>
        <div class="form-group">
            <label class="checkbox-container" style="font-size:0.9rem">
                <input type="checkbox" id="mpForResale" ${p.forResale !== false ? 'checked' : ''} />
                <span class="checkmark"></span> Para Venta (Comercialización)
            </label>
            <small style="color:var(--text-muted);display:block;margin-top:0.2rem">
                Si se desmarca, las compras de este producto no sumarán stock por defecto.
            </small>
        </div>
    </form>`;

    const footer = `
    <button class="btn btn-secondary modal-close">Cancelar</button>
    <button class="btn btn-primary" id="btnSaveProduct">${isEdit ? 'Guardar Cambios' : 'Crear Producto'}</button>`;

    const modal = createModal(isEdit ? 'Editar Producto' : 'Nuevo Producto', body, footer);

    const markup = 40;
    const costInput = document.getElementById('mpCost');
    const priceInput = document.getElementById('mpPrice');
    const autoBarcode = document.getElementById('mpAutoBarcode');
    const barcodeInput = document.getElementById('mpBarcode');

    if (autoBarcode && barcodeInput) {
        autoBarcode.addEventListener('change', () => {
            barcodeInput.disabled = autoBarcode.checked;
            if (autoBarcode.checked) barcodeInput.value = '';
        });
    }

    // Click-to-apply: clicking the price field applies markup from cost
    priceInput.addEventListener('click', () => {
        const cost = parseFloat(costInput.value) || 0;
        if (cost > 0) {
            priceInput.value = Math.round(cost * (1 + markup / 100));
            priceInput.style.transition = 'box-shadow 0.3s';
            priceInput.style.boxShadow = '0 0 0 2px var(--success)';
            setTimeout(() => { priceInput.style.boxShadow = ''; }, 600);
        }
    });

    document.getElementById('btnSaveProduct').onclick = async () => {
        const frm = document.getElementById('frmProduct');
        if (!frm.checkValidity()) { frm.reportValidity(); return; }

        const btnSave = document.getElementById('btnSaveProduct');
        btnSave.disabled = true;
        btnSave.textContent = 'Guardando...';

        let barcodeVal = document.getElementById('mpBarcode').value.trim();
        if (document.getElementById('mpAutoBarcode').checked) barcodeVal = 'auto';

        const data = {
            name: document.getElementById('mpName').value.trim(),
            barcode: barcodeVal,
            category: document.getElementById('mpCategory').value,
            unit: document.getElementById('mpUnit').value,
            cost: parseFloat(document.getElementById('mpCost').value) || 0,
            price: parseFloat(document.getElementById('mpPrice').value) || 0,
            forResale: document.getElementById('mpForResale').checked,
        };
        data.stock = parseFloat(document.getElementById('mpStock').value) || 0;

        try {
            let res;
            if (isEdit) {
                res = await api.put(`/products/${p.id}`, data);
            } else {
                res = await api.post('/products', data);
            }
            closeModal(modal);
            showToast(isEdit ? 'Producto actualizado' : 'Producto creado');
            if (typeof onSuccess === 'function') {
                onSuccess(res);
            } else {
                renderProducts();
            }
        } catch (err) {
            showToast(err.message, 'error');
            btnSave.disabled = false;
            btnSave.textContent = isEdit ? 'Guardar Cambios' : 'Crear Producto';
        }
    };
}

async function deleteProduct(id) {
    if (!confirm('¿Está seguro de eliminar este producto? Quedará desactivado.')) return;
    try {
        await api.delete(`/products/${id}`);
        showToast('Producto eliminado');
        renderProducts();
    } catch (err) {
        showToast('Error al eliminar: ' + err.message, 'error');
    }
}
