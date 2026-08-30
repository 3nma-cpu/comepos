// ============================================
// Cash Register Module (Caja Chica)
// ============================================

import { api } from '../api.js';
import { showToast, createModal, closeModal, formatCurrency, formatDateTime, escapeHTML, exportExcel } from '../utils.js';

// Denomination values for cash counting (Guaraníes)
const DENOMINATIONS = [
    { value: 100000, label: '100.000' },
    { value: 50000, label: '50.000' },
    { value: 20000, label: '20.000' },
    { value: 10000, label: '10.000' },
    { value: 5000, label: '5.000' },
    { value: 2000, label: '2.000' },
    { value: 1000, label: '1.000' },
    { value: 500, label: '500' },
    { value: 100, label: '100' },
    { value: 50, label: '50' }
];

export async function renderCashRegister() {
    const container = document.getElementById('module-content');
    container.innerHTML = '<div class="fade-in"><div class="empty-state"><p>Cargando caja...</p></div></div>';

    try {
        const [activeData, allRegisters] = await Promise.all([
            api.get('/cashregister/active'),
            api.get('/cashregister')
        ]);

        const myRegister = activeData.mine;
        const otherOpen = activeData.registers.filter(r => r.openedById !== (myRegister?.openedById || ''));

        container.innerHTML = `
        <div class="fade-in">
            <!-- Status Banner -->
            <div id="cashRegisterStatus" class="cash-register-status ${myRegister ? 'open' : 'closed'}">
                <div class="cash-status-info">
                    <div class="cash-status-icon">
                        <i data-lucide="${myRegister ? 'lock-open' : 'lock'}"></i>
                    </div>
                    <div>
                        <div class="cash-status-title">${myRegister ? 'Caja Abierta' : 'Sin Caja Abierta'}</div>
                        <div class="cash-status-detail">${myRegister
                ? `Abierta el ${formatDateTime(myRegister.openedAt)} — Monto inicial: ${formatCurrency(myRegister.initialAmount)} — ${myRegister.salesCount} venta(s)`
                : 'Debe abrir una caja para poder vender'}</div>
                    </div>
                </div>
                <button class="btn ${myRegister ? 'btn-danger' : 'btn-primary'}" id="btnCashAction">
                    <i data-lucide="${myRegister ? 'lock' : 'lock-open'}"></i>
                    ${myRegister ? 'Cerrar Caja' : 'Abrir Caja'}
                </button>
            </div>

            ${myRegister ? await renderLiveDashboard(myRegister) : ''}

            <!-- Other open registers -->
            ${otherOpen.length > 0 ? `
            <div class="card" style="margin-bottom:1.5rem;padding:1rem">
                <h4 style="margin-bottom:.75rem;font-size:.9rem;color:var(--text-secondary)">
                    <i data-lucide="users" style="width:16px;height:16px;vertical-align:middle;margin-right:.25rem"></i>
                    Otras Cajas Abiertas (${otherOpen.length})
                </h4>
                <div style="display:flex;flex-wrap:wrap;gap:.5rem">
                    ${otherOpen.map(r => `
                    <div style="display:flex;align-items:center;gap:.5rem;padding:.4rem .75rem;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius);font-size:.82rem">
                        <span class="badge badge-success" style="font-size:.65rem">ABIERTA</span>
                        <strong>${escapeHTML(r.openedByName)}</strong>
                        <span style="color:var(--text-muted)">${formatDateTime(r.openedAt)}</span>
                        <span style="color:var(--text-muted)">${r.salesCount} venta(s)</span>
                    </div>`).join('')}
                </div>
            </div>` : ''}

            <!-- History -->
            <div class="card" style="padding:1rem">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem">
                    <h4 style="font-size:.95rem;font-weight:700">Historial de Cajas</h4>
                    <div style="display:flex;gap:.5rem;align-items:center">
                        <select class="form-control" id="filterCashStatus" style="width:auto;min-width:130px;font-size:.82rem">
                            <option value="">Todas</option>
                            <option value="OPEN">Abiertas</option>
                            <option value="CLOSED">Cerradas</option>
                        </select>
                    </div>
                </div>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Apertura</th>
                                <th>Cierre</th>
                                <th>Cajero</th>
                                <th>Ventas</th>
                                <th>Total</th>
                                <th>Estado</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody id="cashHistoryBody"></tbody>
                    </table>
                </div>
            </div>
        </div>`;

        if (window.lucide) lucide.createIcons();
        renderHistoryTable(allRegisters);

        // Filter handler
        document.getElementById('filterCashStatus').addEventListener('change', async (e) => {
            try {
                const status = e.target.value;
                const filtered = status
                    ? allRegisters.filter(r => r.status === status)
                    : allRegisters;
                renderHistoryTable(filtered);
            } catch (err) {
                showToast('Error al filtrar', 'error');
            }
        });

        // Main action button
        document.getElementById('btnCashAction').addEventListener('click', () => {
            if (myRegister) {
                openCloseModal(myRegister.id);
            } else {
                openOpenModal();
            }
        });

    } catch (err) {
        container.innerHTML = `<div class="empty-state"><p>Error al cargar caja: ${err.message}</p></div>`;
    }
}

