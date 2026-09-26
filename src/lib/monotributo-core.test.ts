// Monitor de monotributo (C3): las reglas se prueban ejecutándolas, con la tabla vigente.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TABLA_VIGENTE,
  categoriaPorIngresos,
  cuadroDeLaRecategorizacion,
  inicioDelCuadroDeLaRecategorizacion,
  categoriaSiguiente,
  esLetraCategoria,
  evaluarMonotributo,
  ingresosDoceMeses,
  ordenarMonotributo,
  proximaRecategorizacion,
  tablaVigenteEn,
  ventanaDeLectura,
  ventanaDoceMeses,
  type ComprobanteEmitido,
  type HechosMonotributo,
  type TablaMonotributo,
} from "./monotributo-core";

const HOY = "2026-09-26";

function factC(fecha: string, total: number, estado: ComprobanteEmitido["estado"] = "AUTHORIZED"): ComprobanteEmitido {
  return { estado, tipoComprobante: 11, fecha, neto: total, total };
}
function ncC(fecha: string, total: number): ComprobanteEmitido {
  return { estado: "AUTHORIZED", tipoComprobante: 13, fecha, neto: total, total };
}
function cliente(categoria: HechosMonotributo["categoria"], comprobantes: ComprobanteEmitido[]): HechosMonotributo {
  return { clienteTenantId: "t1", alias: "Kiosco de Marta", categoria, comprobantes };
}

/**
 * Cuadro de febrero de 2027 de PRUEBA (no es el de ARCA): los topes de agosto de 2026 con un 12 %
 * encima, redondeados al centavo. Sirve para ver que la recategorización usa el cuadro nuevo.
 */
const CUADRO_FEBRERO_2027: TablaMonotributo = {
  vigenciaDesde: "2027-02-01",
  vigenciaHasta: "2027-07-31",
  fuente: "cuadro de prueba",
  verificadaContraArca: false,
  topes: Object.fromEntries(
    Object.entries(TABLA_VIGENTE.topes).map(([l, t]) => [l, Math.round(t * 112) / 100]),
  ) as TablaMonotributo["topes"],
};
const CUADROS_CON_FEBRERO = [TABLA_VIGENTE, CUADRO_FEBRERO_2027] as const;

// ── Tabla ────────────────────────────────────────────────────────────────────

test("la tabla vigente tiene las 11 categorías con topes crecientes y queda marcada provisional", () => {
  const topes = Object.values(TABLA_VIGENTE.topes);
  assert.equal(topes.length, 11);
  for (let i = 1; i < topes.length; i++) assert.ok(topes[i] > topes[i - 1]);
  assert.equal(TABLA_VIGENTE.topes.A, 12_009_410.45);
  assert.equal(TABLA_VIGENTE.topes.K, 126_610_838.75);
  assert.equal(TABLA_VIGENTE.verificadaContraArca, false);
  assert.ok(tablaVigenteEn(HOY));
  assert.equal(tablaVigenteEn("2027-02-01"), false, "en febrero de 2027 ya hay otra tabla");
});

test("la categoría siguiente de la K no existe; letras válidas A a K", () => {
  assert.equal(categoriaSiguiente("A"), "B");
  assert.equal(categoriaSiguiente("K"), null);
  assert.ok(esLetraCategoria("H"));
  assert.equal(esLetraCategoria("L"), false);
  assert.equal(esLetraCategoria("a"), false);
});

// ── Bordes de categoría ──────────────────────────────────────────────────────

test("facturar exactamente el tope de la A sigue siendo A; un centavo más ya es B", () => {
  assert.equal(categoriaPorIngresos(12_009_410.45, TABLA_VIGENTE), "A");
  assert.equal(categoriaPorIngresos(12_009_410.46, TABLA_VIGENTE), "B");
  assert.equal(categoriaPorIngresos(0, TABLA_VIGENTE), "A");
  assert.equal(categoriaPorIngresos(126_610_838.76, TABLA_VIGENTE), null, "arriba de la K no hay categoría");
});

test("en el tope justo de su categoría está cerca, no excedido", () => {
  const f = evaluarMonotributo(cliente("A", [factC("20260901", 12_009_410.45)]), HOY);
  assert.equal(f.semaforo, "cerca");
  assert.equal(f.corresponde, "A");
  assert.match(f.detalle, /Le quedan \$\s?0,00/);
});

