// ============================================================================
// LA PLANILLA DEL DÍA en un navegador de verdad (CH Tanda 2 · 2-C).
// ============================================================================
//
// La mesa (MesaDeTurnos) con la planilla (PorProfesional) REALES —la misma composición que monta
// CalendarGrid en la PC y LibroDelDia en «Por profesional»— armadas con esbuild y montadas en el
// Chromium de Playwright, con el CSS real (globals + piel «Renglón») y las Server Actions
// reemplazadas por dobles que anotan lo que se mandó. Clic por clic:
//   · CH-030: tocar un bloque abre el cajón sin mover la grilla; raya «Ahora 11:42»; leyenda con 5
//     marcas (forma + palabra, «No vino» incluido); los chips filtran sin recargar.
//   · CH-029: el hueco «jue 14:00 · Lu» lleva a Dar turno con Lu, el jueves y las 14:00.
//   · «Ver por: Box».
//   · CH-025: arrastrar el turno de Laura (Caro 16:00) a las 17:30 de Lu → «¿Mover a …?» → [Mover y
//     avisar por WhatsApp] manda el MISMO turno con la profesional y la hora nuevas y abre WhatsApp
//     con «Te pasamos el turno de *Piernas completas* al *jueves 24 a las 17:30* con Lu» (mensajeMover); soltarlo donde choca no abre nada y se lee
//     por qué; el servidor que rechaza deja leer su motivo.
//   · «Mover» desde el cajón: chips de días con huecos → hora → [Mover sin avisar].
//   · Integración Tanda 2: el cajón cabe entero en 1024/1280/1440; el hover no pisa el chip prendido;
//     `?turno=…&hoja=terminar` abre la hoja de cobro (CH-019); «Llegó la seña» y «seña pedida» en el
//     cajón (CH-021/022); [Deshacer] después de cancelar (CH-026).
// Sin Chromium o sin esbuild, se saltea con el motivo. Con PLANILLA_FOTOS=<carpeta> deja capturas.

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser, Page } from "playwright";
import type { TurnoDelDia } from "../agenda-core";

const RAIZ = fileURLToPath(new URL("../../../../../../", import.meta.url));
const ORIGEN = "http://localhost:3998/admin/turnos";
const FOTOS = process.env.PLANILLA_FOTOS ?? "";

const DIA = "2030-10-24"; // jueves
const iso = (hhmm: string, dia = DIA) => new Date(`${dia}T${hhmm}:00-03:00`).toISOString();
const AHORA = iso("11:42");

