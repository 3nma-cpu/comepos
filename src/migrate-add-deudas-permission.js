/**
 * Migración de datos — Agregar permiso 'deudas' al rol Administrador
 * SEGURO para producción — solo inserta si no existe
 * Ejecutar: node src/migrate-add-deudas-permission.js
 */
import dotenv from 'dotenv';
dotenv.config();
import prisma from './config/db.js';

async function migrate() {
  console.log('🔧 Agregando permiso "deudas" al rol Administrador...\n');

  // Buscar rol Administrador
  const adminRole = await prisma.role.findFirst({
    where: { name: 'Administrador' },
    include: { permissions: true }
  });

  if (!adminRole) {
    console.log('⚠️  No se encontró el rol "Administrador". Buscando roles disponibles...');
    const roles = await prisma.role.findMany({ select: { id: true, name: true } });
    console.log('Roles existentes:', roles.map(r => `  - ${r.name} (${r.id})`).join('\n'));
    console.log('\nAgregá el permiso manualmente desde la UI de Roles o ejecutá:');
    console.log('  npx prisma studio');
    await prisma.$disconnect();
    return;
  }

  // Verificar si ya tiene el permiso
  const yaExiste = adminRole.permissions.some(p => p.module === 'deudas');
  if (yaExiste) {
    console.log('✅ El rol Administrador ya tiene el permiso "deudas". No se hicieron cambios.');
    await prisma.$disconnect();
    return;
  }

  // Agregar el permiso
  await prisma.rolePermission.create({
    data: {
      roleId: adminRole.id,
      module: 'deudas'
    }
  });

  console.log(`✅ Permiso "deudas" agregado al rol "${adminRole.name}" (${adminRole.id})`);
  console.log('');
  console.log('📝 Permisos actuales del Administrador:');
  const updatedRole = await prisma.role.findUnique({
    where: { id: adminRole.id },
    include: { permissions: true }
  });
  updatedRole.permissions.forEach(p => console.log(`  ✓ ${p.module}`));

  console.log('\n⚠️  Los usuarios con rol Administrador deben cerrar sesión y volver');
  console.log('   a iniciarla para que el nuevo permiso tome efecto.\n');

  await prisma.$disconnect();
}

migrate().catch(e => {
  console.error('❌ Error:', e);
  prisma.$disconnect();
  process.exit(1);
});
