// ============================================================================
// ENSAYO DEL PASE — el día que Break Point deja el club de hoy (vanilla) y pasa al club del ERP, de punta a punta.
// ============================================================================
//
// Sigue el runbook (docs/tenants/breakpoint/PASE-AL-ERP.md §4) clic por clic, sin Next ni base real:
//
//   A. EL CLUB DE HOY, con el `club.html` EMPAQUETADO (src/tenants/breakpoint/sitio/club.html, servido por el MISMO
//      manejador del ERP que usa producción, `responderSitioEstatico`, como los e2e del vanilla): un sábado de verdad
//      — consola (dueños con PIN de 4, recepción), conteo de stock, turnos cobrados de varias formas, buffet con la mesa
//      que sigue, un fiado que Majo aprueba desde su celular, cierre de caja y «Descargar respaldo» (sobre v1).
//   B. EL ERP con ese respaldo: ClubDemo REAL (esbuild, el CSS real de la app, el almacén real) en la jornada real NUEVA
//      (`crearClubReal`, sin configurar) y enchufado a la base como en producción (`base` → `crearGuardadoEnLaBase`),
//      con una base FALSA en memoria del lado de Node (gzip y versión optimista, como guardado-enchufado.test.ts) que
//      sobrevive a recargar y a cambiar de compu. Consola de primera vez → un dueño arma un PIN provisorio → «Entrá como
//      dueño» → Configuración → Jornada → «Restaurar desde un archivo» con el PIN → se verifica la caja (= lo cobrado
//      al peso, día por día), clientes, turnos, cuentas, fiados y usuarios, los PIN de siempre en el bloqueo del ERP,
//      la cuenta corriente, la foto en la base y que la compu del mostrador abre lo de la base, bloqueado.
//   C. EL RESPALDO DE `main` con los dueños de PIN de 2 (src/tenants/breakpoint/mes-cargado.fixture.ts, con el motor
//      vanilla): el dueño pasa por «Elegí tu PIN nuevo»; y el mes cargado (lo que pesa un mes de club lleno).
//   D. LO QUE NO TIENE QUE RESTAURAR: respaldo de otro negocio, de la demo, archivo roto, anexo suelto, sin lugar en el
//      equipo (`sin-lugar`) y el puesto de recepción (sin rol OWNER no ve «Restaurar»).
//
// Cada check es `ok(id, condición, qué)`; lo que no funciona queda como check fallido (es una brecha). Al final:
// RESUMEN N/M y sale con 1 si algo falló. Es un e2e (no un `*.test.ts`) por lo mismo que uat-paridad.e2e.ts: es un
// guion largo con estado encadenado y, si aparece una brecha, falla a propósito.
//
// Uso: npm run test:club-pase [carpeta de capturas]   (default: dist/ensayo-pase)
// Reloj fijo: el club de hoy, sábado 17/10/2026 desde las 14:50; el ERP, domingo 18/10/2026 a las 08:30 (antes del
// primer turno, como pide el runbook).
//
// — Elaborado por GSG

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";
import type { Browser, BrowserContext, Page } from "playwright";
import { irASolapa, nombresDeSolapas } from "./solapas-e2e";
import * as M from "@/lib/club/motor.mjs";
import type { EstadoClub } from "@/lib/club/motor.mjs";
import { guardadoDelTexto, resumenDelRespaldo } from "@/lib/club/foto";
import { responderSitioEstatico } from "@/lib/sitio-estatico";
import { armarDiaDeTorneo, armarMesCargado } from "@/tenants/breakpoint/mes-cargado.fixture";
import { claveDeLaJornada } from "./almacen";

const RAIZ = fileURLToPath(new URL("../../../../../", import.meta.url));
const ORIGEN = "http://localhost:3999/admin/club";
const NEGOCIO = "breakpoint";
const CLAVE = claveDeLaJornada(NEGOCIO);
const OUT = process.argv[2] ?? join(RAIZ, "dist", "ensayo-pase");
mkdirSync(OUT, { recursive: true });

// ───────────── el armado del ERP (igual que uat-paridad.e2e.ts / bloqueo-pantalla.test.ts) ─────────────

// La ruta va armada (no literal): limite-del-motor.test.ts busca imports estáticos de ClubDemo fuera de los `*.test.ts`.
const CARPETA = "@/app/admin/(dashboard)/club";
// La base del ERP del lado del navegador: la misma forma que las acciones del servidor (estado-actions.ts), pero
// hablando con la base FALSA de Node (exposeFunction). La foto viaja en gzip, como en producción.
const ENTRADA = `
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import ClubDemo from "${CARPETA}/ClubDemo";
const base = {
  leer: () => window.__baseLeer(),
  guardar: async (datos) => {
    const bytes = new Uint8Array(await datos.get("foto").arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return window.__baseGuardar(btoa(bin), Number(datos.get("version")));
  },
};
window.__montar = (negocio, usuario, rol) =>
  createRoot(document.getElementById("root")).render(createElement(ClubDemo, { negocio, usuario, rol, reloj: "real", base }));
`;
type Ventana = { __montar: (negocio: string, usuario: string, rol: string) => void };

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

async function cssDeLaApp(): Promise<string> {
  try {
    const postcss = (await import("postcss")).default;
    const tailwind = (await import("@tailwindcss/postcss")).default as unknown as (o: { base: string }) => import("postcss").AcceptedPlugin;
    const archivo = join(RAIZ, "src", "app", "globals.css");
    return (await postcss([tailwind({ base: RAIZ })]).process(readFileSync(archivo, "utf8"), { from: archivo })).css;
  } catch {
    return "";
  }
}

// ───────────── los checks ─────────────

type Fila = { id: string; estado: "OK" | "FALLA"; que: string };
const filas: Fila[] = [];
function ok(id: string, cond: unknown, que: string): boolean {
  filas.push({ id, estado: cond ? "OK" : "FALLA", que });
  console.log(`${cond ? "✓" : "✗"} ${id} ${que}`);
  return !!cond;
}
/** Un tramo que puede romperse (un botón que no está): se anota como falla y el guion sigue con el próximo. */
async function tramo(id: string, que: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    ok(`${id}.paso`, false, `${que}: no se pudo — ${(e as Error).message.split("\n")[0].slice(0, 240)}`);
  }
}

const errores: string[] = [];
function escucharErrores(p: Page, quien: string) {
  p.on("pageerror", (e) => errores.push(`${quien}: ${e.message}`));
  p.on("console", (m) => {
    if (m.type() === "error" && !/fonts|ERR_FAILED|404/.test(m.text())) errores.push(`${quien}: ${m.text()}`);
  });
}
let nFoto = 0;
async function foto(p: Page, nombre: string) {
  await p.screenshot({ path: join(OUT, `${String(++nFoto).padStart(2, "0")}-${nombre}.png`), fullPage: true }).catch(() => undefined);
}

// ───────────── la plata: caja = cobrado, día por día ─────────────

type Sobre = { v: number; estado: EstadoClub; secuencia: number; usuario: string | null; guardado: number };
const ingresos = (e: EstadoClub) => e.caja.movimientos.filter((m) => m.tipo === "ingreso").reduce((s, m) => s + m.monto, 0);
/**
 * Σ de los pagos de turnos y cuentas SIN el monedero (los créditos no entran a la caja), por el día de caja de la HORA
 * del cobro. Ojo: un cobro hecho después de cerrar su caja entra en la caja siguiente (`cajaAbierta`), así que día por
 * día se compara contra el mismo cálculo del club de hoy y, en total, contra los ingresos de la caja.
 */
