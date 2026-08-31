import { Router } from 'express';
import prisma from '../config/db.js';
import { authMiddleware, requirePermission } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);
router.use(requirePermission('reports'));

const CAT_REVERSE = {
  'DIRECTIVO': 'Directivo', 'GERENTE': 'Gerente', 'JEFE_DE_AREA': 'Jefe de Área',
  'ANALISTA': 'Analista', 'ASISTENTE': 'Asistente', 'OPERARIO': 'Operario',
  'PRACTICANTE': 'Practicante', 'CONTRATISTA': 'Contratista',
  'ADM': 'ADM', 'CHOFER': 'CHOFER'
};
const PAY_REVERSE = { 'EFECTIVO': 'efectivo', 'TRANSFERENCIA': 'transferencia', 'NOMINA': 'nomina', 'TARJETA': 'tarjeta' };

/**
 * Parsea y valida un string de fecha para uso en queries.
 * Devuelve un objeto Date o null si el valor es inválido.
 */
function parseSafeDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Construye el objeto where.createdAt con fechas validadas.
 * Retorna null si ninguna fecha es válida.
 */
function buildDateFilter(from, to) {
  const fromDate = parseSafeDate(from);
  const toDate = parseSafeDate(to);
  if (!fromDate && !toDate) return null;

  const filter = {};
  if (fromDate) filter.gte = fromDate;
  if (toDate) filter.lte = new Date(toDate.toISOString().split('T')[0] + 'T23:59:59.999Z');
  return filter;
}

// GET /api/reports/sales-period?from=&to=
router.get('/sales-period', async (req, res) => {
  try {
    const { from, to } = req.query;
    const dateFilter = buildDateFilter(from, to);
    const where = dateFilter ? { createdAt: dateFilter } : {};

    const sales = await prisma.sale.findMany({
      where,
      include: { client: true, items: { include: { product: true } } },
      orderBy: { createdAt: 'desc' }
    });

    const totalRevenue = sales.reduce((s, x) => s + x.total, 0);
    const avgTicket = sales.length ? totalRevenue / sales.length : 0;

    // Daily aggregation
    const dailyMap = {};
    sales.forEach(s => {
      const day = s.createdAt.toISOString().split('T')[0];
      dailyMap[day] = (dailyMap[day] || 0) + s.total;
    });

    res.json({
      totalSales: sales.length,
      totalRevenue,
      avgTicket,
      daily: Object.entries(dailyMap).sort(([a], [b]) => a.localeCompare(b)).map(([date, total]) => ({ date, total })),
      sales: sales.map(s => ({
        id: s.id, date: s.createdAt.toISOString(),
        clientName: s.client?.name || 'Cliente General',
        clientCategory: s.client ? (CAT_REVERSE[s.client.category] || s.client.category) : 'General',
        paymentMethod: PAY_REVERSE[s.paymentMethod] || (s.paymentMethod ? s.paymentMethod.toLowerCase() : 'efectivo'),
        total: s.total,
        items: (s.items || []).map(i => ({ name: i.product?.name || 'Producto', quantity: i.quantity, price: i.unitPrice }))
      }))
    });
  } catch (err) {
    console.error('Error en reporte de ventas:', err);
    res.status(500).json({ error: 'Error en reporte de ventas' });
  }
});

// GET /api/reports/sales-category
router.get('/sales-category', async (req, res) => {
  try {
    const { from, to } = req.query;
    const dateFilter = buildDateFilter(from, to);
    const where = dateFilter ? { createdAt: dateFilter } : {};

    const sales = await prisma.sale.findMany({ where, include: { client: true } });
    const catMap = {};
    sales.forEach(s => {
      const cat = s.client ? (CAT_REVERSE[s.client.category] || s.client.category) : 'General';
      catMap[cat] = (catMap[cat] || 0) + s.total;
    });
    const total = Object.values(catMap).reduce((s, v) => s + v, 0);
    const categories = Object.entries(catMap)
      .sort((a, b) => b[1] - a[1])
      .map(([category, amount]) => ({ category, amount, percentage: total ? ((amount / total) * 100).toFixed(1) : 0 }));
    res.json({ total, categories });
  } catch (err) {
    console.error('Error en reporte por categoría:', err);
    res.status(500).json({ error: 'Error en reporte por categoría' });
  }
});

