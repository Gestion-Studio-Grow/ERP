// Pruebas de la regla del medio de cobro (MAG-1): cobrar exige ELEGIR el medio; nada lo
// asume. Se ejecuta la decisión con datos —canal × cobrado × medio— y, aparte, se verifica
// la forma: que los dos llamadores que cobran la usen y que el núcleo compartido con la
// vidriera y la ingesta externa NO la herede. Sin DB.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  medioDeCobroRequerido,
  leerMedioDeCobro,
  mensajeYaCobrado,
  MEDIOS_DE_COBRO,
  MENSAJE_FALTA_MEDIO_BANDEJA,
} from "./medio-cobro";
import { cashMethodFromPaymentMethod } from "./cierre-diario";

const CANALES = ["COUNTER", "ONLINE"] as const;
const BASURA = [null, undefined, "", "   ", "efectivo", "TARJETA", "EFECTIVO; DROP", 1, {}];

// ── 1. La matriz de la decisión ─────────────────────────────────────────────

test("cobrada y SIN medio: rechaza con mensaje, en los dos canales", () => {
  for (const channel of CANALES) {
    for (const paymentMethod of BASURA) {
      const r = medioDeCobroRequerido({ channel, paid: true, paymentMethod });
      assert.equal(r.ok, false, `${channel} + cobrada + ${JSON.stringify(paymentMethod)} tenía que rechazar`);
      if (!r.ok) assert.match(r.error, /Elegí cómo pagó/);
    }
  }
});

test("COUNTER + cobrada + null: el caso del sábado a la mañana, rechaza y dice qué hacer", () => {
  const r = medioDeCobroRequerido({ channel: "COUNTER", paid: true, paymentMethod: null });
  assert.deepEqual(r, {
    ok: false,
    error: "Elegí cómo pagó (Efectivo, Mercado Pago o Transferencia) antes de cobrar.",
  });
});

test("ONLINE + cobrado + sin medio: además ofrece la salida de dejarlo sin cobrar", () => {
  const r = medioDeCobroRequerido({ channel: "ONLINE", paid: true, paymentMethod: "" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /destildá «Cobrado»/);
});

test("cobrada con un medio válido: pasa con ESE medio, en los dos canales", () => {
  for (const channel of CANALES) {
    for (const medio of ["EFECTIVO", "MERCADOPAGO", "TRANSFERENCIA"] as const) {
      assert.deepEqual(medioDeCobroRequerido({ channel, paid: true, paymentMethod: medio }), {
        ok: true,
        paymentMethod: medio,
      });
    }
  }
});

test("MERCADOPAGO no se convierte en EFECTIVO (era lo que hacía setOrderPaidCore con lo desconocido)", () => {
  const r = medioDeCobroRequerido({ channel: "COUNTER", paid: true, paymentMethod: "MERCADOPAGO" });
  assert.deepEqual(r, { ok: true, paymentMethod: "MERCADOPAGO" });
});

test("no cobrada: pasa SIN medio, llegue lo que llegue (ONLINE sin cobrar no pide nada)", () => {
  for (const channel of CANALES) {
    for (const paymentMethod of [...BASURA, "EFECTIVO", "MERCADOPAGO", "TRANSFERENCIA"]) {
      assert.deepEqual(medioDeCobroRequerido({ channel, paid: false, paymentMethod }), {
        ok: true,
        paymentMethod: null,
      });
    }
  }
});

test("desde la bandeja (contexto cobro): sin medio rechaza con el mensaje de la bandeja", () => {
  assert.deepEqual(medioDeCobroRequerido({ paid: true, paymentMethod: "", contexto: "cobro" }), {
    ok: false,
    error: MENSAJE_FALTA_MEDIO_BANDEJA,
  });
  assert.deepEqual(
    medioDeCobroRequerido({ paid: true, paymentMethod: "TRANSFERENCIA", contexto: "cobro" }),
    { ok: true, paymentMethod: "TRANSFERENCIA" },
  );
});

test("leerMedioDeCobro: sólo los tres valores exactos; recorta espacios, no adivina mayúsculas", () => {
  assert.equal(leerMedioDeCobro(" MERCADOPAGO "), "MERCADOPAGO");
  assert.equal(leerMedioDeCobro("mercadopago"), null);
  assert.equal(leerMedioDeCobro("TARJETA"), null); // no existe en el enum todavía (backlog)
  assert.equal(leerMedioDeCobro(null), null);
});

// ── 2. Los chips que ve la persona ──────────────────────────────────────────

test("cada chip cae en una columna del libro (ninguno queda fuera de la caja)", () => {
  for (const m of MEDIOS_DE_COBRO) {
    assert.notEqual(cashMethodFromPaymentMethod(m.valor), null, `${m.valor} no tiene columna en el libro`);
  }
  assert.equal(cashMethodFromPaymentMethod("EFECTIVO"), "EFECTIVO");
  assert.equal(cashMethodFromPaymentMethod("MERCADOPAGO"), "MP");
});

test("el chip de MP dice «Mercado Pago» a secas: sin «tarjeta» (CH concilia MP contra el extracto)", () => {
  const mp = MEDIOS_DE_COBRO.find((m) => m.valor === "MERCADOPAGO");
  assert.equal(mp?.etiqueta, "Mercado Pago");
  for (const m of MEDIOS_DE_COBRO) assert.doesNotMatch(m.etiqueta, /tarjeta/i);
});

// ── 3. El segundo cobro del mismo pedido ────────────────────────────────────

test("ya cobrado con el MISMO medio: se informa y no es error", () => {
  assert.deepEqual(mensajeYaCobrado({ code: 12, medioRegistrado: "EFECTIVO", medioElegido: "EFECTIVO" }), {
    ok: true,
    mensaje: "El pedido #12 ya estaba cobrado con Efectivo.",
  });
});

test("ya cobrado con OTRO medio: se avisa como error, diciendo cuál quedó", () => {
  const r = mensajeYaCobrado({ code: 12, medioRegistrado: "EFECTIVO", medioElegido: "MERCADOPAGO" });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.match(r.error, /ya estaba cobrado con Efectivo, no con Mercado Pago/);
    assert.match(r.error, /No se cambió nada/);
  }
});

