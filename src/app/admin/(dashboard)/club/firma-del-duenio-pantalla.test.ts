// ============================================================================
// LA FIRMA DEL DUEÑO EN PANTALLA (SEG-020, cliente) — las piezas REALES (esbuild) en el Chromium de Playwright, sobre
// el almacén REAL de la jornada, con los PIN de los dueños sólo en el servidor (la marca `srv:`) y una puerta de firma
// falsa que contesta como el servidor (bien, caída, pide esperar, o lenta).
// ============================================================================
//
//   · Entrar como dueño en la pantalla bloqueada: con la puerta bien, entra; sin red, avisa y no entra; si el servidor
//     pide esperar, lo dice y no entra; mientras verifica, el botón se deshabilita y un segundo envío no vuelve a llamar.
//   · Una firma de caja (el egreso con la firma de un dueño): pasa por la puerta una vez y queda anotado.
//   · El celular del dueño (modo real): el código lo da el servidor; mientras pide, un segundo toque no vuelve a pedir.
// La puerta anota si el PIN coincidió, nunca el PIN. Sin Chromium o sin esbuild, se saltea.
//
// — Elaborado por GSG

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser, Page } from "playwright";

const RAIZ = fileURLToPath(new URL("../../../../../", import.meta.url));
const ORIGEN = "http://localhost:3995/admin/club";

const ENTRADA = `
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import * as M from "@/lib/club/motor.mjs";
import { claveDeLaJornada, crearAlmacen, MINUTO_DEMO, textoDeLaDemo, textoDelEstado } from "@/app/admin/(dashboard)/club/almacen";
import BloqueoDelClub from "@/app/admin/(dashboard)/club/BloqueoDelClub";
import CajaDelClub from "@/app/admin/(dashboard)/club/CajaDelClub";
import AprobadorDelDuenio from "@/app/admin/(dashboard)/club/aprobar/AprobadorDelDuenio";
import { fijarPuertaDeLaFirma } from "@/app/admin/(dashboard)/club/puerta-del-pin";
import { linkDelAprobador } from "@/app/admin/(dashboard)/club/aprobar-core";

const HOY = "2026-10-17";
const e = M.generarDemo(HOY, MINUTO_DEMO);
const pinDe = Object.fromEntries(e.usuarios.map((u) => [u.id, M.pinDeEjemplo(u)]));
M.pasarPinesAHash(e);
for (const u of e.usuarios) if (u.rol === "duenio") u.pin = M.MARCA_PIN_SERVIDOR;
const duenios = e.usuarios.filter((u) => u.rol === "duenio");
const base = { foto: { texto: textoDeLaDemo(textoDelEstado(e), HOY, 1), version: 1 } };
const guardado = {
  async leer() { return { ...base.foto }; },
  guardar(texto, esperada) {
    if (esperada !== base.foto.version) return Promise.resolve({ ok: false, motivo: "conflicto", version: base.foto.version });
    base.foto = { texto, version: esperada + 1 };
    return Promise.resolve({ ok: true, version: base.foto.version });
  },
  async leerVersion() { return base.foto.version; },
  async subirYa() {},
};
const datos = new Map();
const almacen = crearAlmacen({
  reloj: "real", clave: claveDeLaJornada("bp-firma"), guardado, cerrojos: null, canal: null,
  temporizador: { despues: () => () => {}, cada: () => () => {} },
  almacenamiento: { getItem: (k) => datos.get(k) ?? null, setItem: (k, v) => void datos.set(k, String(v)), removeItem: (k) => void datos.delete(k) },
  relojMs: () => new Date(2026, 9, 17, 20, 0).getTime(), demoraGuardadoMs: 0, enReposo: null, rol: "OWNER", equipo: "tab1", puesto: "tablet", visible: () => true,
});

// La puerta: contesta como el servidor; anota de quién y si el PIN coincidió (nunca el PIN).
let modo = "ok";
let soltar = null;
const llamadas = [];
const deQuien = (x) => (x.usuarioId ? duenios.find((u) => u.id === x.usuarioId) : duenios.find((u) => pinDe[u.id] === x.pin)) ?? null;
async function contestar(x) {
  const d = deQuien(x);
  llamadas.push({ usuarioId: x.usuarioId ?? null, coincide: !!d && pinDe[d.id] === x.pin });
  if (modo === "lenta") await new Promise((listo) => (soltar = listo));
  if (modo === "caida") throw new Error("sin red");
  if (modo === "espera") return { ok: false, error: "Probá de nuevo en 30 segundos.", esperaS: 30 };
  return d && pinDe[d.id] === x.pin ? { ok: true, usuarioId: d.id, nombre: d.nombre } : { ok: false, error: "PIN incorrecto." };
}
fijarPuertaDeLaFirma({
  firmar: async (x) => {
    const r = await contestar(x);
    return r.ok ? { ...r, pase: "p", vence: 0 } : r;
  },
  codigoParaAprobar: async () => ({ ok: false, error: "no" }),
  aprobarConCodigo: async () => ({ ok: false, error: "no" }),
});
const pedirCodigo = async (x) => {
  const r = await contestar(x);
  return r.ok ? { ok: true, codigo: "QRS-TUV", usuarioId: r.usuarioId, nombre: r.nombre, monto: x.monto } : r;
};

const raiz = () => createRoot(document.getElementById("root"));
const arrancar = async () => {
  almacen.arrancar();
  for (let i = 0; i < 30; i++) await new Promise((r) => setTimeout(r, 0));
};
window.__modo = (m) => { modo = m; };
window.__soltar = () => soltar?.();
window.__llamadas = () => llamadas.slice();
window.__operador = () => almacen.operador()?.usuario.id ?? null;
window.__egresos = () => almacen.estado().caja.movimientos.filter((m) => m.tipo === "egreso").length;
window.__montarBloqueo = async () => {
  await arrancar();
  raiz().render(createElement(BloqueoDelClub, { almacen, negocio: "bp-firma" }));
};
window.__montarCaja = async () => {
  await arrancar();
  const lu = almacen.estado().usuarios.find((u) => u.id === "u-lu");
  almacen.cambiarOperador(lu, { usuarioId: lu.id, pin: pinDe[lu.id] });
  raiz().render(createElement(CajaDelClub, { almacen, negocio: "bp-firma" }));
};
window.__montarAprobador = () => {
  const n = e.novedades.find((x) => x.estado === "pendiente");
  const link = linkDelAprobador("http://localhost:3995", M.datosAprobacion(e, n.id));
  history.replaceState(null, "", link.slice(link.indexOf("#")));
  raiz().render(createElement(AprobadorDelDuenio, { negocio: "bp-firma", usuario: "u_x", modo: "real", leerFoto: async () => ({ ok: false }), pedirCodigo }));
  return { novedadId: n.id };
};
`;

