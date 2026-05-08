import { Router } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../config/db.js';
import { authMiddleware, requirePermission } from '../middleware/auth.js';

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
router.put('/:id', async (req, res) => {
  try {
    const { name, username, email, password, roleId, active } = req.body;
    const data = {};
    if (name !== undefined) data.name = name;
    if (username !== undefined) data.username = username;
    if (email !== undefined) data.email = email;
    if (roleId !== undefined) data.roleId = roleId;
    if (active !== undefined) data.active = active;
    if (password) data.password = await bcrypt.hash(password, 10);

    const user = await prisma.user.update({
      where: { id: req.params.id },
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

// DELETE /api/users/:id
router.delete('/:id', async (req, res) => {
  try {
    await prisma.user.delete({ where: { id: req.params.id } });
    res.json({ message: 'Usuario eliminado' });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Usuario no encontrado' });
    res.status(500).json({ error: 'Error al eliminar usuario' });
  }
});

export default router;
