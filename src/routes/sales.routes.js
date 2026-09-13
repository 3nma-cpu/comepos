import { Router } from 'express';
import prisma from '../config/db.js';
import { authMiddleware, requirePermission, validateUUID } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);
router.use(requirePermission('sales', 'clients'));

const PAY_MAP = { 'efectivo': 'EFECTIVO', 'transferencia': 'TRANSFERENCIA', 'nomina': 'NOMINA' };
const PAY_REVERSE = { 'EFECTIVO': 'efectivo', 'TRANSFERENCIA': 'transferencia', 'NOMINA': 'nomina' };

const CAT_REVERSE = {
  'DIRECTIVO': 'Directivo', 'GERENTE': 'Gerente', 'JEFE_DE_AREA': 'Jefe de Área',
  'ANALISTA': 'Analista', 'ASISTENTE': 'Asistente', 'OPERARIO': 'Operario',
  'PRACTICANTE': 'Practicante', 'CONTRATISTA': 'Contratista'
};

const MAX_LIMIT = 500;

// GET /api/sales
router.get('/', async (req, res) => {
  try {
    const { from, to, limit, status } = req.query;
    const where = {};
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to + 'T23:59:59.999Z');
    }

    if (status) {
      where.status = status;
    } else {
      where.status = 'COMPLETED'; // Por defecto solo ventas activas
    }

    // Acotar el límite para prevenir extracción masiva de datos
    let take = undefined;
    if (limit !== undefined) {
      const parsed = parseInt(limit, 10);
      take = (!isNaN(parsed) && parsed > 0) ? Math.min(parsed, MAX_LIMIT) : MAX_LIMIT;
    }

    const sales = await prisma.sale.findMany({
      where,
      include: {
        client: true,
        items: { include: { product: true } },
        user: true,
        cancelledBy: { select: { id: true, name: true, username: true } }
      },
      orderBy: { createdAt: 'desc' },
      take
    });

    res.json(sales.map(s => ({
      id: s.id,
      clientId: s.clientId,
      clientName: s.client?.name || 'Desconocido',
      clientCedula: s.client?.cedula || '',
      clientCategory: CAT_REVERSE[s.client?.category] || s.client?.category || '',
      total: s.total,
      paymentMethod: PAY_REVERSE[s.paymentMethod] || s.paymentMethod,
      status: s.status,
      cancelledAt: s.cancelledAt ? s.cancelledAt.toISOString() : null,
      cancelledById: s.cancelledById,
      cancelledByName: s.cancelledBy?.name || null,
      cancellationReason: s.cancellationReason || null,
      date: s.createdAt.toISOString(),
      userId: s.userId,
      userName: s.user?.name || s.user?.username || 'Cajero',
      items: s.items.map(i => ({
        productId: i.productId, name: i.product?.name || '', price: i.unitPrice, quantity: i.quantity, unit: i.product?.unit || 'UNI'
      }))
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener ventas' });
  }
});

// GET /api/sales/:id
router.get('/:id', validateUUID, async (req, res) => {
  try {
    const sale = await prisma.sale.findUnique({
      where: { id: req.params.id },
      include: {
        client: true,
        items: { include: { product: true } },
        user: true,
        cancelledBy: { select: { id: true, name: true, username: true } }
      }
    });

    if (!sale) {
      return res.status(404).json({ error: 'Venta no encontrada' });
    }

    res.json({
      id: sale.id,
      clientId: sale.clientId,
      clientName: sale.client?.name || 'Desconocido',
      clientCedula: sale.client?.cedula || '',
      clientCategory: CAT_REVERSE[sale.client?.category] || sale.client?.category || '',
      total: sale.total,
      paymentMethod: PAY_REVERSE[sale.paymentMethod] || sale.paymentMethod,
      status: sale.status,
      cancelledAt: sale.cancelledAt ? sale.cancelledAt.toISOString() : null,
      cancelledById: sale.cancelledById,
      cancelledByName: sale.cancelledBy?.name || null,
      cancellationReason: sale.cancellationReason || null,
      date: sale.createdAt.toISOString(),
      userId: sale.userId,
      userName: sale.user?.name || sale.user?.username || 'Cajero',
      items: sale.items.map(i => ({
        productId: i.productId, name: i.product?.name || '', price: i.unitPrice, quantity: i.quantity, unit: i.product?.unit || 'UNI'
      }))
    });
  } catch (err) {
    console.error('Error al obtener venta:', err);
    res.status(500).json({ error: 'Error al obtener venta' });
  }
});

// POST /api/sales
router.post('/', async (req, res) => {
  try {
    const { clientId, items, paymentMethod, date } = req.body;
    if (!clientId || !items?.length || !paymentMethod) {
      return res.status(400).json({ error: 'Cliente, productos y método de pago son obligatorios' });
    }

    // Verificar que el usuario tenga una caja abierta
    const openRegister = await prisma.cashRegister.findFirst({
      where: { openedById: req.user.id, status: 'OPEN' }
    });
    if (!openRegister) {
      return res.status(400).json({ error: 'Debe abrir una caja antes de registrar ventas', code: 'NO_CASH_REGISTER' });
    }

    let createdAt = undefined;
    if (date) {
      if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
        const now = new Date();
        const [y, m, d] = date.split('-').map(Number);
        // Si la fecha es hoy, usar el timestamp actual exacto con hora y minutos
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        if (date === todayStr) {
          createdAt = now;
        } else {
          // Si es una fecha pasada, combinarla con la hora actual local
          const candidate = new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds());
          createdAt = candidate > now ? now : candidate;
        }
      } else {
        const parsedDate = new Date(date);
        if (parsedDate > new Date()) {
          return res.status(400).json({ error: 'No se pueden registrar ventas en el futuro' });
        }
        createdAt = parsedDate;
      }
    }

    // Normalize quantities to float
    const normalizedItems = items.map(it => ({
      ...it,
      quantity: parseFloat(it.quantity) || 1
    }));

    // Get product info
    const productIds = normalizedItems.map(i => i.productId);
    const products = await prisma.product.findMany({ where: { id: { in: productIds } } });
    const prodMap = {};
    products.forEach(p => prodMap[p.id] = p);

    // Validate stock
    for (const item of normalizedItems) {
      const prod = prodMap[item.productId];
      if (!prod) return res.status(400).json({ error: `Producto no encontrado: ${item.productId}` });
      if (prod.stock < item.quantity) return res.status(400).json({ error: `Stock insuficiente para ${prod.name}. Disponible: ${prod.stock}` });
    }

    const total = Math.round(normalizedItems.reduce((sum, it) => sum + (prodMap[it.productId]?.price || 0) * it.quantity, 0));

    const sale = await prisma.$transaction(async (tx) => {
      const s = await tx.sale.create({
        data: {
          clientId,
          userId: req.user.id,
          cashRegisterId: openRegister.id,
          total,
          paymentMethod: PAY_MAP[paymentMethod] || paymentMethod,
          createdAt: createdAt,
          items: {
            create: normalizedItems.map(it => ({
              productId: it.productId,
              quantity: it.quantity,
              unitPrice: prodMap[it.productId]?.price || 0
            }))
          }
        },
        include: { client: true, items: { include: { product: true } } }
      });

      // Decrement stock atomically — prevent going negative
      for (const item of normalizedItems) {
        const updated = await tx.product.updateMany({
          where: { id: item.productId, stock: { gte: item.quantity } },
          data: { stock: { decrement: item.quantity } }
        });
        if (updated.count === 0) {
          throw new Error(`Stock insuficiente para ${prodMap[item.productId]?.name || 'un producto'}`);
        }
      }

      return s;
    }, { maxWait: 10000, timeout: 30000 });

    res.status(201).json({
      id: sale.id,
      clientId: sale.clientId,
      clientName: sale.client?.name || 'Desconocido',
      clientCedula: sale.client?.cedula || '',
      clientCategory: CAT_REVERSE[sale.client?.category] || sale.client?.category || '',
      total: sale.total,
      paymentMethod: PAY_REVERSE[sale.paymentMethod] || sale.paymentMethod,
      date: sale.createdAt.toISOString(),
      userId: sale.userId,
      userName: req.user?.name || req.user?.username || 'Cajero',
      items: sale.items.map(i => ({
        productId: i.productId, name: i.product?.name || '', price: i.unitPrice, quantity: i.quantity, unit: i.product?.unit || 'UNI'
      }))
    });
  } catch (err) {
    console.error('Sale error:', err);
    res.status(500).json({ error: err.message || 'Error al registrar venta' });
  }
});

