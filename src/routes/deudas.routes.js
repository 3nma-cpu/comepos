import { Router } from 'express';
import prisma from '../config/db.js';
import { authMiddleware, requirePermission, isValidUUID } from '../middleware/auth.js';

const router = Router();

// Middleware: aceptar token desde query param (para abrir tarjeta PDF en nueva pestaña)
router.use((req, res, next) => {
  if (req.query.token && !req.headers.authorization) {
    req.headers.authorization = `Bearer ${req.query.token}`;
  }
  next();
});

router.use(authMiddleware);
router.use(requirePermission('deudas'));

// ============================================
// Helpers
// ============================================

function calcSaldo(deuda) {
  const descontado = (deuda.descuentos || [])
    .filter(d => !d.anulado)
    .reduce((sum, d) => sum + d.monto, 0);
  return deuda.montoOriginal - descontado;
}

function formatGs(n) {
  return Number(n).toLocaleString('es-PY');
}

function formatFecha(dateStr) {
  const d = new Date(dateStr);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
}

// ============================================
// MOTIVOS DE DEUDA (Catálogo)
// ============================================

// GET /api/deudas/motivos — Listar todos
router.get('/motivos', async (req, res) => {
  try {
    let motivos = await prisma.motivoDeuda.findMany({
      orderBy: { nombre: 'asc' },
      include: { _count: { select: { deudas: true } } }
    });
    // Auto-seed si está vacío
    if (motivos.length === 0) {
      await prisma.motivoDeuda.createMany({
        data: [
          { nombre: 'Préstamo en efectivo', porcentajeInteres: 50 },
          { nombre: 'Electrodoméstico', porcentajeInteres: 40 },
          { nombre: 'Uniformes', porcentajeInteres: 0 }
        ]
      });
      motivos = await prisma.motivoDeuda.findMany({
        orderBy: { nombre: 'asc' },
        include: { _count: { select: { deudas: true } } }
      });
    }
    res.json(motivos);
  } catch (err) {
    console.error('Error motivos:', err);
    res.status(500).json({ error: 'Error al obtener motivos de deuda' });
  }
});

// POST /api/deudas/motivos — Crear motivo
router.post('/motivos', async (req, res) => {
  try {
    const { nombre, porcentajeInteres } = req.body;
    if (!nombre?.trim()) return res.status(400).json({ error: 'Nombre es obligatorio' });
    const pct = (porcentajeInteres !== undefined && porcentajeInteres !== null && !isNaN(Number(porcentajeInteres)))
      ? Math.max(0, Number(porcentajeInteres))
      : 0;
    const motivo = await prisma.motivoDeuda.create({
      data: {
        nombre: nombre.trim(),
        porcentajeInteres: pct
      }
    });
    res.status(201).json(motivo);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Ya existe un motivo con ese nombre' });
    res.status(500).json({ error: 'Error al crear motivo' });
  }
});

// PUT /api/deudas/motivos/:id — Editar motivo
router.put('/motivos/:id', async (req, res) => {
  try {
    const { nombre, porcentajeInteres, activo } = req.body;
    const data = {};
    if (nombre !== undefined) data.nombre = nombre.trim();
    if (porcentajeInteres !== undefined && porcentajeInteres !== null && !isNaN(Number(porcentajeInteres))) {
      data.porcentajeInteres = Math.max(0, Number(porcentajeInteres));
    }
    if (activo !== undefined) data.activo = activo;
    const motivo = await prisma.motivoDeuda.update({
      where: { id: req.params.id },
      data,
      include: { _count: { select: { deudas: true } } }
    });
    res.json(motivo);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Motivo no encontrado' });
    if (err.code === 'P2002') return res.status(409).json({ error: 'Ya existe un motivo con ese nombre' });
    res.status(500).json({ error: 'Error al actualizar motivo' });
  }
});

// ============================================
// DEUDAS
// ============================================

