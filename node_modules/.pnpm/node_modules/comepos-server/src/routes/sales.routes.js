import { Router } from 'express';
import prisma from '../config/db.js';
import { authMiddleware, requirePermission } from '../middleware/auth.js';

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

    const sales = await prisma.sale.findMany({
      where,
      include: { client: true, items: { include: { product: true } }, user: true },
      orderBy: { createdAt: 'desc' },
      take: limit ? parseInt(limit) : undefined
    });

    res.json(sales.map(s => ({
      id: s.id,
      clientId: s.clientId,
      clientName: s.client.name,
      clientCategory: CAT_REVERSE[s.client.category] || s.client.category,
      total: s.total,
      paymentMethod: PAY_REVERSE[s.paymentMethod] || s.paymentMethod,
      date: s.createdAt.toISOString(),
      userId: s.userId,
      items: s.items.map(i => ({
        productId: i.productId, name: i.product.name, price: i.unitPrice, quantity: i.quantity
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
    const { clientId, items, paymentMethod } = req.body;
    if (!clientId || !items?.length || !paymentMethod) {
      return res.status(400).json({ error: 'Cliente, productos y método de pago son obligatorios' });
    }

    // Get product info
    const productIds = items.map(i => i.productId);
    const products = await prisma.product.findMany({ where: { id: { in: productIds } } });
    const prodMap = {};
    products.forEach(p => prodMap[p.id] = p);

    // Validate stock
    for (const item of items) {
      const prod = prodMap[item.productId];
      if (!prod) return res.status(400).json({ error: `Producto no encontrado: ${item.productId}` });
      if (prod.stock < item.quantity) return res.status(400).json({ error: `Stock insuficiente para ${prod.name}` });
    }

    const total = items.reduce((sum, it) => sum + (prodMap[it.productId]?.price || 0) * it.quantity, 0);

    const sale = await prisma.$transaction(async (tx) => {
      const s = await tx.sale.create({
        data: {
          clientId,
          userId: req.user.id,
          total,
          paymentMethod: PAY_MAP[paymentMethod] || paymentMethod,
          items: {
            create: items.map(it => ({
              productId: it.productId,
              quantity: it.quantity,
              unitPrice: prodMap[it.productId]?.price || 0
            }))
          }
        },
        include: { client: true, items: { include: { product: true } } }
      });

      // Decrease stock
      for (const item of items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } }
        });
      }

      return s;
    });

    res.status(201).json({
      id: sale.id,
      clientId: sale.clientId,
      clientName: sale.client.name,
      clientCategory: CAT_REVERSE[sale.client.category] || sale.client.category,
      total: sale.total,
      paymentMethod: PAY_REVERSE[sale.paymentMethod] || sale.paymentMethod,
      date: sale.createdAt.toISOString(),
      items: sale.items.map(i => ({
        productId: i.productId, name: i.product.name, price: i.unitPrice, quantity: i.quantity
      }))
    });
  } catch (err) {
    console.error('Sale error:', err);
    res.status(500).json({ error: 'Error al registrar venta' });
  }
});

export default router;
