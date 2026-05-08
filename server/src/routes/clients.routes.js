import { Router } from 'express';
import prisma from '../config/db.js';
import { authMiddleware, requirePermission } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);
router.use(requirePermission('clients'));

// Category mapping for frontend compatibility
const CATEGORY_MAP = {
  'Directivo': 'DIRECTIVO', 'Gerente': 'GERENTE', 'Jefe de Área': 'JEFE_DE_AREA',
  'Analista': 'ANALISTA', 'Asistente': 'ASISTENTE', 'Operario': 'OPERARIO',
  'Practicante': 'PRACTICANTE', 'Contratista': 'CONTRATISTA'
};
const CATEGORY_REVERSE = Object.fromEntries(Object.entries(CATEGORY_MAP).map(([k, v]) => [v, k]));

function clientToJSON(c) {
  return { id: c.id, name: c.name, cedula: c.cedula, department: c.department, position: c.position, category: CATEGORY_REVERSE[c.category] || c.category, email: c.email, phone: c.phone };
}

// GET /api/clients
router.get('/', async (req, res) => {
  try {
    const { search, category } = req.query;
    const where = {};
    if (category && CATEGORY_MAP[category]) where.category = CATEGORY_MAP[category];
    if (search) {
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
router.get('/:id', async (req, res) => {
  try {
    const client = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json(clientToJSON(client));
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener cliente' });
  }
});

// GET /api/clients/:id/history
router.get('/:id/history', async (req, res) => {
  try {
    const sales = await prisma.sale.findMany({
      where: { clientId: req.params.id },
      include: { items: { include: { product: true } } },
      orderBy: { createdAt: 'desc' }
    });
    const totalSpent = sales.reduce((s, sale) => s + sale.total, 0);
    res.json({
      totalSales: sales.length,
      totalSpent,
      sales: sales.map(s => ({
        id: s.id, total: s.total, paymentMethod: s.paymentMethod.toLowerCase(),
        date: s.createdAt.toISOString(),
        items: s.items.map(i => ({ name: i.product.name, quantity: i.quantity, price: i.unitPrice }))
      }))
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener historial' });
  }
});

// POST /api/clients
router.post('/', async (req, res) => {
  try {
    const { name, cedula, department, position, category, email, phone } = req.body;
    if (!name || !cedula || !category) return res.status(400).json({ error: 'Nombre, cédula y categoría son obligatorios' });
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
router.put('/:id', async (req, res) => {
  try {
    const { name, cedula, department, position, category, email, phone } = req.body;
    const data = {};
    if (name !== undefined) data.name = name;
    if (cedula !== undefined) data.cedula = cedula;
    if (department !== undefined) data.department = department;
    if (position !== undefined) data.position = position;
    if (category !== undefined) data.category = CATEGORY_MAP[category] || category;
    if (email !== undefined) data.email = email;
    if (phone !== undefined) data.phone = phone;

    const client = await prisma.client.update({ where: { id: req.params.id }, data });
    res.json(clientToJSON(client));
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Cliente no encontrado' });
    res.status(500).json({ error: 'Error al actualizar cliente' });
  }
});

// DELETE /api/clients/:id
router.delete('/:id', async (req, res) => {
  try {
    await prisma.client.delete({ where: { id: req.params.id } });
    res.json({ message: 'Cliente eliminado' });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Cliente no encontrado' });
    res.status(500).json({ error: 'Error al eliminar cliente' });
  }
});

export default router;
