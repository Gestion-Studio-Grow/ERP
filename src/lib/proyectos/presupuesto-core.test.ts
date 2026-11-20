// MIA T06 · presupuesto-core (puro): personal, listas, anticipo por línea, totales y cuotas de adicionales, quién aprueba.
import { test } from "node:test";
import assert from "node:assert/strict";
import { anticipoDeLaLinea, cantidadDeLaLinea, cuotasDeAdicionales, DIAS_POR_DEFECTO, errorDeAnticipo, errorDeAprobador, errorDeListas, errorDeMarcaPrevision, errorDePersonal, partir, topeDeAdicionales, totalesDelAdicional, type Adicional, type LineaAdicional } from "./presupuesto-core";

const linea = (l: Partial<LineaAdicional>): LineaAdicional => ({ id: "l", sector: "Producción", categoria: "General", detalle: "x", proveedor: null, supplierId: null, cantidad: 1, puestos: null, horas: null, dias: null, costoCentavos: 0, precioCentavos: 0, anticipoPct: null, ...l });

test("O08 personal: puestos × horas × días; los tres o ninguno, con topes", () => {
  assert.equal(cantidadDeLaLinea(5, { puestos: 2, horas: 7.5, dias: 3 }), 45);
  assert.equal(cantidadDeLaLinea(5, { puestos: null, horas: null, dias: null }), 5);
  assert.equal(errorDePersonal({ puestos: null, horas: null, dias: null }), null);
  assert.match(errorDePersonal({ puestos: 2, horas: 8, dias: null })!, /puestos, horas y días/);
  assert.match(errorDePersonal({ puestos: 1.5, horas: 8, dias: 1 })!, /puestos/);
  assert.match(errorDePersonal({ puestos: 1, horas: 25, dias: 1 })!, /horas/);
  assert.match(errorDePersonal({ puestos: 1, horas: 8, dias: 0 })!, /días/);
});

test("O08 listas: sector y categoría fuera de la lista del negocio se rechazan", () => {
  const listas = { sectores: ["Producción"], categorias: ["General"] };
  assert.equal(errorDeListas({ sector: "Producción", categoria: "General" }, listas), null);
  assert.match(errorDeListas({ sector: "Catering", categoria: "General" }, listas)!, /sector «Catering»/);
  assert.match(errorDeListas({ sector: "Producción", categoria: "" }, listas)!, /categoría «\(vacía\)»/);
});

test("O12 anticipo: entero 0-100; la línea manda, si no el proveedor, si no 50; partir suma exacto", () => {
  assert.equal(errorDeAnticipo(30), null);
  assert.ok(errorDeAnticipo(30.5));
  assert.ok(errorDeAnticipo(101));
  assert.equal(anticipoDeLaLinea(30, 70), 30);
  assert.equal(anticipoDeLaLinea(null, 70), 70);
  assert.equal(anticipoDeLaLinea(undefined, undefined), 50);
  for (const [total, pct] of [[100_001, 33], [1, 50], [999_999, 7]]) {
    const { anticipo, saldo } = partir(total, pct);
    assert.equal(anticipo + saldo, total);
  }
});

test("O09 aprobador y O12 previsión: Dirección fuera del equipo; la previsión, Administración", () => {
  assert.equal(errorDeAprobador({ rol: "DIRECCION", enElEquipo: false }), null);
  assert.match(errorDeAprobador({ rol: "DIRECCION", enElEquipo: true })!, /equipo/);
  assert.match(errorDeAprobador({ rol: "COMERCIAL", enElEquipo: false })!, /Dirección/);
  assert.equal(errorDeMarcaPrevision("ADMINISTRACION"), null);
  for (const rol of ["DIRECCION", "COMERCIAL", "PRODUCCION"]) assert.ok(errorDeMarcaPrevision(rol));
});

test("O11 totales y cuotas: sólo los aprobados; cobro = precio con IVA; claves propias del adicional", () => {
  const ad: Adicional = { id: "A", numero: 1, nombre: "Pantalla", estado: "APROBADO", ivaPct: 21, respondidoEl: new Date("2026-12-01"), lineas: [linea({ id: "L1", supplierId: "S", cantidad: 2, costoCentavos: 25_000, precioCentavos: 40_000, anticipoPct: 40 }), linea({ id: "L2", puestos: 2, horas: 5, dias: 1, costoCentavos: 1_000, precioCentavos: 2_000 })] };
  assert.deepEqual(totalesDelAdicional(ad), { costo: 60_000, precio: 100_000, iva: 21_000, precioConIva: 121_000 });
  assert.equal(topeDeAdicionales([ad, { ...ad, estado: "ENVIADO" }]), 121_000);
  const c = cuotasDeAdicionales([ad, { ...ad, id: "B", estado: "RECHAZADO" }], { proyectoId: "P", nombre: "n", fechaEvento: new Date("2027-01-31"), creado: new Date("2026-11-01"), anticipoClientePct: 50, dias: DIAS_POR_DEFECTO, anticipoProveedor: {} });
  assert.deepEqual(c.map((q) => [q.clave, q.tipo, q.monto]), [
    ["P:adic:L1:anticipo", "PAGO", 200],
    ["P:adic:L1:saldo", "PAGO", 300],
    ["P:adic:A:cobro-anticipo", "COBRO", 605],
    ["P:adic:A:cobro-saldo", "COBRO", 605],
  ]);
  assert.ok(c.every((q) => !q.clave.endsWith(":cliente:anticipo")), "no se confunde con la seña del proyecto");
});
