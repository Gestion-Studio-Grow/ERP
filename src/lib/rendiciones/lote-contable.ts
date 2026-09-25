/**
 * RENDÍ — lote contable: lo que se lleva a SAP (Core, PURO). Plan §6.6 (dos carriles) y §10.
 *
 * Carril `factura`: una factura de proveedor por comprobante, contra cuenta de mayor, y su cancelación
 * contra la cuenta puente (o la de tarjeta, o reintegros). Carril `asiento`: un asiento por rendición,
 * con el IVA en el costo. Carril `cuentas_a_pagar`: sólo se informa. El Core NO conoce al plugin SAP:
 * el plugin consume `LoteContable` por tipado estructural (ADR-002).
 *
 * Sólo entran las rendiciones EN CONTROL: una contabilizada ya se exportó y volver a armarla sería
 * cargarla dos veces en SAP.
 *
 * `destinoEnLote` es la ÚNICA regla de adónde va cada comprobante; el lote la usa y la pantalla también,
 * así lo que se muestra y lo que se exporta no pueden divergir.
 *
 * Decisiones donde el contrato no alcanza (ver README):
 * - Un comprobante bloqueado queda afuera, SALVO que su único bloqueo sea R3 (factura con leyenda):
 *   ese bloqueo ES la derivación, así que va a `derivadosCxP`. Si además tiene otro bloqueo, afuera.
 * - Las percepciones que no computan (municipal, otra) van a la cuenta del gasto con el indicador no
 *   computable, igual que el no gravado: si no, la factura no cerraría contra su importe bruto.
 * - El asiento se fecha con la fecha de contabilización y va en pesos (los costos ya están en pesos).
 * - Una factura de un proveedor fuera del maestro tiene destino "factura" (lo es), pero hasta el alta
 *   queda en `altasPendientes`: el aviso V3 de la evaluación ya lo dice.
 */

import { normalizarCuit } from "@/lib/cuit";
import { sumar } from "./dinero";
import { aamm } from "./fechas";
import { comprobantesDeRendicion } from "./rendicion";
import { etiquetaClase } from "./textos";
import type {
  AsientoSap,
  Centavos,
  Comprobante,
  DatosComprobante,
  Evaluacion,
  FechaISO,
  LoteContable,
  MedioPago,
  ParametrosSap,
  Periodo,
  Persona,
  PosicionAsientoSap,
  PosicionFacturaSap,
  Rendicion,
  Validacion,
} from "./tipos";

export interface ArgsLoteContable {
  rendiciones: Rendicion[];
  comprobantes: Comprobante[];
  evaluaciones: Evaluacion[];
  personas: Persona[];
  parametros: ParametrosSap;
  fechaContabilizacion: FechaISO;
}

const SIGLA_MEDIO: Record<MedioPago["tipo"], string> = {
  efectivo_anticipo: "EF",
  tarjeta_corporativa: "TC",
  recargable: "RC",
  propio_a_reintegrar: "PR",
};

const TEXTO_MEDIO: Record<MedioPago["tipo"], string> = {
  efectivo_anticipo: "efectivo del anticipo",
  tarjeta_corporativa: "tarjeta corporativa",
  recargable: "tarjeta recargable",
  propio_a_reintegrar: "pagado por la persona",
};

/** `${legajo}-${AAMM}-${MP}`: 1150, 2026-09, efectivo → "1150-2609-EF". */
export function asignacionContable(legajo: string, periodo: Periodo, medio: MedioPago): string {
  return `${legajo}-${aamm(periodo)}-${SIGLA_MEDIO[medio.tipo]}`;
}

function letra(d: DatosComprobante): string {
  switch (d.clase) {
    case "factura_a":
    case "tique_factura_a":
    case "tique_peaje":
      return "A";
    case "factura_b":
      return "B";
    case "factura_c":
      return "C";
    case "factura_m":
      return "M";
    default:
      return "";
  }
}

