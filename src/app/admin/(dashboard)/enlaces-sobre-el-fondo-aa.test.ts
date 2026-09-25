// ============================================================================
// UN ENLACE DE TEXTO SOBRE EL FONDO DE LA PÁGINA SE LEE CON CUALQUIER COLOR DE MARCA.
// ============================================================================
//
// El gate «visual-aa» marcó en la vidriera de velas «Ver el libro del mes →» a 4,33:1 (mínimo
// 4,5): el acento de la marca (ámbar #9a6a1f) usado como COLOR DE TEXTO sobre el fondo de la
// página del panel (#f5f5f7), no sobre una tarjeta blanca. Con ámbar, celeste y azul el acento
// crudo no llega a AA sobre ese fondo. Para eso existe `text-accent-ink` (globals.css: el mismo
// acento oscurecido para texto, AA sobre cualquier superficie clara). Los relleno/botones siguen
// con `text-accent` / `bg-accent`.
//
// Se mide con la función del gate (`auditInPage`) en Chromium, con las clases REALES de cada
// enlace (leídas del archivo) dentro de la piel Fable del panel, con los 7 acentos de marca.

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Browser } from "playwright";
import { ACCENT_PRESETS } from "@/lib/branding";
import { abrirNavegador, medirComoElGate, RAIZ } from "@/test/navegador";

/** La clase del enlace a `href` en `archivo`, tal cual está en el código. */
function claseDelEnlace(archivo: string, href: string): string {
  const fuente = readFileSync(join(RAIZ, archivo), "utf8");
  const m = fuente.match(new RegExp(`<Link href="${href.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}" className="([^"]+)"`));
  assert.ok(m, `no se encontró el enlace a ${href} en ${archivo}`);
  return m[1];
}

const ENLACES = [
  { archivo: "src/app/admin/(dashboard)/compras/page.tsx", href: "/admin/proveedores" },
  { archivo: "src/app/admin/(dashboard)/compras/page.tsx", href: "/admin/compras/sugerido" },
  { archivo: "src/app/admin/(dashboard)/ajustes/page.tsx", href: "/admin/ajustes/recuento" },
  { archivo: "src/app/admin/(dashboard)/caja/cierre/page.tsx", href: "/admin/caja/libro" },
];

/** El enlace dentro de un párrafo sobre el fondo de la página, como en el panel. */
function pantalla(clase: string, acento: string): string {
  return (
    `<div data-skin="fable" data-theme="light" class="min-h-screen bg-surface text-body" style="--tenant-accent-light:${acento}">` +
    `<main class="px-4 py-6"><p class="text-muted">Para contar una góndola entera usá el <a href="#" class="${clase}">enlace de prueba</a>.</p></main></div>`
  );
}

describe("Enlaces de texto del panel sobre el fondo: AA con los 7 acentos de marca", { timeout: 120_000 }, () => {
  let browser: Browser | null = null;
  let css = "";
  let sinNavegador = "";

  before(async () => {
    const n = await abrirNavegador();
    if ("sinNavegador" in n) sinNavegador = n.sinNavegador;
    else ({ browser, css } = n);
  });

  after(async () => {
    await browser?.close();
  });

  test("el acento crudo como texto NO llega con ámbar (el caso del gate: 4,33:1)", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const r = await medirComoElGate(browser!, css, pantalla("font-medium text-accent underline", ACCENT_PRESETS.ambar.light));
    const del_enlace = r.contrastFails.filter((c) => c.text.includes("enlace de prueba"));
    assert.equal(del_enlace.length, 1, "la medición tiene que ver el defecto que vio el gate");
    assert.ok(del_enlace[0].ratio < 4.5 && del_enlace[0].ratio > 4.2, `ratio ${del_enlace[0].ratio}`);
  });

  for (const { archivo, href } of ENLACES) {
    test(`${href} (${archivo.split("(dashboard)/")[1]}) se lee con todos los acentos`, async (t) => {
      if (sinNavegador) return t.skip(sinNavegador);
      const clase = claseDelEnlace(archivo, href);
      const malos: string[] = [];
      for (const [nombre, p] of Object.entries(ACCENT_PRESETS)) {
        const r = await medirComoElGate(browser!, css, pantalla(clase, p.light));
        for (const c of r.contrastFails) malos.push(`${nombre}: «${c.text}» ${c.ratio}:1`);
      }
      assert.deepEqual(malos, [], `texto por debajo de AA:\n${malos.join("\n")}`);
    });
  }
});
