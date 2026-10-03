/**
 * Seed de Motivos de Deuda
 * SEGURO para producción — solo inserta si no existen
 * Ejecutar: node src/seed-motivos-deuda.js
 */
import dotenv from 'dotenv';
dotenv.config();
import prisma from './config/db.js';

async function seedMotivos() {
  const motivos = ['Electrodoméstico', 'Préstamo en efectivo'];
  let created = 0;

  for (const nombre of motivos) {
    const exists = await prisma.motivoDeuda.findUnique({ where: { nombre } });
    if (!exists) {
      await prisma.motivoDeuda.create({ data: { nombre } });
      created++;
      console.log(`  ✅ Creado: "${nombre}"`);
    } else {
      console.log(`  ⏭️  Ya existe: "${nombre}"`);
    }
  }

  console.log(`\n🎉 Seed completado. ${created} motivo(s) nuevo(s) creado(s).`);
  await prisma.$disconnect();
}

seedMotivos().catch(e => {
  console.error('❌ Error:', e);
  prisma.$disconnect();
  process.exit(1);
});