function cobradoPorDia(e: EstadoClub): Record<string, number> {
  const dias: Record<string, number> = {};
  const sumar = (pagos: readonly { medio: string; monto: number; fecha?: string; min?: number }[] | undefined) => {
    for (const p of pagos ?? []) {
      if (p.medio === "monedero") continue;
      const dia = p.fecha ? M.diaDeCaja(e, p.fecha, p.min ?? 0) : "sin-fecha";
      dias[dia] = (dias[dia] ?? 0) + p.monto;
    }
  };
  for (const r of e.reservas) sumar(r.pagos as never);
  for (const c of e.cuentas) sumar(c.pagos as never);
  return dias;
}
const total = (o: Record<string, number>) => Object.values(o).reduce((s, n) => s + n, 0);
/** Caja = cobrado: en total (Σ pagos sin monedero = Σ ingresos) y, día por día, la caja igual a la del club de hoy. */
const cajaCuadra = (e: EstadoClub, original: EstadoClub) =>
  total(cobradoPorDia(e)) === ingresos(e) && ordenado(cajaPorDia(e)) === ordenado(cajaPorDia(original)) && ordenado(cobradoPorDia(e)) === ordenado(cobradoPorDia(original));
/** Los ingresos de la caja por el día de caja de cada movimiento. */
function cajaPorDia(e: EstadoClub): Record<string, number> {
  const dias: Record<string, number> = {};
  for (const m of e.caja.movimientos) {
    if (m.tipo !== "ingreso") continue;
    const dia = m.caja ?? (m.fecha ? M.diaDeCaja(e, m.fecha, m.min ?? 0) : "sin-fecha");
    dias[dia] = (dias[dia] ?? 0) + m.monto;
  }
  return dias;
}
const ordenado = (o: Record<string, number>) => JSON.stringify(Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b))));
const plata = (o: Record<string, number>) => Object.entries(o).sort(([a], [b]) => a.localeCompare(b)).map(([d, n]) => `${d.slice(5)} ${M.pesos(n)}`).join(" · ");
/** Lo que no puede cambiar al pasar al ERP (lo maestro y lo de la jornada), comparado tal cual. */
const LISTAS = ["clientes", "reservas", "cuentas", "usuarios", "novedades", "productos", "canchas", "pedidos", "proveedores"] as const;
function distintas(a: EstadoClub, b: EstadoClub): string[] {
  const fuera = LISTAS.filter((k) => JSON.stringify(a[k] ?? []) !== JSON.stringify(b[k] ?? []));
  for (const k of ["caja", "config"] as const) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) fuera.push(k as never);
  return fuera;
}

// ───────────── la base falsa (del lado de Node: sobrevive a recargar y a cambiar de compu) ─────────────

interface BaseFalsa {
  foto: { texto: string; version: number } | null;
  leer: number;
  guardar: number;
}
const nuevaBase = (): BaseFalsa => ({ foto: null, leer: 0, guardar: 0 });
const fotoDeLaBase = (b: BaseFalsa): Sobre | null => (b.foto ? (JSON.parse(b.foto.texto) as Sobre) : null);

async function enchufarBase(ctx: BrowserContext, b: BaseFalsa) {
  await ctx.exposeFunction("__baseLeer", () => {
    b.leer++;
    return {
      ok: true,
      foto: b.foto && { gzip: gzipSync(b.foto.texto).toString("base64"), version: b.foto.version, guardado: guardadoDelTexto(b.foto.texto), actualizada: new Date().toISOString() },
    };
  });
  await ctx.exposeFunction("__baseGuardar", (b64: string, version: number) => {
    b.guardar++;
    const actual = b.foto?.version ?? 0;
    if (version !== actual) return { ok: false, motivo: "conflicto", version: actual, error: "Otra terminal guardó." };
    b.foto = { texto: gunzipSync(Buffer.from(b64, "base64")).toString("utf8"), version: actual + 1 };
    return { ok: true, version: actual + 1 };
  });
}

// ───────────── el ERP en el navegador ─────────────

let navegador: Browser;
let bundle = "";
let css = "";
const html = () => `<!doctype html><html lang="es"><head><style>${css}</style></head><body class="bg-surface text-body"><main id="root" class="p-4"></main></body></html>`;
/** El día del pase en el ERP: domingo a la mañana, antes del primer turno. */
const MANANA_DEL_PASE = new Date("2026-10-18T08:30:00-03:00");

/** Una compu con el ERP: su localStorage vacío (otra compu), la base falsa enchufada y el reloj fijo. */
async function compuDelErp(b: BaseFalsa): Promise<BrowserContext> {
  const ctx = await navegador.newContext({ viewport: { width: 1366, height: 900 }, locale: "es-AR", timezoneId: "America/Argentina/Buenos_Aires", acceptDownloads: true });
  await ctx.clock.install({ time: MANANA_DEL_PASE });
  await ctx.route(ORIGEN, (rt) => rt.fulfill({ contentType: "text/html; charset=utf-8", body: html() }));
  await enchufarBase(ctx, b);
  return ctx;
}

/** Abre /admin/club con el login del puesto (`rol`) en la jornada real, enchufado a la base (como ClubCargador). */
async function abrirClub(ctx: BrowserContext, rol: "OWNER" | "RECEPTION", quien: string): Promise<Page> {
  const p = await ctx.newPage();
  p.setDefaultTimeout(6000);
  escucharErrores(p, quien);
  await p.addInitScript({ content: "window.__name = (f) => f;" });
  await p.goto(ORIGEN);
  await montar(p, rol);
  return p;
}
async function montar(p: Page, rol: string) {
  await p.addScriptTag({ content: bundle });
  await p.evaluate(([n, r]) => (window as unknown as Ventana).__montar(n, "u_puesto", r), [NEGOCIO, rol]);
  await p
    .getByRole("heading", { name: "Agenda de canchas" })
    .or(p.getByText(/Entrá con tu PIN para ver y operar el club/))
    .or(p.getByRole("heading", { name: "Primera vez: armá el club" }))
    .first()
    .waitFor({ timeout: 10_000 })
    .catch(() => undefined);
}

/** El estado guardado en esta compu (lo pendiente se escribe con `pagehide`, como al cerrar la pestaña). */
async function estadoErp(p: Page): Promise<EstadoClub> {
  await p.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  const t = await p.evaluate((k) => localStorage.getItem(k), CLAVE);
  return (JSON.parse(t ?? "{}") as { estado: EstadoClub }).estado;
}
/** Deja correr el reloj (el guardado a la base sale 30 s después del primer cambio) y espera al gzip, que es real. */
async function dejarCorrer(ctx: BrowserContext, p: Page, ms: number) {
  await ctx.clock.runFor(ms);
  await p.waitForTimeout(400);
}

