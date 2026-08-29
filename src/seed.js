import dotenv from 'dotenv';
dotenv.config();
import bcrypt from 'bcryptjs';
import prisma from './config/db.js';

async function seed() {
  console.log('🌱 Sembrando datos de demostración...');

  // Clean existing data (order matters for foreign keys)
  await prisma.saleItem.deleteMany();
  await prisma.purchaseItem.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.purchase.deleteMany();
  await prisma.user.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.role.deleteMany();
  await prisma.client.deleteMany();
  await prisma.product.deleteMany();
  await prisma.provider.deleteMany();

  // Roles
  const adminRole = await prisma.role.create({
    data: {
      name: 'Administrador', description: 'Acceso completo al sistema', protected: true,
      permissions: { create: ['dashboard', 'users', 'roles', 'clients', 'products', 'purchases', 'cashregister', 'sales', 'reports'].map(m => ({ module: m })) }
    }
  });
  const cajeroRole = await prisma.role.create({
    data: {
      name: 'Cajero', description: 'Gestión de ventas, caja y clientes', protected: true,
      permissions: { create: ['dashboard', 'clients', 'cashregister', 'sales'].map(m => ({ module: m })) }
    }
  });
  const almacenRole = await prisma.role.create({
    data: {
      name: 'Almacén', description: 'Gestión de compras e inventario', protected: true,
      permissions: { create: ['dashboard', 'purchases'].map(m => ({ module: m })) }
    }
  });
  const supervisorRole = await prisma.role.create({
    data: {
      name: 'Supervisor', description: 'Acceso a reportes y supervisión', protected: true,
      permissions: { create: ['dashboard', 'clients', 'cashregister', 'sales', 'reports'].map(m => ({ module: m })) }
    }
  });
  console.log('✅ Roles creados');

  // Users
  const passAdmin = await bcrypt.hash('admin123', 10);
  const passCajero = await bcrypt.hash('cajero123', 10);
  const passAlmacen = await bcrypt.hash('almacen123', 10);
  const passSupervisor = await bcrypt.hash('super123', 10);

  const userAdmin = await prisma.user.create({ data: { username: 'admin', password: passAdmin, name: 'Carlos Benítez', email: 'admin@comepos.com', roleId: adminRole.id } });
  const userCajero = await prisma.user.create({ data: { username: 'cajero', password: passCajero, name: 'María González', email: 'cajero@comepos.com', roleId: cajeroRole.id } });
  const userAlmacen = await prisma.user.create({ data: { username: 'almacen', password: passAlmacen, name: 'José Aquino', email: 'almacen@comepos.com', roleId: almacenRole.id } });
  const userSupervisor = await prisma.user.create({ data: { username: 'supervisor', password: passSupervisor, name: 'Lucía Fernández', email: 'lucia.fernandez@comepos.com', roleId: supervisorRole.id } });
  const userCajero2 = await prisma.user.create({ data: { username: 'cajero2', password: passCajero, name: 'Esteban Ramírez', email: 'esteban.ramirez@comepos.com', roleId: cajeroRole.id } });
  console.log('✅ Usuarios creados');

  // Clients
  const clientsData = [
    { name: 'Ana María López', cedula: '4521332', department: 'Dirección General', position: 'Directora General', category: 'ADM', email: 'ana.lopez@empresa.com', phone: '0981-555-001' },
    { name: 'Roberto Giménez', cedula: '3215887', department: 'Finanzas', position: 'Gerente Financiero', category: 'ADM', email: 'roberto.gimenez@empresa.com', phone: '0981-555-002' },
    { name: 'Claudia Vera', cedula: '5102443', department: 'Recursos Humanos', position: 'Jefa de RRHH', category: 'ADM', email: 'claudia.vera@empresa.com', phone: '0981-555-003' },
    { name: 'Marcos Villalba', cedula: '4887221', department: 'TI', position: 'Analista de Sistemas', category: 'ADM', email: 'marcos.villalba@empresa.com', phone: '0981-555-004' },
    { name: 'Laura Cabrera', cedula: '6334109', department: 'Contabilidad', position: 'Analista Contable', category: 'ADM', email: 'laura.cabrera@empresa.com', phone: '0981-555-005' },
    { name: 'Diego Paredes', cedula: '5776002', department: 'Ventas', position: 'Asistente Comercial', category: 'ADM', email: 'diego.paredes@empresa.com', phone: '0981-555-006' },
    { name: 'Sofía Riquelme', cedula: '7001554', department: 'Administración', position: 'Asistente Administrativa', category: 'ADM', email: 'sofia.riquelme@empresa.com', phone: '0981-555-007' },
    { name: 'Juan Ortiz', cedula: '3998776', department: 'Operaciones', position: 'Operador de Planta', category: 'ADM', email: 'juan.ortiz@empresa.com', phone: '0981-555-008' },
    { name: 'Patricia Núñez', cedula: '4123880', department: 'Logística', position: 'Operadora Logística', category: 'ADM', email: 'patricia.nunez@empresa.com', phone: '0981-555-009' },
    { name: 'Fernando Acosta', cedula: '8200115', department: 'TI', position: 'Practicante de Desarrollo', category: 'ADM', email: 'fernando.acosta@empresa.com', phone: '0981-555-010' },
    { name: 'Gabriela Domínguez', cedula: '2990334', department: 'Marketing', position: 'Gerente de Marketing', category: 'ADM', email: 'gabriela.dominguez@empresa.com', phone: '0981-555-011' },
    { name: 'Ricardo Benítez', cedula: '3114008', department: 'Mantenimiento', position: 'Técnico Contratista', category: 'CHOFER', email: 'ricardo.benitez@contratista.com', phone: '0981-555-012' }
  ];
  const clients = [];
  for (const c of clientsData) {
    clients.push(await prisma.client.create({ data: c }));
  }
  console.log('✅ Clientes creados');

  // Providers
  const prov1 = await prisma.provider.create({ data: { name: 'Distribuidora del Este', ruc: '80012345-6', phone: '021-555-100', email: 'ventas@disteste.com.py' } });
  const prov2 = await prisma.provider.create({ data: { name: 'Alimentos Guaraní S.A.', ruc: '80023456-7', phone: '021-555-200', email: 'contacto@alguarani.com.py' } });
  const prov3 = await prisma.provider.create({ data: { name: 'Bebidas del Paraguay', ruc: '80034567-8', phone: '021-555-300', email: 'pedidos@bebidaspy.com.py' } });
  const providers = [prov1, prov2, prov3];
  console.log('✅ Proveedores creados');

  // Products
  const productsData = [
    { name: 'Milanesa con Ensalada', category: 'PLATOS_PRINCIPALES', price: 25000, cost: 12000, stock: 30, emoji: '🥩' },
    { name: 'Guiso de Arroz', category: 'PLATOS_PRINCIPALES', price: 20000, cost: 8000, stock: 40, emoji: '🍚' },
    { name: 'Pollo a la Plancha', category: 'PLATOS_PRINCIPALES', price: 28000, cost: 14000, stock: 25, emoji: '🍗' },
    { name: 'Tallarín con Salsa', category: 'PLATOS_PRINCIPALES', price: 22000, cost: 9000, stock: 35, emoji: '🍝' },
    { name: 'Empanadas (x3)', category: 'ENTRADAS', price: 15000, cost: 6000, stock: 50, emoji: '🥟' },
    { name: 'Sopa Paraguaya', category: 'ENTRADAS', price: 12000, cost: 5000, stock: 45, emoji: '🧀' },
    { name: 'Chipa Guazú', category: 'ENTRADAS', price: 10000, cost: 4000, stock: 40, emoji: '🌽' },
    { name: 'Jugo Natural', category: 'BEBIDAS', price: 8000, cost: 3000, stock: 60, emoji: '🧃' },
    { name: 'Gaseosa 500ml', category: 'BEBIDAS', price: 5000, cost: 2500, stock: 80, emoji: '🥤' },
    { name: 'Agua Mineral', category: 'BEBIDAS', price: 3000, cost: 1500, stock: 100, emoji: '💧' },
    { name: 'Tereré', category: 'BEBIDAS', price: 5000, cost: 2000, stock: 60, emoji: '🧉' },
    { name: 'Café', category: 'BEBIDAS', price: 4000, cost: 1500, stock: 70, emoji: '☕' },
    { name: 'Flan con Dulce', category: 'POSTRES', price: 10000, cost: 4000, stock: 30, emoji: '🍮' },
    { name: 'Ensalada de Frutas', category: 'POSTRES', price: 12000, cost: 5000, stock: 25, emoji: '🍓' },
    { name: 'Torta de Chocolate', category: 'POSTRES', price: 15000, cost: 7000, stock: 20, emoji: '🍫' },
    { name: 'Pan de Queso', category: 'EXTRAS', price: 5000, cost: 2000, stock: 50, emoji: '🧀' },
    { name: 'Porción de Mandioca', category: 'EXTRAS', price: 4000, cost: 1500, stock: 45, emoji: '🥔' },
    { name: 'Ensalada Extra', category: 'EXTRAS', price: 6000, cost: 2500, stock: 40, emoji: '🥗' }
  ];
  const products = [];
  for (const p of productsData) {
    products.push(await prisma.product.create({ data: p }));
  }
  console.log('✅ Productos creados');

  // Generate Sales (last 30 days)
  const payMethods = ['EFECTIVO', 'TARJETA', 'NOMINA'];
  let salesCount = 0;
  for (let day = 30; day >= 0; day--) {
    const numSales = Math.floor(Math.random() * 6) + 3;
    for (let s = 0; s < numSales; s++) {
      const client = clients[Math.floor(Math.random() * clients.length)];
      const numItems = Math.floor(Math.random() * 3) + 1;
      const usedProds = new Set();
      const items = [];
      for (let i = 0; i < numItems; i++) {
        let prod;
        do { prod = products[Math.floor(Math.random() * products.length)]; } while (usedProds.has(prod.id));
        usedProds.add(prod.id);
        const qty = Math.floor(Math.random() * 2) + 1;
        items.push({ productId: prod.id, quantity: qty, unitPrice: prod.price });
      }
      const total = items.reduce((sum, it) => sum + it.unitPrice * it.quantity, 0);
      const d = new Date();
      d.setDate(d.getDate() - day);
      d.setHours(11 + Math.floor(Math.random() * 3), Math.floor(Math.random() * 60), 0, 0);

      await prisma.sale.create({
        data: {
          clientId: client.id, userId: userCajero.id, total,
          paymentMethod: payMethods[Math.floor(Math.random() * payMethods.length)],
          createdAt: d,
          items: { create: items }
        }
      });
      salesCount++;
    }
  }
  console.log(`✅ ${salesCount} ventas generadas`);

  // Generate Purchases
  for (let i = 0; i < 10; i++) {
    const prov = providers[Math.floor(Math.random() * providers.length)];
    const numItems = Math.floor(Math.random() * 4) + 2;
    const usedProds = new Set();
    const items = [];
    for (let j = 0; j < numItems; j++) {
      let prod;
      do { prod = products[Math.floor(Math.random() * products.length)]; } while (usedProds.has(prod.id));
      usedProds.add(prod.id);
      const qty = Math.floor(Math.random() * 20) + 10;
      items.push({ productId: prod.id, quantity: qty, unitCost: prod.cost });
    }
    const total = items.reduce((sum, it) => sum + it.unitCost * it.quantity, 0);
    const d = new Date();
    d.setDate(d.getDate() - Math.floor(Math.random() * 30));

    await prisma.purchase.create({
      data: {
        providerId: prov.id, userId: userAlmacen.id, total,
        createdAt: d,
        items: { create: items }
      }
    });
  }
  console.log('✅ Compras generadas');

  console.log('\n🎉 Seed completado exitosamente!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Usuarios de demo:');
  console.log('  admin   / admin123   (Administrador)');
  console.log('  cajero  / cajero123  (Cajero)');
  console.log('  almacen / almacen123 (Almacén)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  await prisma.$disconnect();
}

seed().catch(e => { console.error('❌ Error en seed:', e); prisma.$disconnect(); process.exit(1); });
