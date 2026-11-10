/**
 * Cobranza de un proyecto: UNA sola fuente de verdad para «cobrado», «saldo» y «por cobrar». Toda pantalla que muestre
 * cobrado / saldo / por cobrar de un proyecto, de un cliente o del negocio sale de acá. PURA: sin base, sin red.
 *
 * Lo que se debe cobrar es el total del presupuesto APROBADO; lo cobrado, los cobros (`ProyectoPago`) no anulados. Las
 * cuotas son el calendario: dicen CUÁNDO se espera la plata, nunca CUÁNTO se cobró. Una sola regla las une:
 * **la plata suelta descuenta de las cuotas más VIEJAS; el exceso de calendario se recorta de las más NUEVAS.**
 *
 * - Unidad de reparto: pesos de hoy (H) = `aPesos(monto, moneda, tc)`. `porCobrar` ya está en H.
 * - Un cobro es suelto si no tiene una cuota viva marcada: sin `cuotaId`, o con una que no está marcada (huérfano).
 * - Moneda (única conversión): para el saldo del proyecto (moneda M) un cobro vale `original.monto` si
 *   `original.moneda === M`; si no, sus pesos (M = ARS) o pesos / cambio de hoy. Para SU cuota (moneda Q): pesos si
 *   Q = ARS; `original.monto` si `original.moneda === Q`; si no, pesos / tc[Q].
 * - Reparto, por fecha de vencimiento: (1) marcadas: su cobro propio y, lo que les falte, de lo suelto; (2) pendientes:
 *   lo suelto que sobra; (3) tope: de la más vieja a la más nueva, cada pendiente toma lo que le queda hasta agotar
 *   `porCobrar`. Sin aprobado, (2) y (3) no corren: las cuotas valen lo que dicen.
 * - Cobro propio de una marcada: para saber si la cuota quedó COMPLETA cuenta en su moneda (lo que pagó el cliente en
 *   ella, `enlazadoDe`); para lo que VALE (H) cuenta como lo cuenta la cobranza (`CobroDeCuota.hoy`: los pesos asentados,
 *   o el original × cambio de hoy si es la moneda del proyecto). Así, con el dólar que sube o baja, una cuota en USD de
 *   un proyecto en pesos vale los pesos que entraron, y las líneas de cobro del cashflow no pasan del total.
 * - Previstas (`prevista`, sin marcar): una proyección, no plata. Quedan FUERA de la entrada del reparto (no comen el
 *   tope ni la plata suelta) y de vencido / próximos; sólo se muestran, topeadas con lo que les queda a las reales.
 * - Invariantes: Σ pendientes (H) ≤ porCobrar; sin cobros la cuota más vieja conserva su monto; cada peso cobrado se
 *   cuenta una vez; marcar una cuota por su pendiente baja `porCobrar` exactamente eso; vencido + 7 días ≤ porCobrar.
 *   Tolerancias declaradas (centavos de una moneda que no es el peso): I3 en H, hasta 0,01 × tc por cuota en otra
 *   moneda; I4 en un proyecto en USD con cuota en ARS o EUR, hasta 0,01 × tc del USD (el cobrado en USD se redondea al
 *   centavo antes y después de marcar). Cuota en la moneda del proyecto, o proyecto en pesos con cuota en pesos: exacto.
 *
 * Proyecto en otra moneda (USD): el saldo se calcula EN SU MONEDA y recién al final se pasa a pesos con el cambio de
 * HOY (`cobranzaEnMoneda`): si el dólar se mueve la deuda en pesos se mueve con él, y quien pagó sus dólares debe cero.
 */
import { redondear, totales } from "./core";
import { aPesos, enMonedaDeVenta, resumenCuotas, ventaTotalItem, type CuotaLeida, type ResumenCuotas } from "./gestion-core";

/** Una cuota como la lee la cobranza: con `prevista` si se la leyó (las lecturas de Administración ya las filtran). */
export type CuotaDeCobranza = CuotaLeida & { prevista?: boolean | null };

/** Una cuota prevista sin marcar: proyección, no plata. Una sola regla para todos los lectores. PURA. */
export function esPrevista(q: CuotaDeCobranza): boolean {
  return !!q.prevista && !q.pagadoEl;
}

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
  /** La cuota que lo asentó («Marcar cobrado», enlace «Asiento»). Sin cuota marcada: un cobro suelto. */
  cuotaId?: string | null;
}

