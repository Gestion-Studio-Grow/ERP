// Tests del escenario de la demo contra el motor real: cada comprobante da exactamente los códigos
// documentados en escenario.ts, las cuadraturas son las del contrato, R-1107 la aprueba 2002 o 2001
// como suplente, el lote de R-1150 sale balanceado y el plugin SAP lo acepta tal cual (compatibilidad
// estructural Core ↔ plugin, ADR-002: acá es donde se juntan los dos). node:test.

import { test } from "node:test";
import assert from "node:assert/strict";
import { cuitValido } from "@/lib/cuit";
import {
  aplicarAccion,
  armarLoteContable,
  calcularCuadratura,
  claseDesdeTipoArca,
  comprobantesDeRendicion,
  conciliarConPrecarga,
  evaluarComprobante,
  leerQrArca,
  nivelesDeAprobacion,
  puedeAprobar,
  resumenParaHaberes,
  totalRendicion,
  type Carril,
  type Comprobante,
  type ContextoTransicion,
  type Evaluacion,
  type LoteContable,
  type Rendicion,
} from "@/lib/rendiciones";
import { generarArchivosSap, type LoteContableSap } from "@/plugins/sap";
import { escenarioDemo as E } from "./escenario";

const TOLERANCIA = E.politica.toleranciaCentavos;
const MAESTRO: ReadonlySet<string> = new Set(Object.keys(E.parametrosSap.maestroProveedores));

function rendicion(id: string): Rendicion {
  const r = E.rendiciones.find((x) => x.id === id);
  assert.ok(r, id);
  return r;
}

function persona(legajo: string) {
  const p = E.personas.find((x) => x.legajo === legajo);
  assert.ok(p, legajo);
  return p;
}

function evaluar(c: Comprobante, todos: Comprobante[] = E.comprobantes): Evaluacion {
  return evaluarComprobante(c, {
    empresa: E.empresa,
    politica: E.politica,
    diccionario: E.diccionario,
    persona: persona(c.legajo),
    viajes: E.viajes,
    otrosComprobantes: todos,
    maestroProveedores: MAESTRO,
    periodo: E.rendiciones.find((r) => r.id === c.rendicionId)?.periodo ?? E.periodo,
    reglaVersion: E.reglaVersion,
  });
}

const EVALUACIONES = E.comprobantes.map((c) => evaluar(c));
const evaluacionDe = (id: string) => {
  const e = EVALUACIONES.find((x) => x.comprobanteId === id);
  assert.ok(e, id);
  return e;
};

function cuadratura(r: Rendicion, comprobantes = E.comprobantes, evaluaciones = EVALUACIONES) {
  return calcularCuadratura(r, E.anticipos, comprobantesDeRendicion(r, comprobantes), TOLERANCIA, evaluaciones);
}

// ─────────────────────────────────────────────────────────────────────────────
// Motor: los códigos de cada comprobante
// ─────────────────────────────────────────────────────────────────────────────