// POST /api/deudas — Crear deuda con plan de descuento
router.post('/', async (req, res) => {
  try {
    const { funcionarioId, motivoId, descripcion, fecha, montoBruto, porcentajeInteres, montoInteres, montoOriginal, plan } = req.body;

    // Validaciones
    if (!funcionarioId) return res.status(400).json({ error: 'Funcionario es obligatorio' });
    if (!motivoId) return res.status(400).json({ error: 'Motivo es obligatorio' });
    if (!descripcion?.trim()) return res.status(400).json({ error: 'Descripción es obligatoria' });
    if (!fecha) return res.status(400).json({ error: 'Fecha es obligatoria' });

    // Verificar existencia
    const funcionario = await prisma.client.findUnique({ where: { id: funcionarioId } });
    if (!funcionario) return res.status(404).json({ error: 'Funcionario no encontrado' });

    const motivo = await prisma.motivoDeuda.findUnique({ where: { id: motivoId } });
    if (!motivo) return res.status(404).json({ error: 'Motivo no encontrado' });
    if (!motivo.activo) return res.status(400).json({ error: 'El motivo seleccionado está desactivado' });

    // Cálculo y normalización de montos
    let finalBruto;
    let finalPct;
    let finalInteres;
    let finalTotal;

    if (montoBruto !== undefined && montoBruto !== null && !isNaN(parseInt(montoBruto))) {
      finalBruto = parseInt(montoBruto);
      finalPct = (porcentajeInteres !== undefined && porcentajeInteres !== null && !isNaN(Number(porcentajeInteres)))
        ? Math.max(0, Number(porcentajeInteres))
        : (motivo.porcentajeInteres || 0);

      const interesCalculado = Math.round(finalBruto * (finalPct / 100));
      finalInteres = (montoInteres !== undefined && montoInteres !== null && !isNaN(parseInt(montoInteres)))
        ? parseInt(montoInteres)
        : interesCalculado;

      finalTotal = (montoOriginal !== undefined && montoOriginal !== null && !isNaN(parseInt(montoOriginal)))
        ? parseInt(montoOriginal)
        : (finalBruto + finalInteres);
    } else if (montoOriginal !== undefined && montoOriginal !== null && !isNaN(parseInt(montoOriginal))) {
      finalTotal = parseInt(montoOriginal);
      finalBruto = finalTotal;
      finalPct = 0;
      finalInteres = 0;
    } else {
      return res.status(400).json({ error: 'Monto debe ser mayor a 0' });
    }

    if (finalBruto <= 0 || finalTotal <= 0) {
      return res.status(400).json({ error: 'Los montos deben ser mayores a 0' });
    }

    const deudaData = {
      funcionarioId,
      motivoId,
      descripcion: descripcion.trim(),
      fecha: new Date(fecha),
      montoBruto: finalBruto,
      porcentajeInteres: finalPct,
      montoInteres: finalInteres,
      montoOriginal: finalTotal,
      createdBy: req.user?.id || req.user?.userId || 'sistema'
    };

    // Crear deuda con plan (si se proporcionó)
    if (plan && plan.montoPorDescuento && plan.frecuencia && plan.fechaInicio) {
      if (plan.montoPorDescuento <= 0) return res.status(400).json({ error: 'Monto por descuento debe ser mayor a 0' });
      if (!['SEMANAL', 'QUINCENAL'].includes(plan.frecuencia)) return res.status(400).json({ error: 'Frecuencia inválida' });

      const deuda = await prisma.deuda.create({
        data: {
          ...deudaData,
          planDescuento: {
            create: {
              montoPorDescuento: plan.montoPorDescuento,
              frecuencia: plan.frecuencia,
              fechaInicio: new Date(plan.fechaInicio)
            }
          }
        },
        include: { motivo: true, funcionario: true, planDescuento: true, descuentos: true }
      });
      return res.status(201).json(deuda);
    }

    const deuda = await prisma.deuda.create({
      data: deudaData,
      include: { motivo: true, funcionario: true, planDescuento: true, descuentos: true }
    });
    res.status(201).json(deuda);
  } catch (err) {
    console.error('Error crear deuda:', err);
    res.status(500).json({ error: 'Error al crear deuda' });
  }
});

