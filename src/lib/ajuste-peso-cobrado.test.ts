// Núcleo puro del ajuste por peso real de un pedido ya cobrado (src/lib/ajuste-peso-cobrado.ts) y
// del saldo de un pedido con una parte cobrada (src/lib/settlement/saldo-del-pedido.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cambiosDePeso,
  claveCobradoAntesDePesar,
  detalleDevolucionPorPeso,
  diferenciaDelAjuste,
  explicacionDelAjuste,
  leerAjusteDeLaAuditoria,
  mensajeAjusteCobradoRechazado,
  mensajeDelAjuste,
  planAjusteCobrado,
  type ResultadoAjustePeso,
} from "./ajuste-peso-cobrado";
import { saldoDelPedido, claveDelSaldoDelPedido } from "./settlement/saldo-del-pedido";
import { esDevolucionPorPeso, AJUSTE_PESO_ACTOR_PREFIX } from "./caja/devolucion-por-peso";

test("diferencia: pesó menos → devolver, al centavo", () => {
  assert.deepEqual(diferenciaDelAjuste(12400, 11000), { tipo: "devolver", monto: 1400 });
  // 0,1 + 0,2 no es 0,3 en coma flotante: la cuenta va en centavos.
  assert.deepEqual(diferenciaDelAjuste(0.3, 0.1 + 0.2), { tipo: "igual" });
  assert.deepEqual(diferenciaDelAjuste(1000.1, 999.99), { tipo: "devolver", monto: 0.11 });
});

test("diferencia: pesó más → cobrar; igual → nada", () => {
  assert.deepEqual(diferenciaDelAjuste(8500.5, 9100.75), { tipo: "cobrar", monto: 600.25 });
  assert.deepEqual(diferenciaDelAjuste(5000, 5000), { tipo: "igual" });
  // Medio centavo: redondea igual que el resto de la plata (centavosDe).
  const d = diferenciaDelAjuste(100, 100.004);
  assert.equal(d.tipo, "igual");
});

const BASE = { existe: true, status: "PREPARING", tieneVenta: true, yaAjustado: false, otrosCobros: false, factura: "sin-factura-viva" as const };

test("plan: un pedido cobrado en curso, con su venta, se ajusta", () => {
  assert.deepEqual(planAjusteCobrado(BASE), { ok: true });
  assert.deepEqual(planAjusteCobrado({ ...BASE, status: "READY" }), { ok: true });
});

test("plan: el segundo ajuste con plata se rechaza con «anulá y rehacé»", () => {
  const r = planAjusteCobrado({ ...BASE, yaAjustado: true });
  assert.deepEqual(r, { ok: false, motivo: "ya-ajustado" });
  const m = mensajeAjusteCobradoRechazado("ya-ajustado");
  assert.match(m, /ya se ajustó una vez/);
  assert.match(m, /anulá la venta y volvé a cargarla/);
});

test("plan: terminal, sin asiento único, varios medios y factura viva no se ajustan", () => {
  assert.deepEqual(planAjusteCobrado({ ...BASE, existe: false }), { ok: false, motivo: "no-existe" });
  assert.deepEqual(planAjusteCobrado({ ...BASE, status: "DELIVERED" }), { ok: false, motivo: "terminal" });
  assert.deepEqual(planAjusteCobrado({ ...BASE, status: "CANCELLED" }), { ok: false, motivo: "terminal" });
  assert.deepEqual(planAjusteCobrado({ ...BASE, tieneVenta: false }), { ok: false, motivo: "sin-asiento" });
  assert.deepEqual(planAjusteCobrado({ ...BASE, otrosCobros: true }), { ok: false, motivo: "sin-asiento" });
  assert.deepEqual(planAjusteCobrado({ ...BASE, factura: "autorizada" }), { ok: false, motivo: "facturada" });
  assert.deepEqual(planAjusteCobrado({ ...BASE, factura: "en-camino" }), { ok: false, motivo: "factura-en-camino" });
  // Terminal manda sobre ya-ajustado (lo entregado no se toca, ni para decir que ya se ajustó).
  assert.deepEqual(planAjusteCobrado({ ...BASE, status: "DELIVERED", yaAjustado: true }), { ok: false, motivo: "terminal" });
});

test("día cerrado: dice cuándo se puede ajustar", () => {
  const m = mensajeAjusteCobradoRechazado("dia-cerrado", { hoy: "2026-11-10", cerradoHasta: "2026-11-10" });
  assert.match(m, /ya está cerrada/);
});

test("detalle del egreso: Mercado Pago se devuelve a mano", () => {
  assert.equal(detalleDevolucionPorPeso(42, true), "Devolución por peso real del pedido #42 · devolver por Mercado Pago (a mano)");
  assert.equal(detalleDevolucionPorPeso(42, false), "Devolución por peso real del pedido #42");
  assert.ok(esDevolucionPorPeso({ createdBy: `${AJUSTE_PESO_ACTOR_PREFIX}u1` }));
  assert.ok(!esDevolucionPorPeso({ createdBy: "u1" }));
  assert.ok(!esDevolucionPorPeso({ createdBy: null }));
  assert.notEqual(claveCobradoAntesDePesar("o1"), claveDelSaldoDelPedido("o1"));
});

