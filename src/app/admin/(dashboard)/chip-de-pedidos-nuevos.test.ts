// ============================================================================
// CHIP DE PEDIDOS NUEVOS EN LA CABECERA (reingeniería Magra 1I · E30 · MG-054)
// ============================================================================
//
// Tres capas:
//   · lo PURO (pedidos-core.ts): el texto del chip, el nombre para el lector, cuándo suena y qué anuncia;
//   · la FORMA de lo que no se puede correr sin la app: la lectura es UN endpoint de sólo lectura con
//     orders:read y el tenant de la sesión, y el layout monta el chip sólo con el mostrador boutique
//     prendido y para quien puede ver pedidos (CH no cambia: armazon-ch.test.ts compara su HTML);
//   · el componente REAL (ChipDePedidosNuevos.tsx) en Chromium, con la consulta reemplazada por un
//     doble y el reloj de Playwright: pregunta al montar y cada 45 s, nunca con la pestaña escondida,
//     al volver pregunta enseguida, suena y anuncia sólo lo que entró, el toque abre el más viejo y el
//     sonido se apaga por persona.

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser, Page } from "playwright";
import {
  CRITERIO_PEDIDO_NUEVO,
  ESPERA_DE_LA_TIENDA_MIN,
  REFRESCO_DEL_CHIP_MS,
  alertaDelChip,
  anuncioDelChip,
  entroUnPedidoNuevo,
  etiquetaDelChipDePedidosNuevos,
  etiquetaVisibleDelChip,
  hrefDelChip,
  notificacionDelChip,
  pedidosDeLaTiendaEsperando,
  textoDelChipDePedidosNuevos,
  textoVisibleDelChip,
  tituloConPedidos,
  type ConteoDePedidosNuevos,
} from "./pedidos/pedidos-core";

const RAIZ = fileURLToPath(new URL("../../../../", import.meta.url));
const leer = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

const AHORA = Date.parse("2026-10-22T15:00:00.000Z");
const hace = (min: number) => new Date(AHORA - min * 60_000).toISOString();
const conteo = (cantidad: number, minutos: number, ultimoCode: number | null, code = 128): ConteoDePedidosNuevos => ({
  cantidad,
  masViejo: cantidad > 0 ? { id: `p${code}`, code, creado: hace(minutos) } : null,
  ultimoCode: cantidad > 0 ? ultimoCode : null,
});

// ── Lo puro ────────────────────────────────────────────────────────────────────────────────────

test("el texto del chip: «N pedidos nuevos · el más viejo hace X min»; uno solo, «1 pedido nuevo · hace X min»; ninguno, nada", () => {
  assert.equal(textoDelChipDePedidosNuevos(conteo(2, 12, 130), AHORA), "2 pedidos nuevos · el más viejo hace 12 min");
  assert.equal(textoDelChipDePedidosNuevos(conteo(1, 3, 128), AHORA), "1 pedido nuevo · hace 3 min");
  assert.equal(textoDelChipDePedidosNuevos(conteo(1, 0, 128), AHORA), "1 pedido nuevo · hace menos de 1 min");
  assert.equal(textoDelChipDePedidosNuevos(conteo(3, 95, 131), AHORA), "3 pedidos nuevos · el más viejo hace 1 h 35 min");
  assert.equal(textoDelChipDePedidosNuevos(conteo(0, 0, null), AHORA), null);
});

test("el nombre para el lector de pantalla arranca con lo que se ve y dice a dónde lleva el toque", () => {
  assert.equal(
    etiquetaDelChipDePedidosNuevos(conteo(2, 12, 130), AHORA),
    "2 pedidos nuevos · el más viejo hace 12 min. Pedidos de la tienda: abrir el #128",
  );
  assert.equal(etiquetaDelChipDePedidosNuevos(conteo(0, 0, null), AHORA), null);
});

test("suena sólo lo que ENTRÓ: no al abrir la pantalla, sí si sube el número más alto (aunque la cantidad no cambie)", () => {
  assert.equal(entroUnPedidoNuevo(null, conteo(2, 5, 130)), false, "lo que ya estaba no suena");
  assert.equal(entroUnPedidoNuevo(conteo(2, 5, 130), conteo(2, 6, 130)), false, "misma vuelta, nada nuevo");
  assert.equal(entroUnPedidoNuevo(conteo(2, 5, 130), conteo(3, 6, 131)), true);
  assert.equal(entroUnPedidoNuevo(conteo(2, 5, 130), conteo(2, 6, 131, 129)), true, "se tomó el #128 y entró el #131");
  assert.equal(entroUnPedidoNuevo(conteo(0, 0, null), conteo(1, 0, 132)), true, "de cero a uno");
  assert.equal(entroUnPedidoNuevo(conteo(2, 5, 130), conteo(1, 6, 130, 130)), false, "se tomó uno: no suena");
  assert.equal(entroUnPedidoNuevo(conteo(1, 5, 130), conteo(0, 0, null)), false);
});

