// ============================================================================
// FACTOQUE · Mi cuenta → Mercado Pago, en un Chromium de verdad a 390 px (diseño «Renglón»)
// ============================================================================
//
// `MercadoPagoTarjeta` real (la lectura de la base y la renovación están en
// src/lib/facturita-mp-postgres.test.ts). Los cuatro estados que ve la persona:
// sin conectar, conectado, «hay que volver a conectarlo» y «todavía no disponible».
// El «Conectar» es un <a> común (no un Link de Next: sin prefetch de la ruta que arma el OAuth).

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { paginaRenglon, prepararNavegador, type Navegador } from "@/test/navegador-componentes";

const ENTRADA = `
import { createRoot } from "react-dom/client";
import { createElement } from "react";
import MercadoPagoTarjeta from "@/app/facturita/app/cuenta/MercadoPagoTarjeta";
window.montar = (caso) => {
  const estados = {
    sin: { conectado: false },
    conectado: { conectado: true, cuenta: "987654321", desde: new Date("2026-11-05T15:00:00Z"), problema: "ninguno" },
    reconectar: { conectado: true, cuenta: "987654321", desde: new Date("2026-11-05T15:00:00Z"), problema: "reconectar" },
  };
  const aviso = caso === "conectado" ? { tono: "ok", texto: "¡Listo! Tu Mercado Pago quedó conectado." } : null;
  createRoot(document.getElementById("root")).render(
    createElement("main", { className: "mx-auto w-full max-w-3xl px-4 py-6" },
      createElement(MercadoPagoTarjeta, {
        estado: estados[caso === "no_disponible" ? "sin" : caso],
        disponible: caso !== "no_disponible",
        aviso,
        desconectar: createElement("button", { type: "button", className: "min-h-11 px-4" }, "Desconectar"),
      })));
};
`;

let nav: Navegador | string;
before(async () => {
  nav = await prepararNavegador(ENTRADA, { ruta: "/facturita/app/cuenta" });
});
after(async () => {
  if (typeof nav !== "string") await nav?.browser.close();
});

async function abrir(t: import("node:test").TestContext, caso: string) {
  if (typeof nav === "string") {
    t.skip(nav);
    return null;
  }
  const contexto = await nav.browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-AR" });
  const page = await contexto.newPage();
  const errores: string[] = [];
  page.on("pageerror", (e) => errores.push(e.message));
  await page.setContent(paginaRenglon(nav));
  await page.evaluate((c) => (window as unknown as { montar: (c: string) => void }).montar(c), caso);
  await page.getByRole("heading", { name: "Mercado Pago" }).waitFor();
  t.after(() => contexto.close());
  const ancho = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(ancho <= 390, `desborda: ${ancho}px`);
  if (process.env.CAPTURAS_MP) await page.screenshot({ path: `${process.env.CAPTURAS_MP}/cuenta-mp-${caso}.png`, fullPage: true });
  return { page, errores };
}

test("sin conectar: un solo botón «Conectar con Mercado Pago» que va a la ruta del OAuth", async (t) => {
  const a = await abrir(t, "sin");
  if (!a) return;
  const boton = a.page.getByRole("link", { name: "Conectar con Mercado Pago" });
  assert.equal(await boton.getAttribute("href"), "/facturita/app/cuenta/mercadopago/conectar");
  assert.ok(((await boton.boundingBox())?.height ?? 0) >= 40, "se toca cómodo");
  assert.equal(await a.page.getByText("Sin conectar").count(), 1);
  assert.deepEqual(a.errores, []);
});

test("conectado: la cuenta, desde cuándo, el aviso y «Desconectar»; sin «Conectar»", async (t) => {
  const a = await abrir(t, "conectado");
  if (!a) return;
  const texto = await a.page.locator("[data-qa=mp-conexion]").innerText();
  assert.match(texto, /Conectado/);
  assert.match(texto, /987654321/);
  assert.match(texto, /5 de noviembre de 2026/);
  assert.match(texto, /listos para facturarse/);
  assert.equal(await a.page.getByRole("status").count(), 1, "el aviso se anuncia");
  assert.equal(await a.page.getByRole("link", { name: /Conectar/ }).count(), 0);
  assert.equal(await a.page.getByRole("button", { name: "Desconectar" }).count(), 1);
});

test("hay que volver a conectarlo: lo dice y ofrece «Volver a conectar»", async (t) => {
  const a = await abrir(t, "reconectar");
  if (!a) return;
  await a.page.getByText("Hay que volver a conectarlo").waitFor();
  assert.equal(await a.page.getByRole("link", { name: "Volver a conectar" }).getAttribute("href"), "/facturita/app/cuenta/mercadopago/conectar");
});

test("sin la app de MP cargada: «todavía no disponible», sin botón roto", async (t) => {
  const a = await abrir(t, "no_disponible");
  if (!a) return;
  await a.page.getByText(/todavía no está disponible/).waitFor();
  assert.equal(await a.page.getByRole("link").count(), 0);
});