test("un centavo arriba del tope de la B: excedido y le corresponde la C", () => {
  const f = evaluarMonotributo(cliente("B", [factC("20260901", 17_595_182.75)]), HOY);
  assert.equal(f.semaforo, "excedido");
  assert.equal(f.corresponde, "C");
  assert.equal(f.titulo, "Superó el tope de la B");
  assert.match(f.accion, /corresponde la C/);
});

test("el 80 % del tope es cerca; apenas menos es bien", () => {
  const tope = TABLA_VIGENTE.topes.D;
  const cerca = evaluarMonotributo(cliente("D", [factC("20260901", Math.ceil(tope * 0.8 * 100) / 100)]), HOY);
  assert.equal(cerca.semaforo, "cerca");
  assert.equal(cerca.siguiente?.letra, "E");
  assert.match(cerca.accion, /pasa a la E/);
  const bien = evaluarMonotributo(cliente("D", [factC("20260901", Math.floor(tope * 0.79 * 100) / 100)]), HOY);
  assert.equal(bien.semaforo, "bien");
  assert.equal(bien.titulo, "Dentro de la D");
});

test("un cliente de la K que supera su tope: corresponde la exclusión, no otra letra", () => {
  const f = evaluarMonotributo(cliente("K", [factC("20260901", 130_000_000)]), HOY);
  assert.equal(f.semaforo, "excedido");
  assert.equal(f.corresponde, null);
  assert.equal(f.siguiente, null);
  assert.match(f.accion, /exclusión del monotributo/);
});

test("un cliente de la K cerca del tope no tiene categoría siguiente para ofrecer", () => {
  const f = evaluarMonotributo(cliente("K", [factC("20260901", 120_000_000)]), HOY);
  assert.equal(f.semaforo, "cerca");
  assert.match(f.accion, /última categoría/);
});

// ── 12 meses móviles ─────────────────────────────────────────────────────────

test("la ventana va del día siguiente al mismo día del año pasado hasta hoy", () => {
  assert.deepEqual(ventanaDoceMeses("2026-09-26"), { desde: "2025-09-27", hasta: "2026-09-26" });
  assert.deepEqual(ventanaDoceMeses("2026-12-31"), { desde: "2026-01-01", hasta: "2026-12-31" });
  assert.deepEqual(ventanaDoceMeses("2028-02-29"), { desde: "2027-03-01", hasta: "2028-02-29" });
});

test("12 meses móviles: lo del mismo día del año pasado ya no cuenta; lo del día siguiente sí", () => {
  const r = ingresosDoceMeses(
    [factC("20250926", 1_000_000), factC("20250927", 200), factC("20260926", 50), factC("20260927", 9_999)],
    HOY,
  );
  assert.equal(r.ingresos, 250, "afuera: 26/09/2025 (viejo) y 27/09/2026 (futuro)");
  assert.equal(r.comprobantes, 2);
});

test("una factura grande que sale de la ventana devuelve al cliente a su categoría", () => {
  const comps = [factC("20251001", 11_000_000), factC("20260801", 2_000_000)];
  assert.equal(evaluarMonotributo(cliente("A", comps), "2026-09-30").semaforo, "excedido");
  assert.equal(evaluarMonotributo(cliente("A", comps), "2026-10-01").semaforo, "bien");
});

// ── Notas de crédito, estados y letras ───────────────────────────────────────

test("las notas de crédito restan: sin ellas estaría excedido, con ellas no", () => {
  const sinNc = evaluarMonotributo(cliente("A", [factC("20260301", 12_500_000)]), HOY);
  assert.equal(sinNc.semaforo, "excedido");
  const conNc = evaluarMonotributo(cliente("A", [factC("20260301", 12_500_000), ncC("20260305", 3_000_000)]), HOY);
  assert.equal(conNc.semaforo, "bien");
  assert.equal(conNc.ingresos.ingresos, 9_500_000);
  assert.equal(conNc.ingresos.notasDeCredito, 1);
});

test("sólo cuenta lo autorizado por ARCA: pendientes y rechazadas no suman", () => {
  const r = ingresosDoceMeses(
    [factC("20260901", 100), factC("20260901", 7_000, "PENDING"), factC("20260901", 9_000, "REJECTED")],
    HOY,
  );
  assert.equal(r.ingresos, 100);
});

