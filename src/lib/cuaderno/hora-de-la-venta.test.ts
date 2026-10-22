// La regla de la hora de una venta del cuaderno (pura): la misma en la pantalla y en `createOrder`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { businessWallTimeToUtc } from "@/lib/datetime";
import {
  CUADERNO_SIN_PERMISO,
  CUADERNO_SOLO_VENTA_COBRADA,
  decidirHoraDelCuaderno,
  diasEntre,
  horaDelCuaderno,
  primerDiaDelCuaderno,
  type VentaParaElCuaderno,
} from "./hora-de-la-venta";

const COBRADA: VentaParaElCuaderno = { channel: "COUNTER", fulfillment: "PICKUP", cobrada: true, aCuenta: false, pagoDividido: false, cupon: false };
// Sábado 24/10/2026, 15:00 en Buenos Aires.
const AHORA = businessWallTimeToUtc("2026-10-24", "15:00");
const decidir = (crudo: string, o: Partial<Parameters<typeof decidirHoraDelCuaderno>[0]> = {}) =>
  decidirHoraDelCuaderno({ crudo, ahora: AHORA, rol: "RECEPTION", cerradoHasta: null, venta: COBRADA, ...o });

test("una venta de hoy a las 11:20 entra con esa hora, en el día del negocio", () => {
  const r = decidir("2026-10-24T11:20");
  assert.ok(r.ok);
  assert.equal(r.en.toISOString(), businessWallTimeToUtc("2026-10-24", "11:20").toISOString());
  assert.equal(r.dia, "2026-10-24");
  assert.equal(horaDelCuaderno(" 2026-10-24 ", "11:20 "), "2026-10-24T11:20");
});

test("nunca en el futuro (2 minutos de tolerancia por el reloj del equipo)", () => {
  assert.ok(decidir("2026-10-24T15:01").ok);
  const r = decidir("2026-10-24T15:30");
  assert.ok(!r.ok);
  assert.match(r.error, /15:30 del 24\/10\/2026 todavía no pasaron/);
  assert.ok(!decidir("2026-10-25T09:00").ok);
});

test("lo ilegible o una fecha que no existe se rechaza con el ejemplo", () => {
  for (const crudo of ["", "11:20", "2026-02-30T10:00", "2026-10-24T25:00", "ayer a la mañana"]) {
    const r = decidir(crudo);
    assert.ok(!r.ok, crudo);
    assert.match(r.error, /por ejemplo, 11:20/);
  }
});

test("la ventana del rol: el Mostrador hasta 2 días atrás, el Dueño hasta 7, el profesional no carga", () => {
  assert.ok(decidir("2026-10-22T19:00").ok, "el jueves, el sábado: 2 días");
  const r = decidir("2026-10-21T19:00");
  assert.ok(!r.ok);
  assert.match(r.error, /más de 2 días las carga el dueño/);
  assert.ok(decidir("2026-10-17T10:00", { rol: "OWNER" }).ok, "7 días");
  const d = decidir("2026-10-16T10:00", { rol: "OWNER" });
  assert.ok(!d.ok);
  assert.match(d.error, /hasta 7 días después/);
  assert.deepEqual(decidir("2026-10-24T11:00", { rol: "PROFESSIONAL" }), { ok: false, error: CUADERNO_SIN_PERMISO });
  assert.equal(primerDiaDelCuaderno("RECEPTION", "2026-10-24"), "2026-10-22");
  assert.equal(primerDiaDelCuaderno("OWNER", "2026-03-03"), "2026-02-24");
  assert.equal(primerDiaDelCuaderno("PROFESSIONAL", "2026-10-24"), null);
  assert.equal(diasEntre("2026-12-31", "2027-01-02"), 2);
});

test("el día cerrado no entra y dice por qué; el día siguiente al cierre sí", () => {
  const r = decidir("2026-10-23T11:20", { cerradoHasta: "2026-10-23" });
  assert.ok(!r.ok);
  assert.match(r.error, /El 23\/10\/2026 ya está cerrado \(la caja se cerró hasta el 23\/10\/2026\)/);
  assert.match(r.error, /No se grabó nada/);
  assert.ok(!decidir("2026-10-22T11:20", { cerradoHasta: "2026-10-23" }).ok, "todo lo anterior al cierre también");
  assert.ok(decidir("2026-10-24T11:20", { cerradoHasta: "2026-10-23" }).ok);
});

test("sólo la venta de mostrador cobrada con UN medio: ni pedido, ni a cuenta, ni dividido, ni cupón, ni sin cobrar", () => {
  const malas: Partial<VentaParaElCuaderno>[] = [
    { channel: "ONLINE" },
    { fulfillment: "DELIVERY" },
    { cobrada: false },
    { aCuenta: true },
    { pagoDividido: true },
    { cupon: true },
  ];
  for (const m of malas) {
    assert.deepEqual(decidir("2026-10-24T11:20", { venta: { ...COBRADA, ...m } }), { ok: false, error: CUADERNO_SOLO_VENTA_COBRADA }, JSON.stringify(m));
  }
});
