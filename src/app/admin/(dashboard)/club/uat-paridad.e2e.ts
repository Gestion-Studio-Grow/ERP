// ============================================================================
// UAT DE PARIDAD — el sábado de torneo del club vanilla, recorrido clic por clic en el club React del ERP.
// ============================================================================
//
// Mismo guion que el UAT del vanilla (src/tenants/breakpoint/turnero/e2e/uat-torneo.e2e.mjs, «sábado de torneo», y
// uat-b.e2e.mjs), pero sobre /admin/club: ClubDemo REAL (esbuild, con sus piezas globales: el bloqueo y el aviso 🔔),
// el CSS REAL de la app, el almacén real con la jornada real («reloj real», guardado en este equipo) y el Chromium de
// Playwright con el reloj del navegador en la mano (`clock`). Sin Next ni base: como bloqueo-pantalla.test.ts.
//
// Cada check es `ok(id, condición, qué)`, como el vanilla. Lo que React todavía NO puede hacer no se fuerza ni se
// esconde: es una BRECHA (check fallido `brecha.*`, con qué falta y contra qué línea del vanilla), y se sigue con lo
// demás. Al final: RESUMEN N/M, y sale con 1 si algo falló (las brechas cuentan como fallas: es la lista honesta de
// lo que falta para la paridad).
//
// Por qué un e2e y no un `*.test.ts`: `npm test` corre `src/**/*.test.ts` y este UAT, mientras haya brechas, falla
// a propósito; además es un guion largo con estado encadenado (como los UAT del vanilla), no tests independientes.
//
// Uso: npm run test:club-paridad [carpeta de capturas]   (default: dist/uat-paridad)
// Exploración: UAT_HASTA=<n> corta después del bloque n; UAT_DUMP=1 imprime el árbol accesible al cortar.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser, BrowserContext, Locator, Page } from "playwright";
import * as M from "@/lib/club/motor.mjs";
import type { EstadoClub } from "@/lib/club/motor.mjs";
import { claveDeLaJornada } from "./almacen";
import { contactosDe } from "./configuracion-core";
import { responderSitioEstatico } from "@/lib/sitio-estatico";
import { armarMesCargado } from "@/lib/club/fixtures/armar-respaldo";
import { aprobadorExternoDe } from "./aprobador-externo";

const RAIZ = fileURLToPath(new URL("../../../../../", import.meta.url));
const ORIGEN = "http://localhost:3999/admin/club";
const NEGOCIO = "breakpoint";
/** El aprobador del club de hoy (decisión G4: Break Point aprueba ahí durante el trial en el ERP). */
const APROBADOR_VANILLA = aprobadorExternoDe(NEGOCIO) ?? "";
const CLAVE = claveDeLaJornada(NEGOCIO);
const OUT = process.argv[2] ?? join(RAIZ, "dist", "uat-paridad");
const HASTA = Number(process.env.UAT_HASTA ?? 99);
const DUMP = process.env.UAT_DUMP === "1";
mkdirSync(OUT, { recursive: true });

// ───────────── el armado (igual que bloqueo-pantalla.test.ts / solapas-pantalla.test.ts) ─────────────

// La ruta va armada (no literal): limite-del-motor.test.ts busca imports estáticos de ClubDemo fuera de los `*.test.ts`
// para que el motor no viaje en otro chunk; este arnés lo monta a propósito con esbuild y no es parte de ningún chunk.
const CARPETA = "@/app/admin/(dashboard)/club";
const ENTRADA = `
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import ClubDemo from "${CARPETA}/ClubDemo";
import AprobadorDelDuenio from "${CARPETA}/aprobar/AprobadorDelDuenio";
window.__montar = (negocio, usuario, rol, reloj) =>
  createRoot(document.getElementById("root")).render(createElement(ClubDemo, { negocio, usuario, rol, reloj }));
window.__aprobar = (negocio, usuario, modo) =>
  createRoot(document.getElementById("root")).render(createElement(AprobadorDelDuenio, { negocio, usuario, modo }));
`;
type Ventana = { __montar: (negocio: string, usuario: string, rol: string, reloj: string) => void; __aprobar: (negocio: string, usuario: string, modo: string) => void };

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
/** Lo que React todavía no tiene: un check fallido con qué falta y contra qué línea del vanilla (y de React). */
function brecha(id: string, que: string, vanilla: string, react: string): void {
  ok(`brecha.${id}`, false, `BRECHA — ${que} [vanilla ${vanilla} · React ${react}]`);
}
/** Un paso que puede romperse (un botón que no está): se anota como falla y el guion sigue. */
async function paso<T>(id: string, que: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (e) {
    ok(`${id}.paso`, false, `${que}: no se pudo — ${(e as Error).message.split("\n")[0].slice(0, 220)}`);
    if (DUMP && paginaParaVolcar) console.log((e as Error).message.slice(0, 600), "\n", await paginaParaVolcar.locator("main").ariaSnapshot().catch(() => ""));
    return undefined;
  }
}

const pesos = (n: number) => M.pesos(n);
/** La cuenta del turno del motor (o null si no hay). */
const cuentaT = (e: EstadoClub, id: string) => {
  const r = M.cuentaDelTurno(e, id);
  return r.ok ? r : null;
};
/** `EstadoClub.proveedores` es `unknown[]` en los tipos del motor (motor.d.mts:365): acá se lee lo que hace falta. */
const proveedores = (e: EstadoClub) => e.proveedores as { id: string; nombre: string }[];

let navegador: Browser;
let paginaParaVolcar: Page | null = null;
let BASE_SITIO = "";
let css = "";
let bundle = "";
const errores: string[] = [];
let nFoto = 0;

const html = () => `<!doctype html><html lang="es"><head><style>${css}</style></head><body class="bg-surface text-body"><main id="root" class="p-4"></main></body></html>`;

async function foto(p: Page, nombre: string) {
  await p.screenshot({ path: join(OUT, `${String(++nFoto).padStart(2, "0")}-${nombre}.png`), fullPage: true }).catch(() => undefined);
}

function escucharErrores(p: Page, quien: string) {
  p.on("pageerror", (e) => errores.push(`${quien}: ${e.message}`));
  p.on("console", (m) => {
    if (m.type() === "error") errores.push(`${quien}: ${m.text()}`);
  });
}

/** Abre /admin/club (la página del ERP sin Next) y monta ClubDemo en la jornada real, con el rol del puesto. */
async function abrirClub(contexto: BrowserContext, rol: "OWNER" | "RECEPTION", quien = "club"): Promise<Page> {
  const p = await contexto.newPage();
  p.setDefaultTimeout(5000);
  escucharErrores(p, quien);
  // Lo que viaja como texto al navegador (page.evaluate): tsx le agrega `__name(...)` a las funciones internas.
  await p.addInitScript({ content: "window.__name = (f) => f;" });
  await p.goto(ORIGEN);
  await p.addScriptTag({ content: bundle });
  await p.evaluate(([n, r]) => (window as unknown as Ventana).__montar(n, "u_puesto", r, "real"), [NEGOCIO, rol]);
  await p
    .getByRole("heading", { name: "Agenda de canchas" })
    .or(p.getByText(/Entrá con tu PIN para ver y operar el club/))
    .or(p.getByRole("heading", { name: "Primera vez: armá el club" }))
    .or(p.getByText(/ya está abierta en otra pestaña|en otra pestaña/))
    .first()
    .waitFor({ timeout: 10_000 })
    .catch(() => undefined);
  return p;
}

/** El estado guardado de la jornada (lo pendiente se escribe con `pagehide`, como al cerrar la pestaña). */
async function estado(p: Page): Promise<EstadoClub> {
  await p.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  const t = await p.evaluate((k) => localStorage.getItem(k), CLAVE);
  return (JSON.parse(t ?? "{}") as { estado: EstadoClub }).estado;
}
const ingresos = (e: EstadoClub) => e.caja.movimientos.filter((m) => m.tipo === "ingreso").reduce((s, m) => s + m.monto, 0);
const porMedio = (e: EstadoClub, medio: string) => e.caja.movimientos.filter((m) => m.tipo === "ingreso" && m.medio === medio).reduce((s, m) => s + m.monto, 0);

const bloqueo = (p: Page) => p.locator('dialog[data-ui="bloqueo-del-club"]');
const bloqueada = async (p: Page) => (await bloqueo(p).count()) > 0 && (await bloqueo(p).evaluate((d) => (d as HTMLDialogElement).open).catch(() => false));
const pinDelBloqueo = (p: Page) => bloqueo(p).locator('input[type="password"]');
const avisoDelClub = (p: Page, texto: string | RegExp, ms = 3000) =>
  p.getByRole("status").or(p.getByRole("alert")).filter({ hasText: texto }).first().waitFor({ timeout: ms }).then(
    () => true,
    () => false,
  );
async function ultimoAviso(p: Page): Promise<string> {
  const textos = await p.locator('[role="status"], [role="alert"]').allInnerTexts();
  return textos.filter((t) => t.trim()).join(" | ");
}

async function desbloquear(p: Page, quien: RegExp | null, pin: string) {
  if (!(await bloqueada(p))) return;
  const lista = bloqueo(p).getByRole("group", { name: "¿Quién entra?" });
  if (quien) {
    if (!(await lista.count())) await bloqueo(p).getByRole("button", { name: "Entrar con otro usuario" }).click().catch(() => undefined);
    if (await lista.count()) await lista.getByRole("button", { name: quien }).click();
  }
  await pinDelBloqueo(p).fill(pin);
  await bloqueo(p).waitFor({ state: "detached", timeout: 3000 }).catch(() => undefined);
}

async function solapas(p: Page): Promise<string[]> {
  return (await p.getByRole("tab").allInnerTexts()).map((t) => t.trim());
}
async function irA(p: Page, etiqueta: string) {
  await p.getByRole("tab", { name: etiqueta, exact: true }).click();
  await p.waitForTimeout(150);
}
const sinScrollDeCostado = (p: Page) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function volcar(p: Page, donde?: Locator) {
  if (!DUMP) return;
  console.log("──── árbol accesible ────");
  console.log(await (donde ?? p.locator("body")).ariaSnapshot());
}

async function principal() {
  let esbuild: typeof import("esbuild");
  let playwright: typeof import("playwright");
  try {
    esbuild = await import("esbuild");
    playwright = await import("playwright");
  } catch {
    console.error("Faltan esbuild o playwright: no se puede correr el UAT.");
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
  });
  bundle = r.outputFiles[0].text;
  css = await cssDeLaApp();
  if (!css) console.warn("⚠ No se pudo compilar el CSS de la app: el UAT corre sin estilos (los 390 px no valen).");
  navegador = await playwright.chromium.launch({ executablePath: chrome });
  // El sitio público (turnero y tienda), servido por el MISMO manejador del ERP que usa producción (como el vanilla).
  const srv = createServer(async (req, res) => {
    const segs = new URL(req.url ?? "/", "http://x").pathname.split("/").filter(Boolean);
    const rta = await responderSitioEstatico("breakpoint", segs, async (rel) => new Uint8Array(await readFile(join(RAIZ, rel))));
    res.writeHead(rta.status, Object.fromEntries(rta.headers));
    res.end(Buffer.from(await rta.arrayBuffer()));
  });
  await new Promise<void>((listo) => srv.listen(0, "127.0.0.1", listo));
  BASE_SITIO = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;

  // Sábado de torneo, 14:50 (como el vanilla): todo el día es pico (28.000/h → turno de 90′ = 42.000; 10.500 c/u).
  const ctx = await navegador.newContext({ viewport: { width: 1366, height: 900 }, locale: "es-AR", timezoneId: "America/Argentina/Buenos_Aires", acceptDownloads: true });
  await ctx.clock.install({ time: new Date("2026-10-17T14:50:00-03:00") });
  await ctx.route(ORIGEN, (rt) => rt.fulfill({ contentType: "text/html; charset=utf-8", body: html() }));
  await ctx.route(`${ORIGEN}/aprobar`, (rt) => rt.fulfill({ contentType: "text/html; charset=utf-8", body: html() }));

  const g = { ctx, p: await abrirClub(ctx, "OWNER") } as Guion;
  paginaParaVolcar = g.p;
  for (const [n, bloque] of BLOQUES.entries()) {
    if (n > HASTA) break;
    const nombre = NOMBRES_DE_BLOQUE[n] ?? String(n);
    await paso(nombre, `bloque ${nombre}`, () => bloque(g));
  }
  if (HASTA < 99) await volcar(g.p);

  ok("errores", errores.length === 0, `Cero errores de consola${errores.length ? `: ${errores.slice(0, 3).join(" | ")}` : ""}`);
  writeFileSync(join(OUT, "resultado.json"), JSON.stringify({ fecha: new Date().toISOString(), filas }, null, 2));
  const malas = filas.filter((f) => f.estado !== "OK");
  const brechas = malas.filter((f) => f.id.startsWith("brecha."));
  console.log(`\nRESUMEN ${filas.length - malas.length}/${filas.length} OK · ${brechas.length} brechas · ${malas.length - brechas.length} otras fallas`);
  await navegador.close();
  srv.close();
  process.exit(malas.length ? 1 : 0);
}

// ───────────── el guion ─────────────

interface Guion {
  ctx: BrowserContext;
  p: Page;
  pinLu: string;
  pinCaro: string;
  [k: string]: unknown;
}