test("cambios de peso: sólo las líneas que cambiaron, por producto", () => {
  const antes = [
    { productId: "p1", name: "Vacío", saleUnit: "WEIGHT", quantity: 1.24 },
    { productId: "p2", name: "Chorizo", saleUnit: "UNIT", quantity: 4 },
    { productId: null, name: "Envío", saleUnit: "UNIT", quantity: 1 },
  ];
  const despues = [
    { productId: "p1", name: "Vacío", saleUnit: "WEIGHT", quantity: 1.1 },
    { productId: "p2", name: "Chorizo", saleUnit: "UNIT", quantity: 4 },
    { productId: null, name: "Envío", saleUnit: "UNIT", quantity: 1 },
  ];
  assert.deepEqual(cambiosDePeso(antes, despues), [{ nombre: "Vacío", unidad: "WEIGHT", antes: 1.24, despues: 1.1 }]);
  // Gramo fantasma de coma flotante: no es un cambio.
  assert.deepEqual(cambiosDePeso(antes, [{ ...despues[0], quantity: 1.2400000001 }, despues[1]]), []);
});

test("explicación del aviso: devolver, cobrar e igual", () => {
  const cambios = [{ nombre: "Vacío", unidad: "WEIGHT" as const, antes: 1.24, despues: 1.1 }];
  const dev = explicacionDelAjuste({ cambios, diferencia: { tipo: "devolver", monto: 1400 }, cobrado: 12400, porMercadoPago: true }, { pagado: true });
  assert.ok(dev);
  assert.match(dev, /^Pesó 1,1(00)? kg de Vacío en vez de 1,24(0)? kg; te devolvemos/);
  assert.match(dev, /por Mercado Pago\. Ya está pago\.$/);

  const mas = explicacionDelAjuste(
    { cambios: [{ ...cambios[0], despues: 1.4 }], diferencia: { tipo: "cobrar", monto: 1600 }, cobrado: 12400, porMercadoPago: false },
    { pagado: false, aCobrar: 1600 },
  );
  assert.ok(mas);
  assert.match(mas, /ya pagaste \$12\.400,00 y falta \$1\.600,00\.$/);
  // Ya cobró el saldo: no le dice que falta.
  const saldado = explicacionDelAjuste({ cambios, diferencia: { tipo: "cobrar", monto: 1600 }, cobrado: 12400, porMercadoPago: false }, { pagado: true });
  assert.match(saldado ?? "", /Ya está pago\.$/);

  assert.equal(explicacionDelAjuste({ cambios, diferencia: { tipo: "igual" }, cobrado: 1, porMercadoPago: false }, { pagado: true }), null);
  const muchos = Array.from({ length: 4 }, (_, i) => ({ ...cambios[0], nombre: `C${i}` }));
  assert.match(
    explicacionDelAjuste({ cambios: muchos, diferencia: { tipo: "devolver", monto: 10 }, cobrado: 100, porMercadoPago: false }, { pagado: true }) ?? "",
    /^Lo pesado cambió el total/,
  );
});

test("la auditoría se lee de vuelta (y lo roto da null)", () => {
  const resultado = { cambios: [{ nombre: "Vacío", unidad: "WEIGHT", antes: 1, despues: 0.9 }], diferencia: { tipo: "devolver", monto: 100 }, cobrado: 1000, porMercadoPago: false };
  const a = leerAjusteDeLaAuditoria({ clave: "x", resultado });
  assert.equal(a?.diferencia.tipo, "devolver");
  assert.equal(a?.cobrado, 1000);
  assert.equal(leerAjusteDeLaAuditoria(null), null);
  assert.equal(leerAjusteDeLaAuditoria({ resultado: { diferencia: { tipo: "otro" } } }), null);
});

test("mensaje del toast: dice qué hacer con la plata", () => {
  const base = { code: 7, antes: 12400, total: 11000, conPeso: true, cambios: [], repetido: false } as unknown as ResultadoAjustePeso;
  const dev = mensajeDelAjuste({ ...base, cobrado: 12400, diferencia: { tipo: "devolver", monto: 1400 }, porMercadoPago: true } as ResultadoAjustePeso);
  assert.match(dev, /Mercado Pago/);
  const mas = mensajeDelAjuste({ ...base, total: 13000, cobrado: 12400, diferencia: { tipo: "cobrar", monto: 600 }, porMercadoPago: false } as ResultadoAjustePeso);
  assert.match(mas, /a cobrar/);
});

test("saldo del pedido: al centavo y nunca negativo", () => {
  assert.equal(saldoDelPedido(13000, [12400]), 600);
  assert.equal(saldoDelPedido(0.3, [0.1, 0.2]), 0);
  assert.equal(saldoDelPedido(1000.1, [999.99]), 0.11);
  assert.equal(saldoDelPedido(100, [150]), 0);
  assert.equal(saldoDelPedido(100, []), 100);
});
