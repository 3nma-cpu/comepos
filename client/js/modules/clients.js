// ============================================
// Clients Module
// ============================================

import { api } from '../api.js';
import { generateId, showToast, createModal, closeModal, escapeHTML, formatCurrency, formatDateTime, EMPLOYEE_CATEGORIES, CATEGORY_BADGE_COLORS } from '../utils.js';
import { showTicket, promptCancellationReason } from './sales.js';

export async function renderClients() {
    const container = document.getElementById('module-content');
    try {
        const clients = await api.get('/clients');

        container.innerHTML = `
        <div class="fade-in">
          <div class="filters-bar">
            <div class="search-bar">
              <i data-lucide="search"></i>
              <input type="text" class="form-control" id="searchClients" placeholder="Buscar por nombre o cédula..." />
            </div>
            <select class="form-control" id="filterCategory" style="width:auto;min-width:160px">
              <option value="">Todas las categorías</option>
              ${EMPLOYEE_CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('')}
            </select>
            <button class="btn btn-primary" id="btnAddClient"><i data-lucide="plus"></i>Nuevo Cliente</button>
          </div>
          <div class="table-container">
            <table>
              <thead><tr><th>Nombre</th><th>Cédula</th><th>Departamento</th><th>Cargo</th><th>Categoría</th><th>Acciones</th></tr></thead>
              <tbody id="clientsTableBody"></tbody>
            </table>
          </div>
        </div>`;

        if (window.lucide) lucide.createIcons();

        function applyFilters() {
            const q = document.getElementById('searchClients').value.toLowerCase();
            const cat = document.getElementById('filterCategory').value;
            const filtered = clients.filter(c => {
                const matchQ = !q || c.name.toLowerCase().includes(q) || c.cedula.includes(q);
                const matchCat = !cat || c.category === cat;
                return matchQ && matchCat;
            });
            renderTable(filtered, clients);
        }

        renderTable(clients, clients);
        document.getElementById('searchClients').addEventListener('input', applyFilters);
        document.getElementById('filterCategory').addEventListener('change', applyFilters);
        document.getElementById('btnAddClient').addEventListener('click', () => openClientModal(null, clients));
    } catch (err) {
        container.innerHTML = `<div class="empty-state"><p>Error al cargar clientes: ${err.message}</p></div>`;
    }
}

function renderTable(clients, allClients) {
    const tbody = document.getElementById('clientsTableBody');
    if (!tbody) return;
    tbody.innerHTML = clients.map(c => `
    <tr>
      <td><strong>${escapeHTML(c.name)}</strong></td>
      <td>${escapeHTML(c.cedula)}</td>
      <td style="color:var(--text-secondary)">${escapeHTML(c.department || '')}</td>
      <td style="color:var(--text-secondary)">${escapeHTML(c.position || '')}</td>
      <td><span class="badge ${CATEGORY_BADGE_COLORS[c.category] || 'badge-primary'}">${c.category}</span></td>
      <td>
        <button class="btn btn-ghost btn-sm btn-icon" data-history="${c.id}" title="Historial"><i data-lucide="history"></i></button>
        <button class="btn btn-ghost btn-sm btn-icon" data-edit="${c.id}" title="Editar"><i data-lucide="pencil"></i></button>
        <button class="btn btn-ghost btn-sm btn-icon" data-delete="${c.id}" title="Eliminar"><i data-lucide="trash-2"></i></button>
      </td>
    </tr>`).join('');
    if (window.lucide) lucide.createIcons();

    tbody.querySelectorAll('[data-edit]').forEach(btn => {
        btn.onclick = () => {
            const client = allClients.find(c => c.id === btn.dataset.edit);
            if (client) openClientModal(client, allClients);
        };
    });

    tbody.querySelectorAll('[data-delete]').forEach(btn => {
        btn.onclick = async () => {
            if (confirm('¿Eliminar este cliente?')) {
                try {
                    await api.delete(`/clients/${btn.dataset.delete}`);
                    showToast('Cliente eliminado');
                    renderClients();
                } catch (e) {
                    showToast(e.message, 'error');
                }
            }
        };
    });

    tbody.querySelectorAll('[data-history]').forEach(btn => {
        btn.onclick = () => showClientHistory(btn.dataset.history, allClients);
    });
}

