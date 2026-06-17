// ============================================
// Purchases Module
// ============================================

import { api } from '../api.js';
import { generateId, showToast, createModal, closeModal, escapeHTML, formatCurrency, formatDate, todayStr } from '../utils.js';

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
        <input type="number" class="form-control" id="globalMarkup" value="${localStorage.getItem('purchMarkup') || 40}" style="width:80px" />
      </div>
      <div style="flex:1"></div>
      <button class="btn btn-primary" id="btnAddPurchase"><i data-lucide="plus"></i>Nueva Compra</button>
    </div>
    <div class="table-container">
      <table>
        <thead><tr><th>Fecha</th><th>Proveedor</th><th>Nº Factura</th><th>Condición</th><th>Total</th><th style="text-align:center">Acciones</th></tr></thead>
        <tbody>${purchases.map(p => `
          <tr>
            <td>${formatDate(p.date)}</td>
            <td><strong>${escapeHTML(p.providerName)}</strong></td>
            <td><code style="color:var(--primary-light)">${escapeHTML(p.invoiceNumber || '---')}</code></td>
            <td><span class="badge ${p.paymentMethod === 'CREDITO' ? 'badge-warning' : 'badge-success'}">${p.paymentMethod === 'CREDITO' ? 'Crédito' : 'Contado'}</span></td>
            <td><strong style="color:var(--primary-light)">${formatCurrency(p.total)}</strong></td>
            <td style="text-align:center">
              <button class="btn btn-ghost btn-sm btn-icon" data-view="${p.id}" title="Ver detalle"><i data-lucide="eye"></i></button>
              <button class="btn btn-ghost btn-sm btn-icon" data-edit="${p.id}" title="Editar"><i data-lucide="pencil"></i></button>
              <button class="btn btn-ghost btn-sm btn-icon" data-del="${p.id}" title="Eliminar"><i data-lucide="trash-2"></i></button>
            </td>
          </tr>`).join('')}</tbody>
      </table>
    </div>`;
  if (window.lucide) lucide.createIcons();

  document.getElementById('btnAddPurchase')?.addEventListener('click', async () => {
    try {
      const [providers, products] = await Promise.all([api.get('/providers'), api.get('/products')]);
      renderNewPurchaseView(providers, products);
    } catch (e) { showToast(e.message, 'error'); }
  });

  document.getElementById('globalMarkup')?.addEventListener('input', e => {
    localStorage.setItem('purchMarkup', e.target.value);
  });

  // View button — open modal with product details
  content.querySelectorAll('[data-view]').forEach(btn => {
    btn.onclick = () => {
      const p = purchases.find(x => x.id === btn.dataset.view);
      if (p) openViewPurchaseModal(p);
    };
  });

  // Edit button — open edit form
  content.querySelectorAll('[data-edit]').forEach(btn => {
    btn.onclick = async () => {
      const p = purchases.find(x => x.id === btn.dataset.edit);
      if (p) {
        try {
          const [providers, products] = await Promise.all([api.get('/providers'), api.get('/products')]);
          renderEditPurchaseView(p, providers, products);
        } catch (e) { showToast(e.message, 'error'); }
      }
    };
  });

  // Delete button — confirm and delete with stock restoration
  content.querySelectorAll('[data-del]').forEach(btn => {
    btn.onclick = async () => {
      if (confirm('¿Está seguro de eliminar esta compra?\nSe restaurará el stock de todos los productos asociados.')) {
        try {
          await api.delete(`/purchases/${btn.dataset.del}`);
          showToast('Compra eliminada y stock restaurado');
          renderPurchasesList();
        } catch (e) { showToast(e.message, 'error'); }
      }
    };
  });
}

function openViewPurchaseModal(purchase) {
  const itemsTotal = purchase.items.reduce((s, i) => s + i.cost * i.quantity, 0);
  const body = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;margin-bottom:1.25rem">
      <div><span style="color:var(--text-secondary);font-size:.8rem">Proveedor</span><div style="font-weight:600">${escapeHTML(purchase.providerName)}</div></div>
      <div><span style="color:var(--text-secondary);font-size:.8rem">Fecha</span><div style="font-weight:600">${formatDate(purchase.date)}</div></div>
      <div><span style="color:var(--text-secondary);font-size:.8rem">Nº Factura</span><div><code style="color:var(--primary-light)">${escapeHTML(purchase.invoiceNumber || '---')}</code></div></div>
      <div><span style="color:var(--text-secondary);font-size:.8rem">Condición</span><div><span class="badge ${purchase.paymentMethod === 'CREDITO' ? 'badge-warning' : 'badge-success'}">${purchase.paymentMethod === 'CREDITO' ? 'Crédito' : 'Contado'}</span></div></div>
    </div>
    <div class="table-container" style="border:none">
      <table>
        <thead><tr><th>Producto</th><th style="text-align:center">Cantidad</th><th style="text-align:right">Costo Unit.</th><th style="text-align:right">Total</th><th style="text-align:center">Propósito</th></tr></thead>
        <tbody>${purchase.items.map(i => `
          <tr>
            <td><strong>${escapeHTML(i.name)}</strong></td>
            <td style="text-align:center">${i.quantity}</td>
            <td style="text-align:right">${formatCurrency(i.cost)}</td>
            <td style="text-align:right;font-weight:700">${formatCurrency(i.cost * i.quantity)}</td>
            <td style="text-align:center"><span class="badge ${i.forResale !== false ? 'badge-success' : 'badge-warning'}">${i.forResale !== false ? 'Venta' : 'Uso Interno'}</span></td>
          </tr>`).join('')}
        </tbody>
        <tfoot>
          <tr style="background:rgba(99,102,241,0.1);font-weight:700">
            <td colspan="3">TOTAL</td>
            <td style="text-align:right">${formatCurrency(itemsTotal)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>`;
  const overlay = createModal('Detalle de Compra', body);
  if (window.lucide) lucide.createIcons();
}