const ESPERADO: Record<string, { codigos: string[]; carril: Carril; bloqueado: boolean }> = {
  "C-1042-01": { codigos: ["R5_EFECTIVO_SOBRE_TOPE", "R9_PROVINCIA_NO_INSCRIPTA"], carril: "factura", bloqueado: false },
  "C-1042-02": { codigos: ["R4_SIN_CONSTATACION_POSIBLE", "R5_EFECTIVO_SOBRE_TOPE"], carril: "factura", bloqueado: false },
  "C-1042-03": {
    codigos: ["R11_CUBIERTO_POR_CONVENIO", "R2_IVA_CONTENIDO_A_CERO", "R2_PEDI_LA_CUIT"],
    carril: "asiento",
    bloqueado: true,
  },
  "C-1042-04": { codigos: ["R5_EFECTIVO_SOBRE_TOPE"], carril: "factura", bloqueado: false },
  "C-1042-05": { codigos: ["R3_FACTURA_CON_LEYENDA"], carril: "cuentas_a_pagar", bloqueado: true },
  "C-1042-06": { codigos: ["R11_SIN_COMPROBANTE", "R5_EFECTIVO_SOBRE_TOPE"], carril: "ninguno", bloqueado: false },
  "C-1042-07": { codigos: ["V6_DUPLICADO"], carril: "factura", bloqueado: true },
  "C-1042-08": { codigos: ["R5_EFECTIVO_SOBRE_TOPE", "V3_PROVEEDOR_FUERA_DEL_MAESTRO"], carril: "factura", bloqueado: false },
  "C-1042-09": {
    codigos: ["R2_PEDI_LA_CUIT", "R4_SIN_CONSTATACION_POSIBLE", "R5_EFECTIVO_SOBRE_TOPE"],
    carril: "asiento",
    bloqueado: false,
  },
  "C-1107-01": { codigos: ["R1_NO_COMPUTA_POR_LEY"], carril: "asiento", bloqueado: false },
  "C-1107-02": { codigos: ["R1_NO_COMPUTA_POR_LEY"], carril: "asiento", bloqueado: false },
  "C-1107-03": { codigos: ["R10_TOPE_AUTOMOVIL"], carril: "factura", bloqueado: false },
  "C-1107-04": {
    codigos: ["R2_IVA_CONTENIDO_A_CERO", "R2_PEDI_LA_CUIT", "R4_SIN_CONSTATACION_POSIBLE"],
    carril: "asiento",
    bloqueado: false,
  },
  "C-1150-01": { codigos: ["R5_EFECTIVO_SOBRE_TOPE"], carril: "factura", bloqueado: false },
  "C-1150-02": { codigos: ["R5_EFECTIVO_SOBRE_TOPE"], carril: "asiento", bloqueado: false },
  "C-1150-03": { codigos: ["R4_CUIT_APOCRIFA", "R5_EFECTIVO_SOBRE_TOPE"], carril: "asiento", bloqueado: true },
};

test("cada comprobante da exactamente los códigos, el carril y el bloqueo documentados", () => {
  assert.deepEqual(E.comprobantes.map((c) => c.id).sort(), Object.keys(ESPERADO).sort());
  for (const e of EVALUACIONES) {
    const esperado = ESPERADO[e.comprobanteId];
    assert.deepEqual(
      {
        codigos: [...new Set(e.validaciones.map((v) => v.codigo))].sort(),
        carril: e.carril,
        bloqueado: e.bloqueado,
      },
      esperado,
      e.comprobanteId,
    );
    assert.equal(e.reglaVersion, "diccionario-demo@2026-09-24");
  }
});

test("los titulares del contrato: R9 en Neuquén, R11 por convenio, R3 a Cuentas a Pagar, V6, V3, R1, R10, R4", () => {
  const mensaje = (id: string, codigo: string) =>
    evaluacionDe(id).validaciones.find((v) => v.codigo === codigo)?.mensaje;
  assert.equal(
    mensaje("C-1042-01", "R9_PROVINCIA_NO_INSCRIPTA"),
    "Gasto en Neuquén: ahí la empresa no está inscripta en Ingresos Brutos. Avisale a Administración",
  );
  assert.equal(evaluacionDe("C-1042-01").tratamiento, "computable");
  assert.equal(evaluacionDe("C-1042-01").creditoFiscal, 3360000);
  assert.equal(evaluacionDe("C-1042-01").costo, 17840000); // neto + impuestos internos (son costo)
  assert.match(mensaje("C-1042-03", "R11_CUBIERTO_POR_CONVENIO") ?? "", /ya lo paga el convenio/);
  assert.equal(mensaje("C-1042-07", "V6_DUPLICADO"), "Este comprobante ya se rindió (lo cargó el legajo 1042)");
  assert.equal(evaluacionDe("C-1042-04").bloqueado, false); // el original es el bueno
  assert.equal(evaluacionDe("C-1042-06").tratamiento, "no_registrable");
  assert.equal(evaluacionDe("C-1107-03").tratamiento, "computable");
  assert.equal(evaluacionDe("C-1150-01").percepcionesComputables, 120000);
});

