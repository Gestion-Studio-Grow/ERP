// ============================================================================
// PRESUPUESTOS DE VIAJE — core PURO (sin Prisma, sin red). Spec funcional:
// docs/producto/spec-armador-presupuestos-viaje.md (§3 modelo, §4 invariantes).
// ============================================================================
//
// Dos objetos y una relación (ADR-055, patrón variante):
//   - OFERTA CAPTURADA (objeto maestro): un precio CONGELADO con contexto suficiente
//     para no mentir — unidad de precio, base de ocupación (si es alojamiento), fecha
//     de captura, vigencia, certeza (verificada/estimada), fuente y quién la capturó.
//   - OPCIÓN DE PRESUPUESTO (dentro de un nivel de un presupuesto).
//   - ASIGNACIÓN (relación explícita con ABM): la oferta se usa en ESA opción con una
//     base aplicada, pasajeros cubiertos y cantidad. Nunca "todas con todas".
//
// INVARIANTE DURA (caso real): ningún precio existe sin `capturadoEn` y sin unidad;
// ningún alojamiento sin base de ocupación. Se defiende en TRES capas:
//   1. el TIPO (`PrecioOferta`), 2. este core (`capturarOferta` lanza
//   `OfertaInvalidaError` con los motivos), 3. el SCHEMA (NOT NULL sin default).
//
// El precio por persona NUNCA se infiere a escondidas: si una opción solo tiene tarifa
// doble, el single es "No cotizado" (null), salvo suplemento single explícito.
//
// DINERO (ADR-057): number con 2 decimales en memoria (`round2`); Decimal(14,2) en DB.

import { round2 } from "@/lib/round";
import {
  BASES_OCUPACION,
  UNIDADES_PRECIO,
  personasPorBase,
  type BaseOcupacion,
  type InstanteISO,
  type Moneda,
  type OfertaHotel,
  type OfertaVuelo,
  type PrecioOferta,
  type UnidadPrecio,
} from "@/plugins/ofertas-viaje/port";

export type { BaseOcupacion, UnidadPrecio } from "@/plugins/ofertas-viaje/port";

export type TipoOferta = "VUELO" | "ALOJAMIENTO" | "OTRO";
export type Certeza = "VERIFICADA" | "ESTIMADA";
export type IncluyeImpuestos = "SI" | "NO" | "PARCIAL";

/** Vigencia por defecto del tenant cuando el proveedor no la informa (spec §3.3). */
export const VIGENCIA_DEFAULT_DIAS = 2;

/** Ventana "por vencer" (spec §3.3: < 48 h). */
const POR_VENCER_MS = 48 * 3_600_000;

// ── Oferta capturada ──────────────────────────────────────────────────────────

/** Lo que se persiste como `OfertaCapturadaViaje` (menos ids/tenant). */
export interface OfertaCapturadaNueva {
  tipo: TipoOferta;
  titulo: string;
  proveedor: string;
  referenciaProveedor: string | null;
  precio: number;
  moneda: Moneda;
  unidad: UnidadPrecio;
  baseOcupacion: BaseOcupacion | null;
  ocupacion: number | null;
  noches: number | null;
  incluyeImpuestos: IncluyeImpuestos | null;
  capturadoEn: Date;
  vigenteHasta: Date;
  /** true si `vigenteHasta` salió del default del tenant, no del proveedor (se marca en pantalla). */
  vigenciaAsumida: boolean;
  certeza: Certeza;
  fuente: string;
  condiciones: string | null;
  /** Payload normalizado completo (la oferta tal como se vio), para el detalle. */
  detalle: unknown;
}

export class OfertaInvalidaError extends Error {
  constructor(readonly motivos: string[]) {
    super(`Oferta inválida: ${motivos.join(" · ")}`);
    this.name = "OfertaInvalidaError";
  }
}

const RE_MONEDA = /^[A-Z]{3}$/;
/** Tolerancia para `capturadoEn` en el futuro (desfase de relojes). */
const TOLERANCIA_FUTURO_MS = 5 * 60_000;

/**
 * Valida un precio normalizado para un tipo de ítem. Devuelve motivos (vacío = válido).
 * Chequea EN RUNTIME lo que el tipo ya exige: el payload puede venir de un adapter mal
 * escrito o de una carga manual — acá no se confía en nadie.
 */
