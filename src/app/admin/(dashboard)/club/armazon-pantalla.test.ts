// ============================================================================
// EL ARMAZÓN DEL CLUB EN EL NAVEGADOR — la barra de Break Point, las cintas, la bandeja, el tablero, los atajos y el
// pedido de acceso desde la pantalla bloqueada, como el club de hoy (src/tenants/breakpoint/sitio/club.html).
// ============================================================================
//
// Mismo armado que club-pantalla.test.ts, pero con el PANEL DE CASA de verdad (PanelDeCasa.tsx: la barra con sus
// lugares, el candado y el tema) bajo `data-estetica="breakpoint"`, el CSS REAL (globals.css + Tailwind) y la piel del
// armazón (club/piel/armazon.css). Lo del servidor se reemplaza (plugin de esbuild): next/link por un <a>, next/font
// por una variable de prueba y «Salir» por un formulario quieto. ClubDemo baja DESPUÉS de la cabecera, como en Next
// (ClubCargador, ssr: false). Se prueba, clic por clic:
//   · la barra en el orden del club de hoy (buscador, quién opera, reloj, candado, tema) aunque la ficha llegue última;
//   · Montserrat en «GESTIÓN / DEL CLUB» y en el logo; «N urgentes» rectangular; URGENTE con contraste AA;
//   · en el celular (390 px) la barra en un renglón (la luna no baja) y cintas + barra ≤ 120 px, sin scroll de costado;
//   · el Tablero: lo que espera el OK del dueño con el filo ámbar, sin el bloque ámbar relleno;
//   · Ctrl/⌘+Z deshace la última acción (no dentro de un campo) y «?» / la paleta abren la ayuda de atajos;
//   · jornada real bloqueada: «¿Sos nuevo/a? Pedí acceso» deja el pedido para el dueño.
// Con CAPTURAS_ARMAZON=<carpeta> deja capturas. Sin Chromium o sin esbuild, se saltea con el motivo.

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser, BrowserContext, Page } from "playwright";
import * as M from "@/lib/club/motor.mjs";
import { claveDeLaJornada, textoDeLaDemo, textoDelEstado } from "./almacen";
import { irASolapa } from "./solapas-e2e";

const RAIZ = fileURLToPath(new URL("../../../../../", import.meta.url));
const ORIGEN = "http://localhost:3999/admin/club";
const CAPTURAS = process.env.CAPTURAS_ARMAZON ?? "";
const FUENTE_DE_PRUEBA = "fuente-montserrat-de-prueba";

// La ruta va armada (no literal): limite-del-motor.test.ts busca imports estáticos de ClubDemo fuera de los tests.
const ENTRADA = `
import { createElement as h, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import PanelDeCasa from "@/app/admin/(dashboard)/PanelDeCasa";
import LogoDelNegocio from "@/components/marca/LogoDelNegocio";
import ClubDemo from "@/app/admin/(dashboard)/club/ClubDemo";
const APPS = [{ id: "club", nombre: "Club", ruta: "/admin/club" }, { id: "usuarios", nombre: "Usuarios", ruta: "/admin/usuarios" }];
window.__montar = (negocio, usuario, rol, reloj) => {
  // El club baja después de la cabecera (en Next: ClubCargador con ssr: false).
  function Despues() {
    const [listo, setListo] = useState(false);
    useEffect(() => setListo(true), []);
    return listo ? h(ClubDemo, { negocio, usuario, rol, reloj }) : null;
  }
  createRoot(document.getElementById("root")).render(
    h(PanelDeCasa, { apps: APPS, brandName: "Break Point", monogram: "BP", logo: h(LogoDelNegocio, { estetica: "breakpoint", nombre: "Break Point" }), userName: "Rober" },
      h("main", { className: "mx-auto max-w-[1500px] p-4" }, h(Despues))),
  );
};
`;
type Ventana = { __montar: (negocio: string, usuario: string, rol: string, reloj: string) => void };