test("el diccionario: diez tipos provisorios con su fuente; 'sin_clasificar' queda afuera para mostrar R1", () => {
  assert.equal(E.diccionario.length, 10);
  assert.equal(new Set(E.diccionario.map((t) => t.id)).size, 10);
  for (const t of E.diccionario) {
    assert.equal(t.estado, "provisorio", t.id);
    assert.ok(t.fuente.length > 10, t.id);
  }
  assert.ok(!E.diccionario.some((t) => t.id === "sin_clasificar"));
  const [primero] = E.comprobantes;
  const r1 = evaluar({ ...primero, imputacion: { ...primero.imputacion, tipoGastoId: "sin_clasificar" } });
  assert.ok(r1.validaciones.some((v) => v.codigo === "R1_TIPO_SIN_CLASIFICAR"));
  assert.equal(r1.bloqueado, true);
});

test("todos los CUIT del escenario tienen dígito verificador válido", () => {
  const cuits = [
    E.empresa.cuit,
    ...E.comprobantes.flatMap((c) => (c.datos.cuitEmisor ? [c.datos.cuitEmisor] : [])),
    ...E.precargaIvaSimple.map((l) => l.cuitEmisor),
    ...Object.keys(E.parametrosSap.maestroProveedores),
  ];
  for (const cuit of cuits) assert.equal(cuitValido(cuit), true, cuit);
});

// ─────────────────────────────────────────────────────────────────────────────
// Cuadraturas y aprobación
// ─────────────────────────────────────────────────────────────────────────────

test("R-1042 no cuadra por exactamente $12.700", () => {
  const q = cuadratura(rendicion("R-1042-2609"));
  assert.equal(q.anticipado, 50000000);
  assert.equal(q.rendido, 44730000);
  assert.equal(q.devuelto, 4000000);
  assert.equal(q.diferencia, 1270000);
  assert.equal(q.cuadra, false);
  assert.equal(q.mensaje, "Recibiste $500.000, rendiste $447.300 y declaraste devolver $40.000. Faltan justificar $12.700.");
  assert.equal(q.aReintegrar, 0); // comida, taller y repetido están bloqueados: no se reintegran por la rendición
});

test("R-1042: resolver los tres bloqueos no mueve el faltante, y $12.700 en efectivo lo cierran", () => {
  const r = rendicion("R-1042-2609");
  const sinBloqueos: Rendicion = {
    ...r,
    comprobanteIds: r.comprobanteIds.filter((id) => !["C-1042-03", "C-1042-05", "C-1042-07"].includes(id)),
  };
  assert.equal(cuadratura(sinBloqueos).diferencia, 1270000);

  const [base] = E.comprobantes;
  const faltante: Comprobante = {
    ...base,
    id: "C-1042-faltante",
    datos: { ...base.datos, numero: 99999, total: 1270000, lineasIva: [{ alicuota: 21, neto: 1049587, iva: 220413 }], impuestosInternos: 0 },
  };
  const conFaltante: Rendicion = { ...sinBloqueos, comprobanteIds: [...sinBloqueos.comprobanteIds, faltante.id] };
  const q = cuadratura(conFaltante, [...E.comprobantes, faltante]);
  assert.equal(q.diferencia, 0);
  assert.equal(q.cuadra, true);
});

test("R-1042 no se puede enviar todavía: el motivo dice qué falta", () => {
  const r = rendicion("R-1042-2609");
  const cs = comprobantesDeRendicion(r, E.comprobantes);
  const res = aplicarAccion(r, "enviar", {
    fecha: E.hoy,
    actorLegajo: "1042",
    cuadratura: cuadratura(r),
    evaluaciones: cs.map((c) => evaluacionDe(c.id)),
    niveles: [],
  });
  assert.equal(res.ok, false);
  assert.equal(
    res.ok ? "" : res.motivo,
    "Todavía no se puede enviar. Recibiste $500.000, rendiste $447.300 y declaraste devolver $40.000. Faltan justificar $12.700. Hay 3 comprobantes bloqueados: resolvelos antes de enviar.",
  );
});