/** Lo que entró por una cuota marcada: en pesos y, si era en otra moneda, en esa moneda. */
export interface CobroDeCuota {
  pesos: number;
  original?: { monto: number; moneda: string } | null;
  /** Lo que vale en pesos de hoy, como lo cuenta la cobranza (pesos asentados, o original × cambio de hoy si es la moneda
   * del proyecto). Sin él, `pesos`. */
  hoy?: number;
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
  /** Lo cobrado SIN cuota (cobros sueltos, no anulados), en pesos: lo único que se reparte contra las cuotas. */
  sueltos: number;
  /** Lo cobrado por cada cuota marcada, por id de cuota (sólo si hay alguno). */
  deCuotas?: Readonly<Record<string, CobroDeCuota>>;
}

/** Cobros sueltos y cobros por cuota de una lista de cobros registrados; `hoyDe`: lo que vale cada uno en H. PURA. */
function separarCobros(cobros: readonly CobroRegistrado[], hoyDe: (c: CobroRegistrado) => number = (c) => c.monto): Pick<Cobranza, "sueltos" | "deCuotas"> {
  let sueltos = 0;
  const deCuotas: Record<string, CobroDeCuota> = {};
  for (const c of cobros) {
    if (c.anuladoEl) continue;
    if (c.cuotaId) {
      const previo = deCuotas[c.cuotaId];
      const original = c.original && (!previo || previo.original?.moneda === c.original.moneda) ? { monto: (previo?.original?.monto ?? 0) + c.original.monto, moneda: c.original.moneda } : null;
      deCuotas[c.cuotaId] = { pesos: redondear((previo?.pesos ?? 0) + c.monto), original, hoy: redondear((previo?.hoy ?? 0) + hoyDe(c)) };
    } else sueltos += c.monto;
  }
  return { sueltos: redondear(sueltos), ...(Object.keys(deCuotas).length > 0 && { deCuotas }) };
}

/** Cobrado, saldo y por cobrar de un proyecto. PURA. */
export function cobranza(total: number, cobros: readonly CobroRegistrado[]): Cobranza {
  const t = redondear(Math.max(0, total));
  const cobrado = redondear(cobros.reduce((s, c) => (c.anuladoEl ? s : s + c.monto), 0));
  const saldo = redondear(t - cobrado);
  const porCobrar = Math.max(0, saldo);
  const avancePct = t > 0 ? redondear(Math.min(100, (cobrado / t) * 100)) : cobrado > 0 ? 100 : 0;
  return { total: t, cobrado, saldo, porCobrar, avancePct, ...separarCobros(cobros) };
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
    ...separarCobros(cobros, (c) => (c.original?.moneda === moneda ? c.original.monto * tcHoy : c.monto)),
  };
}

/**
 * Por cuota, alineado con las cuotas y en la moneda de cada una: lo que le falta y lo que ya entró por ella. `cobrado` de
 * una cuota de cobro es lo que VALE hoy lo que entró (H pasado a su moneda con el cambio de hoy): una cuota en USD de un
 * proyecto en pesos, cobrada con el dólar a 1000 y leída con el dólar a 1500, muestra los pesos que entraron en USD de hoy.
 */
export interface RepartoDeCobros {
  pendiente: number[];
  cobrado: number[];
}

/**
 * Lo que falta cobrar y lo que ya entró de cada cuota, en su moneda (la regla de arriba). Un pago a proveedor:
 * pendiente o pagado, su monto. PURA.
 */
