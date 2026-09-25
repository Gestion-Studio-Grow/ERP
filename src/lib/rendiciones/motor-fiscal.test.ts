// Tests del motor fiscal: cada regla de CONTRATO.md (tipo de gasto, leyenda, degradación,
// carril, validaciones e importes), más las decisiones propias documentadas en el módulo. node:test.

import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluarComprobante } from "./motor-fiscal";
import {
  CHOFER,
  CUIT_FUERA,
  CUIT_INVALIDA,
  CUIT_MAESTRO,
  CUIT_OTRA_EMPRESA,
  EMPRESA,
  TIPOS,
  codigos,
  comprobante,
  congelar,
  contexto,
} from "./rendiciones.fixture";
import type { Comprobante, ContextoEvaluacion, Evaluacion, Validacion, Viaje } from "./tipos";

const EFECTIVO = { tipo: "efectivo_anticipo", anticipoId: "A-1" } as const;

function evaluar(c: Comprobante, ctx: ContextoEvaluacion = contexto()): Evaluacion {
  return evaluarComprobante(c, ctx);
}

function validacion(e: Evaluacion, codigo: Validacion["codigo"]): Validacion {
  const v = e.validaciones.find((x) => x.codigo === codigo);
  assert.ok(v, `falta ${codigo}; vinieron: ${codigos(e).join(", ")}`);
  return v;
}

// ── Base ─────────────────────────────────────────────────────────────────────

test("comprobante limpio: computa, va como factura y no avisa nada", () => {
  const e = evaluar(comprobante());
  assert.deepEqual(codigos(e), []);
  assert.equal(e.comprobanteId, "C-1");
  assert.equal(e.tratamiento, "computable");
  assert.equal(e.carril, "factura");
  assert.equal(e.creditoFiscal, 210000);
  assert.equal(e.percepcionesComputables, 0);
  assert.equal(e.costo, 1000000);
  assert.equal(e.cuentaMayor, "CTA-insumos");
  assert.equal(e.indicadorIva, "V1");
  assert.equal(e.indicadorIvaNoComputable, "V0");
  assert.equal(e.bloqueado, false);
  assert.equal(e.reglaVersion, "reglas-prueba@1");
});

test("no muta el comprobante ni el contexto", () => {
  const c = congelar(comprobante({ datos: { cuitEmisor: CUIT_INVALIDA } }));
  const ctx = congelar(contexto({ otrosComprobantes: [comprobante({ id: "C-0" })] }));
  assert.doesNotThrow(() => evaluar(c, ctx));
});

// ── 1. Tipo de gasto ─────────────────────────────────────────────────────────

test("R1: tipo fuera del diccionario bloquea, no computa, no tiene carril y no corta ahí", () => {
  const e = evaluar(comprobante({ imputacion: { tipoGastoId: "sin_clasificar" }, datos: { fecha: "2026-08-30" } }));
  assert.deepEqual(codigos(e), ["R1_TIPO_SIN_CLASIFICAR", "V12_FUERA_DE_PERIODO"]);
  const v = validacion(e, "R1_TIPO_SIN_CLASIFICAR");
  assert.equal(v.severidad, "bloquea");
  assert.equal(v.mensaje, "La herramienta no adivina el tratamiento del IVA: elegí el tipo de gasto");
  assert.equal(e.tratamiento, "no_computable");
  assert.equal(e.carril, "ninguno");
  assert.equal(e.creditoFiscal, 0);
  assert.equal(e.costo, 1210000);
  assert.equal(e.cuentaMayor, undefined);
  assert.equal(e.bloqueado, true);
});

// ── 2. Leyenda o factura M ───────────────────────────────────────────────────

test("R3: la A con leyenda no se paga por rendición: bloquea y va a Cuentas a Pagar", () => {
  for (const leyendaA of ["operacion_sujeta_a_retencion", "pago_en_cbu_informada"] as const) {
    const e = evaluar(comprobante({ datos: { leyendaA } }));
    assert.deepEqual(codigos(e), ["R3_FACTURA_CON_LEYENDA"]);
    const v = validacion(e, "R3_FACTURA_CON_LEYENDA");
    assert.equal(v.severidad, "bloquea");
    assert.equal(v.mensaje, "Esta factura exige retener o pagar a un CBU: no se paga por rendición. Va a Cuentas a Pagar");
    assert.equal(v.fuente, "RG 1575 art. 21; RG 5762/2025 art. 5");
    assert.equal(e.carril, "cuentas_a_pagar");
    assert.equal(e.tratamiento, "no_computable");
    assert.equal(e.creditoFiscal, 0);
  }
});

test("R3: la factura M también va a Cuentas a Pagar", () => {
  const e = evaluar(comprobante({ datos: { clase: "factura_m" } }));
  assert.deepEqual(codigos(e), ["R3_FACTURA_CON_LEYENDA"]);
  assert.equal(e.carril, "cuentas_a_pagar");
});