const ACCIONES_FALSAS = `
const anotar = (accion, fd) => { (window.__enviado ??= []).push({ accion, ...Object.fromEntries(fd.entries()) }); };
export async function rescheduleAppointment(fd) {
  anotar("mover", fd);
  return window.__rechazo ? { ok: false, error: window.__rechazo } : { ok: true };
}
export async function completeAppointment(fd) { anotar("terminar", fd); return { ok: true }; }
export async function confirmarTurno(fd) { anotar("confirmar", fd); return { ok: true }; }
export async function cancelAppointment(fd) { anotar("cancelar", fd); return { ok: true }; }
export async function cerrarTurnoSinPrestar(fd) { anotar("sin-prestar", fd); return { ok: true }; }
export async function markNoShow(fd) { anotar("no-vino", fd); return { ok: true }; }
export async function registrarCobroTurno(fd) { anotar("cobrar", fd); return { ok: true }; }
export async function anularCobroTurno(fd) { anotar("anular", fd); return { ok: true }; }
export async function condonarSaldoTurno(fd) { anotar("condonar", fd); return { ok: true }; }`;
const MOVER_FALSO = `
export async function huecosParaMover(turnoId, dias, profesionalId) {
  (window.__consultas ??= []).push({ turnoId, dias, profesionalId });
  const todos = window.__huecos;
  const profesionales = [{ id: "caro", nombre: "Caro", box: "Box 1" }, { id: "lu", nombre: "Lu", box: "Box 3" }];
  const huecos = {};
  for (const p of profesionales) if (!profesionalId || p.id === profesionalId) {
    huecos[p.id] = {};
    for (const d of dias) huecos[p.id][d] = (todos[p.id] && todos[p.id][d]) || [];
  }
  return { ok: true, servicio: "Piernas completas", profesionales, huecos };
}`;
// Las acciones de plata de 2-B y la marca de seña de 2-A: la hoja de cobro y el cajón las importan.
const COBRO_FALSO = `
const anotar = (accion, fd) => { (window.__enviado ??= []).push({ accion, ...Object.fromEntries(fd.entries()) }); };
export async function terminarYCobrarDividido(fd) { anotar("dividir", fd); return { ok: true }; }
export async function cobrarSeniaYConfirmar(fd) { anotar("senia", fd); return { ok: true, cobroId: "cobro-1", monto: Number(fd.get("monto")) || 0, confirmo: true }; }
export async function cobrarVariosTurnos(fd) { anotar("cobrar-varios", fd); return { ok: true }; }
export async function deudaViejaDelTurno() { return []; }
export async function deshacerCierre(fd) { anotar("deshacer", fd); return { ok: true }; }`;
const SENIA_FALSA = `
export async function marcarSeniaPedida(fd) { (window.__enviado ??= []).push({ accion: "senia-pedida", ...Object.fromEntries(fd.entries()) }); return { ok: true }; }
export async function seniasPedidas() { return {}; }`;
const NAVEGACION_FALSA = `
import { useSyncExternalStore } from "react";
const avisos = new Set();
const avisar = () => avisos.forEach((f) => f());
for (const k of ["pushState", "replaceState"]) {
  const original = history[k].bind(history);
  history[k] = (...a) => { original(...a); avisar(); };
}
addEventListener("popstate", avisar);
const suscribir = (f) => { avisos.add(f); return () => avisos.delete(f); };
export function useSearchParams() { return new URLSearchParams(useSyncExternalStore(suscribir, () => location.search)); }
export function usePathname() { return location.pathname; }
export function useRouter() { return { refresh() {}, push() {}, replace() {} }; }`;
const LINK_FALSO = `
import { createElement } from "react";
export default function Link({ href, prefetch, ...resto }) { return createElement("a", { href: String(href), ...resto }); }`;

const ENTRADA = `
import { createElement as h } from "react";
import { createRoot } from "react-dom/client";
import ToastProvider from "@/app/admin/(dashboard)/ToastProvider";
import MesaDeTurnos from "@/app/admin/(dashboard)/turnos/_agenda/MesaDeTurnos";
import PorProfesional from "@/app/admin/(dashboard)/turnos/_agenda/PorProfesional";
window.__montar = (p) =>
  createRoot(document.getElementById("root")).render(
    h(ToastProvider, null,
      h(MesaDeTurnos, { turnos: p.turnos, permisos: p.permisos, ahora: p.ahora, hrefFicha: null },
        h(PorProfesional, { turnos: p.turnos, profesionales: p.profesionales, ahora: p.ahora, dia: p.dia, bloqueos: p.bloqueos }))));
`;

function turno(id: string, clienta: string, profesionalId: string, desde: string, hasta: string, estado: TurnoDelDia["estado"] = "PENDING"): TurnoDelDia {
  const prof = { caro: ["Caro", "Box 1"], vero: ["Vero", "Box 2"], lu: ["Lu", "Box 3"] }[profesionalId]!;
  return {
    id,
    clienteId: `c-${id}`,
    inicio: iso(desde),
    fin: iso(hasta),
    estado,
    clienta,
    telefono: "11 5566-7788",
    servicio: "Piernas completas",
    profesional: prof[0],
    profesionalId,
    servicioId: "piernas",
    box: prof[1],
    notas: null,
    precio: 14000,
    cobrado: 0,
    condonado: 0,
    saldo: 14000,
    senia: 0,
    sugerido: { tipo: "saldo", monto: 14000 },
    cuentaACobrar: false,
    cobros: [],
    avisadaEl: null,
    veredicto: { ok: true },
  };
}

