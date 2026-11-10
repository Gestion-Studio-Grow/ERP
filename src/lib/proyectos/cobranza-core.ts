/**
 * Cobranza de un proyecto: UNA sola fuente de verdad para «cobrado», «saldo» y «por cobrar».
 *
 * Regla: lo cobrado son los cobros registrados (`ProyectoPago`) no anulados; lo que se debe cobrar es el total del
 * presupuesto APROBADO (en pesos, con IVA). Las cuotas del cashflow son el calendario: dicen CUÁNDO se espera la plata
 * (vencido, en 7 días), nunca CUÁNTO se cobró. Toda pantalla que muestre cobrado / saldo / por cobrar de un proyecto,
 * de un cliente o del negocio sale de acá (caja «Cobros», «Estado financiero», ficha y lista de clientes, Rentabilidad,
 * Administración, Dirección). PURA: sin base, sin red.
 *
 * Proyecto vendido en otra moneda (USD): lo que se debe está en esa moneda, no en pesos. El saldo se calcula EN SU
 * MONEDA (total aprobado ÷ cambio de venta, contra lo que el cliente pagó en esa moneda: el monto de la cuota unida al
 * cobro por el enlace «Asiento»; un cobro suelto, en pesos, se pasa con el cambio de hoy) y recién al final se pasa a
 * pesos con el tipo de cambio VIGENTE (`cobranzaEnMoneda`). Así, si el dólar se mueve, la deuda en pesos se mueve con
 * él, pero un cliente que pagó sus dólares completos debe cero.
 */
import { redondear, totales } from "./core";
import { aPesos, enMonedaDeVenta, resumenCuotas, ventaTotalItem, type CuotaLeida, type ResumenCuotas } from "./gestion-core";

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
  /** En pesos, como quedó asentado en la caja. */
  monto: number;
  anuladoEl?: Date | null;
  /** Si salió de una cuota en otra moneda: lo que pagó el cliente en esa moneda (enlace «Asiento» cuota↔cobro). */
  original?: { monto: number; moneda: string } | null;
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
  /** Proyecto en otra moneda: la cuenta hecha en esa moneda; los campos de arriba son esto × `tc` (el de hoy). */
  enMoneda?: { moneda: string; tc: number; total: number; cobrado: number; saldo: number };
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

/** «1234.5 USD»: lo que pagó el cliente en su moneda, guardado en el enlace «Asiento» (campo `antes`). PURA. */
export function leerOriginal(texto: string | null | undefined): { monto: number; moneda: string } | null {
  const m = /^(\d+(?:\.\d+)?) ([A-Z]{3})$/.exec(texto ?? "");
  return m ? { monto: Number(m[1]), moneda: m[2] } : null;
}

export interface VentaEnMoneda {
  /** Moneda del proyecto. */
  moneda: string;
  /** Pesos por unidad con que se vendió (`cambioDeVenta`): pasa el total aprobado a la moneda del cliente. */
  cambioVenta: number;
  /** Pesos por unidad HOY: pasa lo cobrado en pesos a la moneda y el saldo de vuelta a pesos. */
  tcHoy: number;
}

/**
 * Cobranza de un proyecto en su moneda (ver arriba). En pesos, o sin cambio de venta o de hoy, es `cobranza` (en pesos,
 * como antes: sin tipo de cambio no hay cómo pasar). PURA.
 */
export function cobranzaEnMoneda(totalEnPesos: number, cobros: readonly CobroRegistrado[], v: VentaEnMoneda): Cobranza {
  const { moneda, cambioVenta, tcHoy } = v;
  if (moneda === "ARS" || !(cambioVenta > 0) || !(tcHoy > 0)) return cobranza(totalEnPesos, cobros);
  const total = enMonedaDeVenta(Math.max(0, totalEnPesos), cambioVenta);
  const cobrado = cobros.reduce((s, c) => (c.anuladoEl ? s : s + (c.original?.moneda === moneda ? c.original.monto : c.monto / tcHoy)), 0);
  const m = cobranza(total, [{ monto: cobrado }]);
  const saldo = redondear(m.saldo * tcHoy);
  return {
    total: redondear(m.total * tcHoy),
    cobrado: redondear(m.cobrado * tcHoy),
    saldo,
    porCobrar: Math.max(0, saldo),
    avancePct: m.avancePct,
    enMoneda: { moneda, tc: tcHoy, total: m.total, cobrado: m.cobrado, saldo: m.saldo },
  };
}

