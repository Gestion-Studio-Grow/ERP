// Importador de planillas (Etapa 2 · T3) — lectura del libro: rango acotado antes de leer e hipervínculos.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { planificarImportacion } from "./importador-core";

prepararAccionesDeServidor();
const libroDe = (...hojas: [string, XLSX.WorkSheet][]): Uint8Array => {
  const wb = XLSX.utils.book_new();
  for (const [n, ws] of hojas) XLSX.utils.book_append_sheet(wb, ws, n);
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
};

/** Un libro de 10 pestañas que declara A1:XFD2000 con una celda en XFD1. Se arma tocando el XML: el escritor de
 *  SheetJS recorrería las 32 millones de celdas del rango (11 s por pestaña). */
function libroHostil(): Uint8Array {
  const hojas: [string, XLSX.WorkSheet][] = [];
  for (let h = 0; h < 10; h++) {
    const ws = XLSX.utils.aoa_to_sheet([["Cliente", "Proyecto"]]);
    ws["A2000"] = { t: "s", v: "y" };
    ws["!ref"] = "A1:B2000";
    hojas.push([`P${h}`, ws]);
  }
  const cfb = XLSX.CFB.read(libroDe(...hojas), { type: "array" });
  cfb.FullPaths.forEach((ruta: string, i: number) => {
    if (!/xl\/worksheets\/sheet\d+\.xml$/.test(ruta)) return;
    const xml = Buffer.from(cfb.FileIndex[i].content as Uint8Array).toString("utf8");
    cfb.FileIndex[i].content = Buffer.from(xml.replace(/<dimension ref="[^"]+"\/>/, '<dimension ref="A1:XFD2000"/>').replace("</row>", '<c r="XFD1" t="str"><v>x</v></c></row>'));
  });
  return new Uint8Array(XLSX.CFB.write(cfb, { fileType: "zip", type: "array" }) as ArrayLike<number>);
}

test("libro chico con una celda en XFD1: el rango se acota antes de leer y se lee en menos de 1 s", async () => {
  const { leerLibro } = await import("./importador-xlsx");
  const bytes = libroHostil();
  assert.ok(bytes.length < 64 * 1024, `el archivo es chico (${bytes.length} bytes)`);
  const t0 = Date.now();
  const r = leerLibro(bytes);
  const ms = Date.now() - t0;
  assert.ok(r.ok);
  assert.ok(ms < 1000, `tardó ${ms} ms`);
  assert.equal(r.hojas.length, 10);
  assert.ok(r.hojas.every((h) => h.filas.length === 2000 && h.filas.every((f) => f.length <= 40)));
  assert.deepEqual(r.hojas[0].filas[0].slice(0, 2), ["Cliente", "Proyecto"]);
  assert.equal(r.hojas[0].filas[1999][0], "y");
});

test("el chip de Drive de Sheets: el link de la celda llega al plan", async () => {
  const { leerLibro } = await import("./importador-xlsx");
  const ws = XLSX.utils.aoa_to_sheet([["Cliente", "Proyecto", "Mes", "Año", "Etapa", "Status", "Fecha", "Drive"], ["Acme", "Gala", 3, 2026, "Aprobado", "", "15/03/2026", "Carpeta"]]);
  ws["H2"].l = { Target: "https://drive.google.com/drive/folders/abc" };
  const r = leerLibro(libroDe(["Julieta", ws]));
  assert.ok(r.ok);
  assert.deepEqual(r.hojas[0].links, { "1:7": "https://drive.google.com/drive/folders/abc" });
  const p = planificarImportacion(r.hojas, { tenantId: "t1", clientes: [], personas: [], claves: [], proyectos: [] });
  assert.equal(p.altas[0].carpetaUrl, "https://drive.google.com/drive/folders/abc");
});