const TURNOS = [
  turno("sofia", "Sofía Pérez", "caro", "09:00", "10:10", "COMPLETED"),
  turno("ana", "Ana Paz", "caro", "12:00", "12:15"),
  turno("laura", "Laura Gómez", "caro", "16:00", "17:00"),
  turno("martina", "Martina Ruiz", "vero", "10:30", "11:30", "CONFIRMED"),
  turno("carla", "Carla M.", "lu", "18:00", "18:45", "CONFIRMED"),
  turno("julia", "Julia R.", "vero", "09:00", "09:30", "NO_SHOW"),
];
const MONTAJE = {
  turnos: TURNOS,
  permisos: { gestionar: true, cobrar: true, terminar: true, perdonar: false },
  ahora: AHORA,
  dia: DIA,
  profesionales: [
    { id: "caro", nombre: "Caro", box: "Box 1" },
    { id: "vero", nombre: "Vero", box: "Box 2" },
    { id: "lu", nombre: "Lu", box: "Box 3" },
  ],
  bloqueos: [{ profesionalId: "vero", desde: iso("15:00"), hasta: iso("17:00"), motivo: "médico" }],
};
// Los huecos que «contesta el servidor» para mover a Laura (60′): Lu a las 17:00 y 17:30 sí; 18:00 no (Carla).
const HUECOS = { lu: { [DIA]: [iso("14:00"), iso("17:00"), iso("17:30"), iso("19:00")] }, caro: { [DIA]: [iso("13:00"), iso("16:00")], "2030-10-25": [iso("10:00", "2030-10-25")] } };

type Ventana = {
  __montar: (p: unknown) => void;
  __enviado?: Record<string, string>[];
  __huecos: unknown;
  __rechazo?: string;
  __abiertas: { url: string; cerrada: boolean; location: { href: string } }[];
  __cargada: number;
};

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
    const app = (await postcss([tailwind({ base: RAIZ })]).process(readFileSync(archivo, "utf8"), { from: archivo })).css;
    return app + readFileSync(join(RAIZ, "public", "diseno", "renglon.css"), "utf8");
  } catch {
    return "";
  }
}

