// Tests de las REGLAS DEL DUEÑO: umbral de identificación (con el límite
// exacto), cap de facturas/mes (90% alerta, 100% bloqueo), deduplicación por
// hash y detección cruzada banco↔MP.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { MovimientoBancario } from "../core-contract";
import type { ResultadoClasificacionBanco } from "./clasificador";
import {
  CAP_FACTURAS_MES_DEFAULT,
  configConDefaults,
  DeteccionCruzadaEnMemoria,
  DOC_NRO_CONSUMIDOR_FINAL,
  DOC_TIPO_CONSUMIDOR_FINAL,
  generarPropuestas,
  UMBRAL_IDENTIFICACION_DEFAULT,
  type ContextoReglas,
} from "./reglas";
import { hashMovimiento } from "./valores";

let seq = 0;
function mov(over: Partial<MovimientoBancario> = {}): MovimientoBancario {
  const base = {
    fecha: "20260705",
    monto: 1500,
    descripcion: `Venta ${++seq}`,
    origen: "banco" as const,
    ...over,
  };
  return { id: hashMovimiento(base.fecha, base.monto, base.descripcion), ...base };
}

const FACTURABLE: ResultadoClasificacionBanco = { clasificacion: "FACTURABLE", motivo: "Venta." };

function clasifTodo(
  movs: MovimientoBancario[],
  r: ResultadoClasificacionBanco = FACTURABLE,
): Map<string, ResultadoClasificacionBanco> {
  return new Map(movs.map((m) => [m.id, r]));
}

function ctx(over: Partial<ContextoReglas> = {}): ContextoReglas {
  return {
    config: configConDefaults(),
    facturasEmitidasEsteMes: 0,
    ...over,
  };
}

// --- defaults -----------------------------------------------------------------

test("configConDefaults completa los valores del producto", () => {
  const config = configConDefaults();
  assert.equal(config.umbralIdentificacion, 600_000);
  assert.equal(config.capFacturasMes, 159);
  const custom = configConDefaults({ umbralIdentificacion: 100, capFacturasMes: 5 });
  assert.equal(custom.umbralIdentificacion, 100);
  assert.equal(custom.capFacturasMes, 5);
});

// --- regla 1 y 2: umbral de identificación ------------------------------------

test("monto menor al umbral → AUTO consumidor final genérico, sin descripción", async () => {
  const movs = [mov({ monto: 599_999.99 })];
  const { propuestas } = await generarPropuestas(movs, clasifTodo(movs), ctx());
  assert.equal(propuestas.length, 1);
  const p = propuestas[0];
  assert.equal(p.estado, "auto");
  assert.equal(p.requiereIdentificacion, false);
  assert.equal(p.docTipo, DOC_TIPO_CONSUMIDOR_FINAL);
  assert.equal(p.docNro, DOC_NRO_CONSUMIDOR_FINAL);
  assert.equal(p.descripcionServicio, undefined);
  assert.equal(p.montoTotal, 599_999.99);
});

test("monto IGUAL al umbral va a revisión (el límite es estricto)", async () => {
  const movs = [mov({ monto: UMBRAL_IDENTIFICACION_DEFAULT })];
  const { propuestas } = await generarPropuestas(movs, clasifTodo(movs), ctx());
  const p = propuestas[0];
  assert.equal(p.estado, "revision");
  assert.equal(p.requiereIdentificacion, true);
  assert.equal(p.docTipo, undefined); // se completa en la revisión
});

test("monto mayor al umbral → revisión con identificación obligatoria", async () => {
  const movs = [mov({ monto: 750_000 })];
  const { propuestas } = await generarPropuestas(movs, clasifTodo(movs), ctx());
  assert.equal(propuestas[0].estado, "revision");
  assert.equal(propuestas[0].requiereIdentificacion, true);
});

// --- regla 3: cap de facturas por mes ------------------------------------------

test("al 90% del cap se alerta pero se sigue emitiendo", async () => {
  const movs = [mov()];
  const { propuestas, alertas } = await generarPropuestas(
    movs,
    clasifTodo(movs),
    ctx({ config: configConDefaults({ capFacturasMes: 100 }), facturasEmitidasEsteMes: 89 }),
  );
  assert.equal(propuestas[0].estado, "auto"); // 90/100: emite igual
  assert.deepEqual(
    alertas.map((a) => a.tipo),
    ["cap-90"],
  );
});

