// ============================================
// Purchases Module
// ============================================

import { api } from '../api.js';
import { generateId, showToast, createModal, closeModal, escapeHTML, formatCurrency, formatDate } from '../utils.js';

export function renderPurchases() {
    const container = document.getElementById('module-content');
    container.innerHTML = `
    <div class="fade-in">
      <div class="category-tabs" id="purchaseTabs">
        <div class="category-tab active" data-tab="purchases">Compras</div>
        <div class="category-tab" data-tab="providers">Proveedores</div>
      </div>
      <div id="purchaseTabContent"></div>
    </div>`;

    if (window.lucide) lucide.createIcons();
    let currentTab = 'purchases';

    async function showTab(tab) {
        currentTab = tab;
        document.querySelectorAll('#purchaseTabs .category-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
        
        const content = document.getElementById('purchaseTabContent');
        content.innerHTML = '<div class="empty-state"><p>Cargando...</p></div>';

        try {
            if (tab === 'purchases') await renderPurchasesList();
            else await renderProvidersList();
        } catch (e) {
            content.innerHTML = `<div class="empty-state"><p>Error: ${e.message}</p></div>`;
        }
    }

    document.getElementById('purchaseTabs').addEventListener('click', e => {
        const tab = e.target.closest('.category-tab');
        if (tab) showTab(tab.dataset.tab);
    });

    showTab('purchases');
}

async function renderPurchasesList() {
    const content = document.getElementById('purchaseTabContent');
    const purchases = await api.get('/purchases');
    purchases.sort((a, b) => new Date(b.date) - new Date(a.date));

    content.innerHTML = `
    <div class="filters-bar">
      <div style="display:flex;align-items:center;gap:.5rem">
        <label style="font-size:.85rem;color:var(--text-secondary)">% Margen de Ganancia:</label>
        <input type="number" class="form-control" id="globalMarkup" value="${localStorage.getItem('purchMarkup') || 30}" style="width:80px" />
      </div>
      <div style="flex:1"></div>
      <button class="btn btn-primary" id="btnAddPurchase"><i data-lucide="plus"></i>Nueva Compra</button>
    </div>
    <div class="table-container">
      <table>
        <thead><tr><th>Fecha</th><th>Proveedor</th><th>Factura</th><th>Condición</th><th>Detalle de Productos</th><th>Total</th><th>Acciones</th></tr></thead>
        <tbody>${purchases.map(p => `
          <tr>
            <td>${formatDate(p.date)}</td>
            <td><strong>${escapeHTML(p.providerName)}</strong></td>
            <td><code style="color:var(--primary-light)">${escapeHTML(p.invoiceNumber || '---')}</code></td>
            <td><span class="badge ${p.paymentMethod === 'CREDITO' ? 'badge-warning' : 'badge-success'}">${p.paymentMethod === 'CREDITO' ? 'Crédito' : 'Contado'}</span></td>
            <td style="color:var(--text-secondary);font-size:.82rem">
              ${p.items.map(i => `<div>${i.name} (x${i.quantity}) a ${formatCurrency(i.cost)}/u</div>`).join('')}
            </td>
            <td><strong style="color:var(--primary-light)">${formatCurrency(p.total)}</strong></td>
            <td><button class="btn btn-ghost btn-sm btn-icon" data-del="${p.id}"><i data-lucide="trash-2"></i></button></td>
          </tr>`).join('')}</tbody>
      </table>
    </div>`;
    if (window.lucide) lucide.createIcons();

    document.getElementById('btnAddPurchase')?.addEventListener('click', async () => {
        try {
            const [providers, products] = await Promise.all([api.get('/providers'), api.get('/products')]);
            openPurchaseModal(providers, products);
        } catch (e) { showToast(e.message, 'error'); }
    });

    document.getElementById('globalMarkup')?.addEventListener('input', e => {
        localStorage.setItem('purchMarkup', e.target.value);
    });
    
    content.querySelectorAll('[data-del]').forEach(btn => {
        btn.onclick = async () => { 
            if (confirm('¿Eliminar compra?')) { 
                try {
                    await api.delete(`/purchases/${btn.dataset.del}`);
                    showToast('Compra eliminada');
                    renderPurchasesList();
                } catch (e) { showToast(e.message, 'error'); }
            } 
        };
    });
}

function openPurchaseModal(providers, products) {
    const body = `
    <div class="form-row">
      <div class="form-group" style="flex:1">
        <label>Proveedor</label>
        <select class="form-control" id="mPurchProv">${providers.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}</select>
      </div>
      <div class="form-group" style="width:120px">
        <label>Forma de Pago</label>
        <select class="form-control" id="mPurchPayment">
          <option value="CONTADO">Contado</option>
          <option value="CREDITO">Crédito</option>
        </select>
      </div>
      <div class="form-group" id="mPurchDueGroup" style="display:none;width:150px">
        <label>Fecha a Pagar</label>
        <input type="date" class="form-control" id="mPurchDueDate" />
      </div>
    </div>

    <div style="background:var(--bg-secondary);padding:1rem;border-radius:var(--radius-md);margin-bottom:1rem">
      <div style="display:flex;align-items:center;gap:1rem;margin-bottom:.5rem">
        <label class="checkbox-container">
          <input type="checkbox" id="mPurchNoInvoice" />
          <span class="checkmark"></span>
          Sin factura
        </label>
        <div style="flex:1"></div>
        <button class="btn btn-secondary btn-sm" id="btnRecoverPurch" style="background:#f39c12;color:white;border:none">Recuperar</button>
      </div>
      
      <div style="display:grid;grid-template-columns:2fr 1fr 1fr 2fr;gap:.5rem">
        <div class="form-group"><label style="font-size:.7rem;background:#e74c3c;color:white;padding:2px 5px;display:block">Timbrado</label>
          <input type="text" class="form-control" id="mPurchTimb" placeholder="00000000" />
        </div>
        <div class="form-group"><label style="font-size:.7rem;background:#34495e;color:white;padding:2px 5px;display:block">T1</label>
          <input type="text" class="form-control" id="mPurchT1" placeholder="001" />
        </div>
        <div class="form-group"><label style="font-size:.7rem;background:#34495e;color:white;padding:2px 5px;display:block">T2</label>
          <input type="text" class="form-control" id="mPurchT2" placeholder="001" />
        </div>
        <div class="form-group"><label style="font-size:.7rem;background:#f1c40f;color:black;padding:2px 5px;display:block">Factura</label>
          <input type="text" class="form-control" id="mPurchFact" placeholder="0000000" />
        </div>
      </div>
    </div>

    <div class="form-group"><label>Productos</label><div id="mPurchItems"></div>
      <button class="btn btn-secondary btn-sm" id="btnAddPurchItem" style="margin-top:.5rem"><i data-lucide="plus"></i>Agregar Producto</button>
    </div>
    <div id="mPurchTotal" style="text-align:right;font-weight:700;font-size:1.1rem;margin-top:.5rem"></div>`;
    const footer = `<button class="btn btn-secondary modal-close">Cancelar</button><button class="btn btn-primary" id="btnSavePurch">Registrar Compra</button>`;
    const overlay = createModal('Nueva Compra', body, footer);
    let items = [];

    function addItemRow() {
        const defaultProd = products[0];
        const markup = parseFloat(localStorage.getItem('purchMarkup')) || 30;
        const cost = defaultProd?.cost || 0;
        const price = Math.round(cost * (1 + markup / 100));
        items.push({ productId: defaultProd?.id || '', quantity: 1, cost, price });
        renderItems();
    }

    function renderItems() {
        const container = document.getElementById('mPurchItems');
        container.innerHTML = items.map((it, i) => `
      <div style="display:flex;gap:.5rem;margin-bottom:.5rem;align-items:center">
        <div style="flex:2">
          <label style="font-size:0.7rem;margin-bottom:2px">Producto</label>
          <select class="form-control" data-item-prod="${i}">
            ${products.map(p => `<option value="${p.id}" ${p.id === it.productId ? 'selected' : ''}>${p.name}</option>`).join('')}
          </select>
        </div>
        <div style="flex:0.8">
          <label style="font-size:0.7rem;margin-bottom:2px">Cant.</label>
          <input type="number" class="form-control" data-item-qty="${i}" value="${it.quantity}" min="1" />
        </div>
        <div style="flex:1.2">
          <label style="font-size:0.7rem;margin-bottom:2px">Costo Unit. (₲)</label>
          <input type="number" class="form-control" data-item-cost="${i}" value="${it.cost}" min="0" />
        </div>
        <div style="flex:1.2">
          <label style="font-size:0.7rem;margin-bottom:2px">Precio Venta (₲)</label>
          <input type="number" class="form-control" data-item-price="${i}" value="${it.price}" min="0" />
        </div>
        <button class="btn btn-ghost btn-icon btn-sm" data-remove="${i}" style="margin-top:auto"><i data-lucide="x"></i></button>
      </div>`).join('');
        if (window.lucide) lucide.createIcons();

        const markup = parseFloat(localStorage.getItem('purchMarkup')) || 30;

        container.querySelectorAll('[data-item-prod]').forEach(sel => {
            sel.onchange = () => { 
                const prod = products.find(p => p.id === sel.value);
                items[sel.dataset.itemProd].productId = sel.value; 
                items[sel.dataset.itemProd].cost = prod ? prod.cost : 0;
                items[sel.dataset.itemProd].price = Math.round(items[sel.dataset.itemProd].cost * (1 + markup / 100));
                renderItems();
            };
        });
        container.querySelectorAll('[data-item-qty]').forEach(inp => {
            inp.oninput = () => { items[inp.dataset.itemQty].quantity = parseInt(inp.value) || 1; updateTotal(); };
        });
        container.querySelectorAll('[data-item-cost]').forEach(inp => {
            inp.oninput = () => { 
                const cost = parseInt(inp.value) || 0;
                items[inp.dataset.itemCost].cost = cost; 
                items[inp.dataset.itemCost].price = Math.round(cost * (1 + markup / 100));
                container.querySelector(`[data-item-price="${inp.dataset.itemCost}"]`).value = items[inp.dataset.itemCost].price;
                updateTotal(); 
            };
        });
        container.querySelectorAll('[data-item-price]').forEach(inp => {
            inp.oninput = () => { items[inp.dataset.itemPrice].price = parseInt(inp.value) || 0; };
        });
        container.querySelectorAll('[data-remove]').forEach(btn => {
            btn.onclick = () => { items.splice(parseInt(btn.dataset.remove), 1); renderItems(); };
        });
        updateTotal();
    }

    function updateTotal() {
        const total = items.reduce((s, it) => s + it.cost * it.quantity, 0);
        document.getElementById('mPurchTotal').textContent = 'Total: ' + formatCurrency(total);
    }

    document.getElementById('btnAddPurchItem').onclick = addItemRow;
    addItemRow();

    // Toggle Due Date
    const paySel = document.getElementById('mPurchPayment');
    paySel.onchange = () => {
        document.getElementById('mPurchDueGroup').style.display = paySel.value === 'CREDITO' ? 'block' : 'none';
    };

    // Sin factura logic
    const noInvCheck = document.getElementById('mPurchNoInvoice');
    noInvCheck.onchange = () => {
        if (noInvCheck.checked) {
            const now = new Date();
            const dateStr = now.getDate().toString().padStart(2, '0') + (now.getMonth() + 1).toString().padStart(2, '0') + now.getFullYear();
            document.getElementById('mPurchTimb').value = dateStr;
            document.getElementById('mPurchT1').value = '001';
            document.getElementById('mPurchT2').value = '001';
            document.getElementById('mPurchFact').value = dateStr.slice(0, 7); // Similar to image
        }
    };

    // Recover functionality
    document.getElementById('btnRecoverPurch').onclick = async () => {
        const fact = document.getElementById('mPurchFact').value;
        if (!fact) return showToast('Ingrese un número de factura para buscar', 'info');
        
        try {
            const purchases = await api.get('/purchases');
            const found = purchases.find(p => p.invoiceNumber === fact);
            if (found) {
                document.getElementById('mPurchTimb').value = found.timbrado || '';
                document.getElementById('mPurchT1').value = found.t1 || '';
                document.getElementById('mPurchT2').value = found.t2 || '';
                document.getElementById('mPurchProv').value = found.providerId;
                document.getElementById('mPurchPayment').value = found.paymentMethod;
                paySel.onchange();
                showToast('Datos recuperados');
            } else {
                showToast('No se encontró ninguna factura con ese número', 'warning');
            }
        } catch (e) { showToast(e.message, 'error'); }
    };

    const btnSave = document.getElementById('btnSavePurch');
    btnSave.onclick = async () => {
        if (items.length === 0) return showToast('Agregue al menos un producto', 'error');
        
        btnSave.disabled = true;
        btnSave.innerHTML = '<i data-lucide="loader"></i> Registrando...';
        if (window.lucide) lucide.createIcons();

        const provId = document.getElementById('mPurchProv').value;
        const purchItems = items.map(it => {
            return { productId: it.productId, quantity: it.quantity, cost: it.cost, price: it.price };
        });

        const data = {
            providerId: provId,
            items: purchItems,
            paymentMethod: document.getElementById('mPurchPayment').value,
            dueDate: document.getElementById('mPurchDueDate').value || null,
            noInvoice: document.getElementById('mPurchNoInvoice').checked,
            timbrado: document.getElementById('mPurchTimb').value,
            t1: document.getElementById('mPurchT1').value,
            t2: document.getElementById('mPurchT2').value,
            invoiceNumber: document.getElementById('mPurchFact').value
        };

        try {
            await api.post('/purchases', data);
            showToast('Compra registrada y stock actualizado');
            closeModal(overlay);
            renderPurchasesList();
        } catch (e) {
            showToast(e.message, 'error');
            btnSave.disabled = false;
            btnSave.innerHTML = 'Registrar Compra';
            if (window.lucide) lucide.createIcons();
        }
    };
}

async function renderProvidersList() {
    const content = document.getElementById('purchaseTabContent');
    const providers = await api.get('/providers');

    content.innerHTML = `
    <div class="filters-bar"><div style="flex:1"></div><button class="btn btn-primary" id="btnAddProv"><i data-lucide="plus"></i>Nuevo Proveedor</button></div>
    <div class="table-container">
      <table>
        <thead><tr><th>Nombre</th><th>RUC</th><th>Teléfono</th><th>Email</th><th>Acciones</th></tr></thead>
        <tbody>${providers.map(p => `
          <tr>
            <td><strong>${escapeHTML(p.name)}</strong></td>
            <td>${escapeHTML(p.ruc || '')}</td>
            <td style="color:var(--text-secondary)">${escapeHTML(p.phone || '')}</td>
            <td style="color:var(--text-secondary)">${escapeHTML(p.email || '')}</td>
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
        btn.onclick = () => { const p = providers.find(x => x.id === btn.dataset.editProv); if (p) openProviderModal(p); };
    });
    content.querySelectorAll('[data-del-prov]').forEach(btn => {
        btn.onclick = async () => { 
            if (confirm('¿Eliminar proveedor?')) { 
                try {
                    await api.delete(`/providers/${btn.dataset.delProv}`);
                    showToast('Proveedor eliminado');
                    renderProvidersList();
                } catch (e) { showToast(e.message, 'error'); }
            } 
        };
    });
}

