/**
 * Seed de Motivos de Deuda
 * SEGURO para producción — solo inserta si no existen
 * Ejecutar: node src/seed-motivos-deuda.js
 */
import dotenv from 'dotenv';
dotenv.config();
import prisma from './config/db.js';

async function seedMotivos() {
  const motivos = [
    { nombre: 'Préstamo en efectivo', porcentajeInteres: 50 },
    { nombre: 'Electrodoméstico', porcentajeInteres: 40 },
    { nombre: 'Uniformes', porcentajeInteres: 0 }
  ];
  let created = 0;
  let updated = 0;

  for (const m of motivos) {
    const exists = await prisma.motivoDeuda.findUnique({ where: { nombre: m.nombre } });
    if (!exists) {
      await prisma.motivoDeuda.create({ data: { nombre: m.nombre, porcentajeInteres: m.porcentajeInteres } });
      created++;
      console.log(`  ✅ Creado: "${m.nombre}" con ${m.porcentajeInteres}%`);
    } else {
      await prisma.motivoDeuda.update({
        where: { id: exists.id },
        data: { porcentajeInteres: m.porcentajeInteres }
      });
      updated++;
      console.log(`  🔄 Actualizado: "${m.nombre}" con ${m.porcentajeInteres}%`);
    }
  }

  // Actualizar deudas previas que tengan montoBruto en null
  const deudasSinBruto = await prisma.deuda.findMany({
    where: { montoBruto: null }
  });
  if (deudasSinBruto.length > 0) {
    for (const d of deudasSinBruto) {
      await prisma.deuda.update({
        where: { id: d.id },
        data: {
          montoBruto: d.montoOriginal,
          porcentajeInteres: 0,
          montoInteres: 0
        }
      });
    }
    console.log(`  🔄 ${deudasSinBruto.length} deuda(s) existente(s) normalizada(s) con montoBruto.`);
  }

  console.log(`\n🎉 Seed completado. ${created} creado(s), ${updated} actualizado(s).`);
  await prisma.$disconnect();
}

seedMotivos().catch(e => {
  console.error('❌ Error:', e);
  prisma.$disconnect();
  process.exit(1);
});
