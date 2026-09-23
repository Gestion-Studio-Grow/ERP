// ============================================================================
// MERMA Y FALTANTE DE LA SEMANA — clasificar los AJUSTE del ledger. PURO.
// ============================================================================
//
// POR QUÉ. Las mermas se registran bien (motivo obligatorio, adjustment-core.ts), pero no hay
// dónde verlas juntas: Ajustes muestra los últimos 15 movimientos y nada más. Y sumar los
// AJUSTE de la semana da un número que no significa nada, porque bajo ese mismo tipo viven
// cinco cosas distintas:
//
//   · la merma declarada (Merma, Vencimiento, Rotura): un hecho del oficio;
//   · la diferencia de un recuento, que puede ser FALTANTE (el sistema tenía más de lo que
//     hay) o SOBRANTE: el faltante es lo que el dueño tiene que mirar, y no se suma a la
//     merma, porque la merma tiene explicación y el faltante no;
//   · la corrección libre (Otro), con signo;
//   · la devolución de una venta anulada o de un pedido reajustado al peso real: vuelve
//     mercadería a la heladera como AJUSTE positivo porque el enum de stock no tiene un tipo
//     propio para eso (order-anulacion.ts). Contarla como sobrante escondería faltantes;
//   · el "Stock inicial" de un alta (alta-producto.ts): no es pérdida ni ganancia.
//
// LA REGLA. Las devoluciones se reconocen por el PREFIJO de `createdBy`, que escriben
// order-anulacion.ts y order-actions.ts con constantes exportadas (importadas acá, no
// re-tipeadas): el texto del `reason` es para leer, no para decidir. El resto se reconoce por
// la etiqueta del motivo al principio del `reason`, que es `buildReason` = `motivoLabel` +
// " — nota" (adjustment-core.ts). Lo que no se reconoce cae en OTRO, que se muestra aparte y
// con signo: no se pierde, y no se mezcla con la merma.
//
// VALUACIÓN. Cada movimiento se valúa con el costo GUARDADO EN SU FILA (`unitCost`): desde la
// ola 2 el ledger estampa el costo vigente en toda salida y los ajustes lo graban al
// registrarse, así que la merma del martes vale lo que costaba el martes. Los movimientos
// viejos, sin costo en la fila, caen al costo vigente de hoy (stock/costo.ts), que es lo que
// muestra la pantalla de Stock. Un corte sin ninguno de los dos se marca "sin costo" y NO se
// valúa en $0: un cero en la columna de pesos diría "no perdiste nada", y lo que pasa es que
// no se sabe.

import { buildReason, motivoLabel } from "@/lib/stock/adjustment-core";
import { ANULACION_VENTA_ACTOR_PREFIX, EDICION_ACTOR_PREFIX } from "@/lib/order-anulacion";
import { MOTIVO_STOCK_INICIAL } from "@/lib/stock/alta-producto";

// ── Qué se lee ──────────────────────────────────────────────────────────────

/**
 * Los AJUSTE de un período `[desde, hasta)` (sin `hasta`, hasta hoy). Es el MISMO `where` para
 * el tablero de merma de Stock (merma-loader.ts) y para el número de Mermas del Inicio: los dos
 * leen estas filas y las clasifican con `clasificarAjuste`. PURA.
 */
export function whereAjustesDelPeriodo(tenantId: string, desde: Date, hasta?: Date) {
  return { tenantId, type: "AJUSTE" as const, createdAt: hasta ? { gte: desde, lt: hasta } : { gte: desde } };
}

// ── Clasificar un movimiento ────────────────────────────────────────────────

export type ClaseDeAjuste = "MERMA" | "FALTANTE" | "SOBRANTE" | "OTRO" | "EXCLUIDO";
export type MotivoDeMerma = "Merma" | "Vencimiento" | "Rotura" | "Decomiso" | "Consumo interno" | "Degustación";
export type PorQueExcluido = "devolucion-anulacion" | "devolucion-edicion" | "stock-inicial" | "sin-diferencia";