const bloqueo = (p: Page) => p.locator('dialog[data-ui="bloqueo-del-club"]');
const bloqueada = async (p: Page) => (await bloqueo(p).count()) > 0 && (await bloqueo(p).evaluate((d) => (d as HTMLDialogElement).open).catch(() => false));
const pinDelBloqueo = (p: Page) => bloqueo(p).locator('input[type="password"]').first();
const textoDelBloqueo = async (p: Page) => ((await bloqueo(p).count()) ? await bloqueo(p).innerText() : "");
/** Elige a la persona en el bloqueo (si hace falta, «Entrar con otro usuario») y pone su PIN. */
async function elegirEnElBloqueo(p: Page, quien: RegExp) {
  const lista = bloqueo(p).getByRole("group", { name: "¿Quién entra?" });
  if (!(await lista.count())) await bloqueo(p).getByRole("button", { name: /Entrar con otro usuario|Elegir otro usuario/ }).click();
  await lista.getByRole("button", { name: quien }).click();
}
async function desbloquear(p: Page, quien: RegExp, pin: string) {
  await bloqueo(p).waitFor({ timeout: 4000 });
  await elegirEnElBloqueo(p, quien);
  await pinDelBloqueo(p).fill(pin);
  // Un PIN de 2 de un dueño no se prueba solo (espera los 4): se confirma con «Desbloquear».
  if (pin.length === 2 && (await bloqueada(p)) && (await bloqueo(p).getByRole("button", { name: "Desbloquear" }).count())) {
    const sigueElCampo = await pinDelBloqueo(p).inputValue().catch(() => "");
    if (sigueElCampo === pin) await bloqueo(p).getByRole("button", { name: "Desbloquear" }).click();
  }
  await bloqueo(p).waitFor({ state: "detached", timeout: 3000 }).catch(() => undefined);
}
async function bloquearAMano(p: Page) {
  await p.getByRole("button", { name: /^Bloquear/ }).click();
  await bloqueo(p).waitFor({ timeout: 3000 });
}
async function solapas(p: Page): Promise<string[]> {
  return nombresDeSolapas(p);
}
async function irA(p: Page, etiqueta: string) {
  await irASolapa(p, etiqueta);
  await p.waitForTimeout(200);
}
const seccionJornada = (p: Page) => p.getByRole("region", { name: "Jornada", exact: true });
const errorDeSeccion = async (p: Page) => (await seccionJornada(p).getByRole("alert").allInnerTexts().catch(() => [])).join(" ").trim();

/** La primera vez: un dueño arma su PIN (provisorio) y entra; queda en Configuración. */
async function primeraVezYEntrar(p: Page, pin: string) {
  const consola = p.getByRole("region", { name: "Configuración inicial del club" });
  const rober = consola.getByRole("form", { name: "PIN de Roberto Ronco" });
  await rober.getByLabel("PIN (4 números)").fill(pin);
  await rober.getByLabel("Repetilo").fill(pin);
  await rober.getByRole("button", { name: "Guardar el PIN de Roberto" }).click();
  await consola.getByText("✔ Roberto Ronco ya armó su PIN.").waitFor();
  const entrar = consola.getByRole("form", { name: "Entrar como Roberto" });
  await entrar.getByLabel("PIN de Roberto").fill(pin);
  await entrar.getByRole("button", { name: "Entrar como Roberto" }).click();
  await p.getByRole("tab", { name: "Configuración", selected: true }).waitFor();
}

/** Configuración → Jornada → «Restaurar desde un archivo»: elige el archivo y devuelve lo que muestra (o el error). */
async function elegirRespaldo(p: Page, ruta: string): Promise<{ previa: string; error: string }> {
  await seccionJornada(p).getByLabel("Elegí el respaldo").setInputFiles(ruta);
  const form = p.getByRole("form", { name: "Restaurar este respaldo" });
  await form.or(seccionJornada(p).getByRole("alert").filter({ hasText: /\S/ })).first().waitFor({ timeout: 3000 }).catch(() => undefined);
  return { previa: (await form.count()) ? await form.innerText() : "", error: await errorDeSeccion(p) };
}
async function confirmarRestaurar(p: Page, pin: string) {
  const form = p.getByRole("form", { name: "Restaurar este respaldo" });
  await form.getByLabel(/^PIN de|^Tu PIN/).fill(pin);
  await form.getByRole("button", { name: "Restaurar este respaldo" }).click();
  await p.waitForTimeout(400);
}

