import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import prisma from '../src/config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function backup() {
  const backupDir = 'C:/inventario/backups';
  
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `backup-${timestamp}.json`);

  console.log('📦 Iniciando copia de seguridad...');

  try {
    const data = {
      users: await prisma.user.findMany(),
      roles: await prisma.role.findMany(),
      clients: await prisma.client.findMany(),
      products: await prisma.product.findMany(),
      providers: await prisma.provider.findMany(),
      sales: await prisma.sale.findMany({ include: { items: true } }),
      purchases: await prisma.purchase.findMany({ include: { items: true } }),
      timestamp: new Date().toISOString()
    };

    fs.writeFileSync(backupPath, JSON.stringify(data, null, 2));
    console.log(`✅ Copia guardada en: ${backupPath}`);
  } catch (error) {
    console.error('❌ Error haciendo la copia:', error);
  } finally {
    await prisma.$disconnect();
  }
}

backup();