// GET /api/reports/top-products
router.get('/top-products', async (req, res) => {
  try {
    const { from, to } = req.query;
    const where = {};
    const dateFilter = buildDateFilter(from, to);
    if (dateFilter) {
      where.sale = { createdAt: dateFilter };
    }

    const items = await prisma.saleItem.findMany({ where, include: { product: true } });
    const prodMap = {};
    items.forEach(i => {
      if (!prodMap[i.productId]) prodMap[i.productId] = { name: i.product.name, qty: 0, revenue: 0 };
      prodMap[i.productId].qty += i.quantity;
      prodMap[i.productId].revenue += i.unitPrice * i.quantity;
    });
    const products = Object.entries(prodMap)
      .sort((a, b) => b[1].qty - a[1].qty)
      .slice(0, 10)
      .map(([id, data], i) => ({ rank: i + 1, id, ...data }));
    res.json({ products });
  } catch (err) {
    res.status(500).json({ error: 'Error en reporte de productos' });
  }
});

// GET /api/reports/payment-methods
router.get('/payment-methods', async (req, res) => {
  try {
    const sales = await prisma.sale.findMany();
    const payMap = {};
    sales.forEach(s => {
      const method = PAY_REVERSE[s.paymentMethod] || s.paymentMethod;
      if (!payMap[method]) payMap[method] = { amount: 0, count: 0 };
      payMap[method].amount += s.total;
      payMap[method].count++;
    });
    const total = Object.values(payMap).reduce((s, v) => s + v.amount, 0);
    const methods = Object.entries(payMap)
      .sort((a, b) => b[1].amount - a[1].amount)
      .map(([method, data]) => ({ method, ...data, percentage: total ? ((data.amount / total) * 100).toFixed(1) : 0 }));
    res.json({ total, methods });
  } catch (err) {
    res.status(500).json({ error: 'Error en reporte de métodos de pago' });
  }
});

// GET /api/reports/purchases-vs-sales
router.get('/purchases-vs-sales', async (req, res) => {
  try {
    const sales = await prisma.sale.findMany();
    const purchases = await prisma.purchase.findMany();
    const totalSales = sales.reduce((s, x) => s + x.total, 0);
    const totalPurchases = purchases.reduce((s, x) => s + x.total, 0);

    // Monthly
    const months = {};
    sales.forEach(s => {
      const m = s.createdAt.toISOString().slice(0, 7);
      if (!months[m]) months[m] = { sales: 0, purchases: 0 };
      months[m].sales += s.total;
    });
    purchases.forEach(p => {
      const m = p.createdAt.toISOString().slice(0, 7);
      if (!months[m]) months[m] = { sales: 0, purchases: 0 };
      months[m].purchases += p.total;
    });

    res.json({ totalSales, totalPurchases, margin: totalSales - totalPurchases, monthly: Object.entries(months).sort(([a], [b]) => a.localeCompare(b)).map(([month, data]) => ({ month, ...data })) });
  } catch (err) {
    res.status(500).json({ error: 'Error en reporte compras vs ventas' });
  }
});

// GET /api/reports/client-consumption
router.get('/client-consumption', async (req, res) => {
  try {
    const sales = await prisma.sale.findMany({ include: { client: true } });
    const clientMap = {};
    sales.forEach(s => {
      if (!clientMap[s.clientId]) clientMap[s.clientId] = { name: s.client.name, category: CAT_REVERSE[s.client.category] || s.client.category, count: 0, total: 0 };
      clientMap[s.clientId].count++;
      clientMap[s.clientId].total += s.total;
    });
    const clients = Object.values(clientMap)
      .sort((a, b) => b.total - a.total)
      .map(c => ({ ...c, average: Math.round(c.total / c.count) }));
    res.json({ clients });
  } catch (err) {
    res.status(500).json({ error: 'Error en reporte de consumo' });
  }
});

export default router;