// GET /api/deudas/funcionario/:id — Deudas de un funcionario
router.get('/funcionario/:id', async (req, res) => {
  try {
    const funcionario = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!funcionario) return res.status(404).json({ error: 'Funcionario no encontrado' });

    // Excluir deudas anuladas para que no aparezcan al consultar un cliente
    const deudas = await prisma.deuda.findMany({
      where: {
        funcionarioId: req.params.id,
        estado: { not: 'ANULADA' }
      },
      include: {
        motivo: true,
        planDescuento: true,
        descuentos: { orderBy: { fecha: 'asc' } }
      },
      orderBy: { fecha: 'asc' }
    });

    // Calcular saldos y valores brutos / intereses
    const deudasConSaldo = deudas.map(d => {
      const montoBruto = d.montoBruto ?? d.montoOriginal;
      const porcentajeInteres = d.porcentajeInteres ?? 0;
      const montoInteres = d.montoInteres ?? Math.max(0, d.montoOriginal - montoBruto);
      const totalDescontado = d.descuentos.filter(desc => !desc.anulado).reduce((s, desc) => s + desc.monto, 0);
      const saldo = d.estado === 'SALDADA' ? 0 : Math.max(0, calcSaldo(d));
      return {
        ...d,
        montoBruto,
        porcentajeInteres,
        montoInteres,
        saldo,
        totalDescontado
      };
    });

    res.json({
      funcionario,
      deudas: deudasConSaldo,
      totalBruto: deudasConSaldo.reduce((s, d) => s + d.montoBruto, 0),
      totalUtilidad: deudasConSaldo.reduce((s, d) => s + d.montoInteres, 0),
      totalDeuda: deudasConSaldo.reduce((s, d) => s + d.montoOriginal, 0),
      totalDescontado: deudasConSaldo.reduce((s, d) => s + d.totalDescontado, 0),
      // Solo las deudas activas suman a la deuda actual pendiente (las pagadas no suman)
      saldoTotal: deudasConSaldo.filter(d => d.estado === 'ACTIVA').reduce((s, d) => s + d.saldo, 0)
    });
  } catch (err) {
    console.error('Error deudas funcionario:', err);
    res.status(500).json({ error: 'Error al obtener deudas del funcionario' });
  }
});

// PUT /api/deudas/:id/plan — Crear o actualizar plan de descuento
router.put('/:id/plan', async (req, res) => {
  try {
    const { montoPorDescuento, frecuencia, fechaInicio } = req.body;
    if (!montoPorDescuento || montoPorDescuento <= 0) return res.status(400).json({ error: 'Monto por descuento debe ser mayor a 0' });
    if (!['SEMANAL', 'QUINCENAL'].includes(frecuencia)) return res.status(400).json({ error: 'Frecuencia inválida' });
    if (!fechaInicio) return res.status(400).json({ error: 'Fecha de inicio es obligatoria' });

    const deuda = await prisma.deuda.findUnique({ where: { id: req.params.id } });
    if (!deuda) return res.status(404).json({ error: 'Deuda no encontrada' });
    if (deuda.estado !== 'ACTIVA') return res.status(400).json({ error: 'Solo se puede asignar plan a deudas activas' });

    const plan = await prisma.planDescuento.upsert({
      where: { deudaId: req.params.id },
      update: { montoPorDescuento, frecuencia, fechaInicio: new Date(fechaInicio), activo: true },
      create: { deudaId: req.params.id, montoPorDescuento, frecuencia, fechaInicio: new Date(fechaInicio) }
    });
    res.json(plan);
  } catch (err) {
    console.error('Error plan:', err);
    res.status(500).json({ error: 'Error al guardar plan de descuento' });
  }
});

// ============================================
// DESCUENTOS
// ============================================

// POST /api/deudas/:id/descuentos — Registrar descuento
router.post('/:id/descuentos', async (req, res) => {
  try {
    const { fecha, monto, nota } = req.body;
    if (!fecha) return res.status(400).json({ error: 'Fecha es obligatoria' });
    if (!monto || monto <= 0) return res.status(400).json({ error: 'Monto debe ser mayor a 0' });
    if (!Number.isInteger(monto)) return res.status(400).json({ error: 'Monto debe ser un número entero' });

    // Usar transacción para garantizar consistencia
    const result = await prisma.$transaction(async (tx) => {
      const deuda = await tx.deuda.findUnique({
        where: { id: req.params.id },
        include: { descuentos: true }
      });

      if (!deuda) throw { status: 404, message: 'Deuda no encontrada' };
      if (deuda.estado !== 'ACTIVA') throw { status: 400, message: 'Solo se puede descontar de deudas activas' };

      const saldo = calcSaldo(deuda);
      if (monto > saldo) throw { status: 400, message: `El monto (${formatGs(monto)}) supera el saldo pendiente (${formatGs(saldo)})` };

      const descuento = await tx.descuento.create({
        data: {
          deudaId: deuda.id,
          fecha: new Date(fecha),
          monto,
          nota: nota?.trim() || null,
          createdBy: req.user?.id || req.user?.userId || 'sistema'
        }
      });

      // Si saldo llega a 0, marcar como SALDADA
      const nuevoSaldo = saldo - monto;
      if (nuevoSaldo === 0) {
        await tx.deuda.update({
          where: { id: deuda.id },
          data: { estado: 'SALDADA' }
        });
      }

      return { descuento, nuevoSaldo, nuevoEstado: nuevoSaldo === 0 ? 'SALDADA' : 'ACTIVA' };
    });

    res.status(201).json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('Error descuento:', err);
    res.status(500).json({ error: 'Error al registrar descuento' });
  }
});