export function repartoDeCobros(cuotas: readonly CuotaDeCobranza[], tc: Readonly<Record<string, number>>, c: Cobranza): RepartoDeCobros {
  const pendiente = cuotas.map((q) => (q.anuladoEl || q.pagadoEl ? 0 : q.monto));
  const cobrado = cuotas.map((q) => (!q.anuladoEl && q.pagadoEl && q.tipo !== "COBRO" ? q.monto : 0));
  const enPesos = cuotas.map((q) => aPesos(q.monto, q.moneda, tc));
  const vivas = cuotas
    .map((_, i) => i)
    .filter((i) => cuotas[i].tipo === "COBRO" && !cuotas[i].anuladoEl)
    .sort((a, b) => cuotas[a].venceEl.getTime() - cuotas[b].venceEl.getTime());
  // Las previstas sin marcar no entran al reparto: no comen el tope ni la plata suelta de las reales.
  const deCobro = vivas.filter((i) => !esPrevista(cuotas[i]));
  // Suelto: sin cuota, o con una que no está marcada entre las vivas (huérfano: cuota reabierta, anulada o de otro lado).
  const marcadas = new Set(deCobro.filter((i) => cuotas[i].pagadoEl && cuotas[i].id).map((i) => cuotas[i].id!));
  const huerfanos = Object.entries(c.deCuotas ?? {}).reduce((s, [id, x]) => (marcadas.has(id) ? s : s + (x.hoy ?? x.pesos)), 0);
  let suelta = redondear((c.sueltos ?? 0) + huerfanos);
  // 1) Las marcadas: su cobro propio y, lo que les faltó, de la plata suelta. Completa o no, en su moneda; lo que vale, en H.
  for (const i of deCobro) {
    const q = cuotas[i];
    if (!q.pagadoEl) continue;
    const propio = q.id ? c.deCuotas?.[q.id] : undefined;
    const enSuMoneda = enlazadoDe(q, propio, tc);
    let valeH = propio ? (propio.hoy ?? propio.pesos) : 0;
    const falta = Math.max(0, q.monto - enSuMoneda);
    if (enPesos[i] > 0 && falta > 0 && suelta > 0) {
      const aplicado = Math.min(redondear((falta * enPesos[i]) / q.monto), suelta);
      suelta = redondear(suelta - aplicado);
      valeH = redondear(valeH + aplicado);
    }
    // De vuelta a su moneda con el cambio de hoy, al centavo para abajo: pasado a pesos no supera lo que entró.
    cobrado[i] = !(enPesos[i] > 0) ? enSuMoneda : q.moneda === "ARS" ? valeH : alCentavoAbajo((q.monto * valeH) / enPesos[i]);
  }
  if (!(c.total > 0)) return { pendiente, cobrado };
  const pendientes = deCobro.filter((i) => !cuotas[i].pagadoEl && enPesos[i] > 0);
  // 2) Lo suelto que sobra, contra las pendientes más viejas: lo que les queda, en H.
  const bruto = new Map<number, number>();
  for (const i of pendientes) {
    const aplicado = Math.min(enPesos[i], Math.max(0, suelta));
    suelta = redondear(suelta - aplicado);
    bruto.set(i, redondear(enPesos[i] - aplicado));
    cobrado[i] = redondear((cuotas[i].monto * aplicado) / enPesos[i]);
  }
  // 3) Tope: lo que quedan esperando no pasa de lo que falta cobrar; lo que sobra se recorta de las más nuevas.
  let presupuesto = c.porCobrar;
  for (const i of pendientes) {
    const q = cuotas[i];
    const pendH = Math.max(0, Math.min(bruto.get(i)!, presupuesto));
    presupuesto = redondear(presupuesto - pendH);
    // Al centavo para abajo: en otra moneda, redondear para arriba pasaría el tope por el tipo de cambio.
    pendiente[i] = pendH >= enPesos[i] ? q.monto : alCentavoAbajo((q.monto * pendH) / enPesos[i]);
  }
  // 4) Las previstas, después de las reales: se muestran con lo que les queda del tope (así el cashflow no pasa del total).
  for (const i of vivas) {
    const q = cuotas[i];
    if (!esPrevista(q) || !(enPesos[i] > 0)) continue;
    const pendH = Math.max(0, Math.min(enPesos[i], presupuesto));
    presupuesto = redondear(presupuesto - pendH);
    pendiente[i] = pendH >= enPesos[i] ? q.monto : alCentavoAbajo((q.monto * pendH) / enPesos[i]);
  }
  return { pendiente, cobrado };
}

function alCentavoAbajo(x: number): number {
  return Math.floor(x * 100 + 1e-6) / 100;
}

/**
 * Lo que pagó el cliente por una cuota marcada, en SU moneda (la regla de arriba): sirve para saber si quedó completa,
 * no para lo que vale hoy (eso es `CobroDeCuota.hoy`). Sin enlace, nada. PURA.
 */
function enlazadoDe(q: CuotaLeida, propio: CobroDeCuota | undefined, tc: Readonly<Record<string, number>>): number {
  if (!propio) return 0;
  if (q.moneda === "ARS") return propio.pesos;
  if (propio.original?.moneda === q.moneda) return propio.original.monto;
  const cambio = tc[q.moneda] ?? 0;
  return cambio > 0 ? redondear(propio.pesos / cambio) : 0;
}

/** Lo que falta cobrar de cada cuota, en su moneda (ver `repartoDeCobros`). PURA. */
export function pendientesDeCobro(cuotas: readonly CuotaDeCobranza[], tc: Readonly<Record<string, number>>, c: Cobranza): number[] {
  return repartoDeCobros(cuotas, tc, c).pendiente;
}

/**
 * Cuánto se puede cargar a mano como cuota de cobro nueva, en pesos: lo que falta cobrar menos lo que las cuotas de cobro
 * pendientes ya esperan (nunca negativo: el reparto ya las topea). Sin presupuesto aprobado, sin tope (`Infinity`). PURA.
 */