// ── 3. Tratamiento: degrada, nunca mejora ────────────────────────────────────

test("R2: B a consumidor final con IVA contenido: no computa, informa y pide la CUIT", () => {
  const e = evaluar(
    comprobante({ datos: { clase: "factura_b", cuitReceptor: undefined, lineasIva: [], ivaContenido: 210000 } }),
  );
  assert.deepEqual(codigos(e), ["R2_IVA_CONTENIDO_A_CERO", "R2_PEDI_LA_CUIT"]);
  assert.equal(validacion(e, "R2_IVA_CONTENIDO_A_CERO").severidad, "informa");
  assert.equal(
    validacion(e, "R2_IVA_CONTENIDO_A_CERO").mensaje,
    "El IVA que muestra este ticket no se recupera (es IVA contenido de consumidor final)",
  );
  assert.match(validacion(e, "R2_IVA_CONTENIDO_A_CERO").fuente ?? "", /RG 5614\/2024/);
  assert.equal(validacion(e, "R2_PEDI_LA_CUIT").severidad, "advierte");
  assert.equal(e.tratamiento, "no_computable");
  assert.equal(e.carril, "asiento");
  assert.equal(e.creditoFiscal, 0);
  assert.equal(e.costo, 1210000);
  assert.equal(e.indicadorIva, "V0");
});

test("R2: factura A a otra CUIT (o sin identificar) advierte y no recupera IVA", () => {
  for (const cuitReceptor of [CUIT_OTRA_EMPRESA, undefined]) {
    const e = evaluar(comprobante({ datos: { cuitReceptor } }));
    assert.deepEqual(codigos(e), ["R2_RECEPTOR_NO_ES_LA_EMPRESA"]);
    const v = validacion(e, "R2_RECEPTOR_NO_ES_LA_EMPRESA");
    assert.equal(v.severidad, "advierte");
    assert.equal(v.mensaje, "La factura no está a nombre de la empresa: no recupera IVA");
    assert.equal(e.tratamiento, "no_computable");
    assert.equal(e.carril, "asiento");
    assert.equal(e.creditoFiscal, 0);
  }
});

test("R2: la CUIT de la empresa se compara sin guiones", () => {
  const e = evaluar(comprobante({ datos: { cuitReceptor: "30-71588430-1" } }));
  assert.deepEqual(codigos(e), []);
  assert.equal(e.tratamiento, "computable");
});

test("R2: tique a consumidor final sin CUIT: 'la próxima pedí la CUIT'", () => {
  const e = evaluar(
    comprobante({
      datos: { clase: "tique_consumidor_final", cuitReceptor: undefined, lineasIva: [], puntoVenta: undefined, numero: undefined },
      constatacion: "pendiente",
    }),
  );
  assert.deepEqual(codigos(e), ["R2_PEDI_LA_CUIT"]);
  assert.equal(
    validacion(e, "R2_PEDI_LA_CUIT").mensaje,
    "La próxima pedí que pongan la CUIT de la empresa en el ticket",
  );
  assert.equal(e.carril, "asiento");
});

test("R1: hotel con factura A no computa por ley (informa, con la fuente del tipo)", () => {
  const e = evaluar(comprobante({ imputacion: { tipoGastoId: "hotel" } }));
  assert.deepEqual(codigos(e), ["R1_NO_COMPUTA_POR_LEY"]);
  const v = validacion(e, "R1_NO_COMPUTA_POR_LEY");
  assert.equal(v.severidad, "informa");
  assert.equal(v.mensaje, "Esta factura no recupera IVA por ley. No es un error tuyo");
  assert.equal(v.fuente, TIPOS.hotel.fuente);
  assert.equal(e.tratamiento, "no_computable");
  assert.equal(e.carril, "asiento");
  assert.equal(e.costo, 1210000);
  assert.equal(e.indicadorIva, "V0");
});

test("un tipo no registrable sigue sin registrarse aunque traiga factura A", () => {
  const e = evaluar(comprobante({ imputacion: { tipoGastoId: "propinas" } }));
  assert.equal(e.tratamiento, "no_registrable");
  assert.equal(e.carril, "ninguno");
  assert.equal(e.creditoFiscal, 0);
});

