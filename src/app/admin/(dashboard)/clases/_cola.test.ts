// La cola de avisos: «1 de N», Después, y que nunca se cierre sola (M-034, M-035).

import { test } from "node:test";
import assert from "node:assert/strict";
import { COLA_VACIA, cola, etiquetaAvisar, resumenFinal, terminada, type ItemAviso } from "./_cola";

const it = (nombre: string, extra: Partial<ItemAviso> = {}): ItemAviso => ({ texto: "Confirmada", nombre, wa: `https://wa.me/549?text=${nombre}`, avisoId: `av-${nombre}`, ...extra });

test("tres confirmados: «Avisar a Juan (1 de 3)» y al tocar el link pasa a «2 de 3»", () => {
  let e = cola(COLA_VACIA, { tipo: "encolar", items: [it("Juan Pérez"), it("Ana"), it("Beto")] });
  assert.equal(etiquetaAvisar(e), "Avisar a Juan (1 de 3)");
  e = cola(e, { tipo: "avisado" });
  assert.equal(etiquetaAvisar(e), "Avisar a Ana (2 de 3)");
  assert.equal(e.avisados, 1);
});

test("«Después» lo saltea sin marcarlo y lo cuenta para «Sin avisar»", () => {
  let e = cola(COLA_VACIA, { tipo: "encolar", items: [it("Juan"), it("Ana")] });
  e = cola(e, { tipo: "despues" });
  e = cola(e, { tipo: "avisado" });
  assert.ok(terminada(e));
  assert.equal(e.despues, 1);
  assert.equal(resumenFinal(e), "Le avisaste a Ana · 1 quedó en «Sin avisar»");
});

test("nunca se cierra sola: pasando por todos queda el resumen hasta «Cerrar»", () => {
  let e = cola(COLA_VACIA, { tipo: "encolar", items: [it("Juan")] });
  assert.equal(etiquetaAvisar(e), "Avisarle a Juan por WhatsApp");
  e = cola(e, { tipo: "avisado" });
  assert.ok(terminada(e), "sigue a la vista con el resumen");
  assert.equal(e.items.length, 1);
  e = cola(e, { tipo: "cerrar" });
  assert.deepEqual(e, COLA_VACIA);
});

test("un resultado sin WhatsApp se cierra con su «Listo» (no pide un toque de más)", () => {
  let e = cola(COLA_VACIA, { tipo: "encolar", items: [{ texto: "Pago validado", nombre: "Juan" }] });
  e = cola(e, { tipo: "siguiente" });
  assert.deepEqual(e, COLA_VACIA);
});

test("un aviso nuevo a mitad de cola se suma al final, no pisa a los que faltan", () => {
  let e = cola(COLA_VACIA, { tipo: "encolar", items: [it("Juan"), it("Ana")] });
  e = cola(e, { tipo: "avisado" });
  e = cola(e, { tipo: "encolar", items: [it("Beto")] });
  assert.equal(etiquetaAvisar(e), "Avisar a Ana (2 de 3)");
});

test("con la cola terminada, un aviso nuevo arranca de cero", () => {
  let e = cola(COLA_VACIA, { tipo: "encolar", items: [it("Juan")] });
  e = cola(e, { tipo: "avisado" });
  e = cola(e, { tipo: "encolar", items: [it("Ana")] });
  assert.equal(etiquetaAvisar(e), "Avisarle a Ana por WhatsApp");
  assert.equal(e.avisados, 0);
});

test("encolar nada no abre la cola; acciones sobre la cola vacía no hacen nada", () => {
  assert.deepEqual(cola(COLA_VACIA, { tipo: "encolar", items: [] }), COLA_VACIA);
  assert.deepEqual(cola(COLA_VACIA, { tipo: "avisado" }), COLA_VACIA);
  assert.deepEqual(cola(COLA_VACIA, { tipo: "despues" }), COLA_VACIA);
});
