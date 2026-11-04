import { test } from "node:test";
import assert from "node:assert/strict";
import { alertasDeDireccion, conReintegros, desviosDelEvento, extrasRecalculados, finDeSemana, leerExtras, lineasNuevas, margenSobreVenta, pasaFiltro, periodoValido, propuestasDeConciliacion, respuestaDeCarga, tasaDeConversion, totalLiquidacion } from "./empresa-core";

const item = (id: string, rubro: string, costo: number, costoReal: number | null = null) => ({ id, descripcion: id, rubro, cantidad: 1, costo, moneda: "ARS", costoReal, proveedor: null });

test("el real del ítem manda, los gastos valen para el resto del rubro y lo que no tiene dato cuenta lo presupuestado", () => {
  const d = desviosDelEvento([item("a", "Catering", 100, 130), item("b", "Catering", 50), item("c", "Venue", 200)], [{ rubro: " catering ", neto: 170 }, { rubro: "Viáticos", neto: 10 }, { rubro: "Venue", neto: 999, anuladoEl: new Date() }], {});
  assert.equal(d.costoPresupuestado, 350);
  assert.equal(d.costoReal, 130 + 70 + 200 + 10);
  assert.equal(d.conDatos, true);
  const venue = d.lineas.find((l) => l.clave === "c")!;
  assert.equal(venue.real, null);
  assert.equal(venue.desvio, null);
  assert.equal(d.lineas.find((l) => l.clave === "a")!.desvioPct, 30);
  assert.equal(d.lineas.find((l) => l.clave === "rubro:viáticos")!.desvioPct, null);
});

test("sin nada real cargado no hay desvío", () => {
  const d = desviosDelEvento([item("a", "Catering", 100)], [], {});
  assert.equal(d.conDatos, false);
  assert.equal(d.costoReal, d.costoPresupuestado);
});

test("un ítem en dólares se compara en pesos", () => {
  const d = desviosDelEvento([{ ...item("a", "Venue", 10, 12000), moneda: "USD" }], [], { USD: 1000 });
  assert.equal(d.lineas[0].presupuestado, 10000);
  assert.equal(d.lineas[0].desvio, 2000);
});

const proyecto = { id: "p", nombre: "Gala", vencido: 0, conDatos: false, margenPct: 30, margenRealPct: null as number | null, costo: 700, costoReal: 700 };
const mes = (m: string, saldo: number) => ({ mes: m, cobros: 0, proveedores: 0, sueldos: 0, fijos: 0, impuestos: 0, neto: 0, saldo });

test("no hay alerta por importes que redondean a cero", () => {
  assert.deepEqual(alertasDeDireccion({ proyectos: [{ ...proyecto, vencido: 0.3 }], proyeccion: [mes("2026-11", -0.4)] }), []);
  assert.deepEqual(alertasDeDireccion({ proyectos: [{ ...proyecto, conDatos: true, margenRealPct: 29.9, costoReal: 700.2 }], proyeccion: [] }), []);
});

test("avisa cobro vencido, el primer mes con caja negativa y margen real bajo", () => {
  const a = alertasDeDireccion({ proyectos: [{ ...proyecto, vencido: 500, conDatos: true, margenRealPct: 20, costoReal: 800 }], proyeccion: [mes("2026-11", 10), mes("2026-12", -50), mes("2027-01", -90)] });
  assert.deepEqual(a.map((x) => x.clave), ["cobro:p", "caja:2026-12", "margen:p"]);
});

test("margen mejor que el presupuestado no alarma", () => {
  assert.deepEqual(alertasDeDireccion({ proyectos: [{ ...proyecto, conDatos: true, margenRealPct: 40, costoReal: 600 }], proyeccion: [] }), []);
});

test("conversión: confirmados sobre decididos", () => {
  assert.equal(tasaDeConversion(3, 1), 75);
  assert.equal(tasaDeConversion(0, 0), 0);
  assert.equal(margenSobreVenta(0, 10), 0);
});

test("filtros de cuotas", () => {
  const hoy = new Date("2026-11-10T12:00:00Z");
  const vencida = { venceEl: new Date("2026-11-01T12:00:00Z"), pagadoEl: null };
  const futura = { venceEl: new Date("2026-12-01T12:00:00Z"), pagadoEl: null };
  const pagada = { venceEl: new Date("2026-11-01T12:00:00Z"), pagadoEl: hoy };
  assert.equal(pasaFiltro(vencida, "pendientes", hoy), true);
  assert.equal(pasaFiltro(futura, "vencidos", hoy), false);
  assert.equal(pasaFiltro(pagada, "pendientes", hoy), false);
  assert.equal(pasaFiltro(pagada, "pagados", hoy), true);
  assert.equal(pasaFiltro(pagada, "todos", hoy), true);
});

