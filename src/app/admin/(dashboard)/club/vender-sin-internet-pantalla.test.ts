// ============================================================================
// «VENDER» SIN INTERNET (H-T2-1) en un navegador de verdad — la hoja Vender REAL (esbuild) sobre el almacén REAL de la
// jornada contra la base (dos puestos), con una base en memoria de la página que se puede «caer».
// ============================================================================
//
//   · Se corta internet (el latido de versión no contesta): la cinta lo sabe.
//   · «Cobrar en MP» → NO entra: el aviso (role="alert") dice «Sin internet sólo se cobra en efectivo. Elegí Efectivo o
//     esperá a que vuelva la señal.», la venta sigue cargada (las mismas líneas y el mismo total) y la base no cambia.
//   · «Cobrar en Efectivo» → entra en el acto (role="status"), el carrito se vacía, queda en la cola del puesto y la
//     base todavía no la tiene; vuelve internet → sube UNA vez.
// Sin Chromium o sin esbuild, se saltea.

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser } from "playwright";

const RAIZ = fileURLToPath(new URL("../../../../../", import.meta.url));
const ORIGEN = "http://localhost:3996/admin/club";

const ENTRADA = `
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import * as M from "@/lib/club/motor.mjs";
import { claveDeLaJornada, crearAlmacen, MINUTO_DEMO, textoDeLaDemo, textoDelEstado } from "@/app/admin/(dashboard)/club/almacen";
import { HojaDeVender } from "@/app/admin/(dashboard)/club/VentaDeMostrador";

const HOY = "2026-10-17";
const e = M.generarDemo(HOY, MINUTO_DEMO);
M.pasarPinesAHash(e);
for (let d = 1; d < 7; d++) M.materializarFijos(e, M.sumarDias(HOY, d));
const base = { foto: { texto: textoDeLaDemo(textoDelEstado(e), HOY, 1), version: 1 } };
let caida = false;
const guardado = {
  async leer() { if (caida) throw new Error("sin red"); return { ...base.foto }; },
  guardar(texto, esperada) {
    if (caida) return Promise.resolve({ ok: false, motivo: "error" });
    if (esperada !== base.foto.version) return Promise.resolve({ ok: false, motivo: "conflicto", version: base.foto.version });
    base.foto = { texto, version: esperada + 1 };
    return Promise.resolve({ ok: true, version: base.foto.version });
  },
  async leerVersion() { return caida ? null : base.foto.version; },
  async subirYa() {},
};
let latido = () => {};
const esperas = [];
const temporizador = {
  despues(fn) { const x = { fn, viva: true }; esperas.push(x); return () => { x.viva = false; }; },
  cada(fn) { latido = fn; return () => {}; },
};
const datos = new Map();
const almacen = crearAlmacen({
  reloj: "real", clave: claveDeLaJornada("bp-sin-internet"), guardado, cerrojos: null, canal: null, temporizador,
  almacenamiento: { getItem: (k) => datos.get(k) ?? null, setItem: (k, v) => void datos.set(k, String(v)), removeItem: (k) => void datos.delete(k) },
  relojMs: () => new Date(2026, 9, 17, 20, 0).getTime(), demoraGuardadoMs: 0, enReposo: null, rol: "OWNER", equipo: "tab1", puesto: "tablet", visible: () => true,
});
const enLaBase = () => JSON.parse(base.foto.texto).estado;
window.__internet = (si) => { caida = !si; };
window.__latir = () => latido();
window.__reintentar = () => { for (const x of esperas.splice(0)) if (x.viva) x.fn(); };
window.__ingresosBase = () => M.resumenCaja(enLaBase()).ingresos;
window.__porMedioBase = (m) => M.resumenCaja(enLaBase()).porMedio[m] ?? 0;
window.__sincro = () => almacen.sincro();
window.__montar = async () => {
  almacen.arrancar();
  for (let i = 0; i < 30; i++) await new Promise((r) => setTimeout(r, 0));
  const u = almacen.estado().usuarios.find((x) => x.id === "u-lu");
  almacen.cambiarOperador(u, { usuarioId: u.id, pin: "33" });
  createRoot(document.getElementById("root")).render(createElement(HojaDeVender, { almacen, abierta: true, onCerrar() {} }));
};
`;

function rutaDeChromium(porDefecto: () => string): string | null {
  try {
    const p = porDefecto();
    if (existsSync(p)) return p;
  } catch {
    // sin navegador registrado: se busca abajo
  }
  const dir = process.env.PLAYWRIGHT_BROWSERS_PATH ?? "/opt/pw-browsers";
  if (!existsSync(dir)) return null;
  for (const n of readdirSync(dir).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse()) {
    for (const sub of ["chrome-linux64", "chrome-linux"]) {
      const p = join(dir, n, sub, "chrome");
      if (existsSync(p)) return p;
    }
  }
  return null;
}

const plata = (texto: string | null) => Number(String(texto ?? "").replace(/[^\d]/g, ""));