test("lo que se anuncia: el número del que entró y cuántos esperan", () => {
  assert.equal(anuncioDelChip(conteo(1, 0, 132)), "Entró un pedido nuevo de la tienda (#132).");
  assert.equal(anuncioDelChip(conteo(3, 9, 133)), "Entró un pedido nuevo de la tienda (#133). Hay 3 esperando.");
});

test("«nuevo» es lo MISMO que la línea de estado del tablero: ONLINE y en PENDING", () => {
  assert.deepEqual(CRITERIO_PEDIDO_NUEVO, { channel: "ONLINE", status: "PENDING" });
  const ahora = new Date(AHORA);
  const pedidos = [
    { canal: "ONLINE" as const, status: "PENDING", creado: hace(20) },
    { canal: "ONLINE" as const, status: "PREPARING", creado: hace(40) },
    { canal: "COUNTER" as const, status: "PENDING", creado: hace(50) },
  ];
  const filtrados = pedidos.filter((p) => p.canal === CRITERIO_PEDIDO_NUEVO.channel && p.status === CRITERIO_PEDIDO_NUEVO.status);
  assert.equal(pedidosDeLaTiendaEsperando(pedidos, ahora)?.esperando, filtrados.length);
});

test("B1 · pasados 15 min el chip pasa a alerta y dice «esperando hace 25 min» (el mismo umbral que el tablero)", () => {
  assert.equal(ESPERA_DE_LA_TIENDA_MIN, 15, "provisional a confirmar con Magra");
  assert.equal(alertaDelChip(conteo(1, 14, 128), AHORA), null, "a los 14 min, todavía no");
  assert.equal(alertaDelChip(conteo(0, 0, null), AHORA), null, "sin pedidos, nada");
  assert.deepEqual(alertaDelChip(conteo(1, 15, 128), AHORA), { minutos: 15, texto: "1 pedido nuevo · esperando hace 15 min" });
  assert.deepEqual(alertaDelChip(conteo(1, 25, 128), AHORA), { minutos: 25, texto: "1 pedido nuevo · esperando hace 25 min" });
  assert.equal(alertaDelChip(conteo(3, 95, 131), AHORA)?.texto, "3 pedidos nuevos · el más viejo esperando hace 1 h 35 min");
  // Lo que se ve y con lo que arranca el nombre para el lector.
  assert.equal(textoVisibleDelChip(conteo(2, 12, 130), AHORA), "2 pedidos nuevos · el más viejo hace 12 min", "sin alerta, el texto de siempre");
  assert.equal(textoVisibleDelChip(conteo(1, 25, 128), AHORA), "1 pedido nuevo · esperando hace 25 min");
  assert.equal(etiquetaVisibleDelChip(conteo(1, 25, 128), AHORA), "1 pedido nuevo · esperando hace 25 min. Pedidos de la tienda: abrir el #128");
  assert.equal(etiquetaVisibleDelChip(conteo(2, 12, 130), AHORA), etiquetaDelChipDePedidosNuevos(conteo(2, 12, 130), AHORA));
  assert.equal(textoVisibleDelChip(conteo(0, 0, null), AHORA), null);
});

test("B2 · el título de la pestaña: «(N) <título>» con pedidos, sin apilar, y el de siempre con 0", () => {
  assert.equal(tituloConPedidos("Vender · Magra", 2), "(2) Vender · Magra");
  assert.equal(tituloConPedidos("(2) Vender · Magra", 3), "(3) Vender · Magra", "se reemplaza, no se apila");
  assert.equal(tituloConPedidos("(3) Vender · Magra", 0), "Vender · Magra", "con 0 vuelve el de siempre");
  assert.equal(tituloConPedidos("Vender · Magra", 0), "Vender · Magra");
  assert.equal(tituloConPedidos("Pedidos (web)", 1), "(1) Pedidos (web)", "un paréntesis en el medio no se toca");
});

