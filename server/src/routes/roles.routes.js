import { Router } from 'express';
import prisma from '../config/db.js';
import { authMiddleware, requirePermission } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);
router.use(requirePermission('roles'));

// GET /api/roles
router.get('/', async (req, res) => {
  try {
    const roles = await prisma.role.findMany({
      include: { permissions: true },
      orderBy: { name: 'asc' }
    });
    res.json(roles.map(r => ({
      id: r.id, name: r.name, description: r.description, protected: r.protected,
      permissions: r.permissions.map(p => p.module)
    })));
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener roles' });
  }
});

// POST /api/roles
router.post('/', async (req, res) => {
  try {
    const { name, description, permissions } = req.body;
    if (!name || !permissions?.length) {
      return res.status(400).json({ error: 'Nombre y permisos son obligatorios' });
    }
    const role = await prisma.role.create({
      data: {
        name, description,
        permissions: { create: permissions.map(module => ({ module })) }
      },
      include: { permissions: true }
    });
    res.status(201).json({ id: role.id, name: role.name, description: role.description, protected: role.protected, permissions: role.permissions.map(p => p.module) });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'El rol ya existe' });
    res.status(500).json({ error: 'Error al crear rol' });
  }
});

// PUT /api/roles/:id
router.put('/:id', async (req, res) => {
  try {
    const { name, description, permissions } = req.body;
    const existing = await prisma.role.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Rol no encontrado' });

    // Delete old permissions and create new ones
    await prisma.rolePermission.deleteMany({ where: { roleId: req.params.id } });
    const role = await prisma.role.update({
      where: { id: req.params.id },
      data: {
        name: existing.protected ? existing.name : (name || existing.name),
        description: description ?? existing.description,
        permissions: permissions ? { create: permissions.map(module => ({ module })) } : undefined
      },
      include: { permissions: true }
    });
    res.json({ id: role.id, name: role.name, description: role.description, protected: role.protected, permissions: role.permissions.map(p => p.module) });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar rol' });
  }
});

// DELETE /api/roles/:id
router.delete('/:id', async (req, res) => {
  try {
    const role = await prisma.role.findUnique({ where: { id: req.params.id } });
    if (!role) return res.status(404).json({ error: 'Rol no encontrado' });
    if (role.protected) return res.status(403).json({ error: 'No se puede eliminar un rol protegido' });
    await prisma.role.delete({ where: { id: req.params.id } });
    res.json({ message: 'Rol eliminado' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar rol' });
  }
});

export default router;