export function lugarParaCobroManual(cuotas: readonly CuotaDeCobranza[], tc: Readonly<Record<string, number>>, c: Cobranza): { lugar: number; esperado: number } {
  if (!(c.total > 0)) return { lugar: Infinity, esperado: 0 };
  const pend = pendientesDeCobro(cuotas, tc, c);
  const esperado = redondear(cuotas.reduce((s, q, i) => (q.tipo === "COBRO" && !q.anuladoEl && !q.pagadoEl && !esPrevista(q) ? s + aPesos(pend[i], q.moneda, tc) : s), 0));
  return { lugar: Math.max(0, redondear(c.porCobrar - esperado)), esperado };
}

/**
 * Guardia común de todo cobro que entra (registrado a mano o «Marcar cobrado»): con presupuesto aprobado, no pasa de lo
 * que falta cobrar (un centavo de gracia por redondeo). PURA.
 */
export function pasaElTope(c: Cobranza, importe: number): boolean {
  return c.total > 0 && importe > c.porCobrar + 0.01;
}

/**
 * Lo que vale una cuota en el cashflow del evento, en su moneda: un pago a proveedor, su monto; un cobro, lo que ya entró
 * por ella más lo que le falta (pagada o no). Nunca su monto: así las líneas de cobro no pasan del total aprobado. PURA.
 */
export function montoEnCashflow(c: { tipo: string; monto: number; cobrado: number; pendiente: number }): number {
  return c.tipo === "COBRO" ? redondear(c.cobrado + c.pendiente) : c.monto;
}

/**
 * El resumen de cuotas de UN proyecto en línea con sus cobros registrados: cobrado y a cobrar salen de la cobranza; lo
 * vencido y lo de los próximos 7 días, del calendario de cuotas con lo que falta de cada una (`pendientesDeCobro`). Los
 * pagos a proveedores no se tocan. PURA.
 */
export function conciliarConCobros(cuotas: readonly CuotaDeCobranza[], tc: Readonly<Record<string, number>>, c: Cobranza, hoy: Date = new Date()): ResumenCuotas {
  const pend = pendientesDeCobro(cuotas, tc, c);
  // Sin presupuesto aprobado no hay nada «por cobrar» (porCobrar = 0): las cuotas de cobro todavía no son deuda y no
  // suman vencido ni próximos 7 días. Así I1 vale siempre, también sin aprobado. Las previstas, tampoco (como Administración).
  const ajustadas = cuotas.flatMap((q, i) =>
    q.tipo !== "COBRO" || q.anuladoEl || q.pagadoEl ? [q] : c.total > 0 && pend[i] > 0 && !esPrevista(q) ? [{ ...q, monto: pend[i] }] : [],
  );
  const r = resumenCuotas(ajustadas, tc, hoy);
  // Vencido + 7 días ≤ por cobrar sale del tope del reparto (Σ pendientes ≤ porCobrar): no hace falta recortar acá.
  return { ...r, cobrado: c.cobrado, aCobrar: c.porCobrar, cantCobrosVencidos: r.cobrosVencidos > 0 ? r.cantCobrosVencidos : 0 };
}

/**
 * `repartoDeCobros` de las cuotas del negocio entero, alineado con `cuotas`: cada proyecto con su cobranza. Las cuotas
 * de la empresa (o de un proyecto sin cobranza) valen lo que dicen: pendiente o cobrada, su monto. PURA.
 */
export function repartoDelNegocio(
  cuotas: readonly (CuotaDeCobranza & { proyectoId?: string | null })[],
  tc: Readonly<Record<string, number>>,
  cobranzas: ReadonlyMap<string, Cobranza>,
): RepartoDeCobros {
  const pendiente = cuotas.map((q) => (q.anuladoEl || q.pagadoEl ? 0 : q.monto));
  const cobrado = cuotas.map((q) => (!q.anuladoEl && q.pagadoEl ? q.monto : 0));
  const porProyecto = new Map<string, number[]>();
  cuotas.forEach((q, i) => {
    if (q.proyectoId && cobranzas.has(q.proyectoId)) porProyecto.set(q.proyectoId, [...(porProyecto.get(q.proyectoId) ?? []), i]);
  });
  for (const [id, idx] of porProyecto) {
    const r = repartoDeCobros(idx.map((i) => cuotas[i]), tc, cobranzas.get(id)!);
    idx.forEach((i, j) => {
      pendiente[i] = r.pendiente[j];
      cobrado[i] = r.cobrado[j];
    });
  }
  return { pendiente, cobrado };
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
