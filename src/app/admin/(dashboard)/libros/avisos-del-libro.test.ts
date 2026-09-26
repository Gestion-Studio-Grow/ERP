// Refutador, vuelta 4: la PANTALLA del Libro IVA (no sólo el CSV) dice qué locales del mismo CUIT suma
// y muestra aparte las facturas de prueba. Se renderiza el componente que usa la página, y se verifica
// que la página lo pone en los dos diseños.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import AvisosDelLibro from "./AvisosDelLibro";
import { armarLibroIva, comprobanteDesdeInvoice } from "@/lib/libros/libro-iva";

const deInvoice = (numero: number, pv: number) =>
  comprobanteDesdeInvoice({
    id: `f-${pv}-${numero}`, fecha: "20260926", tipoComprobante: 6, puntoVenta: pv, numero, docTipo: 99, docNro: "0",
    neto: 1000, iva: 210, total: 1210,
  });

const html = (libro: Parameters<typeof AvisosDelLibro>[0]["libro"]) =>
  renderToStaticMarkup(createElement(AvisosDelLibro, { libro })).replace(/<!-- -->/g, "");

test("con dos locales del mismo CUIT y una factura de prueba: la pantalla dice qué suma y muestra la de prueba aparte", () => {
  const libro = armarLibroIva({
    comprobantes: [deInvoice(1, 3), deInvoice(1, 4)],
    comprobantesDePrueba: [deInvoice(2, 3)],
    ventasSinComprobante: [],
    compras: [],
    condicion: "responsable-inscripto",
    negocios: [
      { nombre: "Supermercados Río Chico SA", puntoVenta: 3 },
      { nombre: "Río Chico Bernal", puntoVenta: 4 },
    ],
  });
  const h = html(libro);
  assert.match(h, /Este libro suma los locales del mismo CUIT: Supermercados Río Chico SA \(punto de venta 3\) y Río Chico Bernal \(punto de venta 4\)/);
  assert.match(h, /Facturas de prueba \(1\)/);
  assert.match(h, /CAE simulado del modo prueba: no se declaran ni cuentan para los topes\. No están en los totales de abajo\./);
  assert.match(h, /00003-00000002 · 26\/09\/2026/, "la de prueba, con su número y su fecha");
  assert.doesNotMatch(h, /00004-00000001/, "las reales no van en el aviso: van en la tabla de siempre");
  assert.match(h, /min-h-11/, "cada renglón mide 44 px o más");
});

test("un solo negocio y sin facturas de prueba: no agrega nada a la pantalla", () => {
  const libro = armarLibroIva({
    comprobantes: [deInvoice(1, 3)],
    ventasSinComprobante: [],
    compras: [],
    condicion: "responsable-inscripto",
    negocios: [{ nombre: "Kiosco Solo", puntoVenta: 1 }],
  });
  assert.equal(html(libro), "");
});

test("la página del Libro IVA pone los avisos arriba de los libros, en los dos diseños", () => {
  const pagina = readFileSync(join(import.meta.dirname, "page.tsx"), "utf8");
  const libros = pagina.match(/<LibrosClient\b/g)?.length ?? 0;
  assert.ok(libros >= 2);
  assert.equal(pagina.match(/<AvisosDelLibro libro=\{libro\} \/>/g)?.length ?? 0, libros);
  for (const trozo of pagina.split(/<LibrosClient\b/).slice(0, -1)) {
    const elementos = trozo.match(/<[A-Z]\w*/g) ?? [];
    assert.equal(elementos.at(-1), "<AvisosDelLibro", "el aviso va justo antes de cada LibrosClient");
  }
});