test("R-1107 cuadra exacto y R-1150 cuadra con la devolución declarada", () => {
  const r1107 = cuadratura(rendicion("R-1107-2609"));
  assert.deepEqual([r1107.anticipado, r1107.rendido, r1107.diferencia, r1107.cuadra], [30000000, 30000000, 0, true]);
  assert.equal(r1107.mensaje, "Cuadra: recibiste $300.000 y justificaste todo.");
  // R-1150 cuadraba cuando se envió (la CUIT de la apócrifa todavía no estaba consultada)…
  const alEnviar = E.comprobantes.map((c) => (c.id === "C-1150-03" ? { ...c, cuitApocrifa: "sin_consultar" as const } : c));
  const r1150Enviada = cuadratura(rendicion("R-1150-2609"), alEnviar, alEnviar.map((c) => evaluar(c, alEnviar)));
  assert.deepEqual(
    [r1150Enviada.anticipado, r1150Enviada.rendido, r1150Enviada.devuelto, r1150Enviada.diferencia, r1150Enviada.cuadra],
    [15000000, 13000000, 2000000, 0, true],
  );
  // …y en control deja de cuadrar: la línea apócrifa está bloqueada y no justifica el anticipo.
  const r1150 = cuadratura(rendicion("R-1150-2609"));
  assert.equal(r1150.cuadra, false);
  assert.equal(r1150.diferencia, 13000000 - r1150.rendido);
});

test("R-1107 la aprueba 2002 (Paz) o 2001 (Ruiz, su suplente); nadie más", () => {
  const r = rendicion("R-1107-2609");
  const cs = comprobantesDeRendicion(r, E.comprobantes);
  const niveles = nivelesDeAprobacion(totalRendicion(cs), persona("1107"), E.personas, E.reglasAprobacion, E.suplencias, E.hoy);
  assert.deepEqual(niveles, [["2002", "2001"]]);
  assert.equal(puedeAprobar("2002", r, niveles), true);
  assert.equal(puedeAprobar("2001", r, niveles), true);
  assert.equal(puedeAprobar("1107", r, niveles), false);
  assert.equal(puedeAprobar("3001", r, niveles), false);

  for (const aprobador of ["2002", "2001"]) {
    const ctx: ContextoTransicion = {
      fecha: E.hoy,
      actorLegajo: aprobador,
      cuadratura: cuadratura(r),
      evaluaciones: cs.map((c) => evaluacionDe(c.id)),
      niveles,
    };
    const res = aplicarAccion(r, "aprobar", ctx);
    assert.equal(res.ok && res.rendicion.estado, "aprobada", aprobador);
  }
});

test("antes de la suplencia, R-1107 sólo la aprobaba Paz; R-1042 necesitaría dos niveles", () => {
  const r = rendicion("R-1107-2609");
  const total = totalRendicion(comprobantesDeRendicion(r, E.comprobantes));
  assert.deepEqual(nivelesDeAprobacion(total, persona("1107"), E.personas, E.reglasAprobacion, E.suplencias, "2026-09-19"), [["2002"]]);
  const r1042 = rendicion("R-1042-2609");
  const total1042 = totalRendicion(comprobantesDeRendicion(r1042, E.comprobantes));
  assert.equal(total1042, 115500000);
  assert.deepEqual(
    nivelesDeAprobacion(total1042, persona("1042"), E.personas, E.reglasAprobacion, E.suplencias, E.hoy),
    [["2001"], ["3001"]],
  );
});