export type MovimientoDeAjuste = {
  productId: string | null;
  /** Firmado, como en el ledger: − sale, + entra. */
  qty: number;
  reason: string | null;
  createdBy: string;
  /** Costo guardado en la fila (desde la ola 2). Si falta, se usa el costo vigente del producto. */
  unitCost?: number | null;
};

export type Clasificacion =
  | { clase: "MERMA"; motivo: MotivoDeMerma }
  | { clase: "FALTANTE" | "SOBRANTE" | "OTRO" }
  | { clase: "EXCLUIDO"; porQue: PorQueExcluido };

// Los motivos de perecederos (decomiso, consumo interno, degustación) también son merma
// declarada: la mercadería se fue por una razón conocida. Las etiquetas salen de
// `motivoLabel`, no se re-tipean.
export const MOTIVOS_DE_MERMA: readonly MotivoDeMerma[] = [
  motivoLabel("MERMA") as MotivoDeMerma,
  motivoLabel("VENCIMIENTO") as MotivoDeMerma,
  motivoLabel("ROTURA") as MotivoDeMerma,
  motivoLabel("DECOMISO") as MotivoDeMerma,
  motivoLabel("CONSUMO_INTERNO") as MotivoDeMerma,
  motivoLabel("DEGUSTACION") as MotivoDeMerma,
];
const RECUENTO = motivoLabel("RECUENTO");

// El separador entre la etiqueta y la nota, sacado de `buildReason` mismo: si algún día
// cambia allá, acá no queda un texto viejo que deje de reconocer las mermas.
const SEPARADOR_DE_NOTA = buildReason("OTRO", "x").slice(motivoLabel("OTRO").length, -1);

/** La etiqueta del motivo: lo que va antes de la nota en `buildReason`. */
function etiquetaDe(reason: string | null): string {
  return String(reason ?? "").split(SEPARADOR_DE_NOTA)[0].trim();
}

/** Qué es un AJUSTE del ledger, para el tablero de merma. PURA. */
export function clasificarAjuste(m: MovimientoDeAjuste): Clasificacion {
  const actor = String(m.createdBy ?? "");
  if (actor.startsWith(ANULACION_VENTA_ACTOR_PREFIX)) return { clase: "EXCLUIDO", porQue: "devolucion-anulacion" };
  if (actor.startsWith(EDICION_ACTOR_PREFIX)) return { clase: "EXCLUIDO", porQue: "devolucion-edicion" };

  const etiqueta = etiquetaDe(m.reason);
  if (etiqueta === MOTIVO_STOCK_INICIAL) return { clase: "EXCLUIDO", porQue: "stock-inicial" };
  if (!(m.qty !== 0 && Number.isFinite(m.qty))) return { clase: "EXCLUIDO", porQue: "sin-diferencia" };

  if (etiqueta === RECUENTO) return { clase: m.qty < 0 ? "FALTANTE" : "SOBRANTE" };
  const motivo = MOTIVOS_DE_MERMA.find((x) => x === etiqueta);
  // Una "merma" que SUMA stock no es merma (el formulario siempre la resta): se muestra en
  // OTRO, con su signo, en vez de restarle a la merma de la semana.
  if (motivo && m.qty < 0) return { clase: "MERMA", motivo };
  return { clase: "OTRO" };
}

// ── Costo y unidad ──────────────────────────────────────────────────────────

/** ¿Se cuenta en kilos? Por la forma de venta, o por la unidad escrita si es un kilo. */
export function esKilo(p: { saleUnit?: string | null; unit?: string | null }): boolean {
  if (p.saleUnit === "WEIGHT") return true;
  return /^(kg|kgs|kilo|kilos|kilogramos?)$/i.test(String(p.unit ?? "").trim());
}

// ── Resumir la semana ───────────────────────────────────────────────────────

export type ProductoDeMerma = { nombre: string; unidad: string; saleUnit: string | null; costo: number | null };