/** Los bloques del guion, en orden (el 7b es el archivado y el 7c la jornada en blanco, en otra compu). UAT_HASTA corta por posición. */
const NOMBRES_DE_BLOQUE = ["0", "1", "2", "3", "4", "5", "6", "7", "7b", "7c", "8", "9", "10", "11"];
const BLOQUES: ((g: Guion) => Promise<void>)[] = [
  // ═══ 0. Arranque de la jornada real nueva: la consola de primera vez ═══
  async (g) => {
    const p = g.p;
    const consola = p.getByRole("region", { name: "Configuración inicial del club" });
    ok("0.consola", (await consola.count()) === 1 && (await p.getByRole("tablist").count()) === 0, "Arranca en la consola de configuración (sin solapas, sin datos)");
    const e0 = await estado(p).catch(() => null);
    ok("0.blanco", !!e0 && e0.reservas.length + e0.clientes.length + e0.cuentas.length + e0.caja.movimientos.length === 0 && e0.config.modo === "real", "El club está vacío: 0 turnos, 0 clientes, 0 cuentas, caja en cero");
    ok("0.duenios", JSON.stringify(e0?.usuarios.map((u) => u.nombre)) === JSON.stringify(["Roberto Ronco", "Majo Gimenez"]), `Usuarios: ${e0?.usuarios.map((u) => u.nombre).join(" y ")} (dueños, sin recepción todavía)`);
    ok("0.sinpin", (await consola.getByRole("button", { name: "Abrir el club" }).count()) === 0, "Sin un dueño con PIN no se puede abrir el club");
    const rober = consola.getByRole("form", { name: "PIN de Roberto Ronco" });
    await rober.getByLabel("PIN (4 números)").fill("5757");
    await rober.getByLabel("Repetilo").fill("7575");
    await rober.getByRole("button", { name: "Guardar el PIN de Roberto" }).click();
    ok("0.pin-distinto", await avisoDelClub(p, /no coinciden/), "Si los dos PIN no coinciden, avisa y no guarda");
    await rober.getByLabel("PIN (4 números)").fill("5757");
    await rober.getByLabel("Repetilo").fill("5757");
    await rober.getByRole("button", { name: "Guardar el PIN de Roberto" }).click();
    const majo = consola.getByRole("form", { name: "PIN de Majo Gimenez" });
    await majo.getByLabel("PIN (4 números)").fill("5757");
    await majo.getByLabel("Repetilo").fill("5757");
    await majo.getByRole("button", { name: "Guardar el PIN de Majo" }).click();
    ok("0.pin-repetido", await avisoDelClub(p, /otra persona/), "Majo no puede usar el mismo PIN que Roberto");
    await majo.getByLabel("PIN (4 números)").fill("8484");
    await majo.getByLabel("Repetilo").fill("8484");
    await majo.getByRole("button", { name: "Guardar el PIN de Majo" }).click();
    await consola.getByText("✔ Majo Gimenez ya armó su PIN.").waitFor();
    ok("0.sin-pines-a-la-vista", !/\b(5757|8484)\b/.test(await consola.innerText()), "Nunca se ve un PIN en la consola");
    // Entra Roberto con su PIN.
    const entrar = consola.getByRole("form", { name: "Entrar como Roberto" });
    await entrar.getByLabel("PIN de Roberto").fill("5757");
    await entrar.getByRole("button", { name: "Entrar como Roberto" }).click();
    await p.getByRole("tab", { name: "Configuración", selected: true }).waitFor();
    ok("0.entra-rober", await avisoDelClub(p, "Hola, Roberto."), "Roberto entra con su PIN y queda en Configuración");
    // Avisos por WhatsApp: el celular de cada dueño, el del club y el alias.
    const avisos = p.getByRole("form", { name: "Avisos por WhatsApp" });
    await avisos.getByLabel("Celular de Roberto Ronco (le llegan los pedidos de crédito)").fill("5491100000001");
    await avisos.getByLabel("Celular de Majo Gimenez (le llegan los pedidos de crédito)").fill("5491100000002");
    await avisos.getByLabel("WhatsApp del club (recepción)").fill("5491100000009");
    await avisos.getByLabel("Alias para la seña (va en la confirmación del turno)").fill("bp.prueba.uat");
    await avisos.getByRole("button", { name: "Guardar avisos" }).click();
    await p.waitForTimeout(200);
    // Recepción: Lu y Caro; el PIN se ve UNA vez.
    for (const nombre of ["Lu", "Caro"]) {
      const alta = p.getByRole("form", { name: "Dar de alta a alguien" });
      await alta.getByLabel("Nombre").fill(nombre);
      await alta.getByLabel("PIN de Roberto").fill("5757");
      await alta.getByRole("button", { name: "Dar de alta" }).click();
      const grupo = p.getByRole("group", { name: new RegExp(`^✔ ${nombre} · Recepción`) });
      await grupo.waitFor();
      const pin = (await grupo.locator("p.text-4xl").innerText()).trim();
      if (nombre === "Lu") g.pinLu = pin;
      else g.pinCaro = pin;
      await grupo.getByRole("button", { name: "Listo, ya se lo di" }).click();
      await grupo.waitFor({ state: "detached" });
    }
    ok("0.recepcion", /^\d{2}$/.test(g.pinLu ?? "") && /^\d{2}$/.test(g.pinCaro ?? "") && !(await p.locator("body").innerText()).includes(`PIN ${g.pinLu}`), "Alta de Lu y Caro en recepción: el PIN se ve una vez y después ya no");
    // Precios valle/pico y el fondo de caja.
    const reglas = p.getByRole("form", { name: "Reglas y precios" });
    await reglas.getByLabel(/^Precio por hora valle/).fill("21000");
    await reglas.getByLabel(/^Precio por hora pico/).fill("28000");
    await reglas.getByLabel("Fondo de caja (el cambio que queda en el cajón)").fill("20000");
    await reglas.getByRole("button", { name: "Guardar reglas y precios" }).click();
    await avisoDelClub(p, /^Reglas y precios guardados/);
    const e0b = await estado(p);
    const contactos = contactosDe(e0b);
    ok("0.avisos", contactos["u-rober"] === "5491100000001" && contactos["u-majo"] === "5491100000002" && contactos.club === "5491100000009" && e0b.config.cobro?.alias === "bp.prueba.uat", "Avisos: celulares de los dueños, WhatsApp del club y alias guardados (dentro de la jornada)");
    ok("0.precios", e0b.config.tarifas.map((t) => t.precioHora).join() === "21000,28000", "Precio por hora: valle $ 21.000 y pico $ 28.000");
    ok("0.fondo", e0b.caja.fondo === 20000, "Fondo de caja $ 20.000 cargado en la consola");
    ok("0.stock-sin-ejemplo", e0b.productos.filter((x) => !x.plato && !x.alquiler).every((x) => x.stock === null && !x.codigoExterno), "Productos sin stock ni códigos de ejemplo (el stock se controla desde el primer conteo)");
    await foto(p, "consola-cargada");
    // «Abrir el club»: queda bloqueado.
    await p.getByRole("region", { name: "Primera vez: armá el club" }).getByRole("button", { name: "Abrir el club" }).click();
    await bloqueo(p).getByRole("heading", { name: "Pantalla bloqueada" }).waitFor();
    ok("0.abre", (await bloqueada(p)) && (await p.getByRole("tablist").count()) === 0, "«Abrir el club» → pantalla bloqueada, sin nada del club a la vista");
    await foto(p, "abierto-bloqueado");
    await desbloquear(p, /^Roberto/, "5757");
    const dueno = await solapas(p);
    ok("0.dueno", !(await bloqueada(p)) && dueno.includes("Configuración") && dueno.includes("Novedades y redes") && dueno.includes("Tablero"), `Roberto entra con su PIN y ve todo: ${dueno.join(", ")}`);
    const cinta = await p.locator("main").innerText();
    ok("0.reloj", /Hora: 14:50/.test(cinta) && (await p.getByRole("button", { name: /30′|\+30|−30/ }).count()) === 0, "Reloj real (14:50) y sin los botones ±30′ de la demo");
    // Roberto cuenta el stock antes de abrir: agua 42, cerveza 48, tubos 18, overgrips 30.
    await irA(p, "Stock");
    for (const [nombre, n] of [["Agua 500 ml", 42], ["Cerveza lata 473 ml", 48], ["Tubo de pelotas (3)", 18], ["Overgrip", 30]] as const) {
      await p.getByRole("list", { name: "Productos del club" }).getByRole("button", { name: new RegExp(`^${nombre.replace(/[()]/g, "\\$&")}`) }).first().click();
      await p.getByLabel("Stock actual (conteo)").fill(String(n));
      await p.getByRole("button", { name: "Guardar", exact: true }).click();
      await p.waitForTimeout(150);
    }
    const eStock = await estado(p);
    ok("0.conteo", [["p2", 42], ["p9", 48], ["p1", 18], ["p4", 30]].every(([pid, n]) => eStock.productos.find((x) => x.id === pid)?.stock === n), "Conteo de stock cargado desde Stock → la ficha del producto → «Stock actual»");
    await irA(p, "Configuración");
    const link = await p.getByLabel("Link del turnero para mandar a los clientes").inputValue();
    g.linkClientes = link;
    ok("0.link", /modo=pedido/.test(link) && /wa=5491100000009/.test(link) && /tar=/.test(link) && /cat=[^&]*p1%3A12000/.test(link), `El link para clientes lleva el WhatsApp del club, sus tarifas y su tienda (${link.slice(0, 80)}…)`);
    // Entra Lu (recepción) con su PIN: «Bloquear» y «Entrar con otro usuario».
    await p.getByRole("button", { name: /^Bloquear/ }).click();
    await desbloquear(p, /^Lu/, g.pinLu);
    const rec = await solapas(p);
    g.solapasLu = rec;
    ok("0.lu", !(await bloqueada(p)) && /Opera: Lu/.test(await p.locator("main").innerText()), "Entra Lu con su PIN");
  },

  // ═══ 1. Recepción: sábado de torneo, 4 canchas completas, mucho buffet, «a cargo de» y cobros ═══
  async (g) => {
    const p = g.p;
    const rec = g.solapasLu as string[];
    const RECEPCION = ["Agenda", "Fijos y espera", "Mantenimiento y lluvia", "Buffet", "Tienda", "Caja", "Clientes"];
    if (JSON.stringify(rec) === JSON.stringify(RECEPCION)) ok("1.recepcion", true, `Lu (recepción) ve sólo lo de recepción: ${rec.join(", ")}`);
    else
      brecha(
        "permisos-por-persona",
        `Las solapas las decide el rol del LOGIN del ERP (el puesto), no la persona que entró con su PIN: con el puesto del dueño, Lu (recepción) ve ${rec.filter((x) => !RECEPCION.includes(x)).join(", ")} (el motor igual frena lo sensible por PIN/permiso)`,
        "app.mjs `pestanas` por permiso del usuario (uat-torneo.e2e.mjs:138: Lu ve agenda, buffet, caja, clientes)",
        "ClubDemo.tsx:184 (`SOLAPAS` según el `rol` del panel) · solapas-club.ts:41-52 (`soloDuenos`)",
      );
    // Lo sensible lo frena el motor aunque la solapa se vea: Lu no puede dar de alta a nadie. Con las solapas por el
    // operador del PIN (terminales), Lu ya no ve Configuración; esconderla no es seguridad, así que igual se prueba el
    // motor: con el estado real y el PIN real de Lu, `altaUsuario` dice que no (sobre una copia: no toca la jornada).
    const verConfiguracion = (await p.getByRole("tab", { name: "Configuración" }).count()) > 0;
    if (!verConfiguracion) {
      const e = await estado(p);
      const lu = e.usuarios.find((u) => u.nombre === "Lu");
      const intento = M.altaUsuario(structuredClone(e), { nombre: "Intruso", rol: "recepcion" }, { usuarioId: lu?.id ?? "", pin: g.pinLu });
      ok("1.motor-frena", !!lu && !intento.ok, `Lu (recepción) ni ve Configuración, y si llegara, el motor no la deja dar de alta a nadie («${intento.ok ? "¡la dejó!" : intento.motivo}»)`);
    } else {
      await irA(p, "Configuración");
      const alta = p.getByRole("form", { name: "Dar de alta a alguien" });
      if (await alta.count()) {
        await alta.getByLabel("Nombre").fill("Intruso");
        await alta.getByLabel(/^PIN de/).fill(g.pinLu);
        await alta.getByRole("button", { name: "Dar de alta" }).click();
        await p.waitForTimeout(200);
        ok("1.motor-frena", !(await estado(p)).usuarios.some((u) => u.nombre === "Intruso"), `Aunque vea Configuración, el motor no deja a Lu dar de alta a nadie («${(await ultimoAviso(p)).slice(0, 80)}»)`);
      } else ok("1.motor-frena", true, "Lu ve Configuración pero sin el alta de usuarios");
    }

    // Pablo (el del turno de las 16:30) ya es cliente: su ficha sale de Clientes → «+ Alta de cliente».
    const [pablo, telPablo] = TITULARES[4];
    await altaCliente(p, pablo, telPablo);

    // 4 canchas a las 15:00, 4 jugadores cada una, y se abren. Los 4 titulares son nuevos: como en el vanilla
    // (app.mjs:1662 `#f-tel` y :1680-1681), el teléfono en «Dar un turno» los da de alta y ata la ficha al turno.
    const R: Record<string, string> = {};
    for (const gr of GRUPOS) R[gr.cancha] = (await darTurno(p, { cancha: gr.cancha, hora: 900, titular: gr.titular, otros: gr.jug, ficha: false, tel: telDe(gr.titular) })) ?? "";
    g.R = R;
    const eCli = await estado(p);
    const fichaDelTurno = (id: string) => eCli.clientes.find((c) => c.id === M.reserva(eCli, id)?.clienteId);
    ok(
      "1.alta-con-telefono",
      GRUPOS.every((gr) => {
        const f = fichaDelTurno(R[gr.cancha]);
        return !!f && f.nombre === gr.titular && digitos(f.tel) === telDe(gr.titular) && eCli.clientes.filter((c) => c.nombre === gr.titular).length === 1;
      }),
      `«Dar un turno» con el teléfono de un titular nuevo: queda su ficha con ese celular, atada al turno (${GRUPOS.map((gr) => `${gr.titular}: ${fichaDelTurno(R[gr.cancha])?.tel ?? "sin ficha"}`).join(", ")})`,
    );
    ok("1.fichas", TITULARES.every(([n, tel]) => eCli.clientes.filter((c) => c.nombre === n && digitos(c.tel) === tel).length === 1), "Las fichas de los 5 titulares, una sola cada uno, con su celular (4 del alta del turno y Pablo desde Clientes)");
    // Y se ven en Clientes, con su teléfono, sin pasar antes por «+ Alta de cliente».
    await irA(p, "Clientes");
    const lista = p.getByRole("list", { name: "Clientes del club" });
    const enClientes = await Promise.all(GRUPOS.map(async (gr) => (await lista.getByRole("listitem").filter({ hasText: gr.titular }).count()) === 1));
    await p.getByLabel("Buscar por nombre o teléfono").fill(telDe(GRUPOS[2].titular).slice(-4));
    const porTel = (await lista.getByRole("listitem").allInnerTexts()).map((t) => t.replace(/\s+/g, " "));
    await p.getByLabel("Buscar por nombre o teléfono").fill("");
    ok("1.en-clientes", enClientes.every(Boolean) && porTel.length === 1 && porTel[0].includes(GRUPOS[2].titular), `Clientes muestra las 4 fichas nuevas; buscando por el teléfono aparece ${GRUPOS[2].titular} («${porTel.join(" | ").slice(0, 80)}»)`);
    for (const gr of GRUPOS) {
      const c = await abrirCuenta(p, R[gr.cancha]);
      await c.getByRole("button", { name: "Abrir la cancha" }).click();
      await p.waitForTimeout(150);
    }
    let e1 = await estado(p);
    const de15 = e1.reservas.filter((r) => r.inicio === 900 && r.fecha === "2026-10-17");
    ok("1.canchas", de15.length === 4 && de15.every((r) => r.estado === "en_cancha" && r.jugadores.length === 4 && r.precio === 42000), `4 canchas a las 15:00, 4 jugadores cada una, $ 42.000 el turno, todas en juego (${de15.map((r) => `${r.canchaId}:${r.estado}:${r.jugadores.length}:${r.precio}`).join(" ")})`);
    // Mucho buffet: por cancha 2 aguas, 2 cervezas, una picada y una milanesa ($ 47.100), cada cosa a un jugador.
    for (const gr of GRUPOS) {
      const c = await abrirCuenta(p, R[gr.cancha]);
      await cargar(c, 0, "agua", "Agua 500 ml", 2);
      await cargar(c, 1, "cerveza", "Cerveza lata 473 ml", 2);
      await cargar(c, 2, "picada", "Picada para 4", 1);
      await cargar(c, 3, "milanesa", "Milanesa napolitana con papas", 1);
    }
    e1 = await estado(p);
    const tot = (id: string, e = e1) => cuentaT(e, id)?.totales;
    ok("1.cargos", GRUPOS.every((gr) => tot(R[gr.cancha])?.pendiente === 89100 && tot(R[gr.cancha])?.cargos === 47100), `Cada turno: cancha $ 42.000 + cargos $ 47.100 = $ 89.100 en un solo lugar (${GRUPOS.map((gr) => tot(R[gr.cancha])?.pendiente).join(", ")})`);
    ok("1.stock", e1.productos.find((x) => x.id === "p2")?.stock === 42 - 8 && e1.productos.find((x) => x.id === "p9")?.stock === 48 - 8, "Stock: agua 42 → 34, cerveza 48 → 40");
    // «A cargo de» en la cancha 1: Tomás paga la cancha y los cargos de Sofía.
    const c1 = await abrirCuenta(p, R.c1);
    await c1.getByRole("combobox", { name: "Parte de la cancha de Sofía Gómez" }).selectOption({ label: "A cargo de Tomás Medina" });
    await p.waitForTimeout(150);
    await c1.getByRole("combobox", { name: "Cargos de Sofía Gómez", exact: true }).selectOption({ label: "Sus cargos los paga Tomás Medina" });
    await p.waitForTimeout(150);
    e1 = await estado(p);
    const fila0 = cuentaT(e1, R.c1)?.jugadores[0];
    const botonTomas = await c1.getByRole("button", { name: /^Cobrar \$\s?32\.600 a Tomás Medina/ }).count();
    ok("1.acargo", fila0?.aPagar === 10500 * 2 + 4000 + 7600 && botonTomas === 1, `A cargo de: Tomás paga su cancha + la de Sofía + sus cargos + los de Sofía = $ 32.600, visible en su fila (${fila0?.aPagar})`);
    await foto(p, "cuenta-del-turno");
    // Cobro por jugador: Lucas paga lo suyo (su parte de la cancha + la picada) con Mercado Pago.
    let antes = ingresos(e1);
    await medio(c1, "Mercado Pago (QR)");
    await c1.getByRole("button", { name: /^Cobrar \$\s?31\.500 a Lucas Ríos/ }).click();
    await p.waitForTimeout(150);
    e1 = await estado(p);
    ok("1.porjugador", ingresos(e1) - antes === 10500 + 21000 && porMedio(e1, "mercadopago") === 31500, "Cobro por jugador: Lucas paga su parte de la cancha + sus cargos ($ 31.500) por Mercado Pago");
    // «Sólo la cancha»: Martín paga sólo su parte de la cancha; sus cargos (la milanesa) siguen abiertos.
    antes = ingresos(e1);
    await medio(c1, "Efectivo");
    const solo = c1.getByRole("button", { name: /^Sólo la cancha \$\s?10\.500 de Martín Paz/ });
    if (await solo.count()) {
      await solo.click();
      await p.waitForTimeout(150);
      e1 = await estado(p);
      const martin = cuentaT(e1, R.c1)?.jugadores[3];
      ok("1.solo-cancha", ingresos(e1) - antes === 10500 && martin?.aPagar === 14500, `«Sólo la cancha»: Martín paga $ 10.500 y le queda la milanesa ($ ${martin?.aPagar})`);
    } else ok("1.solo-cancha", false, "«Sólo la cancha $ 10.500» de Martín no aparece");
    // Cobro parcial de la cancha (cuenta de la cancha): en la cancha 2, $ 20.000 a cuenta con débito.
    const c2 = await abrirCuenta(p, R.c2);
    antes = ingresos(e1);
    await medio(c2, "Débito / crédito");
    await c2.getByLabel("Cobrar una parte (monto)").fill("20000");
    await c2.getByRole("button", { name: /^Cobrar \$\s?20\.000 de la cancha/ }).click();
    await p.waitForTimeout(150);
    e1 = await estado(p);
    ok("1.parcial", ingresos(e1) - antes === 20000 && tot(R.c2)?.pendiente === 69100, `Cobro parcial de la cancha 2: $ 20.000 con débito, quedan $ 69.100 (${tot(R.c2)?.pendiente})`);
    g.cajaTrasCobros = ingresos(e1);
  },

  // ═══ 2. Termina el turno y se quedan a comer: la cancha se cobra y se cierra, la mesa sigue ═══
  async (g) => {
    const p = g.p;
    const R = g.R as Record<string, string>;
    await volverALaAgenda(p);
    await g.ctx.clock.runFor(101 * 60 * 1000);
    await p.waitForTimeout(400);
    ok("2.hora", /Hora: 16:31/.test(await p.locator("main").innerText()), "El reloj real avanzó a las 16:31");
    ok("2.inactividad", await bloqueada(p), "Después de 5 minutos sin uso la pantalla se bloqueó sola");
    await desbloquear(p, null, g.pinLu);
    ok("2.sigue-lu", !(await bloqueada(p)) && /Opera: Lu/.test(await p.locator("main").innerText()), "Lu pone su PIN y sigue ella");
    let e2 = await estado(p);
    const cobradoAntes = M.cobrado(M.reserva(e2, R.c1)!);
    let c1 = await abrirCuenta(p, R.c1);
    await medio(c1, "Efectivo");
    await c1.getByRole("button", { name: /^Cobrar la cancha \$\s?21\.000 y cerrarla · la mesa sigue/ }).click();
    await p.waitForTimeout(250);
    e2 = await estado(p);
    const r1 = M.reserva(e2, R.c1)!;
    ok("2.cerrada", r1.estado === "finalizada" && e2.luces.c1 === false && M.cobrado(r1) === 42000 && cobradoAntes === 21000, `«Cobrar la cancha y cerrarla · la mesa sigue»: cobró lo que faltaba de la cancha ($ 21.000, total $ ${M.cobrado(r1)}), luz apagada, cancha libre`);
    ok("2.mesa", M.mesasAbiertas(e2).length === 1 && cuentaT(e2, R.c1)?.totales.cargos === 47100 - 21000, `La mesa de la cancha 1 sigue abierta con sus cargos (${cuentaT(e2, R.c1)?.totales.cargos})`);
    // Se abre el turno siguiente en esa cancha (16:30, Pablo Suárez) aunque la mesa siga comiendo. Lu pone su nombre y
    // su teléfono sin tocar la ficha: como ya hay una con ese número, el turno queda atado a ella (no se duplica).
    const clientesAntes = e2.clientes.length;
    const sig = await darTurno(p, { cancha: "c1", hora: 990, titular: "Pablo Suárez", otros: ["Lucía Torres", "Ezequiel Rojas", "Dani Navarro"], ficha: false, tel: telDe("Pablo Suárez") });
    g.sig = sig;
    e2 = await estado(p);
    const fichaPablo = e2.clientes.find((c) => c.nombre === "Pablo Suárez");
    ok("2.ficha-por-telefono", !!fichaPablo && M.reserva(e2, sig ?? "")?.clienteId === fichaPablo.id && e2.clientes.length === clientesAntes, `Con el teléfono de alguien que ya tiene ficha, el turno se ata a esa ficha y no se da otra de alta (${e2.clientes.length} clientes)`);
    const cs = await abrirCuenta(p, sig ?? "");
    await cs.getByRole("button", { name: "Abrir la cancha" }).click();
    await p.waitForTimeout(150);
    e2 = await estado(p);
    ok("2.siguiente", M.reserva(e2, sig ?? "")?.estado === "en_cancha", "El turno de las 16:30 abre la cancha 1 aunque la mesa anterior siga comiendo");
    // Buffet → «Mesas que siguen cargando» → la cuenta de esa mesa; se siguen sumando cargos.
    await volverALaAgenda(p);
    await irA(p, "Buffet");
    const mesas = p.getByRole("region", { name: "Mesas que siguen cargando" });
    ok("2.buffet", (await mesas.getByText(/Tomás Medina/).count()) > 0, `Buffet → «Mesas que siguen cargando» muestra la mesa de Tomás (${(await mesas.innerText()).replace(/\s+/g, " ").slice(0, 120)})`);
    await mesas.getByRole("button", { name: /^Ver la cuenta/ }).first().click();
    c1 = p.locator("section").filter({ has: p.getByText("Cuenta del turno", { exact: true }) }).first();
    await c1.waitFor();
    ok("2.marca", (await c1.getByText("Cancha cerrada · la mesa sigue").count()) === 1, "La cuenta dice «Cancha cerrada · la mesa sigue»");
    if ((await c1.getByRole("region", { name: "Sumar un cargo del buffet" }).count()) === 0) {
      brecha(
        "cargar-en-mesa-que-sigue",
        "Con la cancha cerrada y la mesa siguiendo, la cuenta del turno ya no deja «Sumar un cargo del buffet»: hay que ir a Buffet → «Cargar productos» y elegir la cuenta del jugador",
        "app.mjs:1426-1429 (cargar en el turno salvo cancelado/suspendido/falta)",
        "CuentaDelTurno.tsx:492 (`vista.abierto`) · cuenta-core.ts:162 (`ABIERTO` = reservada/en_cancha)",
      );
      await volverALaAgenda(p);
      await irA(p, "Buffet");
      const carga = p.getByRole("region", { name: "Cargar productos" });
      const opcion = await carga.getByLabel("A la cuenta de").locator("option", { hasText: /^Martín Paz/ }).first().getAttribute("value");
      await carga.getByLabel("A la cuenta de").selectOption(opcion ?? "");
      await carga.getByLabel("Cantidad").fill("4");
      await carga.getByLabel("Código o producto (pasá el lector o escribí)").fill("cerveza");
      await carga.getByRole("list", { name: "Productos para cargar" }).getByRole("button", { name: /^4 × Cerveza lata 473 ml/ }).click();
      await p.waitForTimeout(150);
      await p.getByRole("region", { name: "Mesas que siguen cargando" }).getByRole("button", { name: /^Ver la cuenta/ }).first().click();
      c1 = p.locator("section").filter({ has: p.getByText("Cuenta del turno", { exact: true }) }).first();
      await c1.waitFor();
    } else await cargar(c1, 3, "cerveza", "Cerveza lata 473 ml", 4);
    e2 = await estado(p);
    ok("2.sigue", cuentaT(e2, R.c1)?.totales.cargos === 26100 + 15200, `Con la cancha cerrada se siguen sumando cargos: 4 cervezas más a Martín → $ ${cuentaT(e2, R.c1)?.totales.cargos}`);
    await foto(p, "mesa-sigue");
    const cajaAntesMesa = ingresos(e2);
    const mpAntes = porMedio(e2, "mercadopago");
    await medio(c1, "Mercado Pago (QR)");
    await c1.getByRole("button", { name: /^Cobrar \$\s?11\.600 a Tomás Medina/ }).click();
    await p.waitForTimeout(200);
    e2 = await estado(p);
    ok("2.tomas", ingresos(e2) - cajaAntesMesa === 4000 + 7600 && porMedio(e2, "mercadopago") - mpAntes === 11600, "Tomás paga sus cargos y los de Sofía por Mercado Pago: $ 11.600");
    await medio(c1, "Efectivo");
    await c1.getByRole("button", { name: /^Cobrar y cerrar los cargos \$\s?29\.700/ }).click();
    await p.waitForTimeout(200);
    e2 = await estado(p);
    ok("2.cierre-mesa", ingresos(e2) - cajaAntesMesa === 11600 + 29700 && M.mesasAbiertas(e2).length === 0 && cuentaT(e2, R.c1)?.totales.pendiente === 0, "«Cobrar y cerrar los cargos» cobra el resto ($ 29.700) y la mesa queda cerrada: nada pendiente");
  },

  // ═══ 3. Las otras canchas: cobrar todo, por jugador y un fiado aprobado por el dueño desde su celular ═══
  async (g) => {
    const p = g.p;
    const R = g.R as Record<string, string>;
    await volverALaAgenda(p);
    // Cancha 2: «Cobrar todo» (lo que falta después de la parte de $ 20.000) con débito, y se cierra.
    let e3 = await estado(p);
    let antes = ingresos(e3);
    const c2 = await abrirCuenta(p, R.c2);
    await medio(c2, "Débito / crédito");
    await c2.getByRole("button", { name: /^Cobrar todo \$\s?69\.100/ }).click();
    await p.waitForTimeout(200);
    await cerrarLaCancha(c2);
    e3 = await estado(p);
    ok("3.todo", ingresos(e3) - antes === 69100 && M.reserva(e3, R.c2)?.estado === "finalizada" && cuentaT(e3, R.c2)?.totales.pendiente === 0, `Cancha 2: «Cobrar todo» $ 69.100 con débito y se cierra (${M.reserva(e3, R.c2)?.estado})`);
    // Cancha 3: cada jugador paga lo suyo (cancha + cargos) con su medio.
    await volverALaAgenda(p);
    const c3 = await abrirCuenta(p, R.c3);
    antes = ingresos(e3);
    const jug3 = ["Nico Herrera", "Agus Romero", "Mati Benítez", "Flor Díaz"];
    for (const [j, m] of [[0, "Efectivo"], [1, "Mercado Pago (QR)"], [2, "Transferencia"], [3, "Débito / crédito"]] as const) {
      await medio(c3, m);
      await c3.getByRole("button", { name: new RegExp(`^Cobrar \\$\\s?[\\d.]+ a ${jug3[j]}`) }).click();
      await p.waitForTimeout(150);
    }
    e3 = await estado(p);
    ok("3.porjugador", ingresos(e3) - antes === 89100 && cuentaT(e3, R.c3)?.totales.pendiente === 0, `Cancha 3: cada jugador paga lo suyo (cancha + cargos) con su medio: suma $ ${ingresos(e3) - antes}`);
    await cerrarLaCancha(c3);
    // Cancha 4: se cobra la cancha y los cargos de los invitados; Juan quiere que le fíen lo suyo (2 aguas).
    await volverALaAgenda(p);
    const c4 = await abrirCuenta(p, R.c4);
    await medio(c4, "Efectivo");
    await c4.getByRole("button", { name: /^Cobrar la cancha \$\s?42\.000 y cerrarla · la mesa sigue/ }).click();
    await p.waitForTimeout(200);
    for (const nombre of ["Gonza Ortiz", "Mica Castro", "Diego Molina"]) {
      await medio(c4, "Efectivo");
      await c4.getByRole("button", { name: new RegExp(`^Cobrar \\$\\s?[\\d.]+ a ${nombre}`) }).click();
      await p.waitForTimeout(150);
    }
    e3 = await estado(p);
    const ctaJuan = M.cuentaDeJugador(e3, M.reserva(e3, R.c4)!, 0);
    ok("3.juan", !!ctaJuan && M.saldoCuenta(ctaJuan) === 4000, "Juan (sin cuenta corriente) quedó debiendo sus 2 aguas: $ 4.000");
    // En la cuenta del turno, «Cargos a cuenta corriente» no puede: Juan no tiene cuenta corriente.
    const aCC = c4.getByRole("button", { name: "Cargos a cuenta corriente" });
    if (await aCC.count()) {
      await aCC.click();
      await p.waitForTimeout(150);
      const aviso = await ultimoAviso(p);
      ok("3.sincc", M.saldoCuenta(M.cuentaDeJugador(await estado(p), M.reserva(e3, R.c4)!, 0)!) === 4000 && /cuenta corriente/.test(aviso), `Sin cuenta corriente ni fiado, no pasa a la cuenta corriente («${aviso.slice(0, 110)}»)`);
    } else ok("3.sincc", true, "Sin cuenta corriente, la cuenta del turno no ofrece pasar a la cuenta corriente");
    if ((await c4.getByRole("button", { name: /Pedir OK para fiar/ }).count()) === 0)
      brecha(
        "fiado-desde-la-cuenta-del-turno",
        "El «Pedir OK para fiar» no está en la cuenta del turno (ni en la del jugador): está sólo en Buffet → la tarjeta de su cuenta",
        "app.mjs `verCuenta` → `pedirFiado` desde el turno (uat-torneo.e2e.mjs:230-232)",
        "CuentaDelTurno.tsx (sin pedirFiado) · BuffetDelClub.tsx:206-210",
      );
    else ok("3.fiar-en-la-cuenta", true, "La cuenta del turno ofrece «Pedir OK para fiar» (el pedido de este guion sale desde Buffet, que es la misma pieza)");
    // El pedido, desde Buffet: «Pedir OK para fiar $ 4.000» → «Avisar a Majo Gimenez» por WhatsApp con el link.
    await volverALaAgenda(p);
    await irA(p, "Buffet");
    const tarjeta = tarjetaDeCuenta(p, "Juan Pérez");
    await tarjeta.getByRole("button", { name: /^Pedir OK para fiar \$\s?4\.000/ }).click();
    await p.waitForTimeout(200);
    const hrefMajo = (await tarjeta.getByRole("link", { name: /Avisar a Majo Gimenez/ }).getAttribute("href")) ?? "";
    const textoWa = decodeURIComponent(hrefMajo.split("?text=")[1] ?? "");
    const linkAprob = textoWa.match(/https?:\/\/\S+#aprobar&\S+/)?.[0] ?? "";
    // Break Point en el trial (G4): el link es el del aprobador del club de hoy (aprobador-externo.ts), sin login.
    ok("3.whatsapp", hrefMajo.startsWith("https://wa.me/5491100000002?text=") && /Juan Pérez/.test(textoWa) && /4\.000/.test(textoWa) && linkAprob.startsWith(`${APROBADOR_VANILLA}#aprobar&`), `El pedido sale por WhatsApp al celular de Majo con el link al aprobador del club de hoy («${textoWa.slice(0, 90)}…»)`);
    await foto(p, "fiado-pedido");
    // El aviso 🔔: a Lu (recepción) no le llega; a un dueño sí, y lleva al Tablero.
    ok("3.campana-lu", (await p.locator('[data-ui="aviso-del-duenio"]').innerText()).trim() === "", "A recepción no le aparece el aviso 🔔 del dueño");
    await cambiarDeUsuario(p, /^Majo/, "8484");
    const campana = p.locator('[data-ui="aviso-del-duenio"]');
    ok("3.campana", /Un pedido de crédito espera tu OK/.test(await campana.innerText()), `Majo entra y ve el aviso 🔔 «${(await campana.locator("p").first().innerText()).trim()}»`);
    await campana.getByRole("button", { name: "Ver y resolver en el Tablero" }).click();
    ok("3.campana-tablero", (await p.getByRole("tab", { name: "Tablero", selected: true }).count()) === 1 && /Juan Pérez/.test(await p.getByRole("tabpanel").innerText()), "El 🔔 lleva al Tablero, con el pedido de Juan para autorizar");
    await foto(p, "campana-tablero");
    await cambiarDeUsuario(p, /^Lu/, g.pinLu);

    // El celular de Majo (otro dispositivo, sin la jornada) abre el link: el club de hoy, servido por el MISMO manejador
    // del ERP que usa producción (el /club empaquetado del sitio), como en uat-torneo.e2e.mjs:240-251.
    const cel = await navegador.newContext({ viewport: { width: 390, height: 844 }, locale: "es-AR", timezoneId: "America/Argentina/Buenos_Aires" });
    // Sin red: las fuentes de Google vuelven vacías (no se cortan: un corte deja un error de consola que no es del club).
    await cel.route(/fonts\.(googleapis|gstatic)\.com/, (rt) => rt.fulfill({ status: 200, contentType: "text/css", body: "" }));
    await cel.route(`${APROBADOR_VANILLA}*`, async (rt) => {
      const r = await fetch(`${BASE_SITIO}${new URL(rt.request().url()).pathname}`);
      await rt.fulfill({ status: r.status, contentType: r.headers.get("content-type") ?? "text/html; charset=utf-8", body: Buffer.from(await r.arrayBuffer()) });
    });
    await cel.route(/\/admin\/club\/aprobar/, (rt) => rt.fulfill({ contentType: "text/html; charset=utf-8", body: html() }));
    const pv = await cel.newPage();
    pv.setDefaultTimeout(5000);
    escucharErrores(pv, "aprobador-vanilla");
    await pv.goto(linkAprob);
    await pv.locator("#dlg").waitFor();
    const dlg = (await pv.locator("#dlg").innerText()).replace(/\s+/g, " ");
    ok("3.celular", /Pedido de crédito/i.test(dlg) && /fiarle \$\s?4\.000 a Juan Pérez/.test(dlg), `En el celular de Majo se abre el aprobador del club de hoy: «${dlg.slice(0, 80)}»`);
    await pv.fill("#ap-pin", "8484");
    await pv.click('#dlg [data-a="aprobarLink"]');
    const codigo = ((await pv.locator(".codigo-aprob").textContent()) ?? "").trim();
    const d = Object.fromEntries(new URLSearchParams(linkAprob.split("#aprobar&")[1]));
    ok("3.codigo", codigo === M.codigoAprobacion({ pin: "8484", novedadId: d.id, clienteId: d.c, monto: 4000, fecha: d.f }), `Con el PIN de Majo, el club de hoy da el código ${codigo} (el mismo del motor)`);
    await foto(pv, "celular-codigo");
    const scrollCel = await pv.evaluate(() => document.documentElement.scrollWidth);
    ok("3.celular-390", scrollCel <= 390, `Celular 390 px sin scroll horizontal (${scrollCel})`);
    await pv.close();
    // El aprobador del ERP (para cuando Break Point deje el club de hoy): el mismo pedido por /admin/club/aprobar.
    const linkErp = `${ORIGEN}/aprobar#aprobar&${linkAprob.split("#aprobar&")[1]}`;
    const abrirAprobador = async (modo: "demo" | "real") => {
      const pc = await cel.newPage();
      pc.setDefaultTimeout(5000);
      escucharErrores(pc, `aprobador-${modo}`);
      await pc.goto(linkErp);
      await pc.addScriptTag({ content: bundle });
      await pc.evaluate(([n, m]) => (window as unknown as Ventana).__aprobar(n, "u_majo", m), [NEGOCIO, modo]);
      await pc.getByRole("region", { name: "El pedido" }).waitFor();
      return pc;
    };
    // Como está publicado hoy (aprobar/page.tsx: NEGOCIOS_CON_APROBADOR_REAL vacío → modo demo), con el PIN real de Majo.
    const pd = await abrirAprobador("demo");
    const pedidoTxt = (await pd.getByRole("region", { name: "El pedido" }).innerText()).replace(/\s+/g, " ");
    ok("3.celular-erp", /Juan Pérez/.test(pedidoTxt) && /4\.000/.test(pedidoTxt), `El aprobador del ERP abre el mismo pedido: «${pedidoTxt.slice(0, 80)}»`);
    const majoDemo = pd.getByRole("radio", { name: /Majo/ });
    if (await majoDemo.count()) await majoDemo.first().check().catch(() => undefined);
    await pd.getByLabel("Tu PIN").fill("8484");
    await pd.getByRole("button", { name: "Aprobar y ver el código" }).click();
    await pd.waitForTimeout(200);
    const codigoDemo = (await pd.locator("p.text-4xl").count()) ? (await pd.locator("p.text-4xl").innerText()).trim() : "";
    const avisoDemo = (await pd.getByRole("alert").allInnerTexts()).join(" ");
    if (codigoDemo) ok("3.aprobador-publicado", true, `El aprobador como está publicado da el código con el PIN real (${codigoDemo})`);
    else
      brecha(
        "aprobador-real",
        `El aprobador del ERP está publicado sólo en DEMO (dueños y PIN de ejemplo): con el PIN real de Majo no da el código («${avisoDemo.slice(0, 60)}»). No bloquea el trial (G4: el link va al club de hoy, 3.codigo); para dejar el club de hoy hay que sumar el negocio a NEGOCIOS_CON_APROBADOR_REAL, y el dueño tiene que estar logueado al ERP como OWNER en su celular`,
        "app.mjs `#aprobar` (uat-torneo.e2e.mjs:242-248: el celular sin la jornada da el código con el PIN)",
        "aprobar/page.tsx:28 (`NEGOCIOS_CON_APROBADOR_REAL = []`) y :31-44 (exige OWNER del ERP)",
      );
    await pd.close();
    // Como queda el día de corte (modo real, sin la jornada en este celular: el código sale con el PIN y lo verifica el club).
    const pc = await abrirAprobador("real");
    await pc.getByLabel("Tu PIN").fill("8484");
    await pc.getByRole("button", { name: "Aprobar y ver el código" }).click();
    const codigoErp = (await pc.locator("p.text-4xl").innerText()).trim();
    ok("3.codigo-erp", codigoErp === codigo, `El aprobador del ERP en modo real da el mismo código (${codigoErp})`);
    const scrollErp = await pc.evaluate(() => document.documentElement.scrollWidth);
    ok("3.celular-390-erp", scrollErp <= 390, `Aprobador del ERP a 390 px sin scroll horizontal (${scrollErp})`);
    await cel.close();
    // Recepción tipea el código: uno inventado no sirve; el de Majo sí.
    await irA(p, "Buffet");
    const t2 = tarjetaDeCuenta(p, "Juan Pérez");
    await t2.getByLabel(/^Código del dueño/).fill("AAA-AAA");
    await t2.getByRole("button", { name: "Aprobar", exact: true }).click();
    await p.waitForTimeout(150);
    const malo = await ultimoAviso(p);
    ok("3.codigo-malo", /1 de 5|Quedan 4/.test(malo + (await t2.innerText())), `Un código inventado no sirve («${malo.slice(0, 80)}»)`);
    await t2.getByLabel(/^Código del dueño/).fill(codigo.toLowerCase());
    await t2.getByRole("button", { name: "Aprobar", exact: true }).click();
    ok("3.aprobado", await avisoDelClub(p, /Aprobado por Majo Gimenez/), "El código de Majo aprueba el fiado");
    await t2.getByRole("button", { name: "A su cuenta corriente" }).click();
    await p.waitForTimeout(200);
    e3 = await estado(p);
    const juan = e3.clientes.find((c) => c.nombre === "Juan Pérez");
    ok("3.cc", juan?.deuda === 4000 && cuentaT(e3, R.c4)?.totales.pendiente === 0, `Los $ 4.000 pasan a la cuenta corriente de Juan (${juan?.deuda}) y la mesa de la cancha 4 queda en cero`);
    ok("3.campana-se-va", (await p.locator('[data-ui="aviso-del-duenio"]').innerText()).trim() === "", "Resuelto el pedido, no queda aviso 🔔");
  },

  // ═══ 4. Tienda: el pedido llega por WhatsApp desde el celular de un cliente (con el link de Configuración) ═══
  async (g) => {
    const p = g.p;
    // El celular del cliente abre el link para clientes (el turnero público, servido por el MISMO manejador del ERP).
    const link = String(g.linkClientes ?? "").replace(/^https?:\/\/[^/]+/, BASE_SITIO);
    const cli = await navegador.newContext({ viewport: { width: 390, height: 844 }, locale: "es-AR" });
    await cli.route(/fonts\.(googleapis|gstatic)\.com/, (rt) => rt.abort());
    const pt = await cli.newPage();
    pt.on("pageerror", (e) => errores.push(`tienda: ${e.message}`));
    await pt.goto(`${link}#tienda`);
    await pt.waitForSelector("#dlg-tienda[open] [data-mas]", { timeout: 10_000 });
    await pt.click('#dlg-tienda [data-mas="p1"]');
    await pt.click('#dlg-tienda [data-mas="p4"]');
    await pt.click('#dlg-tienda [data-mas="p4"]');
    await pt.fill("#tienda-nombre", "Pedro Gómez");
    await pt.fill("#tienda-tel", "11 5555 0006");
    await pt.click("#btn-tienda-pedir");
    await pt.waitForSelector("#tienda-listo:not([hidden])", { timeout: 6000 });
    const hrefTienda = (await pt.getAttribute("#tienda-wa", "href")) ?? "";
    const codigoTienda = ((await pt.textContent("#tienda-codigo")) ?? "").trim();
    const mensajeTienda = decodeURIComponent(hrefTienda.split("?text=")[1] ?? "");
    ok("4.tienda", hrefTienda.startsWith("https://wa.me/5491100000009?text=") && /Total \$\s?21\.000/.test(mensajeTienda) && mensajeTienda.includes(codigoTienda), `Tienda en el celular del cliente (link de React): 1 tubo + 2 overgrips = $ 21.000, pedido ${codigoTienda} por WhatsApp al club`);
    await foto(pt, "tienda-cliente");
    await cli.close();
    // En el club: solapa Tienda → «Cargar un pedido de WhatsApp» → aparece en «Pedidos para retirar».
    await volverALaAgenda(p);
    await irA(p, "Tienda");
    await p.getByLabel("Mensaje del cliente").fill(mensajeTienda);
    await p.getByRole("button", { name: "Cargar el pedido" }).click();
    const tarjeta = p.getByRole("listitem").filter({ has: p.getByRole("heading", { name: `${codigoTienda} · Pedro Gómez` }) });
    ok("4.pedido", (await tarjeta.count()) === 1, `Pedido ${codigoTienda} pegado desde WhatsApp: aparece en «Pedidos para retirar»`);
    let e4 = await estado(p);
    const antes = ingresos(e4);
    await tarjeta.getByRole("button", { name: "Entregar y cobrar" }).click();
    await medio(tarjeta, "Efectivo");
    await tarjeta.getByRole("button", { name: /^Cobrar y entregar \$\s?21\.000/ }).click();
    await p.waitForTimeout(200);
    e4 = await estado(p);
    ok("4.entregado", ingresos(e4) - antes === 21000 && e4.productos.find((x) => x.id === "p1")?.stock === 17 && e4.productos.find((x) => x.id === "p4")?.stock === 28, "Entregar y cobrar: caja +$ 21.000, tubos 18 → 17, overgrips 30 → 28");
    await foto(p, "tienda-entregado");
  },

  // ═══ 5. Venta de mostrador, remito desde la Caja (recepción) y el stock ═══
  async (g) => {
    const p = g.p;
    // Venta rápida de mostrador (Buffet): 2 aguas y una isotónica sin conteo, con Mercado Pago.
    await irA(p, "Buffet");
    const venta = p.getByRole("region", { name: "Venta rápida de mostrador" });
    let e5 = await estado(p);
    const antes = ingresos(e5);
    const aguaAntes = e5.productos.find((x) => x.id === "p2")?.stock ?? 0;
    for (let i = 0; i < 2; i++) {
      await venta.getByLabel("Código o producto (pasá el lector o escribí)").fill("agua");
      await venta.getByRole("list", { name: "Productos para la venta" }).getByRole("button", { name: /^\+ Agua 500 ml/ }).click();
    }
    // El lector: el código de la isotónica + Enter (en la jornada real los códigos de fábrica arrancan vacíos: el interno).
    await venta.getByLabel("Código o producto (pasá el lector o escribí)").fill("BP-003");
    await venta.getByLabel("Código o producto (pasá el lector o escribí)").press("Enter");
    await p.waitForTimeout(150);
    const lleva = (await venta.getByRole("list", { name: "Lo que lleva" }).innerText()).replace(/\s+/g, " ");
    await medio(venta, "Mercado Pago (QR)");
    await venta.getByRole("button", { name: /^Cobrar \$\s?7\.500/ }).click();
    await p.waitForTimeout(200);
    e5 = await estado(p);
    ok("5.mostrador", ingresos(e5) - antes === 7500 && e5.productos.find((x) => x.id === "p2")?.stock === aguaAntes - 2, `Venta de mostrador: 2 aguas (por nombre) + 1 isotónica (por el lector) = $ 7.500 por Mercado Pago; agua ${aguaAntes} → ${e5.productos.find((x) => x.id === "p2")?.stock} («${lleva.slice(0, 80)}»)`);
    // Alguien que viene al bar: «Abrir una cuenta», 2 aguas, y la mesa compleja: cargo manual y descuento con PIN del dueño.
    await venta.page().getByRole("region", { name: "Abrir una cuenta" }).getByLabel(/^A nombre de/).fill("Mesa del bar");
    await p.getByRole("region", { name: "Abrir una cuenta" }).getByRole("button", { name: "Abrir la cuenta" }).click();
    await p.waitForTimeout(150);
    const carga = p.getByRole("region", { name: "Cargar productos" });
    const opcion = await carga.getByLabel("A la cuenta de").locator("option", { hasText: /^Mesa del bar/ }).first().getAttribute("value");
    await carga.getByLabel("A la cuenta de").selectOption(opcion ?? "");
    await carga.getByLabel("Cantidad").fill("2");
    await carga.getByLabel("Código o producto (pasá el lector o escribí)").fill("agua");
    await carga.getByRole("list", { name: "Productos para cargar" }).getByRole("button", { name: /^2 × Agua 500 ml/ }).click();
    const mesa = tarjetaDeCuenta(p, "Mesa del bar");
    await mesa.getByText("Mesa compleja: repartir o cargar a mano").click();
    const manual = mesa.getByRole("form", { name: "Cargo manual a Mesa del bar" });
    await manual.getByLabel("Concepto").fill("Torta de cumpleaños");
    await manual.getByLabel("Monto").fill("15000");
    await manual.getByRole("button", { name: "Sumar el cargo" }).click();
    await p.waitForTimeout(150);
    await manual.getByLabel("Concepto").fill("Descuento cumpleañero");
    await manual.getByLabel("Tipo").selectOption("descuento");
    await manual.getByLabel("Monto").fill("1000");
    await manual.getByLabel("PIN del dueño").fill(g.pinLu);
    await manual.getByRole("button", { name: "Aplicar el descuento" }).click();
    await p.waitForTimeout(150);
    const sinDuenio = await ultimoAviso(p);
    const cuentaMesa = () => estado(p).then((e) => e.cuentas.find((c) => c.titular === "Mesa del bar"));
    const conPinDeLu = M.saldoCuenta((await cuentaMesa())!);
    await manual.getByLabel("Concepto").fill("Descuento cumpleañero");
    await manual.getByLabel("Tipo").selectOption("descuento");
    await manual.getByLabel("Monto").fill("1000");
    await manual.getByLabel("PIN del dueño").fill("8484");
    await manual.getByRole("button", { name: "Aplicar el descuento" }).click();
    await p.waitForTimeout(150);
    const saldoMesa = M.saldoCuenta((await cuentaMesa())!);
    ok("5.mesa-compleja", conPinDeLu === 19000 && saldoMesa === 18000, `Mesa compleja: cargo manual «Torta» $ 15.000; el descuento con el PIN de Lu no va («${sinDuenio.slice(0, 70)}») y con el de Majo sí: debe ${pesos(saldoMesa)}`);
    const antesMesa = ingresos(await estado(p));
    await medio(p.getByRole("region", { name: "Cuentas abiertas" }), "Efectivo");
    await mesa.getByRole("button", { name: /^Cobrar \$\s?18\.000/ }).click();
    await p.waitForTimeout(150);
    ok("5.mesa-cobrada", ingresos(await estado(p)) - antesMesa === 18000, "La mesa del bar se cobra en efectivo: $ 18.000");
    // El remito, desde la Caja: sin proveedores todavía, primero un dueño da de alta uno.
    await irA(p, "Caja");
    await p.getByText("Registrar un remito", { exact: true }).click();
    await p.getByRole("region", { name: "Registrar remito" }).waitFor().catch(() => undefined);
    const sinProv = await p.getByRole("region", { name: "Registrar remito" }).locator("option", { hasText: "Todavía no hay proveedores" }).count();
    ok("5.sin-proveedor", sinProv === 1, "Recepción abre «Registrar un remito» en la Caja: todavía no hay proveedores");
    await cambiarDeUsuario(p, /^Majo/, "8484");
    await irA(p, "Proveedores");
    await p.getByRole("button", { name: "+ Alta de proveedor" }).click();
    const altaP = p.getByRole("region", { name: "Alta de proveedor" });
    await altaP.getByLabel("Nombre", { exact: true }).fill("Distribuidora Sur");
    await altaP.getByLabel(/^Rubro/).fill("bebidas");
    await altaP.getByLabel("Teléfono").fill("1144440000");
    await altaP.getByRole("button", { name: "Dar de alta" }).click();
    await p.waitForTimeout(200);
    ok("5.alta-proveedor", proveedores(await estado(p)).some((x) => x.nombre === "Distribuidora Sur"), "Majo da de alta al proveedor «Distribuidora Sur»");
    await cambiarDeUsuario(p, /^Lu/, g.pinLu);
    await irA(p, "Caja");
    const det = p.locator("details").filter({ has: p.getByText("Registrar un remito", { exact: true }) });
    if (!(await det.evaluate((d) => (d as HTMLDetailsElement).open))) await p.getByText("Registrar un remito", { exact: true }).click();
    const remito = p.getByRole("region", { name: "Registrar remito" });
    await remito.getByLabel("Número de remito").fill("0001-00004567");
    // 24 cervezas: se busca por nombre y se corrige la cantidad.
    await remito.getByLabel("O buscalo por nombre o código").fill("cerveza");
    await remito.getByRole("list", { name: "Productos para sumar al remito" }).getByRole("button", { name: /^\+ Cerveza lata 473 ml/ }).click();
    await remito.getByRole("group", { name: "Cerveza lata 473 ml" }).getByLabel("Cantidad").fill("24");
    await remito.getByRole("group", { name: "Cerveza lata 473 ml" }).getByLabel("Costo por unidad").fill("1700");
    const cervezaAntes = (await estado(p)).productos.find((x) => x.id === "p9")?.stock ?? 0;
    await remito.getByRole("button", { name: "Registrar remito" }).click();
    await p.waitForTimeout(250);
    e5 = await estado(p);
    const prov = proveedores(e5).find((x) => x.nombre === "Distribuidora Sur");
    const deuda = prov ? M.deudaConProveedor(e5, prov.id) : 0;
    ok("5.remito", e5.productos.find((x) => x.id === "p9")?.stock === cervezaAntes + 24 && deuda === 24 * 1700, `Remito desde la Caja (Lu, recepción): cervezas ${cervezaAntes} → ${e5.productos.find((x) => x.id === "p9")?.stock}, deuda con el proveedor ${pesos(deuda)}`);
    g.deudaProveedor = 24 * 1700;
    await foto(p, "remito-caja");
  },

  // ═══ 6. Bloqueo: a mano, letras, Escape, 5 PIN mal, espera, cambio de operador, pantalla apagada e inactividad ═══
  async (g) => {
    const p = g.p;
    const malo = ["98", "97", "96", "95"].find((x) => ![g.pinLu, g.pinCaro, "5757", "8484"].includes(x)) ?? "99";
    // Queda la cuenta de un turno abierta (la de Pablo) y Lu bloquea con el candado.
    await irA(p, "Agenda");
    await abrirCuenta(p, String(g.sig));
    await p.getByRole("button", { name: /^Bloquear/ }).click();
    ok("6.candado", await bloqueada(p), "«Bloquear» (el candado de la cinta) bloquea la pantalla");
    await foto(p, "bloqueo");
    await pinDelBloqueo(p).focus();
    await p.keyboard.type("ab");
    await p.keyboard.press("Escape");
    const sinLetras = (await pinDelBloqueo(p).inputValue()) === "" && !/incorrecto/.test(await bloqueo(p).innerText());
    ok("6.letras", sinLetras, "Las letras no entran al PIN ni gastan un intento");
    ok("6.escape", (await bloqueada(p)) && (await bloqueo(p).evaluate((d) => (d as HTMLDialogElement).matches(":modal"))), "Escape no la cierra y lo de atrás queda inerte (diálogo modal)");
    for (let i = 0; i < 5; i++) {
      await pinDelBloqueo(p).fill(malo);
      await p.waitForTimeout(120);
    }
    ok("6.intentos", (await pinDelBloqueo(p).isDisabled()) && /Demasiados PIN equivocados: esperá 30 segundos/.test(await bloqueo(p).innerText()), "5 PIN mal → espera de 30 s con el campo deshabilitado");
    await g.ctx.clock.runFor(31_000);
    await bloqueo(p).getByRole("status").filter({ hasText: "Ya podés probar de nuevo." }).waitFor().catch(() => undefined);
    await pinDelBloqueo(p).fill(g.pinLu);
    await bloqueo(p).waitFor({ state: "detached", timeout: 3000 }).catch(() => undefined);
    ok("6.espera", !(await bloqueada(p)) && /Opera: Lu/.test(await p.locator("main").innerText()), "Pasada la espera, con su PIN desbloquea y sigue Lu");
    // «Entrar con otro usuario»: Roberto. ¿Se cierra lo que Lu tenía abierto?
    await p.locator("body").click({ position: { x: 3, y: 3 } });
    await p.keyboard.press("l");
    await desbloquear(p, /^Roberto/, "5757");
    const cuentaSigue = await p.getByText("Cuenta del turno", { exact: true }).count();
    ok("6.otro", !(await bloqueada(p)) && /Opera: Roberto Ronco/.test(await p.locator("main").innerText()), "«Entrar con otro usuario»: entra Roberto con su PIN");
    if (cuentaSigue === 0) ok("6.cierra-lo-de-lu", true, "La cuenta que Lu tenía abierta quedó cerrada al entrar Roberto");
    else
      brecha(
        "cambio-de-operador-cierra",
        "Al entrar otra persona, la cuenta del turno que dejó abierta la anterior sigue abierta (el vanilla cierra la ventana)",
        "uat-b.e2e.mjs:141-143 (`!dlg.open` después de «Entrar con otro usuario»)",
        "ClubDemo.tsx:185 (`panel` no se limpia al cambiar el operador)",
      );
    // Pantalla apagada o en otra app más de 30 s → bloqueada; menos de 30 s → no.
    const ocultar = (oculta: boolean) =>
      p.evaluate((o) => {
        Object.defineProperty(document, "hidden", { configurable: true, get: () => o });
        Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (o ? "hidden" : "visible") });
        document.dispatchEvent(new Event("visibilitychange"));
      }, oculta);
    await ocultar(true);
    await g.ctx.clock.runFor(31_000);
    await ocultar(false);
    await p.waitForTimeout(200);
    ok("6.pantalla", await bloqueada(p), "Fuera más de 30 s (pantalla apagada o cambio de app) → bloqueada");
    await desbloquear(p, null, "5757");
    await ocultar(true);
    await g.ctx.clock.runFor(5_000);
    await ocultar(false);
    await p.waitForTimeout(200);
    ok("6.pantalla-corta", !(await bloqueada(p)), "Fuera menos de 30 s → no se bloquea");
    // Inactividad configurable: 1 minuto en Configuración → se bloquea solo.
    await irA(p, "Configuración");
    const reglas = p.getByRole("form", { name: "Reglas y precios" });
    await reglas.getByLabel("Bloquear la pantalla tras (minutos sin uso)").fill("1");
    await reglas.getByRole("button", { name: "Guardar reglas y precios" }).click();
    await p.waitForTimeout(200);
    await g.ctx.clock.runFor(75_000);
    await p.waitForTimeout(200);
    ok("6.inactividad", await bloqueada(p), "Con «Bloquear la pantalla tras 1 minuto», sin uso se bloquea solo");
    await desbloquear(p, null, "5757");
    await reglas.getByLabel("Bloquear la pantalla tras (minutos sin uso)").fill("5");
    await reglas.getByRole("button", { name: "Guardar reglas y precios" }).click();
    await p.waitForTimeout(150);
    ok("6.pin-oculto", !/\b5757\b/.test(await p.locator("main").innerText()), "Nunca se ve un PIN en pantalla");
  },

  // ═══ 7. La dueña: Tablero, Clientes, Proveedores, Stock, Novedades, usuarios y respaldo ═══
  async (g) => {
    const p = g.p;
    await cambiarDeUsuario(p, /^Majo/, "8484");
    // Tablero: indicadores y la caja del día por medio (= la caja).
    await irA(p, "Tablero");
    let e7 = await estado(p);
    const kpis = (await p.getByRole("region", { name: "Cómo viene hoy" }).innerText()).replace(/\s+/g, " ");
    ok("7.kpis", kpis.length > 20, `Tablero: indicadores de hoy («${kpis.slice(0, 120)}»)`);
    const porMedioPantalla = p.locator("section").filter({ has: p.getByRole("heading", { name: /^Caja del día por medio/ }) }).first();
    const textoMedios = (await porMedioPantalla.innerText()).replace(/\s+/g, " ");
    const esperados = (["efectivo", "mercadopago", "transferencia", "debito"] as const).map((m) => [M.MEDIOS[m], porMedio(e7, m)] as const);
    ok("7.caja-por-medio", esperados.every(([etq, monto]) => textoMedios.includes(`${etq} ${pesos(monto)}`)), `Caja del día por medio = lo cobrado por medio (${esperados.map(([e, m]) => `${e} ${pesos(m)}`).join(" · ")})`);
    await foto(p, "tablero");
    // Clientes: la ficha de Juan, su estado de cuenta y cobrar una parte de la deuda.
    await irA(p, "Clientes");
    await p.getByLabel("Buscar por nombre o teléfono").fill("Juan");
    await p.getByRole("list", { name: "Clientes del club" }).getByRole("button", { name: /^Juan Pérez/ }).click();
    const ficha = p.getByRole("region", { name: "Juan Pérez", exact: true });
    await ficha.waitFor();
    const filasCC = await ficha.getByRole("table", { name: /Movimientos de la cuenta corriente/ }).getByRole("row").count();
    ok("7.estado-de-cuenta", filasCC >= 2, `Clientes → Juan: estado de cuenta con sus movimientos (${filasCC - 1})`);
    const cobrar = ficha.getByRole("form", { name: "Cobrar la deuda de Juan Pérez" });
    await medio(cobrar, "Efectivo");
    await cobrar.getByLabel("Monto (vacío = todo lo que debe)").fill("1000");
    await cobrar.getByRole("button", { name: "Cobrar", exact: true }).click();
    await p.waitForTimeout(200);
    e7 = await estado(p);
    ok("7.cobrar-deuda", e7.clientes.find((c) => c.nombre === "Juan Pérez")?.deuda === 3000, "Juan paga $ 1.000 de su cuenta corriente: le quedan $ 3.000");
    await ficha.getByRole("button", { name: "Cerrar la ficha" }).click().catch(() => undefined);
    // Proveedores: pagar con PIN (uno mal no paga).
    await irA(p, "Proveedores");
    await p.getByRole("list", { name: "Proveedores del club" }).getByRole("button", { name: /^Distribuidora Sur/ }).click();
    const pagar = p.locator("section").filter({ has: p.getByRole("heading", { name: "Pagar", exact: true }) }).first();
    await pagar.getByLabel("Monto").fill("20000");
    await pagar.getByLabel(/^PIN de|^Tu PIN/).fill("1111");
    await pagar.getByRole("button", { name: "Registrar pago" }).click();
    await p.waitForTimeout(150);
    const provId = proveedores(e7).find((x) => x.nombre === "Distribuidora Sur")?.id ?? "";
    const sinPagar = M.deudaConProveedor(await estado(p), provId);
    await pagar.getByLabel("Monto").fill("20000");
    await pagar.getByLabel(/^PIN de|^Tu PIN/).fill("8484");
    await pagar.getByRole("button", { name: "Registrar pago" }).click();
    await p.waitForTimeout(200);
    e7 = await estado(p);
    ok("7.pagar-proveedor", sinPagar === 40800 && M.deudaConProveedor(e7, provId) === 20800, `Proveedores: con un PIN equivocado no paga; con el de Majo paga $ 20.000 por transferencia (deuda ${pesos(40800)} → ${pesos(M.deudaConProveedor(e7, provId))})`);
    // Stock: un conteo que corrige (se perdió un overgrip).
    await irA(p, "Stock");
    const og = e7.productos.find((x) => x.id === "p4")?.stock ?? 0;
    await p.getByRole("list", { name: "Productos del club" }).getByRole("button", { name: /^Overgrip/ }).first().click();
    await p.getByLabel("Stock actual (conteo)").fill(String(og - 1));
    await p.getByRole("button", { name: "Guardar", exact: true }).click();
    await p.waitForTimeout(150);
    ok("7.conteo", (await estado(p)).productos.find((x) => x.id === "p4")?.stock === og - 1, `Stock: el conteo corrige los overgrips ${og} → ${og - 1}`);
    // Novedades: difusión por WhatsApp, uno por uno y la lista (CSV).
    await irA(p, "Novedades y redes");
    const armar = p.locator("section").filter({ has: p.getByRole("heading", { name: "Novedades del club · difusión por WhatsApp" }) }).first();
    await armar.getByLabel("Tipo").selectOption("torneo");
    await armar.getByLabel("Título").fill("Torneo de categorías el sábado 24");
    await armar.getByLabel("Texto").fill("Inscripción $20.000 por pareja. Anotate respondiendo este mensaje.");
    await armar.getByRole("button", { name: "Preparar el envío" }).click();
    await p.waitForTimeout(200);
    e7 = await estado(p);
    const dif = (e7.difusiones ?? [])[0];
    const conCel = e7.clientes.filter((c) => c.tel).length;
    ok("7.difusion", !!dif && dif.destinatarios.length === conCel && conCel >= 5, `Novedad «${dif?.titulo}» lista para ${dif?.destinatarios.length} clientes con celular`);
    const uno = p.getByRole("list", { name: "Uno por uno" }).getByRole("link").first();
    const hrefEnvio = (await uno.getAttribute("href")) ?? "";
    await uno.click({ modifiers: [] }).catch(() => undefined);
    await p.waitForTimeout(300);
    for (const otra of g.ctx.pages()) if (otra !== p) await otra.close();
    ok("7.uno-por-uno", /^https:\/\/wa\.me\/\d+\?text=/.test(hrefEnvio) && /BAJA/.test(decodeURIComponent(hrefEnvio)) && ((await estado(p)).difusiones?.[0]?.enviados.length ?? 0) === 1, "Uno por uno: el link abre WhatsApp con su nombre y la baja, y queda tildado");
    const [csv] = await Promise.all([p.waitForEvent("download"), p.getByRole("button", { name: "Descargar contactos (CSV)" }).click()]);
    ok("7.csv", /\.csv$/.test(csv.suggestedFilename()), `Contactos para la lista de difusión: ${csv.suggestedFilename()}`);
    await foto(p, "difusion");
    // Configuración: alta de Agus (recepción, el PIN se ve una vez) y el respaldo.
    await irA(p, "Configuración");
    const alta = p.getByRole("form", { name: "Dar de alta a alguien" });
    await alta.getByLabel("Nombre").fill("Agus (finde)");
    await alta.getByLabel("PIN de Majo").fill("8484");
    await alta.getByRole("button", { name: "Dar de alta" }).click();
    const grupo = p.getByRole("group", { name: /^✔ Agus \(finde\) · Recepción/ });
    await grupo.waitFor();
    const pinAgus = (await grupo.locator("p.text-4xl").innerText()).trim();
    await grupo.getByRole("button", { name: "Listo, ya se lo di" }).click();
    ok("7.alta", /^\d{2}$/.test(pinAgus) && (await estado(p)).usuarios.some((u) => u.nombre === "Agus (finde)" && u.rol === "recepcion"), "Majo da de alta a Agus en recepción: el PIN se ve una vez");
    const usuarios = p.getByRole("list", { name: "Usuarios con acceso" });
    const filaMajo = usuarios.getByRole("listitem").filter({ hasText: "Majo Gimenez (vos)" });
    ok("7.no-se-saca", (await filaMajo.getByRole("button", { name: /^Sacar acceso/ }).count()) === 0 && (await usuarios.getByRole("button", { name: /^Sacar acceso/ }).count()) >= 1, "La dueña no tiene «Sacar acceso» en su propia fila (sí en las demás)");
    // PIN nuevo para Caro: el viejo deja de andar.
    const pinViejo = g.pinCaro;
    await usuarios.getByRole("button", { name: "PIN nuevo para Caro" }).click();
    const formPin = p.getByRole("form", { name: "PIN nuevo para Caro" });
    await formPin.getByLabel(/^PIN de|^Tu PIN/).fill("8484");
    await formPin.getByRole("button", { name: "Armar PIN nuevo" }).click();
    const nuevo = p.getByRole("group").filter({ has: p.locator("p.text-4xl") }).first();
    await nuevo.waitFor();
    g.pinCaro = (await nuevo.locator("p.text-4xl").innerText()).trim();
    await nuevo.getByRole("button", { name: "Listo, ya se lo di" }).click();
    const caro = (await estado(p)).usuarios.find((u) => u.nombre === "Caro");
    ok("7.pin-nuevo", /^\d{2}$/.test(g.pinCaro) && g.pinCaro !== pinViejo && caro?.pin === g.pinCaro, "PIN nuevo de Caro: el viejo deja de andar y el nuevo se ve una vez");
    // Sacar acceso a Agus.
    await usuarios.getByRole("button", { name: "Sacar acceso a Agus (finde)" }).click();
    const formSacar = p.getByRole("form", { name: "Sacarle el acceso a Agus (finde)" });
    await formSacar.getByLabel(/^PIN de|^Tu PIN/).fill("8484");
    await formSacar.getByRole("button", { name: "Sacar acceso" }).click();
    await p.waitForTimeout(150);
    const agus = (await estado(p)).usuarios.find((u) => u.nombre === "Agus (finde)");
    ok("7.sacar-acceso", !agus || agus.activo === false, "Sacar acceso a Agus: ya no puede entrar");
    // «Empezar otra jornada en blanco» se recorre en otra compu con esta misma jornada (7c): acá borraría el sábado.
    const [resp] = await Promise.all([p.waitForEvent("download"), p.getByRole("button", { name: "Descargar respaldo", exact: true }).click()]);
    const respaldo = JSON.parse(readFileSync((await resp.path()) ?? "", "utf8")) as { v: number; estado: EstadoClub };
    e7 = await estado(p);
    ok("7.respaldo", respaldo.v === 1 && respaldo.estado.reservas.length === e7.reservas.length, `Respaldo descargado (${resp.suggestedFilename()}) con toda la jornada (${respaldo.estado.reservas.length} turnos)`);
    g.respaldo = (await resp.path()) ?? "";
  },

  // ═══ 7b. Archivar días cerrados en DOS pasos (otra compu con un mes de club lleno, como el vanilla) ═══
  async (g) => {
    const actual = await estado(g.p);
    const ctx2 = await navegador.newContext({ viewport: { width: 1366, height: 900 }, locale: "es-AR", timezoneId: "America/Argentina/Buenos_Aires", acceptDownloads: true });
    await ctx2.clock.install({ time: new Date("2026-10-17T19:00:00-03:00") });
    await ctx2.route(ORIGEN, (rt) => rt.fulfill({ contentType: "text/html; charset=utf-8", body: html() }));
    const mes = armarMesCargado("2026-10-10", 30);
    Object.assign(mes.estado, { usuarios: actual.usuarios, config: { ...actual.config, configurado: true } });
    const texto = JSON.stringify({ v: mes.v, estado: mes.estado, secuencia: mes.secuencia });
    await ctx2.addInitScript(([k, t]) => {
      try {
        if (!localStorage.getItem(k)) localStorage.setItem(k, t);
      } catch {
        // sin lugar: el test lo dice
      }
    }, [CLAVE, texto] as const);
    const q = await abrirClub(ctx2, "OWNER", "archivo");
    await desbloquear(q, /^Majo/, "8484");
    const llena = (await q.evaluate((k) => localStorage.getItem(k), CLAVE))?.length ?? 0;
    const cinta = q.getByRole("button", { name: "Archivar los días cerrados" });
    const avisa = (await cinta.count()) > 0 && /Lo guardado se está llenando/.test(await q.locator("main").innerText());
    ok("7b.aviso", llena > 2_500_000 && avisa, `Con un mes de club (${Math.round(llena / 1024)} KB) la cinta avisa «Lo guardado se está llenando» con «Archivar los días cerrados»`);
    if (await cinta.count()) await cinta.first().click();
    else await irA(q, "Configuración");
    ok("7b.lleva", (await q.getByRole("tab", { name: "Configuración", selected: true }).count()) === 1, "El aviso lleva a Configuración → «Archivar días cerrados»");
    const antes = await estado(q);
    await q.getByRole("button", { name: "Archivar días cerrados" }).click();
    const archivar = q.getByRole("group", { name: "Archivar días cerrados" });
    const paso2Cerrado = await archivar.getByRole("button", { name: "Ya lo guardé: achicar" }).isDisabled();
    await archivar.getByLabel(/^PIN de/).fill("8484");
    const [paquete] = await Promise.all([q.waitForEvent("download"), archivar.getByRole("button", { name: "Descargar el respaldo para archivar" }).click()]);
    const rutaPaquete = (await paquete.path()) ?? "";
    const tamPaso1 = (await q.evaluate((k) => localStorage.getItem(k), CLAVE))?.length ?? 0;
    ok("7b.paso1", paso2Cerrado && /^breakpoint-respaldo-y-archivo-\d{4}-\d{2}-\d{2}-\d{4}\.json$/.test(paquete.suggestedFilename()) && tamPaso1 >= llena * 0.95, `Paso 1: UNA descarga (${paquete.suggestedFilename()}) con el respaldo y los días a archivar; todavía no se achicó nada`);
    await archivar.getByRole("button", { name: "Ya lo guardé: achicar" }).click();
    const sinArchivo = await avisoDelClub(q, /Elegí el archivo que descargaste/);
    await archivar.getByLabel("Archivo descargado").setInputFiles(g.respaldo as string);
    await archivar.getByRole("button", { name: "Ya lo guardé: achicar" }).click();
    await q.waitForTimeout(800);
    const conOtro = await ultimoAviso(q);
    const tamOtro = (await q.evaluate((k) => localStorage.getItem(k), CLAVE))?.length ?? 0;
    ok("7b.otro", sinArchivo && tamOtro >= llena * 0.95, `Sin elegir el archivo, o eligiendo otro (el respaldo del día), no se achica nada («${conOtro.slice(0, 90)}»)`);
    await archivar.getByLabel("Archivo descargado").setInputFiles(rutaPaquete);
    await archivar.getByRole("button", { name: "Ya lo guardé: achicar" }).click();
    await q.getByText(/^Archivo verificado: achicado\./).waitFor({ timeout: 8000 });
    const despues = await estado(q);
    const tamDespues = (await q.evaluate((k) => localStorage.getItem(k), CLAVE))?.length ?? 0;
    ok("7b.achica", !!despues.archivo?.hasta && tamDespues < llena * 0.75, `Paso 2: eligiendo el archivo descargado se verifica y archiva hasta el ${despues.archivo?.hasta}: ${Math.round(llena / 1024)} KB → ${Math.round(tamDespues / 1024)} KB`);
    ok("7b.saldos", despues.clientes.every((c, i) => c.deuda === antes.clientes[i].deuda && c.monedero === antes.clientes[i].monedero), "Los saldos de los clientes quedan como estaban");
    const resumen = q.locator("summary").filter({ hasText: /^Días archivados \(\d+\)/ });
    ok("7b.resumen", (await resumen.count()) === 1, `La tarjeta muestra los días archivados («${(await resumen.innerText().catch(() => "")).trim()}»)`);
    const bajado = JSON.parse(readFileSync(rutaPaquete, "utf8")) as { anexo: Parameters<typeof M.plataPorDia>[0] };
    const plata = (...partes: Parameters<typeof M.plataPorDia>[0][]) => {
      const t: Record<string, number> = {};
      for (const x of partes) for (const [d, f] of Object.entries(M.plataPorDia(x))) t[d] = (t[d] ?? 0) + f.canchas + f.cuentas + f.ingresos - f.egresos;
      return JSON.stringify(Object.entries(t).sort());
    };
    ok("7b.plata", plata(antes) === plata(despues, bajado.anexo), "Al centavo, día por día: lo que había = lo que quedó + lo del archivo");
    await foto(q, "archivado");
    await q.close();
    const q2 = await abrirClub(ctx2, "OWNER", "archivo-recarga");
    await desbloquear(q2, /^Majo/, "8484");
    ok("7b.vuelve", (await estado(q2)).archivo?.hasta === despues.archivo?.hasta && !(await bloqueada(q2)), "Al recargar, la jornada achicada se abre igual");
    await ctx2.close();
    // Si el navegador NO baja archivos (descarga cancelada o bloqueada), no hay archivo para elegir y no se achica nada.
    const ctx3 = await navegador.newContext({ viewport: { width: 1366, height: 900 }, locale: "es-AR", timezoneId: "America/Argentina/Buenos_Aires", acceptDownloads: false });
    await ctx3.clock.install({ time: new Date("2026-10-17T19:00:00-03:00") });
    await ctx3.route(ORIGEN, (rt) => rt.fulfill({ contentType: "text/html; charset=utf-8", body: html() }));
    await ctx3.addInitScript(([k, t]) => {
      try {
        if (!localStorage.getItem(k)) localStorage.setItem(k, t);
      } catch {
        // sin lugar
      }
    }, [CLAVE, texto] as const);
    const r3 = await abrirClub(ctx3, "OWNER", "archivo-sin-descargas");
    await desbloquear(r3, /^Majo/, "8484");
    const antes3 = (await r3.evaluate((k) => localStorage.getItem(k), CLAVE))?.length ?? 0;
    await irA(r3, "Configuración");
    await r3.getByRole("button", { name: "Archivar días cerrados" }).click();
    const arch3 = r3.getByRole("group", { name: "Archivar días cerrados" });
    await arch3.getByLabel(/^PIN de/).fill("8484");
    await arch3.getByRole("button", { name: "Descargar el respaldo para archivar" }).click();
    await r3.waitForTimeout(800);
    await arch3.getByRole("button", { name: "Ya lo guardé: achicar" }).click().catch(() => undefined);
    const aviso3 = await avisoDelClub(r3, /Elegí el archivo que descargaste/);
    const despues3 = (await r3.evaluate((k) => localStorage.getItem(k), CLAVE)) ?? "";
    ok("7b.cancelada", aviso3 && despues3.length >= antes3 * 0.95 && !(JSON.parse(despues3) as { estado: EstadoClub }).estado.archivo, `Si el navegador no baja el archivo, no hay nada que elegir y lo guardado NO se achica (${Math.round(antes3 / 1024)} KB → ${Math.round(despues3.length / 1024)} KB)`);
    await ctx3.close();
  },

  // ═══ 7c. «Empezar otra jornada en blanco» (otra compu con la jornada del sábado): respaldo bajado y ELEGIDO + PIN ═══
  async (g) => {
    const texto = readFileSync(g.respaldo as string, "utf8");
    const antes = (JSON.parse(texto) as { estado: EstadoClub }).estado;
    const ctx4 = await navegador.newContext({ viewport: { width: 1024, height: 900 }, locale: "es-AR", timezoneId: "America/Argentina/Buenos_Aires", acceptDownloads: true });
    await ctx4.clock.install({ time: new Date("2026-10-17T19:30:00-03:00") });
    await ctx4.route(ORIGEN, (rt) => rt.fulfill({ contentType: "text/html; charset=utf-8", body: html() }));
    await ctx4.addInitScript(([k, t]) => {
      try {
        if (!localStorage.getItem(k)) localStorage.setItem(k, t);
      } catch {
        // sin lugar: el test lo dice
      }
    }, [CLAVE, texto] as const);
    const q = await abrirClub(ctx4, "OWNER", "en-blanco");
    await desbloquear(q, /^Majo/, "8484");
    await irA(q, "Configuración");
    const jornada = q.getByRole("region", { name: "Jornada" });
    if ((await jornada.getByRole("heading", { name: "Empezar otra jornada en blanco" }).count()) === 0) {
      brecha(
        "jornada-en-blanco",
        "No está «Empezar otra jornada en blanco» (con PIN de dueño, apartando la de ahora y bajando un respaldo): para empezar de cero hay que restaurar o hacer la limpieza del go-live",
        "app.mjs:888 y :2279 (`jornada` → `blanco`)",
        "config-jornada.tsx (la sección «Jornada»)",
      );
      await ctx4.close();
      return;
    }
    const guardadoEnLaCompu = () => q.evaluate((k) => Object.keys(localStorage).filter((x) => x.startsWith(`${k}:antes-de-blanco:`)), CLAVE);
    const sigueIgual = async () => {
      const e = await estado(q);
      return e.reservas.length === antes.reservas.length && e.config.configurado !== false && (await guardadoEnLaCompu()).length === 0 && /Opera: Majo/.test(await q.locator("main").innerText());
    };
    await jornada.getByRole("button", { name: "Quiero empezar en blanco" }).click();
    const zona = jornada.getByRole("group", { name: "Empezar otra jornada en blanco" });
    const empezar = zona.getByRole("button", { name: "Ya lo guardé: empezar en blanco" });
    const cerrado = await empezar.isDisabled();
    ok("7c.que-pasa", cerrado && (await zona.innerText()).includes("Se empieza de cero: hay que volver a armar los PIN. Lo de ahora queda en el respaldo que bajaste y en una copia en esta compu."), "Majo (dueña) abre «Empezar otra jornada en blanco» en Jornada: dice qué pasa y no deja empezar sin el respaldo");
    await zona.getByLabel(/^PIN de/).fill("8484");
    const [d] = await Promise.all([q.waitForEvent("download"), zona.getByRole("button", { name: "Descargar el respaldo de antes de empezar" }).click()]);
    const ruta = (await d.path()) ?? "";
    const bajado = JSON.parse(readFileSync(ruta, "utf8")) as { v: number; estado: EstadoClub };
    ok("7c.paso1", /^breakpoint-jornada-antes-de-blanco-\d{4}-\d{2}-\d{2}-\d{4}\.json$/.test(d.suggestedFilename()) && bajado.estado.reservas.length === antes.reservas.length && (await sigueIgual()), `Paso 1: UNA descarga (${d.suggestedFilename()}) con toda la jornada (${bajado.estado.reservas.length} turnos); todavía no se tocó nada`);
    const tarjetaZona = zona.locator("xpath=..");
    await tarjetaZona.scrollIntoViewIfNeeded();
    await tarjetaZona.screenshot({ path: join(OUT, `${String(++nFoto).padStart(2, "0")}-en-blanco-1024.png`) }).catch(() => undefined);
    await q.setViewportSize({ width: 390, height: 844 });
    await q.waitForTimeout(150);
    const corre = await sinScrollDeCostado(q);
    await tarjetaZona.screenshot({ path: join(OUT, `${String(++nFoto).padStart(2, "0")}-en-blanco-390.png`) }).catch(() => undefined);
    await q.setViewportSize({ width: 1024, height: 900 });
    ok("7c.390", corre <= 0, `La zona de empezar en blanco en 390 px, sin scroll de costado (${corre})`);
    // Sin elegir el archivo, o eligiendo otro (un respaldo de otra jornada), no se toca nada.
    await empezar.click();
    const sinArchivo = await avisoDelClub(q, /Elegí el respaldo que descargaste \(paso 2\): sin eso no se empieza nada/);
    const otro = join(OUT, "respaldo-de-otra-jornada.json");
    writeFileSync(otro, JSON.stringify({ v: 1, estado: M.crearClubReal("2026-10-10"), secuencia: 1, usuario: null, guardado: 1 }));
    await zona.getByLabel("Respaldo descargado").setInputFiles(otro);
    await empezar.click();
    const conOtro = await avisoDelClub(q, /no es el respaldo que descargaste recién/);
    ok("7c.otro", sinArchivo && conOtro && (await sigueIgual()), "Sin elegir el archivo, o con otro respaldo, no hace nada: la jornada sigue igual, sin copias y con Majo operando");
    // Con el archivo descargado: se verifica que es la jornada de ahora y recién ahí empieza en blanco.
    await zona.getByLabel("Respaldo descargado").setInputFiles(ruta);
    await empezar.click();
    const consola = q.getByRole("region", { name: "Configuración inicial del club" });
    await consola.waitFor({ timeout: 5000 }).catch(() => undefined);
    const aviso = await avisoDelClub(q, /empezó una jornada nueva en blanco/);
    const ahora = await estado(q);
    const copias = await guardadoEnLaCompu();
    const copia = copias.length === 1 ? (JSON.parse((await q.evaluate((k) => localStorage.getItem(k), copias[0])) ?? "{}") as { estado?: EstadoClub }).estado : undefined;
    ok(
      "7c.consola",
      (await consola.count()) === 1 && (await q.getByRole("tablist").count()) === 0 && aviso && ahora.config.configurado === false && ahora.reservas.length + ahora.clientes.length + ahora.cuentas.length === 0,
      "Con el respaldo elegido: jornada nueva en blanco, sin nadie operando → aparece la consola de primera vez (hay que volver a armar los PIN)",
    );
    ok("7c.copias", copia?.reservas.length === antes.reservas.length && M.hidratarEstado(bajado).ok, `Lo de antes queda en el respaldo bajado (se puede restaurar) y en UNA copia en esta compu (${copias.join(", ").replace(CLAVE, "…")})`);
    await foto(q, "en-blanco-consola");
    await ctx4.close();
  },

  // ═══ 8. Cierre: la caja con PIN, la caja = lo cobrado al peso, y la medianoche (caja de 12 a 12) ═══
  async (g) => {
    const p = g.p;
    await irA(p, "Caja");
    const cierre = p.getByRole("region", { name: "Cerrar la caja" });
    const esperado = Number(((await cierre.getByText(/^Tendría que haber/).innerText()).match(/\$\s?([\d.]+)/)?.[1] ?? "0").replace(/\./g, ""));
    await cierre.getByLabel("Efectivo contado").fill(String(esperado));
    await cierre.getByLabel(/^PIN de|^Tu PIN/).fill("1111");
    await cierre.getByRole("button", { name: "Cerrar la caja" }).click();
    await p.waitForTimeout(150);
    const conPinMalo = (await estado(p)).caja.cierres.length;
    await cierre.getByLabel("Efectivo contado").fill(String(esperado));
    await cierre.getByLabel(/^PIN de|^Tu PIN/).fill("8484");
    await cierre.getByRole("button", { name: "Cerrar la caja" }).click();
    await p.waitForTimeout(200);
    const e8 = await estado(p);
    ok("8.caja", conPinMalo === 0 && e8.caja.cierres.length === 1 && e8.caja.cierres[0].diferencia === 0, `Con un PIN equivocado no cierra; Majo cierra la caja del día con su PIN y cuadra (efectivo ${pesos(esperado)})`);
    ok("8.caja-una-vez", /ya está cerrada \(se cierra una sola vez\)/.test(await cierre.innerText()), "La caja no se cierra dos veces");
    await foto(p, "caja-cerrada");
    // Cuentas claras: la caja es exactamente lo cobrado (pagos sin monedero) en canchas, cargos, tienda, mostrador y deudas.
    const sinMonedero = (pagos: { medio: string; monto: number }[]) => pagos.filter((x) => x.medio !== "monedero").reduce((t, x) => t + x.monto, 0);
    const canchas = e8.reservas.reduce((s, r) => s + sinMonedero(r.pagos), 0);
    const cargos = e8.cuentas.reduce((s, c) => s + sinMonedero(c.pagos), 0);
    const deudas = e8.caja.movimientos.filter((m) => m.tipo === "ingreso" && /cuenta corriente|deuda/i.test(m.concepto ?? "")).reduce((s, m) => s + m.monto, 0);
    ok("8.caja-lo-cobrado", ingresos(e8) === canchas + cargos + deudas, `La caja (${pesos(ingresos(e8))}) es exactamente lo cobrado: canchas ${pesos(canchas)} + cargos/tienda/mostrador ${pesos(cargos)} + deuda cobrada ${pesos(deudas)}`);
    const sig = String(g.sig);
    ok("8.abiertas", e8.cuentas.filter((c) => c.estado === "abierta").every((c) => c.reservaId === sig || M.saldoCuenta(c) === 0), "No quedó ninguna cuenta con saldo salvo la del turno que sigue jugando");
    ok("8.nada-negativo", e8.cuentas.every((c) => M.saldoCuenta(c) >= 0) && e8.productos.every((x) => x.stock == null || x.stock >= 0), "Ninguna cuenta ni stock en negativo");
    // La medianoche: a las 00:30 la agenda sigue en el sábado y la caja es la del 17/10 (de 12 a 12).
    const ahoraMs = await p.evaluate(() => Date.now());
    await g.ctx.clock.fastForward(new Date("2026-10-18T00:30:00-03:00").getTime() - ahoraMs);
    await p.waitForTimeout(500);
    if (await bloqueada(p)) await desbloquear(p, null, "8484");
    await irA(p, "Agenda");
    const reloj = /Hora: 00:30/.test(await p.locator("main").innerText());
    const hoy = (await p.getByRole("group", { name: "Elegir el día de la agenda" }).getByRole("button", { pressed: true }).innerText()).trim();
    ok("8.medianoche", reloj && /17\/10/.test(hoy), `A las 00:30 la agenda sigue en el sábado (el club cierra a la 01:00): día «${hoy.replace(/\s+/g, " ")}»`);
    await irA(p, "Caja");
    const titulo = await p.getByRole("heading", { level: 2 }).filter({ hasText: /^Caja del/ }).first().innerText();
    ok("8.caja-12-a-12", M.diaDeCaja(e8, "2026-10-18", 30) === "2026-10-17" && /^Caja del 18\/10/.test(titulo), `La caja va de 12 a 12 (a las 00:30 todavía es la del 17/10) y, como ya se cerró, lo que se cobre ahora entra en la siguiente: «${titulo}»`);
  },

  // ═══ 9. La compu se recarga: todo sigue (guardado en el equipo) y vuelve bloqueada; segunda pestaña: «Usar acá» ═══
  async (g) => {
    let p = g.p;
    const antes = await estado(p);
    await p.close();
    p = await abrirClub(g.ctx, "OWNER");
    g.p = p;
    paginaParaVolcar = p;
    await bloqueo(p).getByRole("heading", { name: "Pantalla bloqueada" }).waitFor().catch(() => undefined);
    ok("9.bloqueada", (await bloqueada(p)) && /Se volvió a abrir el sistema/.test(await bloqueo(p).innerText()), "Al recargar vuelve bloqueada: «Se volvió a abrir el sistema: poné tu PIN»");
    await desbloquear(p, /^Lu/, g.pinLu);
    const e9 = await estado(p);
    ok("9.sigue", ingresos(e9) === ingresos(antes) && e9.reservas.length === antes.reservas.length && M.reserva(e9, String(g.sig))?.estado === "en_cancha" && e9.caja.cierres.length === 1, `Después de recargar está todo: caja ${pesos(ingresos(e9))}, ${e9.reservas.length} turnos, el de las 16:30 en juego, la caja cerrada`);
    // Una segunda pestaña del club: avisa y no pisa; «Usar acá» la toma (la otra queda para mirar).
    const otra = await abrirClub(g.ctx, "OWNER", "segunda-pestaña");
    await otra.getByText("La jornada está abierta en otra pestaña de este equipo").waitFor({ timeout: 4000 }).catch(() => undefined);
    const avisa = (await otra.getByText("La jornada está abierta en otra pestaña de este equipo").count()) === 1;
    ok("9.otra-pestana", avisa, "Una segunda pestaña del club avisa que la jornada ya está abierta en otra pestaña y no pisa nada");
    await foto(otra, "segunda-pestana");
    const usar = otra.getByRole("button", { name: "Usar acá" });
    if (await bloqueada(otra)) await desbloquear(otra, /^Lu/, g.pinLu);
    if (await usar.count()) {
      await usar.click().catch(() => undefined);
      await p.getByText("La jornada está abierta en otra pestaña de este equipo").waitFor({ timeout: 4000 }).catch(() => undefined);
      ok("9.usar-aca", (await p.getByText("La jornada está abierta en otra pestaña de este equipo").count()) === 1, "«Usar acá» en la segunda: la primera pasa a sólo mirar");
      await otra.close();
      await p.getByRole("button", { name: "Usar acá" }).click().catch(() => undefined);
      await p.waitForTimeout(400);
      if (await bloqueada(p)) await desbloquear(p, null, g.pinLu);
      ok("9.vuelve", (await p.getByText("La jornada está abierta en otra pestaña de este equipo").count()) === 0 && !(await bloqueada(p)), "Cerrada la segunda, «Usar acá» en la primera y se sigue trabajando");
    } else {
      ok("9.usar-aca", false, "No aparece «Usar acá» en la segunda pestaña");
      await otra.close();
    }
    // La otra cara de las solapas por puesto: la compu de recepción logueada en el ERP como RECEPTION (con esta jornada).
    const texto = await p.evaluate((k) => localStorage.getItem(k) ?? "", CLAVE);
    const ctxR = await navegador.newContext({ viewport: { width: 1366, height: 900 }, locale: "es-AR", timezoneId: "America/Argentina/Buenos_Aires" });
    await ctxR.clock.install({ time: new Date("2026-10-18T00:35:00-03:00") });
    await ctxR.route(ORIGEN, (rt) => rt.fulfill({ contentType: "text/html; charset=utf-8", body: html() }));
    await ctxR.addInitScript(([k, t]) => localStorage.getItem(k) || localStorage.setItem(k, t), [CLAVE, texto] as const);
    const r = await abrirClub(ctxR, "RECEPTION", "puesto-recepcion");
    await desbloquear(r, /^Lu/, g.pinLu);
    const deLu = await solapas(r);
    await cambiarDeUsuario(r, /^Majo/, "8484");
    const deMajo = await solapas(r);
    const seVeIgual = JSON.stringify(deLu) === JSON.stringify(deMajo) && !deMajo.includes("Configuración");
    if (!seVeIgual) ok("9.puesto-recepcion", true, `En el puesto de recepción, Majo ve sus solapas (${deMajo.join(", ")})`);
    else
      brecha(
        "duenio-en-el-puesto-de-recepcion",
        `En la compu de recepción (login RECEPTION), Majo entra con su PIN y sigue viendo sólo lo de recepción (${deMajo.join(", ")}): sin Tablero, Proveedores, Stock, Novedades ni Configuración (respaldo, usuarios, go-live) en esa compu`,
        "uat-torneo.e2e.mjs:302-333 (Majo entra en la misma compu y hace novedades, accesos, respaldo y cierre)",
        "ClubDemo.tsx:184 (`SOLAPAS` por el rol del login) · config-golive.tsx:50 (`almacen.rol() !== \"OWNER\"`)",
      );
    await ctxR.close();
  },

  // ═══ 10. Go-live: la limpieza con el respaldo descargado y elegido; lo maestro y los saldos quedan; los turnos futuros también ═══
  async (g) => {
    const p = g.p;
    await cambiarDeUsuario(p, /^Majo/, "8484");
    await irA(p, "Configuración");
    const golive = p.getByRole("region", { name: "Limpieza para el go-live" });
    const pendientes = await golive.innerText();
    ok("10.pendientes", /Antes de limpiar hay que resolver/.test(pendientes) && /juego|cancha/i.test(pendientes), `Antes de limpiar avisa lo pendiente («${pendientes.replace(/\s+/g, " ").match(/Antes de limpiar hay que resolver:.{0,90}/)?.[0] ?? ""}»)`);
    // Con cosas pendientes no corre (aunque se descargue y elija el respaldo).
    const intento = await limpiezaGoLive(p, "8484");
    ok("10.no-limpia", (await estado(p)).reservas.length > 0 && /resolver|pendiente|juego/i.test(intento), `Con cosas pendientes la limpieza no corre: dice qué resolver («${intento.slice(0, 90)}»)`);
    await golive.getByRole("button", { name: "Cancelar" }).click().catch(() => undefined);
    // Se resuelve: se cobra y se cierra la cancha de las 16:30.
    await irA(p, "Agenda");
    const cs = await abrirCuenta(p, String(g.sig));
    await medio(cs, "Efectivo");
    await cs.getByRole("button", { name: /^Cobrar todo/ }).click();
    await p.waitForTimeout(150);
    await cerrarLaCancha(cs);
    await volverALaAgenda(p);
    // Un turno para mañana que deja un adelanto (la mitad, por transferencia): tiene que quedar después de limpiar.
    // (En la jornada real, a quien llega sin ficha no se le pide seña: crearClubReal pone `senaSinCliente: false`.)
    await p.getByRole("group", { name: "Elegir el día de la agenda" }).getByRole("button", { name: /Mañana/ }).click();
    const bruno = await darTurno(p, { cancha: "c2", hora: 19 * 60, titular: "Grupo de Bruno", otros: [], ficha: false });
    g.bruno = bruno;
    const cb = await abrirCuenta(p, String(bruno));
    await medio(cb, "Transferencia");
    const sena = cb.getByRole("button", { name: /^Cobrar la seña/ });
    if (await sena.count()) await sena.click();
    else {
      await cb.getByLabel("Cobrar una parte (monto)").fill("21000");
      await cb.getByRole("button", { name: /^Cobrar \$\s?21\.000 de la cancha/ }).click();
    }
    await p.waitForTimeout(150);
    const adelanto = M.cobrado(M.reserva(await estado(p), String(bruno))!);
    await volverALaAgenda(p);
    // Las cajas que quedaron con lo cobrado después del cierre (la del 18/10): se cierran.
    await irA(p, "Caja");
    for (let i = 0; i < 3; i++) {
      const e = await estado(p);
      const sinCerrar = M.cajasConMovimientosSinCerrar(e);
      if (!sinCerrar.length) break;
      const form = p.getByRole("region", { name: "Cerrar la caja" }).or(p.locator("section").filter({ has: p.getByRole("alert") })).first();
      const esp = Number(((await form.getByText(/^Tendría que haber/).first().innerText()).match(/\$\s?([\d.]+)/)?.[1] ?? "0").replace(/\./g, ""));
      await form.getByLabel(/^Efectivo contado/).first().fill(String(esp));
      await form.getByLabel(/^PIN de|^Tu PIN/).first().fill("8484");
      await form.getByRole("button", { name: /^Cerrar (la|esa) caja/ }).first().click();
      await p.waitForTimeout(200);
    }
    const resuelto = await estado(p);
    ok("10.resuelto", M.pendientesGoLive(resuelto, { fecha: "2026-10-17", min: 1470 }).length === 0 && adelanto === 21000, `Cancha cobrada y cerrada, cajas cerradas, el turno de mañana con un adelanto de ${pesos(adelanto)}: nada pendiente`);
    // La limpieza: primero eligiendo OTRO archivo (el respaldo de la tarde): no limpia.
    await irA(p, "Configuración");
    const conOtro = await limpiezaGoLive(p, "8484", g.respaldo as string);
    ok("10.otro-archivo", (await estado(p)).cuentas.length > 0, `Eligiendo otro archivo (no el que acaba de bajar) no limpia («${conOtro.slice(0, 90)}»)`);
    await golive.getByRole("button", { name: "Cancelar" }).click().catch(() => undefined);
    const antesGL = await estado(p);
    const bajado: string[] = [];
    const resultado = await limpiezaGoLive(p, "8484", undefined, bajado);
    const gl = await estado(p);
    ok("10.respaldo", /breakpoint-.*\.json$/.test(bajado[0] ?? ""), `Antes de limpiar se descargó el respaldo y se eligió ese archivo (${bajado[0]})`);
    ok("10.limpio", gl.cuentas.length + gl.caja.movimientos.length + gl.caja.cierres.length + gl.pedidos.length === 0 && gl.reservas.every((r) => r.id === bruno), `Se borró lo de la prueba: ${antesGL.reservas.length} turnos, ${antesGL.cuentas.length} cuentas, ${antesGL.caja.movimientos.length} movimientos de caja («${resultado.slice(0, 80)}»)`);
    const juanGL = gl.clientes.find((c) => c.nombre === "Juan Pérez");
    const provGL = proveedores(gl).find((x) => x.nombre === "Distribuidora Sur");
    ok("10.maestro", gl.clientes.length === antesGL.clientes.length && gl.usuarios.length === antesGL.usuarios.length && gl.caja.fondo === 20000 && gl.productos.find((x) => x.id === "p2")?.stock === antesGL.productos.find((x) => x.id === "p2")?.stock && !!provGL, "Se conservó lo maestro: clientes, usuarios y PIN, fondo de caja, productos y stock, proveedores");
    ok("10.saldos", juanGL?.deuda === 3000 && !!provGL && M.deudaConProveedor(gl, provGL.id) === 20800, `Se conservaron los saldos: Juan debe ${pesos(juanGL?.deuda ?? 0)}, al proveedor le debemos ${pesos(provGL ? M.deudaConProveedor(gl, provGL.id) : 0)}`);
    const brunoGL = M.reserva(gl, String(bruno));
    ok("10.futuros", !!brunoGL && brunoGL.estado === "reservada" && M.cobrado(brunoGL) === adelanto, `El turno de mañana (Grupo de Bruno, 19:00) queda, con su adelanto (${pesos(brunoGL ? M.cobrado(brunoGL) : 0)})`);
    // Las copias que quedan en la compu (la de antes de limpiar, las de antes de restaurar): ¿se ven y se pueden borrar?
    const copias = await p.evaluate((k) => Object.keys(localStorage).filter((x) => x.startsWith(k) && x !== k), CLAVE);
    const seVen = /Copias viejas|Descargar y borrar/.test(await p.getByRole("region", { name: "Jornada" }).innerText());
    if (copias.length === 0 || seVen) ok("10.copias", true, `Copias en la compu: ${copias.length ? copias.join(", ") : "ninguna (la limpieza se hace con el respaldo descargado y elegido)"}`);
    else
      brecha(
        "copias-viejas",
        `Quedan copias en la compu (${copias.map((c) => c.slice(CLAVE.length)).join(", ")}) que no se ven ni se pueden «Descargar y borrar»: ocupan lugar de los 5.000 KB`,
        "app.mjs:157-167 y :931 (`Copias viejas en esta compu` · `borrarCopia`), uat-torneo.e2e.mjs:419-436",
        "config-jornada.tsx (sin la lista de copias)",
      );
    // Se recarga: vuelve bloqueado y en limpio, listo para el go-live.
    await p.close();
    g.p = await abrirClub(g.ctx, "OWNER");
    paginaParaVolcar = g.p;
    await bloqueo(g.p).getByRole("heading", { name: "Pantalla bloqueada" }).waitFor().catch(() => undefined);
    ok("10.vuelve", (await bloqueada(g.p)) && (await estado(g.p)).cuentas.length === 0, "Después de la limpieza el club vuelve bloqueado y en limpio, listo para el go-live");
    await foto(g.p, "go-live-bloqueado");
  },

  // ═══ 11. El celular (390 px) en los pasos clave, sin scroll de costado ═══
  async (g) => {
    const p = g.p;
    await p.setViewportSize({ width: 390, height: 844 });
    await p.waitForTimeout(200);
    const medidas: string[] = [];
    const medir = async (donde: string) => {
      const corre = await sinScrollDeCostado(p);
      medidas.push(`${donde} ${corre}`);
      return corre;
    };
    let peor = await medir("bloqueo");
    await foto(p, "390-bloqueo");
    await desbloquear(p, /^Lu/, g.pinLu);
    for (const s of ["Agenda", "Buffet", "Tienda", "Caja", "Clientes"]) {
      await irA(p, s);
      peor = Math.max(peor, await medir(s));
    }
    await irA(p, "Agenda");
    await p.getByRole("group", { name: "Elegir el día de la agenda" }).getByRole("button", { name: /Mañana/ }).click();
    await abrirCuenta(p, String(g.bruno));
    peor = Math.max(peor, await medir("cuenta del turno"));
    await foto(p, "390-cuenta-del-turno");
    await volverALaAgenda(p);
    await cambiarDeUsuario(p, /^Majo/, "8484");
    for (const s of ["Tablero", "Proveedores", "Stock", "Novedades y redes", "Configuración"]) {
      await irA(p, s);
      peor = Math.max(peor, await medir(s));
    }
    await foto(p, "390-configuracion");
    ok("11.390", peor <= 0, `Celular 390 px sin scroll de costado en bloqueo, recepción y dueño (${medidas.filter((m) => !m.endsWith(" 0")).join(", ") || "todo en 0"})`);
    // La consola de primera vez, en el celular, en otra compu.
    const c3 = await navegador.newContext({ viewport: { width: 390, height: 844 }, locale: "es-AR" });
    await c3.route(ORIGEN, (rt) => rt.fulfill({ contentType: "text/html; charset=utf-8", body: html() }));
    const q = await abrirClub(c3, "OWNER", "consola-390");
    const corre = await sinScrollDeCostado(q);
    ok("11.consola-390", (await q.getByRole("region", { name: "Configuración inicial del club" }).count()) === 1 && corre <= 0, `La consola de primera vez en 390 px, sin scroll de costado (${corre})`);
    await foto(q, "390-consola");
    await c3.close();
    await p.setViewportSize({ width: 1366, height: 900 });
  },
];

