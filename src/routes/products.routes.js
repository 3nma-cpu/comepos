import { Router } from 'express';
import prisma from '../config/db.js';
import { authMiddleware, requirePermission } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

const PROD_CAT_MAP = {
  'Platos Principales': 'PLATOS_PRINCIPALES', 'Bebidas': 'BEBIDAS',
  'Postres': 'POSTRES', 'Entradas': 'ENTRADAS', 'Extras': 'EXTRAS'
};
const PROD_CAT_REVERSE = Object.fromEntries(Object.entries(PROD_CAT_MAP).map(([k, v]) => [v, k]));

const UNIT_VALUES = ['UNI', 'KG', 'LTS'];

function productToJSON(p) {
  return {
    id: p.id,
    barcode: p.barcode,
    name: p.name,
    category: PROD_CAT_REVERSE[p.category] || p.category,
    unit: p.unit || 'UNI',
    price: p.price,
    cost: p.cost,
    stock: p.stock,
    emoji: p.emoji,
    active: p.active
  };
}

// GET /api/products
router.get('/', async (req, res) => {
  try {
    const products = await prisma.product.findMany({ where: { active: true }, orderBy: { name: 'asc' } });
    res.json(products.map(productToJSON));
  } catch (err) {
    console.error('Error fetching products:', err);
    res.status(500).json({ error: 'Error al obtener productos', detail: err.message });
  }
});

// GET /api/products/all (includes inactive)
router.get('/all', requirePermission('purchases'), async (req, res) => {
  try {
    const products = await prisma.product.findMany({ orderBy: { name: 'asc' } });
    res.json(products.map(productToJSON));
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener productos' });
  }
});

// POST /api/products
router.post('/', requirePermission('purchases'), async (req, res) => {
  try {
    const { barcode, name, category, unit, price, cost, stock, emoji } = req.body;
    if (!name || price === undefined) return res.status(400).json({ error: 'Nombre y precio son obligatorios' });
    
    let finalBarcode = barcode || null;
    if (finalBarcode === 'auto') {
      const pbc = await prisma.product.findMany({
        where: { barcode: { startsWith: '1000' } },
        select: { barcode: true }
      });
      let max = 1000000000;
      for (const p of pbc) {
        const num = parseInt(p.barcode, 10);
        if (!isNaN(num) && num > max) max = num;
      }
      finalBarcode = (max + 1).toString();
    }

    const product = await prisma.product.create({
      data: {
        barcode: finalBarcode,
        name,
        category: PROD_CAT_MAP[category] || category || 'PLATOS_PRINCIPALES',
        unit: UNIT_VALUES.includes(unit) ? unit : 'UNI',
        price: parseFloat(price) || 0,
        cost: parseFloat(cost) || 0,
        stock: parseFloat(stock) || 0,
        emoji: emoji || '🍽️'
      }
    });
    res.status(201).json(productToJSON(product));
  } catch (err) {
    console.error('Error creating product:', err);
    res.status(500).json({ error: 'Error al crear producto', detail: err.message });
  }
});

// PUT /api/products/:id
router.put('/:id', requirePermission('purchases'), async (req, res) => {
  try {
    const { barcode, name, category, unit, price, cost, stock, emoji, active } = req.body;
    const data = {};

    if (barcode !== undefined) {
      if (barcode === 'auto') {
        const pbc = await prisma.product.findMany({
          where: { barcode: { startsWith: '1000' } },
          select: { barcode: true }
        });
        let max = 1000000000;
        for (const p of pbc) {
          const num = parseInt(p.barcode, 10);
          if (!isNaN(num) && num > max) max = num;
        }
        data.barcode = (max + 1).toString();
      } else {
        data.barcode = barcode || null;
      }
    }

    if (name !== undefined) data.name = name;
    if (category !== undefined) data.category = PROD_CAT_MAP[category] || category;
    if (unit !== undefined && UNIT_VALUES.includes(unit)) data.unit = unit;
    if (price !== undefined) data.price = parseFloat(price);
    if (cost !== undefined) data.cost = parseFloat(cost);
    
    if (stock !== undefined) {
      const parsedStock = parseFloat(stock);
      const currentProduct = await prisma.product.findUnique({ where: { id: req.params.id } });
      if (currentProduct && parsedStock < currentProduct.stock) {
         return res.status(400).json({ error: `El stock no puede ser menor al actual (${currentProduct.stock}) desde la edición manual.` });
      }
      data.stock = parsedStock;
    }
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