test("al 100% del cap se bloquea la emisión automática (baja a revisión)", async () => {
  // Emitidas 158 de 159: la primera auto llega justo al cap; la segunda se bloquea.
  const movs = [mov(), mov()];
  const { propuestas, alertas } = await generarPropuestas(
    movs,
    clasifTodo(movs),
    ctx({ facturasEmitidasEsteMes: CAP_FACTURAS_MES_DEFAULT - 1 }),
  );
  assert.equal(propuestas[0].estado, "auto"); // 159/159, la última permitida
  assert.equal(propuestas[1].estado, "revision"); // bloqueada: solo manual
  assert.match(propuestas[1].motivo ?? "", /límite del plan de 159/i);
  assert.deepEqual(
    alertas.map((a) => a.tipo),
    ["cap-100"],
  );
});

test("con el cap ya agotado, ninguna auto pasa", async () => {
  const movs = [mov(), mov()];
  const { propuestas } = await generarPropuestas(
    movs,
    clasifTodo(movs),
    ctx({ facturasEmitidasEsteMes: CAP_FACTURAS_MES_DEFAULT }),
  );
  assert.ok(propuestas.every((p) => p.estado === "revision"));
});

test("las revisiones y no facturables no consumen cap", async () => {
  const movs = [mov({ monto: 700_000 }), mov({ monto: -500 })];
  const clasif = new Map<string, ResultadoClasificacionBanco>([
    [movs[0].id, FACTURABLE],
    [movs[1].id, { clasificacion: "NO_FACTURABLE", motivo: "Débito." }],
  ]);
  const { alertas } = await generarPropuestas(
    movs,
    clasif,
    ctx({ facturasEmitidasEsteMes: CAP_FACTURAS_MES_DEFAULT - 1 }),
  );
  // No se llegó al 100% (nada de este lote consumió cap): solo la alerta de uso
  // (158/159 ya emitidas es > 90%), nunca el bloqueo.
  assert.deepEqual(
    alertas.map((a) => a.tipo),
    ["cap-90"],
  );
});

// --- regla 4: deduplicación -----------------------------------------------------

test("el mismo movimiento repetido en el archivo se descarta", async () => {
  const original = mov({ monto: 1000, descripcion: "Venta mostrador" });
  const duplicado = { ...original }; // mismo hash: misma fecha, monto y descripción
  const movs = [original, duplicado];
  const { propuestas } = await generarPropuestas(movs, clasifTodo(movs), ctx());
  assert.equal(propuestas[0].estado, "auto");
  assert.equal(propuestas[1].estado, "descartado");
  assert.match(propuestas[1].motivo ?? "", /duplicado dentro del archivo/i);
});

test("un movimiento ya procesado en otra importación se descarta", async () => {
  const movs = [mov()];
  const { propuestas } = await generarPropuestas(
    movs,
    clasifTodo(movs),
    ctx({ yaProcesado: (id) => id === movs[0].id }),
  );
  assert.equal(propuestas[0].estado, "descartado");
  assert.match(propuestas[0].motivo ?? "", /importación anterior/i);
});

test("cruce banco↔MP: mismo monto y fecha ya facturado por MP → revisión", async () => {
  const movs = [mov({ monto: 12_500, fecha: "20260705" })];
  const { propuestas } = await generarPropuestas(
    movs,
    clasifTodo(movs),
    ctx({ deteccionCruzada: new DeteccionCruzadaEnMemoria([{ fecha: "20260705", monto: 12_500 }]) }),
  );
  assert.equal(propuestas[0].estado, "revision");
  assert.match(propuestas[0].motivo ?? "", /posible duplicado/i);
  // El texto dice lo que la detección real hace (bancos-glue.ts, `whereYaFacturadaPorOtraVia`):
  // cualquier vía y hasta 3 días antes, no "por Mercado Pago y la misma fecha".
  assert.match(propuestas[0].motivo ?? "", /hasta 3 días antes/);
  assert.doesNotMatch(propuestas[0].motivo ?? "", /Mercado Pago|misma fecha/);
});

test("cruce banco↔MP: distinto monto o fecha no molesta", async () => {
  const movs = [mov({ monto: 12_500, fecha: "20260706" })];
  const { propuestas } = await generarPropuestas(
    movs,
    clasifTodo(movs),
    ctx({ deteccionCruzada: new DeteccionCruzadaEnMemoria([{ fecha: "20260705", monto: 12_500 }]) }),
  );
  assert.equal(propuestas[0].estado, "auto");
});

// --- estados de clasificación ---------------------------------------------------

test("NO_FACTURABLE y REVISAR del clasificador se respetan con su motivo", async () => {
  const movs = [mov({ monto: -300 }), mov()];
  const clasif = new Map<string, ResultadoClasificacionBanco>([
    [movs[0].id, { clasificacion: "NO_FACTURABLE", motivo: "Comisión bancaria." }],
    [movs[1].id, { clasificacion: "REVISAR", motivo: "Leyenda ambigua." }],
  ]);
  const { propuestas } = await generarPropuestas(movs, clasif, ctx());
  assert.equal(propuestas[0].estado, "no_facturable");
  assert.equal(propuestas[0].motivo, "Comisión bancaria.");
  assert.equal(propuestas[1].estado, "revision");
  assert.equal(propuestas[1].motivo, "Leyenda ambigua.");
});