/**
 * Lo que falta cobrar de cada cuota, en su moneda y alineado con `cuotas` (pagada, anulada o sin precio en pesos: lo de
 * siempre; un pago a proveedor, su monto). Lo cobrado que no salió de una cuota (un cobro manual) se aplica a las cuotas
 * de cobro pendientes MÁS VIEJAS: lo que las cuotas pendientes suman por encima de lo que falta cobrar ya entró. Así cada
 * renglón suma lo mismo que el total y «Marcar cobrado» cobra sólo lo que falta. Sin presupuesto aprobado no hay contra
 * qué medir: las cuotas valen lo que dicen. PURA.
 */
export function pendientesDeCobro(cuotas: readonly CuotaLeida[], tc: Readonly<Record<string, number>>, c: Cobranza): number[] {
  const pend = cuotas.map((q) => (q.anuladoEl || q.pagadoEl ? 0 : q.monto));
  if (!(c.total > 0)) return pend;
  const enPesos = cuotas.map((q) => aPesos(q.monto, q.moneda, tc));
  const cobros = cuotas
    .map((_, i) => i)
    .filter((i) => cuotas[i].tipo === "COBRO" && pend[i] > 0 && enPesos[i] > 0)
    .sort((a, b) => cuotas[a].venceEl.getTime() - cuotas[b].venceEl.getTime());
  let yaEntro = redondear(cobros.reduce((s, i) => s + enPesos[i], 0) - c.porCobrar);
  for (const i of cobros) {
    if (yaEntro <= 0) break;
    const aplicado = Math.min(enPesos[i], yaEntro);
    yaEntro = redondear(yaEntro - aplicado);
    pend[i] = aplicado >= enPesos[i] ? 0 : redondear((cuotas[i].monto * (enPesos[i] - aplicado)) / enPesos[i]);
  }
  return pend;
}

/**
 * El resumen de cuotas de UN proyecto en línea con sus cobros registrados: cobrado y a cobrar salen de la cobranza; lo
 * vencido y lo de los próximos 7 días, del calendario de cuotas con lo que falta de cada una (`pendientesDeCobro`), y
 * juntos nunca pasan de lo que falta cobrar. Los pagos a proveedores no se tocan. PURA.
 */
export function conciliarConCobros(cuotas: readonly CuotaLeida[], tc: Readonly<Record<string, number>>, c: Cobranza, hoy: Date = new Date()): ResumenCuotas {
  const pend = pendientesDeCobro(cuotas, tc, c);
  const ajustadas = cuotas.flatMap((q, i) => (q.tipo !== "COBRO" || q.anuladoEl || q.pagadoEl ? [q] : pend[i] > 0 ? [{ ...q, monto: pend[i] }] : []));
  const r = resumenCuotas(ajustadas, tc, hoy);
  const cobrosVencidos = redondear(Math.min(r.cobrosVencidos, c.porCobrar));
  return {
    ...r,
    cobrado: c.cobrado,
    aCobrar: c.porCobrar,
    aCobrar7: redondear(Math.max(0, Math.min(r.aCobrar7, c.porCobrar - cobrosVencidos))),
    cobrosVencidos,
    cantCobrosVencidos: cobrosVencidos > 0 ? r.cantCobrosVencidos : 0,
  };
}

/** `pendientesDeCobro` de las cuotas del negocio entero, alineado con `cuotas`: cada proyecto con su cobranza. PURA. */
export function pendientesDelNegocio(
  cuotas: readonly (CuotaLeida & { proyectoId?: string | null })[],
  tc: Readonly<Record<string, number>>,
  cobranzas: ReadonlyMap<string, Cobranza>,
): number[] {
  const salida = cuotas.map((q) => (q.anuladoEl || q.pagadoEl ? 0 : q.monto));
  const porProyecto = new Map<string, number[]>();
  cuotas.forEach((q, i) => {
    if (q.proyectoId && cobranzas.has(q.proyectoId)) porProyecto.set(q.proyectoId, [...(porProyecto.get(q.proyectoId) ?? []), i]);
  });
  for (const [id, idx] of porProyecto) {
    const pend = pendientesDeCobro(idx.map((i) => cuotas[i]), tc, cobranzas.get(id)!);
    idx.forEach((i, j) => (salida[i] = pend[j]));
  }
  return salida;
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
    const r = conciliarConCobros(porProyecto.get(id) ?? [], tc, cob, hoy);
    for (const k of CLAVES) total[k] += r[k];
  }
  for (const k of CLAVES) total[k] = redondear(total[k]);
  return total;
}