/** Configuración → «Limpieza para el go-live»: PIN, «Descargar el respaldo de antes de limpiar», elegir un archivo y «Ya lo guardé: limpiar». */
async function limpiezaGoLive(p: Page, pin: string, otroArchivo?: string, bajados?: string[]): Promise<string> {
  const golive = p.getByRole("region", { name: "Limpieza para el go-live" });
  const abrir = golive.getByRole("button", { name: "Hacer la limpieza para el go-live" });
  if (await abrir.count()) await abrir.click();
  const grupo = golive.getByRole("group");
  await grupo.getByLabel(/^PIN de|^Tu PIN/).fill(pin);
  const [d] = await Promise.all([p.waitForEvent("download"), grupo.getByRole("button", { name: /^Descargar (el respaldo de antes de limpiar|de nuevo)/ }).click()]);
  bajados?.push(d.suggestedFilename());
  await grupo.getByLabel("Respaldo descargado").setInputFiles(otroArchivo ?? (await d.path()) ?? "");
  await grupo.getByRole("button", { name: "Ya lo guardé: limpiar" }).click();
  await p.waitForTimeout(500);
  return `${(await golive.innerText()).replace(/\s+/g, " ").match(/(Antes de limpiar hay que resolver:[^.]*|[^.]*(archivo|respaldo)[^.]*\.)/)?.[0] ?? ""} | ${await ultimoAviso(p)}`;
}

