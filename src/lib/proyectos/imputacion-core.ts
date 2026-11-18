// ============================================================================
// Imputación de un comprobante (MIA-50 T05 · O28): cada línea va a un proyecto o a administración, con su categoría de
// la lista del negocio (`costos.*`). La suma de las líneas es el comprobante al centavo, o no se guarda. PURO.
// ============================================================================

import { textoAlCentavo } from "@/lib/dinero/redondeo";
import { costoDeLinea, type TratamientoIva } from "./comprobantes-core";

export type Destino = "PROYECTO" | "ADMINISTRACION";

export interface LineaEntrada {
  destino: Destino;
  proyectoId: string | null;
  sector: string | null;
  categoria: string;
  detalle: string;
  netoCentavos: number;
  ivaCentavos: number;
  ivaTratamiento: TratamientoIva;
  ivaProvisional: boolean;
}

export interface Listas {
  sectores: readonly string[];
  categorias: readonly string[];
  categoriasAdministracion: readonly string[];
}

/**
 * Reparte un IVA entre netos, en proporción y al centavo: lo que sobra del redondeo va a las líneas con más resto,
 * así la suma da exacto. Sin neto (todo en cero), va entero a la primera. PURA.
 */
export function repartirIva(ivaCentavos: number, netos: readonly number[]): number[] {
  if (netos.length === 0) return [];
  const base = netos.reduce((s, n) => s + n, 0);
  if (base <= 0) return netos.map((_, i) => (i === 0 ? ivaCentavos : 0));
  const crudos = netos.map((n) => (ivaCentavos * n) / base);
  const partes = crudos.map(Math.floor);
  let falta = ivaCentavos - partes.reduce((s, n) => s + n, 0);
  const porResto = crudos.map((c, i) => ({ i, resto: c - Math.floor(c) })).sort((x, y) => y.resto - x.resto || x.i - y.i);
  for (const { i } of porResto) {
    if (falta <= 0) break;
    partes[i] += 1;
    falta -= 1;
  }
  return partes;
}

/** Lo que falta imputar: el total menos neto + IVA de las líneas. PURA. */
export const faltaImputar = (totalCentavos: number, lineas: readonly { netoCentavos: number; ivaCentavos: number }[]): number =>
  totalCentavos - lineas.reduce((s, l) => s + l.netoCentavos + l.ivaCentavos, 0);

/** Valida la imputación entera contra la cabecera y las listas del negocio. `null` = se puede guardar. PURA. */
export function errorDeImputacion(comprobante: { netoCentavos: number; ivaCentavos: number }, lineas: readonly LineaEntrada[], listas: Listas): string | null {
  if (lineas.length === 0) return "Agregá al menos una línea.";
  if (lineas.length > 40) return "Hasta 40 líneas por comprobante.";
  for (const [i, l] of lineas.entries()) {
    const n = `Línea ${i + 1}`;
    if (l.destino === "PROYECTO" && !l.proyectoId) return `${n}: elegí el proyecto.`;
    if (l.destino === "ADMINISTRACION" && l.proyectoId) return `${n}: una línea de administración no lleva proyecto.`;
    const lista = l.destino === "PROYECTO" ? listas.categorias : listas.categoriasAdministracion;
    if (!lista.includes(l.categoria)) return `${n}: la categoría «${l.categoria || "sin elegir"}» no está en la lista del negocio (Configuración › Parámetros › Costos).`;
    if (l.sector && !listas.sectores.includes(l.sector)) return `${n}: el sector «${l.sector}» no está en la lista del negocio.`;
    if (!(l.netoCentavos >= 0) || !(l.ivaCentavos >= 0) || !Number.isInteger(l.netoCentavos) || !Number.isInteger(l.ivaCentavos)) return `${n}: el importe no es válido.`;
    if (l.netoCentavos + l.ivaCentavos === 0) return `${n}: tiene importe cero; borrala.`;
  }
  const neto = lineas.reduce((s, l) => s + l.netoCentavos, 0);
  const iva = lineas.reduce((s, l) => s + l.ivaCentavos, 0);
  if (neto !== comprobante.netoCentavos || iva !== comprobante.ivaCentavos) {
    const falta = comprobante.netoCentavos + comprobante.ivaCentavos - neto - iva;
    return `Las líneas no suman el comprobante al centavo (falta imputar ${textoAlCentavo(falta / 100).replace(".", ",")}). No se guardó nada.`;
  }
  return null;
}

/** La fila que se guarda, con su costo calculado (la base lo vuelve a chequear con un CHECK). PURA. */
export const filaDeLinea = (l: LineaEntrada, orden: number) => ({ ...l, orden, costoCentavos: costoDeLinea(l.netoCentavos, l.ivaCentavos, l.ivaTratamiento) });

/**
 * Lo imputado a cada proyecto: costo (lo que suma al costo real), y su parte pagada y por pagar, en proporción a lo que
 * se pagó del comprobante. Los comprobantes anulados no cuentan. En centavos. PURA.
 */
export function imputadoPorProyecto(
  comprobantes: readonly { totalCentavos: number; pagadoCentavos: number; anulado: boolean; lineas: readonly { proyectoId: string | null; netoCentavos: number; ivaCentavos: number; costoCentavos: number }[] }[],
): Map<string, { costo: number; pagado: number; porPagar: number }> {
  const m = new Map<string, { costo: number; pagado: number; porPagar: number }>();
  for (const c of comprobantes) {
    if (c.anulado || c.totalCentavos <= 0) continue;
    const proporcion = Math.min(1, Math.max(0, c.pagadoCentavos / c.totalCentavos));
    for (const l of c.lineas) {
      if (!l.proyectoId) continue;
      const f = m.get(l.proyectoId) ?? { costo: 0, pagado: 0, porPagar: 0 };
      const total = l.netoCentavos + l.ivaCentavos;
      const pagado = Math.round(total * proporcion);
      f.costo += l.costoCentavos;
      f.pagado += pagado;
      f.porPagar += total - pagado;
      m.set(l.proyectoId, f);
    }
  }
  return m;
}