test("R4: constatación rechazada y CUIT apócrifa bloquean y bajan el tratamiento", () => {
  const rechazada = evaluar(comprobante({ constatacion: "rechazada" }));
  assert.deepEqual(codigos(rechazada), ["R4_CONSTATACION_RECHAZADA"]);
  assert.equal(rechazada.tratamiento, "no_computable");
  assert.equal(rechazada.carril, "asiento");
  assert.equal(rechazada.bloqueado, true);

  const apocrifa = evaluar(comprobante({ cuitApocrifa: true }));
  assert.deepEqual(codigos(apocrifa), ["R4_CUIT_APOCRIFA"]);
  assert.equal(validacion(apocrifa, "R4_CUIT_APOCRIFA").mensaje, "ARCA tiene marcado este CUIT como emisor de facturas apócrifas");
  assert.equal(apocrifa.tratamiento, "no_computable");
  assert.equal(apocrifa.bloqueado, true);
});

test("R4: el controlador fiscal informa 'sin constatación posible'", () => {
  const cf = evaluar(comprobante({ datos: { clase: "tique_peaje" }, imputacion: { tipoGastoId: "insumos" }, constatacion: "sin_constatacion_posible" }));
  assert.deepEqual(codigos(cf), ["R4_SIN_CONSTATACION_POSIBLE"]);
  assert.equal(validacion(cf, "R4_SIN_CONSTATACION_POSIBLE").severidad, "informa");
  assert.equal(cf.tratamiento, "computable");
});

test("R4: un electrónico con CAE sin respuesta de ARCA avisa que no se contabiliza (no bloquea)", () => {
  for (const pendiente of [
    { constatacion: "pendiente" as const },
    { cuitApocrifa: "sin_consultar" as const },
    { constatacion: "pendiente" as const, cuitApocrifa: "sin_consultar" as const },
  ]) {
    const e = evaluar(comprobante(pendiente));
    assert.deepEqual(codigos(e), ["R4_CONSTATACION_PENDIENTE"], JSON.stringify(pendiente));
    const v = validacion(e, "R4_CONSTATACION_PENDIENTE");
    assert.equal(v.severidad, "advierte");
    assert.equal(v.mensaje, "Falta constatarlo en ARCA: no se contabiliza hasta tener la respuesta");
    assert.match(v.fuente ?? "", /WSCDC/);
    assert.equal(e.bloqueado, false);
    assert.equal(e.tratamiento, "computable"); // no degrada: todavía no se sabe
  }
  // También en B, C, M y tique factura A con CAE.
  for (const clase of ["factura_b", "factura_c", "factura_m", "tique_factura_a"] as const) {
    const e = evaluar(comprobante({ datos: { clase, lineasIva: [], exento: 1210000 }, constatacion: "pendiente" }));
    assert.ok(codigos(e).includes("R4_CONSTATACION_PENDIENTE"), clase);
  }
});

test("R4: sin CAE, controlador fiscal o sin comprobante no hay nada que constatar en ARCA", () => {
  const sinCae = evaluar(comprobante({ datos: { cae: undefined }, constatacion: "pendiente", cuitApocrifa: "sin_consultar" }));
  assert.ok(!codigos(sinCae).includes("R4_CONSTATACION_PENDIENTE"));
  const caeVacio = evaluar(comprobante({ datos: { cae: "  " }, constatacion: "pendiente" }));
  assert.ok(!codigos(caeVacio).includes("R4_CONSTATACION_PENDIENTE"));
  const peaje = evaluar(comprobante({ datos: { clase: "tique_peaje" }, constatacion: "pendiente" }));
  assert.ok(!codigos(peaje).includes("R4_CONSTATACION_PENDIENTE"));
  const tique = evaluar(
    comprobante({ datos: { clase: "tique_consumidor_final", lineasIva: [] }, constatacion: "pendiente", cuitApocrifa: "sin_consultar" }),
  );
  assert.ok(!codigos(tique).includes("R4_CONSTATACION_PENDIENTE"));
  const propina = evaluar(
    comprobante({
      datos: { clase: "sin_comprobante", cuitEmisor: undefined, lineasIva: [], total: 100000 },
      imputacion: { tipoGastoId: "propinas" },
      constatacion: "pendiente",
      cuitApocrifa: "sin_consultar",
    }),
  );
  assert.ok(!codigos(propina).includes("R4_CONSTATACION_PENDIENTE"));
  assert.deepEqual(codigos(evaluar(comprobante({ constatacion: "aprobada", cuitApocrifa: false }))), []);
});

// ── 5. Validaciones ──────────────────────────────────────────────────────────

test("V2: CUIT con el dígito verificador mal, o que falta en una factura, bloquea", () => {
  const mal = evaluar(comprobante({ datos: { cuitEmisor: CUIT_INVALIDA } }));
  assert.ok(codigos(mal).includes("V2_CUIT_INVALIDA"));
  assert.equal(mal.bloqueado, true);

  const falta = evaluar(comprobante({ datos: { cuitEmisor: undefined } }));
  assert.deepEqual(codigos(falta), ["V2_CUIT_INVALIDA"]);
  assert.match(validacion(falta, "V2_CUIT_INVALIDA").mensaje, /Falta el CUIT/);

  const tique = evaluar(
    comprobante({
      datos: { clase: "tique_consumidor_final", cuitEmisor: undefined, lineasIva: [], puntoVenta: undefined, numero: undefined },
      constatacion: "pendiente",
    }),
  );
  assert.ok(!codigos(tique).includes("V2_CUIT_INVALIDA"));
});