// ── 4. Forma: quién llama a la regla y quién no ─────────────────────────────
//
// No hay infraestructura para ejecutar createOrder / setOrderPaidCore contra una base (el
// runner es node --test sin mocks). Lo que se puede asegurar sin base es que el llamador USA
// la regla que arriba se ejecuta con datos, y que no sobrevive ningún relleno con EFECTIVO.

function cuerpoDe(src: string, firma: string): string {
  const i = src.indexOf(firma);
  assert.ok(i >= 0, `no encontré «${firma}»`);
  const fin = src.indexOf("\n}\n", i);
  return src.slice(i, fin === -1 ? undefined : fin);
}

// Se miran sólo las líneas de CÓDIGO: los comentarios nombran la regla para explicar por qué
// NO se llama en tal lado, y eso no puede contar como llamarla.
function soloCodigo(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\s\/\/\s.*$/gm, "");
}

const orderActions = soloCodigo(readFileSync(new URL("../order-actions.ts", import.meta.url), "utf8"));
const orderCore = soloCodigo(readFileSync(new URL("../order-core.ts", import.meta.url), "utf8"));

// No alcanza con que la llamen: tienen que CORTAR si la regla rechaza, antes de escribir, y
// grabar el medio que la regla devolvió, no el crudo del formulario.
function cortaConLaRegla(cuerpo: string, escritura: string) {
  const llamada = cuerpo.search(/const medio = medioDeCobroRequerido\(/);
  const corte = cuerpo.search(/if \(!medio\.ok\) return \{ ok: false, error: medio\.error \};/);
  const escribe = cuerpo.indexOf(escritura);
  assert.ok(llamada >= 0, "no llama a la regla");
  assert.ok(corte > llamada, "no corta cuando la regla rechaza");
  assert.ok(escribe > corte, `«${escritura}» corre antes del corte`);
  assert.match(cuerpo, /=\s*medio\.paymentMethod/);
}

test("createOrder y setOrderPaidCore llaman a medioDeCobroRequerido y cortan si rechaza", () => {
  const alta = cuerpoDe(orderActions, "export async function createOrder(");
  cortaConLaRegla(alta, "insertOrder(");
  // El medio crudo se lee UNA vez, adentro de la llamada a la regla.
  assert.equal(alta.split('formData.get("paymentMethod")').length - 1, 1);
  assert.match(alta, /medioDeCobroRequerido\(\{[^}]*paymentMethod: formData\.get\("paymentMethod"\)/);

  const cobro = cuerpoDe(orderActions, "async function setOrderPaidCore(");
  cortaConLaRegla(cobro, "tenantTransaction(");
  // `methodRaw` aparece en la firma y en la llamada a la regla, en ningún otro lado.
  assert.equal(cobro.split("methodRaw").length - 1, 2);
});

test("insertOrder (vidriera + ingesta externa) NO llama a la regla", () => {
  assert.doesNotMatch(orderCore, /medioDeCobroRequerido|medio-cobro/);
});

test("ya no queda ningún relleno con EFECTIVO en las acciones de cobro", () => {
  assert.doesNotMatch(orderActions, /\|\|\s*"EFECTIVO"/);
  assert.doesNotMatch(orderActions, /:\s*"EFECTIVO"\s*;/);
});

test("el cobro de un pedido (botón «Cobrar» y aviso de Mercado Pago) cobra sólo lo que no estaba cobrado (updateMany con paid:false)", () => {
  // `setOrderPaidCore` (order-actions.ts) y el aviso de pago usan el mismo cuerpo: cobrarPedidoEnTx.
  assert.match(cuerpoDe(orderActions, "async function setOrderPaidCore("), /cobrarPedidoEnTx\(/);
  const cuerpo = cuerpoDe(orderCore, "export async function cobrarPedidoEnTx(");
  assert.match(cuerpo, /updateMany\(\{\s*where:\s*\{\s*id:\s*args\.orderId,\s*tenantId,\s*paid:\s*false\s*\}/);
  assert.doesNotMatch(cuerpo, /tx\.order\.update\(/);
});