/**
 * Número oficial para la Referencia de SAP: punto de venta (4 dígitos hasta 9999, 5 si es mayor),
 * letra y número a 8 dígitos. Ej.: 0001A00000101. Vacío si falta punto de venta o número.
 */
export function referenciaOficial(d: DatosComprobante): string {
  if (d.puntoVenta === undefined || d.numero === undefined) return "";
  const pv = String(d.puntoVenta).padStart(d.puntoVenta <= 9999 ? 4 : 5, "0");
  return `${pv}${letra(d)}${String(d.numero).padStart(8, "0")}`;
}

function numeroLegible(d: DatosComprobante): string {
  if (d.puntoVenta !== undefined && d.numero !== undefined) {
    return `${String(d.puntoVenta).padStart(d.puntoVenta <= 9999 ? 4 : 5, "0")}-${String(d.numero).padStart(8, "0")}`;
  }
  return d.numero !== undefined ? String(d.numero) : "s/n";
}

/** "{razón social} {clase} {número}", el texto de la línea del asiento. */
function textoComprobante(c: Comprobante): string {
  const d = c.datos;
  if (d.clase === "sin_comprobante") return `${d.razonSocialEmisor ?? c.imputacion.comentario ?? "Gasto"} sin comprobante`;
  return `${d.razonSocialEmisor ?? d.cuitEmisor ?? "Comprobante"} ${etiquetaClase(d.clase)} ${numeroLegible(d)}`;
}

function cuentaContrapartida(medio: MedioPago, p: ParametrosSap): string {
  switch (medio.tipo) {
    case "tarjeta_corporativa":
      return p.cuentaTarjetaAPagar;
    case "propio_a_reintegrar":
      return p.cuentaReintegrosAPagar;
    default:
      return p.cuentaPuenteAnticipos;
  }
}

function alicuotaTexto(a: number): string {
  return String(a).replace(".", ",");
}

/**
 * El primer bloqueo que saca al comprobante del lote (R3 no: R3 es la derivación a cuentas a pagar).
 * Es la regla que antes era `tieneBloqueoQueLoSaca`; ahora devuelve el bloqueo para dar el motivo.
 */
function bloqueoQueLoSaca(e: Evaluacion): Validacion | undefined {
  return e.validaciones.find((v) => v.severidad === "bloquea" && v.codigo !== "R3_FACTURA_CON_LEYENDA");
}

/** Adónde va un comprobante en el lote. `fuera` trae el motivo en criollo, para mostrar. */
export type DestinoEnLote =
  | { tipo: "factura" }
  | { tipo: "asiento" }
  | { tipo: "cuentas_a_pagar" }
  | { tipo: "fuera"; motivo: string };

/**
 * Destino de un comprobante en el lote, según su evaluación:
 * - con un bloqueo que lo saca (cualquiera menos R3) → `fuera`, con el mensaje del primer bloqueo;
 * - si no, según el carril: factura, asiento o cuentas a pagar (R3 sola o R8);
 * - carril `ninguno` sin bloqueo (un tipo que no se registra, como la propina) → `fuera`.
 */
export function destinoEnLote(e: Evaluacion): DestinoEnLote {
  const bloqueo = bloqueoQueLoSaca(e);
  if (bloqueo) return { tipo: "fuera", motivo: bloqueo.mensaje };
  switch (e.carril) {
    case "factura":
      return { tipo: "factura" };
    case "asiento":
      return { tipo: "asiento" };
    case "cuentas_a_pagar":
      return { tipo: "cuentas_a_pagar" };
    default:
      return { tipo: "fuera", motivo: "Este tipo de gasto no se contabiliza en SAP" };
  }
}

/**
 * Lo que entra al lote (destino factura o asiento), en pesos: el crédito fiscal, el gasto (el costo de
 * cada comprobante) y las percepciones que se computan. Es lo mismo que suman las posiciones del lote.
 */
