import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../config/db.js';
import { portalAuthMiddleware, JWT_ISSUER, JWT_PORTAL_AUDIENCE } from '../middleware/auth.js';
import { loginRateLimiter } from '../middleware/rateLimiter.js';
import { sendProvisionalPin, normalizePhoneNumber, formatParaguayPhone } from '../services/notificationService.js';

const router = Router();

const CAT_REVERSE = {
  'ADM': 'ADM', 'CHOFER': 'CHOFER'
};

function generatePortalToken(client) {
  return jwt.sign(
    { type: 'portal', clientId: client.id, cedula: client.cedula, name: client.name },
    process.env.JWT_SECRET,
    { expiresIn: '24h', issuer: JWT_ISSUER, audience: JWT_PORTAL_AUDIENCE }
  );
}

// POST /api/portal/check — Verifica si la cédula existe y si ya tiene PIN
router.post('/check', loginRateLimiter, async (req, res) => {
  try {
    const { cedula } = req.body;
    if (!cedula || typeof cedula !== 'string') {
      return res.status(400).json({ error: 'La cédula es obligatoria' });
    }

    const client = await prisma.client.findUnique({ where: { cedula: cedula.trim() } });
    if (!client) {
      return res.status(404).json({ error: 'No se encontró un funcionario con esa cédula' });
    }

    res.json({
      exists: true,
      hasPin: client.pinActive && !!client.pin,
      name: client.name,
      phoneHint: client.phone ? '+595 ...' + normalizePhoneNumber(client.phone).slice(-4) : null,
      emailHint: client.email ? client.email.replace(/(.{2})(.*)(@.*)/, '$1***$3') : null
    });
  } catch (err) {
    console.error('Portal check error:', err);
    res.status(500).json({ error: 'Error al verificar cédula' });
  }
});

// POST /api/portal/register — Registro: crear PIN por primera vez
router.post('/register', loginRateLimiter, async (req, res) => {
  try {
    const { cedula, pin, verificationPhone } = req.body;

    if (!cedula || !pin) {
      return res.status(400).json({ error: 'Cédula y PIN son obligatorios' });
    }

    if (typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
      return res.status(400).json({ error: 'El PIN debe ser exactamente 4 dígitos numéricos' });
    }

    const client = await prisma.client.findUnique({ where: { cedula: cedula.trim() } });
    if (!client) {
      return res.status(404).json({ error: 'Funcionario no encontrado' });
    }

    if (client.pinActive && client.pin) {
      return res.status(400).json({ error: 'Ya tienes un PIN activo. Usa la opción de recuperación si lo olvidaste.' });
    }

    if (!client.phone) {
      return res.status(400).json({ error: 'No tienes un teléfono registrado en el sistema. Contacta al administrador.' });
    }

    const clientPhone = normalizePhoneNumber(client.phone);
    const inputPhone = normalizePhoneNumber(verificationPhone || '');

    if (!inputPhone || clientPhone !== inputPhone) {
      return res.status(400).json({ error: 'El teléfono ingresado no coincide con el registrado en el sistema' });
    }

    const hashedPin = await bcrypt.hash(pin, 10);
    await prisma.client.update({
      where: { id: client.id },
      data: { pin: hashedPin, pinActive: true }
    });

    const token = generatePortalToken(client);

    res.json({
      message: 'PIN creado exitosamente',
      token,
      client: {
        id: client.id,
        name: client.name,
        cedula: client.cedula,
        department: client.department,
        position: client.position,
        category: CAT_REVERSE[client.category] || client.category
      }
    });
  } catch (err) {
    console.error('Portal register error:', err);
    res.status(500).json({ error: 'Error al registrar PIN' });
  }
});

