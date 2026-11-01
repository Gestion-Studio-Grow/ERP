import { test } from "node:test";
import assert from "node:assert/strict";

import {
  sanitizePhone,
  buildWhatsAppHref,
  whatsappStorageKey,
  leerWhatsApp,
  numeroWhatsApp,
  whatsappCanonico,
  etiquetaWhatsApp,
  waLinkClienta,
  avisoWhatsAppDelNegocio,
} from "./whatsapp-cta";

// La tabla del arreglo del +549 (29/10): lo que carga un negocio → el número que va a wa.me.
// "" = no hay número usable: no se arma el chat.
const CASOS: [string, string][] = [
  // El caso que rompía los pedidos: sin código de país, WhatsApp lo leía como EE. UU.
  ["11-6677-8890", "5491166778890"],
  ["1166778890", "5491166778890"],
  ["11 6677 8890", "5491166778890"],
  // Prefijo de país en todas sus formas.
  ["+54 11 6677-8890", "5491166778890"],
  ["54 11 6677 8890", "5491166778890"],
  ["541166778890", "5491166778890"],
  ["+54 9 11 6677-8890", "5491166778890"],
  ["+5491166778890", "5491166778890"],
  ["549 11 6677 8890", "5491166778890"],
  ["0054 9 11 6677 8890", "5491166778890"],
  // Ya viene bien: no se duplica nada.
  ["5491166778890", "5491166778890"],
  // 0 de larga distancia.
  ["011 6677-8890", "5491166778890"],
  ["0351 555-1234", "5493515551234"],
  ["+54 011 6677-8890", "5491166778890"],
  // 15 de celular después del área (con y sin el 0).
  ["11 15 6677-8890", "5491166778890"],
  ["011 15 6677-8890", "5491166778890"],
  ["351 15 555-1234", "5493515551234"],
  ["0351 15 555-1234", "5493515551234"],
  ["2944 15 123456", "5492944123456"],
  ["+54 9 351 15 555 1234", "5493515551234"],
  // Interior, área de 3 y 4 dígitos.
  ["221 456-7890", "5492214567890"],
  ["(0221) 456-7890", "5492214567890"],
  // Otro país: se respeta.
  ["+1 305 555 1234", "13055551234"],
  ["+34 612 345 678", "34612345678"],
  ["+598 99 123 456", "59899123456"],
  // Portugal: sin el "+" se leería 351 15 912-3456 (Córdoba). Ver el test de whatsappCanonico.
  ["+351 915 123 456", "351915123456"],
  ["+55 11 98765-4321", "5511987654321"],
  ["0034 612 345 678", "34612345678"],
  // Otro país guardado sin "+" (el panel guardaba sólo los dígitos).
  ["34612345678", "34612345678"],
  ["13055551234", "13055551234"],
  ["5511987654321", "5511987654321"],
  // No usable: vacío, sin área, relleno, cortos.
  ["", ""],
  ["15 6677-8890", ""],
  ["6677-8890", ""],
  ["+54 9 11 0000 0000", ""],
  ["11 1111-1111", ""],
  ["123", ""],
  ["+54 123", ""],
  ["sin número", ""],
];

for (const [entrada, esperado] of CASOS) {
  test(`numeroWhatsApp(${JSON.stringify(entrada)}) → ${JSON.stringify(esperado)}`, () => {
    assert.equal(numeroWhatsApp(entrada), esperado);
  });
}

test("whatsappCanonico es idempotente y, leído otra vez, da el mismo número para wa.me", () => {
  for (const [entrada, esperado] of CASOS) {
    const canonico = whatsappCanonico(entrada);
    assert.equal(canonico, esperado ? `+${esperado}` : "", entrada);
    assert.equal(whatsappCanonico(canonico), canonico, entrada);
    assert.equal(numeroWhatsApp(canonico), esperado, entrada);
  }
});

test("un número de otro país no cambia de país al pasar por las capas (el bug del certificador)", () => {
  // El panel lo carga con "+", settings lo pasa canónico, el CTA y el pedido arman el link.
  const canonico = whatsappCanonico("+351 915 123 456");
  assert.equal(buildWhatsAppHref(canonico, "hola"), "https://wa.me/351915123456?text=hola");
  assert.equal(buildWhatsAppHref(whatsappCanonico(canonico), "hola"), "https://wa.me/351915123456?text=hola");
  // Sólo dígitos es ambiguo de verdad (351 15 912-3456 es un celular de Córdoba bien escrito):
  // por eso el número no viaja nunca sin el "+".
  assert.equal(numeroWhatsApp("351915123456"), "5493519123456");
});

test("numeroWhatsApp de null/undefined da string vacío", () => {
  assert.equal(numeroWhatsApp(null), "");
  assert.equal(numeroWhatsApp(undefined), "");
});

