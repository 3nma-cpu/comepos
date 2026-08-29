import { Router } from 'express';
import prisma from '../config/db.js';
import { authMiddleware, requirePermission, validateUUID } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);
router.use(requirePermission('sales'));

const PAY_MAP = { 'efectivo': 'EFECTIVO', 'tarjeta': 'TARJETA', 'nomina': 'NOMINA' };
const PAY_REVERSE = { 'EFECTIVO': 'efectivo', 'TARJETA': 'tarjeta', 'NOMINA': 'nomina' };

const CAT_REVERSE = {
  'DIRECTIVO': 'Directivo', 'GERENTE': 'Gerente', 'JEFE_DE_AREA': 'Jefe de Área',
  'ANALISTA': 'Analista', 'ASISTENTE': 'Asistente', 'OPERARIO': 'Operario',
  'PRACTICANTE': 'Practicante', 'CONTRATISTA': 'Contratista'
};

const MAX_LIMIT = 500;

// GET /api/sales
router.get('/', async (req, res) => {
  try {
    const { from, to, limit } = req.query;
    const where = {};
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to + 'T23:59:59.999Z');
    }

    // Acotar el límite para prevenir extracción masiva de datos
    let take = undefined;
    if (limit !== undefined) {
      const parsed = parseInt(limit, 10);
      take = (!isNaN(parsed) && parsed > 0) ? Math.min(parsed, MAX_LIMIT) : MAX_LIMIT;
    }

    const sales = await prisma.sale.findMany({
      where,
      include: { client: true, items: { include: { product: true } }, user: true },
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
      const parsedDate = new Date(date);
      if (parsedDate > new Date()) {
        return res.status(400).json({ error: 'No se pueden registrar ventas en el futuro' });
      }
      createdAt = parsedDate;
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

export default router;
