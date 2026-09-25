// Tests de la rendición: cuadratura contra el anticipo y máquina de estados (reducer puro con
// guardias y separación de funciones). node:test.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aplicarAccion,
  calcularCuadratura,
  comprobantesDeRendicion,
  lineasQueNoSeRinden,
  totalRendicion,
} from "./rendicion";
import { anticipo, comprobante, congelar, rendicion } from "./rendiciones.fixture";
import type { ContextoTransicion, Cuadratura, Evaluacion, MedioPago, Rendicion } from "./tipos";

const EF: MedioPago = { tipo: "efectivo_anticipo", anticipoId: "A-1" };
const RC: MedioPago = { tipo: "recargable", tarjetaId: "T-1" };
const TC: MedioPago = { tipo: "tarjeta_corporativa", tarjetaId: "T-2" };
const PR: MedioPago = { tipo: "propio_a_reintegrar" };

/** Un gasto: para la cuadratura sólo importan el total y el medio de pago. */
function gasto(id: string, total: number, medioPago: MedioPago) {
  return comprobante({ id, datos: { clase: "factura_b", lineasIva: [], total }, imputacion: { medioPago } });
}

function conGastos(gastos: ReturnType<typeof gasto>[], parcial: Partial<Rendicion> = {}): Rendicion {
  return rendicion({ anticipoIds: ["A-1"], comprobanteIds: gastos.map((g) => g.id), ...parcial });
}

// ── Cuadratura ───────────────────────────────────────────────────────────────

test("cuadratura: falta justificar, con el mensaje del contrato tal cual", () => {
  const gastos = [gasto("C-1", 40000000, EF), gasto("C-2", 4730000, EF)];
  const q = calcularCuadratura(conGastos(gastos, { devolucionDeclarada: 4000000 }), [anticipo()], gastos, 2);
  assert.deepEqual(q, {
    anticipado: 50000000,
    rendido: 44730000,
    devuelto: 4000000,
    diferencia: 1270000,
    aReintegrar: 0,
    cuadra: false,
    mensaje: "Recibiste $500.000, rendiste $447.300 y declaraste devolver $40.000. Faltan justificar $12.700.",
  });
});

test("cuadratura: sin devolución declarada, el mensaje no la menciona", () => {
  const gastos = [gasto("C-1", 6000000, EF)];
  const q = calcularCuadratura(conGastos(gastos), [anticipo({ importe: 10000000 })], gastos, 2);
  assert.equal(q.mensaje, "Recibiste $100.000 y rendiste $60.000. Faltan justificar $40.000.");
});

test("cuadratura: cuadra exacto y dentro de la tolerancia", () => {
  const exacto = [gasto("C-1", 30000000, RC)];
  const q = calcularCuadratura(conGastos(exacto), [anticipo({ importe: 30000000, medio: "recargable" })], exacto, 2);
  assert.equal(q.cuadra, true);
  assert.equal(q.diferencia, 0);
  assert.equal(q.mensaje, "Cuadra: recibiste $300.000 y justificaste todo.");

  const casi = [gasto("C-1", 29999998, RC)];
  assert.equal(calcularCuadratura(conGastos(casi), [anticipo({ importe: 30000000 })], casi, 2).cuadra, true);
  const pasado = [gasto("C-1", 29999997, RC)];
  assert.equal(calcularCuadratura(conGastos(pasado), [anticipo({ importe: 30000000 })], pasado, 2).cuadra, false);
});

test("cuadratura: una línea bloqueada o derivada a Cuentas a Pagar no se rinde ni se reintegra", () => {
  const gastos = [
    gasto("C-ok", 6000000, EF),
    gasto("C-bloq-ef", 1000000, EF), // bloqueada: no justifica el anticipo
    gasto("C-bloq-pr", 3000000, PR), // bloqueada: no se reintegra
    gasto("C-cxp", 5000000, PR), // derivada a Cuentas a Pagar: se paga por otro circuito
  ];
  const ev = (comprobanteId: string, bloqueado: boolean, carril: Evaluacion["carril"]) =>
    ({ comprobanteId, bloqueado, carril }) as Evaluacion;
  const evaluaciones = [
    ev("C-ok", false, "asiento"),
    ev("C-bloq-ef", true, "asiento"),
    ev("C-bloq-pr", true, "asiento"),
    ev("C-cxp", false, "cuentas_a_pagar"),
  ];
  const q = calcularCuadratura(conGastos(gastos), [anticipo({ importe: 10000000 })], gastos, 2, evaluaciones);
  assert.equal(q.rendido, 6000000);
  assert.equal(q.diferencia, 4000000);
  assert.equal(q.aReintegrar, 0);
  assert.equal(q.cuadra, false);
  // Sin evaluaciones (llamada vieja), todo cuenta como antes.
  const sin = calcularCuadratura(conGastos(gastos), [anticipo({ importe: 10000000 })], gastos, 2);
  assert.equal(sin.rendido, 7000000);
  assert.equal(sin.aReintegrar, 8000000);
});

