import { Router } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../config/db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_AVATAR_BYTES = 200 * 1024; // 200KB max

// GET /api/profile — get current user profile
router.get('/', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { role: true }
    });
    if (!user || !user.active) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    res.json({
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      roleName: user.role.name
    });
  } catch (err) {
    console.error('Profile GET error:', err);
    res.status(500).json({ error: 'Error al obtener perfil' });
  }
});

// PUT /api/profile — update name, username, email, password
router.put('/', async (req, res) => {
  try {
    const { name, username, email, currentPassword, newPassword } = req.body;
    const data = {};

    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ error: 'El nombre no puede estar vacío' });
      data.name = name.trim();
    }
    if (username !== undefined) {
      if (!username.trim()) return res.status(400).json({ error: 'El usuario no puede estar vacío' });
      data.username = username.trim();
    }
    if (email !== undefined) {
      if (!EMAIL_REGEX.test(email)) {
        return res.status(400).json({ error: 'El formato de correo electrónico es inválido' });
      }
      data.email = email.trim();
    }

    // Password change requires current password verification
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ error: 'Debe ingresar su contraseña actual para cambiarla' });
      }
      if (typeof newPassword !== 'string' || newPassword.length < 6) {
        return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
      }

      const user = await prisma.user.findUnique({ where: { id: req.user.id } });
      const valid = await bcrypt.compare(currentPassword, user.password);
      if (!valid) {
        return res.status(403).json({ error: 'La contraseña actual es incorrecta' });
      }

      data.password = await bcrypt.hash(newPassword, 10);
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'No se proporcionaron datos para actualizar' });
    }

    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data,
      include: { role: true }
    });

    res.json({
      id: updated.id,
      username: updated.username,
      name: updated.name,
      email: updated.email,
      avatarUrl: updated.avatarUrl,
      roleName: updated.role.name
    });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'El usuario o email ya existe' });
    console.error('Profile PUT error:', err);
    res.status(500).json({ error: 'Error al actualizar perfil' });
  }
});

// PUT /api/profile/avatar — update avatar (base64 data URL)
router.put('/avatar', async (req, res) => {
  try {
    const { avatarUrl } = req.body;

    // Allow clearing the avatar
    if (avatarUrl === null || avatarUrl === '') {
      await prisma.user.update({
        where: { id: req.user.id },
        data: { avatarUrl: null }
      });
      return res.json({ avatarUrl: null });
    }

    // Validate it's a data URL image
    if (!avatarUrl || !avatarUrl.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Formato de imagen inválido' });
    }

    // Check size (base64 is ~33% larger than binary)
    const sizeBytes = Buffer.byteLength(avatarUrl, 'utf8');
    if (sizeBytes > MAX_AVATAR_BYTES) {
      return res.status(400).json({ error: 'La imagen es demasiado grande. Máximo 200KB.' });
    }

    await prisma.user.update({
      where: { id: req.user.id },
      data: { avatarUrl }
    });

    res.json({ avatarUrl });
  } catch (err) {
    console.error('Avatar PUT error:', err);
    res.status(500).json({ error: 'Error al actualizar avatar' });
  }
});

export default router;
