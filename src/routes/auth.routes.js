import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../config/db.js';
import { authMiddleware, JWT_ISSUER, JWT_AUDIENCE } from '../middleware/auth.js';
import { loginRateLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// POST /api/auth/login
router.post('/login', loginRateLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    }

    const user = await prisma.user.findUnique({
      where: { username },
      include: { role: { include: { permissions: true } } }
    });

    if (!user) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    if (user.blocked || (user.failedAttempts || 0) >= 3) {
      return res.status(403).json({
        error: 'Esta cuenta ha sido bloqueada por superar el límite de intentos fallidos. Por favor, comuníquese con el administrador.'
      });
    }

    if (!user.active) {
      return res.status(403).json({
        error: 'Esta cuenta está inactiva. Por favor, comuníquese con el administrador.'
      });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      const newAttempts = (user.failedAttempts || 0) + 1;
      const isBlocked = newAttempts >= 3;

      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedAttempts: newAttempts,
          blocked: isBlocked
        }
      });

      if (isBlocked) {
        return res.status(403).json({
          error: 'Ha superado el límite de 3 intentos fallidos. Su cuenta ha sido bloqueada. Por favor, comuníquese con el administrador.'
        });
      }

      const remaining = 3 - newAttempts;
      return res.status(401).json({
        error: `Contraseña incorrecta. Le queda${remaining === 1 ? '' : 'n'} ${remaining} intento${remaining === 1 ? '' : 's'} antes del bloqueo.`
      });
    }

    // Login exitoso: si tenía intentos fallidos acumulados, resetear a 0
    if (user.failedAttempts > 0 || user.blocked) {
      await prisma.user.update({
        where: { id: user.id },
        data: { failedAttempts: 0, blocked: false }
      });
    }

    const permissions = user.role.permissions.map(p => p.module);
    const token = jwt.sign(
      { id: user.id, username: user.username, name: user.name, roleId: user.roleId, roleName: user.role.name, permissions },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRES_IN || '24h',
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE
      }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl || null,
        roleId: user.roleId,
        roleName: user.role.name,
        permissions
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { role: { include: { permissions: true } } }
    });
    if (!user || !user.active) return res.status(404).json({ error: 'Usuario no encontrado o inactivo' });

    const permissions = user.role.permissions.map(p => p.module);
    const token = jwt.sign(
      { id: user.id, username: user.username, name: user.name, roleId: user.roleId, roleName: user.role.name, permissions },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRES_IN || '24h',
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE
      }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl || null,
        roleId: user.roleId,
        roleName: user.role.name,
        permissions
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
