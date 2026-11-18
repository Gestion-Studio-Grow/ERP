// E2 (MIA-093): el formulario de Equipo, de verdad sobre jsdom (React y el componente reales; sólo `guardarPersona` simulada).
// Cuando el servidor rechaza, lo que la persona escribió queda en pantalla para corregirlo: el `<form action>` de React 19
// resetea los campos al terminar la acción y devolvía la ficha a lo guardado, borrando justo lo que había que cambiar.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { before, test } from "node:test";

const raiz = process.cwd();
const requerir = createRequire(join(raiz, "package.json"));
const { JSDOM } = requerir("jsdom");
const esbuild = requerir("esbuild");

const dom = new JSDOM('<!doctype html><body><div id="r"></div></body>', { url: "http://x.test/" });
const g = globalThis as unknown as Record<string, unknown>;
for (const k of ["window", "document", "HTMLElement", "HTMLFormElement", "HTMLInputElement", "FormData", "Element", "Node", "Event", "SubmitEvent", "MouseEvent", "getComputedStyle"]) {
  Object.defineProperty(g, k, { value: k === "window" ? dom.window : dom.window[k], configurable: true, writable: true });
}
Object.defineProperty(g, "navigator", { value: dom.window.navigator, configurable: true });
g.IS_REACT_ACT_ENVIRONMENT = true;
console.error = () => {};

const carpeta = join(raiz, "node_modules", ".cache", "form-persona-rechazo");
mkdirSync(carpeta, { recursive: true });
const salida = join(carpeta, "form.cjs");
/* eslint-disable @typescript-eslint/no-explicit-any */
let FormPersona: any, React: any, createRoot: any, act: any;
before(async () => {
  await esbuild.build({
    stdin: {
      contents: `export { FormPersona } from "./FormPersona"; export * as React from "react"; export { createRoot } from "react-dom/client";`,
      resolveDir: join(raiz, "src/app/admin/(dashboard)/proyectos/equipo"),
      loader: "ts",
    },
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile: salida,
    external: ["react", "react/*", "react-dom", "react-dom/*", "next", "next/*"],
    jsx: "automatic",
    logLevel: "error",
    tsconfig: join(raiz, "tsconfig.json"),
    define: { "process.env.NODE_ENV": '"development"' },
    plugins: [
      {
        name: "servidor-simulado",
        setup(b: any) {
          b.onResolve({ filter: /^@\/lib\/proyectos\/acciones-gestion$/ }, (a: { path: string }) => ({ path: a.path, namespace: "stub" }));
          b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export async function guardarPersona(fd) { return globalThis.__guardar(fd); }", loader: "js" }));
        },
      },
    ],
  });
  await esbuild.stop();
  ({ FormPersona, React, createRoot } = requerir(salida));
  ({ act } = React);
});

const VALORES = { id: "p1", nombre: "Dueño de MIA", email: "duenio@mia.demo", rol: "DIRECCION", puesto: "Dirección general", sueldoBase: 6_500_000, facturaA: "MIA", userId: "u1" };
const RECHAZO = "No podés desvincular tu ficha de tu cuenta ni pasarla a otra: que lo haga otra persona de Dirección.";

async function montar(valores?: typeof VALORES) {
  dom.window.document.body.innerHTML = '<div id="r"></div>';
  const r = createRoot(dom.window.document.getElementById("r"));
  await act(async () => r.render(React.createElement(FormPersona, { valores, sueldo: "editar", soloDireccionDa: false })));
  return r;
}
const campo = (name: string) => dom.window.document.querySelector(`[name="${name}"]`) as HTMLInputElement;
function escribir(name: string, valor: string) {
  const input = campo(name);
  Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(input, valor);
  input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
}
async function guardar() {
  const form = dom.window.document.querySelector("form") as HTMLFormElement;
  await act(async () => form.requestSubmit());
  await act(async () => {}); // la respuesta del servidor simulado y el render que la sigue
}
const texto = () => dom.window.document.body.textContent ?? "";

test("si el servidor rechaza, la ficha queda con lo que la persona escribió y el aviso a la vista", async () => {
  g.__guardar = async () => ({ ok: false, error: RECHAZO });
  const r = await montar(VALORES);
  escribir("email", "admin@mia.demo");
  escribir("puesto", "Dirección y finanzas");
  campo("vincular").click(); // destildar
  assert.equal(campo("vincular").checked, false);
  await guardar();
  assert.ok(texto().includes(RECHAZO), `falta el aviso: ${texto()}`);
  assert.equal(campo("email").value, "admin@mia.demo");
  assert.equal(campo("puesto").value, "Dirección y finanzas");
  assert.equal(campo("vincular").checked, false, "la casilla volvió a tildarse sola");
  await act(async () => r.unmount());
});

test("si falla la red, también queda lo escrito", async () => {
  g.__guardar = async () => {
    throw new Error("red");
  };
  const r = await montar(VALORES);
  escribir("nombre", "Dueño de MIA SRL");
  await guardar();
  assert.ok(texto().includes("No se pudo guardar. Probá de nuevo."));
  assert.equal(campo("nombre").value, "Dueño de MIA SRL");
  await act(async () => r.unmount());
});

test("un alta que sale bien deja el formulario vacío para la próxima persona", async () => {
  let recibido: FormData | null = null;
  g.__guardar = async (fd: FormData) => {
    recibido = fd;
    return { ok: true };
  };
  const r = await montar();
  escribir("nombre", "Persona nueva");
  escribir("email", "nueva@mia.demo");
  await guardar();
  assert.equal(recibido!.get("nombre"), "Persona nueva");
  assert.ok(texto().includes("Guardado."));
  assert.equal(campo("nombre").value, "");
  assert.equal(campo("email").value, "");
  await act(async () => r.unmount());
});
