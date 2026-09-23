// ============================================================================
// LA COMISIÓN: cuánto es, y que la plata que sale quede asentada.
// ============================================================================
//
// Hasta acá la aritmética de la comisión no tenía UN solo test, pese a ser plata que la
// dueña le entrega en mano a una persona: la fórmula estaba escrita dos veces a mano (la
// pantalla de pendientes y la liquidación que se persiste), `resolvePct` no estaba
// exportada —o sea, no era testeable— y ninguna de las dos copias pasaba por `round2`.
//
// Y liquidar no movía un peso: el egreso había que tipearlo a mano en el libro o el cierre
// del día lo asentaba como "Diferencia de caja" imborrable.
//
// Este archivo prueba las dos puntas: la aritmética pura (bloque 1) y la FORMA del archivo
// que persiste (bloque 2), porque lo que falló no fue una función mal escrita sino que el
// asiento no existía y que había dos copias de una fórmula que tienen que dar lo mismo.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  COMISION_ACTOR_PREFIX,
  calcularLiquidacion,
  comisionMarker,
  egresoDeLiquidacion,
  esEgresoDeComision,
  montoComision,
  parseCashMethod,
  resolvePct,
  type TurnoParaComision,
} from "./comision-liquidacion";
import { round2 } from "./round";
import { motivoParaNoBorrar } from "./caja/libro-caja";

const leer = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

/** Sólo el CÓDIGO: los comentarios de este repo citan las fórmulas viejas a propósito. */
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const d = (s: string) => new Date(`${s}T15:00:00.000Z`);
const turno = (o: Partial<TurnoParaComision> & { id: string }): TurnoParaComision => ({
  serviceId: "svc_general",
  base: 10000,
  startsAt: d("2026-09-10"),
  ...o,
});

// ── 1. El porcentaje: override por (profesional, servicio) vs general ───────

test("el override por servicio gana sobre el % general del profesional", () => {
  const ov = new Map([["svc_unas", 50]]);
  assert.equal(resolvePct(20, ov, "svc_unas"), 50);
});

test("sin override, cae al % general", () => {
  assert.equal(resolvePct(20, new Map([["svc_otro", 50]]), "svc_unas"), 20);
  assert.equal(resolvePct(20, new Map(), "svc_unas"), 20);
});

test("un override de 0 GANA sobre el general: es cómo se declara 'este servicio no paga'", () => {
  // Con `||` en vez de `??` este 0 caería al 30% y se pagaría comisión donde el dueño
  // dijo que no. Es el bug clásico de la línea, por eso tiene test propio.
  assert.equal(resolvePct(30, new Map([["svc_depi", 0]]), "svc_depi"), 0);
});

// ── 2. El monto: pasa por el redondeo único del sistema ────────────────────

test("el monto se redondea a pesos con round2, no se guarda el float crudo", () => {
  // El caso del informe: 12345.67 al 15% da 1851.8505 y así se congelaba en el
  // comprobante (`CommissionPayout.amount` es Float).
  assert.equal(montoComision(12345.67, 15), 1851.85);
  assert.notEqual((12345.67 * 15) / 100, 1851.85); // el crudo NO da eso: por eso hace falta
});

test("los bordes del redondeo son los del sistema (medio hacia arriba, epsilon-safe)", () => {
  assert.equal(montoComision(0.05, 50), 0.03); // 0.025 → 0.03, no 0.02
  assert.equal(montoComision(20.1, 10), 2.01); // 2.0100000000000002 → 2.01
  assert.equal(montoComision(3333.33, 33), 1100); // 1099.99890 → 1100
  assert.equal(montoComision(100, 33.33), 33.33);
});

test("pct 0, negativo o base 0 no generan monto; pct 100 da toda la base", () => {
  assert.equal(montoComision(10000, 0), 0);
  assert.equal(montoComision(10000, -10), 0);
  assert.equal(montoComision(0, 30), 0);
  assert.equal(montoComision(10000, 100), 10000);
});

test("entradas no finitas no propagan NaN al comprobante", () => {
  assert.equal(montoComision(Number.NaN, 30), 0);
  assert.equal(montoComision(1000, Number.POSITIVE_INFINITY), 0);
});

// ── 3. La liquidación completa ─────────────────────────────────────────────

