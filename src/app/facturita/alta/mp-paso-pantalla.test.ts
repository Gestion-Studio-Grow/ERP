// ============================================================================
// FACTOQUE · alta: el primer paso «Tu Mercado Pago» (opcional), en un Chromium de verdad, a 390 px
// ============================================================================
//
// `AltaAsistente` real con la piel real de la vidriera (y su barra fija del alta), servido
// en una URL http para que el historial (?paso=N) ande como en el sitio.
//  · Saltarlo («Ahora no») no frena nada: se completa el alta y el resumen sale como siempre.
//  · «Sí, conectarlo» lo anota en el resumen y en el mensaje para activar.
//  · Sin la app de MP cargada: «todavía no disponible» y un solo botón «Seguir».
//  · Nada desborda a lo ancho y lo que se toca mide ≥ 44 px; el foco va al título de cada paso.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prepararNavegador, type Navegador } from "@/test/navegador-componentes";

const ENTRADA = `
import { createRoot } from "react-dom/client";
import { createElement } from "react";
import { PIEL_FACTURITA } from "@/app/facturita/piel";
import AltaAsistente from "@/app/facturita/alta/AltaAsistente";
// El marco de la vidriera (VidrieraMarco) con lo que importa acá: la piel real y la barra del alta.
window.montar = (mpDisponible) => createRoot(document.getElementById("root")).render(
  createElement("div", { "data-skin": "fable", "data-theme": "light", "data-alta": "", className: "fx" },
    createElement("style", { dangerouslySetInnerHTML: { __html: PIEL_FACTURITA } }),
    createElement("main", { className: "fx-caja fx-caja--alta" },
      createElement(AltaAsistente, { canal: { tipo: "whatsapp", base: "https://wa.me/5491100000000" }, mpDisponible }))));
`;

let nav: Navegador | string;
before(async () => {
  nav = await prepararNavegador(ENTRADA, { ruta: "/facturita/alta" });
});
after(async () => {
  if (typeof nav !== "string") await nav?.browser.close();
});

async function abrir(t: import("node:test").TestContext, mpDisponible: boolean) {
  if (typeof nav === "string") {
    t.skip(nav);
    return null;
  }
  const n = nav;
  const contexto = await n.browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-AR", hasTouch: true });
  const page = await contexto.newPage();
  const errores: string[] = [];
  page.on("pageerror", (e) => errores.push(e.message));
  const html = `<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width"><style>${n.css}</style></head><body><div id="root"></div><script>${n.bundle}</script></body></html>`;
  await page.route("http://factoque.test/**", (r) => r.fulfill({ body: html, contentType: "text/html" }));
  await page.goto("http://factoque.test/facturita/alta");
  await page.evaluate((m) => (window as unknown as { montar: (m: boolean) => void }).montar(m), mpDisponible);
  t.after(() => contexto.close());
  return { page, errores };
}

type Pagina = NonNullable<Awaited<ReturnType<typeof abrir>>>["page"];

async function medir(page: Pagina) {
  return page.evaluate(() => ({
    ancho: document.documentElement.scrollWidth,
    chicos: [...document.querySelectorAll("form button, form a, form input[type=radio], form label.fx-condicion")]
      .filter((b) => (b as HTMLElement).offsetParent !== null)
      .map((b) => ({ t: b.textContent?.trim().slice(0, 30), h: Math.round(b.getBoundingClientRect().height) }))
      .filter((b) => b.h < 44 && b.h > 0),
  }));
}

/** Completa los pasos 2 a 5 (datos, inscripción, punto de venta, ARCA) y llega al resumen. */
async function completarElResto(page: Pagina) {
  await page.getByRole("heading", { name: "Tus datos" }).waitFor();
  await page.getByLabel("Nombre y apellido, o razón social").fill("Ana Pérez");
  await page.getByLabel("Tu CUIT").fill("20-11111111-2");
  await page.getByRole("button", { name: "Seguir" }).tap();
  await page.getByRole("heading", { name: "Cómo estás inscripto" }).waitFor();
  await page.getByRole("radio").first().check();
  await page.getByRole("button", { name: "Seguir" }).tap();
  await page.getByRole("heading", { name: "Punto de venta" }).waitFor();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Seguir" }).tap();
  await page.getByRole("heading", { name: "Permiso en ARCA" }).waitFor();
  await page.getByRole("button", { name: "Ver el resumen" }).tap();
  await page.getByRole("heading", { name: "Listo" }).waitFor();
}

