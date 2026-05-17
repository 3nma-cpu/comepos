// ============================================
// Sales Module (POS Interface)
// ============================================

import { api } from '../api.js';
import { generateId, showToast, createModal, closeModal, formatCurrency, formatDateTime, escapeHTML, PRODUCT_CATEGORIES, PAYMENT_METHODS } from '../utils.js';

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
    const [products, clients] = await Promise.all([api.get('/products'), api.get('/clients')]);
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
                  <div id="posClientResults" style="display:none;position:absolute;z-index:10;background:rgba(25,25,50,.98);border:1px solid var(--border);border-radius:var(--radius);max-height:180px;overflow-y:auto;width:calc(100% - 2.5rem);margin-top:.25rem"></div>
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
          <div style="padding:.5rem .75rem;cursor:pointer;border-bottom:1px solid var(--border);font-size:.85rem;transition:background .15s" 
               onmouseover="this.style.background='var(--bg-card-hover)'" onmouseout="this.style.background='transparent'" data-client-id="${c.id}">
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
  el.innerHTML = `<div style="display:flex;align-items:center;gap:.5rem;padding:.4rem .6rem;background:rgba(99,102,241,.1);border-radius:var(--radius);font-size:.85rem">
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
      ${p.stock <= 5 ? `<div style="font-size:.7rem;color:var(--warning);margin-top:.25rem">Stock: ${stockDisplay} ${unit}</div>` : ''}
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
          style="width:60px;text-align:center;border:1px solid var(--border);border-radius:4px;background:var(--bg-input);color:var(--text-primary);padding:2px 4px;font-size:.85rem"
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

function showTicket(sale) {
  const payLabels = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', nomina: 'VALE DE COMEDOR' };
  const user = JSON.parse(localStorage.getItem('comepos_session') || '{}');
  const vendorName = user.name || 'Vendedor';

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
      <div class="ticket-divider" style="margin-bottom:20px"></div>

      <!-- Firmas -->
      <div style="display:flex;justify-content:space-between;font-family:'Courier New',Courier,monospace;font-size:.72rem;margin-top:8px">
        <!-- Vendedor (izquierda) -->
        <div style="text-align:center;width:45%">
          <div style="border-top:1px solid #333;padding-top:4px;margin-top:30px">
            <div style="font-weight:700">${escapeHTML(vendorName)}</div>
            <div style="color:#555;font-size:.65rem">Vendedor</div>
          </div>
        </div>
        <!-- Cliente (derecha) -->
        <div style="text-align:center;width:45%">
          <div style="border-top:1px solid #333;padding-top:4px;margin-top:30px">
            <div style="font-weight:700">${escapeHTML(sale.clientName)}</div>
            <div style="color:#555;font-size:.65rem">Cliente</div>
          </div>
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

  const itemsHTML = sale.items.map(it =>
    `<tr>
      <td>${escapeHTML(it.name)} x${it.quantity}${it.unit ? ' '+it.unit : ''}</td>
      <td style="text-align:right">${formatCurrency(it.price * it.quantity)}</td>
    </tr>`
  ).join('');

  printWin.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <title>Ticket #${ticketId}</title>
  <style>
    /* =============================================
       EPSON TM-U220D — 76mm paper (~42 chars)
       ============================================= */
    @page {
      margin: 0;
      size: 76mm auto;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 10pt;
      width: 72mm;
      padding: 3mm 2mm;
      color: #000;
      background: #fff;
    }
    .center  { text-align: center; }
    .right   { text-align: right; }
    .bold    { font-weight: bold; }
    .small   { font-size: 8pt; }
    .divider {
      border: none;
      border-top: 1px dashed #000;
      margin: 4px 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9pt;
    }
    table td { padding: 1px 0; vertical-align: top; }
    .info-row {
      display: flex;
      justify-content: space-between;
      font-size: 9pt;
      margin: 2px 0;
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      font-weight: bold;
      font-size: 11pt;
      margin: 4px 0;
    }
    .sig-section {
      display: flex;
      justify-content: space-between;
      margin-top: 18mm; /* espacio para firma a mano */
    }
    .sig-box {
      width: 46%;
      text-align: center;
      border-top: 1px solid #000;
      padding-top: 3px;
      font-size: 8pt;
    }
    .sig-box .sig-name { font-weight: bold; font-size: 9pt; }
    .sig-space { height: 12mm; } /* espacio en blanco para firma */
    @media print {
      body { width: 72mm; }
    }
  </style>
</head>
<body>
  <!-- ENCABEZADO -->
  <div class="center bold" style="font-size:12pt;letter-spacing:1px">COMEDOR TTA S.A.</div>
  <div class="center small">Vale de Comedor</div>
  <hr class="divider"/>

  <!-- DATOS -->
  <div class="info-row"><span>Ticket #:</span><span>${ticketId}</span></div>
  <div class="info-row"><span>Fecha:</span><span>${formatDateTime(sale.date)}</span></div>
  <div class="info-row"><span>Cliente:</span><span>${escapeHTML(sale.clientName)}</span></div>
  <div class="info-row"><span>Pago:</span><span>${payLabel}</span></div>
  <hr class="divider"/>

  <!-- ITEMS -->
  <table>
    <thead>
      <tr>
        <td class="bold">Producto</td>
        <td class="bold right">SubTotal</td>
      </tr>
    </thead>
    <tbody>${itemsHTML}</tbody>
  </table>
  <hr class="divider"/>

  <!-- TOTAL -->
  <div class="total-row">
    <span>TOTAL</span>
    <span>${formatCurrency(sale.total)}</span>
  </div>
  <hr class="divider"/>

  <!-- PIE -->
  <div class="center small" style="margin:4px 0">¡Gracias por su consumo!</div>
  <hr class="divider"/>

  <!-- FIRMAS -->
  <div class="sig-section">
    <div class="sig-box">
      <div class="sig-space"></div>
      <div class="sig-name">${escapeHTML(vendorName)}</div>
      <div>Vendedor</div>
    </div>
    <div class="sig-box">
      <div class="sig-space"></div>
      <div class="sig-name">${escapeHTML(sale.clientName)}</div>
      <div>Cliente</div>
    </div>
  </div>
</body>
</html>`);

  printWin.document.close();
  printWin.focus();
  setTimeout(() => { printWin.print(); printWin.close(); }, 400);
}
