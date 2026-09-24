// Sin señal a mitad del cobro: qué se dice, si se reintenta y con qué clave. Se EJECUTAN las
// decisiones de cobro-sin-conexion.ts; el recorrido en el navegador (lo cargado queda, el
// reintento viaja con la misma clave, el servidor no cobra dos veces) está en
// vender-pantalla.test.ts.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  antesDeCobrar,
  avisoDeCambioDespuesDelCorte,
  avisoDelCobro,
  cambioDespuesDelCorte,
  claveParaCobrar,
  etiquetaDeOtraVenta,
  etiquetaDeReintento,
  fallaDeRed,
  firmaDelCobro,
  rechazoDelServidor,
  recordarEnvioSinRespuesta,
  volvioLaSenal,
} from "./cobro-sin-conexion";

test("con señal, antes de cobrar no hay nada que decir", () => {
  assert.equal(antesDeCobrar(true), null);
});

test("sin señal: no se cobró, lo cargado sigue, y el botón pasa a reintentar", () => {
  const f = antesDeCobrar(false);
  assert.ok(f);
  assert.equal(f.titulo, "No hay conexión. La venta no se cobró.");
  assert.match(f.comoSeguir, /Lo que cargaste sigue acá/);
  assert.match(f.comoSeguir, /«Reintentar cobro»/);
  assert.equal(f.reintentar, true);
  // En un pedido no se cobra nada: se dice "no se registró".
  assert.equal(antesDeCobrar(false, true)?.titulo, "No hay conexión. El pedido no se registró.");
  assert.match(antesDeCobrar(false, true)?.comoSeguir ?? "", /«Reintentar el pedido»/);
});

test("sin señal y la señal volvió: no hay duda que aclarar, sólo tocar el botón", () => {
  const v = volvioLaSenal();
  assert.equal(v.titulo, "Volvió la conexión. La venta todavía no se cobró.");
  assert.match(v.comoSeguir, /tocá «Reintentar cobro»/);
  assert.equal(v.reintentar, true);
  assert.equal(volvioLaSenal(true).titulo, "Volvió la conexión. El pedido todavía no se registró.");
});

test("se cortó a mitad: no se afirma que no se grabó, y se promete lo que el servidor cumple", () => {
  const sinSenal = fallaDeRed(false);
  assert.equal(sinSenal.titulo, "Se cortó la conexión y no sabemos si la venta se grabó.");
  assert.match(sinSenal.comoSeguir, /Cuando vuelva la señal/);
  assert.match(sinSenal.comoSeguir, /no se cobra dos veces/);
  assert.equal(sinSenal.reintentar, true);
  // Volvió la señal: ya no se dice "cuando vuelva".
  const conSenal = fallaDeRed(true);
  assert.doesNotMatch(conSenal.comoSeguir, /Cuando vuelva/);
  assert.match(conSenal.comoSeguir, /Tocá «Reintentar cobro»/);
  assert.match(fallaDeRed(true, true).comoSeguir, /no se registra dos veces/);
});

test("un rechazo del servidor se muestra entero y NO convierte el botón en reintentar", () => {
  const r = rechazoDelServidor("Sin stock suficiente de \"Vacío\" para descontar 2.");
  assert.equal(r.titulo, "La venta no se cobró.");
  assert.equal(r.comoSeguir, "Sin stock suficiente de \"Vacío\" para descontar 2.");
  assert.equal(r.reintentar, false);
  assert.equal(rechazoDelServidor("  ").comoSeguir, "Revisá lo cargado y volvé a intentar.");
});

test("la clave del ticket: el reintento reusa la misma; un ticket nuevo estrena una", () => {
  let generadas = 0;
  const nueva = () => `k${++generadas}`;
  const primera = claveParaCobrar("", nueva);
  assert.equal(primera, "k1");
  // Falla de red → el ticket conserva su clave → el reintento viaja con la MISMA.
  assert.equal(claveParaCobrar(primera, nueva), "k1");
  assert.equal(generadas, 1, "no se generó otra");
  // Cobro bueno → el ticket se limpia (clave "") → la venta siguiente estrena una.
  assert.equal(claveParaCobrar("", nueva), "k2");
});

test("las etiquetas del botón", () => {
  assert.equal(etiquetaDeReintento(), "Reintentar cobro");
  assert.equal(etiquetaDeReintento(true), "Reintentar el pedido");
});