test("cuadratura: si gastó de más, cuadra y queda a reintegrar", () => {
  const gastos = [gasto("C-1", 12000000, EF)];
  const q = calcularCuadratura(conGastos(gastos), [anticipo({ importe: 10000000 })], gastos, 2);
  assert.equal(q.diferencia, -2000000);
  assert.equal(q.cuadra, true);
  assert.equal(q.aReintegrar, 2000000);
  assert.equal(q.mensaje, "Gastaste $20.000 más que el anticipo: te lo reintegramos.");
});

test("cuadratura: con una devolución de más, avisa que se pasa", () => {
  const gastos = [gasto("C-1", 9000000, EF)];
  const q = calcularCuadratura(conGastos(gastos, { devolucionDeclarada: 2000000 }), [anticipo({ importe: 10000000 })], gastos, 2);
  assert.equal(q.diferencia, -1000000);
  assert.equal(q.cuadra, true);
  assert.equal(q.aReintegrar, 1000000);
  assert.match(q.mensaje, /te pasás \$10\.000 del anticipo/);
});

test("cuadratura: lo pagado de su bolsillo va a reintegrar; la tarjeta corporativa no cuenta; la recargable sí", () => {
  const gastos = [gasto("C-1", 5000000, EF), gasto("C-2", 3000000, RC), gasto("C-3", 700000, PR), gasto("C-4", 900000, TC)];
  const q = calcularCuadratura(conGastos(gastos), [anticipo({ importe: 8000000 })], gastos, 2);
  assert.equal(q.rendido, 8000000);
  assert.equal(q.aReintegrar, 700000);
  assert.equal(q.cuadra, true);
});

test("cuadratura: sólo los anticipos y las líneas de la rendición", () => {
  const mio = gasto("C-1", 5000000, EF);
  const quitado = gasto("C-2", 9999900, EF); // sigue con rendicionId R-1, pero ya no está en la lista
  const r = conGastos([mio]);
  const q = calcularCuadratura(r, [anticipo(), anticipo({ id: "A-otro", importe: 777 })], [mio, quitado], 2);
  assert.equal(q.anticipado, 50000000);
  assert.equal(q.rendido, 5000000);
  assert.deepEqual(comprobantesDeRendicion(r, [quitado, mio]).map((c) => c.id), ["C-1"]);
});

test("cuadratura: sin anticipo, el mensaje habla del reintegro", () => {
  const gastos = [gasto("C-1", 450000, PR)];
  const q = calcularCuadratura(conGastos(gastos, { anticipoIds: [] }), [], gastos, 2);
  assert.equal(q.cuadra, true);
  assert.equal(q.aReintegrar, 450000);
  assert.equal(q.mensaje, "No hay anticipo: te reintegramos $4.500 que pagaste de tu bolsillo.");
});

test("totalRendicion suma todos los medios (en pesos)", () => {
  assert.equal(totalRendicion([gasto("C-1", 100, EF), gasto("C-2", 200, PR), gasto("C-3", 300, TC)]), 600);
  const usd = comprobante({ datos: { moneda: "USD", cotizacion: 1000, total: 100 } });
  assert.equal(totalRendicion([usd]), 100000);
});

// ── Máquina de estados ───────────────────────────────────────────────────────

const CUADRA: Cuadratura = {
  anticipado: 0,
  rendido: 0,
  devuelto: 0,
  diferencia: 0,
  aReintegrar: 0,
  cuadra: true,
  mensaje: "Cuadra: recibiste $0 y justificaste todo.",
};

const NO_CUADRA: Cuadratura = {
  ...CUADRA,
  diferencia: 1270000,
  cuadra: false,
  mensaje: "Recibiste $500.000, rendiste $447.300 y declaraste devolver $40.000. Faltan justificar $12.700.",
};

function evaluacion(bloqueado: boolean, id = "C-1"): Evaluacion {
  return {
    comprobanteId: id,
    tratamiento: "computable",
    carril: "factura",
    creditoFiscal: 0,
    costo: 0,
    percepcionesComputables: 0,
    validaciones: bloqueado ? [{ codigo: "V6_DUPLICADO", severidad: "bloquea", mensaje: "x" }] : [],
    bloqueado,
    reglaVersion: "x",
  };
}

