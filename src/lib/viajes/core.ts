// ============================================================================
// PRESUPUESTOS DE VIAJE — core PURO del snapshot de oferta (sin Prisma, sin red).
// ============================================================================
//
// El "armador de presupuestos" arma un presupuesto con OPCIONES (vuelos/hoteles) que
// el operador eligió de una búsqueda. Cada opción es un SNAPSHOT: el precio se
// CONGELA tal como se capturó, con su moneda, su BASE DE OCUPACIÓN, su fecha/hora de
// captura, su vigencia y su proveedor. Después de congelarlo, cambiar el precio del
// proveedor no cambia el presupuesto (es lo que se le mostró al cliente).
//
// INVARIANTE DURA (caso real): ningún precio existe sin `capturadoEn` y sin
// `baseOcupacion` explícita. Confundir precio por habitación con precio por persona
// duplica (o halva) el presupuesto. Se defiende en TRES capas:
//   1. el TIPO (`PrecioOferta`, campos obligatorios),
//   2. este core (`congelarOferta` valida en runtime y lanza `SnapshotInvalidoError`),
//   3. el SCHEMA (`OpcionPresupuestoViaje.capturadoEn` / `baseOcupacion` NOT NULL, sin default).
//
// DINERO (ADR-057): number con 2 decimales en memoria (`round2`); Decimal(14,2) en DB.

import { round2 } from "@/lib/round";
import {
  BASES_OCUPACION,
  type BaseOcupacion,
  type InstanteISO,
  type Moneda,
  type OfertaHotel,
  type OfertaVuelo,
  type PrecioOferta,
} from "@/plugins/ofertas-viaje/port";

export type { BaseOcupacion } from "@/plugins/ofertas-viaje/port";

export type TipoOferta = "VUELO" | "HOTEL";

/** Composición del grupo que viaja — define cuántas unidades de la base se cobran. */
export interface GrupoViaje {
  adultos: number;
  ninos: number;
  habitaciones: number;
}

/** El snapshot congelado de una opción, listo para persistir. */
export interface SnapshotOferta {
  tipo: TipoOferta;
  proveedor: string;
  referenciaProveedor: string | null;
  /** Una línea en criollo para la lista: "AEP → MAD ida y vuelta · AR · sin escalas". */
  descripcion: string;
  /** Payload normalizado completo (la oferta tal como se vio), para el detalle. */
  detalle: OfertaVuelo | OfertaHotel;
  precio: number;
  moneda: Moneda;
  baseOcupacion: BaseOcupacion;
  /** Cuántas unidades de la base se cobran (pasajeros, personas o habitaciones). */
  cantidadBase: number;
  /** precio × cantidadBase, redondeado. */
  precioTotal: number;
  capturadoEn: Date;
  vigenteHasta: Date | null;
}

export class SnapshotInvalidoError extends Error {
  constructor(readonly motivos: string[]) {
    super(`Snapshot inválido: ${motivos.join(" · ")}`);
    this.name = "SnapshotInvalidoError";
  }
}

const RE_MONEDA = /^[A-Z]{3}$/;

/** Tolerancia para `capturadoEn` en el futuro (desfase de relojes). */
const TOLERANCIA_FUTURO_MS = 5 * 60_000;

/**
 * Valida un precio normalizado. Devuelve la lista de motivos (vacía = válido).
 * Chequea EN RUNTIME lo que el tipo ya exige, porque el payload puede venir de un
 * adapter mal escrito o de una carga manual: acá no se confía en nadie.
 */