// La venta que se cortó: Vacío 1,240 kg en efectivo, $15.500.
const cortada = {
  lineas: [{ productId: "p_vacio", cantidad: 1.24 }],
  manuales: [],
  medio: "EFECTIVO",
  total: 15500,
  esPedido: false,
};

test("después del corte: sólo es la misma venta si la plata y el stock son los mismos", () => {
  const mandada = firmaDelCobro(cortada);
  // Tal cual (el peso se leyó igual, "1,240" o "1.24"): se reintenta con la misma clave.
  assert.equal(cambioDespuesDelCorte(mandada, firmaDelCobro({ ...cortada, lineas: [{ productId: "p_vacio", cantidad: 1.24 }] })), false);
  // El nombre de una línea a mano, con otro espacio o mayúscula, sigue siendo lo mismo.
  const conBolsa = { ...cortada, manuales: [{ nombre: "Bolsa", importe: 500 }], total: 16000 };
  assert.equal(cambioDespuesDelCorte(firmaDelCobro(conBolsa), firmaDelCobro({ ...conBolsa, manuales: [{ nombre: " bolsa ", importe: 500 }] })), false);
  // Se sumó un corte: si la cortada se había grabado, el servidor diría "ya estaba registrada"
  // y la Entraña quedaría cobrada sin venta. No es la misma.
  const conEntrana = { ...cortada, lineas: [...cortada.lineas, { productId: "p_entrana", cantidad: 0.95 }], total: 32125 };
  assert.equal(cambioDespuesDelCorte(mandada, firmaDelCobro(conEntrana)), true);
  // Otro medio: la caja lo contaría en el medio viejo.
  assert.equal(cambioDespuesDelCorte(mandada, firmaDelCobro({ ...cortada, medio: "MERCADO_PAGO" })), true);
  // Un descuento (cambia el total con las mismas líneas).
  assert.equal(cambioDespuesDelCorte(mandada, firmaDelCobro({ ...cortada, total: 13950 })), true);
  // Otro peso.
  assert.equal(cambioDespuesDelCorte(mandada, firmaDelCobro({ ...cortada, lineas: [{ productId: "p_vacio", cantidad: 1.3 }] })), true);
  // Un pedido no es una venta aunque lleve lo mismo.
  assert.equal(cambioDespuesDelCorte(mandada, firmaDelCobro({ ...cortada, esPedido: true })), true);
});

test("si cambió después del corte: se dice el total de la cortada y cómo salir, sin reintentar", () => {
  const a = avisoDeCambioDespuesDelCorte("$ 15.500,00");
  assert.equal(a.titulo, "Cambiaste la venta después del corte.");
  assert.match(a.comoSeguir, /era de \$ 15\.500,00 y puede haberse grabado/);
  assert.match(a.comoSeguir, /Ventas del día/);
  assert.match(a.comoSeguir, /«Es otra venta»/);
  assert.equal(a.reintentar, false, "el botón no invita a reintentar con otro monto");
  const p = avisoDeCambioDespuesDelCorte("$ 6.250,00", true);
  assert.match(p.comoSeguir, /Pedidos para preparar/);
  assert.match(p.comoSeguir, /«Es otro pedido»/);
  assert.equal(etiquetaDeOtraVenta(), "Es otra venta");
});