// PUT /api/sales/:id (Edición de vale / venta)
router.put('/:id', validateUUID, async (req, res) => {
  try {
    const { id } = req.params;
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'El vale debe contener al menos un producto' });
    }

    const sale = await prisma.sale.findUnique({
      where: { id },
      include: { items: true, client: true }
    });

    if (!sale) {
      return res.status(404).json({ error: 'Venta no encontrada' });
    }

    if (sale.status === 'CANCELLED') {
      return res.status(400).json({ error: 'No se puede editar una venta anulada' });
    }

    // Normalizar items y validar
    const consolidatedMap = new Map();
    for (const it of items) {
      if (!it.productId) {
        return res.status(400).json({ error: 'Cada item debe tener un producto válido' });
      }
      const qty = parseFloat(it.quantity);
      if (isNaN(qty) || qty <= 0) {
        return res.status(400).json({ error: 'La cantidad debe ser mayor a cero' });
      }
      const unitPrice = (it.unitPrice !== undefined && !isNaN(parseFloat(it.unitPrice))) ? parseFloat(it.unitPrice) : null;
      if (consolidatedMap.has(it.productId)) {
        const existing = consolidatedMap.get(it.productId);
        existing.quantity += qty;
        if (unitPrice !== null && existing.unitPrice === null) {
          existing.unitPrice = unitPrice;
        }
      } else {
        consolidatedMap.set(it.productId, { productId: it.productId, quantity: qty, unitPrice });
      }
    }

    const finalItems = Array.from(consolidatedMap.values());
    const allProdIds = Array.from(new Set([
      ...sale.items.map(i => i.productId),
      ...finalItems.map(i => i.productId)
    ]));

    // Consultar todos los productos involucrados
    const products = await prisma.product.findMany({
      where: { id: { in: allProdIds } }
    });
    const prodMap = new Map(products.map(p => [p.id, p]));

    // Validar existencia de productos y asignar unitPrice si no vino definido
    for (const it of finalItems) {
      const prod = prodMap.get(it.productId);
      if (!prod) {
        return res.status(400).json({ error: `Producto no encontrado: ${it.productId}` });
      }
      if (it.unitPrice === null) {
        const original = sale.items.find(i => i.productId === it.productId);
        it.unitPrice = original ? original.unitPrice : prod.price;
      }
    }

    // Validar disponibilidad de stock antes de iniciar la transacción
    for (const prodId of allProdIds) {
      const oldQty = sale.items.filter(i => i.productId === prodId).reduce((s, i) => s + i.quantity, 0);
      const newQty = finalItems.filter(i => i.productId === prodId).reduce((s, i) => s + i.quantity, 0);
      const delta = newQty - oldQty; // > 0 requiere más stock

      if (delta > 0) {
        const prod = prodMap.get(prodId);
        if ((prod?.stock || 0) < delta) {
          return res.status(400).json({
            error: `Stock insuficiente para ${prod?.name || 'producto'}. Se requieren ${delta} adicional(es), disponible actual: ${prod?.stock ?? 0}`
          });
        }
      }
    }

    const newTotal = Math.round(finalItems.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0));

    // Transacción atómica
    const updatedSale = await prisma.$transaction(async (tx) => {
      // 1. Ajustar stock de cada producto involucrado
      for (const prodId of allProdIds) {
        const oldQty = sale.items.filter(i => i.productId === prodId).reduce((s, i) => s + i.quantity, 0);
        const newQty = finalItems.filter(i => i.productId === prodId).reduce((s, i) => s + i.quantity, 0);
        const delta = newQty - oldQty;

        if (delta > 0) {
          // Requiere más stock -> dar salida (decrementar)
          const updated = await tx.product.updateMany({
            where: { id: prodId, stock: { gte: delta } },
            data: { stock: { decrement: delta } }
          });
          if (updated.count === 0) {
            const p = prodMap.get(prodId);
            throw new Error(`Stock insuficiente para ${p?.name || 'un producto'}`);
          }
        } else if (delta < 0) {
          // Se redujo la cantidad o se eliminó el producto -> devolver stock (incrementar)
          await tx.product.update({
            where: { id: prodId },
            data: { stock: { increment: Math.abs(delta) } }
          });
        }
      }

      // 2. Eliminar los items antiguos
      await tx.saleItem.deleteMany({
        where: { saleId: sale.id }
      });

      // 3. Crear los nuevos items
      await tx.saleItem.createMany({
        data: finalItems.map(it => ({
          saleId: sale.id,
          productId: it.productId,
          quantity: it.quantity,
          unitPrice: it.unitPrice
        }))
      });

      // 4. Actualizar total de la venta
      return await tx.sale.update({
        where: { id: sale.id },
        data: { total: newTotal },
        include: {
          client: true,
          items: { include: { product: true } },
          user: true,
          cancelledBy: { select: { id: true, name: true, username: true } }
        }
      });
    }, { maxWait: 10000, timeout: 30000 });

    res.json({
      id: updatedSale.id,
      clientId: updatedSale.clientId,
      clientName: updatedSale.client?.name || 'Desconocido',
      clientCedula: updatedSale.client?.cedula || '',
      clientCategory: CAT_REVERSE[updatedSale.client?.category] || updatedSale.client?.category || '',
      total: updatedSale.total,
      paymentMethod: PAY_REVERSE[updatedSale.paymentMethod] || updatedSale.paymentMethod,
      status: updatedSale.status,
      cancelledAt: updatedSale.cancelledAt ? updatedSale.cancelledAt.toISOString() : null,
      cancelledById: updatedSale.cancelledById,
      cancelledByName: updatedSale.cancelledBy?.name || null,
      cancellationReason: updatedSale.cancellationReason || null,
      date: updatedSale.createdAt.toISOString(),
      userId: updatedSale.userId,
      userName: updatedSale.user?.name || updatedSale.user?.username || 'Cajero',
      items: updatedSale.items.map(i => ({
        productId: i.productId,
        name: i.product?.name || '',
        price: i.unitPrice,
        quantity: i.quantity,
        unit: i.product?.unit || 'UNI'
      }))
    });
  } catch (err) {
    console.error('Error updating sale:', err);
    res.status(500).json({ error: err.message || 'Error al editar venta' });
  }
});

// DELETE /api/sales/:id (Anulación de venta con soft-delete y trazabilidad)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};

    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      return res.status(400).json({ error: 'El motivo de anulación es obligatorio' });
    }

    const sale = await prisma.sale.findUnique({
      where: { id },
      include: { items: true }
    });

    if (!sale) {
      return res.status(404).json({ error: 'Venta no encontrada' });
    }

    if (sale.status === 'CANCELLED') {
      return res.status(400).json({ error: 'Esta venta ya fue anulada previamente' });
    }

    await prisma.$transaction(async (tx) => {
      // Revertir el stock a cada producto de la venta
      for (const item of sale.items) {
        if (item.productId && item.quantity > 0) {
          await tx.product.updateMany({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity } }
          });
        }
      }

      // Marcar la venta como CANCELLED en lugar de borrarla físicamente
      await tx.sale.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledById: req.user.id,
          cancellationReason: reason.trim()
        }
      });
    }, { maxWait: 10000, timeout: 30000 });

    res.json({ message: 'Venta anulada y stock restituido', id });
  } catch (err) {
    console.error('Error cancelling sale:', err);
    res.status(500).json({ error: 'Error al anular venta: ' + err.message });
  }
});

export default router;