/** Un renglón del tablero. Cantidades en magnitud (salvo OTRO, que es neto con signo). */
export type Renglon = {
  kg: number;
  unidades: number;
  /** Pesos a costo de los movimientos CON costo. */
  pesos: number;
  movimientos: number;
  /** Cuántos movimientos no se pudieron valuar. Si son todos, la UI dice "sin costo". */
  sinCosto: number;
};

export type CortePerdedor = {
  productId: string;
  nombre: string;
  kilo: boolean;
  merma: number;
  faltante: number;
  /** Merma + faltante a costo; null si el corte no tiene costo. */
  pesos: number | null;
};

export type ResumenDeMerma = {
  merma: Renglon;
  mermaPorMotivo: Record<MotivoDeMerma, { kg: number; unidades: number }>;
  faltante: Renglon;
  sobrante: Renglon;
  otro: Renglon;
  excluidos: Record<PorQueExcluido, number>;
  /** Los 5 que más pierden (merma + faltante) en pesos, entre los que tienen costo. */
  top: CortePerdedor[];
  /** Cortes con pérdida que no se pueden ordenar por pesos: sin costo. Se nombran aparte. */
  perdidaSinCosto: CortePerdedor[];
};

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const r2 = (n: number) => Math.round(n * 100) / 100;

function renglonVacio(): Renglon {
  return { kg: 0, unidades: 0, pesos: 0, movimientos: 0, sinCosto: 0 };
}

function sumar(r: Renglon, cantidad: number, kilo: boolean, costo: number | null) {
  r.movimientos++;
  if (kilo) r.kg = r3(r.kg + cantidad);
  else r.unidades = r3(r.unidades + cantidad);
  if (costo === null) r.sinCosto++;
  else r.pesos = r2(r.pesos + cantidad * costo);
}

/** ¿El renglón tiene pesos para mostrar? Si ningún movimiento tenía costo, no: es "sin costo". */
export function renglonSinCosto(r: Renglon): boolean {
  return r.movimientos > 0 && r.sinCosto === r.movimientos;
}

export const TOP_CORTES = 5;

/**
 * Arma el tablero de la semana a partir de los AJUSTE del período y los productos
 * (nombre, unidad y costo VIGENTE, stock/costo.ts). PURA.
 */
export function resumirMerma(
  movimientos: readonly MovimientoDeAjuste[],
  productos: ReadonlyMap<string, ProductoDeMerma>,
): ResumenDeMerma {
  const out: ResumenDeMerma = {
    merma: renglonVacio(),
    mermaPorMotivo: Object.fromEntries(MOTIVOS_DE_MERMA.map((m) => [m, { kg: 0, unidades: 0 }])) as Record<
      MotivoDeMerma,
      { kg: number; unidades: number }
    >,
    faltante: renglonVacio(),
    sobrante: renglonVacio(),
    otro: renglonVacio(),
    excluidos: { "devolucion-anulacion": 0, "devolucion-edicion": 0, "stock-inicial": 0, "sin-diferencia": 0 },
    top: [],
    perdidaSinCosto: [],
  };
  const porCorte = new Map<string, CortePerdedor>();

  for (const m of movimientos) {
    const c = clasificarAjuste(m);
    if (c.clase === "EXCLUIDO") {
      out.excluidos[c.porQue]++;
      continue;
    }
    const p = m.productId ? productos.get(m.productId) : undefined;
    const kilo = p ? esKilo({ saleUnit: p.saleUnit, unit: p.unidad }) : false;
    const costo = m.unitCost != null && m.unitCost > 0 ? m.unitCost : (p?.costo ?? null);
    const magnitud = Math.abs(m.qty);

    if (c.clase === "OTRO") {
      // Neto con signo: una corrección que suma y otra que resta se compensan, como en el stock.
      sumar(out.otro, m.qty, kilo, costo);
      continue;
    }
    if (c.clase === "SOBRANTE") {
      sumar(out.sobrante, magnitud, kilo, costo);
      continue;
    }
    sumar(c.clase === "MERMA" ? out.merma : out.faltante, magnitud, kilo, costo);
    if (c.clase === "MERMA") {
      const pm = out.mermaPorMotivo[c.motivo];
      if (kilo) pm.kg = r3(pm.kg + magnitud);
      else pm.unidades = r3(pm.unidades + magnitud);
    }

    if (!m.productId) continue; // producto borrado: cuenta en el total, no tiene fila propia
    const corte =
      porCorte.get(m.productId) ??
      ({ productId: m.productId, nombre: p?.nombre ?? "Producto borrado", kilo, merma: 0, faltante: 0, pesos: costo === null ? null : 0 } as CortePerdedor);
    if (c.clase === "MERMA") corte.merma = r3(corte.merma + magnitud);
    else corte.faltante = r3(corte.faltante + magnitud);
    if (corte.pesos !== null && costo !== null) corte.pesos = r2(corte.pesos + magnitud * costo);
    porCorte.set(m.productId, corte);
  }

  const cortes = [...porCorte.values()];
  out.top = cortes
    .filter((c) => c.pesos !== null)
    .sort((a, b) => (b.pesos ?? 0) - (a.pesos ?? 0) || a.nombre.localeCompare(b.nombre, "es"))
    .slice(0, TOP_CORTES);
  out.perdidaSinCosto = cortes
    .filter((c) => c.pesos === null)
    .sort((a, b) => b.merma + b.faltante - (a.merma + a.faltante) || a.nombre.localeCompare(b.nombre, "es"));
  return out;
}