async function renderLiveDashboard(register) {
    try {
        const detail = await api.get(`/cashregister/${register.id}`);
        const expectedCash = detail.initialAmount + detail.totalEfectivo;

        return `
        <div class="kpi-grid" style="margin-bottom:1.5rem">
            <div class="card kpi-card">
                <div class="kpi-label">Monto Inicial</div>
                <div class="kpi-value">${formatCurrency(detail.initialAmount)}</div>
            </div>
            <div class="card kpi-card">
                <div class="kpi-label">Efectivo</div>
                <div class="kpi-value" style="color:var(--success)">${formatCurrency(detail.totalEfectivo)}</div>
            </div>
            <div class="card kpi-card">
                <div class="kpi-label">Nómina (Vales)</div>
                <div class="kpi-value" style="color:var(--info)">${formatCurrency(detail.totalNomina)}</div>
            </div>
            <div class="card kpi-card">
                <div class="kpi-label">Transferencia</div>
                <div class="kpi-value" style="color:var(--purple, #a78bfa)">${formatCurrency(detail.totalTransferencia)}</div>
            </div>
            <div class="card kpi-card">
                <div class="kpi-label">Total Ventas</div>
                <div class="kpi-value" style="color:var(--primary-light)">${formatCurrency(detail.totalSales)}</div>
            </div>
        </div>

        ${detail.sales.length > 0 ? `
        <div class="card" style="padding:1rem;margin-bottom:1.5rem">
            <h4 style="font-size:.9rem;font-weight:700;margin-bottom:.75rem">Ventas de esta Caja</h4>
            <div class="table-container" style="max-height:300px;overflow-y:auto">
                <table>
                    <thead><tr><th>Hora</th><th>Cliente</th><th>Pago</th><th>Total</th></tr></thead>
                    <tbody>${detail.sales.map(s => `
                        <tr>
                            <td style="font-size:.82rem">${formatDateTime(s.date)}</td>
                            <td><strong>${escapeHTML(s.clientName)}</strong></td>
                            <td><span class="badge badge-${s.paymentMethod === 'efectivo' ? 'success' : s.paymentMethod === 'nomina' ? 'info' : 'purple'}">${s.paymentMethod === 'nomina' ? 'VALE' : s.paymentMethod}</span></td>
                            <td><strong>${formatCurrency(s.total)}</strong></td>
                        </tr>`).join('')}</tbody>
                </table>
            </div>
        </div>` : ''}`;
    } catch {
        return '';
    }
}

function renderHistoryTable(registers) {
    const tbody = document.getElementById('cashHistoryBody');
    if (!tbody) return;

    if (registers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center" style="padding:2rem;color:var(--text-muted)">No hay cajas registradas</td></tr>';
        return;
    }

    tbody.innerHTML = registers.map(r => {
        const diffBadge = r.status === 'CLOSED' && r.finalAmount !== null
            ? (() => {
                const expected = r.initialAmount + r.totalEfectivo;
                const diff = r.finalAmount - expected;
                if (diff === 0) return '<span class="badge badge-success">Cuadra</span>';
                if (diff > 0) return `<span class="badge badge-warning">+${formatCurrency(diff)}</span>`;
                return `<span class="badge badge-danger">${formatCurrency(diff)}</span>`;
            })()
            : '';

        return `
        <tr>
            <td style="font-size:.82rem">${formatDateTime(r.openedAt)}</td>
            <td style="font-size:.82rem">${r.closedAt ? formatDateTime(r.closedAt) : '<span style="color:var(--text-muted)">—</span>'}</td>
            <td><strong>${escapeHTML(r.openedByName)}</strong></td>
            <td>${r.salesCount}</td>
            <td><strong>${formatCurrency(r.totalSales)}</strong> ${diffBadge}</td>
            <td><span class="badge ${r.status === 'OPEN' ? 'badge-success' : 'badge-secondary'}">${r.status === 'OPEN' ? 'Abierta' : 'Cerrada'}</span></td>
            <td>
                <button class="btn btn-ghost btn-sm btn-icon" data-detail="${r.id}" title="Ver detalle"><i data-lucide="eye"></i></button>
                ${r.status === 'CLOSED' ? `
                    <button class="btn btn-ghost btn-sm btn-icon" data-print="${r.id}" title="Imprimir reporte"><i data-lucide="printer"></i></button>
                    <button class="btn btn-ghost btn-sm btn-icon" data-reopen="${r.id}" title="Reabrir caja"><i data-lucide="rotate-ccw"></i></button>
                ` : ''}
            </td>
        </tr>`;
    }).join('');

    if (window.lucide) lucide.createIcons();

    tbody.querySelectorAll('[data-detail]').forEach(btn => {
        btn.onclick = () => showRegisterDetail(btn.dataset.detail);
    });
    tbody.querySelectorAll('[data-print]').forEach(btn => {
        btn.onclick = () => printRegisterReport(btn.dataset.print);
    });
    tbody.querySelectorAll('[data-reopen]').forEach(btn => {
        btn.onclick = () => confirmReopenRegister(btn.dataset.reopen);
    });
}