function escribirArchivo(nombre: string, contenido: string): string {
  const ruta = join(OUT, nombre);
  writeFileSync(ruta, contenido);
  return ruta;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// A. EL CLUB DE HOY (vanilla empaquetado): la jornada de verdad y el respaldo
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════

interface DelVanilla {
  ruta: string;
  sobre: Sobre;
  pines: Record<string, string>;
  ids: Record<string, string>;
}

async function jornadaDelVanilla(baseSitio: string): Promise<DelVanilla | null> {
  const ctx = await navegador.newContext({ viewport: { width: 1366, height: 900 }, timezoneId: "America/Argentina/Buenos_Aires", acceptDownloads: true });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  // Sábado de torneo: todo el día es pico (28.000/h → turno de 90′ = 42.000; 10.500 c/u).
  await ctx.clock.install({ time: new Date("2026-10-17T14:50:00-03:00") });
  const p = await ctx.newPage();
  escucharErrores(p, "vanilla");
  const W = (ms = 250) => p.waitForTimeout(ms);
  const aviso = async () => ((await p.$("#dlg[open] #dlg-aviso")) ? await p.textContent("#dlg-aviso") : "") || (await p.textContent("#toasts")) || "";
  const dlgAbierto = () => p.evaluate(() => (document.getElementById("dlg") as HTMLDialogElement).open);
  const cerrar = async () => {
    if (await dlgAbierto()) {
      await p.click('#dlg .dlg-h [data-a="cerrar"]').catch(() => p.keyboard.press("Escape"));
      await W();
    }
  };
  const estado = async (): Promise<EstadoClub> => {
    await W(450);
    return (JSON.parse((await p.evaluate(() => localStorage.getItem("bp-jornada-v1"))) ?? "{}") as Sobre).estado;
  };
  const bloqueadaV = () => p.evaluate(() => (document.getElementById("bloqueo") as HTMLDialogElement).open);
  async function irTab(id: string) {
    await cerrar();
    const vis = await p.$(`#tabs [data-a="tab"][data-v="${id}"]`);
    if (vis) await vis.click();
    else {
      await p.click("#btn-mas");
      await W(150);
      await p.click(`#mas-menu [data-v="${id}"]`);
    }
    await W(300);
  }
  async function desbloquearV(pin: string) {
    await p.fill("#bl-pin", pin);
    await W(400);
  }
  async function entrarComo(id: string, pin: string) {
    await cerrar();
    await p.click('[data-a="usuario"]');
    await W();
    await p.click(`[data-a="elegirUsuario"][data-v="${id}"]`);
    await p.fill("#pin-usuario", pin);
    await p.click('#dlg [data-a="entrar"]');
    await W(300);
  }
  async function abrirTurno(id: string) {
    await cerrar();
    await irTab("agenda");
    await p.click(`#app .blk[data-v="${id}"]`);
    await W(300);
  }
  async function medio(m: string) {
    await p.click(`#dlg .cuenta-turno [data-a="medio"][data-v="${m}"]`);
    await W(100);
  }
  async function cargar(reservaId: string, jugador: number, buscar: string, productoId: string, cant: number) {
    await p.check(`#jug-${jugador}`);
    await W(100);
    await p.fill("#bp-turno", buscar);
    await W(300);
    await p.click(`[data-a="elegirProducto"][data-c="turno"][data-v="${productoId}"]`);
    await W(150);
    await p.fill("#cant-turno", String(cant));
    await p.click(`[data-a="consumo"][data-v="${reservaId}"][data-m="cuenta"]`);
    await W(250);
  }
  async function nuevoTurno(cancha: string, hora: number, titular: string, tel: string) {
    await cerrar();
    await irTab("agenda");
    await p.click('#app [data-a="nuevo"]:not([data-c])');
    await W(300);
    await p.selectOption("#f-cancha", cancha);
    await W(200);
    await p.selectOption("#f-hora", String(hora));
    await W(200);
    await p.fill("#f-titular", titular);
    await p.fill("#f-tel", tel);
    await p.click('#dlg [data-a="confirmarTurno"]');
    await W(300);
    await cerrar();
    const e = await estado();
    return e.reservas.find((r) => r.titular === titular && r.canchaId === cancha && r.inicio === hora && r.estado === "reservada")!;
  }
  async function completarYAbrir(id: string, jugadores: string[]) {
    await abrirTurno(id);
    for (const nombre of jugadores) {
      await p.fill("#nuevo-jug", nombre);
      await p.click(`[data-a="sumarJugador"][data-v="${id}"]`);
      await W(200);
    }
    await p.click(`#dlg [data-a="checkin"][data-v="${id}"]`);
    await W(250);
  }

  const pines: Record<string, string> = { "Roberto Ronco": "5757", "Majo Gimenez": "8484" };
  let ids: Record<string, string> = {};
  let sobre: Sobre | null = null;
  let ruta = "";

  await tramo("A0", "consola del club de hoy", async () => {
    await p.goto(`${baseSitio}/club?modo=real`);
    await W(800);
    ok("A0.consola", await p.isVisible("#t-consola"), "El club de hoy arranca en la consola de configuración (jornada real en blanco)");
    for (const [id, pin] of [["u-rober", "5757"], ["u-majo", "8484"]]) {
      await p.fill(`#pi-${id}`, pin);
      await p.fill(`#pi2-${id}`, pin);
      await p.click(`[data-a="pinInicial"][data-v="${id}"]`);
      await W();
    }
    for (const [sel, v] of [
      ['[data-a="contacto"][data-v="u-rober"]', "5491100000001"],
      ['[data-a="contacto"][data-v="u-majo"]', "5491100000002"],
      ['[data-a="contacto"][data-v="club"]', "5491100000009"],
      ['[data-a="alias"]', "bp.prueba.pase"],
    ]) {
      await p.fill(`#app ${sel}`, v);
      await p.press(`#app ${sel}`, "Tab");
      await W(200);
    }
    for (const nombre of ["Lu", "Caro"]) {
      await p.fill("#nu-nombre", nombre);
      await p.click('[data-a="altaUsuarioConsola"]');
      await W();
      pines[nombre] = (await aviso()).match(/PIN (\d{2})/)?.[1] ?? "";
    }
    await p.fill('#app [data-a="fondo"]', "20000");
    await p.press('#app [data-a="fondo"]', "Tab");
    await W(300);
    await p.click('[data-a="terminarConsola"]');
    await W(400);
    ok("A0.abre", (await bloqueadaV()) && /^\d{2}$/.test(pines.Lu) && /^\d{2}$/.test(pines.Caro), `Dueños con PIN de 4 (Roberto y Majo), recepción Lu y Caro con PIN de 2, fondo $ 20.000; «Abrir el club» → bloqueado`);
    await desbloquearV("5757");
    ids = Object.fromEntries((await estado()).usuarios.map((u) => [u.nombre, u.id]));
    // Roberto cuenta el stock antes de abrir.
    await irTab("stock");
    for (const [pid, n] of [["p2", 42], ["p9", 48]] as const) {
      await p.click(`#app [data-a="editarProducto"][data-v="${pid}"]`);
      await W(250);
      await p.fill("#pr-stk-aj", String(n));
      await p.click('#dlg [data-a="guardarProducto"]');
      await W(250);
    }
    const e = await estado();
    ok("A0.stock", e.productos.find((x) => x.id === "p2")?.stock === 42 && e.productos.find((x) => x.id === "p9")?.stock === 48, "Roberto cuenta el stock: agua 42, cerveza 48");
  });

  const R: Record<string, string> = {};
  await tramo("A1", "recepción: turnos y buffet", async () => {
    await entrarComo(ids.Lu, pines.Lu);
    const grupos = [
      { cancha: "c1", titular: "Tomás Medina", tel: "1155550001", jug: ["Sofía Gómez", "Lucas Ríos", "Martín Paz"] },
      { cancha: "c2", titular: "Camila Sosa", tel: "1155550002", jug: ["Valen Luna", "Fede Acosta", "Juli Vera"] },
      { cancha: "c3", titular: "Juan Pérez", tel: "1155550004", jug: ["Gonza Ortiz", "Mica Castro", "Diego Molina"] },
    ];
    for (const g of grupos) {
      R[g.cancha] = (await nuevoTurno(g.cancha, 900, g.titular, g.tel)).id;
      await completarYAbrir(R[g.cancha], g.jug);
    }
    // Buffet: cancha 1, aguas, cervezas y una picada; cancha 2, dos cervezas; cancha 3, Juan dos aguas.
    await abrirTurno(R.c1);
    await cargar(R.c1, 0, "agua", "p2", 2);
    await cargar(R.c1, 1, "cerveza", "p9", 2);
    await cargar(R.c1, 2, "picada", "k-pica", 1);
    await abrirTurno(R.c2);
    await cargar(R.c2, 0, "cerveza", "p9", 2);
    await abrirTurno(R.c3);
    await cargar(R.c3, 0, "agua", "p2", 2);
    const e = await estado();
    ok("A1.turnos", grupos.every((g) => M.reserva(e, R[g.cancha])?.estado === "en_cancha" && M.reserva(e, R[g.cancha])?.jugadores.length === 4), "Lu da 3 turnos a las 15:00 (4 jugadores cada uno, con su teléfono) y los pone en cancha");
    ok("A1.buffet", e.productos.find((x) => x.id === "p2")?.stock === 38 && e.productos.find((x) => x.id === "p9")?.stock === 44, "Buffet cargado a las cuentas del turno: agua 42 → 38, cerveza 48 → 44");
  });

  await tramo("A2", "cobros, la mesa que sigue y el fiado", async () => {
    await cerrar();
    await ctx.clock.runFor(101 * 60 * 1000);
    await W(500);
    if (await bloqueadaV()) await desbloquearV(pines.Lu);
    // Cancha 1: la cancha en efectivo y se cierra; la mesa sigue en Buffet y se cobra por Mercado Pago.
    await abrirTurno(R.c1);
    await medio("efectivo");
    await p.click(`#dlg [data-a="cerrarYSeguir"][data-v="${R.c1}"]`);
    await W(400);
    await irTab("buffet");
    await p.click(`[data-a="verMesa"][data-v="${R.c1}"]`);
    await W(300);
    await cargar(R.c1, 3, "cerveza", "p9", 1);
    await medio("mercadopago");
    await p.click(`#dlg [data-a="cerrarCargos"][data-v="${R.c1}"]`);
    await W(300);
    // Cancha 2: cada jugador con su medio.
    await abrirTurno(R.c2);
    for (const [j, m] of [[0, "efectivo"], [1, "mercadopago"], [2, "transferencia"], [3, "debito"]] as const) {
      await medio(m);
      await p.click(`#dlg [data-a="cobrarJugador"][data-j="${j}"]`);
      await W(250);
    }
    await p.click(`#dlg [data-a="cerrarYSeguir"][data-v="${R.c2}"]`);
    await W(300);
    // Cancha 3: la cancha en débito; Juan pide que le fíen sus dos aguas.
    await abrirTurno(R.c3);
    await medio("debito");
    await p.click(`#dlg [data-a="cerrarYSeguir"][data-v="${R.c3}"]`);
    await W(300);
    let e = await estado();
    const ctaJuan = M.cuentaDeJugador(e, M.reserva(e, R.c3)!, 0)!;
    await abrirTurno(R.c3);
    await p.click(`#dlg .jug-cargos [data-a="verCuenta"][data-v="${ctaJuan.id}"]`);
    await W(300);
    await p.click(`#dlg [data-a="pedirFiado"][data-v="${ctaJuan.id}"]`);
    await W(300);
    const href = (await p.getAttribute('#dlg [data-wa-aprob="u-majo"]', "href")) ?? "";
    const link = decodeURIComponent(href.split("?text=")[1] ?? "").match(/https?:\/\/\S+#aprobar&\S+/)?.[0] ?? "";
    // El celular de Majo: otro dispositivo, sin la jornada; abre el link, pone su PIN y le sale el código.
    const cel = await navegador.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "America/Argentina/Buenos_Aires" });
    await cel.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    const pc = await cel.newPage();
    await pc.goto(link);
    await pc.waitForTimeout(800);
    await pc.click('#dlg [data-a="aprobQuien"][data-v="u-majo"]');
    await pc.waitForTimeout(200);
    await pc.fill("#ap-pin", "8484");
    await pc.click('#dlg [data-a="aprobarLink"]');
    await pc.waitForTimeout(300);
    const codigo = ((await pc.textContent(".codigo-aprob")) ?? "").trim();
    await cel.close();
    await p.fill("#codigo-aprob", codigo);
    await p.click('#dlg [data-a="aprobarCodigo"]');
    await W();
    const aprobado = /Aprobado por Majo Gimenez/.test(await aviso());
    await p.click(`#dlg [data-a="cerrarCuenta"][data-m="cuenta"]`);
    await W(300);
    e = await estado();
    const juan = e.clientes.find((c) => c.nombre === "Juan Pérez");
    ok("A2.fiado", aprobado && juan?.deuda === 4000 && (juan?.fiados ?? []).length > 0, `Majo aprueba el fiado desde su celular (código ${codigo}) y los $ 4.000 de Juan pasan a su cuenta corriente`);
    ok("A2.cobrado", [R.c1, R.c2, R.c3].every((id) => M.cuentaDelTurno(e, id).ok && (M.cuentaDelTurno(e, id) as { totales: { pendiente: number } }).totales.pendiente === 0), "Las 3 canchas quedan en cero (cobradas o a cuenta corriente)");
  });

  await tramo("A3", "cierre de caja y respaldo", async () => {
    await entrarComo(ids["Majo Gimenez"], "8484");
    await irTab("caja");
    await p.click('[data-a="cerrarCaja"]');
    await W();
    await p.fill("#k-pin", "8484");
    await p.click('#dlg [data-a="aplicarCierre"]');
    await W(300);
    await cerrar();
    const e = await estado();
    ok("A3.caja", e.caja.cierres.length === 1 && e.caja.cierres[0].esperado != null, `Majo cierra la caja del día con su PIN (ingresos ${M.pesos(ingresos(e))})`);
    await irTab("ajustes");
    const [bajado] = await Promise.all([p.waitForEvent("download"), p.click('#app [data-a="respaldo"]')]);
    const texto = await readFile((await bajado.path())!, "utf8");
    sobre = JSON.parse(texto) as Sobre;
    ruta = escribirArchivo(bajado.suggestedFilename(), texto);
    const enLaCompu = await estado();
    ok(
      "A3.respaldo",
      /^breakpoint-jornada-2026-10-17-\d{4}\.json$/.test(bajado.suggestedFilename()) && sobre.v === 1 && distintas(sobre.estado, enLaCompu).length === 0,
      `«Descargar respaldo» → ${bajado.suggestedFilename()} (sobre v1, igual a lo guardado en la compu)`,
    );
    const r = resumenDelRespaldo(sobre.estado);
    ok("A3.sano", ordenado(cobradoPorDia(sobre.estado)) === ordenado(cajaPorDia(sobre.estado)) && total(cobradoPorDia(sobre.estado)) === ingresos(sobre.estado) && r.conteos.cierresDeCaja === 1, `El respaldo está sano: caja = cobrado por día (${plata(cajaPorDia(sobre.estado))}), una caja cerrada`);
  });
  await foto(p, "vanilla-ajustes");
  await ctx.close();
  return sobre && ruta ? { ruta, sobre, pines, ids } : null;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// B. EL ERP: jornada real nueva → restaurar el respaldo del club de hoy → verificar
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════

const PIN_PROVISORIO = "3906";

async function paseConElRespaldo(v: DelVanilla): Promise<void> {
  const base = nuevaBase();
  const ctx = await compuDelErp(base);
  const p = await abrirClub(ctx, "OWNER", "erp-duenio");
  const original = v.sobre.estado;

  await tramo("B1", "primera vez en el ERP", async () => {
    ok("B1.nueva", (await p.getByRole("heading", { name: "Primera vez: armá el club" }).count()) === 1 && base.leer === 1 && base.foto === null, "Jornada real nueva en el ERP: «Primera vez: armá el club» (la base se leyó una vez y está vacía)");
    await primeraVezYEntrar(p, PIN_PROVISORIO);
    const enJornada = seccionJornada(p);
    ok("B1.jornada", (await enJornada.getByRole("heading", { name: "Restaurar desde un archivo" }).count()) === 1, "Roberto entra con el PIN provisorio y, sin abrir el club, ya ve Configuración → Jornada → «Restaurar desde un archivo»");
    await foto(p, "erp-primera-vez-adentro");
  });

  await tramo("B2", "restaurar el respaldo del club de hoy", async () => {
    const { previa, error } = await elegirRespaldo(p, v.ruta);
    const r = resumenDelRespaldo(original);
    ok(
      "B2.previa",
      previa.includes(`${original.reservas.length} turnos, ${original.clientes.filter((c) => c.activo !== false).length} clientes y ${original.usuarios.filter((u) => u.activo !== false).length} usuarios`) && /sábado 17\/10\/2026/.test(previa) && !error,
      `Al elegir el archivo muestra de cuándo es y qué trae («${previa.split("\n")[0]}»; ${r.conteos.reservas} turnos)`,
    );
    await foto(p, "erp-restaurar-previa");
    await confirmarRestaurar(p, PIN_PROVISORIO);
    ok("B2.bloquea", await bloqueada(p), "Restaurado: el PIN provisorio ya no existe en lo restaurado → la pantalla se bloquea sola");
    await foto(p, "erp-restaurado-bloqueado");
  });

  await tramo("B3", "los PIN de siempre en el bloqueo del ERP", async () => {
    await desbloquear(p, /^Roberto/, PIN_PROVISORIO);
    ok("B3.provisorio", await bloqueada(p), "El PIN provisorio de Roberto ya no entra");
    await desbloquear(p, /^Roberto/, v.pines["Roberto Ronco"]);
    ok("B3.rober", !(await bloqueada(p)) && (await solapas(p)).includes("Configuración"), "Roberto entra con su PIN de siempre (4 números) y ve lo de dueño");
    await bloquearAMano(p);
    await desbloquear(p, /^Lu\b/, v.pines.Lu);
    const deLu = await solapas(p);
    ok("B3.lu", !(await bloqueada(p)) && !deLu.includes("Configuración") && deLu.includes("Caja"), `Lu (recepción) entra con su PIN de 2 de siempre y ve sólo lo de recepción (${deLu.join(", ")})`);
    await bloquearAMano(p);
    await desbloquear(p, /^Caro\b/, v.pines.Caro);
    ok("B3.caro", !(await bloqueada(p)), "Caro (recepción) también entra con su PIN de siempre");
    await bloquearAMano(p);
    await desbloquear(p, /^Majo/, v.pines["Majo Gimenez"]);
    ok("B3.majo", !(await bloqueada(p)) && (await solapas(p)).includes("Configuración"), "Majo entra con su PIN de siempre");
  });

  await tramo("B4", "la plata y los datos, al peso", async () => {
    const e = await estadoErp(p);
    const fuera = distintas(original, e);
    ok("B4.iguales", fuera.length === 0, `Mismos clientes, turnos, cuentas, fiados y pedidos de crédito, usuarios, productos y caja que el club de hoy${fuera.length ? ` (distinto: ${fuera.join(", ")})` : ""}`);
    const caja = cajaPorDia(e);
    const cobrado = cobradoPorDia(e);
    ok("B4.caja", cajaCuadra(e, original) && ordenado(caja) === ordenado(cobrado), `Caja = lo cobrado (Σ pagos sin monedero), día por día, igual que en el club de hoy: ${plata(caja)}`);
    ok("B4.cierre", JSON.stringify(e.caja.cierres) === JSON.stringify(original.caja.cierres) && e.caja.fondo === original.caja.fondo, `La caja cerrada del sábado viaja igual (esperado ${M.pesos(e.caja.cierres[0]?.esperado ?? 0)}, fondo ${M.pesos(e.caja.fondo)})`);
    const juan = e.clientes.find((c) => c.nombre === "Juan Pérez");
    const sumaCC = (juan?.movCC ?? []).reduce((s, m) => s + m.importe, 0);
    ok("B4.cc", juan?.deuda === 4000 && sumaCC === 4000 && (juan?.fiados ?? []).length === (original.clientes.find((c) => c.nombre === "Juan Pérez")?.fiados ?? []).length, `La cuenta corriente cuadra: Juan debe ${M.pesos(juan?.deuda ?? 0)} y Σ de sus movimientos da ${M.pesos(sumaCC)}`);
    // En la pantalla: Clientes → Juan → su estado de cuenta.
    await irA(p, "Clientes");
    await p.getByLabel("Buscar por nombre o teléfono").fill("Juan");
    await p.getByRole("list", { name: "Clientes del club" }).getByRole("button", { name: /^Juan Pérez/ }).click();
    const ficha = p.getByRole("region", { name: "Juan Pérez", exact: true });
    await ficha.waitFor();
    const textoFicha = (await ficha.innerText()).replace(/\s+/g, " ");
    ok("B4.ficha", /\$\s?4\.000/.test(textoFicha) && (await ficha.getByRole("table", { name: /Movimientos de la cuenta corriente/ }).getByRole("row").count()) >= 2, "Clientes → Juan Pérez: debe $ 4.000, con su movimiento en el estado de cuenta");
    await foto(p, "erp-ficha-juan");
    await ficha.getByRole("button", { name: "Cerrar la ficha" }).click().catch(() => undefined);
  });

  await tramo("B5", "la foto en la base", async () => {
    // El estado de B4 ya hizo salir la subida (pagehide): la base tiene la jornada restaurada.
    await dejarCorrer(ctx, p, 31_000);
    const f = fotoDeLaBase(base);
    ok("B5.base", !!f && base.guardar >= 1 && distintas(original, f.estado).length === 0, `La jornada restaurada quedó guardada en la base (versión ${base.foto?.version ?? 0}, ${base.guardar} subida/s, ${Math.round((base.foto?.texto.length ?? 0) / 1024)} KB)`);
  });

  await tramo("D1", "lo que no tiene que restaurar", async () => {
    await irA(p, "Configuración");
    const antes = await estadoErp(p);
    // [id, archivo, qué es, el PIN de Majo en ese archivo (para volver si lo restaura)]
    const casos: [string, string, string, string][] = [];
    // Otro negocio: el mismo formato, pero de otro club.
    const otro = structuredClone(v.sobre);
    otro.estado.config.nombre = "Club La Red Pádel";
    casos.push(["otro-negocio", escribirArchivo("otro-negocio.json", JSON.stringify(otro)), "un respaldo de otro negocio", v.pines["Majo Gimenez"]]);
    // Roto: cortado a la mitad (se cortó la descarga).
    const texto = readFileSync(v.ruta, "utf8");
    casos.push(["roto", escribirArchivo("roto.json", texto.slice(0, Math.floor(texto.length / 2))), "un archivo cortado", ""]);
    // El anexo suelto de un archivado (la historia de los días, no un respaldo).
    const anexo = { v: 1, tipo: "anexo-jornada", club: "Break Point Pádel", desde: "2026-10-01", hasta: "2026-10-10", reservas: [], cuentas: [], movimientos: [] };
    casos.push(["anexo", escribirArchivo("breakpoint-archivo-2026-10-10.json", JSON.stringify(anexo)), "el anexo suelto de un archivado", ""]);
    // La demo del club de hoy (datos de ejemplo y PIN de ejemplo, que están a la vista en la demo pública).
    const demo = { v: 1, estado: M.generarDemo("2026-10-17"), secuencia: 900, usuario: null, guardado: Date.UTC(2026, 9, 17, 18) };
    casos.push(["demo", escribirArchivo("respaldo-de-la-demo.json", JSON.stringify(demo)), "un respaldo de la demo", demo.estado.usuarios.find((u) => u.id === "u-majo")?.pin ?? ""]);
    for (const [id, ruta, que, pinMajoAhi] of casos) {
      const { previa, error } = await elegirRespaldo(p, ruta);
      if (!previa) {
        ok(`D1.${id}`, !!error, `Con ${que} no restaura y dice por qué: «${error.slice(0, 140)}»`);
        continue;
      }
      // Lo deja elegir: se prueba si además restaura (con el PIN de Majo, que es quien opera).
      await confirmarRestaurar(p, v.pines["Majo Gimenez"]);
      if (await bloqueada(p)) await desbloquear(p, /^Majo/, pinMajoAhi);
      const despues = await estadoErp(p).catch(() => antes);
      const restauro = distintas(antes, despues).length > 0;
      ok(`D1.${id}`, false, `Con ${que} NO tendría que restaurar: muestra «${previa.split("\n")[0].slice(0, 90)}»${restauro ? ` y RESTAURA (entra Majo con el PIN de ese archivo: ${pinMajoAhi.length} números)` : ""}`);
      if (!restauro) {
        await p.getByRole("form", { name: "Restaurar este respaldo" }).getByRole("button", { name: "Cancelar" }).click().catch(() => undefined);
        continue;
      }
      // Se vuelve a la jornada del club de hoy para seguir el ensayo (firma Majo con el PIN de lo restaurado).
      await irA(p, "Configuración");
      await elegirRespaldo(p, v.ruta);
      await confirmarRestaurar(p, pinMajoAhi);
      if (await bloqueada(p)) await desbloquear(p, /^Majo/, v.pines["Majo Gimenez"]);
      await irA(p, "Configuración");
    }
    const despues = await estadoErp(p);
    ok("D1.de-vuelta", distintas(antes, despues).length === 0, "Después de los archivos malos, la jornada es la del club de hoy");
  });

  await tramo("D2", "sin lugar en el equipo", async () => {
    const antes = await estadoErp(p);
    await dejarCorrer(ctx, p, 31_000);
    const versionAntes = base.foto?.version ?? 0;
    // El equipo casi lleno: entra lo de siempre, no una copia más de la jornada (como bloqueo-pantalla.test.ts).
    const relleno = await p.evaluate(() => {
      const puestos: string[] = [];
      for (const tam of [1 << 20, 1 << 16, 1 << 12, 1 << 8]) {
        const trozo = "x".repeat(tam);
        for (;;) {
          const k = `relleno-${puestos.length}`;
          try {
            localStorage.setItem(k, trozo);
            puestos.push(k);
          } catch {
            break;
          }
        }
      }
      let libre = 0;
      while (libre < 4096 && puestos.length) {
        const k = puestos.pop()!;
        libre += localStorage.getItem(k)!.length;
        localStorage.removeItem(k);
      }
      return puestos;
    });
    const { previa } = await elegirRespaldo(p, v.ruta);
    if (previa) await confirmarRestaurar(p, v.pines["Majo Gimenez"]);
    const error = await errorDeSeccion(p);
    await p.evaluate((ks) => ks.forEach((k) => localStorage.removeItem(k)), relleno);
    const despues = await estadoErp(p);
    await dejarCorrer(ctx, p, 31_000);
    ok(
      "D2.sin-lugar",
      relleno.length > 0 && /No hay lugar/.test(error) && !(await bloqueada(p)) && distintas(antes, despues).length === 0 && (base.foto?.version ?? 0) === versionAntes,
      `Sin lugar para la copia de lo de ahora no restaura (\`sin-lugar\`): «${error.slice(0, 110)}»; la jornada y la base quedan igual`,
    );
  });

  await ctx.close();

  // ── El mostrador (otra compu, login de Recepción): abre lo de la base, bloqueado ──
  const ctxM = await compuDelErp(base);
  await tramo("B6", "la compu del mostrador", async () => {
    const pm = await abrirClub(ctxM, "RECEPTION", "erp-mostrador");
    await bloqueo(pm).waitFor({ timeout: 6000 }).catch(() => undefined);
    ok("B6.bloqueada", (await bloqueada(pm)) && (await pm.getByRole("heading", { name: "Primera vez: armá el club" }).count()) === 0, "En la compu del mostrador, /admin/club abre lo de la base, bloqueado (no la consola de primera vez)");
    await desbloquear(pm, /^Lu\b/, v.pines.Lu);
    await irA(pm, "Clientes");
    const lista = (await pm.getByRole("list", { name: "Clientes del club" }).innerText()).replace(/\s+/g, " ");
    const enLaBase = fotoDeLaBase(base);
    await pm.evaluate(() => window.dispatchEvent(new Event("pagehide")));
    const copiaLocal = (await pm.evaluate((k) => localStorage.getItem(k), CLAVE)) !== null;
    console.log(`  (dato) copia de la jornada en la compu del mostrador antes del primer cambio: ${copiaLocal ? "sí" : "no"}`);
    ok(
      "B6.lu",
      !(await bloqueada(pm)) && ["Tomás Medina", "Camila Sosa", "Juan Pérez"].every((n) => lista.includes(n)) && !!enLaBase && distintas(original, enLaBase.estado).length === 0,
      `Recepción entra con su PIN de siempre y ve los clientes del club de hoy; la base sigue con la jornada restaurada (caja ${plata(cajaPorDia(enLaBase?.estado ?? original))})`,
    );
    await foto(pm, "erp-mostrador-adentro");
    // D3: en el puesto de recepción, ni un dueño con su PIN ve «Restaurar».
    await bloquearAMano(pm);
    await desbloquear(pm, /^Majo/, v.pines["Majo Gimenez"]);
    await irA(pm, "Configuración");
    const jornada = seccionJornada(pm);
    await jornada.waitFor();
    ok(
      "D3.recepcion",
      (await jornada.getByRole("heading", { name: "Restaurar desde un archivo" }).count()) === 0 && (await jornada.getByLabel("Elegí el respaldo").count()) === 0 && /Esto se hace desde el puesto del dueño/.test(await jornada.innerText()),
      "En el puesto de recepción (login sin rol de dueño), aunque entre Majo con su PIN, no aparece «Restaurar»: avisa que se hace desde el puesto del dueño",
    );
    await foto(pm, "erp-mostrador-sin-restaurar");
    // Recargar la página (la compu se reinicia): vuelve bloqueada con lo de la base.
    await pm.reload();
    await montar(pm, "RECEPTION");
    await bloqueo(pm).waitFor({ timeout: 6000 }).catch(() => undefined);
    ok("B6.recarga", await bloqueada(pm), "Al recargar vuelve bloqueada, con la jornada");
  });
  await ctxM.close();
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// C. EL RESPALDO DE `main`: dueños con el PIN viejo de 2, y un mes cargado
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════

async function paseConPinesViejos(): Promise<void> {
  const sobre = armarDiaDeTorneo() as Sobre;
  const ruta = escribirArchivo("breakpoint-jornada-2026-10-18-0040.json", JSON.stringify(sobre));
  const original = sobre.estado;
  const base = nuevaBase();
  const ctx = await compuDelErp(base);
  const p = await abrirClub(ctx, "OWNER", "erp-pin-viejo");
  await tramo("C1", "restaurar el respaldo de main (PIN de 2 de los dueños)", async () => {
    await primeraVezYEntrar(p, PIN_PROVISORIO);
    const { previa, error } = await elegirRespaldo(p, ruta);
    ok("C1.previa", !!previa && !error, `El respaldo del piloto (dueños con PIN de 2) se puede elegir: «${previa.split("\n")[0]}»`);
    await confirmarRestaurar(p, PIN_PROVISORIO);
    ok("C1.bloquea", await bloqueada(p), "Restaurado: Roberto (el del PIN provisorio) no está en ese respaldo → se bloquea");
  });
  await tramo("C2", "el dueño con el PIN viejo elige uno nuevo", async () => {
    await elegirEnElBloqueo(p, /^Dueño Uno/);
    await pinDelBloqueo(p).fill("11");
    await bloqueo(p).getByRole("button", { name: "Desbloquear" }).click();
    await bloqueo(p).getByRole("heading", { name: "Elegí tu PIN nuevo" }).waitFor({ timeout: 3000 });
    const texto = await textoDelBloqueo(p);
    ok("C2.pide", (await bloqueada(p)) && !/\b11\b/.test(texto.replace(/\d{2}:\d{2}/g, "")), "El dueño entra con su PIN viejo de 2 → «Elegí tu PIN nuevo» (sigue bloqueada, sin mostrar el viejo)");
    await foto(p, "erp-pin-viejo-elegi");
    await bloqueo(p).getByLabel("PIN nuevo (4 números)").fill("7604");
    await bloqueo(p).getByLabel("Repetilo").fill("7604");
    await bloqueo(p).getByRole("button", { name: "Guardar y entrar" }).click();
    await bloqueo(p).waitFor({ state: "detached", timeout: 3000 }).catch(() => undefined);
    const e = await estadoErp(p);
    ok("C2.entra", !(await bloqueada(p)) && e.usuarios.find((u) => u.id === "u-duenio-1")?.pin === "7604", "Elige 7604 y entra: el PIN nuevo queda guardado");
    await bloquearAMano(p);
    await desbloquear(p, /^Recepción Tarde/, "33");
    ok("C2.recepcion", !(await bloqueada(p)), "Recepción entra con su PIN de 2 de siempre (33)");
  });
  await tramo("C3", "la plata del sábado del piloto", async () => {
    const e = await estadoErp(p);
    const caja = cajaPorDia(e);
    const r = resumenDelRespaldo(e);
    const conMonedero = r.caja.monedero > 0;
    ok("C3.caja", cajaCuadra(e, original) && Object.keys(caja).length >= 3, `Caja = cobrado al peso (Σ pagos sin monedero = ${M.pesos(total(cobradoPorDia(e)))}) y la caja de cada día igual al respaldo (la seña del jueves, el sábado y lo cobrado después del cierre, en la caja del domingo): ${plata(caja)}`);
    ok("C3.monedero", conMonedero && ingresos(e) === ingresos(original), `El monedero (${M.pesos(r.caja.monedero)}) no entra a la caja: ingresos ${M.pesos(ingresos(e))}, igual que el respaldo`);
    const sinPin = distintas({ ...original, usuarios: [] } as EstadoClub, { ...e, usuarios: [] } as EstadoClub);
    ok("C3.iguales", sinPin.length === 0 && e.usuarios.length === original.usuarios.length, `Mismos clientes, turnos, cuentas y caja (sólo cambió el PIN del dueño que eligió uno nuevo)${sinPin.length ? ` — distinto: ${sinPin.join(", ")}` : ""}`);
    await dejarCorrer(ctx, p, 31_000);
    const f = fotoDeLaBase(base);
    ok("C3.base", !!f && f.estado.usuarios.find((u) => u.id === "u-duenio-1")?.pin === "7604" && f.estado.reservas.length === original.reservas.length, "La base tiene la jornada del piloto con el PIN nuevo del dueño");
  });
  await ctx.close();

  // El mes cargado (lo que pesa un mes de club lleno): también entra y la caja cuadra día por día.
  const mes = armarMesCargado() as Sobre;
  const rutaMes = escribirArchivo("breakpoint-jornada-mes.json", JSON.stringify(mes));
  const baseMes = nuevaBase();
  const ctxMes = await compuDelErp(baseMes);
  const pm = await abrirClub(ctxMes, "OWNER", "erp-mes");
  await tramo("C4", "un mes de club lleno", async () => {
    await primeraVezYEntrar(pm, PIN_PROVISORIO);
    const { previa } = await elegirRespaldo(pm, rutaMes);
    await confirmarRestaurar(pm, PIN_PROVISORIO);
    await desbloquear(pm, /^Dueña Dos/, "22");
    if (await bloqueo(pm).getByRole("heading", { name: "Elegí tu PIN nuevo" }).count()) {
      await bloqueo(pm).getByLabel("PIN nuevo (4 números)").fill("8215");
      await bloqueo(pm).getByLabel("Repetilo").fill("8215");
      await bloqueo(pm).getByRole("button", { name: "Guardar y entrar" }).click();
      await bloqueo(pm).waitFor({ state: "detached", timeout: 3000 }).catch(() => undefined);
    }
    const e = await estadoErp(pm);
    const caja = cajaPorDia(e);
    await dejarCorrer(ctxMes, pm, 31_000);
    const f = fotoDeLaBase(baseMes);
    ok(
      "C4.mes",
      !!previa && !(await bloqueada(pm)) && Object.keys(caja).length >= 28 && cajaCuadra(e, mes.estado) && f?.estado.reservas.length === mes.estado.reservas.length,
      `Un mes lleno (${mes.estado.reservas.length} turnos, ${Math.round(JSON.stringify(mes).length / 1024)} KB): restaura, la caja = cobrado en los ${Object.keys(caja).length} días y queda en la base`,
    );
  });
  await ctxMes.close();
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════

async function principal() {
  let esbuild: typeof import("esbuild");
  let playwright: typeof import("playwright");
  try {
    esbuild = await import("esbuild");
    playwright = await import("playwright");
  } catch {
    console.error("Faltan esbuild o playwright: no se puede correr el ensayo.");
    process.exit(2);
  }
  const chrome = rutaDeChromium(() => playwright.chromium.executablePath());
  if (!chrome) {
    console.error("No hay un Chromium instalado (PLAYWRIGHT_BROWSERS_PATH / /opt/pw-browsers).");
    process.exit(2);
  }
  const r = await esbuild.build({
    stdin: { contents: ENTRADA, loader: "tsx", resolveDir: RAIZ },
    bundle: true,
    write: false,
    format: "iife",
    jsx: "automatic",
    tsconfig: join(RAIZ, "tsconfig.json"),
    define: { "process.env.NODE_ENV": '"production"' },
    logLevel: "silent",
    // Las pieles de cada pantalla (piel/*.css) las sirve Next; acá alcanza con el CSS de la app.
    loader: { ".css": "empty" },
  });
  bundle = r.outputFiles[0].text;
  css = await cssDeLaApp();
  if (!css) console.warn("⚠ No se pudo compilar el CSS de la app: el ensayo corre sin estilos.");
  // El club de hoy, servido por el MISMO manejador del ERP que usa producción (como los e2e del vanilla).
  const srv = createServer(async (req, res) => {
    const segs = new URL(req.url ?? "/", "http://x").pathname.split("/").filter(Boolean);
    const rta = await responderSitioEstatico("breakpoint", segs, async (rel) => new Uint8Array(await readFile(join(RAIZ, rel))));
    res.writeHead(rta.status, Object.fromEntries(rta.headers));
    res.end(Buffer.from(await rta.arrayBuffer()));
  });
  await new Promise<void>((listo) => srv.listen(0, "127.0.0.1", listo));
  const baseSitio = `http://breakpointpadel.test:${(srv.address() as AddressInfo).port}`;
  navegador = await playwright.chromium.launch({
    executablePath: chrome,
    args: [`--host-resolver-rules=MAP breakpointpadel.test 127.0.0.1`, `--unsafely-treat-insecure-origin-as-secure=${baseSitio}`],
  });

  const vanilla = await jornadaDelVanilla(baseSitio);
  if (vanilla) await paseConElRespaldo(vanilla);
  else ok("A.respaldo", false, "Sin el respaldo del club de hoy no se puede ensayar el pase");
  await paseConPinesViejos();

  ok("errores", errores.length === 0, `Cero errores de consola${errores.length ? `: ${errores.slice(0, 3).join(" | ")}` : ""}`);
  writeFileSync(join(OUT, "resultado.json"), JSON.stringify({ fecha: new Date().toISOString(), filas }, null, 2));
  const malas = filas.filter((f) => f.estado !== "OK");
  console.log(`\nRESUMEN ${filas.length - malas.length}/${filas.length} OK · ${malas.length} fallas`);
  await navegador.close();
  srv.close();
  process.exit(malas.length ? 1 : 0);
}

void principal();
