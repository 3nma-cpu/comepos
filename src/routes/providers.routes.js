import { Router } from 'express';
import prisma from '../config/db.js';
import { authMiddleware, requirePermission } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);
router.use(requirePermission('purchases'));

// GET /api/providers
router.get('/', async (req, res) => {
  try {
    const providers = await prisma.provider.findMany({ orderBy: { name: 'asc' } });
    res.json(providers);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener proveedores' });
  }
});

// POST /api/providers
router.post('/', async (req, res) => {
  try {
    const { name, ruc, phone, email, markup } = req.body;
    if (!name) return res.status(400).json({ error: 'Nombre es obligatorio' });
    const data = { name, ruc, phone, email };
    if (markup !== undefined) data.markup = parseFloat(markup) || 40;
    const provider = await prisma.provider.create({ data });
    res.status(201).json(provider);
  } catch (err) {
    res.status(500).json({ error: 'Error al crear proveedor' });
  }
});

// PUT /api/providers/:id
router.put('/:id', async (req, res) => {
  try {
    const { name, ruc, phone, email, markup } = req.body;
    const data = {};
    if (name !== undefined) data.name = name;
    if (ruc !== undefined) data.ruc = ruc;
    if (phone !== undefined) data.phone = phone;
    if (email !== undefined) data.email = email;
    if (markup !== undefined) data.markup = parseFloat(markup) || 40;

    const provider = await prisma.provider.update({ where: { id: req.params.id }, data });
    res.json(provider);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Proveedor no encontrado' });
    res.status(500).json({ error: 'Error al actualizar proveedor' });
  }
});


// DELETE /api/providers/:id
router.delete('/:id', async (req, res) => {
  try {
    await prisma.provider.delete({ where: { id: req.params.id } });
    res.json({ message: 'Proveedor eliminado' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar proveedor' });
  }
});

export default router;
