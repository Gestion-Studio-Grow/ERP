import assert from "node:assert/strict";
import { test } from "node:test";
import { clientePuedeResponder, desvioPorRubro, resultadoReal, totalDelGasto, leerNumero, etapaAlAprobar, etapaLabel, etapaSiguiente, etapasDe, metodoDeCaja, pesos, porcentaje, porRubro, precioConMargen, sePuedeEditar, totales, waLink } from "./core";
import { computar, costosVigentes, dentroDelLote, disenoInicial, normalizarDiseno, paredesDe, superficieParedes } from "./stand";

test("el porcentaje va con coma, igual que la plata", () => {
  assert.equal(porcentaje(33.8), "33,8%");
  assert.equal(porcentaje(30), "30%");
});

test("un contenido no pasa por 3D, armado ni desarme; un stand pasa por todo", () => {
  assert.deepEqual(etapasDe("CONTENIDOS"), ["PEDIDO", "DISENO", "PRESUPUESTO", "PROPUESTA", "APROBADO", "PRODUCCION", "CIERRE"]);
  assert.equal(etapasDe("ARQUITECTURA").length, 10);
  assert.equal(etapaLabel("DISENO", "CONTENIDOS"), "Guion");
  assert.equal(etapaSiguiente("CONTENIDOS", "PRODUCCION"), "CIERRE");
  assert.equal(etapaSiguiente("ARQUITECTURA", "CIERRE"), null);
});

test("totales: IVA sobre el neto y margen sobre el precio, no sobre el costo", () => {
  const t = totales([{ cantidad: 2, costo: 100, precio: 200 }], 21);
  assert.deepEqual(t, { costo: 200, neto: 400, iva: 84, total: 484, ganancia: 200, margenPct: 50 });
  assert.equal(totales([], 21).margenPct, 0);
  assert.equal(precioConMargen(100, 35), 135);
});

test("costo real: sin IVA contra el presupuesto, con IVA contra la caja, y lo anulado no cuenta", () => {
  const t = totales([{ cantidad: 1, costo: 600, precio: 1000 }], 21);
  const pagado = { rubro: "Producción", neto: 500, iva: 105, pagadoEl: new Date(), anuladoEl: null };
  const debe = { rubro: "Producción", neto: 200, iva: 0, pagadoEl: null, anuladoEl: null };
  const anulado = { rubro: "Producción", neto: 9000, iva: 0, pagadoEl: new Date(), anuladoEl: new Date() };
  const r = resultadoReal(t, [pagado, debe, anulado]);
  assert.equal(r.costoReal, 700);
  assert.equal(r.pagado, 605);
  assert.equal(r.porPagar, 200);
  assert.equal(r.desvio, 100, "se gastó 100 más de lo presupuestado");
  assert.equal(r.gananciaReal, 300);
  assert.equal(r.margenReal, 30);
  assert.equal(totalDelGasto(pagado), 605);
});

test("costo real: sin gastos o sin presupuesto aprobado no se inventa una ganancia", () => {
  const t = totales([{ cantidad: 1, costo: 600, precio: 1000 }], 21);
  assert.equal(resultadoReal(t, []).gananciaReal, null, "sin gastos daría un 100 % de ganancia que no existe");
  const sinPresupuesto = resultadoReal(null, [{ rubro: "X", neto: 50, iva: 0, pagadoEl: null, anuladoEl: null }]);
  assert.equal(sinPresupuesto.gananciaReal, null);
  assert.equal(sinPresupuesto.desvio, null);
  assert.equal(sinPresupuesto.porPagar, 50);
});

test("desvío por rubro: une lo tipeado distinto y muestra lo que no estaba presupuestado", () => {
  const filas = desvioPorRubro(
    [{ rubro: "Producción", cantidad: 2, costo: 100, precio: 150 }, { rubro: "Logística", cantidad: 1, costo: 50, precio: 80 }],
    [
      { rubro: " producción ", neto: 260, iva: 50, pagadoEl: null, anuladoEl: null },
      { rubro: "Permisos", neto: 30, iva: 0, pagadoEl: null, anuladoEl: null },
      { rubro: "Logística", neto: 999, iva: 0, pagadoEl: null, anuladoEl: new Date() },
    ],
  );
  assert.deepEqual(filas, [
    { rubro: "Producción", presupuestado: 200, real: 260, diferencia: 60 },
    { rubro: "Logística", presupuestado: 50, real: 0, diferencia: -50 },
    { rubro: "Permisos", presupuestado: 0, real: 30, diferencia: 30 },
  ]);
});

test("los números se leen como los escribe una persona", () => {
  assert.equal(leerNumero("6.326.546"), 6326546);
  assert.equal(leerNumero("1.500"), 1500);
  assert.equal(leerNumero("1,5"), 1.5);
  assert.equal(leerNumero("1.5"), 1.5);
  assert.equal(leerNumero("1.500,75"), 1500.75);
  assert.equal(leerNumero("abc"), 0);
});