function openProviderModal(provider) {
    const isEdit = !!provider;
    const p = provider || {};
    const body = `
    <div class="form-group"><label>Nombre</label><input type="text" class="form-control" id="mProvName" value="${isEdit ? escapeHTML(p.name) : ''}" required /></div>
    <div class="form-row">
      <div class="form-group"><label>RUC</label><input type="text" class="form-control" id="mProvRuc" value="${isEdit ? escapeHTML(p.ruc || '') : ''}" /></div>
      <div class="form-group"><label>Teléfono</label><input type="text" class="form-control" id="mProvPhone" value="${isEdit ? escapeHTML(p.phone || '') : ''}" /></div>
    </div>
    <div class="form-group"><label>Email</label><input type="email" class="form-control" id="mProvEmail" value="${isEdit ? escapeHTML(p.email || '') : ''}" /></div>`;
    const footer = `<button class="btn btn-secondary modal-close">Cancelar</button><button class="btn btn-primary" id="btnSaveProv">${isEdit ? 'Guardar' : 'Crear'}</button>`;
    const overlay = createModal(isEdit ? 'Editar Proveedor' : 'Nuevo Proveedor', body, footer);

    const btnSave = document.getElementById('btnSaveProv');
    btnSave.onclick = async () => {
        const data = { 
            name: document.getElementById('mProvName').value.trim(), 
            ruc: document.getElementById('mProvRuc').value.trim(), 
            phone: document.getElementById('mProvPhone').value.trim(), 
            email: document.getElementById('mProvEmail').value.trim() 
        };
        if (!data.name) return showToast('Ingrese el nombre', 'error');
        
        btnSave.disabled = true;
        btnSave.innerHTML = '<i data-lucide="loader"></i> Guardando...';
        if (window.lucide) lucide.createIcons();

        try {
            if (isEdit) { 
                await api.put(`/providers/${provider.id}`, data); 
                showToast('Proveedor actualizado'); 
            } else { 
                await api.post('/providers', data); 
                showToast('Proveedor creado'); 
            }
            closeModal(overlay);
            renderProvidersList();
        } catch (e) {
            showToast(e.message, 'error');
            btnSave.disabled = false;
            btnSave.innerHTML = isEdit ? 'Guardar' : 'Crear';
            if (window.lucide) lucide.createIcons();
        }
    };
}
