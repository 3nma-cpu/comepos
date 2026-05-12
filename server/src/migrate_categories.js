import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function migrate() {
  console.log('🔄 Migrando categorías de clientes...');
  
  const admCount = await prisma.client.updateMany({
    where: { category: 'FUNCIONARIO' },
    data: { category: 'ADM' }
  });
  console.log(`✅ ${admCount.count} clientes migrados a ADM`);

  const choferCount = await prisma.client.updateMany({
    where: { category: 'NO_FUNCIONARIO' },
    data: { category: 'CHOFER' }
  });
  console.log(`✅ ${choferCount.count} clientes migrados a CHOFER`);
}

migrate()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