type Llamada = { usuarioId: string | null; coincide: boolean };
type Ventana = Record<string, (...x: unknown[]) => unknown>;

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

describe("La firma del dueño en pantalla (SEG-020)", { timeout: 180_000 }, () => {
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

  async function abrir(): Promise<{ page: Page; w: (fn: string, ...args: unknown[]) => Promise<unknown>; errores: string[] }> {
    const ctx = await browser!.newContext({ viewport: { width: 390, height: 844 }, locale: "es-AR" });
    const page = await ctx.newPage();
    const errores: string[] = [];
    page.on("pageerror", (e) => errores.push(e.message));
    const html = `<!doctype html><html lang="es"><head></head><body><main id="root"></main></body></html>`;
    await page.route(ORIGEN, (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body: html }));
    await page.goto(ORIGEN);
    await page.addScriptTag({ content: bundle });
    const w = (fn: string, ...args: unknown[]) => page.evaluate(([f, a]) => (window as unknown as Ventana)[f as string](...(a as unknown[])), [fn, args] as const);
    return { page, w, errores };
  }

  test("entrar como dueño: sin red avisa y no entra; si el servidor pide esperar, no entra; con la puerta bien, entra (y un doble envío no llama dos veces)", async (t) => {
    if (!browser) return t.skip(sinNavegador);
    const { page, w, errores } = await abrir();
    await w("__montarBloqueo");
    const bloqueo = page.locator('[data-ui="bloqueo-del-club"]');
    await bloqueo.getByRole("group", { name: "¿Quién entra?" }).getByRole("button", { name: /^Rober/ }).click();
    const pin = bloqueo.getByLabel("PIN de Rober");

    // Sin red: el navegador no tiene conexión. No llama, avisa y no entra.
    await page.context().setOffline(true);
    await pin.fill("1111");
    await bloqueo.getByRole("status").filter({ hasText: "Para firmar como dueño hace falta conexión." }).waitFor();
    assert.equal(await w("__operador"), null, "no entró");
    assert.deepEqual(await w("__llamadas"), [], "sin red no se llama");
    await page.context().setOffline(false);

    // El servidor pide esperar: manda él.
    await w("__modo", "espera");
    await pin.fill("1111");
    await bloqueo.getByRole("status").filter({ hasText: "Probá de nuevo en 30 segundos." }).waitFor();
    assert.equal(await w("__operador"), null, "no entró");

    // Con la puerta bien (y lenta): mientras verifica, el botón se deshabilita y un segundo envío no vuelve a llamar.
    await w("__modo", "lenta");
    const antes = ((await w("__llamadas")) as Llamada[]).length;
    await pin.fill("1111");
    const boton = bloqueo.getByRole("button", { name: "Verificando…" });
    await boton.waitFor();
    assert.equal(await boton.isDisabled(), true);
    await pin.press("Enter");
    assert.equal(((await w("__llamadas")) as Llamada[]).length, antes + 1, "una sola llamada");
    await w("__modo", "ok");
    await w("__soltar");
    await page.waitForFunction(() => (window as unknown as { __operador: () => string | null }).__operador() === "u-rober");
    const ultimas = ((await w("__llamadas")) as Llamada[]).slice(antes);
    assert.deepEqual(ultimas, [{ usuarioId: "u-rober", coincide: true }]);
    assert.deepEqual(errores, []);
    await page.context().close();
  });

  test("una firma de caja: el egreso con la firma de un dueño pasa por el servidor una vez y queda anotado", async (t) => {
    if (!browser) return t.skip(sinNavegador);
    const { page, w, errores } = await abrir();
    await w("__montarCaja");
    const egreso = page.getByRole("form", { name: "Egreso en efectivo" });
    await egreso.waitFor();
    const antes = (await w("__egresos")) as number;
    await egreso.getByLabel("Monto").fill("2500");
    await egreso.getByLabel(/^Concepto/).fill("Hielo");
    await egreso.getByLabel("Firma").selectOption({ label: "Rober (dueño/a)" });
    await egreso.getByLabel("PIN de 4 dígitos").fill("1111");
    await egreso.getByRole("button", { name: "Anotar el egreso" }).click();
    await page.waitForFunction((n) => (window as unknown as { __egresos: () => number }).__egresos() === n + 1, antes);
    assert.deepEqual(await w("__llamadas"), [{ usuarioId: "u-rober", coincide: true }]);
    assert.deepEqual(errores, []);
    await page.context().close();
  });

  test("el celular del dueño (real): el código lo da el servidor; un segundo toque mientras pide no vuelve a pedir", async (t) => {
    if (!browser) return t.skip(sinNavegador);
    const { page, w, errores } = await abrir();
    await w("__montarAprobador");
    await page.getByRole("heading", { name: "¿Lo aprobás?" }).waitFor();
    // Sin red: no hay código.
    await w("__modo", "caida");
    await page.getByLabel(/^Tu PIN/).fill("1111");
    await page.getByRole("button", { name: "Aprobar y ver el código" }).click();
    await page.getByRole("alert").filter({ hasText: "Para aprobar hace falta conexión." }).waitFor();
    assert.equal(await page.getByText("QRS-TUV").count(), 0);
    // Lenta: el botón queda en «Verificando…» y deshabilitado; Enter no vuelve a pedir.
    await w("__modo", "lenta");
    const antes = ((await w("__llamadas")) as Llamada[]).length;
    await page.getByLabel(/^Tu PIN/).fill("1111");
    await page.getByRole("button", { name: "Aprobar y ver el código" }).click();
    const boton = page.getByRole("button", { name: "Verificando…" });
    await boton.waitFor();
    assert.equal(await boton.isDisabled(), true);
    await page.getByLabel(/^Tu PIN/).press("Enter");
    await w("__modo", "ok");
    await w("__soltar");
    await page.getByRole("heading", { name: /^Mandale este código a/ }).waitFor();
    await page.getByText("QRS-TUV").waitFor();
    await page.getByText("Lo aprobás como Rober.").waitFor();
    assert.deepEqual(((await w("__llamadas")) as Llamada[]).slice(antes), [{ usuarioId: null, coincide: true }], "una sola llamada, sin saber de quién");
    assert.deepEqual(errores, []);
    await page.context().close();
  });
});