test("en una factura A o B cuenta el neto (el IVA no es ingreso); en la C, el total", () => {
  const r = ingresosDoceMeses(
    [
      { estado: "AUTHORIZED", tipoComprobante: 6, fecha: "20260110", neto: 1000, total: 1210 },
      { estado: "AUTHORIZED", tipoComprobante: 8, fecha: "20260111", neto: 100, total: 121 },
      { estado: "AUTHORIZED", tipoComprobante: 12, fecha: "20260112", neto: 30, total: 30 },
      factC("20260113", 0.1),
      factC("20260114", 0.2),
    ],
    HOY,
  );
  assert.equal(r.ingresos, 930.3, "1000 − 100 + 30 + 0,10 + 0,20, al centavo");
});

// ── Sin categoría ────────────────────────────────────────────────────────────

test("sin categoría cargada NO asume la A: pide cargarla y no inventa tope", () => {
  const f = evaluarMonotributo(cliente(null, [factC("20260901", 20_000_000)]), HOY);
  assert.equal(f.semaforo, "sin_categoria");
  assert.equal(f.titulo, "Cargá la categoría");
  assert.equal(f.topePropio, null);
  assert.equal(f.proporcion, null);
  assert.equal(f.corresponde, "C", "igual informa qué letra alcanza para lo facturado");
  assert.doesNotMatch(f.detalle + f.accion, /\bla A\b/);
});

// ── Recategorización y orden ─────────────────────────────────────────────────

test("próxima recategorización: la de febrero mira hasta el 31/12 y vence el 5; la de agosto, hasta el 30/06", () => {
  assert.deepEqual(proximaRecategorizacion("2026-09-26"), {
    mes: "febrero", anio: 2027, cierreDelPeriodo: "2026-12-31", vence: "2027-02-05", enCurso: false,
  });
  assert.deepEqual(proximaRecategorizacion("2026-03-10"), {
    mes: "agosto", anio: 2026, cierreDelPeriodo: "2026-06-30", vence: "2026-08-05", enCurso: false,
  });
  assert.deepEqual(proximaRecategorizacion("2027-01-15"), {
    mes: "febrero", anio: 2027, cierreDelPeriodo: "2026-12-31", vence: "2027-02-05", enCurso: true,
  });
});

test("recategorización: en curso desde el cierre del semestre hasta el día 5, inclusive", () => {
  assert.equal(proximaRecategorizacion("2026-06-30").enCurso, false, "el semestre todavía no cerró");
  assert.equal(proximaRecategorizacion("2026-07-01").enCurso, true);
  assert.equal(proximaRecategorizacion("2026-08-05").enCurso, true, "el 5 de agosto todavía se puede");
  const despues = proximaRecategorizacion("2026-08-06");
  assert.equal(despues.enCurso, false);
  assert.equal(despues.mes, "febrero");
  assert.equal(despues.anio, 2027);
  assert.equal(proximaRecategorizacion("2027-02-05").enCurso, true);
  assert.equal(proximaRecategorizacion("2027-02-06").mes, "agosto");
  assert.equal(proximaRecategorizacion("2026-12-31").mes, "febrero", "el 31/12 el semestre cierra hoy");
  assert.equal(proximaRecategorizacion("2026-12-31").enCurso, false);
});

test("orden: excedidos, después sin categoría, después cerca (el más apretado primero), después bien", () => {
  const f = (alias: string, cat: HechosMonotributo["categoria"], monto: number) =>
    evaluarMonotributo({ ...cliente(cat, [factC("20260901", monto)]), alias, clienteTenantId: alias }, HOY);
  const orden = ordenarMonotributo([
    f("bien", "C", 1_000),
    f("cerca80", "A", 9_700_000),
    f("sin", null, 1),
    f("cerca95", "A", 11_500_000),
    f("excedido", "A", 20_000_000),
  ]).map((x) => x.alias);
  assert.deepEqual(orden, ["excedido", "sin", "cerca95", "cerca80", "bien"]);
});

// ── Recategorización en curso: lo que ARCA mira es el semestre cerrado ──────

test("fuera de la ventana de recategorización no se informa el cierre del semestre", () => {
  const f = evaluarMonotributo(cliente("C", [factC("20260901", 1_000)]), HOY);
  assert.equal(f.alCierre, null);
});