// ============================================
// Reopen Cash Register Modal
// ============================================
function confirmReopenRegister(registerId, parentOverlay = null) {
    const body = `
    <div style="text-align:center;margin-bottom:1.5rem">
        <div style="width:56px;height:56px;border-radius:50%;background:rgba(245,158,11,.12);display:flex;align-items:center;justify-content:center;margin:0 auto .75rem">
            <i data-lucide="rotate-ccw" style="width:28px;height:28px;color:var(--warning)"></i>
        </div>
        <h3 style="font-size:1.1rem;margin-bottom:.5rem">¿Reabrir esta caja?</h3>
        <p style="color:var(--text-secondary);font-size:.88rem">
            La caja volverá a estar en estado <strong>ABIERTA</strong>. Podrá seguir registrando ventas en ella.
        </p>
    </div>`;

    const footer = `
    <button class="btn btn-secondary modal-close">Cancelar</button>
    <button class="btn btn-warning" id="btnConfirmReopen"><i data-lucide="rotate-ccw"></i> Confirmar Reapertura</button>`;

    const overlay = createModal('Reapertura de Caja', body, footer);
    if (window.lucide) lucide.createIcons();

    document.getElementById('btnConfirmReopen').onclick = async () => {
        const btn = document.getElementById('btnConfirmReopen');
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader"></i> Reabriendo...';
        if (window.lucide) lucide.createIcons();

        try {
            await api.post(`/cashregister/${registerId}/reopen`);
            showToast('¡Caja reabierta correctamente!');
            closeModal(overlay);
            if (parentOverlay) closeModal(parentOverlay);
            renderCashRegister();
        } catch (err) {
            showToast(err.message, 'error');
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="rotate-ccw"></i> Confirmar Reapertura';
            if (window.lucide) lucide.createIcons();
        }
    };
}

// ============================================
// Open Cash Register Modal
// ============================================
function openOpenModal() {
    const body = `
    <div style="text-align:center;margin-bottom:1.5rem">
        <div style="width:56px;height:56px;border-radius:50%;background:rgba(34,197,94,.12);display:flex;align-items:center;justify-content:center;margin:0 auto .75rem">
            <i data-lucide="lock-open" style="width:28px;height:28px;color:var(--success)"></i>
        </div>
        <p style="color:var(--text-secondary);font-size:.9rem">Se abrirá una nueva sesión de caja vinculada a su usuario.</p>
    </div>
    <div class="form-group">
        <label>Monto Inicial en Efectivo (₲)</label>
        <input type="number" class="form-control" id="mInitialAmount" value="0" min="0" step="1000" />
        <small style="color:var(--text-muted);display:block;margin-top:.25rem">Puede ser 0 si no hay fondo de caja.</small>
    </div>`;

    const footer = `
    <button class="btn btn-secondary modal-close">Cancelar</button>
    <button class="btn btn-success" id="btnConfirmOpen"><i data-lucide="lock-open"></i> Abrir Caja</button>`;

    const overlay = createModal('Abrir Caja', body, footer);
    if (window.lucide) lucide.createIcons();

    document.getElementById('btnConfirmOpen').onclick = async () => {
        const btn = document.getElementById('btnConfirmOpen');
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader"></i> Abriendo...';
        if (window.lucide) lucide.createIcons();

        try {
            const initialAmount = parseInt(document.getElementById('mInitialAmount').value) || 0;
            await api.post('/cashregister/open', { initialAmount });
            showToast('¡Caja abierta correctamente!');
            closeModal(overlay);
            renderCashRegister();
        } catch (err) {
            showToast(err.message, 'error');
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="lock-open"></i> Abrir Caja';
            if (window.lucide) lucide.createIcons();
        }
    };
}

