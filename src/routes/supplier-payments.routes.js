import { Router } from 'express';
import prisma from '../config/db.js';
import { authMiddleware, requirePermission } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);
router.use(requirePermission('supplier-payments'));

// ============================================
// Formas de pago
// ============================================

// GET /api/supplier-payments/formas-pago
router.get('/formas-pago', async (req, res) => {
  try {
    let formas = await prisma.formaPago.findMany({ orderBy: { nombre: 'asc' } });
    // Auto-seed if empty
    if (formas.length === 0) {
      const defaults = ['Efectivo', 'Transferencia', 'Cheque', 'Tarjeta'];
      await prisma.formaPago.createMany({ data: defaults.map(n => ({ nombre: n })) });
      formas = await prisma.formaPago.findMany({ orderBy: { nombre: 'asc' } });
    }
    res.json(formas);
  } catch (err) {
    console.error('Error formas pago:', err);
    res.status(500).json({ error: 'Error al obtener formas de pago' });
  }
});

// POST /api/supplier-payments/formas-pago
router.post('/formas-pago', async (req, res) => {
  try {
    const { nombre } = req.body;
    if (!nombre?.trim()) return res.status(400).json({ error: 'Nombre es obligatorio' });
    const forma = await prisma.formaPago.create({ data: { nombre: nombre.trim() } });
    res.status(201).json(forma);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Ya existe esa forma de pago' });
    res.status(500).json({ error: 'Error al crear forma de pago' });
  }
});

// ============================================
// Proveedores (pago)
// ============================================

// GET /api/supplier-payments/proveedores
router.get('/proveedores', async (req, res) => {
  try {
    const proveedores = await prisma.proveedorPago.findMany({
      orderBy: { nombre: 'asc' },
      include: { _count: { select: { pagos: true } } }
    });
    res.json(proveedores);
  } catch (err) {
    console.error('Error proveedores:', err);
    res.status(500).json({ error: 'Error al obtener proveedores' });
  }
});

// POST /api/supplier-payments/proveedores
router.post('/proveedores', async (req, res) => {
  try {
    const { nombre, ruc } = req.body;
    if (!nombre?.trim()) return res.status(400).json({ error: 'Nombre es obligatorio' });
    const proveedor = await prisma.proveedorPago.create({
      data: { nombre: nombre.trim(), ruc: ruc?.trim() || null }
    });
    res.status(201).json(proveedor);
  } catch (err) {
    res.status(500).json({ error: 'Error al crear proveedor' });
  }
});

// PUT /api/supplier-payments/proveedores/:id
router.put('/proveedores/:id', async (req, res) => {
  try {
    const { nombre, ruc, activo } = req.body;
    const data = {};
    if (nombre !== undefined) data.nombre = nombre.trim();
    if (ruc !== undefined) data.ruc = ruc?.trim() || null;
    if (activo !== undefined) data.activo = activo;
    const proveedor = await prisma.proveedorPago.update({
      where: { id: req.params.id },
      data
    });
    res.json(proveedor);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Proveedor no encontrado' });
    res.status(500).json({ error: 'Error al actualizar proveedor' });
  }
});

// DELETE /api/supplier-payments/proveedores/:id
router.delete('/proveedores/:id', async (req, res) => {
  try {
    const pagosCount = await prisma.pagoProveedor.count({ where: { proveedorId: req.params.id } });
    if (pagosCount > 0) {
      return res.status(400).json({
        error: `No se puede eliminar este proveedor porque tiene ${pagosCount} pago(s) registrado(s). Puede desactivarlo en su lugar.`
      });
    }
    await prisma.proveedorPago.delete({ where: { id: req.params.id } });
    res.json({ message: 'Proveedor eliminado correctamente' });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Proveedor no encontrado' });
    res.status(500).json({ error: 'Error al eliminar proveedor' });
  }
});

// ============================================
// Pagos a proveedores
// ============================================

