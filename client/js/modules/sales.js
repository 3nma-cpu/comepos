// ============================================
// Sales Module (POS Interface)
// ============================================

import { getCollection, addItem, updateItem } from '../store.js';
import { generateId, showToast, createModal, closeModal, formatCurrency, formatDateTime, escapeHTML, PRODUCT_CATEGORIES, PAYMENT_METHODS } from '../utils.js';
import { getCurrentUser } from '../auth.js';

let cart = [];
let selectedClient = null;

export function renderSales() {
    cart = [];
    selectedClient = null;
    const container = document.getElementById('module-content');
    const products = getCollection('products');
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
            <h3 style="font-size:1rem;font-weight:700;margin-bottom:.75rem">🛒 Carrito de Venta</h3>
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
        const clients = getCollection('clients').filter(c => c.name.toLowerCase().includes(q) || c.cedula.includes(q));
        if (clients.length === 0) { clientResults.style.display = 'none'; return; }
        clientResults.style.display = 'block';
        clientResults.innerHTML = clients.slice(0, 6).map(c => `
      <div style="padding:.5rem .75rem;cursor:pointer;border-bottom:1px solid var(--border);font-size:.85rem;transition:background .15s" 
           onmouseover="this.style.background='var(--bg-card-hover)'" onmouseout="this.style.background='transparent'" data-client-id="${c.id}">
        <strong>${escapeHTML(c.name)}</strong> <span style="color:var(--text-muted)">— ${c.cedula} — ${c.category}</span>
      </div>`).join('');
        clientResults.querySelectorAll('[data-client-id]').forEach(el => {
            el.onclick = () => {
                const client = getCollection('clients').find(c => c.id === el.dataset.clientId);
                selectClient(client);
                clientResults.style.display = 'none';
                clientInput.value = '';
            };
        });
    });

    clientInput.addEventListener('blur', () => setTimeout(() => { clientResults.style.display = 'none'; }, 200));

    document.getElementById('btnProcessSale').onclick = () => processSale();
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
      <div class="product-emoji">${p.emoji}</div>
      <div class="product-name">${escapeHTML(p.name)}</div>
      <div class="product-price">${formatCurrency(p.price)}</div>
      ${p.stock <= 5 ? `<div style="font-size:.7rem;color:var(--warning);margin-top:.25rem">Stock: ${p.stock}</div>` : ''}
    </div>`).join('');

    grid.querySelectorAll('.product-card:not(.out-of-stock)').forEach(card => {
        card.onclick = () => addToCart(card.dataset.prodId);
    });
}

function addToCart(productId) {
    const products = getCollection('products');
    const product = products.find(p => p.id === productId);
    if (!product || product.stock <= 0) return;

    const existing = cart.find(c => c.productId === productId);
    if (existing) {
        if (existing.quantity >= product.stock) return showToast('Stock insuficiente', 'error');
        existing.quantity++;
    } else {
        cart.push({ productId, name: product.name, price: product.price, quantity: 1, emoji: product.emoji });
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
      <span style="font-size:1.3rem">${item.emoji}</span>
      <div class="cart-item-info">
        <div class="cart-item-name">${escapeHTML(item.name)}</div>
        <div class="cart-item-price">${formatCurrency(item.price)}</div>
      </div>
      <div class="cart-item-qty">
        <button data-qty-minus="${i}">−</button>
        <span>${item.quantity}</span>
        <button data-qty-plus="${i}">+</button>
      </div>
      <div style="font-weight:700;font-size:.85rem;min-width:80px;text-align:right">${formatCurrency(item.price * item.quantity)}</div>
    </div>`).join('');

    const subtotal = cart.reduce((s, it) => s + it.price * it.quantity, 0);
    summaryEl.innerHTML = `
    <div class="cart-summary-row"><span>Subtotal</span><span>${formatCurrency(subtotal)}</span></div>
    <div class="cart-summary-row total"><span>TOTAL</span><span>${formatCurrency(subtotal)}</span></div>`;

    btnProcess.disabled = !selectedClient;

    itemsEl.querySelectorAll('[data-qty-minus]').forEach(btn => {
        btn.onclick = () => {
            const idx = parseInt(btn.dataset.qtyMinus);
            cart[idx].quantity--;
            if (cart[idx].quantity <= 0) cart.splice(idx, 1);
            updateCartUI();
        };
    });

    itemsEl.querySelectorAll('[data-qty-plus]').forEach(btn => {
        btn.onclick = () => {
            const idx = parseInt(btn.dataset.qtyPlus);
            const prod = getCollection('products').find(p => p.id === cart[idx].productId);
            if (prod && cart[idx].quantity >= prod.stock) return showToast('Stock insuficiente', 'error');
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
        <tbody>${cart.map(it => `<tr><td>${it.emoji} ${escapeHTML(it.name)}</td><td>${it.quantity}</td><td>${formatCurrency(it.price * it.quantity)}</td></tr>`).join('')}</tbody>
      </table>
    </div>
    <div style="text-align:right;font-size:1.3rem;font-weight:800;color:var(--primary-light);margin-bottom:1rem">TOTAL: ${formatCurrency(total)}</div>
    <div class="form-group">
      <label>Método de Pago</label>
      <select class="form-control" id="mPayMethod">${PAYMENT_METHODS.map(m => `<option value="${m.id}">${m.name}</option>`).join('')}</select>
    </div>`;
    const footer = `<button class="btn btn-secondary modal-close">Cancelar</button><button class="btn btn-success" id="btnConfirmSale"><i data-lucide="check"></i>Confirmar Venta</button>`;
    const overlay = createModal('Confirmar Venta', body, footer);

    document.getElementById('btnConfirmSale').onclick = () => {
        const paymentMethod = document.getElementById('mPayMethod').value;
        const user = getCurrentUser();
        const sale = {
            id: generateId(),
            clientId: selectedClient.id,
            clientName: selectedClient.name,
            clientCategory: selectedClient.category,
            items: cart.map(it => ({ productId: it.productId, name: it.name, price: it.price, quantity: it.quantity })),
            total,
            paymentMethod,
            date: new Date().toISOString(),
            userId: user?.id || ''
        };

        // Decrease stock
        cart.forEach(it => {
            const prod = getCollection('products').find(p => p.id === it.productId);
            if (prod) updateItem('products', prod.id, { stock: prod.stock - it.quantity });
        });

        addItem('sales', sale);
        closeModal(overlay);
        showTicket(sale);
        showToast('¡Venta registrada con éxito!');
        cart = [];
        selectedClient = null;
        renderSales();
    };
}

function showTicket(sale) {
    const payLabels = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', nomina: 'Desc. Nómina' };
    const body = `
    <div class="ticket-preview">
      <h4>🍽️ ComePOS</h4>
      <p style="text-align:center;font-size:.7rem;color:#666">Comedor Empresarial</p>
      <div class="ticket-divider"></div>
      <div class="ticket-line"><span>Fecha:</span><span>${formatDateTime(sale.date)}</span></div>
      <div class="ticket-line"><span>Cliente:</span><span>${sale.clientName}</span></div>
      <div class="ticket-line"><span>Pago:</span><span>${payLabels[sale.paymentMethod]}</span></div>
      <div class="ticket-divider"></div>
      ${sale.items.map(it => `<div class="ticket-line"><span>${it.name} x${it.quantity}</span><span>${formatCurrency(it.price * it.quantity)}</span></div>`).join('')}
      <div class="ticket-divider"></div>
      <div class="ticket-line ticket-total"><span>TOTAL</span><span>${formatCurrency(sale.total)}</span></div>
      <div class="ticket-footer">¡Gracias por su compra!<br/>Ticket #${sale.id.slice(-6).toUpperCase()}</div>
    </div>`;
    createModal('Ticket de Venta', body, '<button class="btn btn-primary modal-close">Cerrar</button>');
}
