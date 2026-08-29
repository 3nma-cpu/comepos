import { Router } from 'express';
import prisma from '../config/db.js';
import { authMiddleware, requirePermission, validateUUID } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);
router.use(requirePermission('sales'));

// GET /api/cashregister/active — Get all currently open cash registers
router.get('/active', async (req, res) => {
  try {
    const registers = await prisma.cashRegister.findMany({
      where: { status: 'OPEN' },
      include: {
        openedBy: { select: { id: true, name: true } },
        _count: { select: { sales: true } }
      },
      orderBy: { openedAt: 'desc' }
    });

    // Also find the one belonging to the current user (if any)
    const mine = registers.find(r => r.openedById === req.user.id) || null;

    res.json({
      registers: registers.map(r => ({
        id: r.id,
        openedById: r.openedById,
        openedByName: r.openedBy.name,
        openedAt: r.openedAt.toISOString(),
        initialAmount: r.initialAmount,
        salesCount: r._count.sales
      })),
      mine: mine ? {
        id: mine.id,
        openedById: mine.openedById,
        openedByName: mine.openedBy.name,
        openedAt: mine.openedAt.toISOString(),
        initialAmount: mine.initialAmount,
        salesCount: mine._count.sales
      } : null
    });
  } catch (err) {
    console.error('Error getting active registers:', err);
    res.status(500).json({ error: 'Error al obtener cajas activas' });
  }
});

// GET /api/cashregister — List all cash registers (history)
router.get('/', async (req, res) => {
  try {
    const { from, to, status } = req.query;
    const where = {};

    if (status === 'OPEN' || status === 'CLOSED') {
      where.status = status;
    }

    if (from || to) {
      where.openedAt = {};
      if (from) where.openedAt.gte = new Date(from);
      if (to) where.openedAt.lte = new Date(to + 'T23:59:59.999Z');
    }

    const registers = await prisma.cashRegister.findMany({
      where,
      include: {
        openedBy: { select: { id: true, name: true } },
        closedBy: { select: { id: true, name: true } },
        _count: { select: { sales: true } },
        sales: { select: { total: true, paymentMethod: true } }
      },
      orderBy: { openedAt: 'desc' }
    });

    res.json(registers.map(r => {
      const totalEfectivo = r.sales.filter(s => s.paymentMethod === 'EFECTIVO').reduce((sum, s) => sum + s.total, 0);
      const totalNomina = r.sales.filter(s => s.paymentMethod === 'NOMINA').reduce((sum, s) => sum + s.total, 0);
      const totalTarjeta = r.sales.filter(s => s.paymentMethod === 'TARJETA').reduce((sum, s) => sum + s.total, 0);
      const totalSales = r.sales.reduce((sum, s) => sum + s.total, 0);

      return {
        id: r.id,
        openedById: r.openedById,
        openedByName: r.openedBy.name,
        closedById: r.closedById,
        closedByName: r.closedBy?.name || null,
        openedAt: r.openedAt.toISOString(),
        closedAt: r.closedAt?.toISOString() || null,
        initialAmount: r.initialAmount,
        finalAmount: r.finalAmount,
        closingNotes: r.closingNotes,
        status: r.status,
        salesCount: r._count.sales,
        totalSales,
        totalEfectivo,
        totalNomina,
        totalTarjeta
      };
    }));
  } catch (err) {
    console.error('Error listing registers:', err);
    res.status(500).json({ error: 'Error al listar cajas' });
  }
});