// POST /api/portal/login — Login con cédula + PIN
router.post('/login', loginRateLimiter, async (req, res) => {
  try {
    const { cedula, pin } = req.body;
    if (!cedula || !pin) {
      return res.status(400).json({ error: 'Cédula y PIN son obligatorios' });
    }

    const client = await prisma.client.findUnique({ where: { cedula: cedula.trim() } });

    if (!client || !client.pinActive || !client.pin) {
      return res.status(401).json({ error: 'Cédula o PIN incorrectos' });
    }

    const valid = await bcrypt.compare(pin, client.pin);
    if (!valid) {
      return res.status(401).json({ error: 'Cédula o PIN incorrectos' });
    }

    const token = generatePortalToken(client);

    res.json({
      token,
      requiresPinChange: !!client.mustChangePin,
      client: {
        id: client.id,
        name: client.name,
        cedula: client.cedula,
        department: client.department,
        position: client.position,
        category: CAT_REVERSE[client.category] || client.category
      }
    });
  } catch (err) {
    console.error('Portal login error:', err);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

// POST /api/portal/recover — Recuperar PIN (re-verificar identidad + nuevo PIN)
router.post('/recover', loginRateLimiter, async (req, res) => {
  try {
    const { cedula, pin, verificationPhone } = req.body;

    if (!cedula || !pin || !verificationPhone) {
      return res.status(400).json({ error: 'Cédula, teléfono de verificación y nuevo PIN son obligatorios' });
    }

    if (typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
      return res.status(400).json({ error: 'El PIN debe ser exactamente 4 dígitos numéricos' });
    }

    const client = await prisma.client.findUnique({ where: { cedula: cedula.trim() } });
    if (!client) {
      return res.status(404).json({ error: 'Funcionario no encontrado' });
    }

    if (!client.phone) {
      return res.status(400).json({ error: 'No tienes un teléfono registrado. Contacta al administrador.' });
    }

    const clientPhone = normalizePhoneNumber(client.phone);
    const inputPhone = normalizePhoneNumber(verificationPhone);

    if (clientPhone !== inputPhone) {
      return res.status(400).json({ error: 'El teléfono no coincide con el registrado' });
    }

    const hashedPin = await bcrypt.hash(pin, 10);
    await prisma.client.update({
      where: { id: client.id },
      data: { pin: hashedPin, pinActive: true }
    });

    const token = generatePortalToken(client);

    res.json({
      message: 'PIN restablecido exitosamente',
      token,
      client: {
        id: client.id,
        name: client.name,
        cedula: client.cedula,
        department: client.department,
        position: client.position,
        category: CAT_REVERSE[client.category] || client.category
      }
    });
  } catch (err) {
    console.error('Portal recover error:', err);
    res.status(500).json({ error: 'Error al restablecer PIN' });
  }
});

// POST /api/portal/request-provisional-pin — Genera y envía un PIN provisorio por WhatsApp / SMS
router.post('/request-provisional-pin', loginRateLimiter, async (req, res) => {
  try {
    const { cedula, verificationPhone } = req.body;
    if (!cedula) return res.status(400).json({ error: 'La cédula es obligatoria' });

    const client = await prisma.client.findUnique({ where: { cedula: cedula.trim() } });
    if (!client) return res.status(404).json({ error: 'Funcionario no encontrado' });

    if (!client.phone) {
      return res.status(400).json({ error: 'No tienes un número de teléfono registrado en el sistema. Contacta con administración.' });
    }

    if (verificationPhone) {
      if (normalizePhoneNumber(client.phone) !== normalizePhoneNumber(verificationPhone)) {
        return res.status(400).json({ error: 'El número no coincide con el registrado' });
      }
    }

    // Generar PIN numérico aleatorio de 4 dígitos
    const rawPin = String(Math.floor(1000 + Math.random() * 9000));
    const hashedPin = await bcrypt.hash(rawPin, 10);

    await prisma.client.update({
      where: { id: client.id },
      data: { pin: hashedPin, pinActive: true, mustChangePin: true }
    });

    const notifyResult = await sendProvisionalPin({
      phone: client.phone,
      name: client.name,
      pin: rawPin
    });

    res.json({
      message: 'PIN provisorio generado exitosamente',
      phoneHint: '***' + client.phone.slice(-4),
      waLink: notifyResult.waLink,
      apiSent: notifyResult.apiSent,
      rawPin: process.env.NODE_ENV !== 'production' ? rawPin : undefined // Solo en desarrollo para facilidad de prueba
    });
  } catch (err) {
    console.error('Request provisional pin error:', err);
    res.status(500).json({ error: 'Error al generar PIN provisorio' });
  }
});

// POST /api/portal/change-pin — Cambiar PIN (requerido para provisorio o por voluntad del usuario)
router.post('/change-pin', portalAuthMiddleware, async (req, res) => {
  try {
    const { newPin } = req.body;
    if (!newPin || typeof newPin !== 'string' || !/^\d{4}$/.test(newPin)) {
      return res.status(400).json({ error: 'El nuevo PIN debe ser exactamente 4 dígitos numéricos' });
    }

    const hashedPin = await bcrypt.hash(newPin, 10);
    await prisma.client.update({
      where: { id: req.portalClient.clientId },
      data: { pin: hashedPin, mustChangePin: false }
    });

    res.json({ message: 'PIN actualizado exitosamente' });
  } catch (err) {
    console.error('Change pin error:', err);
    res.status(500).json({ error: 'Error al cambiar PIN' });
  }
});

// GET /api/portal/me — Datos del funcionario autenticado
router.get('/me', portalAuthMiddleware, async (req, res) => {
  try {
    const client = await prisma.client.findUnique({
      where: { id: req.portalClient.clientId }
    });

    if (!client || !client.pinActive) {
      return res.status(404).json({ error: 'Funcionario no encontrado o acceso desactivado' });
    }

    res.json({
      id: client.id,
      name: client.name,
      cedula: client.cedula,
      department: client.department,
      position: client.position,
      category: CAT_REVERSE[client.category] || client.category
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener datos' });
  }
});

// GET /api/portal/sales — Historial de ventas del funcionario (solo las suyas)
router.get('/sales', portalAuthMiddleware, async (req, res) => {
  try {
    const { from, to } = req.query;
    const where = {
      clientId: req.portalClient.clientId,
      status: 'COMPLETED'
    };

    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to + 'T23:59:59.999Z');
    }

    const sales = await prisma.sale.findMany({
      where,
      include: {
        items: { include: { product: true } },
        user: { select: { name: true, username: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 500
    });

    const PAY_REVERSE = { 'EFECTIVO': 'Efectivo', 'TRANSFERENCIA': 'Transferencia', 'NOMINA': 'Vale de comedor' };
    const totalPeriod = sales.reduce((sum, s) => sum + s.total, 0);

    res.json({
      totalSales: sales.length,
      totalSpent: totalPeriod,
      sales: sales.map(s => ({
        id: s.id,
        total: s.total,
        paymentMethod: PAY_REVERSE[s.paymentMethod] || s.paymentMethod,
        date: s.createdAt.toISOString(),
        vendorName: s.user?.name || s.user?.username || 'Cajero',
        items: s.items.map(i => ({
          name: i.product?.name || 'Producto',
          quantity: i.quantity,
          price: i.unitPrice,
          unit: i.product?.unit || 'UNI'
        }))
      }))
    });
  } catch (err) {
    console.error('Portal sales error:', err);
    res.status(500).json({ error: 'Error al obtener historial' });
  }
});

// GET /api/portal/summary — Resumen del mes actual
router.get('/summary', portalAuthMiddleware, async (req, res) => {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const monthlySales = await prisma.sale.findMany({
      where: {
        clientId: req.portalClient.clientId,
        status: 'COMPLETED',
        createdAt: { gte: monthStart }
      },
      orderBy: { createdAt: 'desc' },
      select: { total: true, createdAt: true }
    });

    const totalThisMonth = monthlySales.reduce((sum, s) => sum + s.total, 0);
    const lastPurchase = monthlySales.length > 0 ? monthlySales[0].createdAt.toISOString() : null;

    res.json({
      monthlyTotal: totalThisMonth,
      monthlyCount: monthlySales.length,
      lastPurchase
    });
  } catch (err) {
    console.error('Portal summary error:', err);
    res.status(500).json({ error: 'Error al obtener resumen' });
  }
});

export default router;
