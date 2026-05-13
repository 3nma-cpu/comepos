import { Router } from 'express';
import prisma from '../config/db.js';
import { authMiddleware, requirePermission } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

// Category mapping
const PROD_CAT_MAP = {
  'Platos Principales': 'PLATOS_PRINCIPALES', 'Bebidas': 'BEBIDAS', 'Postres': 'POSTRES', 'Entradas': 'ENTRADAS', 'Extras': 'EXTRAS'
};
const PROD_CAT_REVERSE = Object.fromEntries(Object.entries(PROD_CAT_MAP).map(([k, v]) => [v, k]));

function productToJSON(p) {
  return { id: p.id, name: p.name, category: PROD_CAT_REVERSE[p.category] || p.category, price: p.price, cost: p.cost, stock: p.stock, emoji: p.emoji, active: p.active };
}

// GET /api/products
router.get('/', async (req, res) => {
  try {
    const products = await prisma.product.findMany({ where: { active: true }, orderBy: { name: 'asc' } });
    res.json(products.map(productToJSON));
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener productos' });
  }
});

// POST /api/products
router.post('/', requirePermission('purchases'), async (req, res) => {
  try {
    const { name, category, price, cost, stock, emoji } = req.body;
    if (!name || !price) return res.status(400).json({ error: 'Nombre y precio son obligatorios' });
    const product = await prisma.product.create({
      data: { name, category: PROD_CAT_MAP[category] || category, price, cost: cost || 0, stock: stock || 0, emoji: emoji || '🍽️' }
    });
    res.status(201).json(productToJSON(product));
  } catch (err) {
    res.status(500).json({ error: 'Error al crear producto' });
  }
});

// PUT /api/products/:id
router.put('/:id', requirePermission('purchases'), async (req, res) => {
  try {
    const { name, category, price, cost, stock, emoji, active } = req.body;
    const data = {};
    if (name !== undefined) data.name = name;
    if (category !== undefined) data.category = PROD_CAT_MAP[category] || category;
    if (price !== undefined) data.price = price;
    if (cost !== undefined) data.cost = cost;
    if (stock !== undefined) data.stock = stock;
    if (emoji !== undefined) data.emoji = emoji;
    if (active !== undefined) data.active = active;

    const product = await prisma.product.update({ where: { id: req.params.id }, data });
    res.json(productToJSON(product));
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Producto no encontrado' });
    res.status(500).json({ error: 'Error al actualizar producto' });
  }
});

// DELETE /api/products/:id
router.delete('/:id', requirePermission('purchases'), async (req, res) => {
  try {
    await prisma.product.update({ where: { id: req.params.id }, data: { active: false } });
    res.json({ message: 'Producto desactivado' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar producto' });
  }
});

export default router;