function ctx(parcial: Partial<ContextoTransicion> = {}): ContextoTransicion {
  return {
    fecha: "2026-09-24",
    actorLegajo: "1001",
    cuadratura: CUADRA,
    evaluaciones: [evaluacion(false)],
    niveles: [["2001"], ["3001"]],
    ...parcial,
  };
}

function ok(r: ReturnType<typeof aplicarAccion>): Rendicion {
  if (!r.ok) assert.fail(r.motivo);
  return r.rendicion;
}

function motivo(r: ReturnType<typeof aplicarAccion>): string {
  assert.equal(r.ok, false);
  return r.ok ? "" : r.motivo;
}

test("enviar: de borrador o devuelta a en aprobación, nivel 0, y queda en la bitácora", () => {
  for (const estado of ["borrador", "devuelta"] as const) {
    const r = congelar(rendicion({ estado, nivelActual: 1 }));
    const nueva = ok(aplicarAccion(r, "enviar", ctx()));
    assert.equal(nueva.estado, "en_aprobacion");
    assert.equal(nueva.nivelActual, 0);
    assert.deepEqual(nueva.historial, [{ fecha: "2026-09-24", actorLegajo: "1001", accion: "enviar" }]);
    assert.equal(r.estado, estado); // la original no cambia
    assert.equal(r.historial.length, 0);
  }
});

test("enviar: si no cuadra o hay bloqueos, el motivo dice qué falta", () => {
  const r = rendicion();
  assert.equal(
    motivo(aplicarAccion(r, "enviar", ctx({ cuadratura: NO_CUADRA }))),
    `Todavía no se puede enviar. ${NO_CUADRA.mensaje}`,
  );
  assert.equal(
    motivo(aplicarAccion(r, "enviar", ctx({ evaluaciones: [evaluacion(true), evaluacion(true, "C-2")] }))),
    "Todavía no se puede enviar. Hay 2 comprobantes bloqueados: resolvelos antes de enviar.",
  );
  assert.equal(
    motivo(aplicarAccion(r, "enviar", ctx({ cuadratura: NO_CUADRA, evaluaciones: [evaluacion(true)] }))),
    `Todavía no se puede enviar. ${NO_CUADRA.mensaje} Hay 1 comprobante bloqueado: resolvelos antes de enviar.`,
  );
});

test("aprobar: nivel por nivel hasta aprobada, con el nivel en cada evento", () => {
  const r0 = rendicion({ estado: "en_aprobacion" });
  const r1 = ok(aplicarAccion(r0, "aprobar", ctx({ actorLegajo: "2001" })));
  assert.equal(r1.estado, "en_aprobacion");
  assert.equal(r1.nivelActual, 1);
  const r2 = ok(aplicarAccion(r1, "aprobar", ctx({ actorLegajo: "3001", fecha: "2026-09-25" })));
  assert.equal(r2.estado, "aprobada");
  assert.deepEqual(r2.historial, [
    { fecha: "2026-09-24", actorLegajo: "2001", accion: "aprobar", nivel: 0 },
    { fecha: "2026-09-25", actorLegajo: "3001", accion: "aprobar", nivel: 1 },
  ]);
});

test("aprobar: sólo quien está en el nivel en curso, y nadie aprueba lo propio", () => {
  const r = rendicion({ estado: "en_aprobacion" });
  assert.equal(motivo(aplicarAccion(r, "aprobar", ctx({ actorLegajo: "3001" }))), "No sos aprobador del nivel 1 de esta rendición");
  assert.equal(
    motivo(aplicarAccion(r, "aprobar", ctx({ actorLegajo: "1001", niveles: [["1001"]] }))),
    "Nadie aprueba lo propio: esta rendición es tuya",
  );
  assert.equal(
    motivo(aplicarAccion(r, "aprobar", ctx({ actorLegajo: "2001", niveles: [[]] }))),
    "Este nivel no tiene aprobador: avisale a Administración",
  );
});