test("la bitácora es coherente: reproducirla con el reducer da el estado guardado", () => {
  for (const id of ["R-1107-2609", "R-1150-2609"]) {
    const guardada = rendicion(id);
    const titular = persona(guardada.legajo);
    let r: Rendicion = { ...guardada, estado: "borrador", nivelActual: 0, historial: [] };
    for (const ev of guardada.historial) {
      // Hasta el control de Tesorería (22/09) la CUIT de la apócrifa no estaba consultada.
      const comprobantes =
        ev.fecha < "2026-09-22"
          ? E.comprobantes.map((c) => (c.id === "C-1150-03" ? { ...c, cuitApocrifa: "sin_consultar" as const } : c))
          : E.comprobantes;
      const cs = comprobantesDeRendicion(r, comprobantes);
      const res = aplicarAccion(r, ev.accion, {
        fecha: ev.fecha,
        actorLegajo: ev.actorLegajo,
        cuadratura: cuadratura(r, comprobantes, comprobantes.map((c) => evaluar(c, comprobantes))),
        evaluaciones: cs.map((c) => evaluar(c, comprobantes)),
        niveles: nivelesDeAprobacion(totalRendicion(cs), titular, E.personas, E.reglasAprobacion, E.suplencias, ev.fecha),
        comentario: ev.comentario,
        comprobanteIds: ev.comprobanteIds,
      });
      assert.equal(res.ok, true, `${id} ${ev.accion}: ${res.ok ? "" : res.motivo}`);
      if (res.ok) r = res.rendicion;
    }
    assert.deepEqual(r, guardada, id);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Lote contable (R-1150) y plugin SAP
// ─────────────────────────────────────────────────────────────────────────────

const LOTE: LoteContable = armarLoteContable({
  rendiciones: E.rendiciones,
  comprobantes: E.comprobantes,
  evaluaciones: EVALUACIONES,
  personas: E.personas,
  parametros: E.parametrosSap,
  fechaContabilizacion: E.hoy,
});

test("el lote sólo trae R-1150 (la única en control), sin la apócrifa", () => {
  assert.deepEqual(LOTE.facturas.map((f) => f.idFactura), ["F-C-1150-01"]);
  assert.deepEqual(LOTE.asientos.map((a) => a.idAsiento), ["A-R-1150-2609"]);
  assert.deepEqual(LOTE.cancelaciones.map((c) => c.comprobanteId), ["C-1150-01"]);
  assert.deepEqual(LOTE.altasPendientes, []);
  assert.deepEqual(LOTE.derivadosCxP, []);
  assert.ok(!JSON.stringify(LOTE).includes("C-1150-03"));
});

test("el lote de R-1150 sale balanceado: debe = haber", () => {
  const [factura] = LOTE.facturas;
  const [asiento] = LOTE.asientos;
  const [cancelacion] = LOTE.cancelaciones;
  const ivaFactura = E.comprobantes
    .find((c) => c.id === factura.comprobanteId)
    ?.datos.lineasIva.reduce((s, l) => s + l.iva, 0);
  assert.equal(ivaFactura, 1260000);

  // Factura: gasto + percepción + IVA al debe = proveedor (bruto) al haber.
  const posicionesFactura = factura.posiciones.reduce((s, p) => s + p.importe, 0);
  assert.equal(posicionesFactura + (ivaFactura ?? 0), factura.importeBruto);
  assert.equal(factura.importeBruto, 7380000);

  // Asiento: debe = haber.
  const debeAsiento = asiento.posiciones.reduce((s, p) => s + p.debe, 0);
  const haberAsiento = asiento.posiciones.reduce((s, p) => s + p.haber, 0);
  assert.equal(debeAsiento, haberAsiento);
  assert.equal(debeAsiento, 780000);

  // Todo el lote junto (factura + cancelación contra la puente + asiento): debe = haber.
  const debe = posicionesFactura + (ivaFactura ?? 0) + cancelacion.importe + debeAsiento;
  const haber = factura.importeBruto + cancelacion.importe + haberAsiento;
  assert.equal(debe, haber);

  // La cuenta puente con la asignación de Sosa queda con lo que no se justificó: la apócrifa.
  const acreditadoEnPuente =
    cancelacion.importe + asiento.posiciones.filter((p) => p.cuentaMayor === E.parametrosSap.cuentaPuenteAnticipos).reduce((s, p) => s + p.haber, 0);
  assert.equal(cancelacion.cuentaContrapartida, E.parametrosSap.cuentaPuenteAnticipos);
  assert.equal(cancelacion.asignacion, "1150-2609-EF");
  assert.equal(15000000 - 2000000 - acreditadoEnPuente, 4840000);
});

test("el plugin SAP acepta el lote del Core tal cual y arma los cuatro CSV", () => {
  const vista: LoteContableSap = LOTE; // si el Core y el plugin divergen, tsc lo marca acá
  const archivos = generarArchivosSap(vista);
  const renglones = (csv: string) => csv.replace(/^﻿/, "").split("\r\n");
  assert.equal(renglones(archivos.facturas).length, 3); // encabezado + neto + percepción IIBB
  assert.equal(renglones(archivos.asientos).length, 4); // encabezado + cabecera + debe + haber
  assert.equal(renglones(archivos.cancelaciones).length, 2);
  assert.equal(renglones(archivos.altas).length, 1);
  assert.ok(renglones(archivos.facturas)[1].includes(";0005A00002298;"));
});

// ─────────────────────────────────────────────────────────────────────────────
// Conciliación, Haberes y QR
// ─────────────────────────────────────────────────────────────────────────────

test("conciliación contra la precarga: coinciden, el hotel difiere en $1.500 y Lubricentro no lo rindió nadie", () => {
  const r = conciliarConPrecarga(E.comprobantes, E.precargaIvaSimple, E.empresa.cuit, TOLERANCIA);
  assert.deepEqual(r.coinciden.map((x) => x.comprobanteId).sort(), [
    "C-1042-01",
    "C-1042-04",
    "C-1042-05",
    "C-1042-08",
    "C-1107-02",
    "C-1107-03",
    "C-1150-01",
    "C-1150-02",
    "C-1150-03",
  ]);
  assert.deepEqual(
    r.diferenciasImporte.map((x) => [x.comprobanteId, x.diferencia]),
    [["C-1107-01", -150000]],
  );
  assert.deepEqual(r.rendidoNoEnPrecarga, [
    { comprobanteId: "C-1042-02", motivo: "no_electronico" },
    { comprobanteId: "C-1042-03", motivo: "no_es_de_la_empresa" }, // B a consumidor final: no va a la precarga
    { comprobanteId: "C-1042-06", motivo: "no_electronico" },
    { comprobanteId: "C-1042-07", motivo: "no_encontrado" }, // el repetido: la línea ya la usó el 04
    { comprobanteId: "C-1042-09", motivo: "no_electronico" },
    { comprobanteId: "C-1107-04", motivo: "no_electronico" },
  ]);
  assert.deepEqual(r.precargaNoRendida.map((l) => l.razonSocialEmisor), ["Lubricentro Oeste S.A."]);
});

test("Haberes: Gómez tiene el anticipo sin rendir (su rendición es borrador); Benítez y Sosa, saldados", () => {
  const lineas = resumenParaHaberes({
    personas: E.personas,
    anticipos: E.anticipos,
    rendiciones: E.rendiciones,
    comprobantes: E.comprobantes,
    viajes: E.viajes,
    periodo: E.periodo,
    hoy: E.hoy,
  });
  assert.deepEqual(
    lineas.map((l) => [l.legajo, l.anticipado, l.rendidoConComprobante, l.saldoNoRendido, l.antiguedadDias]),
    [
      ["1042", 50000000, 0, 50000000, 23],
      ["1107", 30000000, 30000000, 0, 0],
      ["1150", 15000000, 13000000, 0, 0],
    ],
  );
  assert.deepEqual(lineas[0].viajes.map((v) => [v.id, v.cubiertoPorConvenio]), [["VJ-1042-2609", true]]);
});

test("cada comprobante electrónico con CAE tiene su QR, y leerlo devuelve los datos del comprobante", () => {
  const conCae = E.comprobantes.filter((c) => c.datos.cae);
  assert.equal(conCae.length, 12);
  assert.deepEqual(Object.keys(E.qrPorComprobante).sort(), conCae.map((c) => c.id).sort());
  for (const c of conCae) {
    const url = E.qrPorComprobante[c.id];
    assert.ok(url.startsWith("https://www.arca.gob.ar/fe/qr/?p="), c.id);
    const r = leerQrArca(url);
    assert.equal(r.ok, true, c.id);
    if (!r.ok) continue;
    const l = r.lectura;
    const d = c.datos;
    assert.equal(l.cuitEmisor, d.cuitEmisor, c.id);
    assert.equal(claseDesdeTipoArca(l.tipoComprobanteArca), d.clase, c.id);
    assert.equal(l.puntoVenta, d.puntoVenta, c.id);
    assert.equal(l.numero, d.numero, c.id);
    assert.equal(l.fecha, d.fecha, c.id);
    assert.equal(l.importeTotal, d.total, c.id);
    assert.equal(l.codAut, d.cae, c.id);
    assert.equal(l.nroDocReceptor, d.cuitReceptor ?? "0", c.id);
    assert.equal(l.tipoDocReceptor, d.cuitReceptor ? 80 : 99, c.id);
  }
});
