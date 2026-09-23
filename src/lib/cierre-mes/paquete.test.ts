// El paquete del mes, EJECUTADO: el archivo que abre la contadora en Excel. Se arma con datos
// de ejemplo y se lee como lo leería ella: separador `;`, coma decimal, líneas CRLF, cada
// sección con su título, y "borrador" arriba si el mes no está congelado.

import { test } from "node:test";
import assert from "node:assert/strict";
import { armarPaquete, lineaDeEstado, nombreDelPaquete, type DatosPaquete } from "./paquete";
import { ACCION_CONGELAR, estadoDesdeAuditoria, evaluarPasos } from "./cierre-mes";
import { armarLibroIva, comprobanteDesdeInvoice } from "@/lib/libros/libro-iva";
import { BOM } from "@/lib/libros/csv-ar";

const congelado = estadoDesdeAuditoria([
  { action: ACCION_CONGELAR, createdAt: new Date("2026-09-02T15:00:00.000Z"), changes: { por: "Ana", listos: 7 } },
]);

const datos = (extra: Partial<DatosPaquete> = {}): DatosPaquete => ({
  mes: "2026-08",
  negocio: "Magra; Canning",
  generado: new Date("2026-09-03T13:05:00.000Z"),
  estado: congelado,
  pasos: evaluarPasos(
    {
      mes: "2026-08",
      caja: { usaCaja: true, cerradoHasta: "2026-08-31" },
      comprobantes: { total: 1, sinCae: 0, rechazados: 0 },
      anuladasConFactura: 0,
      extracto: null,
      compras: { total: 0, sinProveedor: 0 },
      comisiones: null,
      recuento: null,
    },
    congelado,
  ),
  libroCaja: ["Libro de caja — agosto 2026", "", "RESUMEN;Efectivo;MP / Transf.;Tarjeta;Total"],
  libroIva: armarLibroIva({
    comprobantes: [
      comprobanteDesdeInvoice({
        fecha: "20260831", tipoComprobante: 11, puntoVenta: 2, numero: 10,
        docTipo: 99, docNro: "0", neto: 15000.5, iva: 0, total: 15000.5,
      }),
    ],
    ventasSinComprobante: [{ clave: "pedido:o-7", fecha: "2026-08-30", tipo: "Venta del mostrador", numero: "Pedido 7", cliente: "Juan", total: 4200 }],
    compras: [],
    condicion: "monotributo",
  }),
  cuentasCorrientes: {
    movimientos: [
      { fecha: "2026-08-12", tipo: "Cobro de cuenta corriente", contraparte: "Parrilla El Tano", medio: "Transferencia", monto: 50000, nota: "" },
      { fecha: "2026-08-20", tipo: "Pago a proveedor", contraparte: "Frigorífico Sur", medio: "Efectivo", monto: 120000, nota: "Factura A 0001-00012345" },
    ],
    clientes: [{ nombre: "Parrilla El Tano", concepto: "Pedido 31", vence: "2026-09-10", saldo: 25000 }],
    proveedores: [],
  },
  stock: [
    { nombre: "Vacío", unidad: "kg", stock: 12.5, costo: 8000, valor: 100000 },
    { nombre: "Chorizo", unidad: "kg", stock: 3, costo: null, valor: 0 },
    { nombre: "Lomo", unidad: "kg", stock: -1.2, costo: 9000, valor: 0 },
  ],
  ...extra,
});

