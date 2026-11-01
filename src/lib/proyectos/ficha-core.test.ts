import { tipoDeArchivoSubido } from "./ficha-core";
import { test } from "node:test";
import assert from "node:assert/strict";
import { cambiosEntreVersiones, cashflowDelEvento, ventaTotalItem } from "./gestion-core";
import {
  cambioVisible,
  clavesARenombrar,
  columnaDe,
  filaDeFicha,
  filtrarCashflow,
  fotoDeVersion,
  iniciales,
  itemDeClave,
  monedasSinCambio,
  numeroDe,
  planillaDeVenta,
  precioAlCopiar,
  precioAlEnviar,
  resumenPipeline,
  type ItemVenta,
} from "./ficha-core";

const TC = { USD: 1000 };
const item = (o: Partial<ItemVenta> = {}): ItemVenta => ({ descripcion: "Escenario", rubro: "Venue", cantidad: 2, costo: 100, moneda: "ARS", recargoPct: 50, precio: 0, ...o });

test("pipeline: abiertos son los leads sin perder, antes de confirmar", () => {
  const r = resumenPipeline([
    { etapa: "PEDIDO", venta: 100, perdido: false },
    { etapa: "PROPUESTA", venta: 50, perdido: false },
    { etapa: "PROPUESTA", venta: 999, perdido: true },
    { etapa: "APROBADO", venta: 999, perdido: false },
  ]);
  assert.deepEqual(r, { abiertos: 2, valor: 150 });
});

test("un proyecto perdido va a su columna, esté en la etapa que esté", () => {
  assert.equal(columnaDe({ etapa: "PROPUESTA", perdidoEl: new Date() }), "PERDIDO");
  assert.equal(columnaDe({ etapa: "PROPUESTA", perdidoEl: null }), "PROPUESTA");
});

test("iniciales con uno y con varios nombres", () => {
  assert.equal(iniciales("ana maría gómez"), "AG");
  assert.equal(iniciales("Ana"), "A");
});

test("un número mal tipeado no se vuelve cero", () => {
  assert.equal(numeroDe("1.500"), 1500);
  assert.equal(numeroDe("1,5"), 1.5);
  assert.equal(numeroDe("$ 200"), 200);
  assert.equal(numeroDe("0"), 0);
  assert.equal(numeroDe("abc"), null);
  assert.equal(numeroDe("-5"), null);
  assert.equal(numeroDe(""), null);
});

test("avisa qué monedas no tienen tipo de cambio", () => {
  assert.deepEqual(monedasSinCambio([{ moneda: "ARS" }, { moneda: "USD" }], {}), ["USD"]);
  assert.deepEqual(monedasSinCambio([{ moneda: "USD" }], TC), []);
});

test("al enviar, el precio del recargo queda escrito y el total no cambia", () => {
  const i = item();
  const r = precioAlEnviar(i, TC, 35);
  assert.deepEqual(r, { precio: 150, recargoPct: 50 });
  assert.equal(ventaTotalItem({ ...i, ...r! }, TC, 35), ventaTotalItem(i, TC, 35));
});

test("al enviar, sin recargo propio se fija el general; un precio a mano no se toca", () => {
  assert.deepEqual(precioAlEnviar(item({ recargoPct: null }), TC, 35), { precio: 135, recargoPct: 35 });
  assert.equal(precioAlEnviar(item({ precio: 500, recargoPct: null }), TC, 35), null);
});

test("la versión siguiente recalcula lo que salía del recargo y respeta lo fijado a mano", () => {
  assert.equal(precioAlCopiar({ recargoPct: 50, precio: 150 }), 0);
  assert.equal(precioAlCopiar({ recargoPct: null, precio: 500 }), 500);
});

test("la foto no pisa dos ítems con el mismo nombre al comparar", () => {
  const a = fotoDeVersion([item({ rubro: "Venue" }), item({ rubro: "Catering" })], TC, 35);
  assert.deepEqual(a.map((f) => f.clave), ["escenario", "escenario#2"]);
  const b = fotoDeVersion([item({ rubro: "Venue" }), item({ rubro: "Catering", costo: 200 })], TC, 35);
  const c = cambiosEntreVersiones(a, b);
  assert.equal(c.cambios.length, 1);
  assert.equal(c.cambios[0].tipo, "modificado");
  assert.equal(c.diferencia, 300);
});