test("V9: factura o tique de peaje sin punto de venta o número bloquea; el tique a consumidor final no", () => {
  assert.ok(codigos(evaluar(comprobante({ datos: { numero: undefined } }))).includes("V9_NUMERO_OFICIAL"));
  assert.ok(codigos(evaluar(comprobante({ datos: { puntoVenta: undefined } }))).includes("V9_NUMERO_OFICIAL"));
  assert.ok(
    codigos(evaluar(comprobante({ datos: { clase: "tique_peaje", numero: undefined } }))).includes("V9_NUMERO_OFICIAL"),
  );
  const tique = evaluar(
    comprobante({ datos: { clase: "tique_consumidor_final", lineasIva: [], numero: undefined }, constatacion: "pendiente" }),
  );
  assert.ok(!codigos(tique).includes("V9_NUMERO_OFICIAL"));
});

test("V4: B o C con IVA discriminado bloquea; el IVA contenido no", () => {
  const b = evaluar(comprobante({ datos: { clase: "factura_b" } }));
  assert.ok(codigos(b).includes("V4_B_O_C_CON_IVA_DISCRIMINADO"));
  const c = evaluar(comprobante({ datos: { clase: "factura_c" } }));
  assert.ok(codigos(c).includes("V4_B_O_C_CON_IVA_DISCRIMINADO"));
  const contenido = evaluar(comprobante({ datos: { clase: "factura_b", lineasIva: [], ivaContenido: 210000 } }));
  assert.ok(!codigos(contenido).includes("V4_B_O_C_CON_IVA_DISCRIMINADO"));
});

test("V8: los importes tienen que sumar el total (tolerancia de 2 centavos)", () => {
  const mal = evaluar(comprobante({ datos: { total: 1260000 } }));
  assert.deepEqual(codigos(mal), ["V8_ARITMETICA"]);
  assert.equal(
    validacion(mal, "V8_ARITMETICA").mensaje,
    "Los importes no suman el total ($10.000 + $2.100 ≠ $12.600). ¿Hay una percepción sin separar?",
  );
  assert.deepEqual(codigos(evaluar(comprobante({ datos: { total: 1210002 } }))), []);
  assert.deepEqual(codigos(evaluar(comprobante({ datos: { total: 1210003 } }))), ["V8_ARITMETICA"]);

  // Con todos los componentes: 10.000 + 2.100 + 500 (percepción) + 300 + 200 + 1.000 = 14.100.
  const completo = comprobante({
    datos: {
      percepciones: [{ regimen: "iva", importe: 50000 }],
      noGravado: 30000,
      exento: 20000,
      impuestosInternos: 100000,
      total: 1410000,
    },
  });
  assert.deepEqual(codigos(evaluar(completo)), []);
});

test("V8: una A sin líneas de IVA no suma el total; una B sin líneas no se controla", () => {
  assert.deepEqual(codigos(evaluar(comprobante({ datos: { lineasIva: [] } }))), ["V8_ARITMETICA"]);
  assert.deepEqual(codigos(evaluar(comprobante({ datos: { lineasIva: [], exento: 1210000 } }))), []);
  const b = evaluar(comprobante({ datos: { clase: "factura_b", lineasIva: [] }, imputacion: { tipoGastoId: "estacionamiento" } }));
  assert.ok(!codigos(b).includes("V8_ARITMETICA"));
});

test("R7: percepción de IIBB sin provincia bloquea; la de IVA no la necesita", () => {
  const sin = evaluar(comprobante({ datos: { percepciones: [{ regimen: "iibb", importe: 10000 }], total: 1220000 } }));
  assert.deepEqual(codigos(sin), ["R7_PERCEPCION_SIN_JURISDICCION"]);
  const con = evaluar(
    comprobante({ datos: { percepciones: [{ regimen: "iibb", jurisdiccion: "BA", importe: 10000 }], total: 1220000 } }),
  );
  assert.deepEqual(codigos(con), []);
  const iva = evaluar(comprobante({ datos: { percepciones: [{ regimen: "iva", importe: 10000 }], total: 1220000 } }));
  assert.deepEqual(codigos(iva), []);
});