export function validarPrecio(
  tipo: TipoOferta,
  p: Partial<PrecioOferta> | null | undefined,
  ahora: Date,
): string[] {
  const m: string[] = [];
  if (!p) return ["falta el precio"];
  if (typeof p.monto !== "number" || !Number.isFinite(p.monto) || p.monto < 0) m.push("monto inválido");
  if (typeof p.moneda !== "string" || !RE_MONEDA.test(p.moneda)) m.push("moneda inválida (ISO-4217, 3 letras)");
  if (!p.unidad || !UNIDADES_PRECIO.includes(p.unidad)) m.push("falta la unidad de precio");
  if (tipo === "ALOJAMIENTO") {
    if (!p.baseOcupacion || !BASES_OCUPACION.includes(p.baseOcupacion)) m.push("falta la base de ocupación");
    else if (p.baseOcupacion === "OTRA" && !(p.ocupacion && p.ocupacion >= 1)) m.push('base "otra" sin cantidad de personas');
  }
  if (p.unidad === "POR_HABITACION_NOCHE" && !(p.noches && p.noches >= 1)) m.push("precio por noche sin cantidad de noches");
  const cap = p.capturadoEn ? Date.parse(p.capturadoEn) : NaN;
  if (!Number.isFinite(cap)) m.push("falta la fecha de captura");
  else if (cap > ahora.getTime() + TOLERANCIA_FUTURO_MS) m.push("la fecha de captura está en el futuro");
  if (p.vigenteHasta != null) {
    const vig = Date.parse(p.vigenteHasta);
    if (!Number.isFinite(vig)) m.push("vigencia inválida");
    else if (Number.isFinite(cap) && vig < cap) m.push("la vigencia es anterior a la captura");
  }
  return m;
}

export interface ContextoCaptura {
  ahora: Date;
  /** Certeza que declara el operador (sin default: hay que elegir). API en vivo = VERIFICADA. */
  certeza: Certeza;
  /** Canal: "Amadeus (test)", "mail del mayorista X", link… */
  fuente: string;
  /** Días de vigencia por defecto del tenant si el proveedor no la informa. */
  vigenciaDefaultDias?: number;
}

/** Descripción en una línea de un vuelo: "AEP → MAD ida y vuelta · AR · 1 escala". */
export function describirVuelo(o: OfertaVuelo): string {
  const ida = o.tramos[0];
  const primero = ida?.segmentos[0];
  const ultimo = ida?.segmentos[ida.segmentos.length - 1];
  const ruta = primero && ultimo ? `${primero.origen} → ${ultimo.destino}` : "vuelo";
  const tipo = o.tramos.length > 1 ? "ida y vuelta" : "solo ida";
  const aerolineas = [...new Set(o.tramos.flatMap((t) => t.segmentos.map((s) => s.aerolinea)).filter(Boolean))];
  const escalas = ida ? ida.segmentos.length - 1 : 0;
  const escalasTxt = escalas === 0 ? "sin escalas" : escalas === 1 ? "1 escala" : `${escalas} escalas`;
  return [ruta, tipo, aerolineas.join("/"), escalasTxt].filter(Boolean).join(" · ");
}

/** Descripción en una línea de un hotel: "Hotel X ★4 · doble · con desayuno · 5 noches". */
export function describirHotel(o: OfertaHotel): string {
  const partes = [
    o.hotel.estrellas ? `${o.hotel.nombre} ★${o.hotel.estrellas}` : o.hotel.nombre,
    o.habitacion.tipo ?? o.habitacion.descripcion,
    o.habitacion.regimen,
    `${o.noches} ${o.noches === 1 ? "noche" : "noches"}`,
  ];
  return partes.filter(Boolean).join(" · ");
}

/** Condiciones en texto libre a partir de lo que informó el proveedor (spec: texto libre en v1). */
function condicionesDe(tipo: TipoOferta, o: OfertaVuelo | OfertaHotel): string | null {
  if (tipo === "VUELO") {
    const v = o as OfertaVuelo;
    const c = [
      v.equipajeIncluido == null ? null : v.equipajeIncluido ? "Equipaje despachado incluido" : "Sin equipaje despachado",
      v.asientosDisponibles != null ? `${v.asientosDisponibles} asientos disponibles al capturar` : null,
    ].filter(Boolean);
    return c.length ? c.join(". ") : null;
  }
  const h = o as OfertaHotel;
  const c = [h.habitacion.regimen ? `Régimen: ${h.habitacion.regimen}` : null, h.politicaCancelacion].filter(Boolean);
  return c.length ? c.join(". ") : null;
}

