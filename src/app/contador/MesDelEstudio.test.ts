// «El mes» en pantalla (MesDelEstudio.tsx): vacío que dice que está todo, grupos en orden, la tecla
// que abre la ficha del cliente, quién lo resuelve y la lista larga plegada. Render de servidor.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import MesDelEstudio from "./MesDelEstudio";
import type { GrupoDelMes, PendienteDelCliente } from "./mes-core";

const pend = (i: number, extra: Partial<PendienteDelCliente> = {}): PendienteDelCliente => ({
  grupo: "extracto",
  clienteTenantId: `cli ${i}`,
  alias: `Cliente ${i}`,
  detalle: `Nunca se le cargó un extracto (${i}).`,
  accion: "Subilo desde su panel.",
  quien: "estudio",
  ...extra,
});

test("sin pendientes dice que el mes está al día, sin bloques vacíos", () => {
  const html = renderToStaticMarkup(h(MesDelEstudio, { grupos: [], mesTexto: "septiembre" }));
  assert.match(html, /Nada pendiente en septiembre/);
  assert.doesNotMatch(html, /data-ui="bloque"|<h2/);
});

test("un bloque por grupo en el orden recibido, la tecla abre la ficha y lo de Soporte GSG se marca", () => {
  const grupos: GrupoDelMes[] = [
    { id: "no_emite", titulo: "No pueden facturar", pendientes: [pend(1, { grupo: "no_emite", quien: "gsg", detalle: "Falta el CUIT." })] },
    { id: "extracto", titulo: "Sin extracto de septiembre", pendientes: [pend(2)] },
  ];
  const html = renderToStaticMarkup(h(MesDelEstudio, { grupos, mesTexto: "septiembre" }));
  assert.ok(html.indexOf("No pueden facturar") < html.indexOf("Sin extracto de septiembre"));
  assert.match(html, /2 cosas pendientes en septiembre/);
  assert.match(html, /href="\/contador\?cliente=cli%201#cartera-cliente"/);
  assert.match(html, /aria-label="Ver la ficha de Cliente 1"/);
  assert.match(html, /Soporte GSG/);
  // Tecla táctil: 44 px en el celular (h-11) aunque en la PC sea más baja.
  assert.match(html, /h-11 sm:h-9/);
});

test("con más de seis en un grupo, el resto queda plegado con cuántos faltan", () => {
  const pendientes = Array.from({ length: 9 }, (_, i) => pend(i));
  const html = renderToStaticMarkup(h(MesDelEstudio, { grupos: [{ id: "extracto", titulo: "Sin extracto", pendientes }], mesTexto: "septiembre" }));
  const antes = html.slice(0, html.indexOf("<details"));
  assert.equal((antes.match(/Ver la ficha de/g) ?? []).length, 6);
  assert.match(html, /Ver los otros 3/);
  assert.match(html, /min-h-11/);
});