test("V6: el primero que se cargó es el bueno; el repetido bloquea y dice quién lo cargó", () => {
  const original = comprobante({ id: "C-1", legajo: "1001" });
  const repetido = comprobante({ id: "C-2", legajo: "1001" });
  const todos = [original, repetido];
  assert.deepEqual(codigos(evaluar(original, contexto({ otrosComprobantes: todos }))), []);
  const e = evaluar(repetido, contexto({ otrosComprobantes: todos }));
  assert.deepEqual(codigos(e), ["V6_DUPLICADO"]);
  assert.equal(validacion(e, "V6_DUPLICADO").mensaje, "Este comprobante ya se rindió (lo cargó el legajo 1001)");
  assert.equal(e.bloqueado, true);
});

test("V6: un comprobante nuevo (fuera de la lista) se compara contra todos", () => {
  const cargado = comprobante({ id: "C-1", legajo: "1107" });
  const nuevo = comprobante({ id: "C-9", datos: { cuitEmisor: "30-70912345-5" } }); // mismo CUIT con guiones
  const e = evaluar(nuevo, contexto({ otrosComprobantes: [cargado] }));
  assert.equal(validacion(e, "V6_DUPLICADO").mensaje, "Este comprobante ya se rindió (lo cargó el legajo 1107)");
});

test("V6: otra clase, otro número u otro CUIT no es duplicado", () => {
  const cargado = comprobante({ id: "C-1" });
  for (const datos of [{ numero: 102 }, { puntoVenta: 2 }, { cuitEmisor: CUIT_FUERA }]) {
    const e = evaluar(comprobante({ id: "C-2", datos }), contexto({ otrosComprobantes: [cargado] }));
    assert.ok(!codigos(e).includes("V6_DUPLICADO"), JSON.stringify(datos));
  }
  const otraClase = evaluar(
    comprobante({ id: "C-2", datos: { clase: "tique_factura_a" } }),
    contexto({ otrosComprobantes: [cargado] }),
  );
  assert.ok(!codigos(otraClase).includes("V6_DUPLICADO"));
});

test("V6: la misma foto subida dos veces bloquea (el primero no)", () => {
  const a = comprobante({ id: "C-1", hashImagen: "abc" });
  const b = comprobante({ id: "C-2", hashImagen: "abc", datos: { numero: 999 } });
  assert.deepEqual(codigos(evaluar(a, contexto({ otrosComprobantes: [a, b] }))), []);
  assert.deepEqual(codigos(evaluar(b, contexto({ otrosComprobantes: [a, b] }))), ["V6_MISMA_FOTO"]);
});

test("R9: falta la provincia del gasto, o el origen y destino de un traslado", () => {
  const sinProvincia = evaluar(comprobante({ imputacion: { jurisdiccionComprobante: undefined } }));
  assert.deepEqual(codigos(sinProvincia), ["R9_FALTA_JURISDICCION"]);
  assert.equal(validacion(sinProvincia, "R9_FALTA_JURISDICCION").campo, "jurisdiccionComprobante");

  const peaje = evaluar(comprobante({ imputacion: { tipoGastoId: "peajes", origen: "BA" } }));
  assert.deepEqual(codigos(peaje), ["R9_FALTA_JURISDICCION"]);
  assert.equal(validacion(peaje, "R9_FALTA_JURISDICCION").campo, "destino");
  assert.deepEqual(codigos(evaluar(comprobante({ imputacion: { tipoGastoId: "peajes", origen: "BA", destino: "CABA" } }))), []);
});

test("R9: sin comprobante no pide provincia; si la provincia no está inscripta, avisa con su nombre", () => {
  const propina = evaluar(
    comprobante({
      datos: { clase: "sin_comprobante", cuitEmisor: undefined, lineasIva: [], total: 100000 },
      imputacion: { tipoGastoId: "propinas", jurisdiccionActividad: undefined, jurisdiccionComprobante: undefined },
      constatacion: "sin_constatacion_posible",
    }),
  );
  assert.deepEqual(codigos(propina), ["R11_SIN_COMPROBANTE"]);

  const nq = evaluar(comprobante({ imputacion: { jurisdiccionActividad: "NQ", jurisdiccionComprobante: "NQ" } }));
  assert.deepEqual(codigos(nq), ["R9_PROVINCIA_NO_INSCRIPTA"]);
  const v = validacion(nq, "R9_PROVINCIA_NO_INSCRIPTA");
  assert.equal(v.severidad, "advierte");
  assert.equal(v.mensaje, "Gasto en Neuquén: ahí la empresa no está inscripta en Ingresos Brutos. Avisale a Administración");
});