/**
 * CAPTURA una oferta del buscador como objeto maestro. Lanza `OfertaInvalidaError` si
 * el precio no cumple la invariante. Si el proveedor no informó vigencia, aplica el
 * default del tenant y lo MARCA (`vigenciaAsumida`).
 */
export function capturarOferta(
  tipo: TipoOferta,
  oferta: OfertaVuelo | OfertaHotel,
  ctx: ContextoCaptura,
): OfertaCapturadaNueva {
  const motivos = validarPrecio(tipo, oferta?.precio, ctx.ahora);
  if (!oferta?.proveedor) motivos.push("falta el proveedor");
  if (!ctx.certeza || (ctx.certeza !== "VERIFICADA" && ctx.certeza !== "ESTIMADA")) motivos.push("falta la certeza (verificada/estimada)");
  if (!ctx.fuente?.trim()) motivos.push("falta la fuente");
  if (motivos.length) throw new OfertaInvalidaError(motivos);

  const p = oferta.precio;
  const capturadoEn = new Date(p.capturadoEn);
  const dias = ctx.vigenciaDefaultDias ?? VIGENCIA_DEFAULT_DIAS;
  const vigenciaAsumida = !p.vigenteHasta;
  const vigenteHasta = p.vigenteHasta ? new Date(p.vigenteHasta) : new Date(capturadoEn.getTime() + dias * 86_400_000);

  return {
    tipo,
    titulo: tipo === "VUELO" ? describirVuelo(oferta as OfertaVuelo) : describirHotel(oferta as OfertaHotel),
    proveedor: oferta.proveedor,
    referenciaProveedor: oferta.referenciaProveedor || null,
    precio: round2(p.monto),
    moneda: p.moneda,
    unidad: p.unidad,
    baseOcupacion: p.baseOcupacion ?? null,
    ocupacion: p.baseOcupacion === "OTRA" ? (p.ocupacion ?? null) : null,
    noches: p.noches ?? (tipo === "ALOJAMIENTO" ? (oferta as OfertaHotel).noches : null),
    incluyeImpuestos: p.incluyeImpuestos ?? null,
    capturadoEn,
    vigenteHasta,
    vigenciaAsumida,
    certeza: ctx.certeza,
    fuente: ctx.fuente.trim(),
    condiciones: condicionesDe(tipo, oferta),
    detalle: oferta,
  };
}

/** Datos de una captura MANUAL (portal del mayorista, mail, llamada). Mismo core, misma invariante. */
export interface CapturaManual {
  tipo: TipoOferta;
  titulo: string;
  proveedor: string;
  precio: PrecioOferta;
  condiciones?: string | null;
}

export function capturarOfertaManual(c: CapturaManual, ctx: ContextoCaptura): OfertaCapturadaNueva {
  const motivos = validarPrecio(c.tipo, c.precio, ctx.ahora);
  if (!c.titulo?.trim()) motivos.push("falta el título");
  if (!c.proveedor?.trim()) motivos.push("falta el proveedor");
  if (!ctx.certeza || (ctx.certeza !== "VERIFICADA" && ctx.certeza !== "ESTIMADA")) motivos.push("falta la certeza (verificada/estimada)");
  if (!ctx.fuente?.trim()) motivos.push("falta la fuente");
  if (motivos.length) throw new OfertaInvalidaError(motivos);
  const p = c.precio;
  const capturadoEn = new Date(p.capturadoEn);
  const dias = ctx.vigenciaDefaultDias ?? VIGENCIA_DEFAULT_DIAS;
  return {
    tipo: c.tipo,
    titulo: c.titulo.trim(),
    proveedor: c.proveedor.trim(),
    referenciaProveedor: null,
    precio: round2(p.monto),
    moneda: p.moneda,
    unidad: p.unidad,
    baseOcupacion: p.baseOcupacion ?? null,
    ocupacion: p.baseOcupacion === "OTRA" ? (p.ocupacion ?? null) : null,
    noches: p.noches ?? null,
    incluyeImpuestos: p.incluyeImpuestos ?? null,
    capturadoEn,
    vigenteHasta: p.vigenteHasta ? new Date(p.vigenteHasta) : new Date(capturadoEn.getTime() + dias * 86_400_000),
    vigenciaAsumida: !p.vigenteHasta,
    certeza: ctx.certeza,
    fuente: ctx.fuente.trim(),
    condiciones: c.condiciones?.trim() || null,
    detalle: { manual: true },
  };
}

// ── Asignación oferta → opción ────────────────────────────────────────────────