describe("Vender sin internet (H-T2-1) en el navegador", { timeout: 180_000 }, () => {
  let browser: Browser | null = null;
  let bundle = "";
  let sinNavegador = "";

  before(async () => {
    let esbuild: typeof import("esbuild");
    let playwright: typeof import("playwright");
    try {
      esbuild = await import("esbuild");
      playwright = await import("playwright");
    } catch {
      sinNavegador = "no están esbuild o playwright";
      return;
    }
    const chrome = rutaDeChromium(() => playwright.chromium.executablePath());
    if (!chrome) {
      sinNavegador = "no hay un Chromium instalado";
      return;
    }
    const r = await esbuild.build({
      loader: { ".css": "empty" },
      stdin: { contents: ENTRADA, loader: "tsx", resolveDir: RAIZ },
      bundle: true,
      write: false,
      format: "iife",
      jsx: "automatic",
      tsconfig: join(RAIZ, "tsconfig.json"),
      define: { "process.env.NODE_ENV": '"production"' },
      logLevel: "silent",
    });
    bundle = r.outputFiles[0].text;
    browser = await playwright.chromium.launch({ executablePath: chrome });
  });

  after(async () => {
    await browser?.close();
  });

  test("por MP sin internet: rechazada con el aviso y la venta sigue cargada; en efectivo: entra, espera en la cola y sube al volver", async (t) => {
    if (!browser) return t.skip(sinNavegador);
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 }, locale: "es-AR" });
    const errores: string[] = [];
    page.on("pageerror", (e) => errores.push(e.message));
    const html = `<!doctype html><html lang="es"><head></head><body><main id="root"></main></body></html>`;
    await page.route(ORIGEN, (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body: html }));
    await page.goto(ORIGEN);
    await page.addScriptTag({ content: bundle });
    await page.evaluate(() => (window as unknown as { __montar: () => Promise<void> }).__montar());
    const hoja = page.getByRole("dialog", { name: "Vender" });
    await hoja.waitFor();
    const w = (fn: string, ...args: unknown[]) => page.evaluate(([f, a]) => (window as unknown as Record<string, (...x: unknown[]) => unknown>)[f as string](...(a as unknown[])), [fn, args] as const);

    // Dos favoritos al carrito.
    const favoritos = hoja.getByRole("list", { name: /^Favoritos/ }).getByRole("button");
    await favoritos.nth(0).click();
    await favoritos.nth(1).click();
    const lineas = hoja.getByRole("list", { name: "Lo que lleva" }).getByRole("listitem");
    assert.equal(await lineas.count(), 2);
    const total = plata(await hoja.locator('[data-vender="total"]').textContent());
    assert.ok(total > 0);
    const ingresos0 = (await w("__ingresosBase")) as number;
    const mp0 = (await w("__porMedioBase", "mercadopago")) as number;

    // Se corta internet: el latido no contesta.
    await w("__internet", false);
    await w("__latir");
    await page.waitForFunction(() => (window as unknown as { __sincro: () => { sinInternetDesde: number | null } }).__sincro().sinInternetDesde !== null);

    // Por MP: rechazada, con el aviso en role="alert", y la venta sigue cargada.
    await hoja.getByRole("button", { name: /^Cobrar .* en MP$/ }).click();
    await hoja.getByRole("alert").filter({ hasText: "Sin internet sólo se cobra en efectivo. Elegí Efectivo o esperá a que vuelva la señal." }).waitFor();
    assert.equal(await lineas.count(), 2, "las líneas siguen");
    assert.equal(plata(await hoja.locator('[data-vender="total"]').textContent()), total, "el mismo total");
    assert.equal(((await w("__sincro")) as { enCola: number }).enCola, 0, "no entró a la cola");

    // En efectivo: entra en el acto, el carrito se vacía y espera en la cola.
    await hoja.getByRole("button", { name: /^Cobrar .* en Efectivo$/ }).click();
    await hoja.getByRole("status").filter({ hasText: /^Venta cobrada: .*\(Efectivo\)\.$/ }).waitFor();
    assert.equal(await hoja.getByRole("list", { name: "Lo que lleva" }).count(), 0, "el carrito queda vacío");
    assert.equal(((await w("__sincro")) as { enCola: number }).enCola, 1, "espera en la cola del puesto");
    assert.equal(await w("__ingresosBase"), ingresos0, "la base todavía no la tiene");

    // Vuelve internet: sube UNA vez, y nada por MP.
    await w("__internet", true);
    for (let i = 0; i < 4; i++) {
      await w("__reintentar");
      await page.waitForTimeout(20);
    }
    await page.waitForFunction(() => (window as unknown as { __sincro: () => { enCola: number } }).__sincro().enCola === 0);
    assert.equal(((await w("__ingresosBase")) as number) - ingresos0, total, "la venta en efectivo llegó una vez");
    assert.equal(await w("__porMedioBase", "mercadopago"), mp0, "nada cobrado por MP");
    assert.equal(((await w("__sincro")) as { sinInternetDesde: number | null }).sinInternetDesde, null, "la cinta se levanta");
    assert.deepEqual(errores, []);
    await page.close();
  });
});