// ============================================
// Close Cash Register Modal (with denomination counting)
// ============================================
async function openCloseModal(registerId) {
    let detail;
    try {
        detail = await api.get(`/cashregister/${registerId}`);
    } catch (err) {
        showToast('Error al cargar datos de caja', 'error');
        return;
    }

    const expectedCash = detail.initialAmount + detail.totalEfectivo;

    const body = `
    <div style="margin-bottom:1rem">
        <!-- Summary -->
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:.5rem;margin-bottom:1rem">
            <div style="padding:.6rem;background:var(--bg-input);border-radius:var(--radius);text-align:center">
                <div style="font-size:.7rem;color:var(--text-muted)">Total Ventas</div>
                <div style="font-weight:700;color:var(--primary-light)">${formatCurrency(detail.totalSales)}</div>
            </div>
            <div style="padding:.6rem;background:var(--bg-input);border-radius:var(--radius);text-align:center">
                <div style="font-size:.7rem;color:var(--text-muted)">Efectivo Esperado</div>
                <div style="font-weight:700;color:var(--success)">${formatCurrency(expectedCash)}</div>
            </div>
            <div style="padding:.6rem;background:var(--bg-input);border-radius:var(--radius);text-align:center">
                <div style="font-size:.7rem;color:var(--text-muted)">Operaciones</div>
                <div style="font-weight:700">${detail.salesCount}</div>
            </div>
        </div>

        <!-- Payment breakdown -->
        <div style="display:flex;gap:.5rem;margin-bottom:1rem;flex-wrap:wrap">
            <span class="badge badge-success" style="font-size:.75rem">Efectivo: ${formatCurrency(detail.totalEfectivo)}</span>
            <span class="badge badge-info" style="font-size:.75rem">Nómina: ${formatCurrency(detail.totalNomina)}</span>
            <span class="badge badge-purple" style="font-size:.75rem">Transferencia: ${formatCurrency(detail.totalTransferencia)}</span>
        </div>

        <!-- Cash counting by denomination -->
        <div style="border:1px solid var(--border);border-radius:var(--radius);padding:.75rem;margin-bottom:1rem">
            <label style="font-weight:600;font-size:.85rem;margin-bottom:.5rem;display:block">
                <i data-lucide="banknote" style="width:14px;height:14px;vertical-align:middle;margin-right:.25rem"></i>
                Conteo de Efectivo
            </label>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:.4rem">
                ${DENOMINATIONS.map(d => `
                <div style="display:flex;align-items:center;gap:.4rem;font-size:.82rem">
                    <span style="min-width:65px;font-weight:600;text-align:right">₲ ${d.label}</span>
                    <span style="color:var(--text-muted)">×</span>
                    <input type="number" class="form-control denom-input" data-value="${d.value}" value="" min="0" step="1" placeholder="0"
                        style="width:60px;padding:.25rem .4rem;font-size:.82rem;text-align:center" />
                    <span class="denom-subtotal" data-for="${d.value}" style="color:var(--text-muted);font-size:.75rem;min-width:80px"></span>
                </div>`).join('')}
            </div>
            <div style="margin-top:.75rem;padding-top:.5rem;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
                <span style="font-weight:700;font-size:.9rem">Total Contado:</span>
                <span style="font-weight:800;font-size:1.1rem;color:var(--primary-light)" id="totalCounted">₲ 0</span>
            </div>
            <div id="cashDifference" style="margin-top:.35rem;text-align:right;font-size:.82rem"></div>
        </div>

        <div class="form-group">
            <label>Observaciones (opcional)</label>
            <textarea class="form-control" id="mClosingNotes" rows="2" placeholder="Notas sobre el cierre..."></textarea>
        </div>
    </div>`;

    const footer = `
    <button class="btn btn-secondary modal-close">Cancelar</button>
    <button class="btn btn-danger" id="btnConfirmClose"><i data-lucide="lock"></i> Cerrar Caja</button>`;

    const overlay = createModal('Cerrar Caja', body, footer);
    if (window.lucide) lucide.createIcons();

    // Wire denomination inputs
    function recalcTotal() {
        let total = 0;
        document.querySelectorAll('.denom-input').forEach(input => {
            const qty = parseInt(input.value) || 0;
            const val = parseInt(input.dataset.value);
            const subtotal = qty * val;
            total += subtotal;
            const subEl = document.querySelector(`.denom-subtotal[data-for="${val}"]`);
            if (subEl) subEl.textContent = qty > 0 ? formatCurrency(subtotal) : '';
        });
        document.getElementById('totalCounted').textContent = formatCurrency(total);

        // Show difference
        const diffEl = document.getElementById('cashDifference');
        const diff = total - expectedCash;
        if (diff === 0) {
            diffEl.innerHTML = '<span style="color:var(--success)">✓ Cuadra perfectamente</span>';
        } else if (diff > 0) {
            diffEl.innerHTML = `<span style="color:var(--warning)">⚠ Sobrante: ${formatCurrency(diff)}</span>`;
        } else {
            diffEl.innerHTML = `<span style="color:var(--danger)">⚠ Faltante: ${formatCurrency(diff)}</span>`;
        }

        return total;
    }

    document.querySelectorAll('.denom-input').forEach(input => {
        input.addEventListener('input', recalcTotal);
    });

    // Confirm close
    document.getElementById('btnConfirmClose').onclick = async () => {
        const btn = document.getElementById('btnConfirmClose');
        const finalAmount = recalcTotal();
        const closingNotes = document.getElementById('mClosingNotes').value.trim();

        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader"></i> Cerrando...';
        if (window.lucide) lucide.createIcons();

        try {
            await api.post(`/cashregister/${registerId}/close`, { finalAmount, closingNotes });
            showToast('Caja cerrada correctamente');
            closeModal(overlay);
            renderCashRegister();
        } catch (err) {
            showToast(err.message, 'error');
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="lock"></i> Cerrar Caja';
            if (window.lucide) lucide.createIcons();
        }
    };
}