test("R10: combustible sin patente o sin tipo de vehículo bloquea; el automóvil informa el tope", () => {
  const sinPatente = evaluar(comprobante({ imputacion: { tipoGastoId: "combustible", tipoVehiculo: "camion" } }));
  assert.deepEqual(codigos(sinPatente), ["R10_FALTA_VEHICULO"]);
  assert.equal(
    validacion(sinPatente, "R10_FALTA_VEHICULO").mensaje,
    "Combustible sin patente: cargala, después no se puede reconstruir",
  );

  const sinTipo = evaluar(comprobante({ imputacion: { tipoGastoId: "combustible", dominio: "AB123CD" } }));
  assert.deepEqual(codigos(sinTipo), ["R10_FALTA_VEHICULO"]);
  assert.equal(validacion(sinTipo, "R10_FALTA_VEHICULO").campo, "tipoVehiculo");

  const auto = evaluar(comprobante({ imputacion: { tipoGastoId: "combustible", dominio: "AE456FG", tipoVehiculo: "automovil" } }));
  assert.deepEqual(codigos(auto), ["R10_TOPE_AUTOMOVIL"]);
  assert.equal(validacion(auto, "R10_TOPE_AUTOMOVIL").mensaje, "Automóvil: aplica el tope de Ganancias por unidad");
  assert.equal(auto.tratamiento, "computable");

  const camion = evaluar(comprobante({ imputacion: { tipoGastoId: "combustible", dominio: "AB123CD", tipoVehiculo: "camion" } }));
  assert.deepEqual(codigos(camion), []);
  // El automóvil sólo cuenta en tipos que exigen vehículo.
  assert.deepEqual(codigos(evaluar(comprobante({ imputacion: { tipoVehiculo: "automovil" } }))), []);
});

test("V13: representación sin asistentes bloquea", () => {
  const base = { tipoGastoId: "representacion" };
  assert.deepEqual(codigos(evaluar(comprobante({ imputacion: base }))), ["R1_NO_COMPUTA_POR_LEY", "V13_FALTA_ASISTENTES"]);
  assert.deepEqual(codigos(evaluar(comprobante({ imputacion: { ...base, asistentes: "   " } }))), [
    "R1_NO_COMPUTA_POR_LEY",
    "V13_FALTA_ASISTENTES",
  ]);
  assert.deepEqual(codigos(evaluar(comprobante({ imputacion: { ...base, asistentes: "Cliente X: Juan y Ana" } }))), [
    "R1_NO_COMPUTA_POR_LEY",
  ]);
});

test("R11: la comida de un viaje que el convenio ya paga no se reintegra dos veces", () => {
  const viaje: Viaje = {
    id: "V-1",
    legajo: CHOFER.legajo,
    desde: "2026-09-08",
    hasta: "2026-09-11",
    origen: "BA",
    destino: "NQ",
    km: 1150,
    pernoctes: 3,
    cubiertoPorConvenio: true,
  };
  const comida = (fecha: string) =>
    comprobante({ legajo: CHOFER.legajo, datos: { fecha }, imputacion: { tipoGastoId: "comida" } });
  const ctx = contexto({ persona: CHOFER, viajes: [viaje] });

  for (const fecha of ["2026-09-08", "2026-09-09", "2026-09-11"]) {
    const e = evaluar(comida(fecha), ctx);
    assert.ok(codigos(e).includes("R11_CUBIERTO_POR_CONVENIO"), fecha);
    const v = validacion(e, "R11_CUBIERTO_POR_CONVENIO");
    assert.equal(v.severidad, "bloquea");
    assert.equal(v.fuente, "CCT 40/89 ítem 4.2.11");
  }
  assert.ok(!codigos(evaluar(comida("2026-09-12"), ctx)).includes("R11_CUBIERTO_POR_CONVENIO"));
  assert.ok(
    !codigos(evaluar(comida("2026-09-09"), contexto({ persona: CHOFER, viajes: [{ ...viaje, cubiertoPorConvenio: false }] }))).includes(
      "R11_CUBIERTO_POR_CONVENIO",
    ),
  );
  assert.ok(
    !codigos(evaluar(comida("2026-09-09"), contexto({ persona: { ...CHOFER, convenioCamioneros: false }, viajes: [viaje] }))).includes(
      "R11_CUBIERTO_POR_CONVENIO",
    ),
  );
  assert.ok(
    !codigos(evaluar(comida("2026-09-09"), contexto({ persona: CHOFER, viajes: [{ ...viaje, legajo: "9999" }] }))).includes(
      "R11_CUBIERTO_POR_CONVENIO",
    ),
  );
});

