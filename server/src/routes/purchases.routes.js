import { Router } from 'express';
import prisma from '../config/db.js';
import { authMiddleware, requirePermission } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);
router.use(requirePermission('purchases'));

// GET /api/purchases
router.get('/', async (req, res) => {
  try {
    const purchases = await prisma.purchase.findMany({
      include: { provider: true, items: { include: { product: true } }, user: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json(purchases.map(p => ({
      id: p.id,
      providerId: p.providerId,
      providerName: p.provider.name,
      total: p.total,
      date: p.createdAt.toISOString(),
      userId: p.userId,
      items: p.items.map(i => ({
        productId: i.productId, name: i.product.name, cost: i.unitCost, quantity: i.quantity
      }))
    })));
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener compras' });
  }
});

// POST /api/purchases
router.post('/', async (req, res) => {
  try {
    const { providerId, items } = req.body;
    if (!providerId || !items?.length) {
      return res.status(400).json({ error: 'Proveedor y productos son obligatorios' });
    }

    // Get product info for costs
    const productIds = items.map(i => i.productId);
    const products = await prisma.product.findMany({ where: { id: { in: productIds } } });
    const prodMap = {};
    products.forEach(p => prodMap[p.id] = p);

    const total = items.reduce((sum, it) => sum + (prodMap[it.productId]?.cost || it.cost || 0) * it.quantity, 0);

    const purchase = await prisma.$transaction(async (tx) => {
      // Create purchase
      const purch = await tx.purchase.create({
        data: {
          providerId,
          userId: req.user.id,
          total,
          items: {
            create: items.map(it => ({
              productId: it.productId,
              quantity: it.quantity,
              unitCost: prodMap[it.productId]?.cost || it.cost || 0
            }))
          }
        },
        include: { provider: true, items: { include: { product: true } } }
      });

      // Update stock
      for (const item of items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } }
        });
      }

      return purch;
    });

    res.status(201).json({
      id: purchase.id,
      providerName: purchase.provider.name,
      total: purchase.total,
      date: purchase.createdAt.toISOString(),
      items: purchase.items.map(i => ({ productId: i.productId, name: i.product.name, cost: i.unitCost, quantity: i.quantity }))
    });
  } catch (err) {
    console.error('Purchase error:', err);
    res.status(500).json({ error: 'Error al registrar compra' });
  }
});

// DELETE /api/purchases/:id
router.delete('/:id', async (req, res) => {
  try {
    await prisma.purchase.delete({ where: { id: req.params.id } });
    res.json({ message: 'Compra eliminada' });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Compra no encontrada' });
    res.status(500).json({ error: 'Error al eliminar compra' });
  }
});

export default router;