// PUT /api/deudas/descuentos/:id/anular — Anular descuento
router.put('/descuentos/:id/anular', async (req, res) => {
  try {
    const { motivoAnulacion } = req.body;
    if (!motivoAnulacion?.trim()) return res.status(400).json({ error: 'Motivo de anulación es obligatorio' });

    const result = await prisma.$transaction(async (tx) => {
      const descuento = await tx.descuento.findUnique({
        where: { id: req.params.id },
        include: { deuda: true }
      });
      if (!descuento) throw { status: 404, message: 'Descuento no encontrado' };
      if (descuento.anulado) throw { status: 400, message: 'El descuento ya está anulado' };

      const updated = await tx.descuento.update({
        where: { id: req.params.id },
        data: { anulado: true, motivoAnulacion: motivoAnulacion.trim() }
      });

      // Si la deuda estaba SALDADA, volver a ACTIVA
      if (descuento.deuda.estado === 'SALDADA') {
        await tx.deuda.update({
          where: { id: descuento.deudaId },
          data: { estado: 'ACTIVA' }
        });
      }

      return updated;
    });

    res.json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('Error anular descuento:', err);
    res.status(500).json({ error: 'Error al anular descuento' });
  }
});

// PUT /api/deudas/:id/anular — Anular deuda
router.put('/:id/anular', async (req, res) => {
  try {
    const { motivoAnulacion } = req.body;
    if (!motivoAnulacion?.trim()) return res.status(400).json({ error: 'Motivo de anulación es obligatorio' });

    const deuda = await prisma.deuda.findUnique({ where: { id: req.params.id } });
    if (!deuda) return res.status(404).json({ error: 'Deuda no encontrada' });
    if (deuda.estado === 'ANULADA') return res.status(400).json({ error: 'La deuda ya está anulada' });

    const updated = await prisma.deuda.update({
      where: { id: req.params.id },
      data: { estado: 'ANULADA', motivoAnulacion: motivoAnulacion.trim() }
    });
    res.json(updated);
  } catch (err) {
    console.error('Error anular deuda:', err);
    res.status(500).json({ error: 'Error al anular deuda' });
  }
});

// ============================================
// LISTADO GENERAL DE DEUDORES
// ============================================

router.get('/deudores', async (req, res) => {
  try {
    const { estado, motivoId, search, categoria } = req.query;

    const where = {};
    if (estado) where.estado = estado;
    if (motivoId) where.motivoId = motivoId;
    if (categoria) {
      where.funcionario = { category: categoria };
    }
    if (search) {
      where.funcionario = {
        ...(where.funcionario || {}),
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { cedula: { contains: search } }
        ]
      };
    }

    const deudas = await prisma.deuda.findMany({
      where,
      include: {
        funcionario: true,
        motivo: true,
        descuentos: true,
        planDescuento: true
      },
      orderBy: { fecha: 'desc' }
    });

    const deudasConSaldo = deudas.map(d => {
      const montoBruto = d.montoBruto ?? d.montoOriginal;
      const porcentajeInteres = d.porcentajeInteres ?? 0;
      const montoInteres = d.montoInteres ?? Math.max(0, d.montoOriginal - montoBruto);
      const totalDescontado = d.descuentos.filter(desc => !desc.anulado).reduce((s, desc) => s + desc.monto, 0);
      return {
        ...d,
        montoBruto,
        porcentajeInteres,
        montoInteres,
        saldo: calcSaldo(d),
        totalDescontado
      };
    });

    res.json(deudasConSaldo);
  } catch (err) {
    console.error('Error deudores:', err);
    res.status(500).json({ error: 'Error al obtener listado de deudores' });
  }
});

// ============================================
// PLANILLA / REPORTE GENERAL DE DEUDAS
// ============================================