// GET /api/supplier-payments/pagos
router.get('/pagos', async (req, res) => {
  try {
    const pagos = await prisma.pagoProveedor.findMany({
      include: {
        proveedor: { select: { id: true, nombre: true } },
        formaPago: { select: { id: true, nombre: true } }
      },
      orderBy: [{ mesPago: 'desc' }, { fechaPago: 'desc' }],
      take: 300
    });
    res.json(pagos.map(p => ({
      id: p.id,
      proveedorId: p.proveedorId,
      proveedorNombre: p.proveedor.nombre,
      formaPagoId: p.formaPagoId,
      formaPagoNombre: p.formaPago.nombre,
      mesPago: p.mesPago,
      fechaPago: p.fechaPago.toISOString(),
      monto: parseFloat(p.monto),
      observacion: p.observacion,
      createdAt: p.createdAt.toISOString()
    })));
  } catch (err) {
    console.error('Error pagos:', err);
    res.status(500).json({ error: 'Error al obtener pagos' });
  }
});

// POST /api/supplier-payments/pagos
router.post('/pagos', async (req, res) => {
  try {
    const { proveedorId, formaPagoId, mesPago, fechaPago, monto, observacion } = req.body;
    if (!proveedorId || !formaPagoId || !fechaPago) {
      return res.status(400).json({ error: 'Proveedor, forma de pago y fecha son obligatorios' });
    }
    const montoNum = parseFloat(monto);
    if (!montoNum || montoNum <= 0) {
      return res.status(400).json({ error: 'Monto debe ser mayor a 0' });
    }

    // Default mesPago to YYYY-MM of fechaPago if not provided
    const fechaStr = typeof fechaPago === 'string' ? fechaPago : new Date(fechaPago).toISOString();
    const finalMesPago = mesPago && /^\d{4}-\d{2}$/.test(mesPago) ? mesPago : fechaStr.substring(0, 7);

    const pago = await prisma.pagoProveedor.create({
      data: {
        proveedorId,
        formaPagoId: parseInt(formaPagoId),
        mesPago: finalMesPago,
        fechaPago: new Date(fechaPago),
        monto: montoNum,
        observacion: observacion?.trim() || null
      },
      include: {
        proveedor: { select: { nombre: true } },
        formaPago: { select: { nombre: true } }
      }
    });
    res.status(201).json({
      id: pago.id,
      proveedorId: pago.proveedorId,
      proveedorNombre: pago.proveedor.nombre,
      formaPagoId: pago.formaPagoId,
      formaPagoNombre: pago.formaPago.nombre,
      mesPago: pago.mesPago,
      fechaPago: pago.fechaPago.toISOString(),
      monto: parseFloat(pago.monto),
      observacion: pago.observacion,
      createdAt: pago.createdAt.toISOString()
    });
  } catch (err) {
    console.error('Error crear pago:', err);
    res.status(500).json({ error: 'Error al registrar pago' });
  }
});

// PUT /api/supplier-payments/pagos/:id
router.put('/pagos/:id', async (req, res) => {
  try {
    const { proveedorId, formaPagoId, mesPago, fechaPago, monto, observacion } = req.body;
    const data = {};
    if (proveedorId) data.proveedorId = proveedorId;
    if (formaPagoId) data.formaPagoId = parseInt(formaPagoId);
    if (mesPago && /^\d{4}-\d{2}$/.test(mesPago)) data.mesPago = mesPago;
    if (fechaPago) data.fechaPago = new Date(fechaPago);
    if (monto !== undefined) {
      const m = parseFloat(monto);
      if (m <= 0) return res.status(400).json({ error: 'Monto debe ser mayor a 0' });
      data.monto = m;
    }
    if (observacion !== undefined) data.observacion = observacion?.trim() || null;

    const pago = await prisma.pagoProveedor.update({
      where: { id: req.params.id },
      data,
      include: {
        proveedor: { select: { nombre: true } },
        formaPago: { select: { nombre: true } }
      }
    });
    res.json({
      id: pago.id,
      proveedorId: pago.proveedorId,
      proveedorNombre: pago.proveedor.nombre,
      formaPagoId: pago.formaPagoId,
      formaPagoNombre: pago.formaPago.nombre,
      mesPago: pago.mesPago,
      fechaPago: pago.fechaPago.toISOString(),
      monto: parseFloat(pago.monto),
      observacion: pago.observacion,
      createdAt: pago.createdAt.toISOString()
    });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Pago no encontrado' });
    res.status(500).json({ error: 'Error al actualizar pago' });
  }
});