test("el monto de la propuesta es el valor absoluto (IVA incluido, lo desglosa el Core)", async () => {
  const movs = [mov({ monto: -300 })];
  const clasif = clasifTodo(movs, { clasificacion: "NO_FACTURABLE", motivo: "Débito." });
  const { propuestas } = await generarPropuestas(movs, clasif, ctx());
  assert.equal(propuestas[0].montoTotal, 300);
});

// ── R3-F3: tope de facturas automáticas tomado del plan cuando la columna está vacía ─────────
import { capFacturasMesEfectivo as capEfectivo, CAP_FACTURAS_MES_DEFAULT as CAP_DEFAULT } from "./reglas";
import { limitesDelNegocio as limitesR3F3, TOPE_MAXIMO as TOPE_MAX_R3F3 } from "@/planes/limites";

test("R3-F3: la columna del negocio puede bajar el tope del plan", () => {
  const micro = limitesR3F3({ slug: "negocio-x", plan: "micro" }, []).topes.facturasAutomaticasMes;
  assert.equal(capEfectivo(40, micro, TOPE_MAX_R3F3), 40);
  assert.equal(capEfectivo(0, micro, TOPE_MAX_R3F3), 0);
});

test("R3-F3: un negocio Micro que carga 100.000 en su panel sigue frenado por el tope de su plan", () => {
  // La columna la escribe el propio negocio desde /admin (guardarConfigBancosAction, 1 a 100.000):
  // no puede servir para saltarse el plan.
  const micro = limitesR3F3({ slug: "negocio-x", plan: "micro" }, []).topes.facturasAutomaticasMes;
  assert.equal(typeof micro.valor, "number");
  assert.equal(capEfectivo(100_000, micro, TOPE_MAX_R3F3), micro.valor);
  assert.equal(capEfectivo((micro.valor ?? 0) + 1, micro, TOPE_MAX_R3F3), micro.valor);
});

test("R3-F3: para dar más que el plan hace falta la excepción de GSG; la columna igual puede bajarla", () => {
  const conExcepcion = { valor: 500, origen: "excepcion" as const };
  assert.equal(capEfectivo(100_000, conExcepcion, TOPE_MAX_R3F3), 500);
  assert.equal(capEfectivo(300, conExcepcion, TOPE_MAX_R3F3), 300);
  assert.equal(capEfectivo(null, conExcepcion, TOPE_MAX_R3F3), 500);
  // «Sin tope» de GSG: la columna del negocio vuelve a ser su propio freno.
  assert.equal(capEfectivo(100_000, { valor: null, origen: "excepcion" }, TOPE_MAX_R3F3), 100_000);
});

test("R3-F3: con la columna vacía vale el tope del plan", () => {
  const micro = limitesR3F3({ slug: "negocio-x", plan: "micro" }, []).topes.facturasAutomaticasMes;
  assert.equal(capEfectivo(null, micro, TOPE_MAX_R3F3), micro.valor ?? TOPE_MAX_R3F3);
  assert.equal(capEfectivo(null, { valor: 25, origen: "excepcion" }, TOPE_MAX_R3F3), 25);
});

test("R3-F3: sin plan del catálogo (o en CH) queda el tope de siempre", () => {
  const ch = limitesR3F3({ slug: "beauty-spa", plan: "pyme" }, []).topes.facturasAutomaticasMes;
  assert.equal(capEfectivo(null, ch, TOPE_MAX_R3F3), CAP_DEFAULT);
  // CH sin cambios: su columna sigue mandando, aunque sea más alta que el default.
  assert.equal(capEfectivo(300, ch, TOPE_MAX_R3F3), 300);
  assert.equal(capEfectivo(300, undefined, TOPE_MAX_R3F3), 300);
  assert.equal(capEfectivo(undefined, undefined, TOPE_MAX_R3F3), CAP_DEFAULT);
  assert.equal(capEfectivo(null, limitesR3F3({ slug: "x", plan: null }, []).topes.facturasAutomaticasMes, TOPE_MAX_R3F3), CAP_DEFAULT);
});

test("R3-F3: «sin tope» no deja el automático sin freno y un valor inválido en la columna se ignora", () => {
  assert.equal(capEfectivo(null, { valor: null, origen: "excepcion" }, TOPE_MAX_R3F3), TOPE_MAX_R3F3);
  assert.equal(capEfectivo(-3, { valor: 30, origen: "plan" }, TOPE_MAX_R3F3), 30);
  assert.equal(capEfectivo(2.5, { valor: 30, origen: "plan" }, TOPE_MAX_R3F3), 30);
});
