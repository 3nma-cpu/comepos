// ============================================
// Sales Module (POS Interface)
// ============================================

import { api } from '../api.js';
import { generateId, showToast, createModal, closeModal, formatCurrency, formatDateTime, escapeHTML, PRODUCT_CATEGORIES, PAYMENT_METHODS } from '../utils.js';
import { openCashRegisterFromPOS } from './cashregister.js';

let cart = [];
let selectedClient = null;
let allProducts = [];
let allClients = [];

export async function renderSales() {
  cart = [];
  selectedClient = null;
  const container = document.getElementById('module-content');
  container.innerHTML = '<div class="fade-in"><div class="empty-state"><p>Cargando POS...</p></div></div>';

  try {
    // Verificar caja abierta antes de cargar POS
    const activeData = await api.get('/cashregister/active');
    if (!activeData.mine) {
      // No hay caja abierta — mostrar modal para abrir
      const opened = await openCashRegisterFromPOS();
      if (!opened) {
        container.innerHTML = `
          <div class="fade-in" style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:4rem 2rem;text-align:center">
            <div style="width:64px;height:64px;border-radius:50%;background:rgba(245,158,11,.12);display:flex;align-items:center;justify-content:center;margin-bottom:1rem">
              <i data-lucide="lock" style="width:32px;height:32px;color:var(--warning)"></i>
            </div>
            <h3 style="margin-bottom:.5rem">Caja No Abierta</h3>
            <p style="color:var(--text-secondary);margin-bottom:1.5rem">Debe abrir una caja para poder registrar ventas.</p>
            <button class="btn btn-primary" id="btnRetryOpen"><i data-lucide="lock-open"></i> Abrir Caja</button>
          </div>`;
        if (window.lucide) lucide.createIcons();
        document.getElementById('btnRetryOpen')?.addEventListener('click', () => renderSales());
        return;
      }
    }
    const [allFetchedProducts, clients] = await Promise.all([api.get('/products'), api.get('/clients')]);
    // Filtrar productos que no son para venta (uso interno)
    const products = allFetchedProducts.filter(p => p.forResale !== false);
    allProducts = products;
    allClients = clients;
    const categories = ['Todos', ...PRODUCT_CATEGORIES];

    container.innerHTML = `
        <div class="fade-in">
          <div class="pos-layout">
            <div class="pos-products">
              <div class="category-tabs" id="posCatTabs">
                ${categories.map((c, i) => `<div class="category-tab ${i === 0 ? 'active' : ''}" data-cat="${c}">${c}</div>`).join('')}
              </div>
              <div class="search-bar" style="margin-bottom:1rem">
                <i data-lucide="search"></i>
                <input type="text" class="form-control" id="posSearchProd" placeholder="Buscar producto..." />
              </div>
              <div class="product-grid" id="posProductGrid"></div>
            </div>
            <div class="pos-cart">
              <div class="pos-cart-header">
                <h3 style="font-size:1rem;font-weight:700;margin-bottom:.75rem">Carrito de Venta</h3>
                <div class="cart-client-select">
                  <div class="search-bar">
                    <i data-lucide="user"></i>
                    <input type="text" class="form-control" id="posClientSearch" placeholder="Buscar cliente..." />
                  </div>
                  <div id="posClientResults" class="pos-client-dropdown"></div>
                  <div id="posSelectedClient" style="margin-top:.5rem"></div>
                </div>
              </div>
              <div class="pos-cart-items" id="posCartItems">
                <div class="empty-state" style="padding:2rem 1rem">
                  <p style="color:var(--text-muted)">Seleccione productos para agregar</p>
                </div>
              </div>
              <div class="pos-cart-footer">
                <div id="posCartSummary"></div>
                <button class="btn btn-primary" style="width:100%;margin-top:.75rem" id="btnProcessSale" disabled>
                  <i data-lucide="check-circle"></i>Procesar Venta
                </button>
              </div>
            </div>
          </div>
        </div>`;
    if (window.lucide) lucide.createIcons();

    // Cash register status indicator
    const activeCheck = await api.get('/cashregister/active');
    if (activeCheck.mine) {
      const statusEl = document.createElement('div');
      statusEl.className = 'cash-register-indicator';
      statusEl.innerHTML = `<i data-lucide="landmark" style="width:14px;height:14px"></i> Caja abierta desde ${formatDateTime(activeCheck.mine.openedAt)}`;
      const posProducts = container.querySelector('.pos-products');
      if (posProducts) posProducts.insertBefore(statusEl, posProducts.firstChild);
      if (window.lucide) lucide.createIcons();
    }


    renderProductGrid(products, 'Todos', '');

    // Category filter
    document.getElementById('posCatTabs').addEventListener('click', e => {
      const tab = e.target.closest('.category-tab');
      if (!tab) return;
      document.querySelectorAll('#posCatTabs .category-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const q = document.getElementById('posSearchProd').value.toLowerCase();
      renderProductGrid(products, tab.dataset.cat, q);
    });

    // Search products
    document.getElementById('posSearchProd').addEventListener('input', e => {
      const activeCat = document.querySelector('#posCatTabs .category-tab.active')?.dataset.cat || 'Todos';
      renderProductGrid(products, activeCat, e.target.value.toLowerCase());
    });

    // Client search
    const clientInput = document.getElementById('posClientSearch');
    const clientResults = document.getElementById('posClientResults');

    clientInput.addEventListener('input', e => {
      const q = e.target.value.toLowerCase().trim();
      if (q.length < 2) { clientResults.style.display = 'none'; return; }
      const filteredClients = clients.filter(c => c.name.toLowerCase().includes(q) || (c.cedula && c.cedula.includes(q)));
      if (filteredClients.length === 0) { clientResults.style.display = 'none'; return; }
      clientResults.style.display = 'block';
      clientResults.innerHTML = filteredClients.slice(0, 6).map(c => `
          <div class="pos-client-option" data-client-id="${c.id}">
            <strong>${escapeHTML(c.name)}</strong> <span style="color:var(--text-muted)">— ${c.cedula || ''} — ${c.category}</span>
          </div>`).join('');
      clientResults.querySelectorAll('[data-client-id]').forEach(el => {
        el.onclick = () => {
          const client = clients.find(c => c.id === el.dataset.clientId);
          selectClient(client);
          clientResults.style.display = 'none';
          clientInput.value = '';
        };
      });
    });

    clientInput.addEventListener('blur', () => setTimeout(() => { clientResults.style.display = 'none'; }, 200));

    document.getElementById('btnProcessSale').onclick = () => processSale();

  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>Error al cargar POS: ${err.message}</p></div>`;
  }
}

function selectClient(client) {
  selectedClient = client;
  const el = document.getElementById('posSelectedClient');
  el.innerHTML = `<div style="display:flex;align-items:center;gap:.5rem;padding:.4rem .6rem;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius);font-size:.85rem;color:var(--text)">
    <i data-lucide="user" style="width:14px;height:14px"></i>
    <strong>${escapeHTML(client.name)}</strong> <span class="badge badge-primary" style="font-size:.7rem">${client.category}</span>
    <button class="btn btn-ghost btn-icon" style="margin-left:auto;padding:2px" id="btnRemoveClient"><i data-lucide="x" style="width:14px;height:14px"></i></button>
  </div>`;
  if (window.lucide) lucide.createIcons();
  if (window.lucide) lucide.createIcons();
  document.getElementById('btnRemoveClient').onclick = () => { selectedClient = null; el.innerHTML = ''; updateCartUI(); };
  updateCartUI();
}

function renderProductGrid(products, category, search) {
  const grid = document.getElementById('posProductGrid');
  let filtered = products;
  if (category !== 'Todos') filtered = filtered.filter(p => p.category === category);
  if (search) filtered = filtered.filter(p => p.name.toLowerCase().includes(search));

  grid.innerHTML = filtered.map(p => {
    const unit = p.unit || 'UNI';
    const stockDisplay = unit === 'UNI' ? Math.floor(p.stock) : Number(p.stock).toFixed(2);
    return `
    <div class="product-card ${p.stock <= 0 ? 'out-of-stock' : ''}" data-prod-id="${p.id}">
      <div class="product-name" style="font-weight:700">${escapeHTML(p.name)}</div>
      <div class="product-price">${formatCurrency(p.price)}<span style="font-size:.7rem;color:var(--text-muted)"> / ${unit}</span></div>
      <div style="font-size:.7rem;color:${p.stock <= 5 ? 'var(--warning)' : 'var(--text-muted)'};margin-top:.25rem">Stock: ${stockDisplay} ${unit}</div>
    </div>`;
  }).join('');

  grid.querySelectorAll('.product-card:not(.out-of-stock)').forEach(card => {
    card.onclick = () => addToCart(card.dataset.prodId);
  });
}

function addToCart(productId) {
  const product = allProducts.find(p => p.id === productId);
  if (!product || product.stock <= 0) return;

  const existing = cart.find(c => c.productId === productId);
  if (existing) {
    const newQty = existing.quantity + 1;
    if (newQty > product.stock) return showToast('Stock insuficiente', 'error');
    existing.quantity = newQty;
  } else {
    cart.push({ productId, name: product.name, price: product.price, quantity: 1, unit: product.unit || 'UNI', maxStock: product.stock });
  }
  updateCartUI();
}

function updateCartUI() {
  const itemsEl = document.getElementById('posCartItems');
  const summaryEl = document.getElementById('posCartSummary');
  const btnProcess = document.getElementById('btnProcessSale');

  if (cart.length === 0) {
    itemsEl.innerHTML = '<div class="empty-state" style="padding:2rem 1rem"><p style="color:var(--text-muted)">Seleccione productos para agregar</p></div>';
    summaryEl.innerHTML = '';
    btnProcess.disabled = true;
    return;
  }

  itemsEl.innerHTML = cart.map((item, i) => {
    const unit = item.unit || 'UNI';
    const step = unit === 'UNI' ? '1' : '0.01';
    return `
    <div class="cart-item">
      <div class="cart-item-info">
        <div class="cart-item-name">${escapeHTML(item.name)} <span style="font-size:.7rem;color:var(--text-muted)">(${unit})</span></div>
        <div class="cart-item-price">${formatCurrency(item.price)} / ${unit}</div>
      </div>
      <div class="cart-item-qty">
        <button data-qty-minus="${i}">−</button>
        <input type="number" value="${item.quantity}" min="${step}" max="${item.maxStock}" step="${step}"
          style="width:60px;text-align:center;border:1px solid var(--border);border-radius:4px;background:var(--bg-input);color:var(--text);padding:2px 4px;font-size:.85rem"
          data-qty-input="${i}" />
        <button data-qty-plus="${i}">+</button>
      </div>
      <div style="font-weight:700;font-size:.85rem;min-width:80px;text-align:right">${formatCurrency(item.price * item.quantity)}</div>
    </div>`;
  }).join('');

  const subtotal = cart.reduce((s, it) => s + it.price * it.quantity, 0);
  summaryEl.innerHTML = `
    <div class="cart-summary-row"><span>Subtotal</span><span>${formatCurrency(subtotal)}</span></div>
    <div class="cart-summary-row total"><span>TOTAL</span><span>${formatCurrency(subtotal)}</span></div>`;

  btnProcess.disabled = !selectedClient;

  // Minus button
  itemsEl.querySelectorAll('[data-qty-minus]').forEach(btn => {
    btn.onclick = () => {
      const idx = parseInt(btn.dataset.qtyMinus);
      const unit = cart[idx].unit || 'UNI';
      const step = unit === 'UNI' ? 1 : 0.1;
      cart[idx].quantity = Math.max(0, parseFloat((cart[idx].quantity - step).toFixed(3)));
      if (cart[idx].quantity <= 0) cart.splice(idx, 1);
      updateCartUI();
    };
  });

  // Plus button
  itemsEl.querySelectorAll('[data-qty-plus]').forEach(btn => {
    btn.onclick = () => {
      const idx = parseInt(btn.dataset.qtyPlus);
      const prod = allProducts.find(p => p.id === cart[idx].productId);
      const unit = cart[idx].unit || 'UNI';
      const step = unit === 'UNI' ? 1 : 0.1;
      const newQty = parseFloat((cart[idx].quantity + step).toFixed(3));
      if (prod && newQty > prod.stock) return showToast('Stock insuficiente', 'error');
      cart[idx].quantity = newQty;
      updateCartUI();
    };
  });

  // Direct quantity input
  itemsEl.querySelectorAll('[data-qty-input]').forEach(input => {
    input.addEventListener('change', () => {
      const idx = parseInt(input.dataset.qtyInput);
      const val = parseFloat(input.value) || 0;
      const prod = allProducts.find(p => p.id === cart[idx].productId);
      if (val <= 0) { cart.splice(idx, 1); updateCartUI(); return; }
      if (prod && val > prod.stock) { showToast('Stock insuficiente', 'error'); input.value = cart[idx].quantity; return; }
      cart[idx].quantity = val;
      updateCartUI();
    });
  });
}

function processSale() {
  if (cart.length === 0 || !selectedClient) return;

  const total = cart.reduce((s, it) => s + it.price * it.quantity, 0);
  import('../utils.js').then(({ todayStr }) => {
    const today = todayStr();
    
    const body = `
    <div style="margin-bottom:1rem;padding:1rem;background:var(--bg-input);border-radius:var(--radius)">
      <div style="font-size:.85rem;color:var(--text-secondary);margin-bottom:.25rem">Cliente</div>
      <div style="font-weight:600">${escapeHTML(selectedClient.name)} <span class="badge badge-primary">${selectedClient.category}</span></div>
    </div>
    <div class="table-container" style="margin-bottom:1rem;max-height:200px;overflow-y:auto">
      <table>
        <thead><tr><th>Producto</th><th>Cant.</th><th>Subtotal</th></tr></thead>
        <tbody>${cart.map(it => `<tr><td>${escapeHTML(it.name)}</td><td>${it.quantity}</td><td>${formatCurrency(it.price * it.quantity)}</td></tr>`).join('')}</tbody>
      </table>
    </div>
    <div style="text-align:right;font-size:1.3rem;font-weight:800;color:var(--primary-light);margin-bottom:1rem">TOTAL: ${formatCurrency(total)}</div>
    <div class="form-group">
      <label>Método de Pago</label>
      <select class="form-control" id="mPayMethod">${PAYMENT_METHODS.map(m => `<option value="${m.id}">${m.name}</option>`).join('')}</select>
    </div>
    <div class="form-group" style="margin-top:1rem">
      <label>Fecha de la Venta (Opcional)</label>
      <input type="date" class="form-control" id="mSaleDate" value="${today}" max="${today}" />
      <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.25rem">Por defecto es hoy. Modificar solo para registrar ventas pasadas.</div>
    </div>`;
  const footer = `<button class="btn btn-secondary modal-close">Cancelar</button><button class="btn btn-success" id="btnConfirmSale"><i data-lucide="check"></i>Confirmar Venta</button>`;
  const overlay = createModal('Confirmar Venta', body, footer);

  const btnConfirm = document.getElementById('btnConfirmSale');
  btnConfirm.onclick = async () => {
    // Prevent duplicates
    btnConfirm.disabled = true;
    btnConfirm.innerHTML = '<i data-lucide="loader"></i> Procesando...';
    if (window.lucide) lucide.createIcons();

    const paymentMethod = document.getElementById('mPayMethod').value;
    const saleDate = document.getElementById('mSaleDate').value;
    
    const payload = {
      clientId: selectedClient.id,
      items: cart.map(it => ({ productId: it.productId, quantity: it.quantity })),
      paymentMethod,
      date: saleDate
    };

    try {
      const newSale = await api.post('/sales', payload);
      closeModal(overlay);

      // Save references for ticket before clearing
      const ticketData = {
        ...newSale,
        clientName: selectedClient.name,
        items: [...cart]
      };

      // Clear cart
      cart = [];
      selectedClient = null;
      
      // Show success modal (ticket)
      showTicket(ticketData);
      showToast('¡Venta registrada con éxito!');
      
      // Refresh background UI
      renderSales();
    } catch (e) {
      showToast(e.message, 'error');
      btnConfirm.disabled = false;
      btnConfirm.innerHTML = '<i data-lucide="check"></i> Confirmar Venta';
      if (window.lucide) lucide.createIcons();
    }
  };
  });
}

export function showTicket(sale) {
  const payLabels = { efectivo: 'Efectivo', transferencia: 'Transferencia', nomina: 'VALE DE COMEDOR' };
  const user = JSON.parse(localStorage.getItem('comepos_session') || '{}');
  const vendorName = sale.userName || user.name || 'Cajero';

  const ticketId = sale.id.slice(-6).toUpperCase();

  const body = `
    <div class="ticket-preview" id="ticketPrintArea">
      <!-- Encabezado -->
      <div style="text-align:center;font-family:'Courier New',Courier,monospace">
        <div style="font-weight:700;font-size:1rem;letter-spacing:1px">COMEDOR TTA S.A.</div>
        <div style="font-size:.72rem;color:#555;margin-top:2px">Vale de Comedor</div>
      </div>
      <div class="ticket-divider"></div>

      <!-- Datos de venta -->
      <div class="ticket-line"><span>Ticket #:</span><span>${ticketId}</span></div>
      <div class="ticket-line"><span>Fecha:</span><span>${formatDateTime(sale.date)}</span></div>
      <div class="ticket-line"><span>Cliente:</span><span>${escapeHTML(sale.clientName)}</span></div>
      <div class="ticket-line"><span>Pago:</span><span>${payLabels[sale.paymentMethod] || sale.paymentMethod}</span></div>
      <div class="ticket-line"><span>Cajero:</span><span>${escapeHTML(vendorName)}</span></div>
      <div class="ticket-divider"></div>

      <!-- Items -->
      <div style="font-family:'Courier New',Courier,monospace;font-size:.72rem">
        <div style="display:flex;justify-content:space-between;font-weight:700;border-bottom:1px dashed #ccc;padding-bottom:2px;margin-bottom:4px">
          <span>Producto</span><span>SubTotal</span>
        </div>
        ${sale.items.map(it => `
        <div style="display:flex;justify-content:space-between;margin-bottom:2px">
          <span>${escapeHTML(it.name)} x${it.quantity}${it.unit ? ' '+it.unit : ''}</span>
          <span>${formatCurrency(it.price * it.quantity)}</span>
        </div>`).join('')}
      </div>
      <div class="ticket-divider"></div>

      <!-- Total -->
      <div class="ticket-line ticket-total"><span>TOTAL</span><span>${formatCurrency(sale.total)}</span></div>
      <div class="ticket-divider"></div>

      <!-- Mensaje -->
      <div style="text-align:center;font-size:.68rem;color:#555;margin:6px 0">¡Gracias por su consumo!</div>
      <div class="ticket-divider" style="margin-bottom:10px"></div>

      <!-- Firma exclusiva del cliente (centrada y destacada con amplio espacio para firmar) -->
      <div style="text-align:center;margin:15px auto 10px auto;width:80%;font-family:'Courier New',Courier,monospace">
        <div style="border-top:2px solid #333;padding-top:6px;margin-top:65px">
          <div style="font-weight:700;font-size:.85rem">${escapeHTML(sale.clientName)}</div>
          <div style="font-size:.72rem;font-weight:700;letter-spacing:1px;color:#333;margin-top:2px">FIRMA DEL CLIENTE</div>
        </div>
      </div>
    </div>`;

  const footer = `
    <button class="btn btn-ghost" id="btnPrintTicket">
      <i data-lucide="printer"></i> Imprimir
    </button>
    <button class="btn btn-primary modal-close">Cerrar</button>`;

  const modal = createModal('Ticket de Venta', body, footer);
  if (window.lucide) lucide.createIcons();

  document.getElementById('btnPrintTicket').onclick = () => printTicket(ticketId, sale, vendorName, payLabels);
}

function printTicket(ticketId, sale, vendorName, payLabels) {
  const payLabel = payLabels[sale.paymentMethod] || sale.paymentMethod;
  const printWin = window.open('', '_blank', 'width=400,height=600');

  printWin.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <title>Ticket #${ticketId}</title>
  <style>
    @page {
      margin: 0;
      size: auto;
    }
    * { 
      box-sizing: border-box; 
      margin: 0; 
      padding: 0; 
    }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 8.5pt;
      line-height: 1.3;
      width: 68mm;
      max-width: 100%;
      padding: 3mm 2mm 8mm 2mm;
      margin: 0 auto;
      background: #fff;
      color: #000;
    }
    .center { 
      text-align: center; 
    }
    .bold { 
      font-weight: 700; 
    }
    .header-title {
      font-weight: 700;
      font-size: 11pt;
      letter-spacing: 1px;
    }
    .header-subtitle {
      font-size: 8pt;
      color: #333;
      margin-top: 2px;
    }
    .divider-dash {
      border: none;
      border-top: 1px dashed #555;
      margin: 4px 0;
    }
    .ticket-line {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 6px;
      margin: 2px 0;
      font-size: 8.5pt;
    }
    .ticket-line span:first-child {
      flex-shrink: 0;
    }
    .ticket-line span:last-child {
      text-align: right;
      word-break: break-word;
    }
    .items-header {
      display: flex;
      justify-content: space-between;
      font-weight: 700;
      border-bottom: 1px dashed #555;
      padding-bottom: 2px;
      margin-bottom: 3px;
      font-size: 8.5pt;
    }
    .item-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 6px;
      margin-bottom: 2px;
      font-size: 8.5pt;
    }
    .item-name {
      text-align: left;
      word-break: break-word;
      padding-right: 4px;
    }
    .item-price {
      white-space: nowrap;
      text-align: right;
    }
    .ticket-total {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 10.5pt;
      font-weight: 700;
      margin: 3px 0;
    }
    .ticket-message {
      text-align: center;
      font-size: 8pt;
      color: #444;
      margin: 6px 0;
    }
    .signature-container {
      text-align: center;
      margin: 18mm auto 4mm auto;
      width: 82%;
    }
    .signature-line-bar {
      border-top: 2px solid #000;
      padding-top: 4px;
    }
    .signature-client {
      font-weight: 700;
      font-size: 8.5pt;
    }
    .signature-caption {
      font-size: 7.5pt;
      font-weight: 700;
      letter-spacing: 1px;
      color: #222;
      margin-top: 2px;
    }
  </style>
</head>
<body>

  <!-- Encabezado -->
  <div class="center">
    <div class="header-title">COMEDOR TTA S.A.</div>
    <div class="header-subtitle">Vale de Comedor</div>
  </div>
  <hr class="divider-dash"/>

  <!-- Datos de venta -->
  <div class="ticket-line">
    <span>Ticket #:</span>
    <span class="bold">${ticketId}</span>
  </div>
  <div class="ticket-line">
    <span>Fecha:</span>
    <span>${formatDateTime(sale.date)}</span>
  </div>
  <div class="ticket-line">
    <span>Cliente:</span>
    <span>${escapeHTML(sale.clientName)}</span>
  </div>
  <div class="ticket-line">
    <span>Pago:</span>
    <span>${payLabel}</span>
  </div>
  <div class="ticket-line">
    <span>Cajero:</span>
    <span>${escapeHTML(vendorName)}</span>
  </div>
  <hr class="divider-dash"/>

  <!-- Items -->
  <div>
    <div class="items-header">
      <span>Producto</span>
      <span>SubTotal</span>
    </div>
    ${sale.items.map(it => `
    <div class="item-row">
      <span class="item-name">${escapeHTML(it.name)} x${it.quantity}${it.unit ? ' ' + it.unit : ''}</span>
      <span class="item-price">${formatCurrency(it.price * it.quantity)}</span>
    </div>`).join('')}
  </div>
  <hr class="divider-dash"/>

  <!-- Total -->
  <div class="ticket-total">
    <span>TOTAL</span>
    <span>${formatCurrency(sale.total)}</span>
  </div>
  <hr class="divider-dash"/>

  <!-- Mensaje -->
  <div class="ticket-message">¡Gracias por su consumo!</div>
  <hr class="divider-dash"/>

  <!-- Firma del cliente -->
  <div class="signature-container">
    <div class="signature-line-bar">
      <div class="signature-client">${escapeHTML(sale.clientName)}</div>
      <div class="signature-caption">FIRMA DEL CLIENTE</div>
    </div>
  </div>

</body>
</html>
`);

  printWin.document.close();
  printWin.focus();
  setTimeout(() => { printWin.print(); printWin.close(); }, 350);
}