function renderEditPurchaseView(purchase, providers, products) {
  const content = document.getElementById('module-content');
  let items = purchase.items.map(i => ({
    productId: i.productId,
    quantity: i.quantity,
    cost: i.cost,
    price: products.find(p => p.id === i.productId)?.price || 0,
    forResale: i.forResale !== false
  }));

  const purchDate = purchase.date ? new Date(purchase.date) : new Date();
  const dateVal = `${purchDate.getFullYear()}-${String(purchDate.getMonth() + 1).padStart(2, '0')}-${String(purchDate.getDate()).padStart(2, '0')}`;

  content.innerHTML = `
    <div class="fade-in" style="padding-bottom:80px">
      <div style="display:flex;align-items:center;margin-bottom:1rem;gap:1rem">
        <button class="btn btn-ghost" id="epBackBtn"><i data-lucide="arrow-left"></i> Volver</button>
        <h2 style="margin:0;font-size:1.5rem">Editar Compra</h2>
      </div>

      <!-- Datos de la Factura -->
      <div class="form-row" style="background:var(--bg-secondary);padding:1rem;border-radius:var(--radius-md);margin-bottom:1rem">
        <div class="form-group" style="flex:1">
          <label>Proveedor</label>
          <select class="form-control" id="ePurchProv">${providers.map(p => `<option value="${p.id}" ${p.id === purchase.providerId ? 'selected' : ''}>${p.name}</option>`).join('')}</select>
        </div>
        <div class="form-group" style="width:140px">
          <label>Fecha Compra</label>
          <input type="date" class="form-control" id="ePurchDate" value="${dateVal}" max="${todayStr()}" />
        </div>
        <div class="form-group" style="width:120px">
          <label>Forma de Pago</label>
          <select class="form-control" id="ePurchPayment">
            <option value="CONTADO" ${purchase.paymentMethod !== 'CREDITO' ? 'selected' : ''}>Contado</option>
            <option value="CREDITO" ${purchase.paymentMethod === 'CREDITO' ? 'selected' : ''}>Crédito</option>
          </select>
        </div>
        <div class="form-group" id="ePurchDueGroup" style="display:${purchase.paymentMethod === 'CREDITO' ? 'block' : 'none'};width:150px">
          <label>Fecha a Pagar</label>
          <input type="date" class="form-control" id="ePurchDueDate" value="${purchase.dueDate ? purchase.dueDate.substring(0, 10) : ''}" />
        </div>
        
        <div style="flex:2; display:grid; grid-template-columns:1fr 1fr 1fr 1.5fr; gap:.5rem">
          <div class="form-group"><label style="font-size:.7rem">Timbrado</label><input type="text" class="form-control" id="ePurchTimb" value="${purchase.timbrado || ''}" placeholder="00000000" /></div>
          <div class="form-group"><label style="font-size:.7rem">T1</label><input type="text" class="form-control" id="ePurchT1" value="${purchase.t1 || ''}" placeholder="001" /></div>
          <div class="form-group"><label style="font-size:.7rem">T2</label><input type="text" class="form-control" id="ePurchT2" value="${purchase.t2 || ''}" placeholder="001" /></div>
          <div class="form-group"><label style="font-size:.7rem">Factura</label><input type="text" class="form-control" id="ePurchFact" value="${purchase.invoiceNumber || ''}" placeholder="0000000" /></div>
        </div>
        <div style="display:flex;align-items:center;gap:.5rem;flex-direction:column;justify-content:center">
          <label class="checkbox-container" style="margin:0;font-size:.8rem">
            <input type="checkbox" id="ePurchNoInvoice" ${purchase.noInvoice ? 'checked' : ''} />
            <span class="checkmark"></span> Sin factura
          </label>
        </div>
      </div>

      <!-- Barra de Entrada de Productos -->
      <div class="purchase-entry-bar" style="display:flex; gap:0.5rem; align-items:flex-end; background:var(--bg-secondary); padding:1rem; border-radius:var(--radius-md); margin-bottom:1rem; border-left:4px solid var(--primary)">
        <div style="flex:2">
          <label style="font-size:0.75rem">Descripción del Producto</label>
          <select class="form-control" id="epProduct">
            <option value="">Seleccione...</option>
            ${products.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
          </select>
        </div>
        <div style="flex:1; display:flex; flex-direction:column; justify-content:flex-end; padding-bottom:8px">
          <label class="checkbox-container" style="font-size:0.75rem; margin:0; display:flex; align-items:center; gap:4px">
            <input type="checkbox" id="epForResale" checked />
            <span class="checkmark"></span> Para Venta
          </label>
        </div>
        <div style="flex:0.8">
          <label style="font-size:0.75rem">Cantidad</label>
          <input type="number" class="form-control" id="epQty" value="1" min="0.01" step="any" />
        </div>
        <div style="flex:1">
          <label style="font-size:0.75rem">Pre. Unit. Compra</label>
          <input type="number" class="form-control" id="epCost" value="0" min="0" step="any" />
        </div>
        <div style="flex:1">
          <label style="font-size:0.75rem;font-weight:700">Total</label>
          <input type="number" class="form-control" id="epTotal" value="0" min="0" step="any" style="background:var(--bg-input);font-weight:700;color:var(--primary-light)" />
        </div>
        <div style="flex:1" id="epPriceGroup">
          <label style="font-size:0.75rem">Precio Venta</label>
          <input type="number" class="form-control" id="epPrice" value="0" min="0" step="any" />
        </div>
        <div>
          <button class="btn btn-primary" id="epAddBtn" style="height:38px"><i data-lucide="plus"></i></button>
        </div>
      </div>

      <!-- Grilla de Ítems -->
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Descripción</th>
              <th style="text-align:center">Propósito</th>
              <th style="text-align:center">Cant.</th>
              <th style="text-align:right">Costo Unit.</th>
              <th style="text-align:right">Costo Total</th>
              <th style="text-align:right">Precio Venta</th>
              <th style="text-align:center">Acción</th>
            </tr>
          </thead>
          <tbody id="epItemsBody">
          </tbody>
        </table>
      </div>

      <!-- Footer Fijo -->
      <div style="position:sticky;bottom:0;background:var(--bg-secondary);padding:1rem;margin-top:2rem;border-top:1px solid var(--border);border-radius:var(--radius-md);display:flex;justify-content:space-between;align-items:center;z-index:10;box-shadow:0 -4px 10px rgba(0,0,0,0.1)">
        <div style="font-size:1.5rem;font-weight:700">Total Factura: <span id="ePurchGrandTotal" style="color:var(--primary-light)">₲ 0</span></div>
        <button class="btn btn-primary" id="btnUpdatePurch" style="font-size:1.1rem;padding:0.75rem 2rem"><i data-lucide="save"></i> Guardar Cambios</button>
      </div>
    </div>`;

  if (window.lucide) lucide.createIcons();

  // Back button
  document.getElementById('epBackBtn').onclick = renderPurchases;

  const prodSel = document.getElementById('epProduct');
  const qtyInp = document.getElementById('epQty');
  const costInp = document.getElementById('epCost');
  const totalInp = document.getElementById('epTotal');
  const priceInp = document.getElementById('epPrice');
  const forResaleInp = document.getElementById('epForResale');
  const markup = parseFloat(localStorage.getItem('purchMarkup')) || 30;

  function togglePriceInput() {
    if (forResaleInp.checked) {
      priceInp.disabled = false;
      priceInp.style.opacity = '1';
      priceInp.style.background = 'var(--bg-input)';
    } else {
      priceInp.disabled = true;
      priceInp.style.opacity = '0.5';
      priceInp.style.background = 'rgba(0,0,0,0.1)';
      priceInp.value = '0';
    }
  }
  forResaleInp.addEventListener('change', togglePriceInput);

  function resetEntryBar() {
    prodSel.value = '';
    qtyInp.value = '1';
    costInp.value = '0';
    totalInp.value = '0';
    priceInp.value = '0';
    forResaleInp.checked = true;
    togglePriceInput();
    prodSel.focus();
  }

  function calcFromUnit() {
    const q = parseFloat(qtyInp.value) || 0;
    const c = parseFloat(costInp.value) || 0;
    totalInp.value = Math.round(q * c);
    if (c > 0 && forResaleInp.checked) priceInp.value = Math.round(c * (1 + markup / 100));
  }

  function calcFromTotal() {
    const t = parseFloat(totalInp.value) || 0;
    const q = parseFloat(qtyInp.value) || 0;
    if (q > 0) {
      const c = t / q;
      costInp.value = c % 1 === 0 ? c : c.toFixed(2);
      if (forResaleInp.checked) priceInp.value = Math.round(c * (1 + markup / 100));
    }
  }

  qtyInp.addEventListener('input', calcFromUnit);
  costInp.addEventListener('input', calcFromUnit);
  totalInp.addEventListener('input', calcFromTotal);

  prodSel.addEventListener('change', () => {
    const prod = products.find(p => p.id === prodSel.value);
    if (prod) {
      costInp.value = prod.cost;
      priceInp.value = prod.price;
      forResaleInp.checked = prod.forResale !== false;
      togglePriceInput();
      calcFromUnit();
      qtyInp.focus();
      qtyInp.select();
    } else {
      resetEntryBar();
    }
  });

  function renderItemsGrid() {
    const tbody = document.getElementById('epItemsBody');
    if (items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center" style="color:var(--text-muted)">No hay productos agregados</td></tr>';
    } else {
      tbody.innerHTML = items.map((it, i) => {
        const prod = products.find(p => p.id === it.productId);
        return `
                <tr>
                  <td><strong>${escapeHTML(prod?.name || 'Desconocido')}</strong></td>
                  <td style="text-align:center"><span class="badge ${it.forResale ? 'badge-success' : 'badge-warning'}">${it.forResale ? 'Venta' : 'Uso Interno'}</span></td>
                  <td style="text-align:center">${it.quantity}</td>
                  <td style="text-align:right">${formatCurrency(it.cost)}</td>
                  <td style="text-align:right;font-weight:700">${formatCurrency(it.cost * it.quantity)}</td>
                  <td style="text-align:right;color:var(--primary-light)">${it.forResale ? formatCurrency(it.price) : '<span style="color:var(--text-muted)">-</span>'}</td>
                  <td style="text-align:center"><button class="btn btn-ghost btn-icon btn-sm text-danger" data-remove="${i}"><i data-lucide="trash-2"></i></button></td>
                </tr>`;
      }).join('');
      if (window.lucide) lucide.createIcons();

      tbody.querySelectorAll('[data-remove]').forEach(btn => {
        btn.onclick = () => { items.splice(parseInt(btn.dataset.remove), 1); renderItemsGrid(); };
      });
    }

    const total = items.reduce((s, it) => s + it.cost * it.quantity, 0);
    document.getElementById('ePurchGrandTotal').textContent = formatCurrency(total);
  }

  // Initial render of existing items
  renderItemsGrid();

  document.getElementById('epAddBtn').onclick = () => {
    const prodId = prodSel.value;
    const q = parseFloat(qtyInp.value) || 0;
    const c = parseFloat(costInp.value) || 0;
    const p = parseFloat(priceInp.value) || 0;
    const isForResale = forResaleInp.checked;

    if (!prodId) return showToast('Seleccione un producto', 'warning');
    if (q <= 0) return showToast('Cantidad inválida', 'warning');

    const existing = items.find(it => it.productId === prodId);
    if (existing) {
      existing.quantity += q;
      existing.cost = c;
      existing.price = p;
      existing.forResale = isForResale;
    } else {
      items.unshift({ productId: prodId, quantity: q, cost: c, price: p, forResale: isForResale });
    }

    renderItemsGrid();
    resetEntryBar();
  };

  // Enter to add in entry bar
  document.querySelector('.purchase-entry-bar').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('epAddBtn').click();
    }
  });

  // Toggle Due Date
  const paySel = document.getElementById('ePurchPayment');
  paySel.onchange = () => {
    document.getElementById('ePurchDueGroup').style.display = paySel.value === 'CREDITO' ? 'block' : 'none';
  };

  // Save edited purchase
  const btnUpdate = document.getElementById('btnUpdatePurch');
  btnUpdate.onclick = async () => {
    if (items.length === 0) return showToast('Agregue al menos un producto', 'error');

    const provId = document.getElementById('ePurchProv').value;
    const noInv = document.getElementById('ePurchNoInvoice').checked;
    const timb = document.getElementById('ePurchTimb').value.trim();
    const t1Val = document.getElementById('ePurchT1').value.trim();
    const t2Val = document.getElementById('ePurchT2').value.trim();
    const fact = document.getElementById('ePurchFact').value.trim();

    if (!provId) return showToast('Seleccione un proveedor', 'warning');
    if (!noInv && (!timb || !t1Val || !t2Val || !fact)) {
      return showToast('Complete los datos de la factura (Timbrado, T1, T2, Factura)', 'warning');
    }

    btnUpdate.disabled = true;
    btnUpdate.innerHTML = '<i data-lucide="loader"></i> Guardando...';
    if (window.lucide) lucide.createIcons();

    const data = {
      providerId: provId,
      date: document.getElementById('ePurchDate').value || null,
      items: items.map(it => ({ productId: it.productId, quantity: it.quantity, cost: it.cost, price: it.price, forResale: it.forResale })),
      paymentMethod: document.getElementById('ePurchPayment').value,
      dueDate: document.getElementById('ePurchDueDate').value || null,
      noInvoice: noInv,
      timbrado: timb,
      t1: t1Val,
      t2: t2Val,
      invoiceNumber: fact
    };

    try {
      await api.put(`/purchases/${purchase.id}`, data);
      showToast('Compra actualizada y stock ajustado');
      renderPurchases();
    } catch (e) {
      showToast(e.message, 'error');
      btnUpdate.disabled = false;
      btnUpdate.innerHTML = '<i data-lucide="save"></i> Guardar Cambios';
      if (window.lucide) lucide.createIcons();
    }
  };
}


