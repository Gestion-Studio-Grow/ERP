// Tests de buscatufoto servido en su propio host: la reescritura sólo toma ese host, el manejador falla
// cerrado en cualquier otro, las rutas dinámicas caen en su página comodín y no hay forma de salir de la
// carpeta del sitio.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import {
  CARPETA_BUSCATUFOTO,
  candidatosDeRuta,
  esHostDeBuscatufoto,
  reescrituraDeBuscatufoto,
  responderBuscatufoto,
  tipoDeArchivo,
} from "./sitio-buscatufoto";

// Igual que el manejador: sólo archivos (las rutas comodín también existen como carpetas).
const enDisco = async (r: string) => statSync(path.join(process.cwd(), r), { throwIfNoEntry: false })?.isFile() ?? false;
const lector = async (r: string) => new Uint8Array(new TextEncoder().encode(`contenido de ${r}`));

test("sólo el host de buscatufoto se reescribe", () => {
  const { value } = reescrituraDeBuscatufoto().has[0];
  const re = new RegExp(`^${value}$`);
  for (const h of ["buscatufoto.gsgapp.com.ar", "buscatufoto-erp.vercel.app", "buscatufoto.localhost"]) assert.ok(re.test(h), h);
  for (const h of ["erp-ch.vercel.app", "chestetica-erp.vercel.app", "wpe.gsgapp.com.ar", "xbuscatufoto.gsgapp.com.ar", "buscatufoto"])
    assert.ok(!re.test(h), h);
  assert.ok(esHostDeBuscatufoto("buscatufoto.gsgapp.com.ar:443"));
  assert.ok(!esHostDeBuscatufoto(null));
});

test("rutas dinámicas caen en la página comodín", () => {
  assert.ok(candidatosDeRuta(["a", "torneo-qa"])!.includes("a/_.html"));
  assert.ok(candidatosDeRuta(["a", "torneo-qa.txt"])!.includes("a/_.txt"));
  assert.ok(candidatosDeRuta(["a", "torneo", "pedido", "p_x"])!.includes("a/_/pedido/_.html"));
  assert.ok(candidatosDeRuta(["a", "torneo", "__next._tree.txt"])!.includes("a/_/__next._tree.txt"));
  assert.ok(candidatosDeRuta(["f", "estudio"])!.includes("f/_.html"));
  assert.deepEqual(candidatosDeRuta([]), ["index.html"]);
  // la ruta literal va primero: /panel/albumes/nuevo no se confunde con un id
  assert.equal(candidatosDeRuta(["panel", "albumes", "nuevo"])![1], "panel/albumes/nuevo.html");
  assert.deepEqual(candidatosDeRuta(["btf", "_next", "static", "x.js"])!.slice(0, 1), ["_next/static/x.js"]);
});

test("no se puede salir de la carpeta del sitio", () => {
  assert.equal(candidatosDeRuta([".."]), null);
  assert.equal(candidatosDeRuta(["a", "..", "..", "package.json"]), null);
  assert.equal(candidatosDeRuta(["a", ""]), null);
  assert.equal(candidatosDeRuta(["a%2F.."]), null);
});

test("fuera del host de buscatufoto, 404 y no lee nada", async () => {
  let leidos = 0;
  const r = await responderBuscatufoto("chestetica-erp.vercel.app", [], enDisco, async (x) => (leidos++, lector(x)));
  assert.equal(r.status, 404);
  assert.equal(leidos, 0);
});

test("la exportación está en el repo y se sirve", async () => {
  for (const f of ["index.html", "a/_.html", "a/_/pedido/_.html", "f/_.html", "panel.html", "panel/albumes/_.html", "404.html"])
    assert.ok(existsSync(path.join(process.cwd(), CARPETA_BUSCATUFOTO, f)), f);
  const inicio = await responderBuscatufoto("buscatufoto.gsgapp.com.ar", undefined, enDisco, lector);
  assert.equal(inicio.status, 200);
  assert.equal(inicio.headers.get("content-type"), "text/html; charset=utf-8");
  const album = await responderBuscatufoto("buscatufoto.gsgapp.com.ar", ["a", "10k-costanera-muestra"], enDisco, lector);
  assert.equal(await album.text(), `contenido de ${CARPETA_BUSCATUFOTO}/a/_.html`);
  const nada = await responderBuscatufoto("buscatufoto.gsgapp.com.ar", ["no-existe"], enDisco, lector);
  assert.equal(nada.status, 404);
  assert.equal(tipoDeArchivo("_next/static/chunks/a.js"), "application/javascript; charset=utf-8");
});
