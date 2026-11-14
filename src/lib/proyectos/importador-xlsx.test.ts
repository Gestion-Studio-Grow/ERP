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

// ── Vuelta 2: el zip se inspecciona ANTES de XLSX.read (que parsea el libro entero antes de cualquier recorte) ──

/** Un libro de `hojas` pestañas cuyo XML se reemplaza por `datos` y se comprime: pocos KB que se inflan a mucho. */
function libroInflado(hojas: number, datos: string): Uint8Array {
  const pestañas: [string, XLSX.WorkSheet][] = Array.from({ length: hojas }, (_, h) => [`P${h}`, XLSX.utils.aoa_to_sheet([["Cliente", "Proyecto"], ["a", "b"]])]);
  const cfb = XLSX.CFB.read(libroDe(...pestañas), { type: "array" });
  cfb.FullPaths.forEach((ruta: string, i: number) => {
    if (!/xl\/worksheets\/sheet\d+\.xml$/.test(ruta)) return;
    const xml = Buffer.from(cfb.FileIndex[i].content as Uint8Array).toString("utf8");
    cfb.FileIndex[i].content = Buffer.from(xml.replace(/<dimension ref="[^"]+"\/>/, "").replace(/<sheetData>[\s\S]*<\/sheetData>|<sheetData\/>/, `<sheetData>${datos}</sheetData>`));
  });
  return new Uint8Array(XLSX.CFB.write(cfb, { fileType: "zip", type: "array", compression: true }) as ArrayLike<number>);
}
const filas = (n: number, celdas: number) => Array.from({ length: n }, (_, r) => `<row r="${r + 1}">${"<c><v>1</v></c>".repeat(celdas)}</row>`).join("");

async function rechazaRapido(bytes: Uint8Array, motivo: RegExp) {
  const { leerLibro } = await import("./importador-xlsx");
  assert.ok(bytes.length < 2 * 1024 * 1024, `pasa el tope de 2 MB (${bytes.length} bytes)`);
  const t0 = Date.now();
  const r = leerLibro(bytes);
  const ms = Date.now() - t0;
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, motivo);
  assert.ok(ms < 2000, `tardó ${ms} ms`);
}

test("bomba de celdas: 2001 filas × 600 celdas (18 MB de XML) se rechaza antes de parsear", async () => {
  await rechazaRapido(libroInflado(1, filas(2001, 600)), /demasiados datos.*15 MB/);
});

test("bomba de una sola fila con 1,1 millones de celdas: se rechaza (no se confía en el tamaño declarado)", async () => {
  await rechazaRapido(libroInflado(1, filas(1, 1_100_000)), /demasiados datos/);
});

test("más de 10 hojas en el zip: se rechaza con un mensaje claro", async () => {
  await rechazaRapido(libroInflado(11, filas(2, 2)), /más de 10 pestañas/);
});

test("zip dañado (sin directorio central) y entradas con método desconocido: se rechazan sin romper", async () => {
  const { leerLibro, inspeccionarZip } = await import("./importador-xlsx");
  const sano = libroInflado(1, filas(2, 2));
  assert.deepEqual(inspeccionarZip(sano), { ok: true });
  const sinFin = sano.slice(0, sano.length - 22);
  const r = leerLibro(sinFin);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /dañado/);
  // Método 99 en el primer encabezado local.
  const raro = sano.slice();
  raro[8] = 99;
  assert.equal(inspeccionarZip(raro).ok, false);
});

test("10 hojas de 2000 × 40 sin estilos (dentro de los topes) se leen enteras", async () => {
  const { leerLibro } = await import("./importador-xlsx");
  const bytes = libroInflado(10, filas(2000, 40));
  const t0 = Date.now();
  const r = leerLibro(bytes);
  const ms = Date.now() - t0;
  assert.ok(r.ok, r.ok ? "" : r.error);
  assert.equal(r.hojas.length, 10);
  assert.equal(r.hojas[9].filas.length, 2000);
  assert.ok(ms < 5000, `tardó ${ms} ms (~0,9 s medido; holgura para CI cargado)`);
});


// ── Vuelta 3: el tamaño DECLARADO también se topea (SheetJS reserva `Buffer.allocUnsafe` por el del encabezado local) ──

/** Reescribe el tamaño descomprimido declarado (directorio central offset 24, encabezado local offset 22) de las
 *  entradas comprimidas que cumplen `filtro`. */
function conDeclarado(bytes: Uint8Array, declarado: number, filtro: (nombre: string) => boolean = () => true): Uint8Array {
  const b = Buffer.from(bytes);
  let fin = b.length - 4;
  while (!(b[fin] === 0x50 && b[fin + 1] === 0x4b && b[fin + 2] === 0x05 && b[fin + 3] === 0x06)) fin--;
  let p = b.readUInt32LE(fin + 16);
  for (let i = 0, n = b.readUInt16LE(fin + 8); i < n; i++) {
    const ln = b.readUInt16LE(p + 28), le = b.readUInt16LE(p + 30), lc = b.readUInt16LE(p + 32), local = b.readUInt32LE(p + 42);
    if (filtro(b.toString("latin1", p + 46, p + 46 + ln)) && b.readUInt16LE(local + 8) === 8) {
      b.writeUInt32LE(declarado, p + 24);
      b.writeUInt32LE(declarado, local + 22);
    }
    p += 46 + ln + le + lc;
  }
  return new Uint8Array(b);
}

test("bomba por tamaño declarado: 10 hojas que declaran 500 MB cada una se rechazan sin reservar memoria", async () => {
  const sano = libroInflado(10, filas(2, 2));
  await rechazaRapido(conDeclarado(sano, 500_000_000), /demasiados datos/);
  // Una sola entrada que declara 20 MB (más que el tope total) también.
  await rechazaRapido(conDeclarado(sano, 20_000_000, (n) => /sheet1\.xml$/.test(n)), /demasiados datos/);
});

test("tamaño declarado que no coincide con lo inflado (sin data descriptor): zip armado a mano, se rechaza", async () => {
  const { inspeccionarZip } = await import("./importador-xlsx");
  const sano = libroInflado(1, filas(2, 2));
  assert.deepEqual(inspeccionarZip(sano), { ok: true });
  const r = inspeccionarZip(conDeclarado(sano, 1_000_000, (n) => /sheet1\.xml$/.test(n)));
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /dañado/);
});
