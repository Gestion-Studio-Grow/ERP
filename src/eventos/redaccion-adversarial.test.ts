// ============================================================================
// P2-C6 · redacción de texto libre — los casos abiertos del dictamen (CERT-P2 vueltas 2 y 3)
// ============================================================================
//   node --import tsx --test src/eventos/redaccion-adversarial.test.ts
//
// Reconstrucción de los adversariales del certificador (v2-redaccion.test.ts y v3-raya.test.ts no
// quedaron en la rama ni en el disco): mismos ids y mismos textos que cita el dictamen.
//   · F4 → C6-f (DNI con comas), C6-g (separadores de 4 o más caracteres).
//   · F5 → C6-h (un DNI justo en el corte) y «obs · largo» (el resultado no pasa de 500).
//   · O1 → v3-obs (guion blando U+00AD pegado desde Word).
//   · O2 → v3-obs2 (sobre-enmascarado): se ACEPTA, el test fija el comportamiento.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { armarSobre } from "./emitir";
import { LARGO_TEXTO_LIBRE, redactarTextoLibre } from "./esquema";

const sinDigitosDe = (texto: string, dato: string) => {
  // Ninguna tirada de 5 dígitos seguidos del dato aparece en el resultado (sacando la máscara).
  const digitos = dato.replace(/\D/g, "");
  const limpio = texto.replace(/\*{6}\d{0,4}/g, "").replace(/\D/g, "");
  for (let i = 0; i + 5 <= digitos.length; i++) assert.ok(!limpio.includes(digitos.slice(i, i + 5)), `«${digitos.slice(i, i + 5)}» quedó en claro: ${texto}`);
};

const SUSTITUTO_SUELTO = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

test("C6-f · DNI con comas («30,123,456») sale enmascarado", () => {
  assert.equal(redactarTextoLibre("DNI 30,123,456"), "DNI ******3456");
  assert.equal(redactarTextoLibre("CUIT 20,30123456,7"), "CUIT ******4567");
});

test("C6-g · separadores de 4 o más caracteres («11  -  5566  -  7788») no cortan la tirada", () => {
  assert.equal(redactarTextoLibre("11  -  5566  -  7788"), "******7788");
  assert.equal(redactarTextoLibre("tel 11    5566    7788"), "tel ******7788");
  assert.equal(redactarTextoLibre("tel 11 \t - \t 5566  –  7788"), "tel ******7788");
  assert.equal(redactarTextoLibre("DNI 30 . 123 . 456"), "DNI ******3456");
  assert.equal(redactarTextoLibre("tel (11)  /  5566 , 7788"), "tel (******7788");
  // Partido en dos renglones (copiado de una tabla) también es una sola tirada.
  assert.equal(redactarTextoLibre("tel 11 5566\n7788"), "tel ******7788");
});

test("C6-h · un DNI que cae en el borde de los 500 caracteres no deja dígitos en claro", () => {
  for (let corrimiento = 0; corrimiento < 14; corrimiento++) {
    const texto = `${"x".repeat(488 + corrimiento)} DNI 30123456 y sigue`;
    const r = redactarTextoLibre(texto);
    sinDigitosDe(r, "30123456");
    assert.ok(r.length <= LARGO_TEXTO_LIBRE, `quedó de ${r.length}`);
  }
  // El caso del dictamen: «…30123» al final.
  assert.ok(!/30123$/.test(redactarTextoLibre(`${"a".repeat(495)}30123456`)));
});

test("obs · largo · el texto redactado nunca pasa de 500 (antes llegaba a 748)", () => {
  const telefonos = Array.from({ length: 80 }, (_, i) => `tel 11 - 5566 - ${7700 + i}`).join("; ");
  const r = redactarTextoLibre(telefonos);
  assert.ok(r.length <= LARGO_TEXTO_LIBRE, `quedó de ${r.length}`);
  assert.ok(!/5566/.test(r), r);
  const emails = Array.from({ length: 40 }, (_, i) => `x${i}@a.co`).join(" ");
  assert.ok(redactarTextoLibre(emails).length <= LARGO_TEXTO_LIBRE);
});