test("Sin comprobante: hasta el tope informa; arriba del tope bloquea; si el tipo no lo admite, bloquea", () => {
  const sinComprobante = (total: number, tipoGastoId = "propinas") =>
    evaluar(
      comprobante({
        datos: { clase: "sin_comprobante", cuitEmisor: undefined, puntoVenta: undefined, numero: undefined, lineasIva: [], total },
        imputacion: { tipoGastoId },
        constatacion: "sin_constatacion_posible",
      }),
    );

  const enTope = sinComprobante(500000);
  assert.deepEqual(codigos(enTope), ["R11_SIN_COMPROBANTE"]);
  assert.equal(validacion(enTope, "R11_SIN_COMPROBANTE").severidad, "informa");
  assert.equal(validacion(enTope, "R11_SIN_COMPROBANTE").mensaje, "Va sin comprobante: se informa a Haberes como reintegro");

  const sobreTope = sinComprobante(500001);
  assert.deepEqual(codigos(sobreTope), ["R11_SIN_COMPROBANTE_SOBRE_TOPE"]);
  assert.match(validacion(sobreTope, "R11_SIN_COMPROBANTE_SOBRE_TOPE").mensaje, /hasta \$5\.000:/);
  assert.equal(sobreTope.bloqueado, true);

  const noAdmite = sinComprobante(100000, "insumos");
  assert.deepEqual(codigos(noAdmite), ["R11_SIN_COMPROBANTE"]);
  assert.equal(validacion(noAdmite, "R11_SIN_COMPROBANTE").severidad, "bloquea");
  assert.equal(validacion(noAdmite, "R11_SIN_COMPROBANTE").mensaje, "Este gasto necesita comprobante");
});

test("R5: efectivo del anticipo por encima de $1.000 informa; en el tope o con tarjeta, no", () => {
  const efectivo = evaluar(comprobante({ imputacion: { medioPago: EFECTIVO } }));
  assert.deepEqual(codigos(efectivo), ["R5_EFECTIVO_SOBRE_TOPE"]);
  const v = validacion(efectivo, "R5_EFECTIVO_SOBRE_TOPE");
  assert.equal(v.severidad, "informa");
  assert.equal(v.mensaje, "Pago en efectivo: guardamos foto, aprobación y anticipo como prueba de la operación");
  assert.match(v.fuente ?? "", /Ley 25\.345/);

  const enTope = comprobante({
    datos: { lineasIva: [{ alicuota: 21, neto: 82645, iva: 17355 }], total: 100000 },
    imputacion: { medioPago: EFECTIVO },
  });
  assert.deepEqual(codigos(evaluar(enTope)), []);
  assert.deepEqual(codigos(evaluar(comprobante({ imputacion: { medioPago: { tipo: "propio_a_reintegrar" } } }))), []);
});

test("V3: computable de un proveedor fuera del maestro advierte; si va al asiento, no", () => {
  const fuera = evaluar(comprobante({ datos: { cuitEmisor: CUIT_FUERA } }));
  assert.deepEqual(codigos(fuera), ["V3_PROVEEDOR_FUERA_DEL_MAESTRO"]);
  assert.equal(validacion(fuera, "V3_PROVEEDOR_FUERA_DEL_MAESTRO").mensaje, "Este proveedor no está dado de alta en SAP: Tesorería va a pedir el alta");
  assert.equal(fuera.carril, "factura");
  assert.deepEqual(codigos(evaluar(comprobante({ datos: { cuitEmisor: CUIT_FUERA }, imputacion: { tipoGastoId: "hotel" } }))), [
    "R1_NO_COMPUTA_POR_LEY",
  ]);
});

test("R8: proveedor habitual por encima del tope → Cuentas a Pagar; en el tope, no", () => {
  const grande = comprobante({ datos: { lineasIva: [{ alicuota: 21, neto: 40000000, iva: 8400000 }], total: 48400000 } });
  const e = evaluar(grande);
  assert.deepEqual(codigos(e), ["R8_DERIVAR_A_CXP"]);
  assert.equal(validacion(e, "R8_DERIVAR_A_CXP").severidad, "advierte");
  assert.equal(e.carril, "cuentas_a_pagar");
  assert.equal(e.tratamiento, "computable");
  assert.equal(e.bloqueado, false);

  const enTope = comprobante({ datos: { lineasIva: [{ alicuota: 21, neto: 33057851, iva: 6942149 }], total: 40000000 } });
  assert.equal(evaluar(enTope).carril, "factura");

  const fuera = evaluar(comprobante({ datos: { ...grande.datos, cuitEmisor: CUIT_FUERA } }));
  assert.deepEqual(codigos(fuera), ["V3_PROVEEDOR_FUERA_DEL_MAESTRO"]);
  assert.equal(fuera.carril, "factura");
});

test("V12: comprobante fuera del período advierte con la fecha y el mes", () => {
  const e = evaluar(comprobante({ datos: { fecha: "2026-08-28" } }));
  assert.deepEqual(codigos(e), ["V12_FUERA_DE_PERIODO"]);
  assert.equal(
    validacion(e, "V12_FUERA_DE_PERIODO").mensaje,
    "El comprobante es del 28/08/2026 y la rendición es de septiembre de 2026: ¿va en otra rendición?",
  );
  assert.deepEqual(codigos(evaluar(comprobante({ datos: { fecha: "2026-09-31" } }))), ["V12_FUERA_DE_PERIODO"]);
});