test("acumula varios turnos, mezcla override y general, y devuelve el período", () => {
  const calc = calcularLiquidacion(
    [
      turno({ id: "a1", base: 10000, startsAt: d("2026-09-05") }),
      turno({ id: "a2", serviceId: "svc_unas", base: 8000, startsAt: d("2026-09-01") }),
      turno({ id: "a3", base: 5000, startsAt: d("2026-09-20") }),
    ],
    20,
    new Map([["svc_unas", 50]]),
  );
  assert.deepEqual(calc.ids, ["a1", "a2", "a3"]);
  assert.equal(calc.amount, 2000 + 4000 + 1000);
  assert.equal(calc.ingresos, 23000);
  assert.equal(calc.appointmentCount, 3);
  assert.equal(calc.periodStart?.toISOString(), d("2026-09-01").toISOString());
  assert.equal(calc.periodEnd?.toISOString(), d("2026-09-20").toISOString());
});

test("un turno de un servicio con 0% no entra: ni suma, ni cuenta, ni corre el período", () => {
  // No entrar es lo correcto y no un descuido: si mañana le configuran un %, ese turno
  // sigue disponible. Si lo estampáramos con el payout, quedaría pagado en $0 para siempre.
  const calc = calcularLiquidacion(
    [
      turno({ id: "a1", base: 10000, startsAt: d("2026-09-05") }),
      turno({ id: "cero", serviceId: "svc_depi", base: 99999, startsAt: d("2026-01-01") }),
    ],
    20,
    new Map([["svc_depi", 0]]),
  );
  assert.deepEqual(calc.ids, ["a1"]);
  assert.equal(calc.amount, 2000);
  assert.equal(calc.ingresos, 10000);
  assert.equal(calc.periodStart?.toISOString(), d("2026-09-05").toISOString());
});

test("sin turnos liquidables: todo en cero y sin período (el llamador aborta con esto)", () => {
  const calc = calcularLiquidacion([], 20, new Map());
  assert.deepEqual(calc, {
    ids: [],
    amount: 0,
    ingresos: 0,
    appointmentCount: 0,
    periodStart: null,
    periodEnd: null,
  });
});

test("el total no arrastra ruido de float: redondea por turno y de nuevo al final", () => {
  // Tres turnos de 0.10 al 33.33%: cada uno 0.03333 → 0.03. Sumados en float dan
  // 0.09000000000000001; el comprobante tiene que decir 0.09.
  const turnos = ["t1", "t2", "t3"].map((id) => turno({ id, base: 0.1 }));
  const calc = calcularLiquidacion(turnos, 33.33, new Map());
  assert.equal(calc.amount, 0.09);
  assert.equal(String(calc.amount), "0.09");
  assert.equal(calc.amount, round2(calc.amount)); // ya viene redondeado: nadie tiene que hacerlo después
});

test("la pantalla de pendientes y la liquidación dan EXACTAMENTE lo mismo", () => {
  // La invariante que vale plata: las dos puntas llaman a esta misma función con la misma
  // entrada. Antes eran dos copias a mano de `(payment.amount * pct) / 100` y el propio
  // código advertía que si divergían "la pantalla mostraría un total y la liquidación
  // escribiría otro".
  const turnos = [
    turno({ id: "a1", base: 12345.67 }),
    turno({ id: "a2", serviceId: "svc_unas", base: 7777.77 }),
    turno({ id: "a3", base: 333.33 }),
  ];
  const pantalla = calcularLiquidacion(turnos, 15, new Map([["svc_unas", 40]]));
  const liquidacion = calcularLiquidacion(turnos, 15, new Map([["svc_unas", 40]]));
  assert.equal(pantalla.amount, liquidacion.amount);
  assert.equal(pantalla.amount, 1851.85 + 3111.11 + 50);
});

// ── 4. La marca y el egreso ────────────────────────────────────────────────

test("la marca identifica la liquidación y se reconoce con esEgresoDeComision", () => {
  assert.equal(comisionMarker("cp_9"), `${COMISION_ACTOR_PREFIX}cp_9`);
  assert.ok(esEgresoDeComision({ createdBy: comisionMarker("cp_9") }));
  assert.ok(!esEgresoDeComision({ createdBy: "user:u1" }));
  assert.ok(!esEgresoDeComision({ createdBy: "cierre-diario:2026-09-16" }));
  assert.ok(!esEgresoDeComision({ createdBy: "arqueo-turno:cs_1" }));
  assert.ok(!esEgresoDeComision({ createdBy: null }));
});

const EGRESO_BASE = {
  payoutId: "cp_1",
  profesional: "Ana Gómez",
  amount: 80000,
  method: null as null,
  periodStart: "2026-09-01",
  periodEnd: "2026-09-15",
  dia: "2026-09-16",
  hoy: "2026-09-16",
};