router.get('/planilla', async (req, res) => {
  try {
    const { frecuencia, estado, motivoId, search, tipo, categoria, from, to } = req.query;

    // Modo específico de nómina periódica agrupada por funcionario
    if (tipo === 'periodo') {
      if (!frecuencia || !['SEMANAL', 'QUINCENAL'].includes(frecuencia)) {
        return res.status(400).json({ error: 'Frecuencia inválida (SEMANAL o QUINCENAL)' });
      }

      const where = {
        estado: 'ACTIVA',
        planDescuento: {
          activo: true,
          frecuencia
        }
      };
      if (categoria) {
        where.funcionario = { category: categoria };
      }

      const deudas = await prisma.deuda.findMany({
        where,
        include: {
          funcionario: true,
          motivo: true,
          planDescuento: true,
          descuentos: true
        },
        orderBy: { funcionario: { name: 'asc' } }
      });

      const planilla = deudas.map(d => {
        const saldo = calcSaldo(d);
        const montoDescuento = Math.min(d.planDescuento?.montoPorDescuento || 0, saldo);
        const montoBruto = d.montoBruto ?? d.montoOriginal;
        const porcentajeInteres = d.porcentajeInteres ?? 0;
        const montoInteres = d.montoInteres ?? Math.max(0, d.montoOriginal - montoBruto);
        return {
          funcionario: d.funcionario,
          deuda: {
            id: d.id,
            motivo: d.motivo.nombre,
            descripcion: d.descripcion,
            montoBruto,
            porcentajeInteres,
            montoInteres,
            montoOriginal: d.montoOriginal,
            saldo,
            montoDescuento
          },
          plan: d.planDescuento
        };
      }).filter(item => item.deuda.montoDescuento > 0);

      // Agrupar por funcionario
      const agrupado = {};
      for (const item of planilla) {
        const fid = item.funcionario.id;
        if (!agrupado[fid]) {
          agrupado[fid] = {
            funcionario: item.funcionario,
            deudas: [],
            totalDescuento: 0
          };
        }
        agrupado[fid].deudas.push(item.deuda);
        agrupado[fid].totalDescuento += item.deuda.montoDescuento;
      }

      return res.json(Object.values(agrupado));
    }

    // Modo Reporte General de Deudas (por defecto en Planilla)
    const where = {};
    if (estado) where.estado = estado;
    if (motivoId) where.motivoId = motivoId;
    if (categoria) {
      where.funcionario = { category: categoria };
    }
    if (search) {
      where.funcionario = {
        ...(where.funcionario || {}),
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { cedula: { contains: search } }
        ]
      };
    }
    if (frecuencia && ['SEMANAL', 'QUINCENAL'].includes(frecuencia)) {
      where.planDescuento = { frecuencia };
    }
    if (from || to) {
      where.fecha = {};
      if (from) where.fecha.gte = new Date(from);
      if (to) {
        const toDate = new Date(to);
        toDate.setUTCHours(23, 59, 59, 999);
        where.fecha.lte = toDate;
      }
    }

    let deudas = await prisma.deuda.findMany({
      where,
      include: {
        funcionario: true,
        motivo: true,
        descuentos: true,
        planDescuento: true
      },
      orderBy: [
        { funcionario: { name: 'asc' } },
        { fecha: 'desc' }
      ]
    });

    if (frecuencia === 'SIN_PLAN') {
      deudas = deudas.filter(d => !d.planDescuento);
    }

    const reporte = deudas.map(d => {
      const saldo = calcSaldo(d);
      const totalDescontado = d.descuentos.filter(desc => !desc.anulado).reduce((s, desc) => s + desc.monto, 0);
      const montoBruto = d.montoBruto ?? d.montoOriginal;
      const porcentajeInteres = d.porcentajeInteres ?? 0;
      const montoInteres = d.montoInteres ?? Math.max(0, d.montoOriginal - montoBruto);
      return {
        id: d.id,
        funcionarioId: d.funcionarioId,
        funcionario: d.funcionario,
        fecha: d.fecha,
        motivo: d.motivo,
        descripcion: d.descripcion,
        montoBruto,
        porcentajeInteres,
        montoInteres,
        montoOriginal: d.montoOriginal,
        totalDescontado,
        saldo,
        estado: d.estado,
        planDescuento: d.planDescuento
      };
    });

    res.json(reporte);
  } catch (err) {
    console.error('Error planilla:', err);
    res.status(500).json({ error: 'Error al generar planilla' });
  }
});