test("V14: en dólares sin cotización bloquea; con cotización, los importes salen en pesos", () => {
  const sin = evaluar(comprobante({ datos: { moneda: "USD" } }));
  assert.deepEqual(codigos(sin), ["V14_MONEDA_SIN_COTIZACION"]);

  // US$ 100 + IVA US$ 21 = US$ 121, a $ 1.000,50: los importes de la evaluación salen en pesos.
  const con = evaluar(
    comprobante({
      datos: { moneda: "USD", cotizacion: 1000.5, lineasIva: [{ alicuota: 21, neto: 10000, iva: 2100 }], total: 12100 },
    }),
  );
  assert.deepEqual(codigos(con), []);
  assert.equal(con.creditoFiscal, 2101050); // 2.100 × 1000,5
  assert.equal(con.costo, 10005000); // 12.106.050 − 2.101.050
  assert.equal(con.creditoFiscal + con.costo, Math.round(12100 * 1000.5));

  // Los topes también se comparan en pesos: US$ 12.100 a $ 1.000,50 supera el tope de Cuentas a Pagar.
  const grande = evaluar(comprobante({ datos: { moneda: "USD", cotizacion: 1000.5 } }));
  assert.deepEqual(codigos(grande), ["R8_DERIVAR_A_CXP"]);
});

// ── 6. Importes ──────────────────────────────────────────────────────────────

test("Importes: las percepciones de IVA e IIBB computan; la municipal va al costo", () => {
  const e = evaluar(
    comprobante({
      datos: {
        percepciones: [
          { regimen: "iva", importe: 30000 },
          { regimen: "iibb", jurisdiccion: "BA", importe: 20000 },
          { regimen: "municipal", importe: 5000 },
        ],
        impuestosInternos: 40000,
        total: 1305000,
      },
    }),
  );
  assert.deepEqual(codigos(e), []);
  assert.equal(e.creditoFiscal, 210000);
  assert.equal(e.percepcionesComputables, 50000);
  assert.equal(e.costo, 1305000 - 210000 - 50000);
});

test("Importes: si el IVA no computa (hotel), va al costo; la percepción a nombre de la empresa se computa igual", () => {
  const e = evaluar(
    comprobante({
      datos: { percepciones: [{ regimen: "iva", importe: 30000 }], total: 1240000 },
      imputacion: { tipoGastoId: "hotel" },
    }),
  );
  assert.equal(e.creditoFiscal, 0);
  assert.equal(e.percepcionesComputables, 30000); // pago a cuenta, no crédito de la operación
  assert.equal(e.costo, 1240000 - 30000);
});

test("Importes: si el comprobante no está a nombre de la empresa, las percepciones van al costo", () => {
  const e = evaluar(
    comprobante({
      datos: {
        clase: "factura_b",
        cuitReceptor: undefined,
        lineasIva: [],
        percepciones: [{ regimen: "iibb", jurisdiccion: "BA", importe: 20000 }],
        total: 1020000,
      },
      imputacion: { tipoGastoId: "hotel" },
    }),
  );
  assert.equal(e.percepcionesComputables, 0);
  assert.equal(e.costo, 1020000);
});

test("junta todas las validaciones: no corta en la primera", () => {
  const e = evaluar(
    comprobante({
      datos: { cuitEmisor: CUIT_INVALIDA, numero: undefined, total: 999, fecha: "2026-10-02", moneda: "USD" },
      imputacion: { jurisdiccionActividad: "NQ", jurisdiccionComprobante: undefined, medioPago: EFECTIVO },
      constatacion: "rechazada",
      cuitApocrifa: true,
    }),
  );
  assert.deepEqual(codigos(e), [
    "R4_CONSTATACION_RECHAZADA",
    "R4_CUIT_APOCRIFA",
    "R9_FALTA_JURISDICCION",
    "R9_PROVINCIA_NO_INSCRIPTA",
    "V12_FUERA_DE_PERIODO",
    "V14_MONEDA_SIN_COTIZACION",
    "V2_CUIT_INVALIDA",
    "V8_ARITMETICA",
    "V9_NUMERO_OFICIAL",
  ]);
  assert.equal(e.bloqueado, true);
  assert.equal(e.tratamiento, "no_computable");
});

test("la empresa y el maestro se comparan por CUIT normalizado", () => {
  const ctx = contexto({ empresa: { ...EMPRESA, cuit: "30-71588430-1" }, maestroProveedores: new Set([CUIT_MAESTRO]) });
  const e = evaluar(comprobante({ datos: { cuitEmisor: "30-70912345-5" } }), ctx);
  assert.deepEqual(codigos(e), []);
  assert.equal(e.carril, "factura");
});