test("B3 · la notificación del pedido que entró: dice cuál, abre el más viejo y no se repite (tag por número)", () => {
  assert.equal(notificacionDelChip(conteo(0, 0, null)), null);
  assert.deepEqual(notificacionDelChip(conteo(2, 5, 130)), {
    titulo: "Pedido nuevo de la tienda",
    cuerpo: "Entró un pedido nuevo de la tienda (#130). Hay 2 esperando.",
    href: "/admin/pedidos?pedido=p128",
    tag: "pedido-nuevo-130",
  });
  assert.equal(hrefDelChip(conteo(0, 0, null)), "/admin/pedidos");
});

// ── La forma ─────────────────────────────────────────────────────────────────────────────────

test("la lectura es UN endpoint de sólo lectura: orders:read, tenant de la sesión y un conteo + el más viejo", () => {
  const accion = leer("./pedidos-nuevos.ts");
  assert.match(accion, /^"use server";/);
  const exports = [...accion.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)].map((m) => m[1]);
  assert.deepEqual(exports, ["contarPedidosNuevos"], "un solo endpoint publicado");
  assert.match(accion, /await requireCapability\("orders:read"\);/);
  assert.match(accion, /const tenantId = await getCurrentTenantId\(\);/);
  assert.match(accion, /const where = \{ tenantId, \.\.\.CRITERIO_PEDIDO_NUEVO \};/);
  assert.equal((accion.match(/prisma\.order\.\w+\(/g) ?? []).length, 2, "dos lecturas chicas, nada más");
  assert.doesNotMatch(accion, /\.(findMany|update|updateMany|create|createMany|delete|deleteMany|upsert)\(|include:/, "no trae pedidos ni escribe");
});

test("el layout monta el chip sólo con el mostrador boutique y para quien ve pedidos; el armazón no dibuja nada sin él", () => {
  const layout = leer("./layout.tsx");
  assert.match(layout, /const pedidosNuevos = mostradorBoutiquePrendido\(interruptores\) && roleHasCapability\(user\.role, "orders:read"\);/);
  assert.match(layout, /\{\.\.\.\(pedidosNuevos \? \{ pedidosNuevos \} : \{\}\)\}/);
  const shell = leer("./AdminShell.tsx");
  assert.match(shell, /return pedidosNuevos \? <PedidosNuevos>\{armazon\}<\/PedidosNuevos> : armazon;/);
  // En los dos armazones, en la PC y en el celular.
  assert.equal((shell.match(/<ChipDePedidosNuevos lugar=/g) ?? []).length, 2);
  assert.equal((leer("./armazon/ArmazonNuevo.tsx").match(/<ChipDePedidosNuevos lugar=/g) ?? []).length, 2);
  // Sin `PedidosNuevos` arriba, el chip no dibuja nada.
  assert.match(leer("./ChipDePedidosNuevos.tsx"), /if \(!c\?\.lectura\) return null;/);
});

// ── En el navegador ──────────────────────────────────────────────────────────────────────────

const ENTRADA = `
import { createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { PedidosNuevos, ChipDePedidosNuevos } from "@/app/admin/(dashboard)/ChipDePedidosNuevos";
window.__montar = () =>
  createRoot(document.getElementById("root")).render(
    h(PedidosNuevos, null, h("header", { id: "pc" }, h(ChipDePedidosNuevos, { lugar: "pc" })), h("div", { id: "movil" }, h(ChipDePedidosNuevos, { lugar: "movil" }))),
  );
`;
// La consulta del servidor, reemplazada: devuelve lo que el test pone en `window.__conteo` y cuenta.
const CONSULTA_FALSA = `
export async function contarPedidosNuevos() { window.__consultas = (window.__consultas || 0) + 1; return window.__conteo; }
`;
const LINK_FALSO = `
import { createElement } from "react";
export default function Link({ href, children, prefetch, ...resto }) { return createElement("a", { href, ...resto }, children); }
`;
// Un audio de mentira que cuenta los «bip» (el navegador sin parlantes no suena igual).
const AUDIO_FALSO = `
window.__bips = 0;
window.AudioContext = class {
  constructor() { this.state = "running"; this.currentTime = 0; this.destination = {}; }
  resume() { return Promise.resolve(); }
  createOscillator() { return { frequency: {}, connect: (v) => v, start: () => { window.__bips++; }, stop() {} }; }
  createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
};
let visible = true;
Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (visible ? "visible" : "hidden") });
window.__pestana = (v) => { visible = v; document.dispatchEvent(new Event("visibilitychange")); };
`;
// La Notification del navegador, reemplazada: el permiso lo fija el test y las que se abren quedan en `__notifs`.
type Permiso = "no-soportado" | "default" | "granted" | "denied";
const notificacionFalsa = (permiso: Permiso) => `
window.__notifs = [];
window.__pedidos = 0;
if (${JSON.stringify(permiso)} === "no-soportado") {
  delete window.Notification;
} else {
  class N {
    constructor(titulo, o) { this.titulo = titulo; this.cuerpo = o.body; this.tag = o.tag; this.onclick = null; window.__notifs.push(this); }
    close() { this.cerrada = true; }
  }
  N.permission = ${JSON.stringify(permiso)};
  N.requestPermission = () => { window.__pedidos++; N.permission = "granted"; return Promise.resolve("granted"); };
  window.Notification = N;
}
`;

function rutaDeChromium(porDefecto: () => string): string | null {
  try {
    const p = porDefecto();
    if (existsSync(p)) return p;
  } catch {
    // sin el de Playwright: se busca en la carpeta de navegadores
  }
  const dir = process.env.PLAYWRIGHT_BROWSERS_PATH ?? "/opt/pw-browsers";
  if (existsSync(join(dir, "chromium"))) return join(dir, "chromium");
  if (!existsSync(dir)) return null;
  for (const n of readdirSync(dir).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse()) {
    for (const sub of ["chrome-linux64", "chrome-linux"]) {
      const p = join(dir, n, sub, "chrome");
      if (existsSync(p)) return p;
    }
  }
  return null;
}

type Ventana = {
  __montar: () => void;
  __conteo: ConteoDePedidosNuevos;
  __consultas: number;
  __bips: number;
  __pestana: (v: boolean) => void;
  __notifs: { titulo: string; cuerpo: string; tag: string; onclick: (() => void) | null }[];
  __pedidos: number;
};

describe("El chip de pedidos nuevos en el navegador", { timeout: 120_000 }, () => {
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
      stdin: { contents: ENTRADA, loader: "tsx", resolveDir: RAIZ },
      bundle: true,
      write: false,
      format: "iife",
      jsx: "automatic",
      tsconfig: join(RAIZ, "tsconfig.json"),
      define: { "process.env.NODE_ENV": '"production"' },
      logLevel: "silent",
      plugins: [
        {
          name: "falsos",
          setup(b) {
            b.onResolve({ filter: /^\.\/pedidos-nuevos$/ }, () => ({ path: "consulta", namespace: "falso" }));
            b.onResolve({ filter: /^next\/link$/ }, () => ({ path: "link", namespace: "falso" }));
            b.onLoad({ filter: /.*/, namespace: "falso" }, (a) => ({
              contents: a.path === "consulta" ? CONSULTA_FALSA : LINK_FALSO,
              loader: "js",
              resolveDir: RAIZ,
            }));
          },
        },
      ],
    });
    bundle = r.outputFiles[0].text;
    browser = await playwright.chromium.launch({ executablePath: chrome });
  });

  after(async () => {
    await browser?.close();
  });

  const ORIGEN = "http://localhost:3996/admin/vender";
  async function montar(inicial: ConteoDePedidosNuevos, ancho = 1280, permiso: Permiso = "no-soportado"): Promise<{ page: Page; errores: string[] }> {
    const page = await browser!.newPage({ viewport: { width: ancho, height: 800 }, locale: "es-AR" });
    const errores: string[] = [];
    page.on("pageerror", (e) => errores.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errores.push(m.text());
    });
    await page.clock.install({ time: AHORA });
    await page.route(ORIGEN, (r) =>
      r.fulfill({
        contentType: "text/html; charset=utf-8",
        body: '<!doctype html><html lang="es"><head><title>Vender · Magra</title></head><body><div id="root"></div></body></html>',
      }),
    );
    // A donde lleva el toque de la notificación.
    await page.route(/\/admin\/pedidos/, (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body: "<!doctype html><title>Pedidos</title>" }));
    await page.goto(ORIGEN);
    await page.addScriptTag({ content: AUDIO_FALSO });
    await page.addScriptTag({ content: notificacionFalsa(permiso) });
    await page.evaluate((c) => ((window as unknown as Ventana).__conteo = c), inicial);
    await page.addScriptTag({ content: bundle });
    await page.evaluate(() => (window as unknown as Ventana).__montar());
    return { page, errores };
  }
  const ventana = <K extends keyof Ventana>(page: Page, k: K) => page.evaluate((key) => (window as unknown as Ventana)[key as K], k) as Promise<Ventana[K]>;
  const poner = (page: Page, c: ConteoDePedidosNuevos) => page.evaluate((x) => ((window as unknown as Ventana).__conteo = x), c);

  test("MG-054 · pregunta al montar y cada 45 s; cuando entra un pedido lo muestra, suena y lo anuncia; el toque abre el más viejo", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar(conteo(0, 0, null));
    await page.waitForFunction(() => (window as unknown as Ventana).__consultas === 1);
    assert.equal(await page.locator("[data-ui='chip-pedidos-nuevos']").count(), 0, "sin pedidos esperando no se ve nada");
    // Habilita el audio, como el primer toque del vendedor en la pantalla.
    await page.mouse.click(5, 5);

    await poner(page, conteo(1, 0, 128));
    await page.clock.runFor(REFRESCO_DEL_CHIP_MS - 1000);
    assert.equal(await ventana(page, "__consultas"), 1, "no antes de los 45 s");
    await page.clock.runFor(1000);
    const chip = page.locator("#pc").getByRole("link", { name: /^1 pedido nuevo · .*abrir el #128$/ });
    await chip.waitFor();
    assert.equal(await chip.getAttribute("href"), "/admin/pedidos?pedido=p128");
    assert.equal(await ventana(page, "__bips"), 1, "un bip por el pedido que entró");
    await page.getByRole("status").filter({ hasText: "Entró un pedido nuevo de la tienda (#128)." }).waitFor({ state: "attached" });
    assert.equal(await page.getByRole("status").count(), 1, "un solo anuncio aunque el chip se vea en dos lugares");

    // La vuelta siguiente sin novedades: no vuelve a sonar, y el «hace X min» se mueve.
    await page.clock.runFor(REFRESCO_DEL_CHIP_MS);
    assert.equal(await ventana(page, "__bips"), 1);
    await page.locator("#pc").getByText("1 pedido nuevo · hace 1 min").waitFor();
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("con la pestaña escondida no le pregunta nada a la base; al volver pregunta enseguida", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar(conteo(2, 12, 130));
    await page.waitForFunction(() => (window as unknown as Ventana).__consultas === 1);
    await page.locator("#pc").getByText("2 pedidos nuevos · el más viejo hace 12 min").waitFor();
    await page.evaluate(() => (window as unknown as Ventana).__pestana(false));
    await page.clock.runFor(REFRESCO_DEL_CHIP_MS * 4);
    assert.equal(await ventana(page, "__consultas"), 1, "escondida, ni una consulta");
    await page.evaluate(() => (window as unknown as Ventana).__pestana(true));
    await page.waitForFunction(() => (window as unknown as Ventana).__consultas === 2);
    // Ir y volver enseguida no vuelve a preguntar (menos de 15 s desde la última).
    await page.evaluate(() => (window as unknown as Ventana).__pestana(false));
    await page.evaluate(() => (window as unknown as Ventana).__pestana(true));
    await page.clock.runFor(100);
    assert.equal(await ventana(page, "__consultas"), 2);
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("el sonido se apaga con su tecla (por persona) y lo que entra después no suena; en el celular, con la tecla de la franja", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar(conteo(1, 4, 128), 390);
    await page.waitForFunction(() => (window as unknown as Ventana).__consultas === 1);
    const franja = page.locator("#movil");
    await franja.getByRole("link", { name: "1 pedido nuevo · hace 4 min. Pedidos de la tienda: abrir el #128" }).waitFor();
    await page.mouse.click(5, 300);
    await franja.getByRole("button", { name: "Sonido del aviso: prendido" }).click();
    await franja.getByRole("button", { name: "Sonido del aviso: apagado" }).waitFor();
    assert.equal(await page.evaluate(() => window.localStorage.getItem("pedidos:sonido-del-aviso")), "0");
    await poner(page, conteo(2, 5, 129));
    await page.clock.runFor(REFRESCO_DEL_CHIP_MS);
    await franja.getByText("2 pedidos nuevos · el más viejo hace 5 min").waitFor();
    assert.equal(await ventana(page, "__bips"), 0, "apagado, no suena");
    await page.getByRole("status").filter({ hasText: "(#129)" }).waitFor({ state: "attached" });
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("B1 · a los 12 min el chip es el de siempre; cuando el más viejo pasa los 15 min, tono de alerta y «esperando hace …»", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar(conteo(1, 12, 128));
    const pc = page.locator("#pc [data-ui='chip-pedidos-nuevos']");
    await pc.getByText("1 pedido nuevo · hace 12 min").waitFor();
    assert.equal(await pc.getAttribute("data-tono"), null, "sin alerta todavía");
    await poner(page, conteo(1, 25, 128));
    await page.clock.runFor(REFRESCO_DEL_CHIP_MS);
    await pc.getByText("1 pedido nuevo · esperando hace 25 min").waitFor();
    assert.equal(await pc.getAttribute("data-tono"), "alerta");
    assert.match((await pc.getByRole("link").getAttribute("class")) ?? "", /bg-danger-soft text-danger/, "el token de alerta del kit");
    await pc.getByRole("link", { name: "1 pedido nuevo · esperando hace 25 min. Pedidos de la tienda: abrir el #128" }).waitFor();
    assert.deepEqual(errores, []);
    await page.close();
  });

  test("B2 · el título de la pestaña lleva «(N) » mientras haya pedidos, sobrevive a la navegación y vuelve con 0", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar(conteo(2, 3, 130));
    await page.waitForFunction(() => document.title === "(2) Vender · Magra");
    // Next pone el título de la página nueva al navegar: se le vuelve a poner el número.
    await page.evaluate(() => (document.title = "Pedidos · Magra"));
    await page.waitForFunction(() => document.title === "(2) Pedidos · Magra");
    await poner(page, conteo(0, 0, null));
    await page.clock.runFor(REFRESCO_DEL_CHIP_MS);
    await page.waitForFunction(() => document.title === "Pedidos · Magra");
    assert.deepEqual(errores, []);
    await page.close();
  });

  for (const permiso of ["denied", "no-soportado"] as const) {
    test(`B3 · notificación ${permiso === "denied" ? "denegada" : "sin soporte"}: ni la tecla ni un error, y el pedido que entra no la intenta`, async (t) => {
      if (sinNavegador) return t.skip(sinNavegador);
      const { page, errores } = await montar(conteo(1, 2, 127, 127), 1280, permiso);
      await page.locator("#pc").getByText("1 pedido nuevo · hace 2 min").waitFor();
      assert.equal(await page.locator("[data-ui='pedir-notificacion']").count(), 0, "ni un nodo");
      await poner(page, conteo(2, 3, 128, 127));
      await page.clock.runFor(REFRESCO_DEL_CHIP_MS);
      await page.locator("#pc").getByText("2 pedidos nuevos · el más viejo hace 3 min").waitFor();
      assert.equal(await ventana(page, "__notifs").then((n) => n.length), 0);
      assert.deepEqual(errores, []);
      await page.close();
    });
  }

  test("B3 · con el permiso concedido: una notificación por pedido que entra, y el toque abre el pedido", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, errores } = await montar(conteo(1, 2, 127, 127), 1280, "default");
    const tecla = page.locator("#pc").getByRole("button", { name: "Avisarme aunque esté en otra ventana" });
    await tecla.click();
    await tecla.waitFor({ state: "detached" });
    assert.equal(await ventana(page, "__pedidos"), 1, "se pidió el permiso una vez");
    assert.equal(await ventana(page, "__notifs").then((n) => n.length), 0, "lo que ya estaba no notifica");

    await poner(page, conteo(2, 3, 128, 127));
    await page.clock.runFor(REFRESCO_DEL_CHIP_MS);
    await page.waitForFunction(() => (window as unknown as Ventana).__notifs.length === 1);
    const [n] = await ventana(page, "__notifs");
    assert.equal(n.titulo, "Pedido nuevo de la tienda");
    assert.equal(n.cuerpo, "Entró un pedido nuevo de la tienda (#128). Hay 2 esperando.");
    assert.equal(n.tag, "pedido-nuevo-128");
    // La vuelta siguiente sin novedades no repite.
    await page.clock.runFor(REFRESCO_DEL_CHIP_MS);
    assert.equal(await ventana(page, "__notifs").then((x) => x.length), 1);
    assert.deepEqual(errores, []);

    await page.evaluate(() => (window as unknown as Ventana).__notifs[0].onclick?.());
    await page.waitForURL("http://localhost:3996/admin/pedidos?pedido=p127");
    await page.close();
  });
});