test("leerWhatsApp dice si el código de país lo puso el negocio o se lo agregamos", () => {
  assert.deepEqual(leerWhatsApp("11-6677-8890"), { tipo: "argentino", numero: "5491166778890", conCodigoDePais: false });
  assert.deepEqual(leerWhatsApp("+54 9 11 6677-8890"), { tipo: "argentino", numero: "5491166778890", conCodigoDePais: true });
  assert.deepEqual(leerWhatsApp("+34 612 345 678"), { tipo: "otroPais", numero: "34612345678", explicito: true });
  assert.deepEqual(leerWhatsApp("34612345678"), { tipo: "otroPais", numero: "34612345678", explicito: false });
  assert.deepEqual(leerWhatsApp("15 6677-8890"), { tipo: "invalido", numero: "", motivo: "faltaArea" });
  assert.deepEqual(leerWhatsApp("11 0000-0000"), { tipo: "invalido", numero: "", motivo: "relleno" });
  assert.deepEqual(leerWhatsApp("123"), { tipo: "invalido", numero: "", motivo: "largo" });
  assert.deepEqual(leerWhatsApp("  "), { tipo: "vacio", numero: "" });
});

test("sanitizePhone (alias viejo) ya no deja un número argentino sin el 549", () => {
  assert.equal(sanitizePhone("11-6677-8890"), "5491166778890");
  assert.equal(sanitizePhone("+54 9 11 2233-4455"), "5491122334455");
  assert.equal(sanitizePhone(null), "");
});

test("buildWhatsAppHref arma el link con el número normalizado y el texto codificado", () => {
  assert.equal(
    buildWhatsAppHref("54 9 11 2233-4455", "¡Hola! Quiero hacer un pedido."),
    "https://wa.me/5491122334455?text=%C2%A1Hola!%20Quiero%20hacer%20un%20pedido.",
  );
  assert.equal(buildWhatsAppHref("11-6677-8890", "hola"), "https://wa.me/5491166778890?text=hola");
  // Sin número: WhatsApp abre para elegir el chat (los que pasan "" a propósito).
  assert.equal(buildWhatsAppHref("", "hola"), "https://wa.me/?text=hola");
});

test("etiquetaWhatsApp muestra cómo va a quedar", () => {
  assert.equal(etiquetaWhatsApp("5491166778890"), "+54 9 11 6677-8890");
  assert.equal(etiquetaWhatsApp("5493515551234"), "+54 9 351 555-1234");
  assert.equal(etiquetaWhatsApp("34612345678"), "+34612345678");
  assert.equal(etiquetaWhatsApp(""), "");
});

test("waLinkClienta: celular argentino u otro país con +; nada de números sin área", () => {
  assert.equal(waLinkClienta("011 15-4000-7919"), "https://wa.me/5491140007919");
  assert.equal(waLinkClienta("+34 612 345 678", "hola"), "https://wa.me/34612345678?text=hola");
  // Sin "+" en una ficha: más probable un error de tipeo que un número de afuera.
  assert.equal(waLinkClienta("34612345678"), null);
  // «15 4000-7919» mide 10 pero no tiene área: antes armaba un link a otro número.
  assert.equal(waLinkClienta("15 4000-7919"), null);
});

test("whatsappStorageKey namespacea por tenant", () => {
  assert.equal(whatsappStorageKey("magra"), "gsg-whatsapp-magra");
  assert.notEqual(whatsappStorageKey("magra"), whatsappStorageKey("shinevelas"));
});

test("avisoWhatsAppDelNegocio: avisa si falta el código de país y muestra cómo queda", () => {
  assert.equal(avisoWhatsAppDelNegocio(""), null);
  assert.deepEqual(avisoWhatsAppDelNegocio("11-6677-8890"), {
    tono: "aviso",
    texto: "Lo cargaste sin código de país. Le agregamos el +54 9 de Argentina: va a quedar +54 9 11 6677-8890.",
  });
  assert.equal(avisoWhatsAppDelNegocio("+54 9 11 6677-8890")?.tono, "ok");
  assert.match(avisoWhatsAppDelNegocio("+54 9 11 6677-8890")?.texto ?? "", /\+54 9 11 6677-8890/);
  assert.equal(avisoWhatsAppDelNegocio("+34 612 345 678")?.tono, "ok");
  assert.equal(avisoWhatsAppDelNegocio("34612345678")?.tono, "aviso");
  assert.equal(avisoWhatsAppDelNegocio("15 6677-8890")?.tono, "alerta");
  assert.match(avisoWhatsAppDelNegocio("15 6677-8890")?.texto ?? "", /código de área/);
  assert.equal(avisoWhatsAppDelNegocio("11 0000-0000")?.tono, "alerta");
  assert.equal(avisoWhatsAppDelNegocio("123")?.tono, "alerta");
});
