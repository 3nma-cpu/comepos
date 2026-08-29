import { Router } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../config/db.js';
import { authMiddleware, requirePermission, validateUUID } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);
router.use(requirePermission('users'));

// GET /api/users
router.get('/', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      include: { role: true },
      orderBy: { name: 'asc' }
    });
    res.json(users.map(u => ({
      id: u.id, username: u.username, name: u.name, email: u.email,
      roleId: u.roleId, roleName: u.role.name, active: u.active
    })));
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

// POST /api/users
router.post('/', async (req, res) => {
  try {
    const { username, password, name, email, roleId } = req.body;
    if (!username || !password || !name || !email || !roleId) {
      return res.status(400).json({ error: 'Todos los campos son obligatorios' });
    }
    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { username, password: hashed, name, email, roleId },
      include: { role: true }
    });
    res.status(201).json({ id: user.id, username: user.username, name: user.name, email: user.email, roleId: user.roleId, roleName: user.role.name, active: user.active });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'El usuario o email ya existe' });
    res.status(500).json({ error: 'Error al crear usuario' });
  }
});

// PUT /api/users/:id
router.put('/:id', validateUUID, async (req, res) => {
  try {
    const { name, username, email, password, roleId, active } = req.body;
    const targetId = req.params.id;

    // Prevenir auto-escalación: un usuario no puede cambiar su propio rol ni desactivarse
    if (targetId === req.user.id) {
      if (roleId !== undefined) {
        return res.status(403).json({ error: 'No podés cambiar tu propio rol' });
      }
      if (active === false || active === 'false') {
        return res.status(403).json({ error: 'No podés desactivar tu propia cuenta' });
      }
    }

    const data = {};
    if (name !== undefined) data.name = name;
    if (username !== undefined) data.username = username;
    if (email !== undefined) data.email = email;
    if (roleId !== undefined) data.roleId = roleId;
    if (active !== undefined) data.active = active;
    if (password) data.password = await bcrypt.hash(password, 10);

    const user = await prisma.user.update({
      where: { id: targetId },
      data,
      include: { role: true }
    });
    res.json({ id: user.id, username: user.username, name: user.name, email: user.email, roleId: user.roleId, roleName: user.role.name, active: user.active });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Usuario no encontrado' });
    if (err.code === 'P2002') return res.status(409).json({ error: 'El usuario o email ya existe' });
    res.status(500).json({ error: 'Error al actualizar usuario' });
  }
});

// DELETE /api/users/:id — Soft delete para preservar integridad del historial
router.delete('/:id', validateUUID, async (req, res) => {
  try {
    const targetId = req.params.id;

    // Prevenir auto-eliminación
    if (targetId === req.user.id) {
      return res.status(403).json({ error: 'No podés eliminar tu propia cuenta' });
    }

    await prisma.user.update({
      where: { id: targetId },
      data: { active: false }
    });
    res.json({ message: 'Usuario desactivado' });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Usuario no encontrado' });
    res.status(500).json({ error: 'Error al eliminar usuario' });
  }
});

export default router;