test("saltar el paso de Mercado Pago no frena el alta y el mensaje sale como siempre", async (t) => {
  const a = await abrir(t, true);
  if (!a) return;
  const { page, errores } = a;
  await page.getByRole("heading", { name: "Tu Mercado Pago" }).waitFor();
  assert.match(await page.locator(".fx-progreso").innerText(), /Paso 1 de 6/);
  const m = await medir(page);
  assert.ok(m.ancho <= 390, `desborda: ${m.ancho}px`);
  assert.deepEqual(m.chicos, []);
  await page.getByRole("button", { name: "Ahora no" }).tap();
  // El foco va al título del paso nuevo (teclado y lector de pantalla).
  await page.getByRole("heading", { name: "Tus datos" }).waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), "Tus datos");
  assert.match(page.url(), /\?paso=2$/);
  await completarElResto(page);
  assert.match(await page.locator(".fx-resumen-alta").innerText(), /Mercado Pago\s+Más adelante/);
  const link = await page.getByRole("link", { name: "Mandar por WhatsApp" }).getAttribute("href");
  assert.ok(link && !decodeURIComponent(link).includes("Mercado Pago"), "saltarlo no agrega nada al mensaje");
  const fin = await medir(page);
  assert.ok(fin.ancho <= 390, `desborda: ${fin.ancho}px`);
  assert.deepEqual(errores, []);
  if (process.env.CAPTURAS_MP) await page.screenshot({ path: `${process.env.CAPTURAS_MP}/alta-resumen-saltado.png`, fullPage: true });
});

test("«Sí, conectarlo» queda anotado en el resumen y en el mensaje para activar", async (t) => {
  const a = await abrir(t, true);
  if (!a) return;
  const { page, errores } = a;
  if (process.env.CAPTURAS_MP) await page.screenshot({ path: `${process.env.CAPTURAS_MP}/alta-paso-mp.png`, fullPage: true });
  await page.getByRole("button", { name: "Sí, conectarlo" }).tap();
  await completarElResto(page);
  assert.match(await page.locator(".fx-resumen-alta").innerText(), /Mercado Pago\s+Lo conectás con un toque al activarte/);
  const link = await page.getByRole("link", { name: "Mandar por WhatsApp" }).getAttribute("href");
  assert.match(decodeURIComponent(link ?? ""), /Mercado Pago: quiero conectarlo/);
  // «Volver» del navegador hasta el paso 1: la elección se recuerda y se puede cambiar.
  for (let i = 0; i < 5; i++) await page.goBack();
  await page.getByRole("heading", { name: "Tu Mercado Pago" }).waitFor();
  assert.deepEqual(errores, []);
});

test("sin la app de MP cargada: «todavía no disponible» y el alta sigue con un toque", async (t) => {
  const a = await abrir(t, false);
  if (!a) return;
  const { page, errores } = a;
  await page.getByText(/todavía no está disponible/).waitFor();
  assert.equal(await page.getByRole("button", { name: "Ahora no" }).count(), 0);
  assert.equal(await page.getByRole("button", { name: /conectarlo/ }).count(), 0);
  if (process.env.CAPTURAS_MP) await page.screenshot({ path: `${process.env.CAPTURAS_MP}/alta-paso-mp-no-disponible.png`, fullPage: true });
  await page.getByRole("button", { name: "Seguir" }).tap();
  await completarElResto(page);
  assert.match(await page.locator(".fx-resumen-alta").innerText(), /Más adelante/);
  assert.deepEqual(errores, []);
});