test("v3-obs · el guion blando U+00AD (pegado desde Word) y los invisibles de formato son separadores", () => {
  assert.equal(redactarTextoLibre("11­5566­7788"), "******7788");
  assert.equal(redactarTextoLibre("tel 11 ­5566­ 7788"), "tel ******7788");
  for (const invisible of ["​", "‌", "‍", "‎", "⁠", "﻿", "⁦", "‪"]) {
    assert.equal(redactarTextoLibre(`11${invisible}5566${invisible}7788`), "******7788", `U+${invisible.charCodeAt(0).toString(16)}`);
  }
  const sobre = armarSobre({
    tenantId: "t1", tipo: "pedido.cancelado", version: 1, clave: "pedido:o1:cancelado",
    datos: { pedidoId: "o1", codigo: 1, motivo: "Llamar al 11­5566­7788 (DNI 30,123,456)" },
  });
  const motivo = (sobre.payload.datos as { motivo: string }).motivo.replace(/­/g, "");
  assert.ok(!/5566|30,?123/.test(motivo), motivo);
});

test("v3-obs2 · sobre-enmascarado ACEPTADO: dos números pegados por una raya son una tirada (se pierde dato, no se filtra)", () => {
  // Un teléfono «1042 12500» y «pedido 1042 – 12500» son indistinguibles por forma: gana el dato personal.
  assert.equal(redactarTextoLibre("pedido 1042 – 12500 pesos"), "pedido ******2500 pesos");
  // Lo que no es separador corta la tirada: «$», «#», «·», letras.
  assert.equal(redactarTextoLibre("pedido #1042 – $12500 · 3 u"), "pedido #1042 – $12500 · 3 u");
  assert.equal(redactarTextoLibre("pedido 1042 de 12500 pesos"), "pedido 1042 de 12500 pesos");
});

test("borde · el recorte no parte un emoji (un par sustituto suelto rompe el jsonb)", () => {
  for (const largo of [499, 500, 3999, 4000]) {
    const r = redactarTextoLibre(`${"a".repeat(largo - 1)}😀😀 fin`);
    assert.ok(!SUSTITUTO_SUELTO.test(r), `largo ${largo}: quedó un sustituto suelto`);
  }
});

test("borde · un texto de más de 4000 caracteres: lo partido en el corte de 4000 no llega en claro", () => {
  // 399 teléfonos en renglones: son UNA tirada y se enmascaran en 10 caracteres, así que la cola
  // cortada en 4000 quedaría a la vista si no se descartara.
  const relleno = Array.from({ length: 399 }, () => "1155667788").join("\n");
  for (const cola of [" marta.gomez@mail.com y más", " tel 11 5566 7788 y más", " DNI 30.123.456 y más"]) {
    for (let corte = 0; corte < 12; corte++) {
      const texto = `${relleno.slice(0, 3990 - corte)}${cola}${"z".repeat(50)}`;
      const r = redactarTextoLibre(texto);
      assert.ok(!/marta|gomez/.test(r), r.slice(-60));
      sinDigitosDe(r.slice(-40), "1155667788");
      sinDigitosDe(r.slice(-40), "30123456");
    }
  }
});

test("costo · la redacción es lineal: textos hostiles de 100 000 caracteres en menos de 50 ms", () => {
  const hostiles = [
    "1 ".repeat(50_000),
    `1${" ".repeat(99_998)}1`,
    "12345 a ".repeat(12_500),
    `a@${"b.".repeat(49_999)}`,
    `${"x".repeat(64)}@${"y".repeat(255)}.`.repeat(300),
  ];
  for (const h of hostiles) {
    const t0 = performance.now();
    redactarTextoLibre(h);
    const ms = performance.now() - t0;
    assert.ok(ms < 50, `tardó ${ms.toFixed(1)} ms`);
  }
});