export function totalesQueEntran(evaluaciones: Evaluacion[]): {
  creditoFiscal: Centavos;
  gasto: Centavos;
  percepciones: Centavos;
} {
  const entran = evaluaciones.filter((e) => {
    const destino = destinoEnLote(e).tipo;
    return destino === "factura" || destino === "asiento";
  });
  return {
    creditoFiscal: sumar(...entran.map((e) => e.creditoFiscal)),
    gasto: sumar(...entran.map((e) => e.costo)),
    percepciones: sumar(...entran.map((e) => e.percepcionesComputables)),
  };
}

function agregarFactura(
  lote: LoteContable,
  r: Rendicion,
  c: Comprobante,
  e: Evaluacion,
  p: ParametrosSap,
  fechaContabilizacion: FechaISO,
): void {
  const d = c.datos;
  const cuit = d.cuitEmisor ? normalizarCuit(d.cuitEmisor) : "";
  const emisor = p.maestroProveedores[cuit];
  if (!emisor) {
    lote.altasPendientes.push({ cuit, razonSocial: d.razonSocialEmisor ?? "", comprobanteId: c.id });
    return;
  }

  const asignacion = asignacionContable(r.legajo, r.periodo, c.imputacion.medioPago);
  const comun = {
    centroCosto: c.imputacion.centroCosto,
    numeroPersonal: c.legajo.padStart(8, "0"),
    asignacion,
  };
  const cuentaGasto = e.cuentaMayor ?? "";
  const indicadorComputable = e.indicadorIva ?? "";
  const indicadorNoComputable = e.indicadorIvaNoComputable ?? "";
  const posiciones: PosicionFacturaSap[] = [];
  const agregar = (cuentaMayor: string, importe: Centavos, indicadorIva: string, texto: string) => {
    if (importe !== 0) posiciones.push({ cuentaMayor, importe, indicadorIva, ...comun, texto });
  };

  for (const l of d.lineasIva) agregar(cuentaGasto, l.neto, indicadorComputable, `Neto ${alicuotaTexto(l.alicuota)}%`);
  for (const per of d.percepciones) {
    if (per.regimen === "iva") agregar(p.cuentaPercepcionIva, per.importe, "", "Percepción de IVA");
    if (per.regimen === "iibb") {
      agregar(p.cuentaPercepcionIibb, per.importe, "", `Percepción de IIBB ${per.jurisdiccion ?? ""}`.trim());
    }
  }
  agregar(cuentaGasto, d.noGravado, indicadorNoComputable, "No gravado");
  agregar(cuentaGasto, d.exento, indicadorNoComputable, "Exento");
  agregar(cuentaGasto, d.impuestosInternos, indicadorNoComputable, "Impuestos internos");
  for (const per of d.percepciones) {
    if (per.regimen === "municipal" || per.regimen === "otra") {
      agregar(cuentaGasto, per.importe, indicadorNoComputable, `Percepción ${per.regimen === "municipal" ? "municipal" : "otra"}`);
    }
  }

  const idFactura = `F-${c.id}`;
  const referencia = referenciaOficial(d);
  lote.facturas.push({
    idFactura,
    comprobanteId: c.id,
    sociedad: p.sociedad,
    claseDocumento: p.claseDocFactura,
    fechaDocumento: d.fecha,
    fechaContabilizacion,
    emisor,
    referencia,
    lugarComercial: p.lugarComercial,
    importeBruto: d.total,
    moneda: d.moneda,
    asignacion,
    posiciones,
  });
  lote.cancelaciones.push({
    idFactura,
    comprobanteId: c.id,
    emisor,
    referencia,
    importe: d.total,
    cuentaContrapartida: cuentaContrapartida(c.imputacion.medioPago, p),
    asignacion,
  });
}