// ── La semana, en hora del negocio ──────────────────────────────────────────

const DIA = /^\d{4}-\d{2}-\d{2}$/;

/** Suma días a una fecha de calendario "YYYY-MM-DD", anclada al mediodía UTC (no cruza medianoche). */
export function sumarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export type Semana = {
  /** Primer día incluido (YYYY-MM-DD, hora del negocio). */
  desde: string;
  /** Último día incluido. */
  hasta: string;
  /** `hasta` de la semana anterior, para el enlace "‹". */
  anterior: string;
  /** `hasta` de la semana siguiente, o null si ya es la que termina hoy. */
  siguiente: string | null;
  esLaActual: boolean;
};

/**
 * Los 7 días que terminan en `hasta` (incluido). Sin `hasta`, o con uno inválido o futuro,
 * son los últimos 7 días hasta hoy. `hoy` es la fecha en hora del negocio
 * (`todayInBusinessTz`): se pasa de afuera para que esto sea puro.
 */
export function semanaHasta(hasta: string | null | undefined, hoy: string): Semana {
  // Ida y vuelta por Date: "2026-02-30" es una fecha que V8 acepta y corre al 2 de marzo
  // (medido con node); si no vuelve igual, no es un día del calendario y se ignora.
  const valido =
    typeof hasta === "string" &&
    DIA.test(hasta) &&
    !Number.isNaN(Date.parse(`${hasta}T12:00:00Z`)) &&
    sumarDias(hasta, 0) === hasta;
  const fin = valido && hasta! < hoy ? hasta! : hoy;
  const siguiente = fin === hoy ? null : sumarDias(fin, 7) > hoy ? hoy : sumarDias(fin, 7);
  return { desde: sumarDias(fin, -6), hasta: fin, anterior: sumarDias(fin, -7), siguiente, esLaActual: fin === hoy };
}

// ── Cortes en negativo ──────────────────────────────────────────────────────

/**
 * Los cortes con stock bajo cero, del más negativo al menos. Un negativo es una venta que
 * salió con más de lo que el sistema creía que había (el paquete en la mano pesaba más):
 * hay que recontar ese corte, y por eso va primero en Inventario.
 */
export function cortesEnNegativo<T extends { stock: number; name: string }>(filas: readonly T[]): T[] {
  return filas.filter((f) => f.stock < 0).sort((a, b) => a.stock - b.stock || a.name.localeCompare(b.name, "es"));
}