const STUBS: Record<string, string> = {
  "next/link": `import { createElement } from "react"; export default function Link({ href, children, ...p }) { return createElement("a", { href, ...p }, children); }`,
  "next/font/google": `export const Montserrat = () => ({ variable: "${FUENTE_DE_PRUEBA}", className: "", style: { fontFamily: "Montserrat" } });`,
  FormCerrarSesion: `import { createElement } from "react"; export default function F({ children }) { return createElement("form", { onSubmit: (e) => e.preventDefault() }, children); }`,
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

/** globals.css + Tailwind (como el build) y la piel del armazón tal cual. "" si no se pudo compilar. */
async function cssDeLaApp(): Promise<string> {
  try {
    const postcss = (await import("postcss")).default;
    const tailwind = (await import("@tailwindcss/postcss")).default as unknown as (o: { base: string }) => import("postcss").AcceptedPlugin;
    const archivo = join(RAIZ, "src", "app", "globals.css");
    const app = (await postcss([tailwind({ base: RAIZ })]).process(readFileSync(archivo, "utf8"), { from: archivo })).css;
    const piel = readFileSync(join(RAIZ, "src", "app", "admin", "(dashboard)", "club", "piel", "armazon.css"), "utf8");
    return `${app}\n${piel}\n.${FUENTE_DE_PRUEBA} { --font-montserrat: "Montserrat Prueba"; }`;
  } catch {
    return "";
  }
}

/** Contraste WCAG entre dos colores `rgb(…)` de getComputedStyle. */
function contraste(a: string, b: string): number {
  const lum = (c: string) => {
    const [r, g, bl] = (c.match(/[\d.]+/g) ?? []).slice(0, 3).map((v) => {
      const s = Number(v) / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

describe("El armazón del club (Break Point) en el navegador", { timeout: 240_000 }, () => {
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
    const r = await esbuild.build({
      loader: { ".css": "empty" }, // la piel (piel/*.css) entra por el CSS de la página, no por el paquete
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
          name: "servidor-de-mentira",
          setup(b) {
            b.onResolve({ filter: /^next\/link$|^next\/font\/google$|FormCerrarSesion$/ }, (a) => ({ path: a.path.endsWith("FormCerrarSesion") ? "FormCerrarSesion" : a.path, namespace: "stub" }));
            b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: STUBS[a.path], loader: "js", resolveDir: RAIZ }));
          },
        },
      ],
    });
    bundle = r.outputFiles[0].text;
    css = await cssDeLaApp();
    browser = await playwright.chromium.launch({ executablePath: chrome });
    if (CAPTURAS) mkdirSync(CAPTURAS, { recursive: true });
  });

  after(async () => {
    await browser?.close();
  });

  const html = () =>
    `<!doctype html><html lang="es"><head><style>${css}</style></head><body><div data-skin="fable" data-theme="light" data-estetica="breakpoint" class="min-h-screen bg-surface text-body"><div id="root"></div></div></body></html>`;

  async function abrir(
    viewport: { width: number; height: number },
    { reloj = "demo", rol = "OWNER", sembrar = false }: { reloj?: "demo" | "real"; rol?: string; sembrar?: boolean } = {},
  ): Promise<{ page: Page; contexto: BrowserContext; errores: string[] }> {
    const contexto = await browser!.newContext({ viewport, locale: "es-AR" });
    // Un sábado fijo a las 20: la demo arma el día con la fecha del equipo.
    await contexto.clock.install({ time: new Date(2026, 9, 17, 20, 0, 5) });
    await contexto.route(ORIGEN, (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body: html() }));
    const page = await contexto.newPage();
    const errores: string[] = [];
    page.on("pageerror", (e) => errores.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errores.push(m.text());
    });
    await page.goto(ORIGEN);
    if (sembrar) {
      const e = M.generarDemo("2026-10-17");
      await page.evaluate(([k, v]) => localStorage.setItem(k, v), [claveDeLaJornada("demo-club"), textoDeLaDemo(textoDelEstado(e), "2026-10-17", 1)]);
    }
    await page.addScriptTag({ content: bundle });
    await page.evaluate(([r, ro]) => (window as unknown as Ventana).__montar("demo-club", "u_x", ro, r), [reloj, rol]);
    return { page, contexto, errores };
  }
  const capturar = async (page: Page, nombre: string) => {
    if (CAPTURAS) await page.screenshot({ path: join(CAPTURAS, `${nombre}.png`) });
  };
  const cabecera = (page: Page) => page.locator('[data-casa="cabecera"]');
  /** La caja de cada pieza de la barra (los lugares no hacen caja: se mide lo de adentro). */
  const PIEZAS = {
    buscar: '[data-casa="buscar"]',
    ficha: '[data-casa="ficha"]',
    reloj: '[data-casa="reloj-demo"], [data-casa="hora"]',
    candado: 'button[aria-label="Bloquear o salir"]',
    tema: 'button[aria-label="Cambiar tema"]',
    cabecera: '[data-casa="cabecera"]',
    cintas: '[data-casa="cintas"]',
  };
  type Caja = { x: number; y: number; abajo: number; ancho: number; alto: number };
  const cajas = async (page: Page): Promise<Record<keyof typeof PIEZAS, Caja | null>> =>
    // Sin funciones con nombre adentro: tsx les agrega `__name`, que en la página no existe.
    Object.fromEntries(
      await page.evaluate((piezas) =>
        Object.entries(piezas).map(([k, sel]) => {
          const r = document.querySelector(sel)?.getBoundingClientRect();
          return [k, r ? { x: r.left, y: r.top, abajo: r.bottom, ancho: r.width, alto: r.height } : null];
        }),
      PIEZAS),
    ) as Record<keyof typeof PIEZAS, Caja | null>;

  test("PC: la barra en el orden del club de hoy (buscador, quién opera, reloj, candado, tema); Montserrat; «N urgentes» rectangular y URGENTE AA", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, contexto, errores } = await abrir({ width: 1280, height: 860 });
    await page.getByRole("heading", { name: "Agenda de canchas" }).waitFor();
    // La ficha la pone el bloqueo (su propio chunk, llega última): igual va en su lugar.
    await page.locator('[data-casa="ficha"]').waitFor();
    const c = await cajas(page);
    for (const k of ["buscar", "ficha", "reloj", "candado", "tema"] as const) assert.ok(c[k], `está ${k}`);
    const xs = [c.buscar!, c.ficha!, c.reloj!, c.candado!, c.tema!].map((b) => b.x);
    assert.deepEqual([...xs].sort((a, b) => a - b), xs, `en orden de izquierda a derecha: ${xs.map(Math.round).join(", ")}`);
    // Y el orden del Tab es el mismo (el DOM, no sólo lo que se ve).
    const enElDom = await page.evaluate(() =>
      [...document.querySelectorAll('[data-casa="herramientas"] [data-casa="buscar"], [data-casa="herramientas"] [data-casa="ficha"], [data-casa="herramientas"] [data-casa="reloj-demo"]')].map((e) => (e as HTMLElement).dataset.casa),
    );
    assert.deepEqual(enElDom, ["buscar", "ficha", "reloj-demo"]);

    if (css) {
      // Montserrat (la variable de next/font) en «GESTIÓN / DEL CLUB» y en las letras del logo.
      const letras = await page.evaluate(() => ({
        bajada: getComputedStyle(document.querySelector('[data-logo-parte="bajada"]')!).fontFamily,
        logo: getComputedStyle(document.querySelector('[data-logo="breakpoint"] svg text')!).fontFamily,
      }));
      assert.match(letras.bajada, /^"Montserrat Prueba"/);
      assert.match(letras.logo, /^"Montserrat Prueba"/);

      // «N urgentes»: chip rectangular (radio ≤ 3 px) con su filo; URGENTE con 4,5:1 o más sobre su fondo.
      const bandeja = page.locator('[data-ui="bandeja"]');
      const chip = bandeja.locator('[data-ui="badge"]').first();
      await chip.waitFor();
      const estilo = await chip.evaluate((el) => {
        const s = getComputedStyle(el);
        return { radio: parseFloat(s.borderTopLeftRadius), borde: parseFloat(s.borderTopWidth), texto: el.textContent };
      });
      t.diagnostic(`chip: ${JSON.stringify(estilo)}`);
      assert.ok(estilo.radio <= 3, `rectangular (radio ${estilo.radio}px)`);
      if (/urgente/.test(estilo.texto ?? "")) assert.ok(estilo.borde >= 1, "con su filo");
      const urgente = bandeja.locator('[data-ui="marca"].text-danger').first();
      if (await urgente.count()) {
        const [color, fondo] = await urgente.evaluate((el) => {
          let f = el as Element | null;
          let bg = "rgba(0, 0, 0, 0)";
          while (f && /rgba\(0, 0, 0, 0\)|transparent/.test(bg)) {
            bg = getComputedStyle(f).backgroundColor;
            f = f.parentElement;
          }
          return [getComputedStyle(el).color, bg];
        });
        const r = contraste(color, fondo);
        t.diagnostic(`URGENTE ${color} sobre ${fondo}: ${r.toFixed(2)}:1`);
        assert.ok(r >= 4.5, `URGENTE con contraste AA (${r.toFixed(2)}:1)`);
      }
    }
    await capturar(page, "1280-barra");
    assert.deepEqual(errores, []);
    await contexto.close();
  });

  test("celular (390 px): la barra en un renglón (la luna no baja), cintas + barra ≤ 120 px, sin scroll de costado; Usuarios en el candado", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, contexto, errores } = await abrir({ width: 390, height: 844 });
    await page.getByRole("heading", { name: "Agenda de canchas" }).waitFor();
    await page.locator('[data-casa="ficha"]').waitFor();
    await capturar(page, "390-barra");
    if (!css) return t.skip("sin el CSS de la app no se mide el armazón");
    const c = await cajas(page);
    t.diagnostic(`390: ${JSON.stringify(c)}`);
    const fila = [c.buscar!, c.ficha!, c.reloj!, c.candado!, c.tema!];
    const centro = (b: { y: number; alto: number }) => b.y + b.alto / 2;
    for (const b of fila) assert.ok(Math.abs(centro(b) - centro(c.tema!)) < 6, "todo en el mismo renglón que la luna");
    assert.ok(c.tema!.x + c.tema!.ancho <= 390, "la luna entra en la pantalla");
    assert.ok(c.cabecera!.abajo <= 120, `cintas + barra en ${Math.round(c.cabecera!.abajo)} px (≤ 120)`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "sin scroll de costado");
    // La ficha sigue diciendo quién opera (en su etiqueta) aunque se vea sólo la inicial.
    assert.match((await page.locator('[data-casa="ficha"]').getAttribute("aria-label")) ?? "", /^Opera: /);
    // Las otras apps (Usuarios) no quedan perdidas: van en el menú del candado.
    assert.equal(await cabecera(page).locator('nav[aria-label="Panel"]').first().isVisible(), false);
    await page.getByRole("button", { name: "Bloquear o salir" }).click();
    await page.locator('[data-casa="menu"]').getByRole("link", { name: "Usuarios" }).waitFor();
    await page.keyboard.press("Escape");
    assert.deepEqual(errores, []);
    await contexto.close();
  });

  test("Tablero: lo que espera el OK del dueño va con el filo ámbar, sin el bloque ámbar relleno", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, contexto, errores } = await abrir({ width: 1280, height: 900 });
    await page.getByRole("heading", { name: "Agenda de canchas" }).waitFor();
    await irASolapa(page, "Tablero");
    const aviso = page.locator('[data-ui="aviso-tablero"]').first();
    await aviso.waitFor();
    if (css) {
      const s = await aviso.evaluate((el) => {
        const cs = getComputedStyle(el);
        const fondoDeLaPagina = getComputedStyle(document.querySelector('[data-estetica="breakpoint"]')!).getPropertyValue("--surface-raised").trim();
        return { fondo: cs.backgroundColor, filo: parseFloat(cs.borderLeftWidth), filoColor: cs.borderLeftColor, arriba: parseFloat(cs.borderTopWidth), fondoDeLaPagina };
      });
      t.diagnostic(`aviso del tablero: ${JSON.stringify(s)}`);
      assert.equal(s.fondo, "rgb(255, 255, 255)", "tarjeta blanca (sin el ámbar relleno)");
      assert.equal(s.filo, 4, "con el filo de 4 px");
      assert.equal(s.filoColor, "rgb(138, 82, 0)", "el filo en el ámbar de la chapa (--warning)");
      assert.ok(s.arriba <= 1, "el resto del borde, fino");
    }
    await capturar(page, "1280-tablero");
    assert.deepEqual(errores, []);
    await contexto.close();
  });

  test("Ctrl/⌘+Z deshace la última acción (no dentro de un campo); «?» y la paleta abren la ayuda de atajos", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, contexto, errores } = await abrir({ width: 1280, height: 860 });
    await page.getByRole("heading", { name: "Agenda de canchas" }).waitFor();
    const luz = page.locator('[data-agenda="luz"]').first();
    const prendida = async () => (await luz.getAttribute("aria-pressed")) === "true";
    const antes = await prendida();

    // Dentro de un campo, Ctrl+Z es del campo: el club no se toca.
    await luz.click();
    assert.equal(await prendida(), !antes);
    await page.evaluate(() => {
      const i = document.createElement("input");
      i.id = "campo-de-prueba";
      i.setAttribute("aria-label", "Campo de prueba");
      document.querySelector("main")!.prepend(i);
    });
    await page.locator("#campo-de-prueba").focus();
    await page.keyboard.press("Control+z");
    assert.equal(await prendida(), !antes, "en un campo, Ctrl+Z no deshace lo del club");
    await page.getByRole("button", { name: "Deshacer" }).waitFor();

    // Fuera del campo, deshace (lo mismo que el botón «Deshacer» del aviso).
    await luz.focus();
    await page.keyboard.press("Control+z");
    await page.getByRole("status").filter({ hasText: /^Listo, se deshizo/ }).waitFor();
    assert.equal(await prendida(), antes, "Ctrl+Z deshizo la luz");
    assert.equal(await page.getByRole("button", { name: "Deshacer" }).count(), 0, "sólo la última: no queda otro «Deshacer»");
    // Con ⌘ también (Mac).
    await luz.click();
    await luz.focus();
    await page.keyboard.press("Meta+z");
    await page.getByRole("status").filter({ hasText: /^Listo, se deshizo/ }).waitFor();
    assert.equal(await prendida(), antes);

    // «?»: la ayuda de atajos, con Ctrl+Z en la lista. Escape la cierra.
    await page.locator("body").press("?");
    const ayuda = page.getByRole("dialog", { name: "Atajos de teclado" });
    await ayuda.waitFor();
    await ayuda.getByRole("row", { name: /Deshacer lo último/ }).waitFor();
    await ayuda.getByRole("row", { name: /Nuevo turno/ }).waitFor();
    await capturar(page, "1280-atajos");
    await page.keyboard.press("Escape");
    await ayuda.waitFor({ state: "detached" });

    // Desde la paleta: «Atajos de teclado».
    await page.keyboard.press("Control+k");
    const paleta = page.locator('dialog[data-ui="paleta"]');
    await paleta.waitFor();
    await paleta.getByRole("combobox").fill("atajos");
    await paleta.getByRole("option", { name: /Atajos de teclado/ }).click();
    await ayuda.waitFor();
    await ayuda.getByRole("button", { name: "Entendido" }).click();
    await ayuda.waitFor({ state: "detached" });
    assert.deepEqual(errores, []);
    await contexto.close();
  });

  test("jornada real bloqueada: «¿Sos nuevo/a? Pedí acceso» deja el pedido para el dueño (y no dos veces con el mismo nombre)", async (t) => {
    if (sinNavegador) return t.skip(sinNavegador);
    const { page, contexto, errores } = await abrir({ width: 390, height: 844 }, { reloj: "real", rol: "RECEPTION", sembrar: true });
    const bloqueo = page.locator('dialog[data-ui="bloqueo-del-club"]');
    await bloqueo.getByRole("heading", { name: "Pantalla bloqueada" }).waitFor();
    await bloqueo.getByText("¿Sos nuevo/a? Pedí acceso").click();
    const campo = bloqueo.getByLabel("Tu nombre");
    // Sin nombre, lo dice.
    await bloqueo.getByRole("button", { name: "Pedir acceso" }).click();
    await bloqueo.getByRole("alert").filter({ hasText: "Escribí tu nombre." }).waitFor();
    await campo.fill("Nico (finde)");
    await campo.press("Enter");
    await bloqueo.getByRole("status").filter({ hasText: "Listo: el pedido le llegó al dueño" }).waitFor();
    assert.equal(await campo.inputValue(), "", "el campo queda vacío");
    await capturar(page, "390-pedir-acceso");
    // El mismo nombre otra vez: el motor no lo duplica.
    await campo.fill("nico (finde)");
    await bloqueo.getByRole("button", { name: "Pedir acceso" }).click();
    await bloqueo.getByRole("alert").filter({ hasText: "Ya hay un pedido de acceso con ese nombre" }).waitFor();
    // Sigue bloqueada (pedir no da acceso) y el pedido quedó guardado en la jornada de este equipo.
    assert.equal(await bloqueo.evaluate((d) => (d as HTMLDialogElement).open), true);
    await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
    const guardado = await page.evaluate((k) => localStorage.getItem(k) ?? "", claveDeLaJornada("demo-club"));
    assert.match(guardado, /Nico \(finde\)/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "sin scroll de costado");
    assert.deepEqual(errores, []);
    await contexto.close();
  });
});