export function validarPrecio(p: Partial<PrecioOferta> | null | undefined, ahora: Date): string[] {
  const m: string[] = [];
  if (!p) return ["falta el precio"];
  if (typeof p.monto !== "number" || !Number.isFinite(p.monto) || p.monto < 0) m.push("monto inválido");
  if (typeof p.moneda !== "string" || !RE_MONEDA.test(p.moneda)) m.push("moneda inválida (ISO-4217, 3 letras)");
  if (!p.baseOcupacion || !BASES_OCUPACION.includes(p.baseOcupacion)) m.push("falta la base de ocupación");
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

/**
 * Cuántas unidades de la base cobra esta oferta para el grupo. Es LA cuenta que
 * evita el error del caso real: por persona → se multiplica por personas; por
 * habitación → por habitaciones; total → 1.
 */
export function cantidadBasePara(base: BaseOcupacion, grupo: GrupoViaje): number {
  const personas = grupo.adultos + grupo.ninos;
  switch (base) {
    case "POR_PASAJERO":
    case "POR_PERSONA_EN_DOBLE":
    case "POR_PERSONA_EN_SINGLE":
    case "POR_PERSONA_EN_TRIPLE":
      return Math.max(1, personas);
    case "POR_HABITACION":
      return Math.max(1, grupo.habitaciones);
    case "TOTAL":
      return 1;
  }
}

/**
 * Avisos NO bloqueantes sobre la base elegida vs el grupo (p.ej. "por persona en
 * doble" con 3 personas: alguien queda sin compañero de habitación).
 */
export function avisosDeBase(base: BaseOcupacion, grupo: GrupoViaje): string[] {
  const personas = grupo.adultos + grupo.ninos;
  const avisos: string[] = [];
  if (base === "POR_PERSONA_EN_DOBLE" && personas % 2 !== 0) {
    avisos.push("Precio por persona en doble con cantidad impar de personas: revisá si alguien va en single.");
  }
  if (base === "POR_PERSONA_EN_SINGLE" && personas > 1 && grupo.habitaciones < personas) {
    avisos.push("Precio por persona en single: cada persona ocupa su habitación.");
  }
  if (base === "POR_HABITACION" && grupo.habitaciones > 1) {
    avisos.push(`Se multiplica por ${grupo.habitaciones} habitaciones.`);
  }
  return avisos;
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

export interface ContextoCongelar {
  grupo: GrupoViaje;
  ahora: Date;
}

/**
 * CONGELA una oferta en un snapshot. Lanza `SnapshotInvalidoError` si el precio no
 * cumple la invariante (sin fecha de captura o sin base → no entra al sistema).
 */
export function congelarOferta(
  tipo: TipoOferta,
  oferta: OfertaVuelo | OfertaHotel,
  ctx: ContextoCongelar,
): SnapshotOferta {
  const motivos = validarPrecio(oferta?.precio, ctx.ahora);
  if (!oferta?.proveedor) motivos.push("falta el proveedor");
  if (motivos.length) throw new SnapshotInvalidoError(motivos);

  const p = oferta.precio;
  const cantidadBase = cantidadBasePara(p.baseOcupacion, ctx.grupo);
  const precio = round2(p.monto);
  return {
    tipo,
    proveedor: oferta.proveedor,
    referenciaProveedor: oferta.referenciaProveedor || null,
    descripcion: tipo === "VUELO" ? describirVuelo(oferta as OfertaVuelo) : describirHotel(oferta as OfertaHotel),
    detalle: oferta,
    precio,
    moneda: p.moneda,
    baseOcupacion: p.baseOcupacion,
    cantidadBase,
    precioTotal: round2(precio * cantidadBase),
    capturadoEn: new Date(p.capturadoEn),
    vigenteHasta: p.vigenteHasta ? new Date(p.vigenteHasta) : null,
  };
}

export type EstadoVigencia = "vigente" | "vencida" | "sin-vigencia";

/** ¿La opción sigue dentro de la vigencia que informó el proveedor? */
export function estadoVigencia(
  s: Pick<SnapshotOferta, "vigenteHasta">,
  ahora: Date,
): EstadoVigencia {
  if (!s.vigenteHasta) return "sin-vigencia";
  return s.vigenteHasta.getTime() >= ahora.getTime() ? "vigente" : "vencida";
}

/** Totales por moneda de un conjunto de opciones (nunca se suman monedas distintas). */
export function totalesPorMoneda(
  opciones: ReadonlyArray<Pick<SnapshotOferta, "moneda" | "precioTotal">>,
): Array<{ moneda: Moneda; total: number }> {
  const acc = new Map<Moneda, number>();
  for (const o of opciones) acc.set(o.moneda, round2((acc.get(o.moneda) ?? 0) + o.precioTotal));
  return [...acc.entries()].map(([moneda, total]) => ({ moneda, total })).sort((a, b) => a.moneda.localeCompare(b.moneda));
}

/** Horas transcurridas desde la captura (para mostrar "capturado hace 3 h"). */
export function horasDesdeCaptura(capturadoEn: Date | InstanteISO, ahora: Date): number {
  const t = typeof capturadoEn === "string" ? Date.parse(capturadoEn) : capturadoEn.getTime();
  return Math.max(0, Math.floor((ahora.getTime() - t) / 3_600_000));
}