test("en la ventana de agosto mira los 12 meses al 30/06: lo de julio no cuenta, lo de julio del año pasado sí", () => {
  // Hoy 20/07/2026: ventana al cierre = 01/07/2025 al 30/06/2026.
  const f = evaluarMonotributo(
    cliente("A", [
      factC("20250701", 10_000_000), // entra al cierre; fuera de los 12 móviles (arrancan el 21/07/2025)
      factC("20260630", 5_000_000), // entra en los dos
      factC("20260710", 50_000_000), // sólo en los móviles: después del cierre
    ]),
    "2026-07-20",
  );
  assert.ok(f.alCierre);
  assert.equal(f.alCierre.hasta, "2026-06-30");
  assert.equal(f.alCierre.vence, "2026-08-05");
  assert.equal(f.alCierre.ingresos, 15_000_000);
  assert.equal(f.alCierre.corresponde, "B");
  assert.equal(f.alCierre.cambia, true);
  assert.match(f.alCierre.texto, /le corresponde la B\. Recategorizalo antes del 05\/08\/2026\./);
  assert.equal(f.ingresos.ingresos, 55_000_000, "los 12 móviles no incluyen el 01/07/2025");
});

test("al cierre sigue en su categoría: no pide recategorizar", () => {
  const f = evaluarMonotributo(cliente("B", [factC("20261115", 15_000_000)]), "2027-01-10", CUADROS_CON_FEBRERO);
  assert.ok(f.alCierre);
  assert.equal(f.alCierre.cambia, false);
  assert.match(f.alCierre.texto, /sigue en la B\.$/);
});

test("al cierre facturó menos: también cambia (baja de categoría y paga menos)", () => {
  const f = evaluarMonotributo(cliente("D", [factC("20261115", 1_000_000)]), "2027-02-03", CUADROS_CON_FEBRERO);
  assert.equal(f.alCierre?.corresponde, "A");
  assert.equal(f.alCierre?.cambia, true);
});

test("al cierre sin categoría cargada informa la letra pero no dice que cambia", () => {
  const f = evaluarMonotributo(cliente(null, [factC("20261115", 20_000_000)]), "2027-01-10", CUADROS_CON_FEBRERO);
  assert.equal(f.semaforo, "sin_categoria");
  assert.equal(f.alCierre?.cambia, false);
  assert.match(f.alCierre?.texto ?? "", /le corresponde la C\.$/);
});

test("al cierre por encima de la K: pide revisarlo antes del vencimiento", () => {
  const f = evaluarMonotributo(cliente("K", [factC("20261115", 150_000_000)]), "2027-01-10", CUADROS_CON_FEBRERO);
  assert.equal(f.alCierre?.corresponde, null);
  assert.match(f.alCierre?.texto ?? "", /supera el tope de la K\. Revisalo antes del 05\/02\/2027\./);
});

test("al cierre las notas de crédito del semestre también restan", () => {
  const f = evaluarMonotributo(
    cliente("A", [factC("20261001", 13_000_000), ncC("20261020", 2_000_000), ncC("20270105", 5_000_000)]),
    "2027-01-10",
    CUADROS_CON_FEBRERO,
  );
  assert.equal(f.alCierre?.ingresos, 11_000_000, "la NC de enero es posterior al cierre");
  assert.equal(f.alCierre?.cambia, false);
});

test("ventana de lectura: en la recategorización arranca en el inicio de los 12 meses al cierre", () => {
  assert.deepEqual(ventanaDeLectura("2026-07-20"), { desde: "2025-07-01", hasta: "2026-07-20" });
  assert.deepEqual(ventanaDeLectura(HOY), ventanaDoceMeses(HOY));
  assert.deepEqual(ventanaDeLectura("2027-02-05"), { desde: "2026-01-01", hasta: "2027-02-05" });
});

test("orden: a igual semáforo, primero quien tiene que recategorizarse ahora", () => {
  const hoy = "2027-01-10";
  const quieto = evaluarMonotributo({ ...cliente("D", [factC("20270105", 1_000)]), alias: "A quieto", clienteTenantId: "q" }, hoy, CUADROS_CON_FEBRERO);
  const baja = evaluarMonotributo({ ...cliente("D", [factC("20261201", 1_000)]), alias: "Z baja", clienteTenantId: "b" }, hoy, CUADROS_CON_FEBRERO);
  assert.equal(quieto.alCierre?.cambia, true, "al 31/12 no facturó nada: le corresponde la A");
  const sigue = evaluarMonotributo({ ...cliente("A", [factC("20261201", 1_000)]), alias: "M sigue", clienteTenantId: "s" }, hoy, CUADROS_CON_FEBRERO);
  assert.deepEqual(ordenarMonotributo([sigue, baja, quieto]).map((f) => f.alias), ["A quieto", "Z baja", "M sigue"]);
});