test("la planilla no muestra lo oculto pero lo cobra, y da lo mismo que la ficha", () => {
  const items = [item(), item({ descripcion: "Interno", visibleCliente: false }), item({ descripcion: "Sonido", rubro: "Catering" })];
  const { grupos, neto } = planillaDeVenta(items, TC, 35);
  assert.equal(neto, 900);
  assert.deepEqual(grupos[0].lineas.map((l) => l.descripcion), ["Escenario", "Otros conceptos"]);
  assert.equal(grupos[0].subtotal, 600);
  assert.equal(JSON.stringify(grupos).includes("Interno"), false);
  assert.equal(JSON.stringify(grupos).includes("costo"), false);
});

test("las cuotas siguen a su ítem cuando una versión nueva le cambia el id", () => {
  assert.deepEqual(clavesARenombrar("p", new Map([["a", "b"]])), [
    { de: "p:a:anticipo", a: "p:b:anticipo" },
    { de: "p:a:saldo", a: "p:b:saldo" },
  ]);
  assert.equal(itemDeClave("p:a:saldo"), "a");
  assert.equal(itemDeClave("p:cliente:saldo"), null);
  assert.equal(itemDeClave(null), null);
});

test("lo que el rol no ve no viaja en la fila", () => {
  const base = { ...item(), id: "i", supplierId: null, proveedor: "Texto viejo", fechaLimite: "", estadoItem: "PENDIENTE", visibleCliente: true, adjuntos: 0 };
  const f = filaDeFicha(base, TC, 35, new Set(["costoUnit", "costoTotal", "recargo", "margen"]));
  for (const k of ["costo", "costoTotal", "recargoPct", "margen"]) assert.equal(k in f, false, k);
  assert.equal(f.venta, 300);
  assert.equal(f.proveedorTexto, "Texto viejo");
  const g = filaDeFicha(base, TC, 35, new Set());
  assert.equal(g.costoTotal, 200);
  assert.equal(g.margen, 100);
});

test("el filtro del cashflow conserva el saldo del evento entero", () => {
  const cuotas = [
    { tipo: "PAGO", monto: 100, moneda: "ARS", venceEl: new Date("2026-01-01"), pagadoEl: null },
    { tipo: "COBRO", monto: 300, moneda: "ARS", venceEl: new Date("2026-01-02"), pagadoEl: new Date() },
  ];
  const { lineas, maximoAFinanciar } = cashflowDelEvento(cuotas, TC);
  assert.equal(maximoAFinanciar, 100);
  const cobros = filtrarCashflow(lineas, "cobros");
  assert.equal(cobros.length, 1);
  assert.equal(cobros[0].saldo, 200);
  assert.equal(filtrarCashflow(lineas, "pendientes").length, 1);
});

test("el historial esconde costos y pagos según el permiso", () => {
  const sin = { costos: false, pagos: false };
  assert.equal(cambioVisible({ entidad: "ProyectoItem", campo: "Costo unitario · Escenario" }, sin), false);
  assert.equal(cambioVisible({ entidad: "ProyectoCuota", campo: "Cobrado" }, sin), false);
  assert.equal(cambioVisible({ entidad: "Proyecto", campo: "Etapa" }, sin), true);
  assert.equal(cambioVisible({ entidad: "ProyectoCuota", campo: "Asiento" }, { costos: true, pagos: true }), false);
});

test("se sube una imagen o un PDF de verdad, con su tope", () => {
  assert.equal(tipoDeArchivoSubido("data:image/png;base64,AAAA", 100, 100), "imagen");
  assert.equal(tipoDeArchivoSubido("data:application/pdf;base64,JVBERi0x", 100, 100), "pdf");
  assert.equal(tipoDeArchivoSubido("data:application/pdf;base64,PGh0bWw+", 100, 100), null);
  assert.equal(tipoDeArchivoSubido("data:text/html;base64,AAAA", 100, 100), null);
  assert.equal(tipoDeArchivoSubido("data:image/png;base64,AAAA", 5, 100), null);
  assert.equal(tipoDeArchivoSubido("data:application/pdf;base64,JVBERi0x", 100, 5), null);
});
