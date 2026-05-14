import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('🧹 Limpiando datos de productos...');
  const products = await prisma.product.findMany();
  
  for (const p of products) {
    await prisma.product.update({
      where: { id: p.id },
      data: {
        unit: p.unit || 'UNI',
        stock: parseFloat(p.stock) || 0
      }
    });
  }
  console.log('✅ Todos los productos actualizados a UNI y stock decimal.');
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
