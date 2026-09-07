import { Router } from 'express';
import prisma from '../config/db.js';
import { authMiddleware, requirePermission, validateUUID } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);
router.use(requirePermission('sales'));

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
      items: s.items.map(i => ({
        productId: i.productId, name: i.product?.name || '', price: i.unitPrice, quantity: i.quantity, unit: i.product?.unit || 'UNI'
      }))
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener ventas' });
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
      items: sale.items.map(i => ({
        productId: i.productId, name: i.product?.name || '', price: i.unitPrice, quantity: i.quantity, unit: i.product?.unit || 'UNI'
      }))
    });
  } catch (err) {
    console.error('Sale error:', err);
    res.status(500).json({ error: err.message || 'Error al registrar venta' });
  }
});

// DELETE /api/sales/:id (Anulación de venta con soft-delete y trazabilidad)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};

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
          cancellationReason: (reason && reason.trim()) ? reason.trim() : 'Anulación manual'
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