// ============================================
// TARJETA DE DEUDAS (HTML para PDF)
// ============================================

router.get('/tarjeta/:funcionarioId', async (req, res) => {
  try {
    const { deudaId } = req.query;
    const funcionario = await prisma.client.findUnique({ where: { id: req.params.funcionarioId } });
    if (!funcionario) return res.status(404).json({ error: 'Funcionario no encontrado' });

    const where = { funcionarioId: req.params.funcionarioId };
    if (deudaId) {
      where.id = deudaId;
      where.estado = { not: 'ANULADA' };
    } else {
      // Tarjeta general de todas las deudas: solo se extrae lo activo (sin pagadas ni anuladas)
      where.estado = 'ACTIVA';
    }

    const deudas = await prisma.deuda.findMany({
      where,
      include: {
        motivo: true,
        descuentos: { orderBy: { fecha: 'asc' } }
      },
      orderBy: { fecha: 'asc' }
    });

    const deudasConSaldo = deudas.map(d => {
      const montoBruto = d.montoBruto ?? d.montoOriginal;
      const porcentajeInteres = d.porcentajeInteres ?? 0;
      const montoInteres = d.montoInteres ?? Math.max(0, d.montoOriginal - montoBruto);
      const totalDescontado = d.descuentos.filter(desc => !desc.anulado).reduce((s, desc) => s + desc.monto, 0);
      const saldo = d.estado === 'SALDADA' ? 0 : Math.max(0, calcSaldo(d));
      return {
        ...d,
        montoBruto,
        porcentajeInteres,
        montoInteres,
        saldo,
        totalDescontado
      };
    });

    const totalBruto = deudasConSaldo.reduce((s, d) => s + d.montoBruto, 0);
    const totalUtilidad = deudasConSaldo.reduce((s, d) => s + d.montoInteres, 0);
    const totalDeuda = deudasConSaldo.reduce((s, d) => s + d.montoOriginal, 0);
    const totalDescontado = deudasConSaldo.reduce((s, d) => s + d.totalDescontado, 0);
    const saldoTotal = deudasConSaldo.filter(d => d.estado === 'ACTIVA').reduce((s, d) => s + d.saldo, 0);

    const isSingle = Boolean(deudaId);
    const pageTitle = isSingle ? `Detalle de Deuda - ${funcionario.name}` : `Tarjeta de Deudas Activas - ${funcionario.name}`;
    const mainTitle = isSingle ? 'DETALLE DE PRÉSTAMO / DEUDA' : 'TARJETA DE DEUDAS ACTIVAS';

    // Generar HTML para impresión / PDF
    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>${pageTitle}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11pt; color: #1a1a1a; padding: 20mm; line-height: 1.5; }
    .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 12px; margin-bottom: 20px; }
    .header h1 { font-size: 16pt; font-weight: 700; margin-bottom: 2px; }
    .header p { font-size: 10pt; color: #555; }
    .funcionario-info { background: #f5f5f5; padding: 10px 14px; border-radius: 4px; margin-bottom: 20px; font-size: 12pt; font-weight: 600; display:flex; justify-content:space-between; align-items:center; }
    .cat-badge { display:inline-block; font-size:9.5pt; font-weight:700; padding:3px 10px; border-radius:12px; background:#e0e7ef; color:#1a365d; }
    .deuda-block { margin-bottom: 18px; border: 1px solid #ddd; border-radius: 4px; overflow: hidden; }
    .deuda-header { background: #f0f0f0; padding: 8px 14px; font-weight: 600; font-size: 10.5pt; display: flex; justify-content: space-between; align-items: center; }
    .deuda-header .estado { font-size: 9pt; padding: 2px 8px; border-radius: 3px; font-weight: 600; }
    .estado-ACTIVA { background: #e3f2e8; color: #2d8a4e; }
    .estado-SALDADA { background: #e0e7ef; color: #2c5f8a; }
    .estado-ANULADA { background: #fde8e5; color: #c0392b; }
    .deuda-sub { background:#fafafa; padding:6px 14px; font-size:9.5pt; border-bottom:1px solid #eee; display:flex; gap:16px; color:#555; }
    .deuda-body { padding: 8px 14px; }
    .descuento-row { display: flex; justify-content: space-between; padding: 3px 0; font-size: 10pt; border-bottom: 1px dotted #eee; }
    .descuento-row.anulado { text-decoration: line-through; color: #999; }
    .saldo-line { font-weight: 700; font-size: 11pt; text-align: right; padding: 8px 14px; background: #fafafa; border-top: 1px solid #ddd; }
    .totals { margin-top: 24px; border-top: 2px solid #333; padding-top: 14px; }
    .total-row { display: flex; justify-content: space-between; font-size: 11pt; padding: 3px 0; }
    .total-row.final { font-weight: 700; font-size: 13pt; border-top: 1px solid #ccc; padding-top: 8px; margin-top: 6px; }
    .fecha-gen { text-align: right; font-size: 8.5pt; color: #999; margin-top: 30px; }
    @media print { body { padding: 10mm; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>${mainTitle}</h1>
    <p>Comedor TTA S.A.</p>
  </div>
  <div class="funcionario-info">
    <div>
      ${funcionario.name} &mdash; CI: ${funcionario.cedula}
      ${funcionario.department ? ` &mdash; ${funcionario.department}` : ''}
    </div>
    <span class="cat-badge">${funcionario.category || 'GENERAL'}</span>
  </div>
  ${deudasConSaldo.length === 0 ? `
  <div style="padding:28px;text-align:center;background:#f9f9f9;border:1px dashed #ccc;border-radius:4px;margin-bottom:20px">
    <p style="color:#666;font-size:11pt">No registra préstamos / deudas activas pendientes.</p>
  </div>` :
  deudasConSaldo.map((d, i) => `
  <div class="deuda-block">
    <div class="deuda-header">
      <span>${isSingle ? 'Préstamo' : `Deuda ${i + 1}`}: ${d.motivo.nombre} - ${d.descripcion} (${formatFecha(d.fecha)})</span>
      <span class="estado estado-${d.estado}">${d.estado}</span>
    </div>
    <div class="deuda-sub">
      <span>Préstamo Bruto: <strong>Gs. ${formatGs(d.montoBruto)}</strong></span>
      <span>Interés / Utilidad (${d.porcentajeInteres}%): <strong>Gs. ${formatGs(d.montoInteres)}</strong></span>
      <span>Total a Cobrar: <strong>Gs. ${formatGs(d.montoOriginal)}</strong></span>
    </div>
    <div class="deuda-body">
      ${d.descuentos.length === 0 ? '<p style="font-size:9.5pt;color:#888;font-style:italic">Sin descuentos registrados</p>' :
      d.descuentos.map(desc => `
        <div class="descuento-row${desc.anulado ? ' anulado' : ''}">
          <span>${formatFecha(desc.fecha)}${desc.nota ? ' - ' + desc.nota : ''}${desc.anulado ? ' [ANULADO]' : ''}</span>
          <span>Gs. ${formatGs(desc.monto)}</span>
        </div>`).join('')}
    </div>
    <div class="saldo-line">Saldo: Gs. ${formatGs(d.saldo)}</div>
  </div>`).join('')}
  <div class="totals">
    <div class="total-row"><span>TOTAL CAPITAL BRUTO:</span><span>Gs. ${formatGs(totalBruto)}</span></div>
    <div class="total-row"><span>TOTAL UTILIDAD / GANANCIA:</span><span>Gs. ${formatGs(totalUtilidad)}</span></div>
    <div class="total-row"><span>TOTAL DEUDAS A COBRAR:</span><span>Gs. ${formatGs(totalDeuda)}</span></div>
    <div class="total-row"><span>TOTAL DESCONTADO / COBRADO:</span><span>Gs. ${formatGs(totalDescontado)}</span></div>
    <div class="total-row final"><span>SALDO PENDIENTE ACTUAL:</span><span>Gs. ${formatGs(saldoTotal)}</span></div>
  </div>
  <div class="fecha-gen">Generado: ${new Date().toLocaleString('es-PY')}</div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (err) {
    console.error('Error tarjeta:', err);
    res.status(500).json({ error: 'Error al generar tarjeta de deudas' });
  }
});

// ============================================
// BUSCAR FUNCIONARIOS (para el módulo de deudas)
// ============================================

router.get('/buscar-funcionarios', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json([]);

    const funcionarios = await prisma.client.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { cedula: { contains: q } }
        ]
      },
      take: 15,
      orderBy: { name: 'asc' }
    });
    res.json(funcionarios);
  } catch (err) {
    console.error('Error buscar:', err);
    res.status(500).json({ error: 'Error al buscar funcionarios' });
  }
});

export default router;
