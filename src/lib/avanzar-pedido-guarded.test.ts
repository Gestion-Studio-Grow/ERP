// «Confirmar / Preparar / Marcar listo» en la bandeja: qué se dice cuando el paso no sale.
// Antes, un pedido que no existía (o que no era de este negocio) decía "cambió de estado en otra
// pantalla": la persona recargaba buscando un pedido movido que no estaba. Se ejecuta el cuerpo
// real (`avanzarPedidoGuarded`) con la base inyectada.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  avanzarPedidoGuarded,
  PEDIDO_NO_ENCONTRADO,
  PEDIDO_YA_CAMBIO_DE_ESTADO,
  type PasoDeBandeja,
} from "./order-anulacion";

/** Un pedido en memoria con el compare-and-set de la base (sólo escribe si sigue en `from`). */
function base(status: string | null, opts: { otraPestanaLoMueveA?: string } = {}) {
  let actual = status;
  const escrituras: Array<[string, PasoDeBandeja]> = [];
  return {
    escrituras,
    get status() {
      return actual;
    },
    leer: async () => (actual === null ? null : { status: actual }),
    escribir: async (from: string, to: PasoDeBandeja) => {
      if (opts.otraPestanaLoMueveA) actual = opts.otraPestanaLoMueveA; // entre leer y escribir
      if (actual !== from) return false;
      escrituras.push([from, to]);
      actual = to;
      return true;
    },
  };
}

test("el pedido no existe o no es de este negocio: lo dice así, y no escribe nada", async () => {
  const db = base(null);
  const r = await avanzarPedidoGuarded({ comercio: false, leer: db.leer, escribir: db.escribir });
  assert.deepEqual(r, { ok: false, motivo: "no-existe", error: PEDIDO_NO_ENCONTRADO });
  assert.equal(db.escrituras.length, 0);
  assert.ok(!/cambi/i.test(PEDIDO_NO_ENCONTRADO), "no le echa la culpa a otra pantalla");
  assert.notEqual(PEDIDO_NO_ENCONTRADO, PEDIDO_YA_CAMBIO_DE_ESTADO);
});

test("otra pestaña lo movió entre que se leyó y se escribió: 'ya había cambiado de estado'", async () => {
  const db = base("PENDING", { otraPestanaLoMueveA: "CONFIRMED" });
  const r = await avanzarPedidoGuarded({ comercio: false, leer: db.leer, escribir: db.escribir });
  assert.deepEqual(r, { ok: false, motivo: "ya-cambio", error: PEDIDO_YA_CAMBIO_DE_ESTADO });
  assert.equal(db.status, "CONFIRMED", "no lo empuja un paso de más");
});

test("ya está listo, entregado o anulado (el botón era de antes): 'ya había cambiado de estado'", async () => {
  for (const status of ["READY", "DELIVERED", "CANCELLED"]) {
    const db = base(status);
    const r = await avanzarPedidoGuarded({ comercio: true, leer: db.leer, escribir: db.escribir });
    assert.deepEqual(r, { ok: false, motivo: "ya-cambio", error: PEDIDO_YA_CAMBIO_DE_ESTADO }, status);
    assert.equal(db.escrituras.length, 0);
  }
});

test("avanza un paso: en servicios (CH) Nuevo → Confirmado; en comercio Nuevo → Preparando", async () => {
  const ch = base("PENDING");
  assert.deepEqual(await avanzarPedidoGuarded({ comercio: false, leer: ch.leer, escribir: ch.escribir }), {
    ok: true,
    from: "PENDING",
    to: "CONFIRMED",
  });
  const tienda = base("PENDING");
  assert.deepEqual(await avanzarPedidoGuarded({ comercio: true, leer: tienda.leer, escribir: tienda.escribir }), {
    ok: true,
    from: "PENDING",
    to: "PREPARING",
  });
  const preparando = base("PREPARING");
  const r = await avanzarPedidoGuarded({ comercio: true, leer: preparando.leer, escribir: preparando.escribir });
  assert.deepEqual(r, { ok: true, from: "PREPARING", to: "READY" });
});

test("advanceOrderStatus usa esta decisión, con el negocio en la lectura y en la escritura", () => {
  const src = readFileSync(new URL("./order-actions.ts", import.meta.url), "utf8");
  const i = src.indexOf("export async function advanceOrderStatus(");
  assert.ok(i >= 0);
  const cuerpo = src.slice(i, src.indexOf("\n}\n", i));
  assert.match(cuerpo, /avanzarPedidoGuarded\(/);
  assert.match(cuerpo, /findFirst\(\{ where: \{ id, tenantId \}/);
  assert.match(cuerpo, /updateMany\(\{\s*where: \{ id, tenantId, status: from \}/);
  assert.ok(!/cambiado de estado/.test(cuerpo), "el texto sale de la decisión, no de la action");
});