function renderNewPurchaseView(providers, products) {
  const content = document.getElementById('module-content');
  let items = [];

  content.innerHTML = `
    <div class="fade-in" style="padding-bottom:80px">
      <div style="display:flex;align-items:center;margin-bottom:1rem;gap:1rem">
        <button class="btn btn-ghost" id="npBackBtn"><i data-lucide="arrow-left"></i> Volver</button>
        <h2 style="margin:0;font-size:1.5rem">Nueva Compra</h2>
      </div>

      <!-- Datos de la Factura -->
      <div class="form-row" style="background:var(--bg-secondary);padding:1rem;border-radius:var(--radius-md);margin-bottom:1rem">
        <div class="form-group" style="flex:1">
          <label>Proveedor</label>
          <select class="form-control" id="mPurchProv">${providers.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}</select>
        </div>
        <div class="form-group" style="width:140px">
          <label>Fecha Compra</label>
          <input type="date" class="form-control" id="mPurchDate" value="${todayStr()}" max="${todayStr()}" />
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
        
        <div style="flex:2; display:grid; grid-template-columns:1fr 1fr 1fr 1.5fr; gap:.5rem">
          <div class="form-group"><label style="font-size:.7rem">Timbrado</label><input type="text" class="form-control" id="mPurchTimb" placeholder="00000000" /></div>
          <div class="form-group"><label style="font-size:.7rem">T1</label><input type="text" class="form-control" id="mPurchT1" placeholder="001" /></div>
          <div class="form-group"><label style="font-size:.7rem">T2</label><input type="text" class="form-control" id="mPurchT2" placeholder="001" /></div>
          <div class="form-group"><label style="font-size:.7rem">Factura</label><input type="text" class="form-control" id="mPurchFact" placeholder="0000000" /></div>
        </div>
        <div style="display:flex;align-items:center;gap:.5rem;flex-direction:column;justify-content:center">
          <label class="checkbox-container" style="margin:0;font-size:.8rem">
            <input type="checkbox" id="mPurchNoInvoice" />
            <span class="checkmark"></span> Sin factura
          </label>
          <button class="btn btn-secondary btn-sm" id="btnRecoverPurch" style="background:#f39c12;color:white;border:none;width:100%">Recuperar</button>
        </div>
      </div>

      <!-- Barra de Entrada de Productos -->
      <div class="purchase-entry-bar" style="display:flex; gap:0.5rem; align-items:flex-end; background:var(--bg-secondary); padding:1rem; border-radius:var(--radius-md); margin-bottom:1rem; border-left:4px solid var(--primary)">
        <div style="flex:1.5">
          <label style="font-size:0.75rem">Código de Barra</label>
          <input type="text" class="form-control" id="npBarcode" placeholder="Escanear o tipear..." autofocus />
        </div>
        <div style="flex:2">
          <label style="font-size:0.75rem">Descripción del Producto</label>
          <select class="form-control" id="npProduct">
            <option value="">Seleccione o escanee...</option>
            ${products.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
          </select>
        </div>
        <div style="flex:1; display:flex; flex-direction:column; justify-content:flex-end; padding-bottom:8px">
          <label class="checkbox-container" style="font-size:0.75rem; margin:0; display:flex; align-items:center; gap:4px">
            <input type="checkbox" id="npForResale" checked />
            <span class="checkmark"></span> Para Venta
          </label>
        </div>
        <div style="flex:0.8">
          <label style="font-size:0.75rem">Cantidad</label>
          <input type="number" class="form-control" id="npQty" value="1" min="0.01" step="any" />
        </div>
        <div style="flex:1">
          <label style="font-size:0.75rem">Pre. Unit. Compra</label>
          <input type="number" class="form-control" id="npCost" value="0" min="0" step="any" />
        </div>
        <div style="flex:1">
          <label style="font-size:0.75rem;font-weight:700">Total</label>
          <input type="number" class="form-control" id="npTotal" value="0" min="0" step="any" style="background:var(--bg-input);font-weight:700;color:var(--primary-light)" />
        </div>
        <div style="flex:1" id="npPriceGroup">
          <label style="font-size:0.75rem">Precio Venta</label>
          <input type="number" class="form-control" id="npPrice" value="0" min="0" step="any" />
        </div>
        <div>
          <button class="btn btn-primary" id="npAddBtn" style="height:38px"><i data-lucide="plus"></i></button>
        </div>
      </div>

      <!-- Grilla de Ítems -->
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Descripción</th>
              <th style="text-align:center">Propósito</th>
              <th style="text-align:center">Cant.</th>
              <th style="text-align:right">Costo Unit.</th>
              <th style="text-align:right">Costo Total</th>
              <th style="text-align:right">Precio Venta</th>
              <th style="text-align:center">Acción</th>
            </tr>
          </thead>
          <tbody id="npItemsBody">
            <tr><td colspan="7" class="text-center" style="color:var(--text-muted)">No hay productos agregados</td></tr>
          </tbody>
        </table>
      </div>

      <!-- Footer Fijo -->
      <div style="position:sticky;bottom:0;background:var(--bg-secondary);padding:1rem;margin-top:2rem;border-top:1px solid var(--border);border-radius:var(--radius-md);display:flex;justify-content:space-between;align-items:center;z-index:10;box-shadow:0 -4px 10px rgba(0,0,0,0.1)">
        <div style="font-size:1.5rem;font-weight:700">Total Factura: <span id="mPurchGrandTotal" style="color:var(--primary-light)">₲ 0</span></div>
        <button class="btn btn-primary" id="btnSavePurch" style="font-size:1.1rem;padding:0.75rem 2rem"><i data-lucide="save"></i> Registrar Compra</button>
      </div>
    </div>`;

  if (window.lucide) lucide.createIcons();

  // Eventos UI
  document.getElementById('npBackBtn').onclick = renderPurchases;

  const barcodeInp = document.getElementById('npBarcode');
  const prodSel = document.getElementById('npProduct');
  const qtyInp = document.getElementById('npQty');
  const costInp = document.getElementById('npCost');
  const totalInp = document.getElementById('npTotal');
  const priceInp = document.getElementById('npPrice');
  const forResaleInp = document.getElementById('npForResale');
  const markup = parseFloat(localStorage.getItem('purchMarkup')) || 30;

  function togglePriceInput() {
    if (forResaleInp.checked) {
      priceInp.disabled = false;
      priceInp.style.opacity = '1';
      priceInp.style.background = 'var(--bg-input)';
    } else {
      priceInp.disabled = true;
      priceInp.style.opacity = '0.5';
      priceInp.style.background = 'rgba(0,0,0,0.1)';
      priceInp.value = '0';
    }
  }
  forResaleInp.addEventListener('change', togglePriceInput);

  function resetEntryBar() {
    barcodeInp.value = '';
    prodSel.value = '';
    qtyInp.value = '1';
    costInp.value = '0';
    totalInp.value = '0';
    priceInp.value = '0';
    forResaleInp.checked = true;
    togglePriceInput();
    barcodeInp.focus();
  }

  // Matemáticas bidireccionales
  function calcFromUnit() {
    const q = parseFloat(qtyInp.value) || 0;
    const c = parseFloat(costInp.value) || 0;
    totalInp.value = Math.round(q * c);
    if (c > 0 && forResaleInp.checked) priceInp.value = Math.round(c * (1 + markup / 100));
  }

  function calcFromTotal() {
    const t = parseFloat(totalInp.value) || 0;
    const q = parseFloat(qtyInp.value) || 0;
    if (q > 0) {
      const c = t / q;
      costInp.value = c % 1 === 0 ? c : c.toFixed(2);
      if (forResaleInp.checked) priceInp.value = Math.round(c * (1 + markup / 100));
    }
  }

  qtyInp.addEventListener('input', calcFromUnit);
  costInp.addEventListener('input', calcFromUnit);
  totalInp.addEventListener('input', calcFromTotal);

  // Escáner de Código de Barras
  function checkBarcode() {
    const code = barcodeInp.value.trim();
    if (!code) return false;
    const prod = products.find(p => p.barcode === code);
    if (prod) {
      prodSel.value = prod.id;
      costInp.value = prod.cost;
      priceInp.value = prod.price;
      forResaleInp.checked = prod.forResale !== false;
      togglePriceInput();
      calcFromUnit();
      qtyInp.focus();
      qtyInp.select();
      return true;
    }
    return false;
  }

  barcodeInp.addEventListener('input', () => {
    checkBarcode();
  });

  barcodeInp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!checkBarcode() && barcodeInp.value.trim() !== '') {
        import('../utils.js').then(m => m.showToast('Producto no encontrado', 'warning'));
        prodSel.value = '';
      }
    }
  });

  // Selector manual de producto
  prodSel.addEventListener('change', () => {
    const prod = products.find(p => p.id === prodSel.value);
    if (prod) {
      barcodeInp.value = prod.barcode || '';
      costInp.value = prod.cost;
      priceInp.value = prod.price;
      forResaleInp.checked = prod.forResale !== false;
      togglePriceInput();
      calcFromUnit();
      qtyInp.focus();
      qtyInp.select();
    } else {
      resetEntryBar();
    }
  });

  // Agregar a la grilla
  function renderItemsGrid() {
    const tbody = document.getElementById('npItemsBody');
    if (items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center" style="color:var(--text-muted)">No hay productos agregados</td></tr>';
    } else {
      tbody.innerHTML = items.map((it, i) => {
        const prod = products.find(p => p.id === it.productId);
        return `
                <tr>
                  <td><code>${escapeHTML(prod?.barcode || '---')}</code></td>
                  <td><strong>${escapeHTML(prod?.name || 'Desconocido')}</strong></td>
                  <td style="text-align:center"><span class="badge ${it.forResale ? 'badge-success' : 'badge-warning'}">${it.forResale ? 'Venta' : 'Uso Interno'}</span></td>
                  <td style="text-align:center">${it.quantity}</td>
                  <td style="text-align:right">${formatCurrency(it.cost)}</td>
                  <td style="text-align:right;font-weight:700">${formatCurrency(it.cost * it.quantity)}</td>
                  <td style="text-align:right;color:var(--primary-light)">${it.forResale ? formatCurrency(it.price) : '<span style="color:var(--text-muted)">-</span>'}</td>
                  <td style="text-align:center"><button class="btn btn-ghost btn-icon btn-sm text-danger" data-remove="${i}"><i data-lucide="trash-2"></i></button></td>
                </tr>`;
      }).join('');
      if (window.lucide) lucide.createIcons();

      tbody.querySelectorAll('[data-remove]').forEach(btn => {
        btn.onclick = () => { items.splice(parseInt(btn.dataset.remove), 1); renderItemsGrid(); };
      });
    }

    const total = items.reduce((s, it) => s + it.cost * it.quantity, 0);
    document.getElementById('mPurchGrandTotal').textContent = formatCurrency(total);
  }

  document.getElementById('npAddBtn').onclick = () => {
    // Validación de cabecera
    const provId = document.getElementById('mPurchProv').value;
    const noInv = document.getElementById('mPurchNoInvoice').checked;
    const timb = document.getElementById('mPurchTimb').value.trim();
    const t1 = document.getElementById('mPurchT1').value.trim();
    const t2 = document.getElementById('mPurchT2').value.trim();
    const fact = document.getElementById('mPurchFact').value.trim();

    if (!provId) return import('../utils.js').then(m => m.showToast('Seleccione un proveedor primero', 'warning'));
    if (!noInv && (!timb || !t1 || !t2 || !fact)) {
      return import('../utils.js').then(m => m.showToast('Complete los datos de la factura (Timbrado, T1, T2, Factura) o marque "Sin factura"', 'warning'));
    }

    const prodId = prodSel.value;
    const q = parseFloat(qtyInp.value) || 0;
    const c = parseFloat(costInp.value) || 0;
    const p = parseFloat(priceInp.value) || 0;
    const isForResale = forResaleInp.checked;

    if (!prodId) return import('../utils.js').then(m => m.showToast('Seleccione un producto', 'warning'));
    if (q <= 0) return import('../utils.js').then(m => m.showToast('Cantidad inválida', 'warning'));

    const existing = items.find(it => it.productId === prodId);
    if (existing) {
      existing.quantity += q;
      existing.cost = c;
      existing.price = p;
      existing.forResale = isForResale;
    } else {
      items.unshift({ productId: prodId, quantity: q, cost: c, price: p, forResale: isForResale }); // Insertar arriba
    }

    renderItemsGrid();
    resetEntryBar();
  };

  // Prevent form submission on enter in any entry bar input
  document.querySelector('.purchase-entry-bar').addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.id !== 'npBarcode') {
      e.preventDefault();
      document.getElementById('npAddBtn').click();
    }
  });

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
      document.getElementById('mPurchFact').value = Date.now().toString().slice(-7);
    } else {
      document.getElementById('mPurchTimb').value = '';
      document.getElementById('mPurchT1').value = '';
      document.getElementById('mPurchT2').value = '';
      document.getElementById('mPurchFact').value = '';
    }
  };

  // Recover functionality
  document.getElementById('btnRecoverPurch').onclick = async () => {
    const fact = document.getElementById('mPurchFact').value;
    if (!fact) return import('../utils.js').then(m => m.showToast('Ingrese un número de factura para buscar', 'info'));

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
        import('../utils.js').then(m => m.showToast('Datos recuperados'));
      } else {
        import('../utils.js').then(m => m.showToast('No se encontró ninguna factura con ese número', 'warning'));
      }
    } catch (e) { import('../utils.js').then(m => m.showToast(e.message, 'error')); }
  };

  // Guardar compra
  const btnSave = document.getElementById('btnSavePurch');
  btnSave.onclick = async () => {
    if (items.length === 0) return import('../utils.js').then(m => m.showToast('Agregue al menos un producto', 'error'));

    const provId = document.getElementById('mPurchProv').value;
    const noInv = document.getElementById('mPurchNoInvoice').checked;
    const timb = document.getElementById('mPurchTimb').value.trim();
    const t1 = document.getElementById('mPurchT1').value.trim();
    const t2 = document.getElementById('mPurchT2').value.trim();
    const fact = document.getElementById('mPurchFact').value.trim();

    if (!provId) return import('../utils.js').then(m => m.showToast('Seleccione un proveedor', 'warning'));
    if (!noInv && (!timb || !t1 || !t2 || !fact)) {
      return import('../utils.js').then(m => m.showToast('Complete los datos de la factura (Timbrado, T1, T2, Factura)', 'warning'));
    }

    btnSave.disabled = true;
    btnSave.innerHTML = '<i data-lucide="loader"></i> Registrando...';
    if (window.lucide) lucide.createIcons();

    const data = {
      providerId: document.getElementById('mPurchProv').value,
      date: document.getElementById('mPurchDate').value || null,
      items: items.map(it => ({ productId: it.productId, quantity: it.quantity, cost: it.cost, price: it.price, forResale: it.forResale })),
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
      import('../utils.js').then(m => m.showToast('Compra registrada y stock actualizado'));
      renderPurchases(); // Volver al listado
    } catch (e) {
      import('../utils.js').then(m => m.showToast(e.message, 'error'));
      btnSave.disabled = false;
      btnSave.innerHTML = '<i data-lucide="save"></i> Registrar Compra';
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