// La secuencia que rompía: se corta con A (puede haberse grabado), el reintento sale sin señal,
// el cajero suma B y vuelve la señal. La duda de A no se borra con el intento sin señal.
test("corte → reintento sin señal → se suma un corte → vuelve la señal: frenado, nunca 'no se cobró'", () => {
  const firmaA = firmaDelCobro(cortada);
  const firmaAB = firmaDelCobro({ ...cortada, lineas: [...cortada.lineas, { productId: "p_entrana", cantidad: 0.95 }], total: 32125 });
  // 1. Se mandó A y no volvió respuesta.
  let sinRespuesta = recordarEnvioSinRespuesta(null, { firma: firmaA, total: 15500 });
  const conDuda = (firma: string) => ({ cambio: cambioDespuesDelCorte(sinRespuesta.firma, firma), totalMandado: "$ 15.500,00" });
  let aviso = avisoDelCobro({ falla: { tipo: "red" }, sinRespuesta: conDuda(firmaA), enLinea: false });
  assert.equal(aviso?.titulo, "Se cortó la conexión y no sabemos si la venta se grabó.");
  // 2. Reintento sin señal: no sale nada, pero la cortada sigue en duda.
  aviso = avisoDelCobro({ falla: { tipo: "sin-senal" }, sinRespuesta: conDuda(firmaA), enLinea: false });
  assert.equal(aviso?.titulo, "Se cortó la conexión y no sabemos si la venta se grabó.");
  assert.doesNotMatch(aviso?.titulo ?? "", /no se cobró/);
  assert.equal(aviso?.reintentar, true);
  // 3. Suma B (sigue sin señal): frenado, con el total de la cortada.
  aviso = avisoDelCobro({ falla: { tipo: "sin-senal" }, sinRespuesta: conDuda(firmaAB), enLinea: false });
  assert.equal(aviso?.titulo, "Cambiaste la venta después del corte.");
  assert.equal(aviso?.reintentar, false, "no se ofrece reintentar con el total nuevo");
  assert.match(aviso?.comoSeguir ?? "", /era de \$ 15\.500,00/);
  // 4. Vuelve la señal: sigue frenado (antes decía "Volvió la conexión. La venta todavía no se cobró.").
  aviso = avisoDelCobro({ falla: { tipo: "sin-senal" }, sinRespuesta: conDuda(firmaAB), enLinea: true });
  assert.equal(aviso?.titulo, "Cambiaste la venta después del corte.");
  // 5. La deja como estaba y vuelve la señal: se reintenta la misma, diciendo que no se sabe.
  aviso = avisoDelCobro({ falla: { tipo: "sin-senal" }, sinRespuesta: conDuda(firmaA), enLinea: true });
  assert.equal(aviso?.titulo, "Se cortó la conexión y no sabemos si la venta se grabó.");
  assert.match(aviso?.comoSeguir ?? "", /Tocá «Reintentar cobro»/);
  // Otro corte con la misma venta: se recuerda la primera.
  sinRespuesta = recordarEnvioSinRespuesta(sinRespuesta, { firma: firmaA, total: 15500 });
  assert.equal(sinRespuesta.total, 15500);
  assert.deepEqual(recordarEnvioSinRespuesta({ firma: "x", total: 1 }, { firma: "y", total: 2 }), { firma: "x", total: 1 });
});

test("sin nada mandado antes, «sin señal» sí es seguro que no salió", () => {
  assert.equal(avisoDelCobro({ falla: { tipo: "sin-senal" }, sinRespuesta: null, enLinea: false })?.titulo, "No hay conexión. La venta no se cobró.");
  assert.equal(avisoDelCobro({ falla: { tipo: "sin-senal" }, sinRespuesta: null, enLinea: true })?.titulo, "Volvió la conexión. La venta todavía no se cobró.");
  assert.equal(avisoDelCobro({ falla: null, sinRespuesta: null, enLinea: true }), null);
});

test("un rechazo después de un corte no afirma que la cortada no se grabó", () => {
  // Sin corte previo: es seguro que no se cobró.
  assert.equal(avisoDelCobro({ falla: { tipo: "rechazo", error: "Sin stock." }, sinRespuesta: null, enLinea: true })?.titulo, "La venta no se cobró.");
  // Con corte previo: createOrder puede rechazar antes de mirar la clave (día cerrado).
  const r = avisoDelCobro({
    falla: { tipo: "rechazo", error: "El día 23/09 ya está cerrado." },
    sinRespuesta: { cambio: false, totalMandado: "$ 15.500,00" },
    enLinea: true,
  });
  assert.equal(r?.titulo, "No se aceptó el reintento, y no sabemos si la venta cortada se grabó.");
  assert.match(r?.comoSeguir ?? "", /^El día 23\/09 ya está cerrado\. Antes de volver a intentar, fijate si está en Ventas del día\./);
  assert.equal(r?.reintentar, false);
  assert.match(rechazoDelServidor("x", true, true).comoSeguir, /Pedidos para preparar/);
  // Cerrado el rechazo, la duda sigue: vuelve el aviso del corte con «Reintentar».
  assert.equal(
    avisoDelCobro({ falla: null, sinRespuesta: { cambio: false, totalMandado: "$ 15.500,00" }, enLinea: true })?.reintentar,
    true,
  );
  // Y si además cambió lo cargado, manda el freno.
  assert.equal(
    avisoDelCobro({ falla: { tipo: "rechazo", error: "x" }, sinRespuesta: { cambio: true, totalMandado: "$ 1,00" }, enLinea: true })?.titulo,
    "Cambiaste la venta después del corte.",
  );
});