/** Lo mínimo de la oferta que necesita el cálculo (subconjunto de `OfertaCapturadaNueva`). */
export type OfertaParaCalculo = Pick<
  OfertaCapturadaNueva,
  "tipo" | "precio" | "moneda" | "unidad" | "baseOcupacion" | "ocupacion" | "noches" | "vigenteHasta" | "certeza"
>;

/** La relación explícita (spec §3.7), menos ids. */
export interface AsignacionNueva {
  pasajerosCubiertos: number;
  /** Base con la que se prorratea EN ESTA opción (puede diferir de la capturada). Null si no es alojamiento. */
  baseAplicada: BaseOcupacion | null;
  ocupacionAplicada: number | null;
  /** Importe explícito para calcular single desde una tarifa doble. PROHIBIDO inferirlo. */
  suplementoSingle: number | null;
  /** noches / tramos / unidades. */
  cantidad: number;
}

/**
 * Asignación por DEFAULT al arrastrar una oferta a una opción: pasajeros del pedido,
 * base = la capturada, cantidad = noches (si por noche) o 1. El operador la edita después.
 */
export function asignacionDefault(oferta: OfertaParaCalculo, pasajerosDelPedido: number): AsignacionNueva {
  return {
    pasajerosCubiertos: Math.max(1, pasajerosDelPedido),
    baseAplicada: oferta.tipo === "ALOJAMIENTO" ? oferta.baseOcupacion : null,
    ocupacionAplicada: oferta.tipo === "ALOJAMIENTO" && oferta.baseOcupacion === "OTRA" ? oferta.ocupacion : null,
    suplementoSingle: null,
    cantidad: oferta.unidad === "POR_HABITACION_NOCHE" ? Math.max(1, oferta.noches ?? 1) : 1,
  };
}

/**
 * COSTO TOTAL de una asignación para los pasajeros que cubre (lo que cuesta ese ítem
 * en esa opción). Es la cuenta que evita el error del caso real:
 *   POR_PERSONA          → precio × pasajeros × cantidad
 *   POR_HABITACION_NOCHE → precio × habitaciones × noches(cantidad)
 *   POR_HABITACION_TOTAL → precio × habitaciones × cantidad
 *   POR_TRAMO            → precio × cantidad (el ítem ya es del grupo)
 * habitaciones = ceil(pasajeros / personas por base aplicada).
 */
export function costoTotalAsignacion(a: AsignacionNueva, o: OfertaParaCalculo): number {
  const pax = Math.max(1, a.pasajerosCubiertos);
  const cant = Math.max(1, a.cantidad);
  switch (o.unidad) {
    case "POR_PERSONA":
      return round2(o.precio * pax * cant);
    case "POR_TRAMO":
      return round2(o.precio * cant);
    case "POR_HABITACION_NOCHE":
    case "POR_HABITACION_TOTAL": {
      const porHab = a.baseAplicada ? personasPorBase(a.baseAplicada, a.ocupacionAplicada) : 0;
      const habitaciones = porHab > 0 ? Math.ceil(pax / porHab) : pax; // sin base → 1 por persona (conservador)
      return round2(o.precio * habitaciones * cant);
    }
  }
}

/**
 * PRECIO POR PERSONA de una asignación normalizado a una base pedida (DOBLE o SINGLE).
 * Devuelve `null` = "No cotizado" cuando no se puede sin inferir:
 *   - alojamiento capturado en base X y se pide otra base: solo si es doble→single con
 *     `suplementoSingle` explícito; en cualquier otro caso, null.
 *   - ítems por persona / por tramo: no dependen de la base → siempre se calculan.
 */
export function precioPorPersona(
  a: AsignacionNueva,
  o: OfertaParaCalculo,
  basePedida: "DOBLE" | "SINGLE",
): number | null {
  const cant = Math.max(1, a.cantidad);
  const pax = Math.max(1, a.pasajerosCubiertos);
  switch (o.unidad) {
    case "POR_PERSONA":
      return round2(o.precio * cant);
    case "POR_TRAMO":
      return round2((o.precio * cant) / pax);
    case "POR_HABITACION_NOCHE":
    case "POR_HABITACION_TOTAL": {
      const base = a.baseAplicada;
      if (!base) return null;
      const porHab = personasPorBase(base, a.ocupacionAplicada);
      if (porHab <= 0) return null;
      const porPersonaEnSuBase = (o.precio * cant) / porHab;
      if (base === basePedida) return round2(porPersonaEnSuBase);
      if (base === "DOBLE" && basePedida === "SINGLE" && a.suplementoSingle != null) {
        return round2(porPersonaEnSuBase + a.suplementoSingle);
      }
      return null; // no se infiere
    }
  }
}

