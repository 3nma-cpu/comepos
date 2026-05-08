// ============================================
// Purchases Module
// ============================================

import { getCollection, addItem, updateItem, deleteItem } from '../store.js';
import { generateId, showToast, createModal, closeModal, escapeHTML, formatCurrency, formatDate, PRODUCT_CATEGORIES } from '../utils.js';

export function renderPurchases() {
    const container = document.getElementById('module-content');
    container.innerHTML = `
    <div class="fade-in">
      <div class="category-tabs" id="purchaseTabs">
        <div class="category-tab active" data-tab="purchases">Compras</div>
        <div class="category-tab" data-tab="products">Productos</div>
        <div class="category-tab" data-tab="providers">Proveedores</div>
      </div>
      <div id="purchaseTabContent"></div>
    </div>`;

    if (window.lucide) lucide.createIcons();
    let currentTab = 'purchases';

    function showTab(tab) {
        currentTab = tab;
        document.querySelectorAll('#purchaseTabs .category-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
        if (tab === 'purchases') renderPurchasesList();
        else if (tab === 'products') renderProductsList();
        else renderProvidersList();
    }

    document.getElementById('purchaseTabs').addEventListener('click', e => {
        const tab = e.target.closest('.category-tab');
        if (tab) showTab(tab.dataset.tab);
    });

    showTab('purchases');
}

function renderPurchasesList() {
    const content = document.getElementById('purchaseTabContent');
    const purchases = getCollection('purchases').sort((a, b) => new Date(b.date) - new Date(a.date));

    content.innerHTML = `
    <div class="filters-bar">
      <div style="flex:1"></div>
      <button class="btn btn-primary" id="btnAddPurchase"><i data-lucide="plus"></i>Nueva Compra</button>
    </div>
    <div class="table-container">
      <table>
        <thead><tr><th>Fecha</th><th>Proveedor</th><th>Productos</th><th>Total</th><th>Acciones</th></tr></thead>
        <tbody>${purchases.map(p => `
          <tr>
            <td>${formatDate(p.date)}</td>
            <td><strong>${escapeHTML(p.providerName)}</strong></td>
            <td style="color:var(--text-secondary);font-size:.82rem">${p.items.map(i => `${i.name} x${i.quantity}`).join(', ')}</td>
            <td><strong style="color:var(--primary-light)">${formatCurrency(p.total)}</strong></td>
            <td><button class="btn btn-ghost btn-sm btn-icon" data-del="${p.id}"><i data-lucide="trash-2"></i></button></td>
          </tr>`).join('')}</tbody>
      </table>
    </div>`;
    if (window.lucide) lucide.createIcons();

    document.getElementById('btnAddPurchase')?.addEventListener('click', () => openPurchaseModal());
    content.querySelectorAll('[data-del]').forEach(btn => {
        btn.onclick = () => { if (confirm('¿Eliminar compra?')) { deleteItem('purchases', btn.dataset.del); renderPurchases(); showToast('Compra eliminada'); } };
    });
}

function openPurchaseModal() {
    const providers = getCollection('providers');
    const products = getCollection('products');
    const body = `
    <div class="form-group"><label>Proveedor</label>
      <select class="form-control" id="mPurchProv">${providers.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}</select>
    </div>
    <div class="form-group"><label>Productos</label><div id="mPurchItems"></div>
      <button class="btn btn-secondary btn-sm" id="btnAddPurchItem" style="margin-top:.5rem"><i data-lucide="plus"></i>Agregar Producto</button>
    </div>
    <div id="mPurchTotal" style="text-align:right;font-weight:700;font-size:1.1rem;margin-top:.5rem"></div>`;
    const footer = `<button class="btn btn-secondary modal-close">Cancelar</button><button class="btn btn-primary" id="btnSavePurch">Registrar Compra</button>`;
    const overlay = createModal('Nueva Compra', body, footer);
    let items = [];

    function addItemRow() {
        const idx = items.length;
        items.push({ productId: products[0]?.id || '', quantity: 1 });
        renderItems();
    }

    function renderItems() {
        const container = document.getElementById('mPurchItems');
        container.innerHTML = items.map((it, i) => `
      <div style="display:flex;gap:.5rem;margin-bottom:.5rem;align-items:center">
        <select class="form-control" data-item-prod="${i}" style="flex:2">${products.map(p => `<option value="${p.id}" ${p.id === it.productId ? 'selected' : ''}>${p.name} (${formatCurrency(p.cost)})</option>`).join('')}</select>
        <input type="number" class="form-control" data-item-qty="${i}" value="${it.quantity}" min="1" style="flex:.7" />
        <button class="btn btn-ghost btn-icon btn-sm" data-remove="${i}"><i data-lucide="x"></i></button>
      </div>`).join('');
        if (window.lucide) lucide.createIcons();

        container.querySelectorAll('[data-item-prod]').forEach(sel => {
            sel.onchange = () => { items[sel.dataset.itemProd].productId = sel.value; updateTotal(); };
        });
        container.querySelectorAll('[data-item-qty]').forEach(inp => {
            inp.oninput = () => { items[inp.dataset.itemQty].quantity = parseInt(inp.value) || 1; updateTotal(); };
        });
        container.querySelectorAll('[data-remove]').forEach(btn => {
            btn.onclick = () => { items.splice(parseInt(btn.dataset.remove), 1); renderItems(); };
        });
        updateTotal();
    }

    function updateTotal() {
        const prodMap = {}; products.forEach(p => prodMap[p.id] = p);
        const total = items.reduce((s, it) => s + (prodMap[it.productId]?.cost || 0) * it.quantity, 0);
        document.getElementById('mPurchTotal').textContent = 'Total: ' + formatCurrency(total);
    }

    document.getElementById('btnAddPurchItem').onclick = addItemRow;
    addItemRow();

    document.getElementById('btnSavePurch').onclick = () => {
        if (items.length === 0) return showToast('Agregue al menos un producto', 'error');
        const provId = document.getElementById('mPurchProv').value;
        const prov = providers.find(p => p.id === provId);
        const prodMap = {}; products.forEach(p => prodMap[p.id] = p);
        const purchItems = items.map(it => {
            const p = prodMap[it.productId];
            return { productId: it.productId, name: p?.name || '', cost: p?.cost || 0, quantity: it.quantity };
        });
        const total = purchItems.reduce((s, it) => s + it.cost * it.quantity, 0);

        // Update stock
        purchItems.forEach(it => { const p = prodMap[it.productId]; if (p) updateItem('products', p.id, { stock: p.stock + it.quantity }); });

        addItem('purchases', { id: generateId(), providerId: provId, providerName: prov?.name || '', items: purchItems, total, date: new Date().toISOString(), userId: '' });
        showToast('Compra registrada y stock actualizado');
        closeModal(overlay);
        renderPurchases();
    };
}

function renderProductsList() {
    const content = document.getElementById('purchaseTabContent');
    const products = getCollection('products');

    content.innerHTML = `
    <div class="filters-bar">
      <div class="search-bar"><i data-lucide="search"></i><input type="text" class="form-control" id="searchProds" placeholder="Buscar productos..." /></div>
      <button class="btn btn-primary" id="btnAddProd"><i data-lucide="plus"></i>Nuevo Producto</button>
    </div>
    <div class="table-container">
      <table>
        <thead><tr><th></th><th>Nombre</th><th>Categoría</th><th>Precio</th><th>Costo</th><th>Stock</th><th>Acciones</th></tr></thead>
        <tbody id="prodsBody">${products.map(p => `
          <tr>
            <td style="font-size:1.5rem">${p.emoji}</td>
            <td><strong>${escapeHTML(p.name)}</strong></td>
            <td><span class="badge badge-primary">${p.category}</span></td>
            <td>${formatCurrency(p.price)}</td>
            <td style="color:var(--text-secondary)">${formatCurrency(p.cost)}</td>
            <td><span class="badge ${p.stock < 10 ? 'badge-danger' : p.stock < 20 ? 'badge-warning' : 'badge-success'}">${p.stock}</span></td>
            <td>
              <button class="btn btn-ghost btn-sm btn-icon" data-edit-prod="${p.id}"><i data-lucide="pencil"></i></button>
              <button class="btn btn-ghost btn-sm btn-icon" data-del-prod="${p.id}"><i data-lucide="trash-2"></i></button>
            </td>
          </tr>`).join('')}</tbody>
      </table>
    </div>`;
    if (window.lucide) lucide.createIcons();

    document.getElementById('searchProds')?.addEventListener('input', e => {
        const q = e.target.value.toLowerCase();
        document.querySelectorAll('#prodsBody tr').forEach(tr => { tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none'; });
    });

    document.getElementById('btnAddProd')?.addEventListener('click', () => openProductModal(null));
    content.querySelectorAll('[data-edit-prod]').forEach(btn => {
        btn.onclick = () => { const p = getCollection('products').find(x => x.id === btn.dataset.editProd); if (p) openProductModal(p); };
    });
    content.querySelectorAll('[data-del-prod]').forEach(btn => {
        btn.onclick = () => { if (confirm('¿Eliminar producto?')) { deleteItem('products', btn.dataset.delProd); renderPurchases(); showToast('Producto eliminado'); } };
    });
}

function openProductModal(product) {
    const isEdit = !!product;
    const p = product || {};
    const emojis = ['🍚', '🥩', '🍗', '🍝', '🥟', '🧀', '🌽', '🧃', '🥤', '💧', '🧉', '☕', '🍮', '🍓', '🍫', '🥔', '🥗', '🍲', '🥘', '🍜'];
    const body = `
    <div class="form-row">
      <div class="form-group"><label>Nombre</label><input type="text" class="form-control" id="mProdName" value="${isEdit ? escapeHTML(p.name) : ''}" required /></div>
      <div class="form-group"><label>Categoría</label>
        <select class="form-control" id="mProdCat">${PRODUCT_CATEGORIES.map(c => `<option value="${c}" ${isEdit && p.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Precio Venta (₲)</label><input type="number" class="form-control" id="mProdPrice" value="${isEdit ? p.price : ''}" required /></div>
      <div class="form-group"><label>Costo (₲)</label><input type="number" class="form-control" id="mProdCost" value="${isEdit ? p.cost : ''}" required /></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Stock</label><input type="number" class="form-control" id="mProdStock" value="${isEdit ? p.stock : 0}" /></div>
      <div class="form-group"><label>Ícono</label>
        <select class="form-control" id="mProdEmoji">${emojis.map(e => `<option value="${e}" ${isEdit && p.emoji === e ? 'selected' : ''}>${e}</option>`).join('')}</select>
      </div>
    </div>`;
    const footer = `<button class="btn btn-secondary modal-close">Cancelar</button><button class="btn btn-primary" id="btnSaveProd">${isEdit ? 'Guardar' : 'Crear'}</button>`;
    const overlay = createModal(isEdit ? 'Editar Producto' : 'Nuevo Producto', body, footer);

    document.getElementById('btnSaveProd').onclick = () => {
        const data = {
            name: document.getElementById('mProdName').value.trim(),
            category: document.getElementById('mProdCat').value,
            price: parseInt(document.getElementById('mProdPrice').value) || 0,
            cost: parseInt(document.getElementById('mProdCost').value) || 0,
            stock: parseInt(document.getElementById('mProdStock').value) || 0,
            emoji: document.getElementById('mProdEmoji').value
        };
        if (!data.name || !data.price) return showToast('Complete nombre y precio', 'error');
        if (isEdit) { updateItem('products', product.id, data); showToast('Producto actualizado'); }
        else { addItem('products', { id: generateId(), ...data }); showToast('Producto creado'); }
        closeModal(overlay);
        renderPurchases();
    };
}

function renderProvidersList() {
    const content = document.getElementById('purchaseTabContent');
    const providers = getCollection('providers');

    content.innerHTML = `
    <div class="filters-bar"><div style="flex:1"></div><button class="btn btn-primary" id="btnAddProv"><i data-lucide="plus"></i>Nuevo Proveedor</button></div>
    <div class="table-container">
      <table>
        <thead><tr><th>Nombre</th><th>RUC</th><th>Teléfono</th><th>Email</th><th>Acciones</th></tr></thead>
        <tbody>${providers.map(p => `
          <tr>
            <td><strong>${escapeHTML(p.name)}</strong></td>
            <td>${escapeHTML(p.ruc)}</td>
            <td style="color:var(--text-secondary)">${escapeHTML(p.phone)}</td>
            <td style="color:var(--text-secondary)">${escapeHTML(p.email)}</td>
            <td>
              <button class="btn btn-ghost btn-sm btn-icon" data-edit-prov="${p.id}"><i data-lucide="pencil"></i></button>
              <button class="btn btn-ghost btn-sm btn-icon" data-del-prov="${p.id}"><i data-lucide="trash-2"></i></button>
            </td>
          </tr>`).join('')}</tbody>
      </table>
    </div>`;
    if (window.lucide) lucide.createIcons();

    document.getElementById('btnAddProv')?.addEventListener('click', () => openProviderModal(null));
    content.querySelectorAll('[data-edit-prov]').forEach(btn => {
        btn.onclick = () => { const p = getCollection('providers').find(x => x.id === btn.dataset.editProv); if (p) openProviderModal(p); };
    });
    content.querySelectorAll('[data-del-prov]').forEach(btn => {
        btn.onclick = () => { if (confirm('¿Eliminar proveedor?')) { deleteItem('providers', btn.dataset.delProv); renderPurchases(); showToast('Proveedor eliminado'); } };
    });
}

function openProviderModal(provider) {
    const isEdit = !!provider;
    const p = provider || {};
    const body = `
    <div class="form-group"><label>Nombre</label><input type="text" class="form-control" id="mProvName" value="${isEdit ? escapeHTML(p.name) : ''}" required /></div>
    <div class="form-row">
      <div class="form-group"><label>RUC</label><input type="text" class="form-control" id="mProvRuc" value="${isEdit ? escapeHTML(p.ruc) : ''}" /></div>
      <div class="form-group"><label>Teléfono</label><input type="text" class="form-control" id="mProvPhone" value="${isEdit ? escapeHTML(p.phone) : ''}" /></div>
    </div>
    <div class="form-group"><label>Email</label><input type="email" class="form-control" id="mProvEmail" value="${isEdit ? escapeHTML(p.email) : ''}" /></div>`;
    const footer = `<button class="btn btn-secondary modal-close">Cancelar</button><button class="btn btn-primary" id="btnSaveProv">${isEdit ? 'Guardar' : 'Crear'}</button>`;
    const overlay = createModal(isEdit ? 'Editar Proveedor' : 'Nuevo Proveedor', body, footer);

    document.getElementById('btnSaveProv').onclick = () => {
        const data = { name: document.getElementById('mProvName').value.trim(), ruc: document.getElementById('mProvRuc').value.trim(), phone: document.getElementById('mProvPhone').value.trim(), email: document.getElementById('mProvEmail').value.trim() };
        if (!data.name) return showToast('Ingrese el nombre', 'error');
        if (isEdit) { updateItem('providers', provider.id, data); showToast('Proveedor actualizado'); }
        else { addItem('providers', { id: generateId(), ...data }); showToast('Proveedor creado'); }
        closeModal(overlay);
        renderPurchases();
    };
}
