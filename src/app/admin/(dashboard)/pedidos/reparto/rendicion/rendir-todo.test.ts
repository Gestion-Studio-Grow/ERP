// «Rindió todo como salió»: el aviso de la confirmación y el mensaje de lo rendido (puros).
import { test } from "node:test";
import assert from "node:assert/strict";
import { etiquetaDeConfirmar, mensajeDeRendirTodo, planDeRendirTodo, textoDelPlan } from "./rendir-todo";

test("el plan cuenta los pagos y suma lo que queda a cobrar, sin inventar cobros", () => {
  const plan = planDeRendirTodo([
    { cobrado: true, total: 10000 },
    { cobrado: false, total: 12000 },
    { cobrado: false, total: 13000.5 },
  ]);
  assert.deepEqual(plan, { envios: 3, yaPagos: 1, aCobrar: { cantidad: 2, monto: 25000.5 } });
  assert.match(textoDelPlan(plan), /^1 pago queda entregado · 2 quedan a cobrar por /);
  assert.equal(textoDelPlan(planDeRendirTodo([])), "No hay envíos en esta salida");
  assert.equal(etiquetaDeConfirmar(1), "Sí, rendir el envío");
  assert.equal(etiquetaDeConfirmar(4), "Sí, rendir los 4 envíos");
});

test("el mensaje dice lo rendido, lo que ya estaba y lo que no se pudo con su porqué", () => {
  const m = mensajeDeRendirTodo({
    rendidos: [
      { code: 1, como: "ya-pago", total: 10000, aCuenta: false },
      { code: 2, como: "cobrado", total: 11000, aCuenta: false },
      { code: 3, como: "a-cobrar", total: 12000, aCuenta: false },
      { code: 4, como: "a-cobrar", total: 9000, aCuenta: true },
    ],
    yaEstaban: [5],
    fallaron: [{ code: 6, error: "está anulado" }],
  });
  assert.match(m, /^Rendidos 4 envíos: 1 ya pagaba, 1 cobrado en la calle \(lo del libro\), 1 a cobrar por .+, 1 a la cuenta del cliente\./);
  assert.match(m, /Ya estaban rendidos: #5\./);
  assert.match(m, /No se rindió 1 envío: #6 \(está anulado\)/);
  assert.equal(mensajeDeRendirTodo({ rendidos: [], yaEstaban: [], fallaron: [] }), "No había nada para rendir en esta salida.");
});

test("la pantalla: «Rindió todo como salió» por salida, sólo con permiso, y con confirmación antes de rendir", async () => {
  const { readFileSync } = await import("node:fs");
  const s = readFileSync(new URL("./RendicionDelCadete.tsx", import.meta.url), "utf8");
  assert.match(s, /\{puedeOperar && <RendirTodaLaSalida s=\{s\} \/>\}/);
  assert.match(s, /onClick=\{\(\) => setConfirmando\(true\)\}>\s*Rindió todo como salió/);
  assert.match(s, /rendirTodoComoSalio\(aFormData\(\[\["reparto", s\.reparto\], \.\.\.s\.envios\.map/);
  assert.match(s, /No, rindo uno por uno/);
});
