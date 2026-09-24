// «Confirmar / Preparar / Marcar listo» en la bandeja: lo que no sale se dice en la fila.
// Se EJECUTA el lector de la respuesta con lo que puede devolver la acción hoy (void) y con un
// rechazo como el de las demás acciones de la bandeja.

import { test } from "node:test";
import assert from "node:assert/strict";
import { rechazoDeAccion, sinRespuestaAlAvanzar } from "./avanzar-pedido";

test("hoy la acción no devuelve nada: no hay rechazo que mostrar (la bandeja se redibuja con el estado que quedó)", () => {
  assert.equal(rechazoDeAccion(undefined), null);
  assert.equal(rechazoDeAccion(null), null);
  assert.equal(rechazoDeAccion({ ok: true, mensaje: "Pedido confirmado." }), null);
});

test("un rechazo devuelto se muestra con su texto entero", () => {
  assert.equal(
    rechazoDeAccion({ ok: false, error: "El pedido #12 ya estaba anulado: se actualizó la bandeja." }),
    "El pedido #12 ya estaba anulado: se actualizó la bandeja.",
  );
});

test("un rechazo sin texto no queda mudo: dice cómo seguir", () => {
  const t = rechazoDeAccion({ ok: false, error: "  " });
  assert.ok(t && /Recargá la bandeja/.test(t));
  assert.ok(rechazoDeAccion({ ok: false }));
});

test("sin respuesta: nombra el paso y el pedido, y dice que reintentar es seguro", () => {
  const t = sinRespuestaAlAvanzar("Marcar listo", 57);
  assert.match(t, /«Marcar listo» el pedido #57/);
  assert.match(t, /Revisá la conexión/);
  assert.match(t, /si ya se había hecho, no pasa nada/);
});

test("con señal, falló el servidor: no se manda a revisar la conexión", () => {
  const t = sinRespuestaAlAvanzar("Preparar", 12, true);
  assert.match(t, /«Preparar» el pedido #12/);
  assert.doesNotMatch(t, /conexión/);
  assert.match(t, /Recargá la bandeja/);
  assert.match(t, /si ya se había hecho, no pasa nada/);
});