// ── La recategorización se hace con el cuadro NUEVO (GSG-20 / refutador C3) ──
// La de febrero usa el cuadro vigente desde el 1 de febrero; la de agosto, el del 1 de agosto.
// Mientras ese cuadro no esté cargado, el monitor no da letra: dice "a revisar".

test("15 de enero: sin el cuadro de febrero cargado NO da letra; pide revisar (caso del refutador)", () => {
  // Cliente en la C con $25.000.000 al 31/12/2026: con el cuadro que se va le daría la D.
  const f = evaluarMonotributo(cliente("C", [factC("20261115", 25_000_000)]), "2027-01-15");
  assert.ok(f.alCierre);
  assert.equal(f.alCierre.cuadroFaltante, true);
  assert.equal(f.alCierre.corresponde, null);
  assert.equal(f.alCierre.cambia, false);
  assert.match(f.alCierre.texto, /A revisar: falta cargar el cuadro de categorías de febrero de 2027/);
  assert.doesNotMatch(f.alCierre.texto, /le corresponde la D|Recategorizalo/);
  assert.doesNotMatch(f.accion, /le corresponde la D/, "tampoco la acción del renglón da la letra del cuadro que se va");
});

test("15 de enero con el cuadro de febrero cargado: recategoriza con ése, no con el que se va", () => {
  const f = evaluarMonotributo(cliente("C", [factC("20261115", 25_000_000)]), "2027-01-15", CUADROS_CON_FEBRERO);
  assert.equal(f.alCierre?.cuadroFaltante, false);
  assert.equal(f.alCierre?.corresponde, "C", "con los topes de febrero los $25 M entran en la C");
  assert.equal(f.alCierre?.cambia, false);
  assert.match(f.alCierre?.texto ?? "", /sigue en la C\.$/);
  // El semáforo del día sigue midiendo contra el cuadro vigente HOY (el de agosto de 2026).
  assert.equal(f.semaforo, "excedido");
});

test("baja de categoría: también espera el cuadro nuevo", () => {
  const sin = evaluarMonotributo(cliente("D", [factC("20261115", 1_000_000)]), "2027-01-15");
  assert.equal(sin.alCierre?.corresponde, null);
  assert.equal(sin.alCierre?.cambia, false);
  const con = evaluarMonotributo(cliente("D", [factC("20261115", 1_000_000)]), "2027-01-15", CUADROS_CON_FEBRERO);
  assert.equal(con.alCierre?.corresponde, "A");
  assert.equal(con.alCierre?.cambia, true);
});

test("15 de julio de 2027: sin el cuadro de agosto de 2027 tampoco da letra", () => {
  const f = evaluarMonotributo(cliente("A", [factC("20270301", 15_000_000)]), "2027-07-15", CUADROS_CON_FEBRERO);
  assert.equal(f.alCierre?.cuadroFaltante, true);
  assert.match(f.alCierre?.texto ?? "", /falta cargar el cuadro de categorías de agosto de 2027/);
});

test("el cuadro de la recategorización es el que empieza el 1 del mes en que vence", () => {
  assert.equal(cuadroDeLaRecategorizacion(proximaRecategorizacion("2026-07-20"))?.vigenciaDesde, "2026-08-01");
  assert.equal(cuadroDeLaRecategorizacion(proximaRecategorizacion("2027-01-15")), null);
  assert.equal(
    cuadroDeLaRecategorizacion(proximaRecategorizacion("2027-02-05"), CUADROS_CON_FEBRERO)?.vigenciaDesde,
    "2027-02-01",
  );
  assert.equal(inicioDelCuadroDeLaRecategorizacion(proximaRecategorizacion("2027-01-15")), "2027-02-01");
});

test("el semáforo del día usa el cuadro vigente hoy: desde febrero, el nuevo", () => {
  // $25 M en la C: con el cuadro de agosto de 2026 es excedido; con el de febrero de 2027, no.
  const f = evaluarMonotributo(cliente("C", [factC("20261115", 25_000_000)]), "2027-02-10", CUADROS_CON_FEBRERO);
  assert.equal(f.semaforo, "cerca");
  assert.equal(f.topePropio, CUADRO_FEBRERO_2027.topes.C);
});
