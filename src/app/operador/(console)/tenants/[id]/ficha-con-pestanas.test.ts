// La pestaña de la ficha sigue a la URL en navegación suave. El botón «Personas» de Puesta en marcha
// es un <Link href="?pestana=personas">: Next no remonta la ficha, así que la pestaña activa tiene
// que enterarse sola de que la URL cambió.
//
// FichaConPestanas de verdad, con React y un DOM (jsdom). El router es una pieza falsa que copia las
// dos reglas de Next que deciden este caso (next/dist/client/components/app-router.js):
//   · `history.replaceState` con un estado que trae `__NA` se toma como propio de Next y NO actualiza
//     useSearchParams; sin `__NA`, sí, sin pedirle nada al servidor.
//   · un <Link> entrega URL y props nuevos a la misma instancia, con lo tipeado intacto.

import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { leerPestana, type PestanaFicha } from "../../negocios-core";

// El repo no trae los tipos de jsdom: se describe sólo lo que se usa acá.
type Dom = { window: Window & typeof globalThis; reconfigure(o: { url: string }): void };
const { JSDOM } = createRequire(import.meta.url)("jsdom") as { JSDOM: new (html: string, o: { url: string; pretendToBeVisual: boolean }) => Dom };

const RAIZ = fileURLToPath(new URL("../../../../../../", import.meta.url));
const FICHA = "http://consola.test/operador/tenants/n1";

const ENTRADA = `
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import FichaConPestanas from "@/app/operador/(console)/tenants/[id]/FichaConPestanas";
globalThis.__ficha = { act, h, createRoot, FichaConPestanas };
`;

const FALSO_NAVEGACION = `
import { useSyncExternalStore } from "react";
export const useSearchParams = () => useSyncExternalStore(globalThis.__router.suscribir, globalThis.__router.leer);
`;

const PESTANAS = (["puesta", "fiscal", "plan", "marca", "personas", "historial"] as const).map((id) => ({ id, etiqueta: id }));

type Pieza = {
  act: (f: () => void) => void;
  h: (t: unknown, p?: unknown, ...hijos: unknown[]) => unknown;
  createRoot: (el: Element) => { render(n: unknown): void; unmount(): void };
  FichaConPestanas: unknown;
};

let pieza: Pieza | null = null;
let motivo = "";
let dom: Dom;
let raiz: { render(n: unknown): void; unmount(): void } | null = null;
let params = new URLSearchParams();
const escuchas = new Set<() => void>();

const aplicarUrl = (url: string | URL) => {
  params = new URL(String(url), dom.window.location.href).searchParams;
  for (const f of escuchas) f();
};

/** Lo que dibuja el servidor para la URL actual: `inicial` y `pedidaEnLaUrl` como en page.tsx. */
function dibujar() {
  const { h, FichaConPestanas } = pieza!;
  const modulo = params.get("modulo");
  const pestana = params.get("pestana") ?? undefined;
  const inicial: PestanaFicha = modulo || params.get("plan") ? "plan" : leerPestana(pestana);
  const paneles = Object.fromEntries(PESTANAS.map((p) => [p.id, h("input", { id: `campo-${p.id}`, defaultValue: "" })]));
  raiz!.render(h(FichaConPestanas, { negocioId: "n1", inicial, pedidaEnLaUrl: !!pestana || !!modulo, pestanas: PESTANAS, paneles }));
}

function abrir(sufijo: string) {
  dom.reconfigure({ url: `${FICHA}${sufijo}` });
  params = new URL(dom.window.location.href).searchParams;
  raiz = pieza!.createRoot(dom.window.document.getElementById("raiz")!);
  pieza!.act(() => dibujar());
}

/** El <Link>: agrega una entrada al historial y baja URL y props nuevos a la misma instancia. */
function navegar(sufijo: string) {
  pieza!.act(() => {
    historialNativo.push({ __NA: true }, "", sufijo);
    aplicarUrl(sufijo);
    dibujar();
  });
}

