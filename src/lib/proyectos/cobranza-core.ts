/**
 * Cobranza de un proyecto: UNA sola fuente de verdad para «cobrado», «saldo» y «por cobrar».
 *
 * Regla: lo cobrado son los cobros registrados (`ProyectoPago`) no anulados; lo que se debe cobrar es el total del
 * presupuesto APROBADO (en pesos, con IVA). Las cuotas del cashflow son el calendario: dicen CUÁNDO se espera la plata
 * (vencido, en 7 días), nunca CUÁNTO se cobró. Toda pantalla que muestre cobrado / saldo / por cobrar de un proyecto,
 * de un cliente o del negocio sale de acá (caja «Cobros», «Estado financiero», ficha y lista de clientes, Rentabilidad,
 * Administración, Dirección). PURA: sin base, sin red.
 */
import { redondear, totales } from "./core";
import { resumenCuotas, ventaTotalItem, type CuotaLeida, type ResumenCuotas } from "./gestion-core";

/** Lo mínimo de un ítem para saber cuánto se le vende al cliente (precio fijo en pesos, o costo + recargo). */
export interface ItemVendible {
  cantidad: number;
  costo: number;
  precio: number;
  moneda: string;
  recargoPct: number | null;
}

export interface PresupuestoAprobado {
  ivaPct: number;
  items: readonly ItemVendible[];
}

/** El total con IVA, en pesos, del presupuesto aprobado; 0 si no hay. Mismo cálculo que la caja «Cobros». PURA. */
export function totalAprobado(aprobado: PresupuestoAprobado | null | undefined, tc: Readonly<Record<string, number>>, recargoGeneral: number): number {
  if (!aprobado) return 0;
  const enPesos = aprobado.items.map((i) => ({ cantidad: 1, costo: 0, precio: ventaTotalItem(i, tc, recargoGeneral) }));
  return totales(enPesos, aprobado.ivaPct).total;
}

export interface CobroRegistrado {
  monto: number;
  anuladoEl?: Date | null;
}

export interface Cobranza {
  /** Total aprobado, con IVA, en pesos. */
  total: number;
  /** Cobros registrados no anulados. */
  cobrado: number;
  /** total − cobrado. Negativo = se cobró de más (saldo a favor del cliente). */
  saldo: number;
  /** Lo que falta cobrar: el saldo, nunca negativo. */
  porCobrar: number;
  /** Avance de cobro, 0 a 100. Sin total aprobado y con cobros, 100. */
  avancePct: number;
}

/** Cobrado, saldo y por cobrar de un proyecto. PURA. */
export function cobranza(total: number, cobros: readonly CobroRegistrado[]): Cobranza {
  const t = redondear(Math.max(0, total));
  const cobrado = redondear(cobros.reduce((s, c) => (c.anuladoEl ? s : s + c.monto), 0));
  const saldo = redondear(t - cobrado);
  const porCobrar = Math.max(0, saldo);
  const avancePct = t > 0 ? redondear(Math.min(100, (cobrado / t) * 100)) : cobrado > 0 ? 100 : 0;
  return { total: t, cobrado, saldo, porCobrar, avancePct };
}

/**
 * Pone el lado de los cobros de un resumen de cuotas (de UN proyecto) en línea con los cobros registrados: cobrado y
 * a cobrar salen de la cobranza; lo vencido y lo de los próximos 7 días siguen saliendo del calendario de cuotas, pero
 * nunca pueden pasar de lo que falta cobrar. Los pagos a proveedores no se tocan. PURA.
 */
export function conciliarConCobros(r: ResumenCuotas, c: Cobranza): ResumenCuotas {
  const cobrosVencidos = redondear(Math.min(r.cobrosVencidos, c.porCobrar));
  return {
    ...r,
    cobrado: c.cobrado,
    aCobrar: c.porCobrar,
    aCobrar7: redondear(Math.min(r.aCobrar7, c.porCobrar)),
    cobrosVencidos,
    cantCobrosVencidos: cobrosVencidos > 0 ? r.cantCobrosVencidos : 0,
  };
}

const CLAVES = ["aCobrar", "aCobrar7", "cobrosVencidos", "cantCobrosVencidos", "aPagar", "aPagar7", "pagosVencidos", "cantPagosVencidos", "cobrado", "pagado"] as const;

/**
 * El resumen del negocio entero: cada proyecto con cobranza se concilia con sus cobros (aunque no tenga cuotas: lo
 * aprobado y no cobrado se debe igual); las cuotas sin proyecto (de la empresa) o de un proyecto sin cobranza se
 * cuentan como vienen. PURA.
 */
export function resumenConCobranza(
  cuotas: readonly (CuotaLeida & { proyectoId?: string | null })[],
  tc: Readonly<Record<string, number>>,
  cobranzas: ReadonlyMap<string, Cobranza>,
  hoy: Date = new Date(),
): ResumenCuotas {
  const porProyecto = new Map<string, CuotaLeida[]>();
  const sueltas: CuotaLeida[] = [];
  for (const c of cuotas) {
    if (c.proyectoId && cobranzas.has(c.proyectoId)) porProyecto.set(c.proyectoId, [...(porProyecto.get(c.proyectoId) ?? []), c]);
    else sueltas.push(c);
  }
  const total = resumenCuotas(sueltas, tc, hoy);
  for (const [id, cob] of cobranzas) {
    const r = conciliarConCobros(resumenCuotas(porProyecto.get(id) ?? [], tc, hoy), cob);
    for (const k of CLAVES) total[k] += r[k];
  }
  for (const k of CLAVES) total[k] = redondear(total[k]);
  return total;
}
