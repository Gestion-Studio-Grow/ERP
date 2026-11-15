// Recorrido del PR #166 (MIA, 14/11): reglas PURAS de los arreglos. Deterministas, sin base.
//  1. Una rendición (o un gasto cargado aparte al mismo proveedor) mientras quedan cuotas a proveedor por pagar: si pagó
//     una de esas cuotas, el costo real la cuenta dos veces. El sistema no tiene cómo saberlo (no hay enlace): no resta
//     nada a ciegas, dice hasta cuánto puede estar repetido.
//  2. Una cuota cubierta por sus partes queda saldada (no «Pendiente · Falta $ 0»).
//  5. La tabla por rubro cierra con la Diferencia; «1,234.50» se lee como mil doscientos; ningún aviso dice «le faltan $ 0».

import { test } from "node:test";
import assert from "node:assert/strict";
import { costoEnDuda, desvioPorRubro, resultadoReal, totales, COMPROBANTE_DE_RENDICION } from "./core";
import { cubiertasPorSusPartes, descontarPartes, porPagarComoGastos, porPagarDeCuotas } from "./pago-parcial-core";
import { numeroDe } from "./ficha-core";
import { avisoSaldoCambio } from "./avisos-cuota";

const nbsp = (s: string) => s.replace(/ /g, " ");
const sinCuota = new Set<string>();
const gasto = (id: string, neto: number, extra: Partial<{ supplierId: string | null; comprobante: string | null; anuladoEl: Date | null }> = {}) => ({
  id,
  rubro: "General",
  neto,
  iva: 0,
  pagadoEl: new Date("2026-11-10T12:00:00Z"),
  anuladoEl: null,
  supplierId: null,
  comprobante: null,
  ...extra,
});

test("1: rendición de $ 3.120.000 + cuotas del mismo ítem por pagar ($ 19.000.000) → avisa hasta $ 3.120.000 repetidos, no resta a ciegas", () => {
  const rendicion = gasto("r1", 3_120_000, { comprobante: COMPROBANTE_DE_RENDICION });
  const t = totales([{ cantidad: 1, costo: 19_000_000, precio: 25_000_000 }], 21);
  const real = resultadoReal(t, [rendicion], 19_000_000);
  assert.equal(real.costoReal, 22_120_000, "sin un enlace no se sabe si la rendición pagó la cuota: no se descuenta sola");
  assert.equal(costoEnDuda([rendicion], sinCuota, 19_000_000, new Set()), 3_120_000);
});

test("1: lo que salió de una cuota (su pago o una parte) no está en duda; sin deuda comprometida, nada está en duda", () => {
  const parte = gasto("g1", 2_000_000, { supplierId: "prov" });
  assert.equal(costoEnDuda([parte], new Set(["g1"]), 8_000_000, new Set(["prov"])), 0, "enlazado a su cuota por el «Asiento»");
  const rendicion = gasto("r1", 500, { comprobante: COMPROBANTE_DE_RENDICION });
  assert.equal(costoEnDuda([rendicion], sinCuota, 0, new Set()), 0, "nada por pagar: no puede repetir nada");
  assert.equal(costoEnDuda([{ ...rendicion, anuladoEl: new Date() }], sinCuota, 900, new Set()), 0, "una rendición rechazada (gasto anulado) no cuenta");
});

test("1: un gasto suelto al MISMO proveedor que tiene cuotas por pagar está en duda; a otro proveedor o sin proveedor, no", () => {
  const mismo = gasto("a", 300, { supplierId: "prov" });
  const otro = gasto("b", 400, { supplierId: "otro" });
  const suelto = gasto("c", 500);
  assert.equal(costoEnDuda([mismo, otro, suelto], sinCuota, 1_000, new Set(["prov"])), 300);
});

test("1: lo que puede estar repetido nunca pasa de lo que falta pagar por cuotas", () => {
  const r = gasto("r", 5_000, { comprobante: COMPROBANTE_DE_RENDICION });
  assert.equal(costoEnDuda([r], sinCuota, 1_200, new Set()), 1_200);
});

test("2: anticipo de 50 % a 20 % con $ 2.000.000 pagados en parte → la cuota queda cubierta por sus partes (se salda)", () => {
  // Ítem de $ 10.000.000: el plan nuevo pide anticipo 2.000.000 y saldo 8.000.000; ya se pagaron 2.000.000 del anticipo viejo.
  const plan = [
    { clave: "p:i:anticipo", monto: 2_000_000 },
    { clave: "p:i:saldo", monto: 8_000_000 },
  ];
  const partes = new Map([["p:i:anticipo", 2_000_000]]);
  const ajustado = descontarPartes(plan, partes, new Set());
  assert.deepEqual(ajustado, plan);
  assert.deepEqual([...cubiertasPorSusPartes(ajustado, partes)], ["p:i:anticipo"]);
});