describe("La planilla del día en el navegador", { timeout: 240_000 }, () => {
  let browser: Browser | null = null;
  let bundle = "";
  let css = "";
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
    const falsos: Record<string, string> = {
      "@/lib/actions": ACCIONES_FALSAS,
      "@/lib/turnos/mover-actions": MOVER_FALSO,
      "@/lib/turnos/cobro-actions": COBRO_FALSO,
      "@/lib/turnos/senia-actions": SENIA_FALSA,
      "next/navigation": NAVEGACION_FALSA,
      "next/link": LINK_FALSO,
    };
    const r = await esbuild.build({
      stdin: { contents: ENTRADA, loader: "tsx", resolveDir: RAIZ },
      bundle: true,
      write: false,
      format: "iife",
      jsx: "automatic",
      tsconfig: join(RAIZ, "tsconfig.json"),
      define: { "process.env.NODE_ENV": '"production"' },
      loader: { ".css": "empty" },
      logLevel: "silent",
      plugins: [
        {
          name: "falsos",
          setup(b) {
            b.onResolve({ filter: /^(@\/lib\/actions|@\/lib\/turnos\/(mover|cobro|senia)-actions|next\/navigation|next\/link)$/ }, (a) => ({ path: a.path, namespace: "falso" }));
            b.onLoad({ filter: /.*/, namespace: "falso" }, (a) => ({ contents: falsos[a.path], loader: "js", resolveDir: RAIZ }));
          },
        },
      ],
    });
    bundle = r.outputFiles[0].text;
    css = await cssDeLaApp();
    browser = await playwright.chromium.launch({ executablePath: chrome });
  });

  after(async () => {
    await browser?.close();
  });

  async function montar(ancho = 1280, opciones: { query?: string; turnos?: TurnoDelDia[] } = {}): Promise<{ page: Page; errores: string[] }> {
    const contexto = await browser!.newContext({ viewport: { width: ancho, height: 1000 }, locale: "es-AR", timezoneId: "America/Argentina/Buenos_Aires" });
    const html = `<!doctype html><html lang="es"><head><style>${css}</style></head><body><div data-skin="fable" data-estetica="beauty-spa" data-theme="light"><div id="root" data-diseno="renglon" data-theme="light" class="min-h-dvh bg-surface p-4"></div></div></body></html>`;
    await contexto.route(/localhost:3998/, (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body: html }));
    const page = await contexto.newPage();
    const errores: string[] = [];
    page.on("pageerror", (e) => errores.push(e.message));
    await page.goto(ORIGEN + (opciones.query ?? ""));
    await page.evaluate((h) => {
      const w = window as unknown as Ventana;
      w.__huecos = h;
      w.__cargada = Date.now();
      w.__abiertas = [];
      // La ventana de WhatsApp: se anota a dónde termina yendo (o si se cerró).
      window.open = (() => {
        const v = { url: "", cerrada: false, opener: window, location: { href: "" }, close() { v.cerrada = true; } };
        w.__abiertas.push(v);
        return v;
      }) as unknown as typeof window.open;
    }, HUECOS);
    await page.addScriptTag({ content: bundle });
    await page.evaluate((m) => (window as unknown as Ventana).__montar(m), { ...MONTAJE, turnos: opciones.turnos ?? MONTAJE.turnos });
    await page.getByRole("region", { name: "La agenda por profesional" }).waitFor();
    return { page, errores };
  }

  const foto = async (page: Page, nombre: string) => {
    if (!FOTOS) return;
    // La foto con lo que flota YA quieto: la entrada del cajón dura 320 ms y una captura a mitad de
    // camino lo muestra cortado por el borde derecho (la «captura del cajón cortado» de 2-C).
    await quieto(page);
    mkdirSync(FOTOS, { recursive: true });
    await page.screenshot({ path: join(FOTOS, `${nombre}.png`), fullPage: true });
  };

  test("CH-030 · tocar un bloque abre el cajón sin mover la grilla; raya de ahora; leyenda; chips sin recargar", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar();
    const grilla = page.getByRole("region", { name: "La agenda por profesional" });
    const antes = await grilla.boundingBox();
    await page.getByRole("button", { name: /16:00, Laura Gómez.*abrir el turno/ }).click();
    const cajon = page.getByRole("dialog", { name: /Laura Gómez/ });
    await cajon.waitFor();
    assert.ok(await cajon.isVisible());
    assert.equal(new URL(page.url()).searchParams.get("turno"), "laura");
    assert.deepEqual(await grilla.boundingBox(), antes, "la grilla no se movió");
    await foto(page, "cajon-en-la-grilla");
    await page.keyboard.press("Escape");
    await cajon.waitFor({ state: "hidden" });

    assert.ok(await page.getByRole("separator", { name: "Ahora, 11:42" }).count(), "la raya de ahora");
    const leyenda = await page.getByRole("list", { name: "Qué quiere decir cada marca" }).locator("li").allInnerTexts();
    assert.equal(leyenda.length, 5);
    assert.ok(leyenda.some((x) => /No vino/.test(x)));
    assert.equal(await page.getByRole("list", { name: "Qué quiere decir cada marca" }).locator("svg[data-parte=forma]").count(), 5, "cada estado con su forma");

    const cargada = await page.evaluate(() => (window as unknown as Ventana).__cargada);
    await page.getByRole("button", { name: /^Sin confirmar/ }).click();
    assert.equal(new URL(page.url()).searchParams.get("ver"), "sin-confirmar");
    assert.equal(await page.evaluate(() => (window as unknown as Ventana).__cargada), cargada, "no recargó");
    assert.equal(await page.locator("[data-atenuado]").count(), 4, "Sofía, Martina, Carla y Julia no son «sin confirmar»");
    assert.equal(await page.getByRole("button", { name: /Ana Paz/ }).getAttribute("data-atenuado"), null);
    assert.deepEqual(errores, []);
  });

  test("el cajón cabe entero en la PC (1024, 1280 y 1440 px): nada se corta por el borde derecho", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    for (const ancho of [1024, 1280, 1440]) {
      const { page } = await montar(ancho);
      await page.getByRole("button", { name: /16:00, Laura Gómez.*abrir el turno/ }).click();
      const cajon = page.getByRole("dialog", { name: /Laura Gómez/ });
      await cajon.waitFor();
      await quieto(page);
      const medida = await page.evaluate(() => {
        const d = document.querySelector('dialog[data-ui="cajon"][open]')!;
        const r = d.getBoundingClientRect();
        const salidos = [...d.querySelectorAll<HTMLElement>("button, a, input, h2, p")]
          .filter((e) => e.offsetParent !== null)
          .filter((e) => e.getBoundingClientRect().right > window.innerWidth + 0.5 || e.getBoundingClientRect().left < -0.5)
          .map((e) => e.innerText.slice(0, 30));
        return { izquierda: r.left, derecha: r.right, ancho: window.innerWidth, salidos };
      });
      assert.ok(medida.izquierda >= 0 && medida.derecha <= medida.ancho + 0.5, `${ancho}: el cajón va de ${medida.izquierda} a ${medida.derecha}`);
      assert.deepEqual(medida.salidos, [], `${ancho}: se cortan ${medida.salidos.join(", ")}`);
      assert.ok(await cajon.getByRole("button", { name: "Confirmar el turno" }).isVisible());
      await foto(page, `cajon-${ancho}`);
      await page.context().close();
    }
  });

  test("el chip prendido se sigue leyendo con el mouse encima (el hover no lo pisa)", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page } = await montar();
    const todos = page.getByRole("button", { name: /^Todos/ });
    assert.equal(await todos.getAttribute("aria-pressed"), "true");
    const fondo = () => todos.evaluate((e) => getComputedStyle(e).backgroundColor);
    const quieto = await fondo();
    await todos.hover();
    assert.equal(await fondo(), quieto, "prendido, con el mouse encima, sigue igual");
    // Uno apagado sí cambia con el hover.
    const otro = page.getByRole("button", { name: /^Sin confirmar/ });
    const antes = await otro.evaluate((e) => getComputedStyle(e).backgroundColor);
    await otro.hover();
    assert.notEqual(await otro.evaluate((e) => getComputedStyle(e).backgroundColor), antes);
  });

  test("CH-019 · ?turno=…&hoja=terminar abre el turno directo en la hoja de cobro, una sola vez", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar(1280, { query: "?turno=martina&hoja=terminar" });
    const hoja = page.getByRole("dialog", { name: /Cobrar · Martina Ruiz/ });
    await hoja.waitFor();
    assert.ok(await hoja.getByRole("button", { name: /Efectivo/ }).first().isVisible(), "los medios, a un toque");
    assert.equal(await page.locator('dialog[data-ui="cajon"][open]').count(), 0, "sin el cajón del mismo turno debajo");
    await foto(page, "hoja-de-cobro-atender-ahora");
    await page.keyboard.press("Escape");
    await hoja.waitFor({ state: "hidden" });
    assert.equal(new URL(page.url()).searchParams.get("hoja"), null, "la hoja sale de la URL al cerrarse");
    assert.equal(new URL(page.url()).searchParams.get("turno"), null);
    assert.equal(await page.getByRole("dialog", { name: /Cobrar · Martina Ruiz/ }).count(), 0);
    assert.deepEqual(errores, []);
  });

  test("CH-021 · CH-022 · el Reservado con seña: «seña pedida», «Llegó la seña» (cobra y confirma) con Deshacer, y pedirla por WhatsApp", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const paula = {
      ...turno("paula", "Paula Ríos", "lu", "14:00", "15:00"),
      senia: 5000,
      sugerido: { tipo: "senia" as const, monto: 5000 },
      seniaPedidaEl: iso("10:03"),
    };
    const { page, errores } = await montar(1280, { turnos: [...TURNOS, paula] });
    const bloque = page.getByRole("button", { name: /14:00, Paula Ríos.*seña pedida 10:03.*abrir el turno/ });
    assert.match(await bloque.innerText(), /seña pedida/);
    await bloque.click();
    const cajon = page.getByRole("dialog", { name: /Paula Ríos/ });
    await cajon.waitFor();
    assert.match(await cajon.innerText(), /seña pedida 10:03/);
    // Pedirla otra vez: el enlace lleva el pedido armado y deja la marca (sin salir de la página).
    const pedir = cajon.getByRole("link", { name: /Recordarle la seña por WhatsApp/ });
    const wa = new URL((await pedir.getAttribute("href"))!);
    assert.equal(wa.origin, "https://wa.me");
    assert.match(wa.searchParams.get("text") ?? "", /seña de \$5\.000/);
    await pedir.evaluate((a) => a.addEventListener("click", (e) => e.preventDefault()));
    await pedir.click();
    await page.waitForFunction(() => ((window as unknown as Ventana).__enviado ?? []).some((x) => x.accion === "senia-pedida"));
    // «Confirmar sin seña» queda al costado, no compite.
    assert.ok(await cajon.getByRole("button", { name: "Confirmar sin seña" }).isVisible());
    await foto(page, "cajon-llego-la-senia");
    // Comprobante informado ≠ cobrado: la ayuda dice cuándo se toca.
    assert.match(await cajon.innerText(), /Tocalo cuando la veas en el banco o en Mercado Pago, no por la captura/);
    await cajon.getByRole("button", { name: /Llegó la seña \$\s?5\.000/ }).click();
    await cajon.getByRole("button", { name: "Deshacer" }).click();
    const enviado = await page.evaluate(() => (window as unknown as Ventana).__enviado ?? []);
    const senia = enviado.find((x) => x.accion === "senia")!;
    assert.deepEqual([senia.appointmentId, senia.method, Number(senia.amount)], ["paula", "TRANSFERENCIA", 5000]);
    await page.waitForFunction(() => ((window as unknown as Ventana).__enviado ?? []).some((x) => x.accion === "deshacer"));
    const deshacer = (await page.evaluate(() => (window as unknown as Ventana).__enviado ?? [])).find((x) => x.accion === "deshacer")!;
    assert.deepEqual([deshacer.appointmentId, deshacer.que, deshacer.cobroId], ["paula", "senia", "cobro-1"]);
    assert.deepEqual(errores, []);
  });

  test("CH-026 · después de cancelar queda [Deshacer]: el turno vuelve a Reservado", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar();
    await page.getByRole("button", { name: /16:00, Laura Gómez.*abrir el turno/ }).click();
    const cajon = page.getByRole("dialog", { name: /Laura Gómez/ });
    await cajon.getByRole("button", { name: "Cancelar el turno" }).click();
    const hoja = page.getByRole("dialog", { name: "Cancelar el turno · Laura Gómez" });
    await hoja.getByRole("button", { name: "Sí, cancelar el turno" }).click();
    await hoja.waitFor({ state: "hidden" });
    const deshacer = page.getByRole("button", { name: "Deshacer" });
    await deshacer.waitFor();
    // Un solo cartel: el de la mesa, con [Deshacer] (no el de la hoja encimado).
    assert.equal(await page.getByText(/Cancelado: Laura Gómez/).count(), 1);
    await foto(page, "deshacer-cancelacion");
    await deshacer.click();
    await page.waitForFunction(() => ((window as unknown as Ventana).__enviado ?? []).some((x) => x.accion === "deshacer"));
    const enviado = await page.evaluate(() => (window as unknown as Ventana).__enviado ?? []);
    assert.equal(enviado[0].accion, "cancelar");
    assert.deepEqual(
      enviado.filter((x) => x.accion === "deshacer").map((x) => [x.appointmentId, x.que]),
      [["laura", "cancelacion"]],
    );
    assert.deepEqual(errores, []);
  });

  test("CH-029 · el hueco «jue 14:00 · Lu» abre Dar turno con Lu, el jueves y las 14:00; lo bloqueado y lo pasado no", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page } = await montar();
    const hueco = page.getByRole("link", { name: "Dar un turno a las 14:00 con Lu" });
    const href = await hueco.getAttribute("href");
    const u = new URL(href!, ORIGEN);
    assert.equal(u.pathname, "/admin/turnos/lista");
    assert.deepEqual(
      [u.searchParams.get("nuevo"), u.searchParams.get("fecha"), u.searchParams.get("profesional"), u.searchParams.get("hora")],
      ["1", DIA, "lu", "14:00"],
    );
    assert.equal(await page.getByRole("link", { name: "Dar un turno a las 15:30 con Vero" }).count(), 0, "Vero está en el médico");
    assert.equal(await page.getByRole("link", { name: "Dar un turno a las 11:00 con Lu" }).count(), 0, "las 11:00 ya pasaron");
    assert.equal(await page.getByRole("link", { name: "Dar un turno a las 16:00 con Caro" }).count(), 0, "Laura ocupa las 16:00");
    // Con el teclado se llega y se ve el «+ hora».
    await hueco.focus();
    assert.match(await hueco.innerText(), /\+ 14:00/);
  });

  test("Ver por box: una columna por box, y el hueco va con quien atiende en él", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page } = await montar();
    await page.getByRole("radio", { name: "Por box" }).click();
    await page.getByRole("region", { name: "La agenda por box" }).waitFor();
    assert.equal(new URL(page.url()).searchParams.get("por"), "box");
    assert.ok(await page.getByRole("link", { name: "Dar un turno a las 14:00 con Lu" }).count());
    const encabezados = await page.locator("[role=region] .grid > div.flex-col span.font-semibold").allInnerTexts();
    assert.deepEqual(encabezados.slice(0, 3), ["Box 1", "Box 2", "Box 3"]);
  });

  test("CH-025 · arrastrar a las 17:30 de Lu → Mover y avisar: el mismo turno y WhatsApp con el texto", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar();
    await arrastrar(page, "Laura Gómez", "lu", 17 * 60 + 30);
    const hoja = page.getByRole("dialog", { name: "¿Mover a jue 24 17:30 con Lu?" });
    await hoja.waitFor();
    await foto(page, "mover-al-soltar");
    await hoja.getByRole("button", { name: "Mover y avisar por WhatsApp" }).click();
    await hoja.waitFor({ state: "hidden" });
    const enviado = await page.evaluate(() => (window as unknown as Ventana).__enviado ?? []);
    assert.deepEqual(enviado, [{ accion: "mover", appointmentId: "laura", startsAt: iso("17:30"), professionalId: "lu" }]);
    const [ventana] = await page.evaluate(() => (window as unknown as Ventana).__abiertas);
    assert.equal(ventana.cerrada, false);
    const wa = new URL(ventana.location.href);
    assert.equal(wa.origin, "https://wa.me");
    assert.equal(wa.pathname, "/5491155667788");
    assert.match(wa.searchParams.get("text") ?? "", /Te pasamos el turno de \*Piernas completas\* al \*jueves 24 a las 17:30\* con Lu \(era el jueves 24 a las 16:00\)/);
    assert.doesNotMatch(wa.searchParams.get("text") ?? "", /undefined|null|NaN/);
    assert.deepEqual(errores, []);
  });

  test("CH-025 · soltar donde choca no mueve y se lee por qué; si el servidor rechaza, también", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page } = await montar();
    await arrastrar(page, "Laura Gómez", "lu", 18 * 60);
    const alerta = page.getByRole("alert").filter({ hasText: "No se movió Laura Gómez" });
    await alerta.waitFor();
    assert.match(await alerta.innerText(), /A las 18:00 Lu no tiene lugar para Piernas completas/);
    assert.equal(await page.getByRole("dialog").filter({ hasText: "¿Mover a" }).count(), 0);
    assert.deepEqual(await page.evaluate(() => (window as unknown as Ventana).__enviado ?? []), []);

    // El servidor dice que no (otra recepcionista ocupó el hueco recién): el motivo se lee y la ventana se cierra.
    await page.evaluate(() => ((window as unknown as Ventana).__rechazo = "Ese horario ya no está disponible para este profesional. Elegí otro horario."));
    await arrastrar(page, "Laura Gómez", "lu", 17 * 60);
    const hoja = page.getByRole("dialog", { name: "¿Mover a jue 24 17:00 con Lu?" });
    await hoja.waitFor();
    await hoja.getByRole("button", { name: "Mover y avisar por WhatsApp" }).click();
    await hoja.getByRole("alert").waitFor();
    assert.match(await hoja.getByRole("alert").innerText(), /Ese horario ya no está disponible.*El turno quedó donde estaba/);
    const [ventana] = await page.evaluate(() => (window as unknown as Ventana).__abiertas);
    assert.equal(ventana.cerrada, true, "la ventana de WhatsApp se cierra si no se movió");
  });

  test("Mover desde el cajón: días con huecos, una hora y «Mover sin avisar»", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page } = await montar();
    await page.getByRole("button", { name: /16:00, Laura Gómez.*abrir el turno/ }).click();
    const cajon = page.getByRole("dialog", { name: /Laura Gómez/ });
    await cajon.getByRole("button", { name: "Mover", exact: true }).click();
    const grupo = cajon.getByRole("group", { name: "Mover el turno" });
    await grupo.getByRole("group", { name: "Horarios libres" }).getByRole("button", { name: "13:00" }).click();
    const consultas = await page.evaluate(() => (window as unknown as { __consultas: unknown[] }).__consultas);
    assert.deepEqual(consultas[0], { turnoId: "laura", dias: ["2030-10-24", "2030-10-25", "2030-10-26", "2030-10-27", "2030-10-28", "2030-10-29", "2030-10-30"], profesionalId: "caro" });
    assert.match(await grupo.getByRole("group", { name: "Qué día" }).innerText(), /vie 25\s*1/);
    await foto(page, "mover-desde-el-cajon");
    await grupo.getByRole("button", { name: "Mover sin avisar" }).click();
    await grupo.waitFor({ state: "hidden" });
    const enviado = await page.evaluate(() => (window as unknown as Ventana).__enviado ?? []);
    assert.deepEqual(enviado, [{ accion: "mover", appointmentId: "laura", startsAt: iso("13:00"), professionalId: "caro" }]);
    assert.deepEqual(await page.evaluate(() => (window as unknown as Ventana).__abiertas), [], "sin avisar no abre WhatsApp");
  });

  test("celular (390 px): la página no se corre de costado y los huecos miden 44 px de alto", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page } = await montar(390);
    await foto(page, "planilla-390");
    const ancho = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(ancho <= 390, `la página mide ${ancho} px`);
    const alto = (await page.getByRole("link", { name: "Dar un turno a las 14:00 con Lu" }).boundingBox())!.height;
    assert.ok(alto >= 43.5, `el hueco mide ${alto} px`);
  });
});