// ============================================
// Register Detail Modal
// ============================================
async function showRegisterDetail(registerId) {
    try {
        const d = await api.get(`/cashregister/${registerId}`);
        const expectedCash = d.initialAmount + d.totalEfectivo;
        const diff = d.finalAmount !== null ? d.finalAmount - expectedCash : null;

        let diffBadge = '';
        if (diff !== null) {
            if (diff === 0) diffBadge = '<span class="badge badge-success">Cuadra</span>';
            else if (diff > 0) diffBadge = `<span class="badge badge-warning">Sobrante: ${formatCurrency(diff)}</span>`;
            else diffBadge = `<span class="badge badge-danger">Faltante: ${formatCurrency(diff)}</span>`;
        }

        const body = `
        <div style="margin-bottom:1rem">
            <!-- Header info -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:.5rem;margin-bottom:1rem">
                <div style="padding:.6rem;background:var(--bg-input);border-radius:var(--radius)">
                    <div style="font-size:.7rem;color:var(--text-muted)">Apertura</div>
                    <div style="font-weight:600;font-size:.85rem">${formatDateTime(d.openedAt)}</div>
                    <div style="font-size:.78rem;color:var(--text-secondary)">${escapeHTML(d.openedByName)}</div>
                </div>
                <div style="padding:.6rem;background:var(--bg-input);border-radius:var(--radius)">
                    <div style="font-size:.7rem;color:var(--text-muted)">Cierre</div>
                    <div style="font-weight:600;font-size:.85rem">${d.closedAt ? formatDateTime(d.closedAt) : 'Aún abierta'}</div>
                    <div style="font-size:.78rem;color:var(--text-secondary)">${d.closedByName ? escapeHTML(d.closedByName) : '—'}</div>
                </div>
            </div>

            <!-- KPIs -->
            <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:.5rem;margin-bottom:1rem">
                <div style="padding:.5rem;background:var(--bg-input);border-radius:var(--radius);text-align:center">
                    <div style="font-size:.65rem;color:var(--text-muted)">Monto Inicial</div>
                    <div style="font-weight:700;font-size:.9rem">${formatCurrency(d.initialAmount)}</div>
                </div>
                <div style="padding:.5rem;background:var(--bg-input);border-radius:var(--radius);text-align:center">
                    <div style="font-size:.65rem;color:var(--text-muted)">Total Ventas</div>
                    <div style="font-weight:700;font-size:.9rem;color:var(--primary-light)">${formatCurrency(d.totalSales)}</div>
                </div>
                <div style="padding:.5rem;background:var(--bg-input);border-radius:var(--radius);text-align:center">
                    <div style="font-size:.65rem;color:var(--text-muted)">Operaciones</div>
                    <div style="font-weight:700;font-size:.9rem">${d.salesCount}</div>
                </div>
            </div>

            <!-- Payment breakdown -->
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:.5rem;margin-bottom:1rem">
                <div style="padding:.5rem;border:1px solid var(--border);border-radius:var(--radius);text-align:center">
                    <div style="font-size:.65rem;color:var(--text-muted)">Efectivo</div>
                    <div style="font-weight:700;color:var(--success)">${formatCurrency(d.totalEfectivo)}</div>
                </div>
                <div style="padding:.5rem;border:1px solid var(--border);border-radius:var(--radius);text-align:center">
                    <div style="font-size:.65rem;color:var(--text-muted)">Nómina (Vales)</div>
                    <div style="font-weight:700;color:var(--info)">${formatCurrency(d.totalNomina)}</div>
                </div>
                <div style="padding:.5rem;border:1px solid var(--border);border-radius:var(--radius);text-align:center">
                    <div style="font-size:.65rem;color:var(--text-muted)">Transferencia</div>
                    <div style="font-weight:700;color:var(--purple, #a78bfa)">${formatCurrency(d.totalTransferencia)}</div>
                </div>
            </div>

            <!-- Cash difference (only if closed) -->
            ${d.status === 'CLOSED' && d.finalAmount !== null ? `
            <div style="border:1px solid var(--border);border-radius:var(--radius);padding:.75rem;margin-bottom:1rem">
                <div style="font-weight:600;font-size:.85rem;margin-bottom:.5rem">Cuadre de Caja</div>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:.5rem">
                    <div style="text-align:center">
                        <div style="font-size:.65rem;color:var(--text-muted)">Esperado</div>
                        <div style="font-weight:700">${formatCurrency(expectedCash)}</div>
                    </div>
                    <div style="text-align:center">
                        <div style="font-size:.65rem;color:var(--text-muted)">Contado</div>
                        <div style="font-weight:700">${formatCurrency(d.finalAmount)}</div>
                    </div>
                    <div style="text-align:center">
                        <div style="font-size:.65rem;color:var(--text-muted)">Diferencia</div>
                        <div style="font-weight:700">${diffBadge}</div>
                    </div>
                </div>
            </div>` : ''}

            ${d.closingNotes ? `
            <div style="padding:.5rem .75rem;background:var(--bg-input);border-radius:var(--radius);margin-bottom:1rem;font-size:.82rem">
                <strong>Notas:</strong> ${escapeHTML(d.closingNotes)}
            </div>` : ''}

            <!-- Sales table -->
            ${d.sales.length > 0 ? `
            <div style="border-top:1px solid var(--border);padding-top:.75rem">
                <div style="font-weight:600;font-size:.85rem;margin-bottom:.5rem">Ventas Registradas</div>
                <div class="table-container" style="max-height:250px;overflow-y:auto">
                    <table>
                        <thead><tr><th>Hora</th><th>Cliente</th><th>Items</th><th>Pago</th><th>Total</th></tr></thead>
                        <tbody>${d.sales.map(s => `
                            <tr>
                                <td style="font-size:.78rem">${formatDateTime(s.date)}</td>
                                <td style="font-size:.82rem"><strong>${escapeHTML(s.clientName)}</strong></td>
                                <td style="font-size:.75rem;color:var(--text-secondary)">${s.items.map(i => `${i.name} ×${i.quantity}`).join(', ')}</td>
                                <td><span class="badge badge-${s.paymentMethod === 'efectivo' ? 'success' : s.paymentMethod === 'nomina' ? 'info' : 'purple'}" style="font-size:.65rem">${s.paymentMethod === 'nomina' ? 'VALE' : s.paymentMethod}</span></td>
                                <td style="font-weight:600">${formatCurrency(s.total)}</td>
                            </tr>`).join('')}</tbody>
                    </table>
                </div>
            </div>` : '<div class="empty-state" style="padding:1rem"><p>Sin ventas en esta caja</p></div>'}
        </div>`;

        const footer = `
        ${d.status === 'CLOSED' ? `
            <button class="btn btn-warning" id="btnReopenDetailCash"><i data-lucide="rotate-ccw"></i> Reabrir Caja</button>
            <button class="btn btn-ghost" id="btnExportCash"><i data-lucide="download"></i> Exportar Excel</button>
        ` : ''}
        <button class="btn btn-primary modal-close">Cerrar</button>`;

        const overlay = createModal(`Detalle de Caja — ${formatDateTime(d.openedAt)}`, body, footer);
        if (window.lucide) lucide.createIcons();

        const btnReopen = document.getElementById('btnReopenDetailCash');
        if (btnReopen) {
            btnReopen.onclick = () => confirmReopenRegister(registerId, overlay);
        }

        const btnExport = document.getElementById('btnExportCash');
        if (btnExport) {
            btnExport.onclick = () => {
                const headers = ['Hora', 'Cliente', 'Cédula', 'Método de Pago', 'Productos', 'Total'];
                const rows = d.sales.map(s => [
                    formatDateTime(s.date),
                    s.clientName,
                    s.clientCedula,
                    s.paymentMethod,
                    s.items.map(i => `${i.name} x${i.quantity}`).join('; '),
                    s.total
                ]);

                // Add summary rows
                rows.push([]);
                rows.push(['RESUMEN DE CAJA']);
                rows.push(['Apertura', formatDateTime(d.openedAt)]);
                rows.push(['Cierre', d.closedAt ? formatDateTime(d.closedAt) : 'Abierta']);
                rows.push(['Cajero', d.openedByName]);
                rows.push(['Monto Inicial', '', '', '', '', d.initialAmount]);
                rows.push(['Total Efectivo', '', '', '', '', d.totalEfectivo]);
                rows.push(['Total Nómina', '', '', '', '', d.totalNomina]);
                rows.push(['Total Transferencia', '', '', '', '', d.totalTransferencia]);
                rows.push(['Total General', '', '', '', '', d.totalSales]);
                if (d.finalAmount !== null) {
                    rows.push(['Efectivo Contado', '', '', '', '', d.finalAmount]);
                    rows.push(['Efectivo Esperado', '', '', '', '', expectedCash]);
                    rows.push(['Diferencia', '', '', '', '', d.finalAmount - expectedCash]);
                }

                exportExcel(headers, rows, `Caja_${formatDateTime(d.openedAt).replace(/[/: ]/g, '_')}.xlsx`);
                showToast('Reporte exportado');
            };
        }
    } catch (err) {
        showToast('Error al cargar detalle: ' + err.message, 'error');
    }
}

