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
      paymentMethod: p.paymentMethod,
      dueDate: p.dueDate ? p.dueDate.toISOString() : null,
      noInvoice: p.noInvoice,
      timbrado: p.timbrado,
      t1: p.t1,
      t2: p.t2,
      invoiceNumber: p.invoiceNumber,
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
    const { 
      providerId, items, paymentMethod, dueDate, 
      noInvoice, timbrado, t1, t2, invoiceNumber 
    } = req.body;

    if (!providerId || !items?.length) {
      return res.status(400).json({ error: 'Proveedor y productos son obligatorios' });
    }

    // Get product info for costs
    const productIds = items.map(i => i.productId);
    const products = await prisma.product.findMany({ where: { id: { in: productIds } } });
    const prodMap = {};
    products.forEach(p => prodMap[p.id] = p);

    // Calculate total
    const total = items.reduce((sum, it) => {
        const itemCost = it.cost !== undefined ? parseFloat(it.cost) : (prodMap[it.productId]?.cost || 0);
        const itemQty = parseFloat(it.quantity) || 0;
        return sum + itemCost * itemQty;
    }, 0);

    const purchase = await prisma.$transaction(async (tx) => {
      // Create purchase
      const purch = await tx.purchase.create({
        data: {
          providerId,
          userId: req.user.id,
          total,
          paymentMethod: paymentMethod === 'CREDITO' ? 'CREDITO' : 'CONTADO',
          dueDate: dueDate ? new Date(dueDate) : null,
          noInvoice: !!noInvoice,
          timbrado: timbrado || null,
          t1: t1 || null,
          t2: t2 || null,
          invoiceNumber: invoiceNumber || null,
          items: {
            create: items.map(it => ({
              productId: it.productId,
              quantity: parseFloat(it.quantity) || 0,
              unitCost: it.cost !== undefined ? parseFloat(it.cost) : (prodMap[it.productId]?.cost || 0)
            }))
          }
        },
        include: { provider: true, items: { include: { product: true } } }
      });

      // Update stock and cost
      for (const item of items) {
        const newCost = item.cost !== undefined ? parseFloat(item.cost) : (prodMap[item.productId]?.cost || 0);
        const qty = parseFloat(item.quantity) || 0;
        const updateData = {
          stock: { increment: qty },
          cost: newCost
        };
        if (item.price !== undefined) updateData.price = parseFloat(item.price);
        await tx.product.update({
          where: { id: item.productId },
          data: updateData
        });
      }

      return purch;
    });

    res.status(201).json({
      id: purchase.id,
      providerName: purchase.provider.name,
      total: purchase.total,
      date: purchase.createdAt.toISOString(),
      paymentMethod: purchase.paymentMethod,
      invoiceNumber: purchase.invoiceNumber,
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