/** La tarjeta de una cuenta abierta en Buffet → «Cuentas abiertas». */
const tarjetaDeCuenta = (p: Page, titular: string) => p.locator("article").filter({ has: p.getByRole("heading", { name: titular, exact: true }) }).first();

/** Después de cobrar todo: si la cancha sigue en juego, «Cerrar la cancha · la mesa sigue». */
async function cerrarLaCancha(c: Locator) {
  const b = c.getByRole("button", { name: /cerrarla · la mesa sigue|^Cerrar la cancha/ });
  if (await b.count()) await b.first().click();
  await c.page().waitForTimeout(200);
}

/** «Cambiar de usuario» (la barra de quien opera): elige a la persona y pone su PIN. */
async function cambiarDeUsuario(p: Page, quien: RegExp, pin: string) {
  await p.locator('[data-ui="operador-del-club"]').getByRole("button", { name: "Cambiar de usuario" }).click();
  const hoja = p.getByRole("dialog", { name: "¿Quién usa el sistema?" });
  await hoja.waitFor();
  await hoja.getByRole("button", { name: quien }).click();
  await hoja.getByLabel(/^PIN de/).fill(pin);
  await hoja.getByRole("button", { name: "Entrar" }).click();
  await hoja.waitFor({ state: "hidden" });
}