test("devolver: exige comentario, lo puede hacer el aprobador o Tesorería, y guarda las líneas señaladas", () => {
  const enAprobacion = rendicion({ estado: "en_aprobacion" });
  assert.equal(
    motivo(aplicarAccion(enAprobacion, "devolver", ctx({ actorLegajo: "2001", comentario: "  " }))),
    "Para devolver, escribí un comentario que diga qué hay que corregir",
  );
  assert.equal(
    motivo(aplicarAccion(enAprobacion, "devolver", ctx({ actorLegajo: "4001", comentario: "Falta el ticket" }))),
    "No sos aprobador del nivel 1 de esta rendición",
  );
  const devuelta = ok(
    aplicarAccion(enAprobacion, "devolver", ctx({ actorLegajo: "2001", comentario: " Falta la patente ", comprobanteIds: ["C-1"] })),
  );
  assert.equal(devuelta.estado, "devuelta");
  assert.deepEqual(devuelta.historial.at(-1), {
    fecha: "2026-09-24",
    actorLegajo: "2001",
    accion: "devolver",
    comentario: "Falta la patente",
    comprobanteIds: ["C-1"],
    nivel: 0,
  });

  const enControl = rendicion({ estado: "en_control" });
  assert.equal(ok(aplicarAccion(enControl, "devolver", ctx({ actorLegajo: "4001", comentario: "Apócrifa" }))).estado, "devuelta");
  assert.equal(
    motivo(aplicarAccion(enControl, "devolver", ctx({ actorLegajo: "1001", comentario: "Me la devuelvo" }))),
    "Nadie controla lo propio: esta rendición es tuya",
  );
});

test("rechazar: exige el motivo y ser aprobador del nivel", () => {
  const r = rendicion({ estado: "en_aprobacion" });
  assert.equal(motivo(aplicarAccion(r, "rechazar", ctx({ actorLegajo: "2001" }))), "Para rechazar, escribí el motivo");
  assert.equal(
    motivo(aplicarAccion(r, "rechazar", ctx({ actorLegajo: "4001", comentario: "No" }))),
    "No sos aprobador del nivel 1 de esta rendición",
  );
  assert.equal(
    motivo(aplicarAccion(r, "rechazar", ctx({ actorLegajo: "1001", comentario: "No", niveles: [["1001"]] }))),
    "Nadie aprueba lo propio: esta rendición es tuya",
  );
  const rechazada = ok(aplicarAccion(r, "rechazar", ctx({ actorLegajo: "2001", comentario: "Gasto personal" })));
  assert.equal(rechazada.estado, "rechazada");
  assert.equal(rechazada.historial.at(-1)?.comentario, "Gasto personal");
});

test("Tesorería: tomar el control, contabilizar (sin bloqueos) y cerrar", () => {
  const aprobada = rendicion({ estado: "aprobada" });
  const enControl = ok(aplicarAccion(aprobada, "tomar_control", ctx({ actorLegajo: "4001" })));
  assert.equal(enControl.estado, "en_control");
  assert.equal(
    motivo(aplicarAccion(enControl, "contabilizar", ctx({ actorLegajo: "4001", evaluaciones: [evaluacion(true)] }))),
    "No se puede contabilizar: hay 1 comprobante bloqueado. Devolvé la rendición o sacá esas líneas.",
  );
  const contabilizada = ok(aplicarAccion(enControl, "contabilizar", ctx({ actorLegajo: "4001" })));
  assert.equal(contabilizada.estado, "contabilizada");
  const cerrada = ok(aplicarAccion(contabilizada, "cerrar", ctx({ actorLegajo: "4001" })));
  assert.equal(cerrada.estado, "cerrada");
  assert.deepEqual(
    cerrada.historial.map((e) => e.accion),
    ["tomar_control", "contabilizar", "cerrar"],
  );
  assert.equal(
    motivo(aplicarAccion(aprobada, "tomar_control", ctx({ actorLegajo: "1001" }))),
    "Nadie controla lo propio: esta rendición es tuya",
  );
});

/** Una evaluación que avisa que falta constatar en ARCA (advierte: no bloquea). */
function pendiente(id = "C-9"): Evaluacion {
  return {
    ...evaluacion(false, id),
    validaciones: [
      {
        codigo: "R4_CONSTATACION_PENDIENTE",
        severidad: "advierte",
        mensaje: "Falta constatarlo en ARCA: no se contabiliza hasta tener la respuesta",
      },
    ],
  };
}