function armarAsiento(
  r: Rendicion,
  lineas: Array<{ c: Comprobante; e: Evaluacion }>,
  p: ParametrosSap,
  fechaContabilizacion: FechaISO,
  nombre: string,
): AsientoSap {
  const debe: PosicionAsientoSap[] = [];
  for (const { c, e } of lineas) {
    const asignacion = asignacionContable(r.legajo, r.periodo, c.imputacion.medioPago);
    debe.push({
      cuentaMayor: e.cuentaMayor ?? "",
      debe: e.costo,
      haber: 0,
      ...(e.indicadorIva ? { indicadorIva: e.indicadorIva } : {}),
      centroCosto: c.imputacion.centroCosto,
      asignacion,
      texto: textoComprobante(c),
    });
    // Percepciones que se computan aunque el IVA de la operación no compute: van a su cuenta, no al gasto.
    if (e.percepcionesComputables > 0) {
      for (const per of c.datos.percepciones) {
        if (per.regimen !== "iva" && per.regimen !== "iibb") continue;
        debe.push({
          cuentaMayor: per.regimen === "iva" ? p.cuentaPercepcionIva : p.cuentaPercepcionIibb,
          debe: per.importe,
          haber: 0,
          centroCosto: c.imputacion.centroCosto,
          asignacion,
          texto: per.regimen === "iva" ? "Percepción de IVA" : `Percepción de IIBB ${per.jurisdiccion ?? ""}`.trim(),
        });
      }
    }
  }

  const porMedio = new Map<MedioPago["tipo"], { medio: MedioPago; importe: Centavos }>();
  for (const { c, e } of lineas) {
    const medio = c.imputacion.medioPago;
    const acumulado = porMedio.get(medio.tipo) ?? { medio, importe: 0 };
    porMedio.set(medio.tipo, { medio: acumulado.medio, importe: acumulado.importe + e.costo + e.percepcionesComputables });
  }
  const haber: PosicionAsientoSap[] = [...porMedio.values()].map(({ medio, importe }) => ({
    cuentaMayor: cuentaContrapartida(medio, p),
    debe: 0,
    haber: importe,
    asignacion: asignacionContable(r.legajo, r.periodo, medio),
    texto: `${r.id} ${TEXTO_MEDIO[medio.tipo]}`,
  }));

  return {
    idAsiento: `A-${r.id}`,
    rendicionId: r.id,
    sociedad: p.sociedad,
    claseDocumento: p.claseDocAsiento,
    fechaDocumento: fechaContabilizacion,
    fechaContabilizacion,
    moneda: "ARS",
    referencia: r.id,
    texto: `${r.id} ${nombre}`,
    posiciones: [...debe, ...haber],
  };
}

/**
 * Arma el lote para SAP con las rendiciones EN CONTROL (las contabilizadas ya se exportaron). Cada
 * comprobante va adonde dice `destinoEnLote`; los que no tienen evaluación quedan afuera.
 */
export function armarLoteContable(args: ArgsLoteContable): LoteContable {
  const { rendiciones, comprobantes, evaluaciones, personas, parametros, fechaContabilizacion } = args;
  const evaluacionDe = new Map(evaluaciones.map((e) => [e.comprobanteId, e] as const));
  const lote: LoteContable = { facturas: [], asientos: [], cancelaciones: [], altasPendientes: [], derivadosCxP: [] };

  for (const r of rendiciones) {
    if (r.estado !== "en_control") continue;
    const lineasAsiento: Array<{ c: Comprobante; e: Evaluacion }> = [];

    for (const c of comprobantesDeRendicion(r, comprobantes)) {
      const e = evaluacionDe.get(c.id);
      if (!e) continue;
      const destino = destinoEnLote(e);
      if (destino.tipo === "cuentas_a_pagar") lote.derivadosCxP.push(c.id);
      else if (destino.tipo === "factura") agregarFactura(lote, r, c, e, parametros, fechaContabilizacion);
      else if (destino.tipo === "asiento") lineasAsiento.push({ c, e });
    }

    if (lineasAsiento.length > 0) {
      const nombre = personas.find((pe) => pe.legajo === r.legajo)?.nombre ?? r.legajo;
      lote.asientos.push(armarAsiento(r, lineasAsiento, parametros, fechaContabilizacion, nombre));
    }
  }
  return lote;
}