// DELETE /api/supplier-payments/pagos/:id
router.delete('/pagos/:id', async (req, res) => {
  try {
    await prisma.pagoProveedor.delete({ where: { id: req.params.id } });
    res.json({ message: 'Pago eliminado' });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Pago no encontrado' });
    res.status(500).json({ error: 'Error al eliminar pago' });
  }
});

// ============================================
// Reporte comparativo mensual (agrupado por mesPago)
// ============================================

// GET /api/supplier-payments/reporte?mes=2026-08 o ?mesDesde=2026-01&mesHasta=2026-08 o ?desde=2026-01-01&hasta=2026-08-31
router.get('/reporte', async (req, res) => {
  try {
    let { desde, hasta, mes, mesDesde, mesHasta, proveedorId, formaPagoId } = req.query;

    const where = {};

    if (mes) {
      where.mesPago = mes;
    } else if (mesDesde && mesHasta) {
      where.mesPago = {
        gte: mesDesde,
        lte: mesHasta
      };
    } else if (desde && hasta) {
      // If dates provided, filter by mesPago range derived or fechaPago
      const mStart = desde.substring(0, 7);
      const mEnd = hasta.substring(0, 7);
      where.mesPago = {
        gte: mStart,
        lte: mEnd
      };
    }

    if (proveedorId) where.proveedorId = proveedorId;
    if (formaPagoId) where.formaPagoId = parseInt(formaPagoId);

    const pagos = await prisma.pagoProveedor.findMany({
      where,
      include: {
        proveedor: { select: { id: true, nombre: true } },
        formaPago: { select: { id: true, nombre: true } }
      },
      orderBy: [{ mesPago: 'asc' }, { fechaPago: 'asc' }]
    });

    // Build pivot: grouped by p.mesPago (mes al que corresponde el pago)
    const pivot = {};
    const allMonths = new Set();

    for (const p of pagos) {
      const mesKey = p.mesPago || (p.fechaPago ? new Date(p.fechaPago).toISOString().substring(0, 7) : 'Sin Mes');
      allMonths.add(mesKey);

      if (!pivot[p.proveedorId]) {
        pivot[p.proveedorId] = {
          proveedorId: p.proveedorId,
          proveedor: p.proveedor.nombre,
          meses: {},
          total: 0
        };
      }
      const entry = pivot[p.proveedorId];
      entry.meses[mesKey] = (entry.meses[mesKey] || 0) + parseFloat(p.monto);
      entry.total += parseFloat(p.monto);
    }

    // Sort months chronologically
    const mesesOrdenados = [...allMonths].sort();

    // Convert to array and round values
    const data = Object.values(pivot).map(row => {
      const meses = {};
      for (const m of mesesOrdenados) {
        meses[m] = Math.round((row.meses[m] || 0) * 100) / 100;
      }
      return {
        proveedorId: row.proveedorId,
        proveedor: row.proveedor,
        meses,
        total: Math.round(row.total * 100) / 100
      };
    }).sort((a, b) => a.proveedor.localeCompare(b.proveedor));

    res.json({ meses: mesesOrdenados, data });
  } catch (err) {
    console.error('Error reporte:', err);
    res.status(500).json({ error: 'Error al generar reporte' });
  }
});

export default router;
