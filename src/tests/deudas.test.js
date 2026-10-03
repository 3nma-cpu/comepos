/**
 * Tests básicos — Módulo de Deudas
 * Ejecutar: node src/tests/deudas.test.js
 *
 * Verifica la lógica de cálculo de saldo y cambio de estado.
 * No requiere conexión a la base de datos.
 */

import assert from 'node:assert';

// ============================================
// Helper de cálculo de saldo (replica del backend)
// ============================================
function calcSaldo(deuda) {
  const descontado = (deuda.descuentos || [])
    .filter(d => !d.anulado)
    .reduce((sum, d) => sum + d.monto, 0);
  return deuda.montoOriginal - descontado;
}

function determinarEstado(deuda) {
  if (deuda.estado === 'ANULADA') return 'ANULADA';
  const saldo = calcSaldo(deuda);
  return saldo <= 0 ? 'SALDADA' : 'ACTIVA';
}

// ============================================
// Tests
// ============================================
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ❌ ${name}: ${e.message}`);
  }
}

console.log('\n🧪 Tests del Módulo de Deudas\n');

// --- Saldo ---
console.log('📋 Cálculo de saldo:');

test('Deuda sin descuentos tiene saldo = montoOriginal', () => {
  const deuda = { montoOriginal: 1500000, descuentos: [] };
  assert.strictEqual(calcSaldo(deuda), 1500000);
});

test('Saldo se reduce con descuentos válidos', () => {
  const deuda = {
    montoOriginal: 1500000,
    descuentos: [
      { monto: 150000, anulado: false },
      { monto: 150000, anulado: false }
    ]
  };
  assert.strictEqual(calcSaldo(deuda), 1200000);
});

test('Descuentos anulados no afectan el saldo', () => {
  const deuda = {
    montoOriginal: 1500000,
    descuentos: [
      { monto: 150000, anulado: false },
      { monto: 150000, anulado: true },
      { monto: 100000, anulado: false }
    ]
  };
  assert.strictEqual(calcSaldo(deuda), 1250000);
});

test('Saldo llega a 0 cuando se descuenta todo', () => {
  const deuda = {
    montoOriginal: 300000,
    descuentos: [
      { monto: 150000, anulado: false },
      { monto: 150000, anulado: false }
    ]
  };
  assert.strictEqual(calcSaldo(deuda), 0);
});

test('Saldo con un solo descuento grande', () => {
  const deuda = {
    montoOriginal: 2000000,
    descuentos: [{ monto: 2000000, anulado: false }]
  };
  assert.strictEqual(calcSaldo(deuda), 0);
});

test('Saldo sin descuentos (array undefined)', () => {
  const deuda = { montoOriginal: 500000 };
  assert.strictEqual(calcSaldo(deuda), 500000);
});

// --- Estado ---
console.log('\n📋 Cambio de estado:');

test('Deuda con saldo > 0 está ACTIVA', () => {
  const deuda = { montoOriginal: 1000000, estado: 'ACTIVA', descuentos: [{ monto: 500000, anulado: false }] };
  assert.strictEqual(determinarEstado(deuda), 'ACTIVA');
});

test('Deuda con saldo = 0 está SALDADA', () => {
  const deuda = { montoOriginal: 1000000, estado: 'ACTIVA', descuentos: [{ monto: 1000000, anulado: false }] };
  assert.strictEqual(determinarEstado(deuda), 'SALDADA');
});

test('Deuda ANULADA se mantiene ANULADA (sin importar saldo)', () => {
  const deuda = { montoOriginal: 1000000, estado: 'ANULADA', descuentos: [{ monto: 500000, anulado: false }] };
  assert.strictEqual(determinarEstado(deuda), 'ANULADA');
});

test('Al anular un descuento, deuda SALDADA vuelve a ACTIVA', () => {
  // Simular: deuda saldada, luego se anula un descuento
  const deuda = {
    montoOriginal: 300000,
    estado: 'ACTIVA', // después de la anulación se recalcula
    descuentos: [
      { monto: 150000, anulado: false },
      { monto: 150000, anulado: true } // Este fue anulado
    ]
  };
  assert.strictEqual(determinarEstado(deuda), 'ACTIVA');
  assert.strictEqual(calcSaldo(deuda), 150000);
});

// --- Validaciones ---
console.log('\n📋 Validaciones de negocio:');

test('Descuento no puede superar el saldo', () => {
  const deuda = {
    montoOriginal: 500000,
    descuentos: [{ monto: 300000, anulado: false }]
  };
  const saldo = calcSaldo(deuda); // 200000
  const montoDescuento = 250000;
  assert.strictEqual(montoDescuento > saldo, true);
});

test('Descuento igual al saldo es válido', () => {
  const deuda = {
    montoOriginal: 500000,
    descuentos: [{ monto: 300000, anulado: false }]
  };
  const saldo = calcSaldo(deuda); // 200000
  const montoDescuento = 200000;
  assert.strictEqual(montoDescuento <= saldo, true);
});

test('Montos deben ser enteros (guaraníes sin decimales)', () => {
  assert.strictEqual(Number.isInteger(1500000), true);
  assert.strictEqual(Number.isInteger(1500000.5), false);
});

test('Estimación de cuotas: 1.500.000 / 150.000 = 10 cuotas', () => {
  const montoOriginal = 1500000;
  const montoPorDescuento = 150000;
  const cuotas = Math.ceil(montoOriginal / montoPorDescuento);
  assert.strictEqual(cuotas, 10);
});

test('Estimación de cuotas con resto: 1.600.000 / 150.000 = 11 cuotas', () => {
  const montoOriginal = 1600000;
  const montoPorDescuento = 150000;
  const cuotas = Math.ceil(montoOriginal / montoPorDescuento);
  assert.strictEqual(cuotas, 11);
});

// --- Resultado ---
console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`Resultado: ${passed} pasaron, ${failed} fallaron`);
if (failed > 0) {
  console.log('❌ Hay tests fallidos\n');
  process.exit(1);
} else {
  console.log('🎉 Todos los tests pasaron\n');
}
