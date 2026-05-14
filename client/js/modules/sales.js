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

  grid.innerHTML = filtered.map(p => `
    <div class="product-card ${p.stock <= 0 ? 'out-of-stock' : ''}" data-prod-id="${p.id}">
      <div class="product-name" style="font-weight:700">${escapeHTML(p.name)}</div>
      <div class="product-price">${formatCurrency(p.price)}</div>
      <div style="font-size:.7rem;color:${p.stock <= 0 ? 'var(--danger)' : p.stock <= 5 ? 'var(--warning)' : 'var(--text-muted)'};margin-top:.25rem">
        Stock: ${p.stock} ${p.unit || 'UNI'}
      </div>
    </div>`).join('');

  grid.querySelectorAll('.product-card:not(.out-of-stock)').forEach(card => {
    card.onclick = () => addToCart(card.dataset.prodId);
  });
}

function addToCart(productId) {
  const product = allProducts.find(p => p.id === productId);
  if (!product || product.stock <= 0) return;

  const existing = cart.find(c => c.productId === productId);
  if (existing) {
    if (existing.quantity >= product.stock) return showToast('Stock insuficiente', 'error');
    existing.quantity++;
  } else {
    cart.push({ productId, name: product.name, price: product.price, quantity: 1, unit: product.unit || 'UNI' });
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

  itemsEl.innerHTML = cart.map((item, i) => `
    <div class="cart-item">
      <div class="cart-item-info">
        <div class="cart-item-name">${escapeHTML(item.name)}</div>
        <div class="cart-item-price">${formatCurrency(item.price)} / ${item.unit}</div>
      </div>
      <div class="cart-item-qty">
        <button data-qty-minus="${i}">−</button>
        <input type="number" step="any" class="cart-qty-input" data-qty-idx="${i}" value="${item.quantity}" style="width:50px;text-align:center;background:transparent;border:1px solid var(--border);border-radius:4px;color:white" />
        <button data-qty-plus="${i}">+</button>
      </div>
      <div style="font-weight:700;font-size:.85rem;min-width:80px;text-align:right">${formatCurrency(item.price * item.quantity)}</div>
    </div>`).join('');

  const subtotal = cart.reduce((s, it) => s + it.price * it.quantity, 0);
  summaryEl.innerHTML = `
    <div class="cart-summary-row"><span>Subtotal</span><span>${formatCurrency(subtotal)}</span></div>
    <div class="cart-summary-row total"><span>TOTAL</span><span>${formatCurrency(subtotal)}</span></div>`;

  btnProcess.disabled = !selectedClient;

  itemsEl.querySelectorAll('.cart-qty-input').forEach(inp => {
    inp.onchange = () => {
      const idx = parseInt(inp.dataset.qtyIdx);
      const val = parseFloat(inp.value) || 0;
      const prod = allProducts.find(p => p.id === cart[idx].productId);
      if (prod && val > prod.stock) {
        showToast('Stock insuficiente', 'error');
        inp.value = cart[idx].quantity;
        return;
      }
      if (val <= 0) cart.splice(idx, 1);
      else cart[idx].quantity = val;
      updateCartUI();
    };
  });

  itemsEl.querySelectorAll('[data-qty-minus]').forEach(btn => {
    btn.onclick = () => {
      const idx = parseInt(btn.dataset.qtyMinus);
      cart[idx].quantity = Math.max(0, cart[idx].quantity - 1);
      if (cart[idx].quantity <= 0) cart.splice(idx, 1);
      updateCartUI();
    };
  });

  itemsEl.querySelectorAll('[data-qty-plus]').forEach(btn => {
    btn.onclick = () => {
      const idx = parseInt(btn.dataset.qtyPlus);
      const prod = allProducts.find(p => p.id === cart[idx].productId);
      if (prod && cart[idx].quantity + 1 > prod.stock) return showToast('Stock insuficiente', 'error');
      cart[idx].quantity++;
      updateCartUI();
    };
  });
}

function processSale() {
  if (cart.length === 0 || !selectedClient) return;

  const total = cart.reduce((s, it) => s + it.price * it.quantity, 0);
  const body = `
    <div style="margin-bottom:1rem;padding:1rem;background:var(--bg-input);border-radius:var(--radius)">
      <div style="font-size:.85rem;color:var(--text-secondary);margin-bottom:.25rem">Cliente</div>
      <div style="font-weight:600">${escapeHTML(selectedClient.name)} <span class="badge badge-primary">${selectedClient.category}</span></div>
    </div>
    <div class="table-container" style="margin-bottom:1rem;max-height:200px;overflow-y:auto">
      <table>
        <thead><tr><th>Producto</th><th>Cant.</th><th>Subtotal</th></tr></thead>
        <tbody>${cart.map(it => `<tr><td>${escapeHTML(it.name)}</td><td>${it.quantity} ${it.unit}</td><td>${formatCurrency(it.price * it.quantity)}</td></tr>`).join('')}</tbody>
      </table>
    </div>
    <div style="text-align:right;font-size:1.3rem;font-weight:800;color:var(--primary-light);margin-bottom:1rem">TOTAL: ${formatCurrency(total)}</div>
    <div class="form-group">
      <label>Método de Pago</label>
      <select class="form-control" id="mPayMethod">${PAYMENT_METHODS.map(m => `<option value="${m.id}">${m.name}</option>`).join('')}</select>
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
    const payload = {
      clientId: selectedClient.id,
      items: cart.map(it => ({ productId: it.productId, quantity: it.quantity })),
      paymentMethod
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
}

function showTicket(sale) {
  const payLabels = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', nomina: 'Desc. Nómina' };
  const body = `
    <div class="ticket-preview">
      <h4>Comedor TTA S.A.</h4>
      <p style="text-align:center;font-size:.7rem;color:#666">Vale de Comedor</p>
      <div class="ticket-divider"></div>
      <div class="ticket-line"><span>Fecha:</span><span>${formatDateTime(sale.date)}</span></div>
      <div class="ticket-line"><span>Cliente:</span><span>${sale.clientName}</span></div>
      <div class="ticket-line"><span>Pago:</span><span>${payLabels[sale.paymentMethod] || sale.paymentMethod}</span></div>
      <div class="ticket-divider"></div>
      ${sale.items.map(it => `<div class="ticket-line"><span>${it.name} x${it.quantity}</span><span>${formatCurrency(it.price * it.quantity)}</span></div>`).join('')}
      <div class="ticket-divider"></div>
      <div class="ticket-line ticket-total"><span>TOTAL</span><span>${formatCurrency(sale.total)}</span></div>
      <div class="ticket-footer">¡Gracias por su compra!<br/>Ticket #${sale.id.slice(-6).toUpperCase()}</div>
    </div>`;
  createModal('Ticket de Venta', body, '<button class="btn btn-primary modal-close">Cerrar</button>');
}
