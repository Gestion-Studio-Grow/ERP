import { test } from "node:test";
import assert from "node:assert/strict";
import { estadoDePuesta, type EntradaPuesta } from "./puesta-a-punto";

const listo: EntradaPuesta = {
  cuit: "20304050607",
  condicionIva: "MONOTRIBUTO",
  puntoVenta: 3,
  puntoVentaDelContador: false,
  certificado: "produccion",
  modoDePrueba: false,
  regimenFacturaA: null,
  mes: { usadas: 4, limite: null },
  base: "/admin/facturacion?vista=arca",
  avisoAlContador: "https://wa.me/?text=a",
  ayuda: "https://wa.me/549?text=b",
  planes: "/planes",
};
const estados = (e: EntradaPuesta) => Object.fromEntries(estadoDePuesta(e).pasos.map((p) => [p.id, p.estado]));

test("monotributista conectado: listo para facturar, Factura A no aplica", () => {
  const p = estadoDePuesta(listo);
  assert.equal(p.listo, true);
  assert.equal(p.titulo, "Listo para facturar");
  assert.equal(p.cta, null);
  assert.equal(estados(listo)["factura-a"], "no-aplica");
  assert.equal(p.pasos.find((x) => x.id === "topes")?.detalle, "Sin tope de comprobantes. Este mes llevás 4.");
});

test("sin nada cargado: faltan datos, punto de venta y conexión; el botón va al primero", () => {
  const e = { ...listo, cuit: null, condicionIva: null, puntoVenta: null, certificado: "ninguno" as const };
  const p = estadoDePuesta(e);
  assert.equal(p.faltan, 3);
  assert.equal(p.titulo, "Te faltan 3 pasos");
  assert.deepEqual(p.cta, { etiqueta: "Pedírselo a nuestro equipo", href: "https://wa.me/549?text=b" });
});

test("modo de prueba cuenta como pendiente y el botón dice «Pasar a facturar en serio»", () => {
  const p = estadoDePuesta({ ...listo, certificado: "pruebas", modoDePrueba: true });
  assert.equal(p.titulo, "Te falta 1 paso");
  assert.equal(estados({ ...listo, certificado: "pruebas", modoDePrueba: true }).conexion, "prueba");
  assert.deepEqual(p.cta, { etiqueta: "Pasar a facturar en serio", href: "/admin/facturacion?vista=arca#paso-conexion" });
  assert.match(p.texto, /facturas de prueba/);
});

test("inscripto sin régimen A: falta, con «Avisar a mi contador»", () => {
  const e = { ...listo, condicionIva: "RESPONSABLE_INSCRIPTO" };
  const a = estadoDePuesta(e).pasos.find((x) => x.id === "factura-a")!;
  assert.equal(a.estado, "falta");
  assert.deepEqual(a.accion, { etiqueta: "Avisar a mi contador", href: "https://wa.me/?text=a" });
  assert.equal(estados({ ...e, regimenFacturaA: "A" })["factura-a"], "listo");
  assert.equal(estados({ ...e, regimenFacturaA: "M" })["factura-a"], "atencion");
});

test("topes: barra del mes; al llegar al tope es pendiente con «Ver planes»", () => {
  const casi = estadoDePuesta({ ...listo, mes: { usadas: 4, limite: 5 } }).pasos.find((x) => x.id === "topes")!;
  assert.equal(casi.estado, "atencion");
  assert.deepEqual(casi.barra, { usadas: 4, limite: 5, porcentaje: 80 });
  const lleno = estadoDePuesta({ ...listo, mes: { usadas: 5, limite: 5 } });
  assert.equal(lleno.listo, false);
  assert.deepEqual(lleno.cta, { etiqueta: "Ver planes", href: "/planes" });
});

test("punto de venta del contador: lo dice", () => {
  const pv = estadoDePuesta({ ...listo, puntoVentaDelContador: true }).pasos.find((x) => x.id === "punto-de-venta")!;
  assert.equal(pv.detalle, "Punto de venta 3. Lo definió tu contador.");
});
