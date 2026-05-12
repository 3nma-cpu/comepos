import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    await prisma.$executeRawUnsafe(`UPDATE "Client" SET category = 'FUNCIONARIO'`);
    console.log("Clients updated");
}
main().catch(console.error).finally(() => prisma.$disconnect());