test("contabilizar: con algo sin constatar en ARCA no se puede, aunque no esté bloqueado", () => {
  const enControl = rendicion({ estado: "en_control" });
  assert.equal(
    motivo(aplicarAccion(enControl, "contabilizar", ctx({ actorLegajo: "4001", evaluaciones: [evaluacion(false), pendiente()] }))),
    "No se puede contabilizar: hay 1 comprobante sin constatar en ARCA. Esperá la respuesta y volvé a intentar.",
  );
  assert.equal(
    motivo(aplicarAccion(enControl, "contabilizar", ctx({ actorLegajo: "4001", evaluaciones: [pendiente("C-8"), pendiente()] }))),
    "No se puede contabilizar: hay 2 comprobantes sin constatar en ARCA. Esperá la respuesta y volvé a intentar.",
  );
  // Primero se ve el bloqueo (hay que devolver); la constatación pendiente, después.
  assert.match(
    motivo(aplicarAccion(enControl, "contabilizar", ctx({ actorLegajo: "4001", evaluaciones: [evaluacion(true), pendiente()] }))),
    /hay 1 comprobante bloqueado/,
  );
  // Para enviar y aprobar alcanza con el aviso: la constatación se espera antes de contabilizar.
  assert.equal(ok(aplicarAccion(rendicion(), "enviar", ctx({ evaluaciones: [pendiente()] }))).estado, "en_aprobacion");
});

test("rolesActor: si viene y no incluye Tesorería, no se puede pasar a control, contabilizar ni cerrar", () => {
  const casos = [
    { r: rendicion({ estado: "aprobada" }), accion: "tomar_control" as const, verbo: "pasar a control" },
    { r: rendicion({ estado: "en_control" }), accion: "contabilizar" as const, verbo: "contabilizar" },
    { r: rendicion({ estado: "contabilizada" }), accion: "cerrar" as const, verbo: "cerrar" },
  ];
  for (const { r, accion, verbo } of casos) {
    assert.equal(
      motivo(aplicarAccion(r, accion, ctx({ actorLegajo: "2001", rolesActor: ["aprueba"] }))),
      `Sólo Tesorería puede ${verbo} una rendición`,
    );
    assert.equal(motivo(aplicarAccion(r, accion, ctx({ actorLegajo: "5001", rolesActor: [] }))), `Sólo Tesorería puede ${verbo} una rendición`);
    assert.equal(ok(aplicarAccion(r, accion, ctx({ actorLegajo: "4001", rolesActor: ["tesoreria"] }))).historial.length, 1);
    assert.equal(ok(aplicarAccion(r, accion, ctx({ actorLegajo: "4001", rolesActor: ["aprueba", "tesoreria"] }))).historial.length, 1);
    // Sin rolesActor no se controla el rol (compatibilidad).
    assert.equal(ok(aplicarAccion(r, accion, ctx({ actorLegajo: "4001" }))).historial.length, 1);
  }
  // Las demás acciones no dependen del rol de Tesorería.
  const enAprobacion = rendicion({ estado: "en_aprobacion" });
  assert.equal(ok(aplicarAccion(enAprobacion, "aprobar", ctx({ actorLegajo: "2001", rolesActor: ["aprueba"] }))).nivelActual, 1);
  // Tener el rol no habilita a controlar lo propio.
  assert.equal(
    motivo(aplicarAccion(rendicion({ estado: "aprobada" }), "tomar_control", ctx({ actorLegajo: "1001", rolesActor: ["tesoreria"] }))),
    "Nadie controla lo propio: esta rendición es tuya",
  );
});

test("lineasQueNoSeRinden: las bloqueadas y las derivadas a Cuentas a Pagar; sin evaluaciones, ninguna", () => {
  const derivada: Evaluacion = { ...evaluacion(false, "C-3"), carril: "cuentas_a_pagar" };
  const noSeRinden = lineasQueNoSeRinden([evaluacion(false, "C-1"), evaluacion(true, "C-2"), derivada, pendiente("C-4")]);
  assert.deepEqual([...noSeRinden].sort(), ["C-2", "C-3"]);
  assert.equal(lineasQueNoSeRinden().size, 0);
});

test("combinaciones inválidas: 'No se puede {acción} una rendición {estado}'", () => {
  assert.equal(motivo(aplicarAccion(rendicion(), "aprobar", ctx())), "No se puede aprobar una rendición en borrador");
  assert.equal(
    motivo(aplicarAccion(rendicion({ estado: "en_aprobacion" }), "cerrar", ctx())),
    "No se puede cerrar una rendición en aprobación",
  );
  assert.equal(motivo(aplicarAccion(rendicion(), "tomar_control", ctx())), "No se puede pasar a control una rendición en borrador");
  assert.equal(motivo(aplicarAccion(rendicion({ estado: "cerrada" }), "enviar", ctx())), "No se puede enviar una rendición cerrada");
  assert.equal(
    motivo(aplicarAccion(rendicion({ estado: "rechazada" }), "devolver", ctx({ comentario: "x" }))),
    "No se puede devolver una rendición rechazada",
  );
});