test("2: partes de más (anticipo a 20 % con 2.500.000 pagados) → la cuota no baja de lo pagado y queda cubierta; el saldo absorbe", () => {
  const plan = [
    { clave: "p:i:anticipo", monto: 2_000_000 },
    { clave: "p:i:saldo", monto: 8_000_000 },
  ];
  const partes = new Map([["p:i:anticipo", 2_500_000]]);
  const ajustado = descontarPartes(plan, partes, new Set());
  assert.deepEqual(ajustado, [
    { clave: "p:i:anticipo", monto: 2_500_000 },
    { clave: "p:i:saldo", monto: 7_500_000 },
  ]);
  assert.deepEqual([...cubiertasPorSusPartes(ajustado, partes)], ["p:i:anticipo"]);
});

test("2: una parte que no llega no salda; al centavo, sí", () => {
  const plan = [{ clave: "p:i:anticipo", monto: 300 }];
  assert.equal(cubiertasPorSusPartes(plan, new Map([["p:i:anticipo", 299.99]])).size, 0);
  assert.equal(cubiertasPorSusPartes(plan, new Map([["p:i:anticipo", 299.996]])).size, 1, "redondeado al centavo, alcanza");
  assert.equal(cubiertasPorSusPartes(plan, new Map()).size, 0);
});

test("5: la tabla por rubro suma lo mismo que la Diferencia (las cuotas por pagar van al rubro de su ítem)", () => {
  const tc = { USD: 1000 };
  const cuotas = [
    { id: "q1", clave: "p:item1:saldo", tipo: "PAGO", monto: 500, moneda: "ARS", pagadoEl: null, anuladoEl: null },
    { id: "q2", clave: "p:item2:anticipo", tipo: "PAGO", monto: 1, moneda: "USD", pagadoEl: null, anuladoEl: null },
    { id: "q3", clave: null, tipo: "PAGO", monto: 70, moneda: "ARS", pagadoEl: null, anuladoEl: null },
    { id: "q4", clave: "p:cliente:saldo", tipo: "COBRO", monto: 9_999, moneda: "ARS", pagadoEl: null, anuladoEl: null },
    { id: "q5", clave: "p:item1:anticipo", tipo: "PAGO", monto: 400, moneda: "ARS", pagadoEl: new Date(), anuladoEl: null },
  ];
  const pagados = new Map([["q1", 200]]);
  const rubroDeItem = new Map([["item1", "Carpintería"], ["item2", "Iluminación"]]);
  const comprometidos = porPagarComoGastos(cuotas, pagados, tc, rubroDeItem);
  assert.deepEqual(
    comprometidos.map((c) => [c.rubro, c.neto]),
    [["Carpintería", 300], ["Iluminación", 1000], ["General", 70]],
  );
  const total = porPagarDeCuotas(cuotas, pagados, tc);
  assert.equal(comprometidos.reduce((s, c) => s + c.neto, 0), total);

  const items = [
    { rubro: "Carpintería", cantidad: 1, costo: 800, precio: 1000 },
    { rubro: "Iluminación", cantidad: 1, costo: 1000, precio: 1500 },
  ];
  const gastos = [{ rubro: "Carpintería", neto: 400, iva: 0, pagadoEl: new Date(), anuladoEl: null }];
  const real = resultadoReal(totales(items, 21), gastos, total);
  const filas = desvioPorRubro(items, [...gastos, ...comprometidos]);
  assert.equal(filas.reduce((s, f) => s + f.diferencia, 0), real.desvio, "la tabla cierra con la Diferencia de arriba");
});

test("5: «1,234.50» es mil doscientos treinta y cuatro con cincuenta, no 1,2345; lo ambiguo no se lee", () => {
  assert.equal(numeroDe("1,234.50"), 1234.5);
  assert.equal(numeroDe("12,345,678.90"), 12_345_678.9);
  assert.equal(numeroDe("1.234,50"), 1234.5, "como lo escribe una persona acá, igual que siempre");
  assert.equal(numeroDe("1,5"), 1.5);
  assert.equal(numeroDe("1.500"), 1500);
  assert.equal(numeroDe("1,2,3"), null, "no se adivina: se pide escribirlo bien");
  assert.equal(numeroDe("1,2.3"), null, "miles mal agrupados: tampoco (certificación)");
});

test("5: si mientras tanto la cuota quedó cubierta, el aviso no dice «le faltan $ 0»", () => {
  const txt = nbsp(avisoSaldoCambio(300, 0, "ARS", false));
  assert.doesNotMatch(txt, /faltan \$\s?0\b/);
  assert.match(txt, /No se asentó nada/);
  assert.match(txt, /ya no le falta nada/);
  assert.match(nbsp(avisoSaldoCambio(300, 0.004, "USD", true)), /ya no le falta nada/, "menos de medio centavo es nada");
});