test("el egreso sale como EGRESO, por el monto liquidado y marcado con el payout", () => {
  const e = egresoDeLiquidacion(EGRESO_BASE);
  assert.ok(e);
  assert.equal(e.type, "EGRESO");
  assert.equal(e.amount, 80000);
  assert.equal(e.createdBy, "comision:cp_1");
  assert.match(e.reason, /Comisión Ana Gómez/);
  assert.match(e.reason, /01\/09 a 15\/09/);
});

test("sin medio informado asume EFECTIVO pero LO DICE en el detalle de la fila", () => {
  const e = egresoDeLiquidacion(EGRESO_BASE);
  assert.ok(e);
  assert.equal(e.method, "EFECTIVO");
  assert.equal(e.medioAsumido, true);
  assert.match(e.reason, /medio no informado \(asumido efectivo\)/);
});

test("con medio informado no hay aclaración y el medio es el que se eligió", () => {
  const e = egresoDeLiquidacion({ ...EGRESO_BASE, method: "MP" });
  assert.ok(e);
  assert.equal(e.method, "MP");
  assert.equal(e.medioAsumido, false);
  assert.ok(!/asumido/.test(e.reason));
});

test("si hoy está cerrado, el asiento se imputa al día abierto y NO se pierde la fecha real", () => {
  const e = egresoDeLiquidacion({ ...EGRESO_BASE, dia: "2026-09-17", hoy: "2026-09-16" });
  assert.ok(e);
  assert.equal(e.dia, "2026-09-17");
  assert.equal(e.diferidoPorCierre, true);
  assert.match(e.reason, /pagada el 2026-09-16, día ya cerrado/);
});

test("un período de un solo día no se escribe dos veces", () => {
  const e = egresoDeLiquidacion({ ...EGRESO_BASE, periodStart: "2026-09-05", periodEnd: "2026-09-05" });
  assert.ok(e);
  assert.match(e.reason, /· 05\/09 ·/);
});

test("un nombre larguísimo se recorta: el detalle se lee en una tabla angosta", () => {
  const e = egresoDeLiquidacion({ ...EGRESO_BASE, profesional: "X".repeat(200) });
  assert.ok(e);
  assert.ok(e.reason.length < 130, e.reason);
  assert.match(e.reason, /medio no informado/); // la aclaración sobrevive al recorte
});

test("monto 0 o negativo no inventa una fila en el libro", () => {
  assert.equal(egresoDeLiquidacion({ ...EGRESO_BASE, amount: 0 }), null);
  assert.equal(egresoDeLiquidacion({ ...EGRESO_BASE, amount: -5 }), null);
  assert.equal(egresoDeLiquidacion({ ...EGRESO_BASE, amount: Number.NaN }), null);
});

test("parseCashMethod no confía en el borde", () => {
  assert.equal(parseCashMethod("mp"), "MP");
  assert.equal(parseCashMethod("EFECTIVO"), "EFECTIVO");
  assert.equal(parseCashMethod("cripto"), null);
  assert.equal(parseCashMethod(null), null);
  assert.equal(parseCashMethod(""), null);
});

// ── 5. La FORMA de commission-actions.ts ───────────────────────────────────
//
// Lo que falló no fue una función mal escrita: fue que el asiento no existía y que la
// fórmula estaba duplicada a mano. Eso sólo lo atrapa algo que mire el archivo.

test("settleCommissions asienta el EGRESO DENTRO de la misma transacción que el payout", () => {
  const src = leer("./commission-actions.ts");
  const settle = src.indexOf("export async function settleCommissions");
  assert.ok(settle > 0);
  const cuerpo = src.slice(settle);

  const tx = cuerpo.indexOf("await tenantTransaction(");
  const payout = cuerpo.indexOf("tx.commissionPayout.create(");
  const create = cuerpo.indexOf("tx.cashMovement.create(");
  assert.ok(create > 0, "sin el asiento, el cierre del día ve la comisión pagada como un faltante inexplicable");
  assert.ok(tx > 0 && create > tx, "el asiento tiene que estar dentro de la tx: un payout sin egreso es peor que ninguno de los dos");
  assert.ok(payout > 0 && create > payout, "el asiento va después del payout: la marca lleva su id");
  assert.ok(
    !/prisma\.cashMovement/.test(cuerpo),
    "el asiento no puede usar el cliente global `prisma`: quedaría fuera de la transacción.",
  );
});