const TITULARES: [string, string][] = [
  ["Tomás Medina", "1155550001"],
  ["Camila Sosa", "1155550002"],
  ["Nico Herrera", "1155550003"],
  ["Juan Pérez", "1155550004"],
  ["Pablo Suárez", "1155550005"],
];
const GRUPOS = [
  { cancha: "c1", titular: "Tomás Medina", jug: ["Sofía Gómez", "Lucas Ríos", "Martín Paz"] },
  { cancha: "c2", titular: "Camila Sosa", jug: ["Valen Luna", "Fede Acosta", "Juli Vera"] },
  { cancha: "c3", titular: "Nico Herrera", jug: ["Agus Romero", "Mati Benítez", "Flor Díaz"] },
  { cancha: "c4", titular: "Juan Pérez", jug: ["Gonza Ortiz", "Mica Castro", "Diego Molina"] },
];

async function altaCliente(p: Page, nombre: string, tel: string) {
  await irA(p, "Clientes");
  await p.getByRole("button", { name: "+ Alta de cliente" }).click();
  const alta = p.getByRole("region", { name: "Alta de cliente" });
  await alta.getByLabel("Nombre y apellido").fill(nombre);
  await alta.getByLabel(/^Teléfono/).fill(tel);
  await alta.getByRole("button", { name: "Dar de alta" }).click();
  await avisoDelClub(p, `Listo: ${nombre} ya es cliente del club.`);
  const ficha = p.getByRole("region", { name: nombre, exact: true });
  if (await ficha.count()) await ficha.getByRole("button", { name: "Cerrar la ficha" }).click();
}

