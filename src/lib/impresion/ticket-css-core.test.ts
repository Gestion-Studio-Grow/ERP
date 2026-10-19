// El papel del ticket (plan T-4): 58 y 80 mm, y el 58 IGUAL byte a byte al de antes.

import { test } from "node:test";
import assert from "node:assert/strict";
import { anchoSeguro, cssDeTicket, documentoImprimible, MEDIDAS } from "./ticket-css-core";
import { htmlDelTicket, type RenglonTicket } from "@/app/admin/(dashboard)/vender/reglas-venta";

const RENGLONES: RenglonTicket[] = [
  { texto: "MAGRA <b>", fuerte: true },
  { texto: "Ticket #12 · 16/10/2026 10:15", chico: true },
  { texto: "Vacío", importe: "$15.500,00" },
  { texto: "  1,24 kg × $12.500,00/kg", chico: true },
  { texto: "TOTAL", importe: "$15.500,00", fuerte: true },
  { texto: "No válido como factura", chico: true },
];

// El documento de 58 mm tal como salía ANTES de compartir el papel (reglas-venta.ts, commit
// 53844bc4). Si este texto cambia, cambia lo que imprimen las térmicas que ya andan.
const TICKET_58_DE_ANTES =
  '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Ticket</title><style>@page{size:58mm auto;margin:0}html,body{margin:0;padding:0;background:#fff;color:#000}body{width:58mm;box-sizing:border-box;padding:2mm 3mm 6mm;font:11px/1.35 ui-monospace,Menlo,Consolas,monospace}.r{display:flex;justify-content:space-between;gap:2mm}.r span:last-child{white-space:nowrap}.f{font-weight:700}.c{font-size:10px}div{margin:0 0 1px;overflow-wrap:anywhere}</style></head><body><div class="f">MAGRA &lt;b&gt;</div><div class="c">Ticket #12 · 16/10/2026 10:15</div><div class="r "><span>Vacío</span><span>$15.500,00</span></div><div class="c">1,24 kg × $12.500,00/kg</div><div class="r f"><span>TOTAL</span><span>$15.500,00</span></div><div class="c">No válido como factura</div></body></html>';

test("regresión: el ticket de 58 mm sale idéntico al de antes (sin ancho y con ancho 58)", () => {
  assert.equal(htmlDelTicket(RENGLONES), TICKET_58_DE_ANTES);
  assert.equal(htmlDelTicket(RENGLONES, { ancho: 58 }), TICKET_58_DE_ANTES);
});

test("80 mm: página y cuerpo de 80, letra 12 px y márgenes más anchos", () => {
  const html = htmlDelTicket(RENGLONES, { ancho: 80 });
  assert.match(html, /@page\{size:80mm auto;margin:0\}/);
  assert.match(html, /body\{width:80mm;box-sizing:border-box;padding:3mm 4mm 6mm;font:12px\/1\.35/);
  assert.match(html, /\.c\{font-size:11px\}/);
  assert.doesNotMatch(html, /58mm/);
  // El contenido es el mismo: sólo cambia el papel.
  assert.equal(html.split("<body>")[1], TICKET_58_DE_ANTES.split("<body>")[1]);
});

test("cssDeTicket: 58 y 80 generan su @page; cualquier otra cosa es el rollo chico", () => {
  assert.match(cssDeTicket(58), /^@page\{size:58mm auto;margin:0\}/);
  assert.match(cssDeTicket(80), /^@page\{size:80mm auto;margin:0\}/);
  assert.equal(anchoSeguro(80), 80);
  for (const raro of [58, 100, "80", null, undefined, Number.NaN]) assert.equal(anchoSeguro(raro), 58);
  // Abajo siempre 6 mm, para la cuchilla.
  for (const a of [58, 80] as const) assert.match(cssDeTicket(a), /6mm;font/);
  assert.ok(MEDIDAS[80].fuente > MEDIDAS[58].fuente);
});

test("documentoImprimible: el título va escapado y los estilos van después del papel", () => {
  const doc = documentoImprimible({ titulo: 'Remito <x> "1"', ancho: 80, cuerpoHtml: "<p>hola</p>", estilos: ".x{color:red}" });
  assert.match(doc, /<title>Remito &lt;x&gt; &quot;1&quot;<\/title>/);
  assert.ok(doc.indexOf("@page") < doc.indexOf(".x{color:red}"));
  assert.ok(doc.endsWith("<body><p>hola</p></body></html>"));
});

test("el texto que tipeó una persona va escapado también en 80 mm", () => {
  const html = htmlDelTicket([{ texto: "Bolsa <térmica>", importe: "$1 <2>" }], { ancho: 80 });
  assert.match(html, /Bolsa &lt;térmica&gt;/);
  assert.match(html, /\$1 &lt;2&gt;/);
  assert.doesNotMatch(html, /<térmica>/);
});
