// ============================================================================
// EL GATE «visual-aa» LEE LOS COLORES COMO LOS DEVUELVE CHROMIUM: oklch, color(srgb …), rgb.
// ============================================================================
//
// `getComputedStyle` devuelve el color en el espacio en que se escribió. La piel Renglón
// (public/diseno/renglon.css) escribe sus tintas en `oklch(…)` y un `color-mix(in srgb, …)` se
// computa como `color(srgb …)`. El gate sólo entendía `rgb()`: un texto en oklch NO SE MEDÍA (con
// Renglón prendido en todos los negocios, el panel entero quedaba sin medir: 1 a 5 textos por
// pantalla) y un fondo en color-mix se tomaba por transparente («Ir a la carta» de la vidriera
// genérica, blanco sobre su acento, salía 1,05:1 contra el papel de atrás). Acá, con la función del
// gate en Chromium, lo que tiene que ver y lo que no tiene que inventar.
//
// El toque: en la tabla densa del celular, el botón del asunto se estira a todo el renglón con un
// `::after` (renglon.css «El renglón entero es el blanco del dedo»). El gate medía sólo el texto
// (24 px) y lo marcaba; se mide el renglón, que es lo que el dedo toca.
//
// Y el acento de la piel genérica (marcas.ts) siempre deja la tinta blanca en AA.

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { Browser } from "playwright";
import { abrirNavegador, medirComoElGate } from "@/test/navegador";
import { ACENTO_GENERICO, acentoDeLaPielGenerica, contrasteConBlanco } from "@/app/tienda/vidriera/marcas";

describe("el acento de la piel genérica", () => {
  test("el verde del rubro queda igual que con el color-mix de antes (82 % hacia el negro)", () => {
    assert.equal(acentoDeLaPielGenerica(ACENTO_GENERICO), "#274c42");
    assert.equal(acentoDeLaPielGenerica(null), "#274c42");
    assert.equal(acentoDeLaPielGenerica("no-es-un-color"), "#274c42");
  });

  test("con cualquier color del negocio, el blanco encima llega a 4,5:1", () => {
    for (const c of ["#2c6e77", "#0a84ff", "#e0a83e", "#ffd400", "#fff", "#74c0da", "#4fbe9b", "#000"]) {
      const a = acentoDeLaPielGenerica(c);
      assert.match(a, /^#[0-9a-f]{6}$/);
      assert.ok(contrasteConBlanco(a) >= 4.5, `${c} → ${a} da ${contrasteConBlanco(a).toFixed(2)}:1`);
    }
  });
});

describe("el gate lee los colores modernos", { timeout: 120_000 }, () => {
  let browser: Browser | null = null;
  let sinNavegador = "";

  before(async () => {
    const r = await abrirNavegador();
    if ("sinNavegador" in r) sinNavegador = r.sinNavegador;
    else browser = r.browser;
  });
  after(async () => {
    await browser?.close();
  });

  test("un fondo en color-mix es el fondo: blanco sobre el acento oscurecido pasa", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const m = await medirComoElGate(
      browser!,
      "body{background:#faf9f7;margin:0}",
      `<a href="#c" style="display:inline-block;padding:10px 16px;font:700 16px sans-serif;color:#fff;background:color-mix(in srgb, #2f5d50 82%, #000)">Ir a la carta</a>`,
    );
    assert.deepEqual(m.contrastFails, []);
  });

  test("un texto en oklch se mide: el tenue se marca y el firme pasa", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const m = await medirComoElGate(
      browser!,
      "body{background:oklch(97.2% 0.004 80);margin:0;font:16px sans-serif}",
      `<p style="color:oklch(20% 0.012 80)">Texto firme de la piel</p><p style="color:oklch(80% 0.01 80)">Texto tenue de la piel</p>`,
    );
    assert.deepEqual(
      m.contrastFails.map((f) => f.text),
      ["Texto tenue de la piel"],
    );
  });

  test("un botón estirado a todo el renglón se mide por el renglón; uno suelto de 24 px se marca", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const m = await medirComoElGate(
      browser!,
      "body{margin:0;font:16px sans-serif} .fila{position:relative;min-height:52px;display:flex;align-items:center} .fila button{all:unset;line-height:24px} .fila button::after{content:'';position:absolute;inset:0} .suelto{all:unset;line-height:24px}",
      `<div class="fila"><button type="button">Pala Adidas Metalbone 3.4</button></div><button type="button" class="suelto">Botón chico</button>`,
    );
    assert.deepEqual(
      m.touchFails.map((f) => f.text),
      ["Botón chico"],
    );
  });
});
