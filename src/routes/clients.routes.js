import { Router } from 'express';
import prisma from '../config/db.js';
import { authMiddleware, requirePermission, validateUUID } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);
router.use(requirePermission('clients'));

// Category mapping for frontend compatibility
const CATEGORY_MAP = {
  'ADM': 'ADM',
  'CHOFER': 'CHOFER'
};
const CATEGORY_REVERSE = Object.fromEntries(Object.entries(CATEGORY_MAP).map(([k, v]) => [v, k]));

const MAX_SEARCH_LENGTH = 100;

function clientToJSON(c) {
  return { id: c.id, name: c.name, cedula: c.cedula, department: c.department, position: c.position, category: CATEGORY_REVERSE[c.category] || c.category, email: c.email, phone: c.phone };
}

// GET /api/clients
router.get('/', async (req, res) => {
  try {
    let { search, category } = req.query;
    const where = {};
    if (category && CATEGORY_MAP[category]) where.category = CATEGORY_MAP[category];
    if (search) {
      // Sanitizar: truncar para evitar queries excesivamente largas
      search = String(search).slice(0, MAX_SEARCH_LENGTH);
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { cedula: { contains: search } }
      ];
    }
    const clients = await prisma.client.findMany({ where, orderBy: { name: 'asc' } });
    res.json(clients.map(clientToJSON));
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener clientes' });
  }
});

// GET /api/clients/:id
router.get('/:id', validateUUID, async (req, res) => {
  try {
    const client = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json(clientToJSON(client));
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener cliente' });
  }
});

// GET /api/clients/:id/history
router.get('/:id/history', validateUUID, async (req, res) => {
  try {
    const sales = await prisma.sale.findMany({
      where: { clientId: req.params.id },
      include: {
        items: { include: { product: true } },
        user: { select: { id: true, name: true, username: true } },
        cancelledBy: { select: { id: true, name: true, username: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    const completedSales = sales.filter(s => s.status === 'COMPLETED');
    const totalSpent = completedSales.reduce((s, sale) => s + sale.total, 0);
    res.json({
      totalSales: completedSales.length,
      totalSpent,
      sales: sales.map(s => ({
        id: s.id,
        total: s.total,
        paymentMethod: s.paymentMethod.toLowerCase(),
        date: s.createdAt.toISOString(),
        status: s.status,
        userName: s.user?.name || s.user?.username || 'Cajero',
        cancelledAt: s.cancelledAt ? s.cancelledAt.toISOString() : null,
        cancelledByName: s.cancelledBy?.name || null,
        cancellationReason: s.cancellationReason || null,
        items: s.items.map(i => ({ name: i.product.name, quantity: i.quantity, price: i.unitPrice }))
      }))
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener historial' });
  }
});

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/clients
router.post('/', async (req, res) => {
  try {
    const { name, cedula, department, position, category, email, phone } = req.body;
    if (!name || !cedula || !category) return res.status(400).json({ error: 'Nombre, cédula y categoría son obligatorios' });
    if (email && !EMAIL_REGEX.test(email)) {
      return res.status(400).json({ error: 'El formato de correo electrónico es inválido' });
    }
    const dbCategory = CATEGORY_MAP[category] || category;
    const client = await prisma.client.create({
      data: { name, cedula, department, position, category: dbCategory, email, phone }
    });
    res.status(201).json(clientToJSON(client));
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'La cédula ya está registrada' });
    res.status(500).json({ error: 'Error al crear cliente' });
  }
});

// PUT /api/clients/:id
router.put('/:id', validateUUID, async (req, res) => {
  try {
    const { name, cedula, department, position, category, email, phone } = req.body;
    const data = {};
    if (name !== undefined) data.name = name;
    if (cedula !== undefined) data.cedula = cedula;
    if (department !== undefined) data.department = department;
    if (position !== undefined) data.position = position;
    if (category !== undefined) data.category = CATEGORY_MAP[category] || category;
    if (email !== undefined) {
      if (email && !EMAIL_REGEX.test(email)) {
        return res.status(400).json({ error: 'El formato de correo electrónico es inválido' });
      }
      data.email = email || null;
    }
    if (phone !== undefined) data.phone = phone;


    const client = await prisma.client.update({ where: { id: req.params.id }, data });
    res.json(clientToJSON(client));
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Cliente no encontrado' });
    res.status(500).json({ error: 'Error al actualizar cliente' });
  }
});

// DELETE /api/clients/:id
router.delete('/:id', validateUUID, async (req, res) => {
  try {
    await prisma.client.delete({ where: { id: req.params.id } });
    res.json({ message: 'Cliente eliminado' });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Cliente no encontrado' });
    res.status(500).json({ error: 'Error al eliminar cliente' });
  }
});

export default router;