export type Confianza = "verde" | "ambar" | "rojo";

export interface ResumenOpcion {
  moneda: Moneda | null;
  /** Suma por persona en base doble; null = alguna asignación "No cotizada" para doble. */
  porPersonaDoble: number | null;
  /** Ídem en single. */
  porPersonaSingle: number | null;
  /** Costo total del grupo (siempre calculable). */
  costoTotal: number;
  /** Mínimo `vigenteHasta` de las ofertas asignadas; null si no hay asignaciones. */
  vigenteHasta: Date | null;
  /** verde = todo verificado y vigente · ámbar = alguna estimada o por vencer · rojo = alguna vencida o monedas mezcladas. */
  confianza: Confianza;
  avisos: string[];
}

export function resumirOpcion(
  asignaciones: ReadonlyArray<{ asignacion: AsignacionNueva; oferta: OfertaParaCalculo }>,
  ahora: Date,
): ResumenOpcion {
  if (asignaciones.length === 0) {
    return { moneda: null, porPersonaDoble: null, porPersonaSingle: null, costoTotal: 0, vigenteHasta: null, confianza: "rojo", avisos: ["La opción no tiene ofertas asignadas."] };
  }
  const monedas = new Set(asignaciones.map((x) => x.oferta.moneda));
  const avisos: string[] = [];
  let confianza: Confianza = "verde";
  if (monedas.size > 1) {
    avisos.push(`Mezcla monedas (${[...monedas].join(", ")}): no se puede sumar sin tipo de cambio.`);
    confianza = "rojo";
  }
  let doble: number | null = 0;
  let single: number | null = 0;
  let total = 0;
  let vigenteHasta: Date | null = null;
  for (const { asignacion, oferta } of asignaciones) {
    total = round2(total + costoTotalAsignacion(asignacion, oferta));
    const d = precioPorPersona(asignacion, oferta, "DOBLE");
    const s = precioPorPersona(asignacion, oferta, "SINGLE");
    doble = doble == null || d == null ? null : round2(doble + d);
    single = single == null || s == null ? null : round2(single + s);
    if (!vigenteHasta || oferta.vigenteHasta < vigenteHasta) vigenteHasta = oferta.vigenteHasta;
    const vig = estadoVigencia(oferta.vigenteHasta, ahora);
    if (vig === "vencida") {
      avisos.push("Hay una oferta vencida: hay que recapturar.");
      confianza = "rojo";
    } else if (vig === "por_vencer" && confianza !== "rojo") {
      confianza = "ambar";
    }
    if (oferta.certeza === "ESTIMADA" && confianza !== "rojo") confianza = "ambar";
  }
  if (monedas.size > 1) {
    doble = null;
    single = null;
  }
  if (single == null) avisos.push("Single: No cotizado (no se infiere desde la tarifa doble sin suplemento explícito).");
  return { moneda: monedas.size === 1 ? [...monedas][0] : null, porPersonaDoble: doble, porPersonaSingle: single, costoTotal: total, vigenteHasta, confianza, avisos };
}

// ── Vigencia ──────────────────────────────────────────────────────────────────

export type EstadoVigencia = "vigente" | "por_vencer" | "vencida";

export function estadoVigencia(vigenteHasta: Date, ahora: Date): EstadoVigencia {
  const resta = vigenteHasta.getTime() - ahora.getTime();
  if (resta < 0) return "vencida";
  if (resta < POR_VENCER_MS) return "por_vencer";
  return "vigente";
}

/** Vigencia de un presupuesto = el MÍNIMO de sus ofertas asignadas (spec §3.4/§4). */
export function vigenciaPresupuesto(vigencias: ReadonlyArray<Date>): Date | null {
  if (vigencias.length === 0) return null;
  return vigencias.reduce((min, d) => (d < min ? d : min));
}

/** Horas transcurridas desde la captura (para mostrar "capturado hace 3 h"). */
export function horasDesdeCaptura(capturadoEn: Date | InstanteISO, ahora: Date): number {
  const t = typeof capturadoEn === "string" ? Date.parse(capturadoEn) : capturadoEn.getTime();
  return Math.max(0, Math.floor((ahora.getTime() - t) / 3_600_000));
}