function openClientModal(client, allClients) {
    const isEdit = !!client;
    const c = client || {};
    
    // Get unique departments and positions for suggestions
    const depts = [...new Set(allClients.map(cl => cl.department).filter(Boolean))].sort();
    const positions = [...new Set(allClients.map(cl => cl.position).filter(Boolean))].sort();

    const body = `
    <div class="form-row">
      <div class="form-group"><label>Nombre Completo</label><input type="text" class="form-control" id="mCliName" value="${isEdit ? escapeHTML(c.name) : ''}" required /></div>
      <div class="form-group"><label>Cédula de Identidad</label><input type="text" class="form-control" id="mCliCedula" value="${isEdit ? escapeHTML(c.cedula) : ''}" required /></div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Departamento</label>
        <input type="text" class="form-control" id="mCliDept" value="${isEdit ? escapeHTML(c.department || '') : ''}" list="dlDepts" />
        <datalist id="dlDepts">
          ${depts.map(d => `<option value="${escapeHTML(d)}">`).join('')}
        </datalist>
      </div>
      <div class="form-group">
        <label>Cargo</label>
        <input type="text" class="form-control" id="mCliPosition" value="${isEdit ? escapeHTML(c.position || '') : ''}" list="dlPositions" />
        <datalist id="dlPositions">
          ${positions.map(p => `<option value="${escapeHTML(p)}">`).join('')}
        </datalist>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Categoría de Funcionario</label>
        <select class="form-control" id="mCliCategory">
          ${EMPLOYEE_CATEGORIES.map(cat => `<option value="${cat}" ${isEdit && c.category === cat ? 'selected' : ''}>${cat}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label>Email</label><input type="email" class="form-control" id="mCliEmail" value="${isEdit ? escapeHTML(c.email || '') : ''}" /></div>
    </div>
    <div class="form-group"><label>Teléfono</label><input type="text" class="form-control" id="mCliPhone" value="${isEdit ? escapeHTML(c.phone || '') : ''}" /></div>`;
    const footer = `<button class="btn btn-secondary modal-close">Cancelar</button><button class="btn btn-primary" id="btnSaveClient">${isEdit ? 'Guardar' : 'Crear'}</button>`;
    const overlay = createModal(isEdit ? 'Editar Cliente' : 'Nuevo Cliente', body, footer);

    const btnSave = document.getElementById('btnSaveClient');
    btnSave.onclick = async () => {
        const data = {
            name: document.getElementById('mCliName').value.trim(),
            cedula: document.getElementById('mCliCedula').value.trim(),
            department: document.getElementById('mCliDept').value.trim(),
            position: document.getElementById('mCliPosition').value.trim(),
            category: document.getElementById('mCliCategory').value,
            email: document.getElementById('mCliEmail').value.trim(),
            phone: document.getElementById('mCliPhone').value.trim()
        };
        if (!data.name || !data.cedula) return showToast('Nombre y cédula son obligatorios', 'error');

        btnSave.disabled = true;
        btnSave.innerHTML = '<i data-lucide="loader"></i> Guardando...';
        if (window.lucide) lucide.createIcons();

        try {
            if (isEdit) {
                await api.put(`/clients/${client.id}`, data);
                showToast('Cliente actualizado');
            } else {
                await api.post('/clients', data);
                showToast('Cliente registrado');
            }
            closeModal(overlay);
            renderClients();
        } catch (err) {
            showToast(err.message, 'error');
            btnSave.disabled = false;
            btnSave.innerHTML = isEdit ? 'Guardar' : 'Crear';
            if (window.lucide) lucide.createIcons();
        }
    };
}

async function showClientHistory(clientId, allClients) {
    const client = allClients.find(c => c.id === clientId);
    try {
        const data = await api.get(`/clients/${clientId}/history`);
        let sales = data.sales;

        function renderHistoryContent() {
          return `
          <div style="margin-bottom:1rem;display:flex;gap:1rem">
            <div class="card" style="flex:1;padding:1rem"><div class="kpi-label">Total Compras Activas</div><div style="font-size:1.2rem;font-weight:700" id="chCount">${data.totalSales}</div></div>
            <div class="card" style="flex:1;padding:1rem"><div class="kpi-label">Total Gastado</div><div style="font-size:1.2rem;font-weight:700;color:var(--primary-light)" id="chSpent">${formatCurrency(data.totalSpent)}</div></div>
          </div>
          <div id="chTableContainer">
          ${sales.length > 0 ? `
          <div class="table-container" style="max-height:300px;overflow-y:auto">
            <table>
              <thead><tr><th>Fecha</th><th>Productos</th><th>Total</th><th>Pago</th><th style="text-align:center">Acción</th></tr></thead>
              <tbody>${sales.map(s => {
                const isCancelled = s.status === 'CANCELLED';
                return `
                <tr id="ch-row-${s.id}" style="${isCancelled ? 'opacity:0.75;background:rgba(239,68,68,0.04)' : ''}">
                  <td style="font-size:.8rem">${formatDateTime(s.date)}</td>
                  <td style="font-size:.8rem">${s.items.map(i => escapeHTML(i.name)).join(', ')}</td>
                  <td>
                    ${isCancelled 
                      ? `<span style="text-decoration:line-through;color:var(--text-secondary)">${formatCurrency(s.total)}</span> <span class="badge badge-danger" style="margin-left:4px" title="Motivo: ${escapeHTML(s.cancellationReason || 'Anulada')}">ANULADA</span>`
                      : `<strong>${formatCurrency(s.total)}</strong>`
                    }
                  </td>
                  <td><span class="badge badge-${s.paymentMethod === 'efectivo' ? 'success' : s.paymentMethod === 'transferencia' ? 'info' : 'purple'}">${s.paymentMethod}</span></td>
                  <td style="text-align:center;white-space:nowrap">
                    <button class="btn btn-sm btn-ghost btn-reprint-client" data-sale-id="${s.id}" title="Ver ticket / Imprimir"><i data-lucide="printer" style="width:14px;height:14px"></i></button>
                    ${!isCancelled ? `<button class="btn btn-sm btn-ghost btn-edit-client-sale" data-sale-id="${s.id}" title="Editar vale"><i data-lucide="pencil" style="width:14px;height:14px"></i></button>` : ''}
                    ${!isCancelled ? `<button class="btn btn-sm btn-ghost text-danger btn-del-client-sale" data-sale-id="${s.id}" title="Anular venta y devolver stock"><i data-lucide="ban" style="width:14px;height:14px"></i></button>` : ''}
                  </td>
                </tr>`;
              }).join('')}</tbody>
            </table>
          </div>` : '<div class="empty-state"><p>Sin compras registradas</p></div>'}
          </div>`;
        }

        const modal = createModal(`Historial — ${client?.name || ''}`, `<div id="clientHistoryBody">${renderHistoryContent()}</div>`);

        function bindEvents() {
          if (window.lucide) lucide.createIcons();

          modal.querySelectorAll('.btn-reprint-client').forEach(btn => {
            btn.onclick = () => {
              const saleId = btn.dataset.saleId;
              const sale = sales.find(s => s.id === saleId);
              if (sale) {
                showTicket({ ...sale, clientName: client?.name }, (deletedId, reason) => handleDeleted(deletedId, reason));
              }
            };
          });

          modal.querySelectorAll('.btn-edit-client-sale').forEach(btn => {
            btn.onclick = () => {
              const saleId = btn.dataset.saleId;
              const sale = sales.find(s => s.id === saleId);
              if (!sale) return;
              openEditValeModal(sale, client, (updatedSale) => {
                sale.items = updatedSale.items;
                sale.total = updatedSale.total;
                const completed = sales.filter(x => x.status === 'COMPLETED');
                data.totalSpent = completed.reduce((acc, x) => acc + x.total, 0);
                data.totalSales = completed.length;
                const bodyEl = modal.querySelector('#clientHistoryBody');
                if (bodyEl) {
                  bodyEl.innerHTML = renderHistoryContent();
                  bindEvents();
                }
              });
            };
          });

          modal.querySelectorAll('.btn-del-client-sale').forEach(btn => {
            btn.onclick = () => {
              const saleId = btn.dataset.saleId;
              const sale = sales.find(s => s.id === saleId);
              if (!sale) return;
              promptCancellationReason(sale.total, async (reason) => {
                try {
                  await api.delete(`/sales/${saleId}`, { reason });
                  showToast('Venta anulada y stock devuelto', 'success');
                  handleDeleted(saleId, reason);
                } catch (err) {
                  showToast('Error al anular venta: ' + err.message, 'error');
                  throw err;
                }
              });
            };
          });
        }

        function handleDeleted(saleId, reason) {
          const s = sales.find(x => x.id === saleId);
          if (s && s.status !== 'CANCELLED') {
            data.totalSpent -= s.total;
            data.totalSales -= 1;
            s.status = 'CANCELLED';
            s.cancellationReason = reason;
            s.cancelledAt = new Date().toISOString();
          }
          const bodyEl = modal.querySelector('#clientHistoryBody');
          if (bodyEl) {
            bodyEl.innerHTML = renderHistoryContent();
            bindEvents();
          }
        }

        bindEvents();
    } catch (err) {
        showToast('Error al cargar historial', 'error');
    }
}

export async function openEditValeModal(sale, client, onSaleUpdated) {
    try {
        const [fullSale, allFetchedProducts] = await Promise.all([
            api.get(`/sales/${sale.id}`),
            api.get('/products')
        ]);

        const resaleProducts = allFetchedProducts.filter(p => p.forResale !== false && p.active !== false);
        const productMap = new Map(allFetchedProducts.map(p => [p.id, p]));

        // Deep clone items so we don't mutate the original until saved
        let currentItems = (fullSale.items || []).map(i => ({
            productId: i.productId,
            name: i.name || productMap.get(i.productId)?.name || 'Producto',
            price: Number(i.price) || 0,
            quantity: Number(i.quantity) || 1,
            unit: i.unit || productMap.get(i.productId)?.unit || 'UNI'
        }));

        // Keep snapshot of original items in this sale for net stock checking
        const originalQuantities = {};
        for (const item of (fullSale.items || [])) {
            originalQuantities[item.productId] = (originalQuantities[item.productId] || 0) + Number(item.quantity);
        }

        const clientName = client?.name || fullSale.clientName || 'Cliente';
        const clientCedula = client?.cedula || fullSale.clientCedula || '';
        const ticketNum = (fullSale.id || '').slice(-6).toUpperCase();

        function renderEditModalBody() {
            const currentTotal = Math.round(currentItems.reduce((sum, it) => sum + (it.price * it.quantity), 0));
            const diff = currentTotal - fullSale.total;

            return `
            <div style="font-size:.9rem">
              <!-- Client Info Banner (Read-only) -->
              <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:.85rem 1rem;margin-bottom:1.25rem;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.75rem">
                <div>
                  <div style="display:flex;align-items:center;gap:.35rem;font-size:.72rem;color:var(--text-muted);font-weight:700;text-transform:uppercase;letter-spacing:.5px">
                    <i data-lucide="lock" style="width:12px;height:12px"></i> Cliente (No modificable)
                  </div>
                  <div style="font-weight:700;font-size:1rem;color:var(--text);margin-top:2px">
                    ${escapeHTML(clientName)}
                    ${clientCedula ? `<span style="font-size:.8rem;color:var(--text-secondary);font-weight:normal;margin-left:6px">CI: ${escapeHTML(clientCedula)}</span>` : ''}
                  </div>
                </div>
                <div style="display:flex;gap:.5rem;align-items:center">
                  <span class="badge badge-purple" style="font-size:.75rem;padding:4px 8px">
                    <i data-lucide="receipt" style="width:12px;height:12px;margin-right:3px"></i>${fullSale.paymentMethod === 'nomina' ? 'VALE DE COMEDOR' : fullSale.paymentMethod.toUpperCase()}
                  </span>
                  <span style="font-size:.75rem;color:var(--text-muted)">${formatDateTime(fullSale.date)}</span>
                </div>
              </div>

              <!-- Product Search & Add Section -->
              <div style="margin-bottom:1.25rem;position:relative">
                <label style="font-size:.82rem;font-weight:600;margin-bottom:.4rem;display:flex;align-items:center;gap:.35rem;color:var(--text)">
                  <i data-lucide="plus-circle" style="width:14px;height:14px;color:var(--primary-light)"></i> Agregar Producto al Vale
                </label>
                <div style="position:relative">
                  <div class="search-bar" style="width:100%">
                    <i data-lucide="search"></i>
                    <input type="text" class="form-control" id="evProdSearch" placeholder="Escribe el nombre o código del producto a agregar..." autocomplete="off" />
                  </div>
                  <div id="evProdDropdown" class="pos-client-dropdown" style="display:none;position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:150"></div>
                </div>
              </div>

              <!-- Items Table -->
              <div style="border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;margin-bottom:1rem;background:var(--bg-card)">
                <table style="width:100%;border-collapse:collapse;margin:0">
                  <thead>
                    <tr style="background:rgba(255,255,255,0.03);border-bottom:1px solid var(--border)">
                      <th style="padding:8px 12px;font-size:.75rem;text-align:left;color:var(--text-secondary)">Producto</th>
                      <th style="padding:8px 12px;font-size:.75rem;text-align:right;color:var(--text-secondary)">Precio Unit.</th>
                      <th style="padding:8px 12px;font-size:.75rem;text-align:center;width:140px;color:var(--text-secondary)">Cantidad</th>
                      <th style="padding:8px 12px;font-size:.75rem;text-align:right;color:var(--text-secondary)">Subtotal</th>
                      <th style="padding:8px 12px;font-size:.75rem;text-align:center;width:48px"></th>
                    </tr>
                  </thead>
                  <tbody id="evItemsTbody">
                    ${currentItems.length === 0 ? `
                      <tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--text-muted)">El vale no tiene productos. Agregue al menos uno.</td></tr>
                    ` : currentItems.map((item, idx) => {
                      const unit = item.unit || 'UNI';
                      const step = unit === 'UNI' ? '1' : '0.1';
                      const origQty = originalQuantities[item.productId] || 0;
                      const pData = productMap.get(item.productId);
                      const currentStock = pData ? pData.stock : 0;
                      const maxStock = currentStock + origQty;

                      return `
                      <tr style="border-bottom:1px solid var(--border)">
                        <td style="padding:8px 12px">
                          <div style="font-weight:600;font-size:.85rem;color:var(--text)">${escapeHTML(item.name)} <span style="font-size:.7rem;color:var(--text-muted)">(${unit})</span></div>
                          <div style="font-size:.72rem;color:var(--text-muted)">
                            Stock actual: <strong>${currentStock}</strong>${origQty > 0 ? ` (+${origQty} en este vale)` : ''}
                          </div>
                        </td>
                        <td style="padding:8px 12px;text-align:right;font-size:.85rem;white-space:nowrap;color:var(--text-secondary)">
                          ${formatCurrency(item.price)}
                        </td>
                        <td style="padding:8px 12px;text-align:center">
                          <div style="display:inline-flex;align-items:center;gap:3px">
                            <button type="button" class="btn btn-ghost btn-sm" style="width:26px;height:26px;padding:0;display:flex;align-items:center;justify-content:center;border-radius:4px" data-ev-minus="${idx}">−</button>
                            <input type="number" value="${item.quantity}" min="${step}" max="${maxStock}" step="${step}"
                              style="width:55px;text-align:center;border:1px solid var(--border);border-radius:4px;background:var(--bg-input);color:var(--text);padding:3px 2px;font-size:.82rem"
                              data-ev-qty="${idx}" />
                            <button type="button" class="btn btn-ghost btn-sm" style="width:26px;height:26px;padding:0;display:flex;align-items:center;justify-content:center;border-radius:4px" data-ev-plus="${idx}">+</button>
                          </div>
                        </td>
                        <td style="padding:8px 12px;text-align:right;font-weight:700;font-size:.85rem;white-space:nowrap;color:var(--text)">
                          ${formatCurrency(item.price * item.quantity)}
                        </td>
                        <td style="padding:8px 8px;text-align:center">
                          <button type="button" class="btn btn-ghost btn-sm text-danger btn-icon" style="width:28px;height:28px" data-ev-del="${idx}" title="Eliminar del vale y devolver stock">
                            <i data-lucide="trash-2" style="width:14px;height:14px"></i>
                          </button>
                        </td>
                      </tr>`;
                    }).join('')}
                  </tbody>
                </table>
              </div>

              <!-- Summary Banner -->
              <div style="display:flex;justify-content:space-between;align-items:center;padding:.85rem 1.1rem;background:rgba(255,255,255,0.02);border:1px solid var(--border);border-radius:var(--radius);margin-top:.75rem">
                <div>
                  <div style="font-size:.75rem;color:var(--text-secondary)">Total Original: <span style="text-decoration:line-through;color:var(--text-muted)">${formatCurrency(fullSale.total)}</span></div>
                  ${diff !== 0 ? `
                    <div style="font-size:.75rem;margin-top:2px;font-weight:600;color:${diff > 0 ? 'var(--warning)' : 'var(--success)'}">
                      ${diff > 0 ? `+${formatCurrency(diff)} (Aumenta)` : `-${formatCurrency(Math.abs(diff))} (Disminuye)`}
                    </div>` : '<div style="font-size:.72rem;color:var(--text-muted)">Sin cambio en total</div>'}
                </div>
                <div style="text-align:right">
                  <div style="font-size:.75rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.5px;font-weight:600">Nuevo Total</div>
                  <div style="font-size:1.35rem;font-weight:800;color:var(--primary-light)" id="evTotalDisplay">${formatCurrency(currentTotal)}</div>
                </div>
              </div>
            </div>`;
        }

        const footerHTML = `
          <button class="btn btn-secondary modal-close">Cancelar</button>
          <button class="btn btn-primary" id="btnSaveValeEdit" ${currentItems.length === 0 ? 'disabled' : ''}>
            <i data-lucide="check"></i> Guardar Cambios
          </button>`;

        const modal = createModal(`Editar Vale — Ticket #${ticketNum}`, `<div id="editValeContainer">${renderEditModalBody()}</div>`, footerHTML);
        modal.style.zIndex = '1100'; // Make sure it sits above the history modal

        function bindEditEvents() {
            if (window.lucide) lucide.createIcons();

            const container = modal.querySelector('#editValeContainer');
            const searchInput = modal.querySelector('#evProdSearch');
            const dropdown = modal.querySelector('#evProdDropdown');
            const btnSave = modal.querySelector('#btnSaveValeEdit');

            function refreshView() {
                container.innerHTML = renderEditModalBody();
                if (btnSave) {
                    btnSave.disabled = currentItems.length === 0;
                }
                bindEditEvents();
            }

            // Product search logic
            if (searchInput && dropdown) {
                searchInput.addEventListener('input', () => {
                    const q = searchInput.value.trim().toLowerCase();
                    if (!q) {
                        dropdown.style.display = 'none';
                        return;
                    }
                    const matches = resaleProducts.filter(p =>
                        p.name.toLowerCase().includes(q) ||
                        (p.barcode && p.barcode.toLowerCase().includes(q))
                    ).slice(0, 8);

                    if (matches.length === 0) {
                        dropdown.innerHTML = `<div style="padding:.65rem;font-size:.82rem;color:var(--text-muted);text-align:center">No se encontraron productos</div>`;
                        dropdown.style.display = 'block';
                        return;
                    }

                    dropdown.innerHTML = matches.map(p => {
                        const origQty = originalQuantities[p.id] || 0;
                        const available = p.stock + origQty;
                        const hasStock = available > 0;
                        return `
                        <div class="pos-client-option" data-add-prod="${p.id}" style="${!hasStock ? 'opacity:0.5;' : ''}display:flex;justify-content:space-between;align-items:center">
                          <div>
                            <strong>${escapeHTML(p.name)}</strong>
                            <div style="font-size:.72rem;color:var(--text-muted)">Precio: ${formatCurrency(p.price)} | Stock: ${p.stock}${origQty > 0 ? ` (+${origQty} en vale)` : ''}</div>
                          </div>
                          <span class="badge badge-${hasStock ? 'success' : 'danger'}" style="font-size:.65rem">${hasStock ? 'Disponible' : 'Sin Stock'}</span>
                        </div>`;
                    }).join('');
                    dropdown.style.display = 'block';

                    dropdown.querySelectorAll('[data-add-prod]').forEach(opt => {
                        opt.onclick = () => {
                            const pId = opt.dataset.addProd;
                            const prod = productMap.get(pId);
                            if (!prod) return;

                            const origQty = originalQuantities[pId] || 0;
                            const maxAvailable = prod.stock + origQty;
                            const existing = currentItems.find(it => it.productId === pId);

                            if (existing) {
                                const unit = existing.unit || 'UNI';
                                const step = unit === 'UNI' ? 1 : 0.1;
                                const newQty = parseFloat((existing.quantity + step).toFixed(3));
                                if (newQty > maxAvailable) {
                                    showToast(`Stock insuficiente para ${prod.name} (Disponible: ${maxAvailable})`, 'error');
                                    return;
                                }
                                existing.quantity = newQty;
                            } else {
                                if (maxAvailable < 1 && (prod.unit === 'UNI' || prod.stock <= 0)) {
                                    showToast(`Stock insuficiente para ${prod.name}`, 'error');
                                    return;
                                }
                                currentItems.push({
                                    productId: prod.id,
                                    name: prod.name,
                                    price: prod.price,
                                    quantity: 1,
                                    unit: prod.unit || 'UNI'
                                });
                            }

                            dropdown.style.display = 'none';
                            refreshView();
                        };
                    });
                });

                // Hide dropdown when clicking outside
                document.addEventListener('click', (e) => {
                    if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
                        dropdown.style.display = 'none';
                    }
                }, { once: true });
            }

            // Minus button
            container.querySelectorAll('[data-ev-minus]').forEach(btn => {
                btn.onclick = () => {
                    const idx = parseInt(btn.dataset.evMinus);
                    const item = currentItems[idx];
                    if (!item) return;
                    const unit = item.unit || 'UNI';
                    const step = unit === 'UNI' ? 1 : 0.1;
                    const newQty = parseFloat((item.quantity - step).toFixed(3));
                    if (newQty <= 0) {
                        currentItems.splice(idx, 1);
                    } else {
                        item.quantity = newQty;
                    }
                    refreshView();
                };
            });

            // Plus button
            container.querySelectorAll('[data-ev-plus]').forEach(btn => {
                btn.onclick = () => {
                    const idx = parseInt(btn.dataset.evPlus);
                    const item = currentItems[idx];
                    if (!item) return;
                    const origQty = originalQuantities[item.productId] || 0;
                    const pData = productMap.get(item.productId);
                    const maxStock = (pData ? pData.stock : 0) + origQty;
                    const unit = item.unit || 'UNI';
                    const step = unit === 'UNI' ? 1 : 0.1;
                    const newQty = parseFloat((item.quantity + step).toFixed(3));
                    if (newQty > maxStock) {
                        showToast(`Stock insuficiente (Máximo disponible: ${maxStock})`, 'error');
                        return;
                    }
                    item.quantity = newQty;
                    refreshView();
                };
            });

            // Direct quantity input
            container.querySelectorAll('[data-ev-qty]').forEach(inp => {
                inp.addEventListener('change', () => {
                    const idx = parseInt(inp.dataset.evQty);
                    const item = currentItems[idx];
                    if (!item) return;
                    const val = parseFloat(inp.value) || 0;
                    const origQty = originalQuantities[item.productId] || 0;
                    const pData = productMap.get(item.productId);
                    const maxStock = (pData ? pData.stock : 0) + origQty;

                    if (val <= 0) {
                        currentItems.splice(idx, 1);
                        refreshView();
                        return;
                    }
                    if (val > maxStock) {
                        showToast(`Stock insuficiente (Máximo disponible: ${maxStock})`, 'error');
                        inp.value = item.quantity;
                        return;
                    }
                    item.quantity = val;
                    refreshView();
                });
            });

            // Delete item button (trash)
            container.querySelectorAll('[data-ev-del]').forEach(btn => {
                btn.onclick = () => {
                    const idx = parseInt(btn.dataset.evDel);
                    currentItems.splice(idx, 1);
                    refreshView();
                };
            });

            // Save button
            if (btnSave) {
                btnSave.onclick = async () => {
                    if (currentItems.length === 0) {
                        return showToast('El vale debe tener al menos un producto', 'error');
                    }

                    btnSave.disabled = true;
                    btnSave.innerHTML = '<i data-lucide="loader"></i> Guardando...';
                    if (window.lucide) lucide.createIcons();

                    try {
                        const payload = {
                            items: currentItems.map(it => ({
                                productId: it.productId,
                                quantity: it.quantity,
                                unitPrice: it.price
                            }))
                        };
                        const updated = await api.put(`/sales/${sale.id}`, payload);
                        showToast('Vale actualizado y stock ajustado correctamente', 'success');
                        closeModal(modal);
                        if (typeof onSaleUpdated === 'function') {
                            onSaleUpdated(updated);
                        }
                    } catch (err) {
                        showToast('Error al actualizar vale: ' + err.message, 'error');
                        btnSave.disabled = false;
                        btnSave.innerHTML = '<i data-lucide="check"></i> Guardar Cambios';
                        if (window.lucide) lucide.createIcons();
                    }
                };
            }
        }

        bindEditEvents();
    } catch (err) {
        showToast('Error al cargar datos para edición: ' + err.message, 'error');
    }
}