test("el paquete se abre bien en Excel: ';', coma decimal, CRLF y el BOM lo pone la descarga", () => {
  const out = armarPaquete(datos());
  assert.ok(out.includes("\r\n"), "líneas CRLF, como el libro de caja");
  assert.ok(!out.startsWith(BOM), "el texto no trae BOM: lo antepone la ruta al servir");
  assert.equal(BOM, "\uFEFF");
  const lineas = out.split("\r\n");
  // El nombre del negocio tenía un ';': va entre comillas, no parte la columna.
  assert.equal(lineas[0], 'Paquete del mes para el contador;"Magra; Canning";agosto 2026 (del 01/08/2026 al 31/08/2026)');
  assert.equal(lineas[1], "Estado;Versión final: mes congelado el 02/09 por Ana");
  assert.equal(lineas[2], "Generado;03/09/2026, 10:05");
  assert.ok(lineas.includes("1. LIBRO DE CAJA"));
  assert.ok(lineas.includes("2. LIBRO IVA: ventas con comprobante, ventas sin comprobante y compras"));
  assert.ok(lineas.includes("3. COBRANZAS Y PAGOS DE CUENTAS CORRIENTES"));
  assert.ok(lineas.includes("4. SALDOS AL 31/08/2026"));
  assert.ok(lineas.includes("5. STOCK VALORIZADO (al momento de la descarga)"));
  assert.ok(lineas.includes("2026-08-31;Factura C;00002-00000010;Consumidor final;Consumidor final;15000,50;0%;0,00;15000,50;"));
  assert.ok(lineas.includes("2026-08-20;Pago a proveedor;Frigorífico Sur;Efectivo;120000,00;Factura A 0001-00012345"));
  assert.ok(lineas.includes("Total cobrado;;;;50000,00"));
  assert.ok(lineas.includes("Parrilla El Tano;Pedido 31;2026-09-10;25000,00"));
  assert.ok(lineas.includes("Vacío;kg;12,5;8000,00;100000,00"));
  assert.ok(lineas.includes("Chorizo;kg;3;sin costo;0,00"));
  assert.ok(lineas.some((l) => /1 producto con stock no tiene costo y no suma\./.test(l)));
  // La lista de control, con los 8 pasos.
  const desde = lineas.indexOf("Paso;Estado;Detalle");
  assert.ok(desde > 0);
  assert.equal(lineas.slice(desde + 1, desde + 9).length, 8);
  assert.match(lineas[desde + 1], /^Días cerrados en la caja;Listo;/);
});

test("con el mes abierto, el paquete dice BORRADOR arriba y el archivo se llama así", () => {
  const abierto = estadoDesdeAuditoria([]);
  const out = armarPaquete(datos({ estado: abierto, pasos: null }));
  assert.match(out.split("\r\n")[1], /^Estado;BORRADOR: el mes no está congelado/);
  assert.doesNotMatch(out, /LISTA DE CONTROL/, "sin pasos (lo baja el contador), no se inventa la lista");
  assert.equal(nombreDelPaquete("2026-08", "magra", true), "paquete-2026-08-magra-borrador.csv");
  assert.equal(nombreDelPaquete("2026-08", "Magra Canning!", false), "paquete-2026-08-magracanning.csv");
  assert.equal(lineaDeEstado(abierto), "BORRADOR: el mes no está congelado y los números todavía pueden cambiar");
});

test("si las cuentas corrientes no están en la base, dice 'No disponible' (no una sección vacía)", () => {
  const out = armarPaquete(datos({ cuentasCorrientes: null, stock: [] }));
  const lineas = out.split("\r\n");
  const i = lineas.indexOf("3. COBRANZAS Y PAGOS DE CUENTAS CORRIENTES");
  assert.match(lineas[i + 1], /^No disponible;/);
  assert.ok(lineas.includes("(el negocio no controla stock)"));
});

test("lo que carga cualquiera no se ejecuta en la computadora de la contadora; los importes negativos siguen siendo números", () => {
  const out = armarPaquete(
    datos({
      // Una línea del libro de caja tal como la arma su export (que no neutraliza fórmulas).
      libroCaja: ["Libro de caja — agosto 2026", "", '2026-08-15;Egreso;=HYPERLINK("http://x","ver");Efectivo;-1500,00'],
      libroIva: armarLibroIva({
        comprobantes: [],
        ventasSinComprobante: [{ clave: "pedido:o-9", fecha: "2026-08-30", tipo: "Venta del mostrador", numero: "Pedido 9", cliente: "=2+5", total: 4200 }],
        compras: [{ clave: "compra:c-1", fecha: "2026-08-02", proveedor: "@SUMA(A1)", doc: "—", numero: "Compra 1", total: 1000 }],
        condicion: "sin-comprobantes",
      }),
      stock: [{ nombre: "+Lomo", unidad: "kg", stock: -1.2, costo: 9000, valor: 0 }],
    }),
  );
  const lineas = out.split("\r\n");
  assert.ok(lineas.includes(`2026-08-15;Egreso;"'=HYPERLINK(""http://x"",""ver"")";Efectivo;-1500,00`), "la fórmula del libro de caja sale desactivada");
  assert.ok(lineas.includes("2026-08-30;Venta del mostrador;Pedido 9;'=2+5;4200,00"));
  assert.ok(lineas.includes("2026-08-02;'@SUMA(A1);—;Compra 1;1000,00"));
  assert.ok(lineas.includes("'+Lomo;kg;-1,2;9000,00;0,00"), "el nombre se neutraliza; el stock negativo queda número");
  assert.doesNotMatch(out, /(^|;)[=+@]/m, "ningún campo arranca con =, + o @");
});