/** Apretar sobre el bloque de `clienta` y soltarlo en la celda (columna, minuto), en pasos (pointer events reales). */
async function arrastrar(page: Page, clienta: string, columna: string, minuto: number) {
  const bloque = page.getByRole("button", { name: new RegExp(`${clienta}.*abrir el turno`) });
  const b = (await bloque.boundingBox())!;
  const destino = (await page.locator(`[data-celda][data-columna="${columna}"][data-minuto="${minuto}"]`).boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + 10);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 10, b.y + 20, { steps: 3 });
  // Espera a que «el servidor» conteste los huecos antes de soltar.
  await page.waitForFunction(() => ((window as unknown as { __consultas?: unknown[] }).__consultas ?? []).length > 0);
  await page.mouse.move(destino.x + destino.width / 2, destino.y + 6, { steps: 8 });
  await page.waitForTimeout(50);
  await page.mouse.up();
}

/** Espera a que lo que flota (cajón, hojas) termine de entrar: sin `translate` ni opacidad a medias. */
async function quieto(page: Page) {
  await page.waitForFunction(() =>
    [...document.querySelectorAll("dialog")].every((d) => {
      const cs = getComputedStyle(d);
      // Cerrado: ya no se dibuja (la salida terminó). Abierto: sin corrimiento ni transparencia.
      if (!d.open) return cs.display === "none";
      return (cs.translate === "none" || cs.translate === "0px") && cs.opacity === "1";
    }),
  );
}