test("el asiento queda atado a la liquidación por la marca en createdBy", () => {
  const src = leer("./commission-actions.ts");
  const create = src.indexOf("tx.cashMovement.create(");
  const bloque = src.slice(create, create + 900);
  assert.match(bloque, /createdBy: egreso\.createdBy/, "sin la marca, el libro y el historial no se cruzan por ningún campo");
  assert.match(src, /egresoDeLiquidacion\(/);
});

test("la fórmula de la comisión ya no está escrita a mano en ninguna de las dos puntas", () => {
  const src = sinComentarios(leer("./commission-actions.ts"));
  assert.ok(
    !/\*\s*pct\s*\)\s*\/\s*100/.test(src),
    "volvió la copia manual de la fórmula: las dos puntas tienen que llamar a calcularLiquidacion",
  );
  const usos = src.match(/calcularLiquidacion\(/g) ?? [];
  assert.equal(usos.length, 2, "la pantalla de pendientes y la liquidación usan la MISMA función");
});

test("la base de la comisión es lo COBRADO, nunca el precio de lista", () => {
  // Decisión vigente (ver `comision-liquidable.ts`): se liquida sobre lo efectivamente
  // cobrado. Si alguien alimentara la base con `service.price`, la profesional cobraría
  // comisión sobre plata que no entró.
  const src = leer("./commission-actions.ts");
  const bases = src.match(/base: [^,\n]+/g) ?? [];
  assert.ok(bases.length >= 2, "las dos puntas arman los turnos para el cálculo");
  for (const b of bases) assert.match(b, /payment\.amount/, `base tomada de otro lado: ${b}`);
});

test("el egreso de una liquidación NO se borra desde el libro de caja", () => {
  // Dirección única: la liquidación escribe en el libro, el libro no toca liquidaciones.
  // Borrar la fila dejaría la comisión pagada y la plata como si nunca hubiera salido.
  const libro = leer("./libro-caja-actions.ts");
  const borrar = libro.indexOf("export async function deleteLibroEntry");
  assert.ok(borrar > 0, "libro-caja-actions.ts ya no exporta deleteLibroEntry");
  const cuerpo = libro.slice(borrar);
  // La regla vive en `motivoParaNoBorrar` (caja/libro-caja.ts) y se EJECUTA acá: el egreso
  // marcado `comision:` no se borra. deleteLibroEntry la llama antes de borrar.
  assert.match(
    motivoParaNoBorrar({ type: "EGRESO", createdBy: "comision:pay_1", orderId: null }) ?? "",
    /liquidación de comisión/,
    "deleteLibroEntry tiene que rechazar el egreso marcado `comision:`: sin ese candado se " +
      "borra desde el libro y la comisión queda pagada con la plata de vuelta en el saldo.",
  );
  const guarda = cuerpo.indexOf("motivoParaNoBorrar(");
  assert.ok(guarda !== -1, "deleteLibroEntry tiene que pasar por motivoParaNoBorrar");
  const borrado = cuerpo.indexOf("cashMovement.delete");
  assert.ok(borrado !== -1, "deleteLibroEntry tiene que borrar el movimiento");
  assert.ok(guarda < borrado, "la guarda va ANTES del delete, no después");
});


test("el formulario de liquidación pregunta por qué medio se le pagó", () => {
  // El servidor ya leía `method` con `parseCashMethod` y el formulario no lo mandaba nunca,
  // así que el egreso del libro asumía EFECTIVO en el 100% de las liquidaciones. Hoy todas
  // fueron en efectivo y el default venía dando bien — pero dar bien por casualidad es lo
  // que se está sacando: pagar por transferencia deja el arqueo con faltante en efectivo y
  // sobrante en MP por el mismo importe.
  const page = leer("../app/admin/(dashboard)/reportes/page.tsx");
  const i = page.indexOf("<form action={settleCommissions}");
  assert.ok(i > 0, "no encontré el formulario de liquidación en /admin/reportes");
  const form = page.slice(i, page.indexOf("</form>", i));
  assert.match(form, /name="method"/, "sin este control el medio nunca llega y se vuelve a asumir");
  for (const m of ["EFECTIVO", "MP", "TARJETA"]) {
    assert.match(form, new RegExp(`value="${m}"`), `falta la opción ${m}`);
  }
  assert.match(
    leer("./commission-actions.ts"),
    /parseCashMethod\(formData\.get\("method"\)\)/,
    "la Server Action tiene que leer el medio del formulario",
  );
});