const telDe = (titular: string) => TITULARES.find(([n]) => n === titular)?.[1] ?? "";
const digitos = (tel: string | null | undefined) => (tel ?? "").replace(/\D/g, "");

/**
 * «+ Turno» en la agenda: cancha, hora (minutos), a nombre de (tocando su ficha, o con el teléfono «para darlo de alta»)
 * y los otros jugadores. Devuelve el id.
 */
async function darTurno(p: Page, d: { cancha: string; hora: number; titular: string; otros: string[]; ficha: boolean; tel?: string }): Promise<string | undefined> {
  await irA(p, "Agenda");
  await p.getByRole("button", { name: "+ Turno", exact: true }).click();
  const alta = p.getByRole("region", { name: "Dar un turno" });
  await alta.getByLabel("Cancha", { exact: true }).selectOption(d.cancha);
  await alta.getByLabel("Cuánto juegan").selectOption("90");
  await alta.getByLabel("Hora", { exact: true }).selectOption(String(d.hora));
  await alta.getByLabel("A nombre de").fill(d.titular);
  if (d.ficha) await alta.getByRole("list", { name: "Fichas que coinciden" }).getByRole("button", { name: new RegExp(`^${d.titular}`) }).click();
  else if (d.tel) await alta.getByLabel(/^Teléfono \(para darlo de alta/).fill(d.tel);
  await alta.getByLabel(/^Los otros jugadores/).fill(d.otros.join(", "));
  await alta.getByRole("button", { name: "Reservar el turno" }).click();
  await p.getByRole("heading", { name: "Turno reservado" }).waitFor();
  await p.getByRole("button", { name: "Listo", exact: true }).click();
  const e = await estado(p);
  return e.reservas.find((r) => r.titular === d.titular && r.canchaId === d.cancha && r.inicio === d.hora && r.estado === "reservada")?.id;
}

/** Abre la cuenta del turno desde la agenda (tocando su bloque) y devuelve la sección de la cuenta. */
async function abrirCuenta(p: Page, reservaId: string): Promise<Locator> {
  const sobre = p.locator("section").filter({ has: p.getByText("Cuenta del turno", { exact: true }) });
  if (!(await p.getByRole("tab", { name: "Agenda", selected: true }).count())) await irA(p, "Agenda");
  await p.locator(`[id="turno-${reservaId}"]`).click();
  await sobre.first().waitFor();
  return sobre.first();
}

async function volverALaAgenda(p: Page) {
  const volver = p.getByRole("button", { name: "Volver a la agenda" });
  if (await volver.count()) await volver.first().click();
}

async function medio(donde: Locator, etiqueta: string) {
  await donde.locator("label").filter({ hasText: new RegExp(`^${etiqueta.replace(/[()/]/g, "\\$&")}`) }).first().click();
}

/** «Sumar un cargo del buffet» en la cuenta del turno: a qué jugador, cuántos y qué producto (a su cuenta). */
async function cargar(c: Locator, jugador: number, buscar: string, producto: string, cant: number) {
  await c.getByLabel("Para quién").selectOption(String(jugador));
  await c.getByLabel("Cantidad").fill(String(cant));
  await c.getByLabel("Código o producto (pasá el lector o escribí)").fill(buscar);
  await c.getByRole("list", { name: "Productos para cargar" }).getByRole("button", { name: new RegExp(`^${cant} × ${producto.replace(/[()]/g, "\\$&")}`) }).click();
  await c.page().waitForTimeout(120);
}

void principal();