function tocarPestana(id: PestanaFicha) {
  const el = dom.window.document.getElementById(`pestana-${id}`)!;
  pieza!.act(() => {
    el.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

const activa = () => dom.window.document.querySelector('[role="tabpanel"]:not([hidden])')?.id.replace("panel-", "");

let historialNativo: { push: History["pushState"]; replace: History["replaceState"] };

describe("FichaConPestanas sigue a la URL", () => {
  before(async () => {
    dom = new JSDOM('<!doctype html><div id="raiz"></div>', { url: FICHA, pretendToBeVisual: true });
    const g = globalThis as unknown as Record<string, unknown>;
    g.window = dom.window;
    g.document = dom.window.document;
    g.IS_REACT_ACT_ENVIRONMENT = true;
    g.__router = {
      suscribir: (f: () => void) => {
        escuchas.add(f);
        return () => escuchas.delete(f);
      },
      leer: () => params,
    };

    const h = dom.window.history;
    historialNativo = { push: h.pushState.bind(h), replace: h.replaceState.bind(h) };
    h.replaceState = (data: { __NA?: boolean } | null, u: string, url?: string | URL | null) => {
      if (data?.__NA) return historialNativo.replace(data, u, url);
      if (url) aplicarUrl(url);
      return historialNativo.replace({ ...data, __NA: true }, u, url);
    };

    try {
      const esbuild = await import("esbuild");
      const r = await esbuild.build({
        stdin: { contents: ENTRADA, loader: "tsx", resolveDir: RAIZ },
        bundle: true,
        write: false,
        platform: "node",
        format: "iife",
        jsx: "automatic",
        tsconfig: join(RAIZ, "tsconfig.json"),
        define: { "process.env.NODE_ENV": '"development"' },
        logLevel: "silent",
        plugins: [
          {
            name: "falsos",
            setup(b) {
              b.onResolve({ filter: /^next\/navigation$/ }, (a) => ({ path: a.path, namespace: "falso" }));
              b.onLoad({ filter: /.*/, namespace: "falso" }, () => ({ contents: FALSO_NAVEGACION, loader: "js", resolveDir: RAIZ }));
            },
          },
        ],
      });
      new Function("require", r.outputFiles[0].text)(createRequire(import.meta.url));
      pieza = (globalThis as unknown as { __ficha: Pieza }).__ficha;
    } catch (e) {
      motivo = `sin esbuild o no compila: ${(e as Error).message.slice(0, 300)}`;
    }
  });

  beforeEach(() => {
    if (raiz) pieza?.act(() => raiz!.unmount());
    raiz = null;
    escuchas.clear();
    dom.window.sessionStorage.clear();
    dom.window.document.getElementById("raiz")!.innerHTML = "";
    dom.reconfigure({ url: FICHA });
    historialNativo.replace({ __NA: true }, "", FICHA);
  });

  after(() => {
    if (raiz) pieza?.act(() => raiz!.unmount());
    const g = globalThis as unknown as Record<string, unknown>;
    delete g.window;
    delete g.document;
    dom.window.close();
  });

  test("el botón de Puesta en marcha abre su pestaña", (t) => {
    if (!pieza) return t.skip(motivo);
    abrir("");
    assert.equal(activa(), "puesta");
    navegar("?pestana=personas");
    assert.equal(activa(), "personas");
    navegar("?pestana=fiscal");
    assert.equal(activa(), "fiscal");
  });

  test("abre también la segunda vez, aunque el servidor mande el mismo `inicial`", (t) => {
    if (!pieza) return t.skip(motivo);
    abrir("?pestana=personas");
    assert.equal(activa(), "personas");
    tocarPestana("puesta");
    assert.equal(activa(), "puesta");
    assert.match(dom.window.location.search, /pestana=puesta/);
    navegar("?pestana=personas");
    assert.equal(activa(), "personas");
    tocarPestana("puesta");
    navegar("?pestana=personas");
    assert.equal(activa(), "personas");
  });

  test("tocar una pestaña le avisa a Next y conserva su estado de historial", (t) => {
    if (!pieza) return t.skip(motivo);
    abrir("?pestana=personas");
    tocarPestana("fiscal");
    assert.equal(params.get("pestana"), "fiscal");
    assert.equal(dom.window.history.state?.__NA, true);
    assert.equal(activa(), "fiscal");
  });

  test("no se pierde lo tipeado en otra pestaña", (t) => {
    if (!pieza) return t.skip(motivo);
    abrir("?pestana=fiscal");
    const campo = dom.window.document.getElementById("campo-fiscal") as HTMLInputElement;
    campo.value = "20-12345678-9";
    tocarPestana("puesta");
    navegar("?pestana=personas");
    navegar("?pestana=fiscal");
    assert.equal(activa(), "fiscal");
    assert.equal(dom.window.document.getElementById("campo-fiscal"), campo);
    assert.equal(campo.value, "20-12345678-9");
  });

  test("volver de guardar sin `?pestana=` deja la pestaña donde estaba", (t) => {
    if (!pieza) return t.skip(motivo);
    abrir("?pestana=personas");
    tocarPestana("plan");
    navegar("?ok=guardado");
    assert.equal(activa(), "plan");
    navegar("?pestana=personas");
    assert.equal(activa(), "personas");
  });

  test("una `?pestana=` que no existe no mueve nada", (t) => {
    if (!pieza) return t.skip(motivo);
    abrir("?pestana=fiscal");
    navegar("?pestana=inventada");
    assert.equal(activa(), "fiscal");
  });

  test("al llegar a la ficha: el ancla, la última tocada con `ok`, y `modulo`", (t) => {
    if (!pieza) return t.skip(motivo);
    abrir("?ok=guardado#apps");
    assert.equal(activa(), "plan");
    pieza.act(() => raiz!.unmount());

    dom.window.sessionStorage.setItem("consola-ficha-pestana:n1", "marca");
    abrir("?ok=guardado");
    assert.equal(activa(), "marca");
    pieza.act(() => raiz!.unmount());

    abrir("?modulo=caja");
    assert.equal(activa(), "plan");
    pieza.act(() => raiz!.unmount());

    abrir("?pestana=personas");
    assert.equal(activa(), "personas");
    pieza.act(() => raiz!.unmount());

    dom.window.sessionStorage.clear();
    abrir("");
    assert.equal(activa(), "puesta");
  });
});