test("cada medio va a su columna del libro: nada bancario bajo Mercado Pago si existe Transferencia", () => {
  assert.equal(metodoDeCaja("EFECTIVO", true), "EFECTIVO");
  assert.equal(metodoDeCaja("MERCADO_PAGO", true), "MP");
  assert.equal(metodoDeCaja("TRANSFERENCIA", true), "TRANSFERENCIA");
  assert.equal(metodoDeCaja("CHEQUE", true), "TRANSFERENCIA");
  assert.equal(metodoDeCaja("TRANSFERENCIA", false), "MP");
  assert.equal(metodoDeCaja("CHEQUE"), "MP");
});

test("el WhatsApp sale con el 549 y no abre un número que no sirve", () => {
  assert.equal(waLink("11 5000-0001", "Hola"), "https://wa.me/5491150000001?text=Hola");
  assert.equal(waLink("+54 9 11 5000-0001", "Hola"), "https://wa.me/5491150000001?text=Hola");
  assert.equal(waLink("1234", "Hola"), null);
  assert.equal(waLink(null, "Hola"), null);
});

test("los pesos muestran los centavos sólo si los hay", () => {
  assert.match(pesos(1500.75), /1.500,75/);
  assert.doesNotMatch(pesos(2000), /,/);
});

test("porRubro respeta el orden en que aparece cada rubro", () => {
  const g = porRubro([{ rubro: "B" }, { rubro: "A" }, { rubro: "B" }]);
  assert.deepEqual(g.map((x) => [x.rubro, x.items.length]), [["B", 2], ["A", 1]]);
});

test("lo enviado no se edita y lo vencido no se responde", () => {
  assert.equal(sePuedeEditar("BORRADOR"), true);
  assert.equal(sePuedeEditar("ENVIADO"), false);
  const hoy = new Date("2026-11-01T12:00:00Z");
  assert.equal(clientePuedeResponder({ estado: "ENVIADO", validoHasta: new Date("2026-11-02T00:00:00Z") }, hoy), true);
  assert.equal(clientePuedeResponder({ estado: "ENVIADO", validoHasta: new Date("2026-10-31T00:00:00Z") }, hoy), false);
  assert.equal(clientePuedeResponder({ estado: "APROBADO", validoHasta: null }, hoy), false);
});

test("aprobar nunca hace retroceder un proyecto", () => {
  assert.equal(etapaAlAprobar("ARQUITECTURA", "PROPUESTA"), "APROBADO");
  assert.equal(etapaAlAprobar("ARQUITECTURA", "ARMADO"), "ARMADO");
});

test("las paredes dependen de los lados abiertos", () => {
  assert.deepEqual(paredesDe("ISLA"), []);
  assert.deepEqual(paredesDe("ESQUINA"), ["fondo", "izquierda"]);
  const d = { ...disenoInicial("ESQUINA", 6, 4), altoPared: 3 };
  assert.equal(superficieParedes(d), 30);
});

test("una pieza no se sale del lote y cae en la grilla", () => {
  const p = dentroDelLote({ id: "a", tipo: "MOSTRADOR", x: 99, z: -99, giro: 0 }, { ancho: 6, fondo: 4 });
  assert.equal(p.x, 2.25);
  assert.equal(p.z, -1.7);
});

test("el diseño roto no pasa y el recuperable se corrige", () => {
  assert.equal(normalizarDiseno(null), null);
  assert.equal(normalizarDiseno({ tipo: "HACK", ancho: 3, fondo: 3 }), null);
  const d = normalizarDiseno({
    tipo: "ISLA",
    ancho: 999,
    fondo: 1,
    colorPared: "red;}",
    piezas: [{ tipo: "__proto__", x: 0, z: 0 }, { tipo: "TOTEM", x: "nan", z: 0 }, { tipo: "TOTEM", x: 0, z: 0, giro: 7 }],
  });
  assert.ok(d);
  assert.equal(d.ancho, 30);
  assert.equal(d.fondo, 2);
  assert.equal(d.colorPared, "#E3E1D4");
  assert.equal(d.piezas.length, 1);
  assert.equal(d.piezas[0].giro, 3);
});

test("el cómputo sale del dibujo: isla sin paredes, piezas contadas", () => {
  const isla = computar({ ...disenoInicial("ISLA", 5, 4), piezas: [{ id: "a", tipo: "TOTEM", x: 0, z: 0, giro: 0 }, { id: "b", tipo: "TOTEM", x: 1, z: 0, giro: 0 }] });
  assert.equal(isla.find((l) => l.clave === "pared"), undefined);
  assert.equal(isla.find((l) => l.clave === "piso")?.cantidad, 20);
  assert.equal(isla.find((l) => l.clave === "TOTEM")?.cantidad, 2);
});

test("los costos guardados pisan a los de referencia, sin aceptar basura", () => {
  const c = costosVigentes({ piso: 1000, pared: "x", flete: -5 });
  assert.equal(c.piso, 1000);
  assert.equal(c.pared, 65000);
  assert.equal(c.flete, 280000);
});