// ============================================
// Print Register Report
// ============================================
async function printRegisterReport(registerId) {
    try {
        const d = await api.get(`/cashregister/${registerId}`);
        const expectedCash = d.initialAmount + d.totalEfectivo;
        const diff = d.finalAmount !== null ? d.finalAmount - expectedCash : null;

        const printWin = window.open('', '_blank', 'width=600,height=800');
        printWin.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8"/>
    <title>Reporte de Caja</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Courier New', Courier, monospace; font-size: 10pt; padding: 10mm; max-width: 210mm; margin: 0 auto; }
        .center { text-align: center; }
        .bold { font-weight: bold; }
        .divider { border-top: 1px dashed #000; margin: 4px 0; }
        .info-row { display: flex; justify-content: space-between; margin: 2px 0; font-size: 9pt; }
        table { width: 100%; border-collapse: collapse; font-size: 8pt; margin: 4px 0; }
        td, th { padding: 2px 4px; text-align: left; border-bottom: 1px solid #ddd; }
        th { font-weight: bold; }
        .total-row { font-weight: bold; font-size: 11pt; border-top: 2px solid #000; }
        @media print { body { padding: 5mm; } }
    </style>
</head>
<body>
    <div class="center bold" style="font-size:14pt;letter-spacing:2px">COMEDOR TTA S.A.</div>
    <div class="center" style="font-size:9pt;margin-bottom:4px">Reporte de Cierre de Caja</div>
    <div class="divider"></div>

    <div class="info-row"><span>Apertura:</span><span class="bold">${formatDateTime(d.openedAt)}</span></div>
    <div class="info-row"><span>Cierre:</span><span class="bold">${d.closedAt ? formatDateTime(d.closedAt) : '—'}</span></div>
    <div class="info-row"><span>Abrió:</span><span>${escapeHTML(d.openedByName)}</span></div>
    <div class="info-row"><span>Cerró:</span><span>${d.closedByName ? escapeHTML(d.closedByName) : '—'}</span></div>
    <div class="divider"></div>

    <div class="info-row"><span>Monto Inicial:</span><span class="bold">${formatCurrency(d.initialAmount)}</span></div>
    <div class="info-row"><span>Ventas Efectivo:</span><span>${formatCurrency(d.totalEfectivo)}</span></div>
    <div class="info-row"><span>Ventas Nómina:</span><span>${formatCurrency(d.totalNomina)}</span></div>
    <div class="info-row"><span>Ventas Transferencia:</span><span>${formatCurrency(d.totalTransferencia)}</span></div>
    <div class="divider"></div>
    <div class="info-row total-row"><span>TOTAL VENTAS:</span><span>${formatCurrency(d.totalSales)}</span></div>
    <div class="info-row"><span>Operaciones:</span><span>${d.salesCount}</span></div>
    <div class="divider"></div>

    ${d.finalAmount !== null ? `
    <div class="info-row"><span>Efectivo Esperado:</span><span>${formatCurrency(expectedCash)}</span></div>
    <div class="info-row"><span>Efectivo Contado:</span><span class="bold">${formatCurrency(d.finalAmount)}</span></div>
    <div class="info-row" style="font-size:11pt"><span class="bold">Diferencia:</span><span class="bold" style="color:${diff === 0 ? '#22c55e' : diff > 0 ? '#f59e0b' : '#ef4444'}">${diff >= 0 ? '+' : ''}${formatCurrency(diff)}</span></div>
    <div class="divider"></div>` : ''}

    ${d.closingNotes ? `<div style="margin:4px 0;font-size:8pt"><strong>Notas:</strong> ${escapeHTML(d.closingNotes)}</div><div class="divider"></div>` : ''}

    <div style="margin-top:4px;font-size:9pt;font-weight:bold">Detalle de Ventas (${d.salesCount})</div>
    <table>
        <thead><tr><th>Hora</th><th>Cliente</th><th>Pago</th><th style="text-align:right">Total</th></tr></thead>
        <tbody>${d.sales.map(s => `
            <tr>
                <td>${formatDateTime(s.date)}</td>
                <td>${escapeHTML(s.clientName)}</td>
                <td>${s.paymentMethod}</td>
                <td style="text-align:right">${formatCurrency(s.total)}</td>
            </tr>`).join('')}</tbody>
    </table>

    <div style="margin-top:15mm;display:flex;justify-content:space-between">
        <div style="text-align:center;width:45%">
            <div style="border-top:1px solid #000;padding-top:3mm;margin-top:10mm">
                <div class="bold">${escapeHTML(d.openedByName)}</div>
                <div style="font-size:7pt">Cajero</div>
            </div>
        </div>
        <div style="text-align:center;width:45%">
            <div style="border-top:1px solid #000;padding-top:3mm;margin-top:10mm">
                <div class="bold">Supervisor</div>
                <div style="font-size:7pt">Firma Supervisor</div>
            </div>
        </div>
    </div>
</body>
</html>`);

        printWin.document.close();
        printWin.focus();
        setTimeout(() => { printWin.print(); printWin.close(); }, 400);
    } catch (err) {
        showToast('Error al imprimir: ' + err.message, 'error');
    }
}

// ============================================
// Helper: Open cash register from POS module
// ============================================
export function openCashRegisterFromPOS() {
    return new Promise((resolve) => {
        const body = `
        <div style="text-align:center;margin-bottom:1.5rem">
            <div style="width:56px;height:56px;border-radius:50%;background:rgba(245,158,11,.12);display:flex;align-items:center;justify-content:center;margin:0 auto .75rem">
                <i data-lucide="alert-triangle" style="width:28px;height:28px;color:var(--warning)"></i>
            </div>
            <h3 style="font-size:1.1rem;margin-bottom:.5rem">Caja No Abierta</h3>
            <p style="color:var(--text-secondary);font-size:.88rem">Necesita abrir una caja antes de poder registrar ventas.</p>
        </div>
        <div class="form-group">
            <label>Monto Inicial en Efectivo (₲)</label>
            <input type="number" class="form-control" id="mQuickInitial" value="0" min="0" step="1000" />
            <small style="color:var(--text-muted);display:block;margin-top:.25rem">Puede ser 0 si no hay fondo de caja.</small>
        </div>`;

        const footer = `
        <button class="btn btn-secondary modal-close" id="btnCancelQuickOpen">Cancelar</button>
        <button class="btn btn-success" id="btnQuickOpen"><i data-lucide="lock-open"></i> Abrir Caja y Continuar</button>`;

        const overlay = createModal('Abrir Caja', body, footer);
        if (window.lucide) lucide.createIcons();

        document.getElementById('btnCancelQuickOpen').onclick = () => {
            closeModal(overlay);
            resolve(false);
        };

        document.getElementById('btnQuickOpen').onclick = async () => {
            const btn = document.getElementById('btnQuickOpen');
            btn.disabled = true;
            btn.innerHTML = '<i data-lucide="loader"></i> Abriendo...';
            if (window.lucide) lucide.createIcons();

            try {
                const initialAmount = parseInt(document.getElementById('mQuickInitial').value) || 0;
                await api.post('/cashregister/open', { initialAmount });
                showToast('¡Caja abierta!');
                closeModal(overlay);
                resolve(true);
            } catch (err) {
                showToast(err.message, 'error');
                btn.disabled = false;
                btn.innerHTML = '<i data-lucide="lock-open"></i> Abrir Caja y Continuar';
                if (window.lucide) lucide.createIcons();
                resolve(false);
            }
        };
    });
}
