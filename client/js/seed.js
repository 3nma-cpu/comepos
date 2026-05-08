// ============================================
// Seed — Demo data for the POS system
// ============================================

import { setCollection, markSeeded } from './store.js';
import { generateId, daysAgo } from './utils.js';

export function seedData() {
    // Roles
    const roles = [
        { id: 'role-admin', name: 'Administrador', description: 'Acceso completo al sistema', permissions: ['dashboard', 'users', 'roles', 'clients', 'purchases', 'sales', 'reports'], protected: true },
        { id: 'role-cajero', name: 'Cajero', description: 'Gestión de ventas y clientes', permissions: ['dashboard', 'clients', 'sales'], protected: true },
        { id: 'role-almacen', name: 'Almacén', description: 'Gestión de compras e inventario', permissions: ['dashboard', 'purchases'], protected: true },
        { id: 'role-supervisor', name: 'Supervisor', description: 'Acceso a reportes y supervisión', permissions: ['dashboard', 'clients', 'sales', 'reports'], protected: true }
    ];
    setCollection('roles', roles);

    // Users
    const users = [
        { id: 'usr-1', username: 'admin', password: 'admin123', name: 'Carlos Benítez', email: 'admin@comepos.com', roleId: 'role-admin', active: true },
        { id: 'usr-2', username: 'cajero', password: 'cajero123', name: 'María González', email: 'cajero@comepos.com', roleId: 'role-cajero', active: true },
        { id: 'usr-3', username: 'almacen', password: 'almacen123', name: 'José Aquino', email: 'almacen@comepos.com', roleId: 'role-almacen', active: true }
    ];
    setCollection('users', users);

    // Clients (employees)
    const clients = [
        { id: 'cli-1', name: 'Ana María López', cedula: '4.521.332', department: 'Dirección General', position: 'Directora General', category: 'Directivo', email: 'ana.lopez@empresa.com', phone: '0981-555-001' },
        { id: 'cli-2', name: 'Roberto Giménez', cedula: '3.215.887', department: 'Finanzas', position: 'Gerente Financiero', category: 'Gerente', email: 'roberto.gimenez@empresa.com', phone: '0981-555-002' },
        { id: 'cli-3', name: 'Claudia Vera', cedula: '5.102.443', department: 'Recursos Humanos', position: 'Jefa de RRHH', category: 'Jefe de Área', email: 'claudia.vera@empresa.com', phone: '0981-555-003' },
        { id: 'cli-4', name: 'Marcos Villalba', cedula: '4.887.221', department: 'TI', position: 'Analista de Sistemas', category: 'Analista', email: 'marcos.villalba@empresa.com', phone: '0981-555-004' },
        { id: 'cli-5', name: 'Laura Cabrera', cedula: '6.334.109', department: 'Contabilidad', position: 'Analista Contable', category: 'Analista', email: 'laura.cabrera@empresa.com', phone: '0981-555-005' },
        { id: 'cli-6', name: 'Diego Paredes', cedula: '5.776.002', department: 'Ventas', position: 'Asistente Comercial', category: 'Asistente', email: 'diego.paredes@empresa.com', phone: '0981-555-006' },
        { id: 'cli-7', name: 'Sofía Riquelme', cedula: '7.001.554', department: 'Administración', position: 'Asistente Administrativa', category: 'Asistente', email: 'sofia.riquelme@empresa.com', phone: '0981-555-007' },
        { id: 'cli-8', name: 'Juan Ortiz', cedula: '3.998.776', department: 'Operaciones', position: 'Operador de Planta', category: 'Operario', email: 'juan.ortiz@empresa.com', phone: '0981-555-008' },
        { id: 'cli-9', name: 'Patricia Núñez', cedula: '4.123.880', department: 'Logística', position: 'Operadora Logística', category: 'Operario', email: 'patricia.nunez@empresa.com', phone: '0981-555-009' },
        { id: 'cli-10', name: 'Fernando Acosta', cedula: '8.200.115', department: 'TI', position: 'Practicante de Desarrollo', category: 'Practicante', email: 'fernando.acosta@empresa.com', phone: '0981-555-010' },
        { id: 'cli-11', name: 'Gabriela Domínguez', cedula: '2.990.334', department: 'Marketing', position: 'Gerente de Marketing', category: 'Gerente', email: 'gabriela.dominguez@empresa.com', phone: '0981-555-011' },
        { id: 'cli-12', name: 'Ramón Escobar', cedula: '3.445.667', department: 'Mantenimiento', position: 'Técnico Contratista', category: 'Contratista', email: 'ramon.escobar@empresa.com', phone: '0981-555-012' }
    ];
    setCollection('clients', clients);

    // Providers
    const providers = [
        { id: 'prov-1', name: 'Distribuidora del Este', ruc: '80012345-6', phone: '021-555-100', email: 'ventas@disteste.com.py' },
        { id: 'prov-2', name: 'Alimentos Guaraní S.A.', ruc: '80023456-7', phone: '021-555-200', email: 'contacto@alguarani.com.py' },
        { id: 'prov-3', name: 'Bebidas del Paraguay', ruc: '80034567-8', phone: '021-555-300', email: 'pedidos@bebidaspy.com.py' }
    ];
    setCollection('providers', providers);

    // Products
    const products = [
        { id: 'prod-1', name: 'Milanesa con Ensalada', category: 'Platos Principales', price: 25000, cost: 12000, stock: 30, emoji: '🥩' },
        { id: 'prod-2', name: 'Guiso de Arroz', category: 'Platos Principales', price: 20000, cost: 8000, stock: 40, emoji: '🍚' },
        { id: 'prod-3', name: 'Pollo a la Plancha', category: 'Platos Principales', price: 28000, cost: 14000, stock: 25, emoji: '🍗' },
        { id: 'prod-4', name: 'Tallarín con Salsa', category: 'Platos Principales', price: 22000, cost: 9000, stock: 35, emoji: '🍝' },
        { id: 'prod-5', name: 'Empanadas (x3)', category: 'Entradas', price: 15000, cost: 6000, stock: 50, emoji: '🥟' },
        { id: 'prod-6', name: 'Sopa Paraguaya', category: 'Entradas', price: 12000, cost: 5000, stock: 45, emoji: '🧀' },
        { id: 'prod-7', name: 'Chipa Guazú', category: 'Entradas', price: 10000, cost: 4000, stock: 40, emoji: '🌽' },
        { id: 'prod-8', name: 'Jugo Natural', category: 'Bebidas', price: 8000, cost: 3000, stock: 60, emoji: '🧃' },
        { id: 'prod-9', name: 'Gaseosa 500ml', category: 'Bebidas', price: 5000, cost: 2500, stock: 80, emoji: '🥤' },
        { id: 'prod-10', name: 'Agua Mineral', category: 'Bebidas', price: 3000, cost: 1500, stock: 100, emoji: '💧' },
        { id: 'prod-11', name: 'Tereré', category: 'Bebidas', price: 5000, cost: 2000, stock: 60, emoji: '🧉' },
        { id: 'prod-12', name: 'Café', category: 'Bebidas', price: 4000, cost: 1500, stock: 70, emoji: '☕' },
        { id: 'prod-13', name: 'Flan con Dulce', category: 'Postres', price: 10000, cost: 4000, stock: 30, emoji: '🍮' },
        { id: 'prod-14', name: 'Ensalada de Frutas', category: 'Postres', price: 12000, cost: 5000, stock: 25, emoji: '🍓' },
        { id: 'prod-15', name: 'Torta de Chocolate', category: 'Postres', price: 15000, cost: 7000, stock: 20, emoji: '🍫' },
        { id: 'prod-16', name: 'Pan de Queso', category: 'Extras', price: 5000, cost: 2000, stock: 50, emoji: '🧀' },
        { id: 'prod-17', name: 'Porción de Mandioca', category: 'Extras', price: 4000, cost: 1500, stock: 45, emoji: '🥔' },
        { id: 'prod-18', name: 'Ensalada Extra', category: 'Extras', price: 6000, cost: 2500, stock: 40, emoji: '🥗' }
    ];
    setCollection('products', products);

    // Generate historical sales
    const sales = [];
    const payMethods = ['efectivo', 'tarjeta', 'nomina'];
    for (let day = 30; day >= 0; day--) {
        const numSales = Math.floor(Math.random() * 6) + 3;
        for (let s = 0; s < numSales; s++) {
            const clientIdx = Math.floor(Math.random() * clients.length);
            const numItems = Math.floor(Math.random() * 3) + 1;
            const items = [];
            const usedProducts = new Set();
            for (let i = 0; i < numItems; i++) {
                let pIdx;
                do { pIdx = Math.floor(Math.random() * products.length); } while (usedProducts.has(pIdx));
                usedProducts.add(pIdx);
                const qty = Math.floor(Math.random() * 2) + 1;
                items.push({ productId: products[pIdx].id, name: products[pIdx].name, price: products[pIdx].price, quantity: qty });
            }
            const total = items.reduce((sum, it) => sum + it.price * it.quantity, 0);
            const d = new Date(daysAgo(day));
            d.setHours(11 + Math.floor(Math.random() * 3), Math.floor(Math.random() * 60));
            sales.push({
                id: generateId(),
                clientId: clients[clientIdx].id,
                clientName: clients[clientIdx].name,
                clientCategory: clients[clientIdx].category,
                items,
                total,
                paymentMethod: payMethods[Math.floor(Math.random() * payMethods.length)],
                date: d.toISOString(),
                userId: 'usr-2'
            });
        }
    }
    setCollection('sales', sales);

    // Generate purchases
    const purchases = [];
    for (let i = 0; i < 10; i++) {
        const provIdx = Math.floor(Math.random() * providers.length);
        const numItems = Math.floor(Math.random() * 4) + 2;
        const items = [];
        const usedProducts = new Set();
        for (let j = 0; j < numItems; j++) {
            let pIdx;
            do { pIdx = Math.floor(Math.random() * products.length); } while (usedProducts.has(pIdx));
            usedProducts.add(pIdx);
            const qty = Math.floor(Math.random() * 20) + 10;
            items.push({ productId: products[pIdx].id, name: products[pIdx].name, cost: products[pIdx].cost, quantity: qty });
        }
        const total = items.reduce((sum, it) => sum + it.cost * it.quantity, 0);
        purchases.push({
            id: generateId(),
            providerId: providers[provIdx].id,
            providerName: providers[provIdx].name,
            items,
            total,
            date: daysAgo(Math.floor(Math.random() * 30)),
            userId: 'usr-3'
        });
    }
    setCollection('purchases', purchases);

    markSeeded();
}