// GET /api/cashregister/:id — Detailed view of a cash register
router.get('/:id', validateUUID, async (req, res) => {
  try {
    const register = await prisma.cashRegister.findUnique({
      where: { id: req.params.id },
      include: {
        openedBy: { select: { id: true, name: true } },
        closedBy: { select: { id: true, name: true } },
        sales: {
          include: {
            client: { select: { name: true, cedula: true, category: true } },
            user: { select: { name: true } },
            items: { include: { product: { select: { name: true, unit: true } } } }
          },
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    if (!register) return res.status(404).json({ error: 'Caja no encontrada' });

    const PAY_REVERSE = { 'EFECTIVO': 'efectivo', 'TARJETA': 'tarjeta', 'NOMINA': 'nomina' };

    const totalEfectivo = register.sales.filter(s => s.paymentMethod === 'EFECTIVO').reduce((sum, s) => sum + s.total, 0);
    const totalNomina = register.sales.filter(s => s.paymentMethod === 'NOMINA').reduce((sum, s) => sum + s.total, 0);
    const totalTarjeta = register.sales.filter(s => s.paymentMethod === 'TARJETA').reduce((sum, s) => sum + s.total, 0);
    const totalSales = register.sales.reduce((sum, s) => sum + s.total, 0);
    const expectedCash = register.initialAmount + totalEfectivo;

    res.json({
      id: register.id,
      openedById: register.openedById,
      openedByName: register.openedBy.name,
      closedById: register.closedById,
      closedByName: register.closedBy?.name || null,
      openedAt: register.openedAt.toISOString(),
      closedAt: register.closedAt?.toISOString() || null,
      initialAmount: register.initialAmount,
      finalAmount: register.finalAmount,
      expectedCash,
      difference: register.finalAmount !== null ? register.finalAmount - expectedCash : null,
      closingNotes: register.closingNotes,
      status: register.status,
      salesCount: register.sales.length,
      totalSales,
      totalEfectivo,
      totalNomina,
      totalTarjeta,
      sales: register.sales.map(s => ({
        id: s.id,
        clientName: s.client?.name || 'Desconocido',
        clientCedula: s.client?.cedula || '',
        userName: s.user?.name || '',
        total: s.total,
        paymentMethod: PAY_REVERSE[s.paymentMethod] || s.paymentMethod,
        date: s.createdAt.toISOString(),
        items: s.items.map(i => ({
          name: i.product?.name || '',
          quantity: i.quantity,
          price: i.unitPrice,
          unit: i.product?.unit || 'UNI'
        }))
      }))
    });
  } catch (err) {
    console.error('Error getting register detail:', err);
    res.status(500).json({ error: 'Error al obtener detalle de caja' });
  }
});

// POST /api/cashregister/open — Open a new cash register
router.post('/open', async (req, res) => {
  try {
    const { initialAmount } = req.body;

    // Check if this user already has an open register
    const existing = await prisma.cashRegister.findFirst({
      where: { openedById: req.user.id, status: 'OPEN' }
    });
    if (existing) {
      return res.status(409).json({ error: 'Ya tenés una caja abierta. Cerrala antes de abrir otra.' });
    }

    const register = await prisma.cashRegister.create({
      data: {
        openedById: req.user.id,
        initialAmount: parseInt(initialAmount) || 0
      },
      include: {
        openedBy: { select: { id: true, name: true } }
      }
    });

    res.status(201).json({
      id: register.id,
      openedById: register.openedById,
      openedByName: register.openedBy.name,
      openedAt: register.openedAt.toISOString(),
      initialAmount: register.initialAmount,
      status: register.status
    });
  } catch (err) {
    console.error('Error opening register:', err);
    res.status(500).json({ error: 'Error al abrir caja' });
  }
});

// POST /api/cashregister/:id/close — Close an open cash register
router.post('/:id/close', validateUUID, async (req, res) => {
  try {
    const { finalAmount, closingNotes } = req.body;

    const register = await prisma.cashRegister.findUnique({
      where: { id: req.params.id },
      include: { sales: { select: { total: true, paymentMethod: true } } }
    });

    if (!register) return res.status(404).json({ error: 'Caja no encontrada' });
    if (register.status === 'CLOSED') return res.status(400).json({ error: 'Esta caja ya está cerrada' });

    if (finalAmount === undefined || finalAmount === null) {
      return res.status(400).json({ error: 'Debe ingresar el monto final de efectivo' });
    }

    const updated = await prisma.cashRegister.update({
      where: { id: req.params.id },
      data: {
        closedById: req.user.id,
        closedAt: new Date(),
        finalAmount: parseInt(finalAmount) || 0,
        closingNotes: closingNotes || null,
        status: 'CLOSED'
      },
      include: {
        openedBy: { select: { name: true } },
        closedBy: { select: { name: true } }
      }
    });

    const totalEfectivo = register.sales.filter(s => s.paymentMethod === 'EFECTIVO').reduce((sum, s) => sum + s.total, 0);
    const expectedCash = register.initialAmount + totalEfectivo;

    res.json({
      id: updated.id,
      status: updated.status,
      closedAt: updated.closedAt.toISOString(),
      closedByName: updated.closedBy?.name,
      finalAmount: updated.finalAmount,
      expectedCash,
      difference: updated.finalAmount - expectedCash
    });
  } catch (err) {
    console.error('Error closing register:', err);
    res.status(500).json({ error: 'Error al cerrar caja' });
  }
});

export default router;