test("esta semana llega hasta el domingo, también si hoy es domingo", () => {
  assert.equal(finDeSemana(new Date(2026, 10, 1)).getDate(), 2); // domingo 1/11
  assert.equal(finDeSemana(new Date(2026, 10, 2)).getDate(), 9); // lunes 2/11
  assert.equal(finDeSemana(new Date(2026, 10, 7)).getDate(), 9); // sábado 7/11
});

test("¿se puede tomar un evento más?", () => {
  assert.equal(respuestaDeCarga([]).respuesta, "SIN_EQUIPO");
  assert.equal(respuestaDeCarga([{ nivel: "BAJA" }, { nivel: "MEDIA" }]).respuesta, "SI");
  assert.equal(respuestaDeCarga([{ nivel: "ALTA" }, { nivel: "BAJA" }, { nivel: "BAJA" }]).respuesta, "AJUSTADO");
  assert.equal(respuestaDeCarga([{ nivel: "ALTA" }, { nivel: "BAJA" }]).respuesta, "NO");
});

test("recalcular conserva lo manual y cambia lo que sale de los eventos", () => {
  const previos = [{ proyectoId: "x", nombre: "Viejo", monto: 5 }, { proyectoId: null, nombre: "Premio", monto: 100, manual: true }];
  const nuevos = extrasRecalculados(previos, [{ proyectoId: "y", nombre: "Gala", monto: 50 }]);
  assert.deepEqual(nuevos.map((e) => e.nombre), ["Gala", "Premio"]);
  assert.equal(totalLiquidacion(1000, nuevos), 1150);
});

test("leer extras guardados ignora lo que no se entiende", () => {
  assert.deepEqual(leerExtras(null), []);
  assert.deepEqual(leerExtras([{ nombre: "A", monto: 1 }, { nombre: "B" }, null]), [{ proyectoId: null, nombre: "A", monto: 1 }]);
});

test("periodos válidos", () => {
  assert.equal(periodoValido("2026-11"), true);
  assert.equal(periodoValido("2026-13"), false);
  assert.equal(periodoValido("x"), false);
});

test("reimportar un extracto no duplica, pero dos líneas iguales nuevas sí entran", () => {
  const l = (d: number, importe = 100) => ({ fecha: new Date(2026, 10, d, 12), descripcion: "Pago", importe });
  assert.equal(lineasNuevas([l(1), l(1), l(2)], [l(1)]).length, 2);
  assert.equal(lineasNuevas([l(1), l(2)], [l(1), l(2)]).length, 0);
});

test("dos movimientos iguales no se proponen contra la misma cuota", () => {
  const c = (id: string) => ({ id, tipo: "COBRO", monto: 100, moneda: "ARS", venceEl: new Date(2026, 10, 1), pagadoEl: null });
  const m = (id: string, importe = 100) => ({ id, fecha: new Date(2026, 10, 1), descripcion: "", importe });
  const p = propuestasDeConciliacion([m("1"), m("2"), m("3")], [c("a"), c("b")], {});
  assert.equal(new Set([p.get("1")?.id, p.get("2")?.id]).size, 2);
  assert.equal(p.has("3"), false);
  assert.equal(propuestasDeConciliacion([m("1", -100)], [c("a")], {}).size, 0);
});

test("Rendí: los reintegros se rehacen desde la base, uno por gasto, y sobreviven a leerExtras", () => {
  const previos = leerExtras([{ proyectoId: null, nombre: "Bono", monto: 100, manual: true }, { proyectoId: "p", nombre: "Reintegro · viejo", monto: 9, gastoId: "g0", reintegro: true }]);
  assert.equal(previos[1].reintegro, true);
  assert.equal(previos[1].gastoId, "g0");
  const r = { gastoId: "g1", proyectoId: "p", descripcion: "Taxi", montoCentavos: 1250050 };
  const extras = conReintegros(previos, [r, r]);
  assert.deepEqual(extras.map((e) => e.nombre), ["Bono", "Reintegro · Taxi"], "el viejo se va, el repetido entra una vez");
  assert.equal(totalLiquidacion(0, extras), 12600.5);
  assert.deepEqual(leerExtras(JSON.parse(JSON.stringify(extras))), extras, "ida y vuelta por el JSON");
  assert.equal(extrasRecalculados(extras, []).some((e) => e.reintegro), false, "recalcular los saca; los vuelve a poner el claim");
});
